#[cfg(windows)]
use std::env;

#[cfg(windows)]
use tauri::AppHandle;
#[cfg(windows)]
use winreg::enums::RegType::REG_BINARY;
#[cfg(windows)]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
#[cfg(windows)]
use winreg::{RegKey, RegValue};

#[cfg(windows)]
const RUN_REGKEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(windows)]
const STARTUP_APPROVED_REGKEY: &str =
    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
#[cfg(windows)]
const STARTUP_APPROVED_ENABLED_VALUE: [u8; 12] = [
    0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

#[cfg(windows)]
fn app_name(app: &AppHandle) -> String {
    app.config()
        .product_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Canopy".to_string())
}

#[cfg(windows)]
fn quoted_executable_command() -> Result<String, String> {
    let exe = env::current_exe().map_err(|e| format!("Failed to resolve executable path: {e}"))?;
    let exe_str = exe
        .to_str()
        .ok_or_else(|| "Executable path contains unsupported characters".to_string())?;
    Ok(format!("\"{}\"", exe_str.replace('"', "")))
}

#[cfg(windows)]
fn task_manager_enabled(hkcu: &RegKey, value_name: &str) -> Option<bool> {
    let raw = hkcu
        .open_subkey_with_flags(STARTUP_APPROVED_REGKEY, KEY_READ)
        .ok()?
        .get_raw_value(value_name)
        .ok()?;

    if raw.bytes.len() < 8 {
        return None;
    }

    Some(raw.bytes.iter().rev().take(8).all(|value| *value == 0))
}

#[tauri::command]
pub fn is_launch_at_startup_enabled(
    #[cfg(windows)] app: AppHandle,
) -> Result<bool, String> {
    #[cfg(not(windows))]
    {
        Ok(false)
    }

    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let name = app_name(&app);
        let run_value = hkcu
            .open_subkey_with_flags(RUN_REGKEY, KEY_READ)
            .map_err(|e| format!("Failed to open startup registry key: {e}"))?
            .get_value::<String, _>(&name)
            .ok();

        let Some(value) = run_value else {
            return Ok(false);
        };

        let expected = quoted_executable_command()?;
        if value.trim() != expected {
            return Ok(false);
        }

        Ok(task_manager_enabled(&hkcu, &name).unwrap_or(true))
    }
}

#[tauri::command]
pub fn enable_launch_at_startup(
    #[cfg(windows)] app: AppHandle,
) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        Ok(())
    }

    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let name = app_name(&app);
        let command = quoted_executable_command()?;

        hkcu.open_subkey_with_flags(RUN_REGKEY, KEY_SET_VALUE)
            .map_err(|e| format!("Failed to open startup registry key: {e}"))?
            .set_value(&name, &command)
            .map_err(|e| format!("Failed to register startup entry: {e}"))?;

        if let Ok(reg) = hkcu.open_subkey_with_flags(STARTUP_APPROVED_REGKEY, KEY_SET_VALUE) {
            let _ = reg.set_raw_value(
                &name,
                &RegValue {
                    vtype: REG_BINARY,
                    bytes: STARTUP_APPROVED_ENABLED_VALUE.to_vec(),
                },
            );
        }

        Ok(())
    }
}

#[tauri::command]
pub fn disable_launch_at_startup(
    #[cfg(windows)] app: AppHandle,
) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        Ok(())
    }

    #[cfg(windows)]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let name = app_name(&app);

        let run_key = hkcu
            .open_subkey_with_flags(RUN_REGKEY, KEY_SET_VALUE)
            .map_err(|e| format!("Failed to open startup registry key: {e}"))?;

        match run_key.delete_value(&name) {
            Ok(_) => Ok(()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(format!("Failed to remove startup entry: {err}")),
        }
    }
}
