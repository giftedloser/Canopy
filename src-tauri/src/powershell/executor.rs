use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

static SCRIPT_COUNTER: AtomicU64 = AtomicU64::new(0);
static READ_SESSION: OnceLock<Mutex<Option<ReadPowerShellSession>>> = OnceLock::new();
const SESSION_COMMAND_TIMEOUT: Duration = Duration::from_secs(600);
const SESSION_BOOT_TIMEOUT: Duration = Duration::from_secs(5);

/// Credentials for AD operations
#[derive(Clone, serde::Deserialize)]
pub struct AdCredentials {
    pub domain: String,
    pub username: String,
    pub password: String,
}

// Manual Debug impl so passwords are never printed in logs or panic output.
impl std::fmt::Debug for AdCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AdCredentials")
            .field("domain", &self.domain)
            .field("username", &self.username)
            .field("password", &"[REDACTED]")
            .finish()
    }
}

/// Build the PSCredential preamble that gets prepended to every AD script.
fn build_credential_block(creds: &AdCredentials) -> String {
    // Escape single quotes in all three fields to prevent PS string break-out.
    let escaped_password = creds.password.replace('\'', "''");
    let escaped_domain   = creds.domain.trim().replace('\'', "''");
    let escaped_username = creds.username.trim().replace('\'', "''");

    // If the original username already carries a domain prefix (DOMAIN\user),
    // use the escaped form as-is; otherwise prepend the escaped domain.
    let user = if creds.username.contains('\\') {
        escaped_username
    } else {
        format!("{}\\{}", escaped_domain, escaped_username)
    };

    format!(
        "$secpasswd = ConvertTo-SecureString '{}' -AsPlainText -Force\n\
         $cred = New-Object System.Management.Automation.PSCredential ('{}', $secpasswd)\n",
        escaped_password, user
    )
}

/// Execute a PowerShell script with AD credentials injected.
pub fn execute_ad_script(creds: &AdCredentials, script: &str) -> Result<String, String> {
    let full_script = format!(
        "{}\n{}",
        build_credential_block(creds),
        script
    );

    run_ps_via_file(&full_script)
}

/// Execute a simple PowerShell script without credentials.
pub fn execute_ps_script(script: &str) -> Result<String, String> {
    match run_ps_via_session(script) {
        Ok(output) => Ok(output),
        Err(SessionRunError::Script(err)) => Err(err),
        Err(SessionRunError::Infra(err)) => run_ps_via_file(script)
            .map_err(|fallback_err| format!("{} (session fallback failed: {})", err, fallback_err)),
    }
}

/// Write the script to a temp file and run it with PowerShell -File.
///
/// The previous approach piped the script via stdin with `-Command -`, but
/// Windows PowerShell 5.1 silently drops stdout for complex scripts when
/// reading from stdin, causing AD commands to return empty output.
fn run_ps_via_file(script: &str) -> Result<String, String> {
    // Ensure script exceptions always terminate PowerShell with a non-zero exit code.
    let wrapped_script = format!(
        r#"$ErrorActionPreference = 'Stop'
try {{
{script}
}} catch {{
    $errText = $_ | Out-String
    [Console]::Error.WriteLine($errText.Trim())
    exit 1
}}"#,
        script = script
    );

    // Write to a temp .ps1 file so PowerShell can execute via -File,
    // which reliably captures stdout (unlike -Command - via stdin).
    let script_path = write_temp_script(&wrapped_script)?;

    let mut cmd = Command::new("powershell");
    cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Hide the PowerShell console window on Windows.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output()
        .map_err(|e| {
            let _ = std::fs::remove_file(&script_path);
            format!("Failed to start PowerShell: {}", e)
        })?;

    // Clean up the temp file.
    let _ = std::fs::remove_file(&script_path);

    if output.status.success() {
        let stdout = decode_ps_output(&output.stdout);
        let stderr = decode_ps_output(&output.stderr);
        if stdout.trim().is_empty() && !stderr.trim().is_empty() {
            return Err(format!("PowerShell error: {}", stderr));
        }
        if stdout.trim().is_empty() {
            Ok("[]".to_string())
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = decode_ps_output(&output.stderr);
        // Also check stdout for errors (some PS errors go to stdout)
        if stderr.trim().is_empty() {
            let stdout = decode_ps_output(&output.stdout);
            if stdout.trim().is_empty() {
                Err("PowerShell command failed with no output".to_string())
            } else {
                Err(format!("PowerShell error: {}", stdout))
            }
        } else {
            Err(format!("PowerShell error: {}", stderr))
        }
    }
}

fn run_ps_via_session(script: &str) -> Result<String, SessionRunError> {
    let store = READ_SESSION.get_or_init(|| Mutex::new(None));
    let mut guard = store
        .lock()
        .map_err(|_| SessionRunError::Infra("PowerShell read session lock was poisoned".to_string()))?;

    if guard.is_none() {
        *guard = Some(ReadPowerShellSession::new()?);
    }

    let result = guard
        .as_mut()
        .expect("read session initialized")
        .run_script(script);

    if matches!(result, Err(SessionRunError::Infra(_))) {
        *guard = None;
    }

    result
}

fn write_temp_script(script: &str) -> Result<std::path::PathBuf, String> {
    let temp_dir = std::env::temp_dir();
    let seq = SCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed);
    let file_name = format!("fuzzydir_{}_{}.ps1", std::process::id(), seq);
    let script_path = temp_dir.join(&file_name);

    std::fs::write(&script_path, script)
        .map_err(|e| format!("Failed to write temp script: {}", e))?;

    Ok(script_path)
}

struct ReadPowerShellSession {
    child: Child,
    stdin: ChildStdin,
    events: Receiver<SessionEvent>,
}

enum SessionEvent {
    Stdout(String),
    Stderr(String),
    Closed,
}

enum SessionRunError {
    Infra(String),
    Script(String),
}

impl ReadPowerShellSession {
    fn new() -> Result<Self, SessionRunError> {
        let mut cmd = Command::new("powershell");
        cmd.args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-NoLogo",
                "-NoExit",
                "-Command",
                "-",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| SessionRunError::Infra(format!("Failed to start PowerShell read session: {}", e)))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| SessionRunError::Infra("PowerShell read session stdin was unavailable".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| SessionRunError::Infra("PowerShell read session stdout was unavailable".to_string()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| SessionRunError::Infra("PowerShell read session stderr was unavailable".to_string()))?;

        let (tx, rx) = mpsc::channel();
        spawn_reader(stdout, tx.clone(), false);
        spawn_reader(stderr, tx, true);

        let mut session = Self { child, stdin, events: rx };
        session.bootstrap()?;
        Ok(session)
    }

    fn bootstrap(&mut self) -> Result<(), SessionRunError> {
        let marker = format!("__FUZZY_PS_BOOT_{}__", SCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed));
        let bootstrap = [
            "$ProgressPreference = 'SilentlyContinue'",
            "$ErrorActionPreference = 'Continue'",
            "$enc = New-Object System.Text.UTF8Encoding($false)",
            "[Console]::InputEncoding = $enc",
            "[Console]::OutputEncoding = $enc",
            "$OutputEncoding = $enc",
            "Import-Module ActiveDirectory -ErrorAction SilentlyContinue | Out-Null",
            &format!("Write-Output '{}'", marker),
        ];

        self.write_lines(&bootstrap)?;
        self.wait_for_marker(&marker, SESSION_BOOT_TIMEOUT)
    }

    fn run_script(&mut self, script: &str) -> Result<String, SessionRunError> {
        let seq = SCRIPT_COUNTER.fetch_add(1, Ordering::Relaxed);
        let end_marker = format!("__FUZZY_PS_END_{}__", seq);
        let error_marker = format!("__FUZZY_PS_ERROR_{}__", seq);
        let wrapped_script = format!(
            r#"$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {{
{script}
}} catch {{
    $errText = ($_ | Out-String).Trim()
    $payload = @{{ message = $errText }} | ConvertTo-Json -Compress
    Write-Output ('{error_marker}' + $payload)
}}"#,
            script = script,
            error_marker = error_marker,
        );
        let script_path = write_temp_script(&wrapped_script)
            .map_err(SessionRunError::Infra)?;
        let escaped_path = script_path.to_string_lossy().replace('\'', "''");

        let result = (|| {
            self.write_lines(&[
                &format!("& '{}'", escaped_path),
                &format!("Write-Output '{}'", end_marker),
            ])?;

            let mut stdout_lines = Vec::new();
            let mut stderr_lines = Vec::new();
            let mut script_error = None;

            loop {
                match self.events.recv_timeout(SESSION_COMMAND_TIMEOUT) {
                    Ok(SessionEvent::Stdout(line)) => {
                        if line == end_marker {
                            break;
                        }
                        if let Some(payload) = line.strip_prefix(&error_marker) {
                            script_error = Some(parse_session_error(payload));
                            continue;
                        }
                        stdout_lines.push(line);
                    }
                    Ok(SessionEvent::Stderr(line)) => {
                        if !line.trim().is_empty() {
                            stderr_lines.push(line);
                        }
                    }
                    Ok(SessionEvent::Closed) => {
                        return Err(SessionRunError::Infra(
                            "PowerShell read session closed unexpectedly".to_string(),
                        ));
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        return Err(SessionRunError::Infra(
                            "PowerShell read session timed out waiting for output".to_string(),
                        ));
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        return Err(SessionRunError::Infra(
                            "PowerShell read session disconnected unexpectedly".to_string(),
                        ));
                    }
                }
            }

            if let Some(err) = script_error {
                return Err(SessionRunError::Script(format!("PowerShell error: {}", err)));
            }

            let stdout = stdout_lines.join("\n");
            let stderr = stderr_lines.join("\n");
            if stdout.trim().is_empty() && !stderr.trim().is_empty() {
                return Err(SessionRunError::Script(format!("PowerShell error: {}", stderr)));
            }
            if stdout.trim().is_empty() {
                Ok("[]".to_string())
            } else {
                Ok(stdout)
            }
        })();

        let _ = std::fs::remove_file(&script_path);
        result
    }

    fn write_lines(&mut self, lines: &[&str]) -> Result<(), SessionRunError> {
        for line in lines {
            writeln!(self.stdin, "{}", line).map_err(|e| {
                SessionRunError::Infra(format!("Failed to write to PowerShell read session: {}", e))
            })?;
        }
        self.stdin.flush().map_err(|e| {
            SessionRunError::Infra(format!("Failed to flush PowerShell read session: {}", e))
        })
    }

    fn wait_for_marker(&mut self, marker: &str, timeout: Duration) -> Result<(), SessionRunError> {
        loop {
            match self.events.recv_timeout(timeout) {
                Ok(SessionEvent::Stdout(line)) if line == marker => return Ok(()),
                Ok(SessionEvent::Stdout(_)) => {}
                Ok(SessionEvent::Stderr(line)) if !line.trim().is_empty() => {
                    return Err(SessionRunError::Infra(format!(
                        "PowerShell read session bootstrap error: {}",
                        line
                    )));
                }
                Ok(SessionEvent::Stderr(_)) => {}
                Ok(SessionEvent::Closed) => {
                    return Err(SessionRunError::Infra(
                        "PowerShell read session closed during bootstrap".to_string(),
                    ));
                }
                Err(RecvTimeoutError::Timeout) => {
                    return Err(SessionRunError::Infra(
                        "PowerShell read session bootstrap timed out".to_string(),
                    ));
                }
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(SessionRunError::Infra(
                        "PowerShell read session bootstrap disconnected".to_string(),
                    ));
                }
            }
        }
    }
}

impl Drop for ReadPowerShellSession {
    fn drop(&mut self) {
        let _ = writeln!(self.stdin, "exit");
        let _ = self.stdin.flush();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn spawn_reader<T>(stream: T, tx: Sender<SessionEvent>, stderr: bool)
where
    T: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let event = if stderr {
                        SessionEvent::Stderr(line)
                    } else {
                        SessionEvent::Stdout(line)
                    };
                    if tx.send(event).is_err() {
                        return;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = tx.send(SessionEvent::Closed);
    });
}

fn parse_session_error(payload: &str) -> String {
    serde_json::from_str::<serde_json::Value>(payload)
        .ok()
        .and_then(|value| value.get("message").and_then(|message| message.as_str()).map(str::to_string))
        .unwrap_or_else(|| payload.to_string())
}

fn decode_ps_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    // UTF-8 BOM
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).to_string();
    }

    // UTF-16 BOMs
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16_le(&bytes[2..]);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return decode_utf16_be(&bytes[2..]);
    }

    // Heuristic for UTF-16LE with no BOM (common with redirected PowerShell output).
    let odd_byte_count = bytes.len() / 2;
    if odd_byte_count > 0 {
        let odd_zeroes = bytes
            .iter()
            .skip(1)
            .step_by(2)
            .filter(|b| **b == 0)
            .count();
        if odd_zeroes * 100 / odd_byte_count >= 30 {
            return decode_utf16_le(bytes);
        }
    }

    String::from_utf8_lossy(bytes).to_string()
}

fn decode_utf16_le(bytes: &[u8]) -> String {
    let mut units = Vec::with_capacity((bytes.len() + 1) / 2);
    for chunk in bytes.chunks(2) {
        let lo = chunk[0];
        let hi = if chunk.len() > 1 { chunk[1] } else { 0 };
        units.push(u16::from_le_bytes([lo, hi]));
    }
    String::from_utf16_lossy(&units)
}

fn decode_utf16_be(bytes: &[u8]) -> String {
    let mut units = Vec::with_capacity((bytes.len() + 1) / 2);
    for chunk in bytes.chunks(2) {
        let hi = chunk[0];
        let lo = if chunk.len() > 1 { chunk[1] } else { 0 };
        units.push(u16::from_be_bytes([hi, lo]));
    }
    String::from_utf16_lossy(&units)
}
