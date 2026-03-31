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

#[cfg(test)]
mod tests {
    use super::{
        sanitize_ad_filter, sanitize_dn, sanitize_ps_string, sanitize_sam,
    };

    #[test]
    fn sanitize_ps_string_escapes_single_quotes() {
        let value = "O'Connor";
        let sanitized = sanitize_ps_string(value).expect("single quotes should be escaped");
        assert_eq!(sanitized, "O''Connor");
    }

    #[test]
    fn sanitize_ps_string_rejects_powershell_escape_characters() {
        let err = sanitize_ps_string("corp`nadmin").expect_err("backticks must be blocked");
        assert!(err.contains("disallowed"));
    }

    #[test]
    fn sanitize_ad_filter_allows_simple_filters() {
        let filter = "Enabled -eq $true".replace('$', "");
        let sanitized = sanitize_ad_filter(&filter).expect("simple filters should pass");
        assert_eq!(sanitized, filter);
    }

    #[test]
    fn sanitize_ad_filter_rejects_script_injection_tokens() {
        let err = sanitize_ad_filter("Name -like '*admin*'; Remove-Item")
            .expect_err("injection tokens must be blocked");
        assert!(err.contains("disallowed"));
    }

    #[test]
    fn sanitize_dn_rejects_empty_values() {
        let err = sanitize_dn("").expect_err("empty DNs must fail");
        assert!(err.contains("cannot be empty"));
    }

    #[test]
    fn sanitize_dn_escapes_single_quotes() {
        let dn = "OU=O'Brian,DC=example,DC=com";
        let sanitized = sanitize_dn(dn).expect("single quotes should be escaped in DNs");
        assert_eq!(sanitized, "OU=O''Brian,DC=example,DC=com");
    }

    #[test]
    fn sanitize_sam_allows_standard_account_names() {
        let sanitized = sanitize_sam("svc_backup-user.01")
            .expect("standard SAM account names should pass");
        assert_eq!(sanitized, "svc_backup-user.01");
    }

    #[test]
    fn sanitize_sam_rejects_invalid_characters() {
        let err = sanitize_sam("bad/user").expect_err("slashes are not valid in SAM names");
        assert!(err.contains("invalid characters"));
    }
}
