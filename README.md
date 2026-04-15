<div align="center">
<img width="310" height="310" alt="Square310x310Logo" src="https://github.com/user-attachments/assets/53865f7c-a7d4-4f69-a950-cd6f0d217755" />

# Canopy

Modern Active Directory administration without MMC sprawl.

Users &nbsp;|&nbsp; Computers &nbsp;|&nbsp; Groups &nbsp;|&nbsp; OU Scoping

[![Latest Release](https://img.shields.io/github/v/release/giftedloser/Canopy?display_name=tag&sort=semver)](https://github.com/giftedloser/Canopy/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Windows](https://img.shields.io/badge/Windows-only-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![CI](https://github.com/giftedloser/Canopy/actions/workflows/ci.yml/badge.svg)](https://github.com/giftedloser/Canopy/actions/workflows/ci.yml)

<br />



---
</div>


## What is Canopy?

Canopy is a Windows-native desktop app for everyday Active Directory administration. It gives you one fast interface for browsing users, computers, groups, directory structure, and on-demand security or hygiene reports without bouncing between legacy consoles all day.

Built with Tauri 2, React 19, TypeScript, and Rust. Windows only. Powered by integrated Windows authentication for reads and explicit elevation for writes.

## Features

### Work the Directory Fast

- Browse users, computers, and groups with search, filters, sorting, and paging
- Open detailed object views without leaving the main workflow
- Use OU scoping to limit what the app surfaces
- Jump anywhere quickly with the command palette

### Admin Safely

- Read operations use the current Windows session
- Write operations require explicit elevation
- Passwords are never persisted
- Backend PowerShell input is sanitized before execution
- Report types are backend-allowlisted

### Stay Operational

- Dashboard cards drill into the exact users, reports, groups, or computers behind the metric
- Reports are organized into security, identity, device, and group sections so larger catalogs stay easy to scan
- Reports cover locked accounts, privileged accounts, stale privileged accounts, service accounts, delegation, SPN exposure, SIDHistory, old passwords, stale computers, outdated OS versions, empty groups, large groups, nesting depth, and more
- Launch-at-startup support is built into Settings
- Manual refresh is scoped so you can pull live directory state without reloading everything

### Feel Native

- Desktop app, not a browser wrapper pretending to be an admin console
- Lazy-loaded routes and chart views for better perceived performance
- Connection-scoped local caching with bounded TTLs for fast repeat use without staying stale all day
- Keyboard-friendly navigation patterns throughout the UI

## Requirements

| Requirement | Notes |
| --- | --- |
| OS | Windows 10 or Windows 11 |
| Directory environment | Domain-joined machine with Active Directory access |
| PowerShell | Windows PowerShell 5.1 or later |
| RSAT | Active Directory module must be installed |
| Runtime | WebView2 |
| Dev tooling | Node.js 20+, npm 10+, Rust stable |

Install RSAT if needed:

```powershell
Add-WindowsCapability -Online -Name Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0
```

## Quick Start

### Install From Releases

Download `Canopy v1.0.3` directly:

- [MSI installer](https://github.com/giftedloser/Canopy/releases/download/v1.0.3/Canopy_1.0.3_x64_en-US.msi)
- [Setup executable](https://github.com/giftedloser/Canopy/releases/download/v1.0.3/Canopy_1.0.3_x64-setup.exe)
- [All releases](https://github.com/giftedloser/Canopy/releases)

1. Install on a Windows machine with WebView2, RSAT AD tools, and line-of-sight to your directory environment.
2. Launch Canopy and connect with integrated Windows authentication for reads.
3. Use the elevation prompt only for write actions like password resets, unlocks, group membership changes, and object moves.

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

Build artifacts are generated under `src-tauri/target/release/bundle/`.

## Tech Stack

- Tauri 2
- React 19
- TypeScript
- Rust
- TanStack Query
- TanStack Table
- Zustand
- Radix UI

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

## Security Model

Canopy is intentionally split between low-friction reads and explicit writes:

- Read operations use the current Windows session
- Write operations require an elevation prompt
- Passwords are used per operation and are not stored
- Input is sanitized before PowerShell command construction
- The shared read worker falls back to isolated execution on failure
- Cached query data is scoped to the connected domain, server, and user context

Read more in [docs/security-model.md](docs/security-model.md) and [SECURITY.md](SECURITY.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [Security Model](docs/security-model.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Release Process](docs/releasing.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE) &copy; LoserLabs
