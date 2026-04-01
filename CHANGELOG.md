# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-03-31

### Changed
- Added a frameless custom Tauri title bar with integrated minimize, maximize, close, drag, and double-click maximize behavior
- Improved input-field behavior across credential, settings, search, and password flows to prevent overlapping placeholder and autofill text
- Polished the dashboard donut chart to remove the stray focus outline and active-sector hover artifact

### Fixed
- Hardened the custom window shell capability configuration so the title bar controls and drag behavior work reliably in packaged builds

## [0.1.0] - 2026-03-30

### Added
- Initial public release of the Fuzzy Forest desktop application
- Windows-native Active Directory dashboard, directory browser, and report workflows
- Read-only integrated-auth directory access with on-demand elevation for write actions
- Persistent day-scoped read caching, dashboard lazy loading, and paginated object grids
- Settings for launch-at-startup, OU scoping, and preferred elevation username
- Open-source repository documentation, MIT licensing, GitHub templates, and CI
