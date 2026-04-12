# Security Model

## Principles

Canopy is built around a simple rule:

- Read operations should be easy and low-friction.
- Write operations should be explicit, elevated, and short-lived.

## Read Operations

Read operations use the current Windows session and the selected domain controller context.

Properties of the read path:

- No credential prompt for normal lookup workflows
- Day-scoped local caching for performance
- Read-only PowerShell session reuse for faster repeated queries
- Automatic fallback to isolated one-shot PowerShell execution if the shared session misbehaves

## Write Operations

Write operations require explicit elevation and remain isolated from the read worker.

Examples:

- Resetting user passwords
- Unlocking accounts
- Enabling or disabling users and computers
- Creating users and groups
- Editing group membership

Properties of the write path:

- The user must approve elevation for each action
- The preferred username may be stored for convenience
- Passwords are never persisted
- Each write request builds its own credentialed PowerShell execution context

## Input Sanitization

The backend sanitizes:

- PowerShell string inputs
- SAM account names
- Distinguished names
- AD filter fragments

This is designed to reduce command injection risk before the script reaches PowerShell.

## Reporting and Disclosure

If you find a flaw in any of the above assumptions, follow [../SECURITY.md](../SECURITY.md) and avoid posting exploit details publicly.
