# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `1.0.0-*` | Yes |
| `0.1.x` | Yes |
| `< 0.1.0` | No |

## Reporting a Vulnerability

If you discover a security issue:

1. Do not publish exploit details in a public issue.
2. Prefer GitHub private vulnerability reporting or a private maintainer channel if one is available.
3. If no private channel is available yet, open a minimal issue requesting a secure follow-up path without including sensitive details.

## Scope of High-Priority Reports

The following classes of issues should be treated as high priority:

- Credential leakage or unintended credential persistence
- PowerShell injection or input sanitization bypasses
- Privilege-escalation boundary failures
- Unsafe caching of sensitive directory data
- Insecure defaults in write or elevation workflows

## Security Design Goals

- Read operations use the current Windows session where possible.
- Write operations require explicit elevation and do not persist passwords.
- Sensitive input is sanitized before PowerShell execution.
- Repository contents should never include live credentials, private certificates, or environment-specific secrets.
