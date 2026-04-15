use crate::powershell::{executor::{self, AdCredentials}, sanitizer};

fn build_exact_group_member_count_function(server_var: &str) -> String {
    format!(
        r#"function Get-ExactGroupMemberCount([string] $identity) {{
    try {{
        $count = 0
        $start = 0
        while ($true) {{
            $rangeAttr = "member;range=$start-$($start + 1499)"
            $rangeGroup = Get-ADGroup -Identity $identity -Server {server_var} -Properties $rangeAttr
            $rangeProp = $rangeGroup.PSObject.Properties | Where-Object {{ $_.Name -like 'member;range=*' }} | Select-Object -First 1
            if (-not $rangeProp) {{
                return 0
            }}

            $rangeMembers = @($rangeProp.Value)
            $count += $rangeMembers.Count

            if ($rangeProp.Name -match '^member;range=\d+-\*$' -or $rangeMembers.Count -eq 0) {{
                break
            }}

            $start += $rangeMembers.Count
        }}

        return $count
    }} catch {{
        return 0
    }}
}}"#
    )
}

#[tauri::command]
pub async fn get_groups(
    server: String,
    search: Option<String>,
    ou_scopes: Option<Vec<String>>,
    page: Option<u32>,
    page_size: Option<u32>,
    sort_by: Option<String>,
    sort_dir: Option<String>,
    include_member_counts: Option<bool>,
    lookup_mode: Option<bool>,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let srv = sanitizer::sanitize_ps_string(&server)?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(100).clamp(25, 200);
    let skip = (page - 1) * page_size;

    let base_props = "Description,WhenCreated,ManagedBy";
    let select = "Name,SamAccountName,GroupCategory,GroupScope,Description,WhenCreated,ManagedBy,DistinguishedName,MemberCount";
    let sort_prop = match sort_by.as_deref() {
        Some("GroupCategory") => "GroupCategory",
        Some("GroupScope") => "GroupScope",
        Some("Description") => "Description",
        Some("MemberCount") => "MemberCount",
        _ => "Name",
    };
    let sort_desc = matches!(sort_dir.as_deref(), Some("desc") | Some("DESC") | Some("Desc"));
    let sort_by_member_count = sort_prop == "MemberCount";
    let include_member_counts = include_member_counts.unwrap_or(true);
    let lookup_mode = lookup_mode.unwrap_or(false);

    let filter_expr = if let Some(ref term) = search {
        let safe = sanitizer::sanitize_ps_string(term)?;
        if lookup_mode {
            format!("\"Name -like '*{}*' -or SamAccountName -like '*{}*'\"", safe, safe)
        } else {
            format!("\"Name -like '*{}*' -or SamAccountName -like '*{}*' -or Description -like '*{}*'\"", safe, safe, safe)
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
                r#"{count_helper}

function Get-GroupSortValue([object] $group) {{
    switch ('{sort_prop}') {{
        'GroupCategory' {{ return [string]$group.GroupCategory }}
        'GroupScope' {{ return [string]$group.GroupScope }}
        'Description' {{ return [string]$group.Description }}
        'MemberCount' {{ return [int]$group.MemberCount }}
        default {{ return [string]$group.Name }}
    }}
}}

$results = @()
foreach ($base in @({ous})) {{
    if (${sort_by_member_count}) {{
        $results += Get-ADGroup -Filter {filter} -Server '{server}' -SearchBase $base -SearchScope Subtree -Properties Description,WhenCreated,ManagedBy,Members
    }} else {{
        $results += Get-ADGroup -Filter {filter} -Server '{server}' -SearchBase $base -SearchScope Subtree -Properties {base_props}
    }}
}}
$results = @($results | Sort-Object DistinguishedName -Unique)

if (${sort_by_member_count}) {{
        $results = @($results | Select-Object Name,SamAccountName,GroupCategory,GroupScope,Description,WhenCreated,ManagedBy,DistinguishedName,@{{Name='MemberCount';Expression={{ @($_.Members).Count }}}})
        $sorted = @($results | Sort-Object -Property @(
        @{{ Expression = {{ Get-GroupSortValue $_ }}; Descending = {sort_desc} }},
        @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
    ))
    $total = $sorted.Count
    $pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}
}} else {{
    $sorted = @($results | Sort-Object -Property @(
        @{{ Expression = {{ Get-GroupSortValue $_ }}; Descending = {sort_desc} }},
        @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
    ))
    $total = $sorted.Count
    $pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}

    if (${include_member_counts}) {{
        foreach ($group in $pageItems) {{
            $group | Add-Member -NotePropertyName MemberCount -NotePropertyValue (Get-ExactGroupMemberCount $group.DistinguishedName) -Force
        }}
    }}
}}

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
                count_helper = build_exact_group_member_count_function(&format!("'{}'", srv)),
                base_props = base_props,
                select = select,
                sort_prop = sort_prop,
                sort_desc = if sort_desc { "$true" } else { "$false" },
                sort_by_member_count = if sort_by_member_count { "true" } else { "false" },
                include_member_counts = if include_member_counts { "true" } else { "false" },
                skip = skip,
                page = page,
                page_size = page_size,
            );
            return executor::execute_ps_script(&script);
        }
    }

    let script = format!(
        r#"{count_helper}

function Get-GroupSortValue([object] $group) {{
    switch ('{sort_prop}') {{
        'GroupCategory' {{ return [string]$group.GroupCategory }}
        'GroupScope' {{ return [string]$group.GroupScope }}
        'Description' {{ return [string]$group.Description }}
        'MemberCount' {{ return [int]$group.MemberCount }}
        default {{ return [string]$group.Name }}
    }}
}}

if (${sort_by_member_count}) {{
    $results = @(Get-ADGroup -Filter {filter} -Server '{server}' -Properties Description,WhenCreated,ManagedBy,Members |
        Select-Object Name,SamAccountName,GroupCategory,GroupScope,Description,WhenCreated,ManagedBy,DistinguishedName,@{{Name='MemberCount';Expression={{ @($_.Members).Count }}}})
    $sorted = @($results | Sort-Object -Property @(
        @{{ Expression = {{ Get-GroupSortValue $_ }}; Descending = {sort_desc} }},
        @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
    ))
    $total = $sorted.Count
    $pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}
}} else {{
    $results = @(Get-ADGroup -Filter {filter} -Server '{server}' -Properties {base_props})
    $sorted = @($results | Sort-Object -Property @(
        @{{ Expression = {{ Get-GroupSortValue $_ }}; Descending = {sort_desc} }},
        @{{ Expression = {{ [string]$_.Name }}; Descending = $false }}
    ))
    $total = $sorted.Count
    $pageItems = if ({skip} -lt $total) {{ @($sorted | Select-Object -Skip {skip} -First {page_size}) }} else {{ @() }}

    if (${include_member_counts}) {{
        foreach ($group in $pageItems) {{
            $group | Add-Member -NotePropertyName MemberCount -NotePropertyValue (Get-ExactGroupMemberCount $group.DistinguishedName) -Force
        }}
    }}
}}

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
        count_helper = build_exact_group_member_count_function(&format!("'{}'", srv)),
        base_props = base_props,
        select = select,
        sort_prop = sort_prop,
        sort_desc = if sort_desc { "$true" } else { "$false" },
        sort_by_member_count = if sort_by_member_count { "true" } else { "false" },
        include_member_counts = if include_member_counts { "true" } else { "false" },
        skip = skip,
        page = page,
        page_size = page_size,
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn get_group_member_counts(
    server: String,
    group_dns: Vec<String>,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    if group_dns.is_empty() {
        return Ok("[]".to_string());
    }

    let srv = sanitizer::sanitize_ps_string(&server)?;
    let sanitized_dns = group_dns
        .iter()
        .map(|dn| sanitizer::sanitize_dn(dn))
        .collect::<Result<Vec<_>, _>>()?;
    let dn_values = sanitized_dns
        .iter()
        .map(|dn| format!("'{}'", dn))
        .collect::<Vec<_>>()
        .join(",");

    let script = format!(
        r#"{count_helper}

$results = foreach ($groupDn in @({group_dns})) {{
    if ([string]::IsNullOrWhiteSpace($groupDn)) {{
        continue
    }}

    [PSCustomObject]@{{
        DistinguishedName = $groupDn
        MemberCount = Get-ExactGroupMemberCount $groupDn
    }}
}}

$results | ConvertTo-Json -Depth 3"#,
        count_helper = build_exact_group_member_count_function(&format!("'{}'", srv)),
        group_dns = dn_values,
    );

    executor::execute_ps_script(&script)
}


#[tauri::command]
pub async fn get_group_members(
    server: String,
    group_name: String,
) -> Result<String, String> {
    let server = server.trim().to_string();
    if server.is_empty() {
        return Err("Server is required".to_string());
    }
    let safe_name = sanitizer::sanitize_ps_string(&group_name)?;
    let srv = sanitizer::sanitize_ps_string(&server)?;

    let script = format!(
        r#"Get-ADGroupMember -Identity '{name}' -Server '{server}' |
Select-Object Name,SamAccountName,ObjectClass,DistinguishedName,@{{Name='Description';Expression={{$_.Description}}}} |
ConvertTo-Json -Depth 3"#,
        name = safe_name,
        server = srv,
    );

    executor::execute_ps_script(&script)
}

#[tauri::command]
pub async fn add_group_member(
    domain: String,
    username: String,
    password: String,
    server: String,
    group_name: String,
    member_sam: String,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_group = sanitizer::sanitize_ps_string(&group_name)?;
    let safe_member = sanitizer::sanitize_sam(&member_sam)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let script = format!(
        r#"Add-ADGroupMember -Identity '{group}' -Members '{member}' -Server '{server}' -Credential $cred
@{{ success = $true; message = 'Member added successfully' }} | ConvertTo-Json"#,
        group = safe_group,
        member = safe_member,
        server = srv,
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn remove_group_member(
    domain: String,
    username: String,
    password: String,
    server: String,
    group_name: String,
    member_sam: String,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_group = sanitizer::sanitize_ps_string(&group_name)?;
    let safe_member = sanitizer::sanitize_sam(&member_sam)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let script = format!(
        r#"Remove-ADGroupMember -Identity '{group}' -Members '{member}' -Server '{server}' -Credential $cred -Confirm:$false
@{{ success = $true; message = 'Member removed successfully' }} | ConvertTo-Json"#,
        group = safe_group,
        member = safe_member,
        server = srv,
    );

    executor::execute_ad_script(&creds, &script)
}

#[tauri::command]
pub async fn create_group(
    domain: String,
    username: String,
    password: String,
    server: String,
    name: String,
    sam_account_name: String,
    group_scope: String,
    group_category: String,
    description: Option<String>,
    ou_path: String,
) -> Result<String, String> {
    let creds = AdCredentials { domain, username, password };
    let safe_name = sanitizer::sanitize_ps_string(&name)?;
    let safe_sam = sanitizer::sanitize_sam(&sam_account_name)?;
    let safe_ou = sanitizer::sanitize_dn(&ou_path)?;
    let srv = sanitizer::sanitize_ps_string(server.trim())?;

    let valid_scopes = ["Global", "Universal", "DomainLocal"];
    let valid_categories = ["Security", "Distribution"];

    if !valid_scopes.contains(&group_scope.as_str()) {
        return Err(format!("Invalid group scope: {}", group_scope));
    }
    if !valid_categories.contains(&group_category.as_str()) {
        return Err(format!("Invalid group category: {}", group_category));
    }

    let desc_param = if let Some(d) = description {
        let safe = sanitizer::sanitize_ps_string(&d)?;
        format!(" -Description '{}'", safe)
    } else {
        String::new()
    };

    let script = format!(
        r#"New-ADGroup -Name '{name}' -SamAccountName '{sam}' -GroupScope '{scope}' -GroupCategory '{category}' -Path '{ou}' -Server '{server}' -Credential $cred{desc}
@{{ success = $true; message = 'Group created successfully' }} | ConvertTo-Json"#,
        name = safe_name,
        sam = safe_sam,
        scope = group_scope,
        category = group_category,
        ou = safe_ou,
        server = srv,
        desc = desc_param,
    );

    executor::execute_ad_script(&creds, &script)
}
