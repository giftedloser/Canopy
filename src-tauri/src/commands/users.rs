use crate::powershell::{executor::{self, AdCredentials}, sanitizer};

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
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(100).clamp(25, 200);
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
        let safe = sanitizer::sanitize_ps_string(search_term)?;
        format!(
            "\"Name -like '*{}*' -or SamAccountName -like '*{}*' -or EmailAddress -like '*{}*' -or EmployeeNumber -like '*{}*' -or Description -like '*{}*'\"",
            safe, safe, safe, safe, safe
        )
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
                r#"$results = @()
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

$sorted = @($results | Sort-Object -Property {sort_prop} -Descending:${sort_desc})
$total = $sorted.Count
$pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}
$pageCount = if ($total -eq 0) {{ 0 }} else {{ [int][Math]::Ceiling($total / [double]{page_size}) }}

@{{
    items = @($pageItems | Select-Object {select})
    total = $total
    page = {page}
    page_size = {page_size}
    page_count = $pageCount
    has_more = (({page} * {page_size}) -lt $total)
}} | ConvertTo-Json -Depth 4"#,
                ous = ou_parts.join(","),
                filter = filter_expr,
                server = srv,
                props = props,
                select = select,
                status_filter = status_filter,
                sort_prop = sort_prop,
                sort_desc = if sort_desc { "true" } else { "false" },
                skip = skip,
                page = page,
                page_size = page_size,
            );
            return executor::execute_ps_script(&script);
        }
    }

    let script = format!(
        r#"$results = @(Get-ADUser -Filter {filter} -Server '{server}' -Properties {props})

if ('{status_filter}' -eq 'enabled') {{
    $results = @($results | Where-Object {{ $_.Enabled }})
}} elseif ('{status_filter}' -eq 'disabled') {{
    $results = @($results | Where-Object {{ -not $_.Enabled }})
}} elseif ('{status_filter}' -eq 'locked') {{
    $results = @($results | Where-Object {{ $_.LockedOut }})
}}

$sorted = @($results | Sort-Object -Property {sort_prop} -Descending:${sort_desc})
$total = $sorted.Count
$pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}
$pageCount = if ($total -eq 0) {{ 0 }} else {{ [int][Math]::Ceiling($total / [double]{page_size}) }}

@{{
    items = @($pageItems | Select-Object {select})
    total = $total
    page = {page}
    page_size = {page_size}
    page_count = $pageCount
    has_more = (({page} * {page_size}) -lt $total)
}} | ConvertTo-Json -Depth 4"#,
        filter = filter_expr,
        server = srv,
        props = props,
        select = select,
        status_filter = status_filter,
        sort_prop = sort_prop,
        sort_desc = if sort_desc { "true" } else { "false" },
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
        r#"$user = Get-ADUser -Identity '{sam}' -Server '{server}' -Properties *
$groups = Get-ADPrincipalGroupMembership -Identity '{sam}' -Server '{server}' | Select-Object Name, SamAccountName, GroupCategory, GroupScope
@{{
    user = $user | Select-Object Name,SamAccountName,DisplayName,EmailAddress,Department,Title,Company,Office,Manager,StreetAddress,City,State,PostalCode,Country,TelephoneNumber,MobilePhone,Enabled,LockedOut,LastLogonDate,PasswordLastSet,PasswordNeverExpires,AccountExpirationDate,WhenCreated,WhenChanged,DistinguishedName,Description,HomeDirectory,HomeDrive,ScriptPath,ProfilePath
    groups = $groups
}} | ConvertTo-Json -Depth 4"#,
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
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let safe_pw = sanitizer::sanitize_ps_string(&new_password)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let script = format!(
        r#"Set-ADAccountPassword -Identity '{sam}' -Server '{server}' -Credential $cred -Reset -NewPassword (ConvertTo-SecureString '{pw}' -AsPlainText -Force)
@{{ success = $true; message = 'Password reset successfully' }} | ConvertTo-Json"#,
        sam = safe_sam,
        server = srv,
        pw = safe_pw,
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
        r#"Unlock-ADAccount -Identity '{sam}' -Server '{server}' -Credential $cred
@{{ success = $true; message = 'Account unlocked successfully' }} | ConvertTo-Json"#,
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
