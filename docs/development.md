# Development Guide

## Prerequisites

- Windows 10 or Windows 11
- Node.js 20 or newer
- npm 10 or newer
- Rust stable toolchain
- WebView2
- RSAT Active Directory PowerShell tools

## Install Dependencies

```bash
npm install
```

## Useful Commands

```bash
npm run dev
npm run build
npm run tauri:dev
npm run tauri:build
npm run cargo:check
```

## Recommended Validation Flow

Before opening a pull request:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
```

## Local Environment Notes

- Browser-only Vite mode is useful for UI iteration, but Active Directory calls only work in the Tauri desktop runtime.
- The desktop application assumes a Windows environment with AD connectivity.
- If you do not have RSAT installed, most backend commands will fail by design.

## Repository Hygiene

- Do not commit `dist/`, `node_modules/`, or `src-tauri/target/`.
- Do not commit private certificates, `.env` files, or captured credentials.
- Avoid embedding environment-specific domain names or admin usernames in docs or screenshots.

## Commit Recommendations

Keep commits focused and descriptive:

- `feat: add cached dashboard drill-down navigation`
- `fix: scope refresh to active route query families`
- `docs: clarify Windows and RSAT requirements`
