<div align="center">
<img width="310" height="310" alt="Square310x310Logo" src="https://github.com/user-attachments/assets/53865f7c-a7d4-4f69-a950-cd6f0d217755" />

# Fuzzy Forest

Modern Active Directory administration without MMC sprawl.

Users &nbsp;|&nbsp; Computers &nbsp;|&nbsp; Groups &nbsp;|&nbsp; OU Scoping

[![Latest Release](https://img.shields.io/github/v/release/giftedloser/FuzzyForest?display_name=tag&sort=semver)](https://github.com/giftedloser/FuzzyForest/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![Windows](https://img.shields.io/badge/Windows-only-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![CI](https://github.com/giftedloser/FuzzyForest/actions/workflows/ci.yml/badge.svg)](https://github.com/giftedloser/FuzzyForest/actions/workflows/ci.yml)

<br />

<img src="https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white" alt="Windows" />

---
</div>


## What is Fuzzy Forest?

Fuzzy Forest is a Windows-native desktop app for everyday Active Directory administration. It gives you one fast interface for browsing users, computers, groups, reports, and directory structure without bouncing between legacy consoles all day.

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
- Reports cover locked accounts, inactive users, expiring passwords, never-logged-in users, empty groups, large groups, and more
- Launch-at-startup support is built into Settings
- Manual refresh is scoped so you can pull live directory state without reloading everything

### Feel Native

- Desktop app, not a browser wrapper pretending to be an admin console
- Lazy-loaded routes and chart views for better perceived performance
- Day-scoped persistent read caching for fast repeat use
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

Fuzzy Forest is intentionally split between low-friction reads and explicit writes:

- Read operations use the current Windows session
- Write operations require an elevation prompt
- Passwords are used per operation and are not stored
- Input is sanitized before PowerShell command construction
- The shared read worker falls back to isolated execution on failure

Read more in [docs/security-model.md](docs/security-model.md) and [SECURITY.md](SECURITY.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [Security Model](docs/security-model.md)
- [Release Process](docs/releasing.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE) &copy; LoserLabs
