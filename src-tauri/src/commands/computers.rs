use crate::powershell::{executor::{self, AdCredentials}, sanitizer};

#[tauri::command]
pub async fn get_computers(
    server: String,
    search: Option<String>,
    ou_scopes: Option<Vec<String>>,
    page: Option<u32>,
    page_size: Option<u32>,
    sort_by: Option<String>,
    sort_dir: Option<String>,
    fetch_all: Option<bool>,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(100).clamp(25, 200);
    let fetch_all = fetch_all.unwrap_or(false);
    let skip = (page - 1) * page_size;

    let props = "Name,OperatingSystem,OperatingSystemVersion,LastLogonDate,Enabled,IPv4Address,DistinguishedName,WhenCreated,Description,DNSHostName,Location";
    let select = props;
    let sort_prop = match sort_by.as_deref() {
        Some("Description") => "Description",
        Some("OperatingSystem") => "OperatingSystem",
        Some("LastLogonDate") => "LastLogonDate",
        Some("IPv4Address") => "IPv4Address",
        Some("Enabled") => "Enabled",
        _ => "Name",
    };
    let sort_desc = matches!(sort_dir.as_deref(), Some("desc") | Some("DESC") | Some("Desc"));

    let filter_expr = if let Some(ref term) = search {
        let safe = sanitizer::sanitize_ps_string(term)?;
        format!("\"Name -like '*{}*' -or Description -like '*{}*'\"", safe, safe)
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
                r#"function Get-ComputerSortValue([object] $computer) {{
    switch ('{sort_prop}') {{
        'Description' {{ return [string]$computer.Description }}
        'OperatingSystem' {{ return [string]$computer.OperatingSystem }}
        'LastLogonDate' {{
            if ($computer.LastLogonDate) {{
                return ([datetime]$computer.LastLogonDate).Ticks
            }}
            return [long]::MinValue
        }}
        'IPv4Address' {{ return [string]$computer.IPv4Address }}
        'Enabled' {{ return if ($computer.Enabled) {{ 1 }} else {{ 0 }} }}
        default {{ return [string]$computer.Name }}
    }}
}}

$results = @()
foreach ($base in @({ous})) {{
    $results += Get-ADComputer -Filter {filter} -Server '{server}' -SearchBase $base -SearchScope Subtree -Properties {props}
}}
$results = @($results | Sort-Object DistinguishedName -Unique)
$sorted = @($results | Sort-Object -Property @(
    @{{ Expression = {{ Get-ComputerSortValue $_ }}; Descending = {sort_desc} }},
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
        r#"function Get-ComputerSortValue([object] $computer) {{
    switch ('{sort_prop}') {{
        'Description' {{ return [string]$computer.Description }}
        'OperatingSystem' {{ return [string]$computer.OperatingSystem }}
        'LastLogonDate' {{
            if ($computer.LastLogonDate) {{
                return ([datetime]$computer.LastLogonDate).Ticks
            }}
            return [long]::MinValue
        }}
        'IPv4Address' {{ return [string]$computer.IPv4Address }}
        'Enabled' {{ return if ($computer.Enabled) {{ 1 }} else {{ 0 }} }}
        default {{ return [string]$computer.Name }}
    }}
}}

$results = @(Get-ADComputer -Filter {filter} -Server '{server}' -Properties {props})
$sorted = @($results | Sort-Object -Property @(
    @{{ Expression = {{ Get-ComputerSortValue $_ }}; Descending = {sort_desc} }},
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
pub async fn get_computer_detail(
    server: String,
    computer_name: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let safe_name = sanitizer::sanitize_sam(&computer_name)?;
    let srv = sanitizer::sanitize_ps_string(&server)?;

    let script = format!(
        r#"$computer = Get-ADComputer -Identity '{name}' -Server '{server}' -Properties *
$groups = @()
try {{
    $groups = @(Get-ADPrincipalGroupMembership -Identity $computer.DistinguishedName -Server '{server}' |
        Select-Object Name, SamAccountName, GroupCategory, GroupScope)
}} catch {{
    $groups = @()
}}
@{{
    computer = $computer | Select-Object Name,DNSHostName,OperatingSystem,OperatingSystemVersion,OperatingSystemServicePack,LastLogonDate,Enabled,IPv4Address,DistinguishedName,WhenCreated,WhenChanged,Description,Location,ManagedBy,ServicePrincipalNames
    groups = $groups
}} | ConvertTo-Json -Depth 4"#,
        name = safe_name,
        server = srv,
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn toggle_computer(
    domain: String,
    username: String,
    password: String,
    server: String,
    computer_name: String,
    enable: bool,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_name = sanitizer::sanitize_sam(&computer_name)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let cmd = if enable { "Enable-ADAccount" } else { "Disable-ADAccount" };
    let action = if enable { "enabled" } else { "disabled" };

    let script = format!(
        r#"{cmd} -Identity '{name}$' -Server '{server}' -Credential $cred
@{{ success = $true; message = 'Computer {action} successfully' }} | ConvertTo-Json"#,
        cmd = cmd,
        name = safe_name,
        server = srv,
        action = action,
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn move_computer(
    domain: String,
    username: String,
    password: String,
    server: String,
    computer_name: String,
    target_ou: String,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_name = sanitizer::sanitize_sam(&computer_name)?;
    let safe_target = sanitizer::sanitize_dn(&target_ou)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let script = format!(
        r#"$computer = Get-ADComputer -Identity '{name}' -Server '{server}' -Properties DistinguishedName
Move-ADObject -Identity $computer.DistinguishedName -TargetPath '{target}' -Server '{server}' -Credential $cred
@{{ success = $true; message = 'Computer moved successfully' }} | ConvertTo-Json"#,
        name = safe_name,
        target = safe_target,
        server = srv,
    );

    executor::execute_ad_script(&creds, &script)
}
