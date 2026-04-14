# Troubleshooting

## Common Setup Issues

### RSAT Active Directory Module Missing

Symptoms:

- Connection tests fail immediately
- Reports and directory queries return PowerShell AD module errors

Fix:

```powershell
Add-WindowsCapability -Online -Name Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0
```

Then restart Canopy and try again.

### WebView2 Missing

Symptoms:

- The application fails to launch or renders as a blank shell

Fix:

- Install the Microsoft Edge WebView2 Runtime
- Reopen the app after installation

## Connection Problems

### Integrated Auth Fails on Startup

Symptoms:

- The app opens to the credential dialog instead of connecting automatically

Checks:

- Confirm the machine is domain-joined
- Confirm the current Windows session can reach a domain controller
- Confirm DNS and line-of-sight to the selected domain controller
- Try opening the connection dialog and specifying a known-good DC manually

### Directory Data Looks Empty or Unexpectedly Scoped

Checks:

- Confirm OU scope filtering is not restricting the view in Settings
- Confirm you are connected to the intended domain controller
- Use the page refresh action after changing server context

## Write Actions and Elevation

### Write Actions Keep Cancelling

Symptoms:

- Unlock, password reset, group membership, create, move, or enable/disable actions return a cancelled state

Checks:

- Confirm the elevation dialog is being completed rather than dismissed
- Confirm the pre-filled elevation username is correct in Settings
- Confirm the supplied account has permission for the requested AD write

### Access Denied or Permission Errors

Checks:

- Validate the elevated account has rights for the target object and OU
- Confirm delegation boundaries or protected groups are not blocking the change
- Retry the action against a specific known-good domain controller if replication or routing is suspect

## Data Freshness and Performance

### Data Looks Stale

Canopy uses bounded local caching scoped to the connected domain, server, and user context.

Fix:

- Use the page refresh action in the header
- Reopen the affected detail sheet or report after a write action completes
- If you changed connection context, reconnect and refresh the page

### Large Groups or Reports Feel Slow

Expected behavior:

- Very large groups and heavier reports may take longer because AD range lookups and report queries still depend on directory size and domain controller responsiveness

What to try:

- Scope to a specific OU where possible
- Point the session at a responsive domain controller
- Re-run the report after confirming RSAT and connectivity are healthy

## When to Capture More Detail

If a problem persists, capture:

- The exact action or report name
- Whether the issue happens on one DC or all DCs
- The full toast or error banner text
- Whether OU scope filtering was enabled
- Whether the issue is read-only or write/elevation related
