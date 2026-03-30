use crate::powershell::{executor, sanitizer};

#[tauri::command]
pub async fn run_report(
    server: String,
    report_type: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;

    let script = match report_type.as_str() {
        "locked_accounts" => format!(
            r#"Get-ADUser -Filter {{LockedOut -eq $true}} -Server '{s}' -Properties DisplayName,EmailAddress,LastLogonDate,DistinguishedName |
Select-Object Name,SamAccountName,DisplayName,EmailAddress,LastLogonDate,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "disabled_accounts" => format!(
            r#"Get-ADUser -Filter {{Enabled -eq $false}} -Server '{s}' -Properties DisplayName,EmailAddress,WhenChanged,DistinguishedName |
Select-Object Name,SamAccountName,DisplayName,EmailAddress,WhenChanged,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "inactive_users" => format!(
            r#"$cutoff = (Get-Date).AddDays(-90)
Get-ADUser -Filter {{LastLogonDate -lt $cutoff -and Enabled -eq $true}} -Server '{s}' -Properties DisplayName,EmailAddress,LastLogonDate,DistinguishedName |
Select-Object Name,SamAccountName,DisplayName,EmailAddress,LastLogonDate,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "expiring_passwords" => format!(
            r#"$policy = Get-ADDefaultDomainPasswordPolicy -Server '{s}'
$maxAge = $policy.MaxPasswordAge.Days
$warnDate = (Get-Date).AddDays($maxAge * -1 + 7)
Get-ADUser -Filter {{PasswordLastSet -lt $warnDate -and Enabled -eq $true -and PasswordNeverExpires -eq $false}} -Server '{s}' -Properties DisplayName,EmailAddress,PasswordLastSet,DistinguishedName |
Select-Object Name,SamAccountName,DisplayName,EmailAddress,PasswordLastSet,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "never_logged_in" => format!(
            r#"Get-ADUser -Filter {{LastLogonDate -notlike '*' -and Enabled -eq $true}} -Server '{s}' -Properties DisplayName,EmailAddress,WhenCreated,DistinguishedName |
Select-Object Name,SamAccountName,DisplayName,EmailAddress,WhenCreated,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "no_email" => format!(
            r#"Get-ADUser -Filter {{EmailAddress -notlike '*' -and Enabled -eq $true}} -Server '{s}' -Properties DisplayName,Department,DistinguishedName |
Select-Object Name,SamAccountName,DisplayName,Department,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "computer_os_breakdown" => format!(
            r#"Get-ADComputer -Filter * -Server '{s}' -Properties OperatingSystem |
Group-Object OperatingSystem |
Select-Object @{{Name='os';Expression={{$_.Name}}}}, Count |
Sort-Object Count -Descending |
ConvertTo-Json -Depth 2"#,
            s = srv
        ),

        "empty_groups" => format!(
            r#"Get-ADGroup -LDAPFilter '(!(member=*))' -Server '{s}' -Properties Description |
Select-Object Name,SamAccountName,GroupCategory,GroupScope,Description,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "large_groups" => format!(
            r#"$groups = @(Get-ADGroup -Filter * -Server '{s}' -Properties Description,'member;range=0-49')
$results = foreach ($group in $groups) {{
    $memberProp = $group.PSObject.Properties | Where-Object {{ $_.Name -like 'member;range=*' }} | Select-Object -First 1
    if (-not $memberProp) {{ continue }}

    $members = @($memberProp.Value)
    if ($members.Count -lt 50) {{ continue }}

    $memberCount = $members.Count
    if ($memberProp.Name -notmatch '^member;range=\d+-\*$') {{
        $nextStart = $members.Count
        while ($true) {{
            $rangeAttr = "member;range=$nextStart-$($nextStart + 1499)"
            $rangeGroup = Get-ADGroup -Identity $group.DistinguishedName -Server '{s}' -Properties $rangeAttr
            $nextProp = $rangeGroup.PSObject.Properties | Where-Object {{ $_.Name -like 'member;range=*' }} | Select-Object -First 1
            if (-not $nextProp) {{ break }}

            $nextMembers = @($nextProp.Value)
            $memberCount += $nextMembers.Count

            if ($nextProp.Name -match '^member;range=\d+-\*$' -or $nextMembers.Count -eq 0) {{
                break
            }}

            $nextStart += $nextMembers.Count
        }}
    }}

    [PSCustomObject]@{{
        Name = $group.Name
        SamAccountName = $group.SamAccountName
        GroupCategory = $group.GroupCategory
        GroupScope = $group.GroupScope
        Description = $group.Description
        MemberCount = $memberCount
        DistinguishedName = $group.DistinguishedName
    }}
}}

$results |
Sort-Object MemberCount -Descending |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        "password_never_expires" => format!(
            r#"Get-ADUser -Filter {{PasswordNeverExpires -eq $true -and Enabled -eq $true}} -Server '{s}' -Properties DisplayName,EmailAddress,PasswordLastSet,DistinguishedName |
Select-Object Name,SamAccountName,DisplayName,EmailAddress,PasswordLastSet,DistinguishedName |
ConvertTo-Json -Depth 3"#,
            s = srv
        ),

        _ => return Err(format!("Unknown report type: {}", report_type)),
    };

    executor::execute_ps_script(&script)
}
