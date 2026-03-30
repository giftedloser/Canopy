# Fuzzy Forest

[![CI](https://github.com/giftedloser/FuzzyForest/actions/workflows/ci.yml/badge.svg)](https://github.com/giftedloser/FuzzyForest/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Fuzzy Forest is a Windows-native Active Directory management desktop app built with Tauri, React, TypeScript, and Rust. It is designed for administrators who want a fast, modern interface for common directory work without living in legacy MMC tools all day.

## Highlights

- Integrated Windows-authenticated read access for routine directory lookup
- On-demand elevation for write operations such as password resets and account changes
- Dashboard with operational metrics, clickable drill-downs, and report shortcuts
- Users, Computers, Groups, Directory, Reports, and Settings workflows
- Persistent day-scoped read caching with targeted refresh
- OU scoping, command palette search, and keyboard-friendly navigation
- Launch-at-startup support for desktop deployment scenarios

## What It Does

Fuzzy Forest focuses on everyday Active Directory administration:

- Browse and search users, computers, and groups
- Open detailed object views
- Unlock users, reset passwords, and enable or disable accounts
- Create users and groups
- Manage group membership
- Run focused reports such as locked accounts, inactive users, empty groups, and large groups
- Limit the visible directory scope to selected organizational units

## Requirements

| Requirement | Notes |
| --- | --- |
| Operating system | Windows 10 or Windows 11 |
| Directory environment | Domain-joined machine with access to Active Directory |
| PowerShell | Windows PowerShell 5.1 or later |
| RSAT | Active Directory module must be installed |
| Runtime | WebView2 |
| Tooling for development | Node.js 20+, npm 10+, Rust stable |

Install RSAT if needed:

```powershell
Add-WindowsCapability -Online -Name Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0
```

## Quick Start

### Development

```bash
npm install
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

### Production Build

```bash
npm run tauri:build
```

Installer bundles are generated under `src-tauri/target/release/bundle/`.

## Security Model

Fuzzy Forest is intentionally split between low-friction reads and explicit writes:

- Read operations use the current Windows session and do not prompt for credentials.
- Write operations require an elevation prompt for a privileged account.
- Passwords are used per operation and are not persisted.
- PowerShell input is sanitized before command construction.
- Report types are allowlisted on the backend.

For the full model, see [docs/security-model.md](docs/security-model.md) and [SECURITY.md](SECURITY.md).

## Performance Notes

The app is optimized for real-world directory usage:

- React routes and dashboard charts are lazy-loaded
- Read queries are cached and persisted for the day
- The top refresh action is scoped instead of globally refetching everything
- Read-only PowerShell commands reuse a long-lived session with fallback to isolated one-shot execution
- Large object grids use server paging instead of silently truncating at 500 rows

## Project Structure

```text
.
├── src/                     # React application
├── src-tauri/               # Tauri + Rust backend
├── docs/                    # Project documentation
├── .github/                 # CI and community templates
├── package.json             # Frontend scripts and metadata
└── README.md
```

## Documentation

- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [Security Model](docs/security-model.md)
- [Release Process](docs/releasing.md)
- [Contributing](CONTRIBUTING.md)

## Status

Fuzzy Forest is usable today and structured for continued development. It is currently Windows-first and intentionally optimized for Active Directory administration rather than generic LDAP directory management.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and keep the security boundaries intact when changing the read/write path.

## License

This project is licensed under the [MIT License](LICENSE).
