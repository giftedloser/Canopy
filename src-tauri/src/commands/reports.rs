use crate::powershell::{executor, sanitizer};

const USER_REPORT_PROPS: &str = "DisplayName,EmailAddress,LastLogonDate,WhenChanged,PasswordLastSet,PasswordNeverExpires,'msDS-UserPasswordExpiryTimeComputed',WhenCreated,Department,Enabled,LockedOut,Description,DistinguishedName,ServicePrincipalName,'msDS-SupportedEncryptionTypes',TrustedForDelegation,TrustedToAuthForDelegation,'msDS-AllowedToDelegateTo',SIDHistory,adminCount";
const COMPUTER_REPORT_PROPS: &str = "OperatingSystem,OperatingSystemVersion,DistinguishedName,LastLogonDate,Enabled,TrustedForDelegation,TrustedToAuthForDelegation,'msDS-AllowedToDelegateTo',ServicePrincipalName,SIDHistory,adminCount";

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
        "Get-ScopedReportGroups -AdditionalProperties @('GroupCategory','GroupScope')".to_string()
    } else {
        "Get-ADGroup -Filter * -Server $s -Properties Description,GroupCategory,GroupScope".to_string()
    };
    let sid_groups_expr = if has_ou_scopes {
        "Get-ScopedReportGroups -AdditionalProperties @('SIDHistory','GroupCategory','GroupScope')"
            .to_string()
    } else {
        "Get-ADGroup -Filter * -Server $s -Properties SIDHistory,GroupCategory,GroupScope".to_string()
    };
    let admin_groups_expr = if has_ou_scopes {
        "Get-ScopedReportGroups -AdditionalProperties @('adminCount','GroupCategory','GroupScope')"
            .to_string()
    } else {
        "Get-ADGroup -Filter * -Server $s -Properties adminCount,GroupCategory,GroupScope"
            .to_string()
    };
    let nested_groups_expr = if has_ou_scopes {
        "Get-ScopedReportGroups -IncludeMembers $true -AdditionalProperties @('GroupCategory','GroupScope')"
            .to_string()
    } else {
        "Get-ADGroup -Filter * -Server $s -Properties Members,GroupCategory,GroupScope".to_string()
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
    $rangeGroup = $null
    try {{
        $rangeGroup = Get-ADGroup -Identity $group.DistinguishedName -Server $s -Properties 'member;range=0-49' -ErrorAction Stop
    }} catch {{
        continue
    }}

    $memberProp = $rangeGroup.PSObject.Properties | Where-Object {{ $_.Name -like 'member;range=*' }} | Select-Object -First 1
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

        "privileged_accounts" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$privilegedMembership = Get-PrivilegedMembershipMap
$results = foreach ($user in @({users_expr})) {{
    $dn = [string]$user.DistinguishedName
    if (-not $user.Enabled -or [string]::IsNullOrWhiteSpace($dn) -or -not $privilegedMembership.ContainsKey($dn)) {{
        continue
    }}

    [PSCustomObject]@{{
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        DisplayName = $user.DisplayName
        Enabled = [bool]$user.Enabled
        LastLogonDate = $user.LastLogonDate
        PrivilegedGroups = Join-Values $privilegedMembership[$dn]
        DistinguishedName = $user.DistinguishedName
    }}
}}

$results = @($results | Sort-Object Name)
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "stale_privileged_accounts" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$cutoff = (Get-Date).AddDays(-90)
$privilegedMembership = Get-PrivilegedMembershipMap
$results = foreach ($user in @({users_expr})) {{
    $dn = [string]$user.DistinguishedName
    if (-not $user.Enabled -or [string]::IsNullOrWhiteSpace($dn) -or -not $privilegedMembership.ContainsKey($dn)) {{
        continue
    }}

    $lastLogon = $null
    if ($user.LastLogonDate) {{
        try {{
            $lastLogon = [datetime]$user.LastLogonDate
        }} catch {{
            $lastLogon = $null
        }}
    }}

    if ($lastLogon -and $lastLogon -ge $cutoff) {{
        continue
    }}

    [PSCustomObject]@{{
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        DisplayName = $user.DisplayName
        Enabled = [bool]$user.Enabled
        LastLogonDate = $user.LastLogonDate
        StaleReason = if ($lastLogon) {{ 'No logon in 90+ days' }} else {{ 'Never logged on' }}
        PrivilegedGroups = Join-Values $privilegedMembership[$dn]
        DistinguishedName = $user.DistinguishedName
    }}
}}

$results = @($results | Sort-Object LastLogonDate, Name)
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "service_accounts" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$pattern = '(?i)(^svc[-_.]|[-_.]svc$|service|sql|app|task|batch|job|runas)'
$results = foreach ($user in @({users_expr})) {{
    $spns = @($user.ServicePrincipalName)
    $reasons = @()
    if ($spns.Count -gt 0) {{
        $reasons += 'SPN'
    }}

    $text = @($user.SamAccountName, $user.Name, $user.DisplayName, $user.Description) -join ' '
    if ($text -match $pattern) {{
        $reasons += 'Naming Pattern'
    }}

    if ($reasons.Count -eq 0) {{
        continue
    }}

    if ($user.PasswordNeverExpires) {{
        $reasons += 'Password Never Expires'
    }}

    $passwordAgeDays = $null
    if ($user.PasswordLastSet) {{
        try {{
            $passwordAgeDays = [int]((Get-Date) - ([datetime]$user.PasswordLastSet)).TotalDays
        }} catch {{
            $passwordAgeDays = $null
        }}
    }}

    [PSCustomObject]@{{
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        DisplayName = $user.DisplayName
        Enabled = [bool]$user.Enabled
        LastLogonDate = $user.LastLogonDate
        PasswordLastSet = $user.PasswordLastSet
        PasswordAgeDays = $passwordAgeDays
        SupportedEncryption = Convert-EncryptionTypes $user.'msDS-SupportedEncryptionTypes'
        SpnCount = $spns.Count
        DetectionReasons = Join-Values $reasons
        Spns = Join-Values $spns
        DistinguishedName = $user.DistinguishedName
    }}
}}

$results = @($results | Sort-Object Name)
Write-JsonArray @($results) 6"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "delegation_enabled" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @()

foreach ($user in @({users_expr})) {{
    $allowedTo = @($user.'msDS-AllowedToDelegateTo')
    if (-not $user.TrustedForDelegation -and -not $user.TrustedToAuthForDelegation -and $allowedTo.Count -eq 0) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'User'
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        DelegationType = if ($user.TrustedForDelegation) {{ 'Unconstrained' }} elseif ($allowedTo.Count -gt 0) {{ 'Constrained' }} else {{ 'Protocol Transition' }}
        ProtocolTransition = [bool]$user.TrustedToAuthForDelegation
        AllowedToDelegateTo = Join-Values $allowedTo
        DistinguishedName = $user.DistinguishedName
    }}
}}

foreach ($computer in @({computers_expr})) {{
    $allowedTo = @($computer.'msDS-AllowedToDelegateTo')
    if (-not $computer.TrustedForDelegation -and -not $computer.TrustedToAuthForDelegation -and $allowedTo.Count -eq 0) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'Computer'
        Name = $computer.Name
        SamAccountName = $computer.SamAccountName
        DelegationType = if ($computer.TrustedForDelegation) {{ 'Unconstrained' }} elseif ($allowedTo.Count -gt 0) {{ 'Constrained' }} else {{ 'Protocol Transition' }}
        ProtocolTransition = [bool]$computer.TrustedToAuthForDelegation
        AllowedToDelegateTo = Join-Values $allowedTo
        DistinguishedName = $computer.DistinguishedName
    }}
}}

$results = @($results | Sort-Object DelegationType, Name)
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
            computers_expr = computers_expr,
        ),

        "spn_accounts" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = foreach ($user in @({users_expr})) {{
    $spns = @($user.ServicePrincipalName)
    if ($spns.Count -eq 0) {{
        continue
    }}

    [PSCustomObject]@{{
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        DisplayName = $user.DisplayName
        Enabled = [bool]$user.Enabled
        LastLogonDate = $user.LastLogonDate
        PasswordLastSet = $user.PasswordLastSet
        SupportedEncryption = Convert-EncryptionTypes $user.'msDS-SupportedEncryptionTypes'
        SpnCount = $spns.Count
        Spns = Join-Values $spns
        DistinguishedName = $user.DistinguishedName
    }}
}}

$results = @($results | Sort-Object Name)
Write-JsonArray @($results) 6"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "sidhistory_present" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @()

foreach ($user in @({users_expr})) {{
    $sidHistory = @($user.SIDHistory)
    if ($sidHistory.Count -eq 0) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'User'
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        SidHistoryCount = $sidHistory.Count
        SidHistory = Join-Values $sidHistory
        DistinguishedName = $user.DistinguishedName
    }}
}}

foreach ($computer in @({computers_expr})) {{
    $sidHistory = @($computer.SIDHistory)
    if ($sidHistory.Count -eq 0) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'Computer'
        Name = $computer.Name
        SamAccountName = $computer.SamAccountName
        SidHistoryCount = $sidHistory.Count
        SidHistory = Join-Values $sidHistory
        DistinguishedName = $computer.DistinguishedName
    }}
}}

foreach ($group in @({groups_expr})) {{
    $sidHistory = @($group.SIDHistory)
    if ($sidHistory.Count -eq 0) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'Group'
        Name = $group.Name
        SamAccountName = $group.SamAccountName
        SidHistoryCount = $sidHistory.Count
        SidHistory = Join-Values $sidHistory
        DistinguishedName = $group.DistinguishedName
    }}
}}

$results = @($results | Sort-Object AccountType, Name)
Write-JsonArray @($results) 6"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
            computers_expr = computers_expr,
            groups_expr = sid_groups_expr,
        ),

        "disabled_accounts_in_groups" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = foreach ($user in @({users_expr}) | Where-Object {{ -not $_.Enabled }}) {{
    $groups = @()
    try {{
        $groups = @(Get-ADPrincipalGroupMembership -Identity $user.DistinguishedName -Server $s -ErrorAction Stop |
            Where-Object {{ $_.GroupCategory -eq 'Security' -and $_.Name -ne 'Domain Users' }} |
            Sort-Object Name)
    }} catch {{
        $groups = @()
    }}

    if ($groups.Count -eq 0) {{
        continue
    }}

    [PSCustomObject]@{{
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        DisplayName = $user.DisplayName
        SecurityGroupCount = $groups.Count
        SecurityGroups = Join-Values ($groups | Select-Object -ExpandProperty Name)
        DistinguishedName = $user.DistinguishedName
    }}
}}

$results = @($results | Sort-Object -Property @(
    @{{ Expression = {{ [int]$_.SecurityGroupCount }}; Descending = $true }},
    @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
))
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "admincount_accounts" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$results = @()

foreach ($user in @({users_expr})) {{
    if ($user.adminCount -ne 1) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'User'
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        Enabled = [bool]$user.Enabled
        DistinguishedName = $user.DistinguishedName
    }}
}}

foreach ($computer in @({computers_expr})) {{
    if ($computer.adminCount -ne 1) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'Computer'
        Name = $computer.Name
        SamAccountName = $computer.SamAccountName
        Enabled = [bool]$computer.Enabled
        DistinguishedName = $computer.DistinguishedName
    }}
}}

foreach ($group in @({groups_expr})) {{
    if ($group.adminCount -ne 1) {{
        continue
    }}

    $results += [PSCustomObject]@{{
        AccountType = 'Group'
        Name = $group.Name
        SamAccountName = $group.SamAccountName
        GroupCategory = $group.GroupCategory
        GroupScope = $group.GroupScope
        DistinguishedName = $group.DistinguishedName
    }}
}}

$results = @($results | Sort-Object AccountType, Name)
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
            computers_expr = computers_expr,
            groups_expr = admin_groups_expr,
        ),

        "old_password_active_users" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$recentLogonCutoff = (Get-Date).AddDays(-45)
$passwordCutoff = (Get-Date).AddDays(-180)
$results = foreach ($user in @({users_expr})) {{
    if (-not $user.Enabled -or -not $user.PasswordLastSet -or -not $user.LastLogonDate) {{
        continue
    }}

    $passwordLastSet = $null
    $lastLogon = $null
    try {{
        $passwordLastSet = [datetime]$user.PasswordLastSet
        $lastLogon = [datetime]$user.LastLogonDate
    }} catch {{
        continue
    }}

    if ($passwordLastSet -gt $passwordCutoff -or $lastLogon -lt $recentLogonCutoff) {{
        continue
    }}

    [PSCustomObject]@{{
        Name = $user.Name
        SamAccountName = $user.SamAccountName
        DisplayName = $user.DisplayName
        LastLogonDate = $lastLogon
        PasswordLastSet = $passwordLastSet
        PasswordAgeDays = [int]((Get-Date) - $passwordLastSet).TotalDays
        DistinguishedName = $user.DistinguishedName
    }}
}}

$results = @($results | Sort-Object -Property @(
    @{{ Expression = {{ [int]$_.PasswordAgeDays }}; Descending = $true }},
    @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
))
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            users_expr = users_expr,
        ),

        "computers_not_reporting" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$cutoff = (Get-Date).AddDays(-30)
$results = foreach ($computer in @({computers_expr})) {{
    if (-not $computer.Enabled) {{
        continue
    }}

    $lastLogon = $null
    if ($computer.LastLogonDate) {{
        try {{
            $lastLogon = [datetime]$computer.LastLogonDate
        }} catch {{
            $lastLogon = $null
        }}
    }}

    if ($lastLogon -and $lastLogon -ge $cutoff) {{
        continue
    }}

    [PSCustomObject]@{{
        Name = $computer.Name
        SamAccountName = $computer.SamAccountName
        OperatingSystem = $computer.OperatingSystem
        LastLogonDate = $computer.LastLogonDate
        Status = if ($lastLogon) {{ 'No AD logon in 30+ days' }} else {{ 'Never logged on' }}
        DistinguishedName = $computer.DistinguishedName
    }}
}}

$results = @($results | Sort-Object LastLogonDate, Name)
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            computers_expr = computers_expr,
        ),

        "outdated_operating_systems" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
function Get-OperatingSystemRisk([string] $os, [string] $version) {{
    if ([string]::IsNullOrWhiteSpace($os)) {{
        return $null
    }}

    if ($os -match 'Windows Server 2003|Windows Server 2008|Windows Server 2012') {{
        return 'Unsupported Windows Server'
    }}

    if ($os -match '^Windows 7|^Windows 8(\.1)?') {{
        return 'Unsupported Windows client'
    }}

    if ($os -match '^Windows 10') {{
        try {{
            if (-not [string]::IsNullOrWhiteSpace($version) -and ([version]$version) -lt ([version]'10.0.19045')) {{
                return 'Windows 10 pre-22H2'
            }}
        }} catch {{
            return 'Windows 10 version unknown'
        }}
    }}

    return $null
}}

$results = foreach ($computer in @({computers_expr})) {{
    if (-not $computer.Enabled) {{
        continue
    }}

    $risk = Get-OperatingSystemRisk ([string]$computer.OperatingSystem) ([string]$computer.OperatingSystemVersion)
    if (-not $risk) {{
        continue
    }}

    [PSCustomObject]@{{
        Name = $computer.Name
        SamAccountName = $computer.SamAccountName
        OperatingSystem = $computer.OperatingSystem
        OperatingSystemVersion = $computer.OperatingSystemVersion
        Risk = $risk
        DistinguishedName = $computer.DistinguishedName
    }}
}}

$results = @($results | Sort-Object Risk, OperatingSystem, Name)
Write-JsonArray @($results) 5"#,
            s = srv,
            helpers = helper_script,
            computers_expr = computers_expr,
        ),

        "group_nesting_depth" => format!(
            r#"$ErrorActionPreference = 'Stop'
$s = '{s}'
{helpers}
$allGroups = @({groups_expr})
$groupMap = @{{}}
foreach ($group in $allGroups) {{
    $groupMap[[string]$group.DistinguishedName] = $group
}}

$depthCache = @{{}}
function Get-GroupDepth([string] $distinguishedName, [System.Collections.Generic.HashSet[string]] $visited) {{
    if ([string]::IsNullOrWhiteSpace($distinguishedName) -or -not $groupMap.ContainsKey($distinguishedName)) {{
        return 1
    }}

    if ($depthCache.ContainsKey($distinguishedName)) {{
        return [int]$depthCache[$distinguishedName]
    }}

    if ($visited.Contains($distinguishedName)) {{
        return 1
    }}

    [void]$visited.Add($distinguishedName)
    $group = $groupMap[$distinguishedName]
    $nestedDepths = @()
    foreach ($memberDn in @($group.Members)) {{
        $memberKey = [string]$memberDn
        if ($groupMap.ContainsKey($memberKey)) {{
            $nestedDepths += Get-GroupDepth $memberKey $visited
        }}
    }}
    [void]$visited.Remove($distinguishedName)

    $depth = if ($nestedDepths.Count -gt 0) {{
        1 + (($nestedDepths | Measure-Object -Maximum).Maximum)
    }} else {{
        1
    }}

    $depthCache[$distinguishedName] = $depth
    return $depth
}}

$results = foreach ($group in $allGroups) {{
    $nestedGroupDns = @($group.Members | Where-Object {{ $groupMap.ContainsKey([string]$_) }})
    if ($nestedGroupDns.Count -eq 0) {{
        continue
    }}

    $depth = Get-GroupDepth ([string]$group.DistinguishedName) (New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase))
    if ($depth -le 1) {{
        continue
    }}

    $nestedGroupNames = foreach ($nestedDn in $nestedGroupDns) {{
        $nestedKey = [string]$nestedDn
        if ($groupMap.ContainsKey($nestedKey)) {{
            $groupMap[$nestedKey].Name
        }}
    }}

    [PSCustomObject]@{{
        Name = $group.Name
        SamAccountName = $group.SamAccountName
        GroupCategory = $group.GroupCategory
        GroupScope = $group.GroupScope
        NestedGroupCount = $nestedGroupDns.Count
        NestingDepth = $depth
        NestedGroups = Join-Values $nestedGroupNames
        DistinguishedName = $group.DistinguishedName
    }}
}}

$results = @($results | Sort-Object -Property @(
    @{{ Expression = {{ [int]$_.NestingDepth }}; Descending = $true }},
    @{{ Expression = {{ [int]$_.NestedGroupCount }}; Descending = $true }},
    @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
))
Write-JsonArray @($results) 6"#,
            s = srv,
            helpers = helper_script,
            groups_expr = nested_groups_expr,
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

function Join-Values([object[]] $Values) {
    if (-not $Values) {
        return ''
    }

    return [string]::Join('; ', @($Values | ForEach-Object { [string]$_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }))
}

function Convert-EncryptionTypes([object] $Value) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return 'Default'
    }

    try {
        $flags = [int]$Value
    } catch {
        return [string]$Value
    }

    $names = @()
    if ($flags -band 1) { $names += 'DES_CBC_CRC' }
    if ($flags -band 2) { $names += 'DES_CBC_MD5' }
    if ($flags -band 4) { $names += 'RC4_HMAC' }
    if ($flags -band 8) { $names += 'AES128_HMAC' }
    if ($flags -band 16) { $names += 'AES256_HMAC' }
    if ($flags -band 32) { $names += 'FAST_SUPPORTED' }

    if ($names.Count -eq 0) {
        return [string]$flags
    }

    return Join-Values $names
}

function Get-PrivilegedMembershipMap {
    $groupNames = @(
        'Administrators',
        'Domain Admins',
        'Enterprise Admins',
        'Schema Admins',
        'Account Operators',
        'Server Operators',
        'Backup Operators',
        'Print Operators',
        'Group Policy Creator Owners'
    )

    $membership = @{}
    foreach ($groupName in $groupNames) {
        try {
            $members = @(Get-ADGroupMember -Identity $groupName -Server $s -Recursive -ErrorAction Stop |
                Where-Object { $_.objectClass -eq 'user' })
        } catch {
            continue
        }

        foreach ($member in $members) {
            $dn = [string]$member.DistinguishedName
            if ([string]::IsNullOrWhiteSpace($dn)) {
                continue
            }

            if (-not $membership.ContainsKey($dn)) {
                $membership[$dn] = @()
            }

            if ($membership[$dn] -notcontains $groupName) {
                $membership[$dn] += $groupName
            }
        }
    }

    return $membership
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
    param(
        [bool] $IncludeMembers = $false,
        [bool] $UseLargeMemberRange = $false,
        [object[]] $AdditionalProperties = @()
    )

    $props = @('Description')
    if ($UseLargeMemberRange) {{
        $props += 'member;range=0-49'
    }} elseif ($IncludeMembers) {{
        $props += 'Members'
    }}

    if ($AdditionalProperties) {{
        $props += @($AdditionalProperties)
    }}

    $props = @($props | Where-Object {{ $_ }} | Select-Object -Unique)

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
