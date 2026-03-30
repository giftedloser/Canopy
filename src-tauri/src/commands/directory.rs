use crate::powershell::{executor, sanitizer};

#[tauri::command]
pub async fn get_ou_tree(
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
$ous = @(Get-ADOrganizationalUnit -Filter * -Server $s -Properties CanonicalName |
    Select-Object @{{N='dn';E={{$_.DistinguishedName}}}}, @{{N='name';E={{$_.Name}}}}, @{{N='canonical';E={{$_.CanonicalName}}}})
if ($ous.Count -eq 0) {{ @() | ConvertTo-Json -Compress }} else {{ $ous | ConvertTo-Json -Depth 3 -Compress }}
"#,
        server = srv
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn get_ou_contents(
    server: String,
    ou_dn: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let dn = sanitizer::sanitize_dn(&ou_dn)?;

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$s = '{server}'
$base = '{dn}'

$users = @(Get-ADUser -SearchBase $base -SearchScope OneLevel -Filter * -Server $s -Properties DisplayName, Enabled |
    Select-Object @{{N='name';E={{if($_.DisplayName){{$_.DisplayName}}else{{$_.SamAccountName}}}}}}, @{{N='sam';E={{$_.SamAccountName}}}}, @{{N='type';E={{'user'}}}}, @{{N='enabled';E={{$_.Enabled}}}})

$computers = @(Get-ADComputer -SearchBase $base -SearchScope OneLevel -Filter * -Server $s -Properties Enabled |
    Select-Object @{{N='name';E={{$_.Name}}}}, @{{N='sam';E={{$_.SamAccountName}}}}, @{{N='type';E={{'computer'}}}}, @{{N='enabled';E={{$_.Enabled}}}})

$groups = @(Get-ADGroup -SearchBase $base -SearchScope OneLevel -Filter * -Server $s |
    Select-Object @{{N='name';E={{$_.Name}}}}, @{{N='sam';E={{$_.SamAccountName}}}}, @{{N='type';E={{'group'}}}}, @{{N='enabled';E={{$true}}}})

$all = @($users) + @($computers) + @($groups) | Sort-Object name
if ($all.Count -eq 0) {{ @() | ConvertTo-Json -Compress }} else {{ $all | ConvertTo-Json -Depth 3 -Compress }}
"#,
        server = srv,
        dn = dn
    );

    executor::execute_ps_script(&script)
}
