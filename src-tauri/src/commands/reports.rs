use crate::powershell::{executor, sanitizer};

const USER_REPORT_PROPS: &str = "DisplayName,EmailAddress,LastLogonDate,WhenChanged,PasswordLastSet,PasswordNeverExpires,'msDS-UserPasswordExpiryTimeComputed',WhenCreated,Department,Enabled,LockedOut,DistinguishedName";
const COMPUTER_REPORT_PROPS: &str = "OperatingSystem,DistinguishedName";

#[tauri::command]
pub async fn run_report(
    server: String,
    report_type: String,
    ou_scopes: Option<Vec<String>>,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let (has_ou_scopes, helper_script) = build_report_helpers(&ou_scopes)?;
    let users_expr = if has_ou_scopes {
        "Get-ScopedReportUsers".to_string()
    } else {
        format!(
            "Get-ADUser -Filter * -Server $s -Properties {}",
            USER_REPORT_PROPS
        )
    };
    let computers_expr = if has_ou_scopes {
        "Get-ScopedReportComputers".to_string()
    } else {
        format!(
            "Get-ADComputer -Filter * -Server $s -Properties {}",
            COMPUTER_REPORT_PROPS
        )
    };
    let empty_groups_expr = if has_ou_scopes {
        "Get-ScopedReportGroups -IncludeMembers $true".to_string()
    } else {
        "Get-ADGroup -LDAPFilter '(!(member=*))' -Server $s -Properties Description".to_string()
    };
    let large_groups_expr = if has_ou_scopes {
        "Get-ScopedReportGroups -UseLargeMemberRange $true".to_string()
    } else {
        "Get-ADGroup -Filter * -Server $s -Properties Description,'member;range=0-49'".to_string()
    };

    let script = match report_type.as_str() {
        "locked_accounts" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @(@({users_expr}) |
    Where-Object {{ $_.LockedOut }} |
    Select-Object Name,SamAccountName,DisplayName,EmailAddress,LastLogonDate,DistinguishedName |
    Sort-Object Name)
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "disabled_accounts" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @(@({users_expr}) |
    Where-Object {{ -not $_.Enabled }} |
    Select-Object Name,SamAccountName,DisplayName,EmailAddress,WhenChanged,DistinguishedName |
    Sort-Object Name)
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "inactive_users" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$cutoff = (Get-Date).AddDays(-90)
$results = @(@({users_expr}) |
    Where-Object {{ $_.Enabled -and $_.LastLogonDate -and ([datetime]$_.LastLogonDate) -lt $cutoff }} |
    Select-Object Name,SamAccountName,DisplayName,EmailAddress,LastLogonDate,DistinguishedName |
    Sort-Object LastLogonDate, Name)
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "expiring_passwords" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$now = Get-Date
$cutoff = $now.AddDays(7)
$policy = $null
try {{
    $policy = Get-ADDefaultDomainPasswordPolicy -Server $s -ErrorAction Stop
}} catch {{
    $policy = $null
}}

$results = foreach ($user in @({users_expr})) {{
    if (-not $user.Enabled -or $user.PasswordNeverExpires) {{
        continue
    }}

    $expiry = $null
    $expiryRaw = $user.'msDS-UserPasswordExpiryTimeComputed'
    if ($expiryRaw) {{
        try {{
            $expiryFileTime = [int64]$expiryRaw
            if ($expiryFileTime -gt 0) {{
                $expiry = [datetime]::FromFileTime($expiryFileTime)
            }}
        }} catch {{
            $expiry = $null
        }}
    }}

    if (-not $expiry -and $user.PasswordLastSet -and $policy -and $policy.MaxPasswordAge) {{
        try {{
            $expiry = ([datetime]$user.PasswordLastSet).Add($policy.MaxPasswordAge)
        }} catch {{
            $expiry = $null
        }}
    }}

    if ($expiry -and $expiry -ge $now -and $expiry -le $cutoff) {{
        [PSCustomObject]@{{
            Name = $user.Name
            SamAccountName = $user.SamAccountName
            DisplayName = $user.DisplayName
            EmailAddress = $user.EmailAddress
            PasswordLastSet = $user.PasswordLastSet
            ExpiryDate = $expiry
            DistinguishedName = $user.DistinguishedName
        }}
    }}
}}

$results = @($results | Sort-Object ExpiryDate, Name)
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "never_logged_in" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @(@({users_expr}) |
    Where-Object {{ $_.Enabled -and -not $_.LastLogonDate }} |
    Select-Object Name,SamAccountName,DisplayName,EmailAddress,WhenCreated,DistinguishedName |
    Sort-Object Name)
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "no_email" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @(@({users_expr}) |
    Where-Object {{ $_.Enabled -and [string]::IsNullOrWhiteSpace([string]$_.EmailAddress) }} |
    Select-Object Name,SamAccountName,DisplayName,Department,DistinguishedName |
    Sort-Object Name)
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "computer_os_breakdown" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @(@({computers_expr}) |
    Group-Object OperatingSystem |
    Sort-Object Count -Descending |
    Select-Object @{{Name='os';Expression={{ if ([string]::IsNullOrWhiteSpace([string]$_.Name)) {{ 'Unknown' }} else {{ [string]$_.Name }} }}}}, Count)
Write-JsonArray @($results) 3"#,
            s = srv,
            helpers = helper_script,
            computers_expr = computers_expr,
        ),

        "empty_groups" => {
            let empty_groups_script = if has_ou_scopes {
                r#"$results = @(@(Get-ScopedReportGroups -IncludeMembers $true) |
    Where-Object { @($_.Members).Count -eq 0 } |
    Select-Object Name,SamAccountName,GroupCategory,GroupScope,Description,DistinguishedName |
    Sort-Object Name)"#
                    .to_string()
            } else {
                format!(
                    r#"$results = @(@({groups_expr}) |
    Select-Object Name,SamAccountName,GroupCategory,GroupScope,Description,DistinguishedName |
    Sort-Object Name)"#,
                    groups_expr = empty_groups_expr,
                )
            };

            format!(
                r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
{empty_groups_script}
Write-JsonArray @($results) 4"#,
                s = srv,
                helpers = helper_script,
                empty_groups_script = empty_groups_script,
            )
        }

        "large_groups" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
function Get-ExactLargeGroupMemberCount([string] $identity, [int] $initialCount) {{
    $memberCount = $initialCount
    if ($memberCount -lt 50) {{
        return $memberCount
    }}

    $nextStart = $initialCount
    while ($true) {{
        $rangeAttr = "member;range=$nextStart-$($nextStart + 1499)"
        $rangeGroup = Get-ADGroup -Identity $identity -Server $s -Properties $rangeAttr
        $nextProp = $rangeGroup.PSObject.Properties | Where-Object {{ $_.Name -like 'member;range=*' }} | Select-Object -First 1
        if (-not $nextProp) {{
            break
        }}

        $nextMembers = @($nextProp.Value)
        $memberCount += $nextMembers.Count

        if ($nextProp.Name -match '^member;range=\d+-\*$' -or $nextMembers.Count -eq 0) {{
            break
        }}

        $nextStart += $nextMembers.Count
    }}

    return $memberCount
}}

$results = foreach ($group in @({groups_expr})) {{
    $memberProp = $group.PSObject.Properties | Where-Object {{ $_.Name -like 'member;range=*' }} | Select-Object -First 1
    if (-not $memberProp) {{
        continue
    }}

    $members = @($memberProp.Value)
    if ($members.Count -lt 50) {{
        continue
    }}

    $memberCount = Get-ExactLargeGroupMemberCount $group.DistinguishedName $members.Count
    if ($memberCount -lt 50) {{
        continue
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

$results = @($results | Sort-Object -Property @(
    @{{ Expression = {{ [int]$_.MemberCount }}; Descending = $true }},
    @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
))
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            groups_expr = large_groups_expr,
        ),

        "password_never_expires" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @(@({users_expr}) |
    Where-Object {{ $_.Enabled -and $_.PasswordNeverExpires }} |
    Select-Object Name,SamAccountName,DisplayName,EmailAddress,PasswordLastSet,DistinguishedName |
    Sort-Object Name)
Write-JsonArray @($results) 4"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        _ => return Err(format!("Unknown report type: {}", report_type)),
    };

    executor::execute_ps_script(&script)
}

fn build_report_helpers(ou_scopes: &Option<Vec<String>>) -> Result<(bool, String), String> {
    let mut helpers = String::from(
        r#"
function Write-JsonArray([object[]] $Items, [int] $Depth = 4) {
    if (-not $Items -or $Items.Count -eq 0) {
        @() | ConvertTo-Json -Compress
        return
    }

    $Items | ConvertTo-Json -Depth $Depth -Compress
}
"#,
    );

    if let Some(scopes) = ou_scopes {
        if !scopes.is_empty() {
            let mut ou_parts = Vec::new();
            for scope in scopes {
                let safe = sanitizer::sanitize_dn(scope)?;
                ou_parts.push(format!("'{}'", safe));
            }

            helpers.push_str(&format!(
                r#"
function Get-ScopedReportUsers {{
    $results = @()
    foreach ($base in @({ous})) {{
        $results += Get-ADUser -Filter * -Server $s -SearchBase $base -SearchScope Subtree -Properties {user_props}
    }}
    return @($results | Sort-Object DistinguishedName -Unique)
}}

function Get-ScopedReportComputers {{
    $results = @()
    foreach ($base in @({ous})) {{
        $results += Get-ADComputer -Filter * -Server $s -SearchBase $base -SearchScope Subtree -Properties {computer_props}
    }}
    return @($results | Sort-Object DistinguishedName -Unique)
}}

function Get-ScopedReportGroups {{
    param([bool] $IncludeMembers = $false, [bool] $UseLargeMemberRange = $false)

    $props = if ($UseLargeMemberRange) {{
        @('Description','member;range=0-49')
    }} elseif ($IncludeMembers) {{
        @('Description','Members')
    }} else {{
        @('Description')
    }}

    $results = @()
    foreach ($base in @({ous})) {{
        $results += Get-ADGroup -Filter * -Server $s -SearchBase $base -SearchScope Subtree -Properties $props
    }}
    return @($results | Sort-Object DistinguishedName -Unique)
}}
"#,
                ous = ou_parts.join(","),
                user_props = USER_REPORT_PROPS,
                computer_props = COMPUTER_REPORT_PROPS,
            ));

            return Ok((true, helpers));
        }
    }

    Ok((false, helpers))
}
