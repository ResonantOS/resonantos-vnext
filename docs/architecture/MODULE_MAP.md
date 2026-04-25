# Module Map

Last updated: 2026-04-25

## Intent

This map defines which folder owns which feature area so contributors do not keep growing `App.tsx` or cross-wiring unrelated modules.

## Current Ownership

- `src/core/`
  - application contracts
  - persistence/runtime helpers
  - provider and archive policy helpers
  - cross-module state utilities
  - recovery routing and host-mediated Engineer service bridges

- `src/components/`
  - small reusable shell-level presentational primitives
  - currently `Panel`

- `src-tauri/src/host_state.rs`
  - app config storage
  - runtime state persistence
  - provider secret storage
  - add-on manifest validation/install persistence

- `src-tauri/src/provider_service.rs`
  - provider execution adapters
  - provider diagnostics
  - local runtime status/probing
  - archive ingest probe execution
  - recovery route candidate probing

- `src-tauri/src/archive_service.rs`
  - Living Archive runtime resolution from `ARCHIVE_CONFIG.json` + `VAULT_MAP.json`
  - host-owned System Architecture Memory status and refresh
  - SQLite-backed archive stats and recent activity
  - archive search
  - guarded archive document reads
  - intake artifact writes
  - ingest request queue writes
  - review queue reads
  - Strategist-owned ingest-review artifact generation for queued requests
  - archive approval-tier evaluation and persisted review decisions
  - approved review-artifact promotion into trusted wiki pages with backups

- `src-tauri/src/recovery_service.rs`
  - Engineer recovery turn loop
  - recovery tool boundary
  - bounded filesystem/search/command operations
  - recovery workspace root resolution

- `src/modules/chat/`
  - Strategist chat rail
  - message rendering
  - dictation support
  - chat execution controller
  - scoped Living Archive context retrieval for Strategist turns
  - chat-to-archive intake capture controller
  - composer attachment and dictation controller
  - chat-local types, icons, and utilities

- `src/modules/overview/`
  - current home/workbench overview surface
  - service snapshots
  - workspace framing
  - planned migration target: Home / Apps launcher defined in `docs/product/UX-001-resonantos-app-shell.md`

- `src/modules/strategist/`
  - Strategist identity and channel management surface
  - core agent overview
  - Strategist thread/channel controller

- `src/modules/archive/`
  - archive trust surfaces
  - runtime status surface
  - search and document read surface
  - `ArchiveReviewDesk` touch-friendly ingest queue, review artifact, approval, and promotion workflow
  - permission matrix
  - archive ingest probe controller
  - archive runtime/search/read/queue/approval controller
  - Audio2TOL intake analysis reference: `docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md`
  - memory domain architecture reference: `docs/architecture/ADR-013-living-archive-memory-domains.md`
  - system architecture memory reference: `docs/architecture/ADR-014-system-architecture-memory.md`
  - Library Importer surface for folder/vault import into Mixed Library staging or managed Human/External Knowledge domains

- `src/modules/addons/`
  - add-on catalog
  - manifest details
  - capability grant surface
  - add-on install/grant controller
  - planned launcher integration for opening installed add-ons in the center workspace

- `src/modules/settings/`
  - provider settings
  - shell defaults
  - configuration navigation
  - provider profile and diagnostics controller

- `src/modules/recovery/`
  - emergency recovery dashboard
  - recovery mode/session controller
  - recovery route promotion workflow

- `src/modules/shell/`
  - shell boot and hydration controller
  - recovery runtime surface bootstrapping
  - shell view/selectors for threads, routes, manifests, and top-level layout state

## Composition Rule

`src/App.tsx` is the shell composition root. It may:

- load state
- route sections to modules
- pass props and callbacks
- host top-level shell chrome

It should not own detailed feature rendering for module surfaces, large mutation workflows, or substantial derived-view selectors.

Guardrails:

- prefer module `controller.ts` files for orchestration/mutations
- prefer module `selectors.ts` files for heavy read-only derivation
- when `App.tsx` shrinks, update this map and the backlog in the same change
- if `App.tsx` grows again, treat that as drift to fix, not as the new normal

## Next Moves

- redesign the shell around `docs/product/UX-001-resonantos-app-shell.md`
- split shell chrome into reusable layout primitives for left rail, center workspace, and chat rail
- replace the settings-like Overview surface with a Home / Apps launcher
- add active workspace state for center-launched add-ons
- add module-local tests for `overview`, `strategist`, `archive`, `addons`, and `settings`
- continue shrinking shell-owned orchestration logic, especially remaining state commit/update helpers and top-level shell wiring in `src/App.tsx`
- introduce clearer IPC boundaries as Rust-side services expand
- continue evolving trusted wiki promotion from whole-page generated writes into schema-aware merge workflows
- split any future oversized Rust host module before it regains mixed persistence + execution + recovery concerns
