# Architecture Audit: 2026-04-26

## Scope

Audit the current ResonantOS vNext implementation against the agreed standards:

- modular code ownership from `ADR-002`
- engineering standards from `ADR-003`
- Rust/IPC boundary from `ADR-009`
- Living Archive host boundaries from `ADR-007`, `ADR-011`, `ADR-012`, `ADR-013`, and `ADR-014`
- current ownership map in `MODULE_MAP.md`

## Current State

### Backend Archive Host

The Living Archive backend has been split into focused modules:

- `src-tauri/src/archive_service.rs`
  - remaining host surface for archive stats, search, document reads, intake writes, and ingest queue writes
- `src-tauri/src/archive_service/archive_runtime.rs`
  - config discovery, vault map loading, allowed roots, runtime status, and ingest-agent status
- `src-tauri/src/archive_service/archive_source_library.rs`
  - source folder scanning, source-watch indexing, managed library imports, imported-library manifests, and mixed-library classification artifacts
- `src-tauri/src/archive_service/archive_review.rs`
  - ingest-review artifact generation, approval decisions, trusted wiki promotion, backups, and SQLite index updates
- `src-tauri/src/archive_service/archive_system_memory.rs`
  - host-owned ResonantOS architecture memory before user knowledge intake
- `src-tauri/src/archive_service/archive_tol_bundles.rs`
  - Audio2TOL/TOL bundle discovery and intake queueing without trusted wiki writes

Measured size after split:

- `archive_service.rs`: 1749 lines
- `archive_review.rs`: 1027 lines
- `archive_source_library.rs`: 880 lines
- `archive_system_memory.rs`: 409 lines
- `archive_runtime.rs`: 393 lines
- `archive_tol_bundles.rs`: 324 lines

Assessment: backend archive ownership is now acceptable for continuing feature work. `archive_review.rs` is close to the next split threshold and should be watched if trusted promotion grows.

### Frontend Shell And Workspaces

Large frontend surfaces remain:

- `src/App.tsx`: 1157 lines
- `src/modules/archive/ArchiveWorkspace.tsx`: 966 lines
- `src/styles/shell.css`: 957 lines
- `src/modules/archive/archive.css`: 898 lines

Assessment: these are the next architecture risks. They do not block the backend archive cleanup, but new UI work should not increase these files substantially. New archive UI behavior should move into smaller components/controllers under `src/modules/archive/`. New shell styling should be split by surface or interaction type under `src/styles/`.

## Drift Check

No runtime hard-coded personal archive paths should remain in the archive host implementation. Absolute paths that appear in tests or historical notes must be treated as fixtures, not product defaults.

- docs that cite inspected local source material
- frontend tests using fixture paths

Assessment: acceptable. The cross-platform runtime rule is preserved.

The new archive modules include intent citations to the relevant ADRs. The parent module still carries the Living Archive boundary citations.

## Validation Snapshot

Validation passed after the runtime/config extraction:

- `cargo fmt --check`
- `cargo test`: 35 passed
- `npm test`: 77 passed
- `npm run build`
- `npm run tauri:build`

Known non-blocking warning:

- Vite reports the production JS chunk is larger than 500 kB.

## Recommendation

Commit the backend archive modularization as a coherent checkpoint before starting new feature work.

Recommended commit scope:

- archive backend module split
- module map update
- feature backlog update
- this audit document

Do not mix the next product feature into this commit.

## Next Work

Best next feature after the commit:

- resume Living Archive product work with the folder/vault source model
- add a clearer source registry UI for connected folders/vaults
- keep folder scanning/import behavior host-mediated through the existing archive APIs

Best next refactor if continuing architecture work instead:

- split `ArchiveWorkspace.tsx` into smaller archive workspace components before adding more Living Archive UI
- split `archive.css` into smaller CSS files aligned with those components
