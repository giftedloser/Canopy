use crate::powershell::{executor, sanitizer};
use serde_json::Value;

#[tauri::command]
pub async fn test_connection(
    server_override: Option<String>,
) -> Result<String, String> {
    let safe_override = server_override
        .unwrap_or_default()
        .trim()
        .to_string();
    let safe_override = if safe_override.is_empty() {
        String::new()
    } else {
        sanitizer::sanitize_ps_string(&safe_override)?
    };

    let script = format!(
        r#"$ErrorActionPreference = 'Stop'

if (-not (Get-Command Get-ADDomain -ErrorAction SilentlyContinue)) {{
    throw "Active Directory PowerShell module is not available. Install RSAT ActiveDirectory tools."
}}

$serverOverride = '{server_override}'
if ([string]::IsNullOrWhiteSpace($serverOverride)) {{
    try {{
        $discovered = Get-ADDomainController -Discover -ErrorAction Stop
        $server = [string](@($discovered.HostName) | Select-Object -First 1)
        if ([string]::IsNullOrWhiteSpace($server)) {{
            $server = [string](@($discovered.Name) | Select-Object -First 1)
        }}
    }} catch {{
        # Fallback for environments where discovery can fail but LOGONSERVER is present.
        if (-not [string]::IsNullOrWhiteSpace($env:LOGONSERVER)) {{
            $server = $env:LOGONSERVER.TrimStart('\')
        }} else {{
            throw "Unable to discover a domain controller. Ensure this machine is domain-joined and connected to the domain."
        }}
    }}
}} else {{
    $server = $serverOverride
}}

try {{
    $domain = Get-ADDomain -Server $server -ErrorAction Stop
}} catch {{
    $msg = $_.Exception.Message
    throw ("Unable to query Active Directory using current Windows credentials. " + $msg)
}}

$connectedAs = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
@{{
    Name = $domain.Name
    Forest = $domain.Forest
    DNSRoot = $domain.DNSRoot
    InfrastructureMaster = $domain.InfrastructureMaster
    DomainController = $server
    ConnectedAs = $connectedAs
}} | ConvertTo-Json -Depth 3 -Compress"#,
        server_override = safe_override
    );

    let raw = executor::execute_ps_script(&script)?;
    let parsed = parse_connection_json(&raw)?;
    serde_json::to_string(&parsed)
        .map_err(|e| format!("Failed to serialize connection response: {}", e))
}

#[tauri::command]
pub async fn get_dashboard_stats(
    server: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$s = '{server}'
function Count-Safely([ScriptBlock] $op) {{
    try {{
        return & $op
    }} catch {{
        return 0
    }}
}}

$totalUsers = 0
$enabledUsers = 0
$disabledUsers = 0
$lockedUsers = 0
$expiringPasswords = 0
$inactiveUsers = 0
$neverLoggedIn = 0
$passwordNeverExpires = 0

try {{
    $expiringCutoff = (Get-Date).AddDays(14)
    $inactiveCutoff = (Get-Date).AddDays(-90)
    $users = @(Get-ADUser -Filter * -Server $s -Properties Enabled,LockedOut,LastLogonDate,PasswordNeverExpires,'msDS-UserPasswordExpiryTimeComputed')

    $totalUsers = $users.Count

    foreach ($user in $users) {{
        if ($user.Enabled) {{
            $enabledUsers++

            if ($user.PasswordNeverExpires) {{
                $passwordNeverExpires++
            }}

            if ($user.LastLogonDate) {{
                if ($user.LastLogonDate -lt $inactiveCutoff) {{
                    $inactiveUsers++
                }}
            }} else {{
                $neverLoggedIn++
            }}

            if (-not $user.PasswordNeverExpires) {{
                $expiryRaw = $user.'msDS-UserPasswordExpiryTimeComputed'
                if ($expiryRaw -gt 0) {{
                    try {{
                        $expiry = [datetime]::FromFileTime($expiryRaw)
                        if ($expiry -le $expiringCutoff) {{
                            $expiringPasswords++
                        }}
                    }} catch {{
                        # Ignore invalid expiry values
                    }}
                }}
            }}
        }} else {{
            $disabledUsers++
        }}

        if ($user.LockedOut) {{
            $lockedUsers++
        }}
    }}
}} catch {{
    $totalUsers = 0
    $enabledUsers = 0
    $disabledUsers = 0
    $lockedUsers = 0
    $expiringPasswords = 0
    $inactiveUsers = 0
    $neverLoggedIn = 0
    $passwordNeverExpires = 0
}}

$totalComputers = Count-Safely {{ @(Get-ADComputer -Filter * -Server $s).Count }}
$totalGroups = Count-Safely {{ @(Get-ADGroup -Filter * -Server $s).Count }}

@{{
    total_users = $totalUsers
    enabled_users = $enabledUsers
    disabled_users = $disabledUsers
    locked_users = $lockedUsers
    total_computers = $totalComputers
    total_groups = $totalGroups
    expiring_passwords = $expiringPasswords
    inactive_users = $inactiveUsers
    never_logged_in = $neverLoggedIn
    password_never_expires = $passwordNeverExpires
}} | ConvertTo-Json
"#,
        server = srv
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn get_computer_os_breakdown(
    server: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$s = '{server}'
$breakdown = @(Get-ADComputer -Filter * -Properties OperatingSystem -Server $s |
    Group-Object OperatingSystem |
    Sort-Object Count -Descending |
    Select-Object @{{N='os';E={{if($_.Name){{$_.Name}}else{{'Unknown'}}}}}}, Count)
if ($breakdown.Count -eq 0) {{ @() | ConvertTo-Json -Compress }} else {{ $breakdown | ConvertTo-Json -Compress }}
"#,
        server = srv
    );

    executor::execute_ps_script(&script)
}

fn parse_connection_json(raw: &str) -> Result<Value, String> {
    let cleaned = raw
        .replace('\u{0000}', "")
        .trim()
        .to_string();

    if cleaned.is_empty() || cleaned == "[]" {
        return Err("Connection command returned no data from Active Directory.".to_string());
    }

    let parsed = if let Ok(value) = serde_json::from_str::<Value>(&cleaned) {
        value
    } else if let Ok(inner) = serde_json::from_str::<String>(&cleaned) {
        serde_json::from_str::<Value>(inner.trim())
            .map_err(|e| format!("Connection response was not valid JSON: {}", e))?
    } else {
        let sample = if cleaned.len() > 220 {
            format!("{}...", &cleaned[..220])
        } else {
            cleaned
        };
        return Err(format!(
            "Connection response was not valid JSON. Raw output: {}",
            sample
        ));
    };

    match parsed {
        Value::Object(_) => Ok(parsed),
        Value::Array(mut arr) if arr.len() == 1 => {
            let first = arr.remove(0);
            if first.is_object() {
                Ok(first)
            } else {
                Err("Connection response JSON was not an object.".to_string())
            }
        }
        _ => Err("Connection response JSON was not an object.".to_string()),
    }
}
