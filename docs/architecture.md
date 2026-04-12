# Architecture

## Overview

Canopy is a Tauri desktop application with a React frontend and a Rust backend.
The frontend is responsible for routing, state management, caching, and UX. The backend owns the security boundary around PowerShell execution and Active Directory access.

## Frontend

Primary frontend responsibilities:

- Route-level UI for Dashboard, Users, Computers, Groups, Directory, Reports, and Settings
- Query management through TanStack Query
- UI state through Zustand stores
- Optimistic or stale-preserving refresh behavior where appropriate
- Desktop-only feature wiring for autostart and Tauri command invocation

Key characteristics:

- The dashboard shell is lazy-loaded and the heavier chart module is split out
- Query persistence is scoped to the active user, server, and domain context
- The top refresh action refetches relevant query families instead of all data globally

## Backend

The backend is implemented in Rust and exposed through Tauri commands.

Primary backend responsibilities:

- Discover and validate the Active Directory connection context
- Run read-only PowerShell directory queries
- Gate write operations behind explicit credentials
- Sanitize inputs before PowerShell command construction
- Return JSON payloads that the frontend can parse consistently

## Read Path

The read path is optimized for low-friction access:

1. The frontend calls a Tauri command with the selected domain controller context.
2. The backend sanitizes user input.
3. Read-only PowerShell commands run through a shared session to avoid per-read process startup cost.
4. If the shared read session fails, the backend falls back to the original isolated one-shot execution path.
5. Results are returned as JSON and persisted locally for the rest of the day.

This keeps the app fast without weakening the write boundary.

## Write Path

The write path is intentionally more conservative:

1. The frontend requests elevation for a specific action.
2. The user provides privileged credentials in the elevation dialog.
3. Credentials are used for that operation only.
4. The backend injects the credential block into the allowlisted PowerShell command.
5. Credentials are discarded after the request completes.

Write operations do not use the shared read session.

## Caching and Refresh

Caching is layered:

- In-memory query caching for navigation smoothness
- Day-scoped persisted query storage for repeat sessions
- Targeted refetch on user-triggered refresh

The goal is to feel immediate for normal navigation while still allowing administrators to refresh live directory state when needed.
