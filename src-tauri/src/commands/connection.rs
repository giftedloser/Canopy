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
    ou_scopes: Option<Vec<String>>,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let has_ou_scopes = matches!(ou_scopes.as_ref(), Some(scopes) if !scopes.is_empty());
    let scope_helpers = if let Some(ref scopes) = ou_scopes {
        if !scopes.is_empty() {
            let mut ou_parts = Vec::new();
            for scope in scopes {
                let safe = sanitizer::sanitize_dn(scope)?;
                ou_parts.push(format!("'{}'", safe));
            }

            format!(
                r#"
function Get-ScopedUsers {{
    $scoped = @()
    foreach ($base in @({ous})) {{
        $scoped += Get-ADUser -Filter * -Server $s -SearchBase $base -SearchScope Subtree -Properties Enabled,LockedOut,LastLogonDate,PasswordNeverExpires,'msDS-UserPasswordExpiryTimeComputed'
    }}
    return @($scoped | Sort-Object DistinguishedName -Unique)
}}

function Get-ScopedComputers {{
    $scoped = @()
    foreach ($base in @({ous})) {{
        $scoped += Get-ADComputer -Filter * -Server $s -SearchBase $base -SearchScope Subtree -Properties DistinguishedName
    }}
    return @($scoped | Sort-Object DistinguishedName -Unique)
}}

function Get-ScopedGroups {{
    $scoped = @()
    foreach ($base in @({ous})) {{
        $scoped += Get-ADGroup -Filter * -Server $s -SearchBase $base -SearchScope Subtree -Properties DistinguishedName
    }}
    return @($scoped | Sort-Object DistinguishedName -Unique)
}}
"#,
                ous = ou_parts.join(",")
            )
        } else {
            String::new()
        }
    } else {
        String::new()
    };
    let users_expr = if has_ou_scopes {
        "Get-ScopedUsers".to_string()
    } else {
        "Get-ADUser -Filter * -Server $s -Properties Enabled,LockedOut,LastLogonDate,PasswordNeverExpires,'msDS-UserPasswordExpiryTimeComputed'".to_string()
    };
    let computers_expr = if has_ou_scopes {
        "@(Get-ScopedComputers).Count".to_string()
    } else {
        "@(Get-ADComputer -Filter * -Server $s).Count".to_string()
    };
    let groups_expr = if has_ou_scopes {
        "@(Get-ScopedGroups).Count".to_string()
    } else {
        "@(Get-ADGroup -Filter * -Server $s).Count".to_string()
    };

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
{scope_helpers}

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
    $users = @({users_expr})

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

$totalComputers = Count-Safely {{ {computers_expr} }}
$totalGroups = Count-Safely {{ {groups_expr} }}

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
        server = srv,
        scope_helpers = scope_helpers,
        users_expr = users_expr,
        computers_expr = computers_expr,
        groups_expr = groups_expr,
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn get_computer_os_breakdown(
    server: String,
    ou_scopes: Option<Vec<String>>,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let has_ou_scopes = matches!(ou_scopes.as_ref(), Some(scopes) if !scopes.is_empty());
    let scope_helpers = if let Some(ref scopes) = ou_scopes {
        if !scopes.is_empty() {
            let mut ou_parts = Vec::new();
            for scope in scopes {
                let safe = sanitizer::sanitize_dn(scope)?;
                ou_parts.push(format!("'{}'", safe));
            }

            format!(
                r#"
function Get-ScopedComputersForBreakdown {{
    $scoped = @()
    foreach ($base in @({ous})) {{
        $scoped += Get-ADComputer -Filter * -Properties OperatingSystem,DistinguishedName -Server $s -SearchBase $base -SearchScope Subtree
    }}
    return @($scoped | Sort-Object DistinguishedName -Unique)
}}
"#,
                ous = ou_parts.join(",")
            )
        } else {
            String::new()
        }
    } else {
        String::new()
    };
    let computers_expr = if has_ou_scopes {
        "Get-ScopedComputersForBreakdown".to_string()
    } else {
        "Get-ADComputer -Filter * -Properties OperatingSystem -Server $s".to_string()
    };

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$s = '{server}'
{scope_helpers}
$breakdown = @(@({computers_expr}) |
    Group-Object OperatingSystem |
    Sort-Object Count -Descending |
    Select-Object @{{N='os';E={{if($_.Name){{$_.Name}}else{{'Unknown'}}}}}}, Count)
if ($breakdown.Count -eq 0) {{ @() | ConvertTo-Json -Compress }} else {{ $breakdown | ConvertTo-Json -Compress }}
"#,
        server = srv,
        scope_helpers = scope_helpers,
        computers_expr = computers_expr,
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
