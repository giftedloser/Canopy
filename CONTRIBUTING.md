# Contributing

Thanks for contributing to Canopy.

## Before You Start

- This project targets Windows environments with Active Directory.
- The desktop app is built with Tauri, React, TypeScript, and Rust.
- Local development works best on a domain-joined Windows machine with the RSAT Active Directory module installed.

## Local Setup

1. Install Node.js 20+ and npm 10+.
2. Install the latest stable Rust toolchain.
3. Install the RSAT Active Directory PowerShell tools.
4. Run `npm install`.
5. Run `cargo check --manifest-path src-tauri/Cargo.toml`.
6. Run `npm run tauri:dev`.

## Development Guidelines

- Keep read paths fast and safe. Avoid broad domain scans unless the UX requires them.
- Preserve the security model: integrated auth for reads, explicit elevation for writes.
- Do not introduce credential persistence.
- Keep documentation up to date when behavior changes.
- Prefer small, reviewable pull requests.

## Commit Style

Use clear, conventional commit messages when possible:

- `feat: add OU-scoped directory browser improvements`
- `fix: preserve stale dashboard data during refresh`
- `docs: document release workflow`
- `chore: tighten repository ignore rules`

## Pull Request Checklist

- The change is scoped and explained clearly.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `npm run build` passes.
- Documentation is updated if the user-facing behavior changed.
- No secrets, private domain names, or environment-specific credentials are included.

## Reporting Security Issues

Do not open a public issue for credential-handling, injection, or privilege-boundary problems.
Follow the process in [SECURITY.md](SECURITY.md).
