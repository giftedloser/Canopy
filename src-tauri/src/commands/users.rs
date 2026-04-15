use crate::powershell::{executor::{self, AdCredentials}, sanitizer};

fn build_user_search_terms(search_term: &str) -> Vec<String> {
    let trimmed = search_term.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut terms = Vec::new();
    for candidate in [
        Some(trimmed),
        trimmed.rsplit('\\').next(),
        trimmed.split('@').next(),
    ]
    .into_iter()
    .flatten()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    {
        if !terms
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(candidate))
        {
            terms.push(candidate.to_string());
        }
    }

    terms
}

#[tauri::command]
pub async fn get_users(
    server: String,
    filter: Option<String>,
    search: Option<String>,
    ou_scopes: Option<Vec<String>>,
    page: Option<u32>,
    page_size: Option<u32>,
    sort_by: Option<String>,
    sort_dir: Option<String>,
    fetch_all: Option<bool>,
    lookup_mode: Option<bool>,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(100).clamp(25, 200);
    let fetch_all = fetch_all.unwrap_or(false);
    let lookup_mode = lookup_mode.unwrap_or(false);
    let skip = (page - 1) * page_size;

    let props = "DisplayName,EmailAddress,Department,Title,Enabled,LockedOut,LastLogonDate,WhenCreated,DistinguishedName,SamAccountName,Description,EmployeeNumber";
    let select = "Name,SamAccountName,DisplayName,EmailAddress,Department,Title,Enabled,LockedOut,LastLogonDate,WhenCreated,DistinguishedName,Description,EmployeeNumber";
    let sort_prop = match sort_by.as_deref() {
        Some("SamAccountName") => "SamAccountName",
        Some("Description") => "Description",
        Some("Department") => "Department",
        Some("Enabled") => "Enabled",
        Some("LastLogonDate") => "LastLogonDate",
        _ => "Name",
    };
    let sort_desc = matches!(sort_dir.as_deref(), Some("desc") | Some("DESC") | Some("Desc"));

    let status_filter = match filter.as_deref() {
        Some("enabled") => "enabled",
        Some("disabled") => "disabled",
        Some("locked") => "locked",
        _ => "",
    };

    let filter_expr = if let Some(ref search_term) = search {
        let terms = build_user_search_terms(search_term);
        if terms.is_empty() {
            "*".to_string()
        } else {
            let mut clauses = Vec::new();
            for term in terms {
                let safe = sanitizer::sanitize_ps_string(&term)?;
                if lookup_mode {
                    clauses.push(format!(
                        "Name -like '*{safe}*' -or DisplayName -like '*{safe}*' -or SamAccountName -like '*{safe}*' -or UserPrincipalName -like '*{safe}*' -or EmployeeNumber -like '*{safe}*'"
                    ));
                } else {
                    clauses.push(format!(
                        "Name -like '*{safe}*' -or DisplayName -like '*{safe}*' -or SamAccountName -like '*{safe}*' -or UserPrincipalName -like '*{safe}*' -or EmailAddress -like '*{safe}*' -or EmployeeNumber -like '*{safe}*' -or Description -like '*{safe}*'"
                    ));
                }
            }
            format!("\"{}\"", clauses.join(" -or "))
        }
    } else if let Some(ref f) = filter {
        if f == "enabled" || f == "disabled" || f == "locked" {
            "*".to_string()
        } else {
        let filt = sanitizer::sanitize_ad_filter(f)?;
        format!("'{}'", filt)
        }
    } else {
        "*".to_string()
    };

    // When OU scopes are provided, query each OU with -SearchBase
    if let Some(ref scopes) = ou_scopes {
        if !scopes.is_empty() {
            let mut ou_parts = Vec::new();
            for scope in scopes {
                let safe = sanitizer::sanitize_dn(scope)?;
                ou_parts.push(format!("'{}'", safe));
            }
            let script = format!(
                r#"function Get-UserSortValue([object] $user) {{
    switch ('{sort_prop}') {{
        'SamAccountName' {{ return [string]$user.SamAccountName }}
        'Description' {{ return [string]$user.Description }}
        'Department' {{ return [string]$user.Department }}
        'Enabled' {{ return if ($user.Enabled) {{ 1 }} else {{ 0 }} }}
        'LastLogonDate' {{
            if ($user.LastLogonDate) {{
                return ([datetime]$user.LastLogonDate).Ticks
            }}
            return [long]::MinValue
        }}
        default {{
            return [string]($(if ($user.DisplayName) {{ $user.DisplayName }} else {{ $user.Name }}))
        }}
    }}
}}

$results = @()
foreach ($base in @({ous})) {{
    $results += Get-ADUser -Filter {filter} -Server '{server}' -SearchBase $base -SearchScope Subtree -Properties {props}
}}
$results = @($results | Sort-Object DistinguishedName -Unique)

if ('{status_filter}' -eq 'enabled') {{
    $results = @($results | Where-Object {{ $_.Enabled }})
}} elseif ('{status_filter}' -eq 'disabled') {{
    $results = @($results | Where-Object {{ -not $_.Enabled }})
}} elseif ('{status_filter}' -eq 'locked') {{
    $results = @($results | Where-Object {{ $_.LockedOut }})
}}

$sorted = @($results | Sort-Object -Property @(
    @{{ Expression = {{ Get-UserSortValue $_ }}; Descending = {sort_desc} }},
    @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
))
$total = $sorted.Count
$useAll = {fetch_all}
if ($useAll) {{
    $pageItems = @($sorted)
    $pageCount = if ($total -eq 0) {{ 0 }} else {{ 1 }}
    $pageOut = 1
    $pageSizeOut = if ($total -eq 0) {{ 0 }} else {{ $total }}
    $hasMore = $false
}} else {{
    $pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}
    $pageCount = if ($total -eq 0) {{ 0 }} else {{ [int][Math]::Ceiling($total / [double]{page_size}) }}
    $pageOut = {page}
    $pageSizeOut = {page_size}
    $hasMore = (({page} * {page_size}) -lt $total)
}}

@{{
    items = @($pageItems | Select-Object {select})
    total = $total
    page = $pageOut
    page_size = $pageSizeOut
    page_count = $pageCount
    has_more = $hasMore
}} | ConvertTo-Json -Depth 4"#,
                ous = ou_parts.join(","),
                filter = filter_expr,
                server = srv,
                props = props,
                select = select,
                status_filter = status_filter,
                sort_prop = sort_prop,
                sort_desc = if sort_desc { "$true" } else { "$false" },
                fetch_all = if fetch_all { "$true" } else { "$false" },
                skip = skip,
                page = page,
                page_size = page_size,
            );
            return executor::execute_ps_script(&script);
        }
    }

    let script = format!(
        r#"function Get-UserSortValue([object] $user) {{
    switch ('{sort_prop}') {{
        'SamAccountName' {{ return [string]$user.SamAccountName }}
        'Description' {{ return [string]$user.Description }}
        'Department' {{ return [string]$user.Department }}
        'Enabled' {{ return if ($user.Enabled) {{ 1 }} else {{ 0 }} }}
        'LastLogonDate' {{
            if ($user.LastLogonDate) {{
                return ([datetime]$user.LastLogonDate).Ticks
            }}
            return [long]::MinValue
        }}
        default {{
            return [string]($(if ($user.DisplayName) {{ $user.DisplayName }} else {{ $user.Name }}))
        }}
    }}
}}

$results = @(Get-ADUser -Filter {filter} -Server '{server}' -Properties {props})

if ('{status_filter}' -eq 'enabled') {{
    $results = @($results | Where-Object {{ $_.Enabled }})
}} elseif ('{status_filter}' -eq 'disabled') {{
    $results = @($results | Where-Object {{ -not $_.Enabled }})
}} elseif ('{status_filter}' -eq 'locked') {{
    $results = @($results | Where-Object {{ $_.LockedOut }})
}}

$sorted = @($results | Sort-Object -Property @(
    @{{ Expression = {{ Get-UserSortValue $_ }}; Descending = {sort_desc} }},
    @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
))
$total = $sorted.Count
$useAll = {fetch_all}
if ($useAll) {{
    $pageItems = @($sorted)
    $pageCount = if ($total -eq 0) {{ 0 }} else {{ 1 }}
    $pageOut = 1
    $pageSizeOut = if ($total -eq 0) {{ 0 }} else {{ $total }}
    $hasMore = $false
}} else {{
    $pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}
    $pageCount = if ($total -eq 0) {{ 0 }} else {{ [int][Math]::Ceiling($total / [double]{page_size}) }}
    $pageOut = {page}
    $pageSizeOut = {page_size}
    $hasMore = (({page} * {page_size}) -lt $total)
}}

@{{
    items = @($pageItems | Select-Object {select})
    total = $total
    page = $pageOut
    page_size = $pageSizeOut
    page_count = $pageCount
    has_more = $hasMore
}} | ConvertTo-Json -Depth 4"#,
        filter = filter_expr,
        server = srv,
        props = props,
        select = select,
        status_filter = status_filter,
        sort_prop = sort_prop,
        sort_desc = if sort_desc { "$true" } else { "$false" },
        fetch_all = if fetch_all { "$true" } else { "$false" },
        skip = skip,
        page = page,
        page_size = page_size,
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn get_user_detail(
    server: String,
    sam_account_name: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let srv = sanitizer::sanitize_ps_string(&server)?;

    let script = format!(
        r#"$user = Get-ADUser -Identity '{sam}' -Server '{server}' -Properties GivenName,Surname,EmailAddress,Department,Title,Company,Office,Manager,StreetAddress,City,State,PostalCode,Country,TelephoneNumber,MobilePhone,Enabled,LockedOut,LastLogonDate,PasswordLastSet,PasswordNeverExpires,AccountExpirationDate,WhenCreated,WhenChanged,DistinguishedName,Description,HomeDirectory,HomeDrive,ScriptPath,ProfilePath,MemberOf

@{{
    user = $user | Select-Object Name,SamAccountName,DisplayName,GivenName,Surname,EmailAddress,Department,Title,Company,Office,Manager,StreetAddress,City,State,PostalCode,Country,TelephoneNumber,MobilePhone,Enabled,LockedOut,LastLogonDate,PasswordLastSet,PasswordNeverExpires,AccountExpirationDate,WhenCreated,WhenChanged,DistinguishedName,Description,HomeDirectory,HomeDrive,ScriptPath,ProfilePath,MemberOf
    groups = @()
}} | ConvertTo-Json -Depth 4"#,
        sam = safe_sam,
        server = srv,
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn get_user_groups(
    server: String,
    sam_account_name: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let srv = sanitizer::sanitize_ps_string(&server)?;

    let script = format!(
        r#"$user = Get-ADUser -Identity '{sam}' -Server '{server}' -Properties MemberOf,DistinguishedName,SamAccountName,Name
$groups = @()
$identities = @(
    $user.DistinguishedName,
    $user.SamAccountName,
    $user.Name,
    $(if ($user.SamAccountName) {{ "$($user.SamAccountName)`$" }} else {{ $null }})
) | Where-Object {{ $_ }}

foreach ($identity in $identities) {{
    try {{
        $resolved = @(Get-ADPrincipalGroupMembership -Identity $identity -Server '{server}' -ErrorAction Stop |
            Select-Object Name,SamAccountName,GroupCategory,GroupScope,DistinguishedName)
        if ($resolved.Count -gt 0) {{
            $groups = $resolved
            break
        }}
    }} catch {{
        continue
    }}
}}

if ($groups.Count -eq 0 -and @($user.MemberOf).Count -gt 0) {{
    $groups = @(
        @($user.MemberOf) |
            ForEach-Object {{
                $dn = [string]$_
                $cn = ($dn -split ',')[0]
                [PSCustomObject]@{{
                    Name = if ($cn -like 'CN=*') {{ $cn.Substring(3) }} else {{ $cn }}
                    SamAccountName = $null
                    GroupCategory = $null
                    GroupScope = $null
                    DistinguishedName = $dn
                }}
            }} |
            Sort-Object Name
    )
}}

$groups | ConvertTo-Json -Depth 4"#,
        sam = safe_sam,
        server = srv,
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn reset_user_password(
    domain: String,
    username: String,
    password: String,
    server: String,
    sam_account_name: String,
    new_password: String,
    change_password_at_logon: Option<bool>,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let safe_pw = sanitizer::sanitize_ps_string(&new_password)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;
    let change_password_at_logon = change_password_at_logon.unwrap_or(false);

    let script = format!(
        r#"Set-ADAccountPassword -Identity '{sam}' -Server '{server}' -Credential $cred -Reset -NewPassword (ConvertTo-SecureString '{pw}' -AsPlainText -Force)
Set-ADUser -Identity '{sam}' -Server '{server}' -Credential $cred -ChangePasswordAtLogon {change_password_at_logon}
@{{ success = $true; message = 'Password reset successfully' }} | ConvertTo-Json"#,
        sam = safe_sam,
        server = srv,
        pw = safe_pw,
        change_password_at_logon = if change_password_at_logon { "$true" } else { "$false" },
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn unlock_user(
    domain: String,
    username: String,
    password: String,
    server: String,
    sam_account_name: String,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let script = format!(
        r#"try {{
    Unlock-ADAccount -Identity '{sam}' -Server '{server}' -Credential $cred -ErrorAction Stop | Out-Null
    $message = 'Account unlocked successfully'
}} catch {{
    $errorText = [string]$_.Exception.Message
    if ($errorText -match 'not currently locked out' -or $errorText -match 'not locked out' -or $errorText -match 'cannot be unlocked because it is not locked') {{
        $message = 'Account was already unlocked'
    }} else {{
        throw
    }}
}}
@{{ success = $true; message = $message }} | ConvertTo-Json"#,
        sam = safe_sam,
        server = srv,
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn toggle_user(
    domain: String,
    username: String,
    password: String,
    server: String,
    sam_account_name: String,
    enable: bool,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let cmd = if enable { "Enable-ADAccount" } else { "Disable-ADAccount" };
    let action = if enable { "enabled" } else { "disabled" };

    let script = format!(
        r#"{cmd} -Identity '{sam}' -Server '{server}' -Credential $cred
@{{ success = $true; message = 'Account {action} successfully' }} | ConvertTo-Json"#,
        cmd = cmd,
        sam = safe_sam,
        server = srv,
        action = action,
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn create_user(
    domain: String,
    username: String,
    password: String,
    server: String,
    sam_account_name: String,
    display_name: String,
    first_name: String,
    last_name: String,
    email: Option<String>,
    department: Option<String>,
    title: Option<String>,
    user_password: String,
    ou_path: String,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let safe_display = sanitizer::sanitize_ps_string(&display_name)?;
    let safe_first = sanitizer::sanitize_ps_string(&first_name)?;
    let safe_last = sanitizer::sanitize_ps_string(&last_name)?;
    let safe_pw = sanitizer::sanitize_ps_string(&user_password)?;
    let safe_ou = sanitizer::sanitize_dn(&ou_path)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let mut optional_params = String::new();
    if let Some(e) = email {
        let safe = sanitizer::sanitize_ps_string(&e)?;
        optional_params.push_str(&format!(" -EmailAddress '{}'", safe));
    }
    if let Some(d) = department {
        let safe = sanitizer::sanitize_ps_string(&d)?;
        optional_params.push_str(&format!(" -Department '{}'", safe));
    }
    if let Some(t) = title {
        let safe = sanitizer::sanitize_ps_string(&t)?;
        optional_params.push_str(&format!(" -Title '{}'", safe));
    }

    let script = format!(
        r#"New-ADUser -Name '{display}' -SamAccountName '{sam}' -GivenName '{first}' -Surname '{last}' -DisplayName '{display}' -AccountPassword (ConvertTo-SecureString '{pw}' -AsPlainText -Force) -Path '{ou}' -Enabled $true -Server '{server}' -Credential $cred{optional}
@{{ success = $true; message = 'User created successfully' }} | ConvertTo-Json"#,
        display = safe_display,
        sam = safe_sam,
        first = safe_first,
        last = safe_last,
        pw = safe_pw,
        ou = safe_ou,
        server = srv,
        optional = optional_params,
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn update_user(
    domain: String,
    username: String,
    password: String,
    server: String,
    sam_account_name: String,
    properties: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let allowed_props = [
        "DisplayName", "EmailAddress", "Department", "Title", "Company",
        "Office", "StreetAddress", "City", "State", "PostalCode", "Country",
        "TelephoneNumber", "MobilePhone", "Description", "Manager",
    ];

    let mut set_params = Vec::new();
    for (key, value) in &properties {
        if !allowed_props.contains(&key.as_str()) {
            return Err(format!("Property '{}' is not allowed for update", key));
        }
        let safe_val = sanitizer::sanitize_ps_string(value)?;
        set_params.push(format!("-{} '{}'", key, safe_val));
    }

    if set_params.is_empty() {
        return Err("No properties to update".to_string());
    }

    let script = format!(
        r#"Set-ADUser -Identity '{sam}' -Server '{server}' -Credential $cred {params}
@{{ success = $true; message = 'User updated successfully' }} | ConvertTo-Json"#,
        sam = safe_sam,
        server = srv,
        params = set_params.join(" "),
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn move_user(
    domain: String,
    username: String,
    password: String,
    server: String,
    sam_account_name: String,
    target_ou: String,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let safe_target = sanitizer::sanitize_dn(&target_ou)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let script = format!(
        r#"$user = Get-ADUser -Identity '{sam}' -Server '{server}' -Properties DistinguishedName
Move-ADObject -Identity $user.DistinguishedName -TargetPath '{target}' -Server '{server}' -Credential $cred
@{{ success = $true; message = 'User moved successfully' }} | ConvertTo-Json"#,
        sam = safe_sam,
        target = safe_target,
        server = srv,
    );

    executor::execute_ad_script(&creds, &script)
}
