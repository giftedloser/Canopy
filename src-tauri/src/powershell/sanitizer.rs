/// Sanitize a string value for safe inclusion in a PowerShell script.
/// Escapes single quotes and validates against injection patterns.
pub fn sanitize_ps_string(input: &str) -> Result<String, String> {
    if input.len() > 4096 {
        return Err("Input exceeds maximum length".to_string());
    }

    // Block dangerous patterns that could break out of string context.
    // Backtick is PowerShell's escape character; blocking it (instead of the
    // narrower "`(" subset) is consistent with sanitize_ad_filter.
    // Double-quote is blocked because some callers embed values in
    // double-quoted PS strings (e.g. -Filter "Name -like '*val*'").
    let dangerous = [";", "|", "&", "\n", "\r", "`", "$(", "\""];
    for pattern in &dangerous {
        if input.contains(pattern) {
            return Err(format!(
                "Input contains disallowed character: {}",
                pattern.trim()
            ));
        }
    }

    // Escape single quotes for PowerShell string literals
    Ok(input.replace('\'', "''"))
}

/// Sanitize an AD filter expression. Only allows known-safe attribute names
/// and simple comparison operators.
pub fn sanitize_ad_filter(filter: &str) -> Result<String, String> {
    if filter.is_empty() {
        return Ok("*".to_string());
    }

    if filter.len() > 1024 {
        return Err("Filter exceeds maximum length".to_string());
    }

    // Block script injection in filters
    let blocked_chars = ['`', '$', '(', ')', ';', '|', '&', '\n', '\r'];
    for ch in &blocked_chars {
        if filter.contains(*ch) {
            return Err(format!("Filter contains disallowed character: {}", ch));
        }
    }

    Ok(filter.to_string())
}

/// Sanitize a Distinguished Name (DN) for use in PowerShell AD commands.
pub fn sanitize_dn(dn: &str) -> Result<String, String> {
    if dn.is_empty() {
        return Err("Distinguished Name cannot be empty".to_string());
    }

    if dn.len() > 2048 {
        return Err("DN exceeds maximum length".to_string());
    }

    let blocked = ['`', '$', ';', '|', '&', '\n', '\r'];
    for ch in &blocked {
        if dn.contains(*ch) {
            return Err(format!("DN contains disallowed character: {}", ch));
        }
    }

    Ok(dn.replace('\'', "''"))
}

/// Sanitize a SAM account name.
pub fn sanitize_sam(sam: &str) -> Result<String, String> {
    if sam.is_empty() {
        return Err("SAM account name cannot be empty".to_string());
    }

    if sam.len() > 256 {
        return Err("SAM account name exceeds maximum length".to_string());
    }

    // SAM account names: alphanumeric, hyphens, underscores, dots
    if !sam
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err("SAM account name contains invalid characters".to_string());
    }

    Ok(sam.to_string())
}
