# Releasing

## Release Checklist

1. Update version numbers in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. Update `CHANGELOG.md`.
3. Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
npm run tauri:build
```

4. Commit the release preparation changes.
5. Create an annotated tag:

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
```

6. Push the branch and tag:

```bash
git push origin main
git push origin v0.1.0
```

7. Draft a GitHub release using the generated installer assets from `src-tauri/target/release/bundle/`.

## Suggested Release Notes Sections

- Highlights
- Notable fixes
- Security notes
- Installation requirements
- Upgrade notes
