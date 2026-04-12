# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-04-12

### Changed
- Moved Users and Computers grids onto backend paging and sorting instead of full snapshot sorting in the frontend
- Rebalanced query freshness and persisted cache lifetimes so directory data stays fast without remaining fresh indefinitely
- Made report catalog validation run with capped concurrency for faster audit passes

### Fixed
- Reduced Groups page latency by avoiding exact member-count work during normal browsing and hydrating visible counts separately
- Normalized query and cache-key handling across command search, groups lookup, and object grids
- Cleaned up Tauri invoke imports so production builds no longer emit the mixed static/dynamic `@tauri-apps/api/core` warning

## [0.1.5] - 2026-04-12

### Changed
- Refined the sidebar Canopy wordmark with the Comforter font, centered expanded layout, and a compact collapsed `C` state
- Removed extra sidebar divider lines and cleaned up header spacing so the wordmark fits without clipping

### Fixed
- Improved Users page search handling for username, `DOMAIN\user`, and UPN-style lookups
- Corrected sidebar wordmark overflow so descenders and collapsed alignment render cleanly

## [0.1.4] - 2026-04-12

### Added
- Added a read-only user attribute viewer tab with copy-friendly populated fields

### Fixed
- Restored user group membership display in the details sidebar with a `MemberOf` fallback path
- Corrected stale privileged account reporting so disabled privileged accounts are excluded again
- Increased search-field icon contrast and left padding to prevent placeholder overlap in icon-backed inputs

## [0.1.3] - 2026-04-06

### Added
- Expanded the reports catalog with AD-native security, identity, device, and group hygiene reports
- Added privileged account, service account, delegation, SPN, SIDHistory, adminCount, stale computer, outdated OS, and nesting-depth reporting

### Changed
- Organized the Reports page into light scan-friendly sections for security, identity, devices, and groups

### Fixed
- Tightened service-account output to include supported encryption details
- Scoped stale privileged account reporting to enabled privileged users for cleaner signal

## [0.1.2] - 2026-04-01

### Added
- Standardized right-click context actions for users, computers, and groups
- Shared action dialogs for moving AD objects between OUs and adding users to groups
- Backend move operations for user and computer objects

### Changed
- Group member actions now route through a more consistent context-driven flow

### Fixed
- Dashboard user-status donut tooltip now layers above the center total overlay
- User, computer, and group actions now refresh the relevant cached views after changes

## [0.1.1] - 2026-03-31

### Changed
- Added a frameless custom Tauri title bar with integrated minimize, maximize, close, drag, and double-click maximize behavior
- Improved input-field behavior across credential, settings, search, and password flows to prevent overlapping placeholder and autofill text
- Polished the dashboard donut chart to remove the stray focus outline and active-sector hover artifact

### Fixed
- Hardened the custom window shell capability configuration so the title bar controls and drag behavior work reliably in packaged builds

## [0.1.0] - 2026-03-30

### Added
- Initial public release of the Canopy desktop application
- Windows-native Active Directory dashboard, directory browser, and report workflows
- Read-only integrated-auth directory access with on-demand elevation for write actions
- Persistent day-scoped read caching, dashboard lazy loading, and paginated object grids
- Settings for launch-at-startup, OU scoping, and preferred elevation username
- Open-source repository documentation, MIT licensing, GitHub templates, and CI
