# Releasing

## Release Checklist

1. Update version numbers in:
   - `package.json`
   - `package-lock.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
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
git tag -a v<version> -m "Release v<version>"
```

6. Push the branch and tag:

```bash
git push origin main
git push origin v<version>
```

7. Draft or publish the GitHub release using the generated installer assets from `src-tauri/target/release/bundle/`.
8. Verify the release title, notes, and installer names all reflect the current Canopy version.

## Prerelease Notes

- For MSI targets, use numeric prerelease identifiers such as `1.0.0-1`
- Call prerelease builds `RC1`, `RC2`, and so on in release titles or notes if you want friendlier external wording
- Mark GitHub prereleases explicitly before public GA

## Suggested Release Notes Sections

- Highlights
- Notable fixes
- Security notes
- Installation requirements
- Upgrade notes
