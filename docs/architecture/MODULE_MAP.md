# Module Map

Last updated: 2026-05-01

## Intent

This map defines which folder owns which feature area so contributors do not keep growing `App.tsx` or cross-wiring unrelated modules.

## Current Ownership

- `src/core/`
  - application contracts
  - persistence/runtime helpers
  - provider and archive policy helpers
  - neutral memory-provider broker in `memory-provider.ts`, including Living Archive and `http-json` memory adapters
  - Delegation Packet contracts, validation, and `TASK.md` rendering
  - cross-module state utilities
  - recovery routing and host-mediated Engineer service bridges

- `src/sdk/addons/`
  - Add-on SDK V0 entrypoint
  - manifest validation for bundled and sideloaded add-ons
  - stable capability, service protocol, and tool contract exports
  - authority consistency checks for archive scopes, provider profiles, and embedded UI capabilities
  - replacement-slot capability validation for `chat-interface` and `memory-provider`
  - architecture reference: `docs/architecture/ADR-018-addon-sdk-v0.md`
  - no-lock-in kernel/add-on reference: `docs/architecture/ADR-026-minimal-kernel-replaceable-default-addons.md`

- `src/components/`
  - small reusable shell-level presentational primitives
  - currently `Panel`

- `src-tauri/src/host_state.rs`
  - app config storage
  - runtime state persistence
  - provider secret storage
  - add-on manifest validation/install persistence
  - host-side add-on capability gate helper used by privileged IPC commands
  - migration target: Portable User State Root resolution and encrypted secure vault mediation from `docs/architecture/ADR-022-portable-user-state-secure-vault.md`

- `src-tauri/src/obsidian_service.rs`
  - Obsidian V1 vault bridge host boundary
  - user-approved vault/markdown-folder status checks
  - scoped markdown note listing and read-only note preview reads
  - clean-room Resonant Notes vault indexing for search, tags, wikilinks, and backlinks
  - validated `obsidian://open` note handoff for returning the user to their external Obsidian editor
  - conservative `obsidian_write_note` host command with stale-save protection, pre-write version snapshot, and audit record
  - path traversal guards and internal-folder exclusions
  - planned ADR-019 write/search/link commands must stay here or in a dedicated `obsidian_service/` split before editing is enabled

- `src-tauri/src/opencode_service.rs`
  - optional OpenCode add-on host boundary
  - detects `opencode` without making it a core dependency
  - launches/stops scoped `opencode web` or `opencode serve` sessions after add-on grants
  - architecture reference: `docs/architecture/ADR-021-opencode-addon-hosted-service.md`

- `src-tauri/src/paperclip_service.rs`
  - optional Paperclip add-on host boundary
  - checks `npx`/Paperclip availability without making Paperclip a core dependency
  - connects/disconnects an existing local Paperclip loopback endpoint after `network` and `ui-embedding` grants
  - restricts V0 embedding to `http://localhost` or `http://127.0.0.1` endpoints
  - intentionally does not run broad install/start shell commands yet; managed setup remains behind the Engineer setup runbook
  - planned next bridge: list companies, agents, and issues through a host-mediated API connector
  - planned next bridge: map ResonantOS Delegation Packets to Paperclip issues
  - planned next bridge: collect Paperclip artifacts into Living Archive intake only
  - architecture reference: `docs/architecture/ADR-028-paperclip-addon-organizational-runtime.md`

- `src-tauri/src/browser_service.rs`
  - Browser add-on host boundary
  - Chromium engine discovery and launch
  - Chromium engine install/status checks through the host command boundary
  - persistent CDP sessions for open URL, read title/final URL, refresh screenshot evidence, read page text/links, close session, and return audit events
  - rejects local `file:` URLs until Browser has an explicit filesystem capability policy
  - capability-facing architecture reference: `docs/architecture/ADR-017-resonant-browser-addon.md`

- `src-tauri/src/delegation_service.rs`
  - execution-free task workspace creation
  - task workspace reads for explicit worker start flows
  - task workspace result, verification, and audit finalization
  - `delegation.packet.json` and generated `TASK.md` persistence
  - initial result, verification, artifact, and audit-log scaffolding

- `src-tauri/src/provider_service.rs`
  - provider execution adapters
  - provider diagnostics
  - local runtime status/probing
  - archive ingest probe execution
  - recovery route candidate probing

- `src-tauri/src/archive_service.rs`
  - SQLite-backed archive stats and recent activity
  - privileged IPC callers are gated in `src-tauri/src/lib.rs` by active `addon.living-archive` grants before this service executes
  - archive search
  - guarded archive document reads
  - intake artifact writes
  - ingest request queue writes
  - review queue reads
  - generated `index.md` and `log.md` navigation refresh
  - deterministic lint, provider-backed semantic lint, and semantic repair-source queueing
  - `background-cycle` orchestration for source scan, queueing, maintenance, navigation refresh, and lint

- `src-tauri/src/archive_service/archive_runtime.rs`
  - Living Archive runtime resolution from `ARCHIVE_CONFIG.json` + `VAULT_MAP.json`
  - vault root, managed memory root, wiki root, intake root, review root, and allowed-root policy
  - runtime status payload assembly for the Tauri command surface
  - ingest-agent config/prompt status reporting

- `src-tauri/src/archive_service/archive_system_memory.rs`
  - host-owned System Architecture Memory source collection
  - deterministic system memory page rendering
  - system memory manifest status/staleness checks

- `src-tauri/src/archive_service/archive_source_library.rs`
  - source folder scan and watch-index handling
  - managed library imports into Human Knowledge, External Knowledge, AI Memory, or Mixed Library
  - imported-library manifests and classification-review artifacts
  - plan-only mixed-library reorganisation artifacts with rollback and audit paths
  - explicit rejection of destructive move-on-import until audited execution exists

- `src-tauri/src/archive_service/archive_tol_bundles.rs`
  - optional Audio2TOL add-on bridge for TOL session discovery
  - raw audio, transcript, analysis, and processing-metadata bundle construction
  - add-on-facing TOL intake queueing without trusted wiki writes

- `src-tauri/src/archive_service/archive_review.rs`
  - Strategist-owned ingest-review artifact generation for queued requests
  - large text source chunk staging and conservative non-text attachment stubs
  - separate ingest writer and verifier provider/model execution fields
  - archive approval-tier evaluation and persisted review decisions
  - approved review-artifact promotion into trusted wiki pages with backups
  - trusted wiki page rendering, backups, section-aware markdown merge, superseded-section provenance, and SQLite index updates

- `src-tauri/src/recovery_service.rs`
  - Engineer recovery turn loop
  - recovery tool boundary
  - bounded filesystem/search/command operations
  - recovery workspace root resolution

- `src/modules/chat/`
  - current first-party implementation behind the `addon.augmentor-chat` slot
  - Strategist/Augmentor chat rail gated by active `chat-interface`
  - native floating chat surface loaded through `?surface=floating-chat`
  - message rendering
  - dictation support
  - chat execution controller
  - chat thread mutation controller for branching, deleting, editing, pinning, compaction, agent switching, and interruption
  - explicit Augmentor-to-Engineer delegation workspace creation and start bridge
  - planned context budget and compaction UI from `docs/architecture/ADR-016-context-memory-compaction.md`
  - scoped Living Archive context retrieval for Strategist turns
  - chat-to-archive intake capture controller
  - composer attachment and dictation controller
  - chat-local types, icons, and utilities

- `src/modules/chat/*.css`
  - chat message, composer, and right-rail styling

- `src/modules/browser/`
  - Resonant Browser add-on workspace
  - active browser-only center workspace surface
  - controlled Chromium evidence surface with URL bar, refresh, close, status, and error overlays
  - capability-gated network/UI embedding/browser-control state
  - Browser engine action reference: `docs/architecture/ADR-017-resonant-browser-addon.md`

- `browser-first/`
  - browser-first Chromium product preview from `docs/architecture/ADR-037-browser-first-chromium-resonantos.md`
  - `host/run-browser-first.mjs` owns browser-first launch orchestration, extension discovery, route registration, and host process lifecycle
  - `host/bridge-server.mjs` owns loopback bridge authentication, JSON routing, generated side-panel bridge config, and bridge auth self-test
  - `resonantos-side-panel-extension/` owns the Augmentor browser side-panel UI, page content bridge, and browser-control extension layer
  - `resonantos-side-panel-extension/src/lib/bridge-client.js` owns authenticated loopback bridge calls from the extension UI
  - `resonantos-side-panel-extension/src/lib/browser-command-parser.js` owns pure natural-language browser command parsing and URL/query normalization
  - `resonantos-side-panel-extension/src/lib/approval-policy.js` owns planner/next-action sanitization and human approval boundary classification
  - `resonantos-side-panel-extension/src/lib/agent-control-planner.js` owns pure Agent Control step labels, deterministic plan generation, dedupe, and fallback next-action selection
  - generated `resonantos-side-panel-extension/src/bridge-config.generated.js` is session material and must not be committed
  - preview bridge rule: per-session token is acceptable for internal testing, but ADR-037 requires native messaging, signed IPC, or equivalent authenticated browser-shell IPC before public wallet/DAO readiness

- `src/modules/paperclip/`
  - Paperclip optional add-on workspace
  - local endpoint status and connection controls
  - center workspace embedded Paperclip UI
  - capability-gated local network and UI embedding state
  - V0 connector-only surface; setup/install automation must go through the Engineer runbook until reviewed host setup commands are implemented
  - organizational runtime reference: `docs/architecture/ADR-028-paperclip-addon-organizational-runtime.md`

- `src/modules/archive/archive.css`
  - Living Archive workspace, review, search, reader, and import styling

- `src/modules/recovery/recovery.css`
  - emergency recovery dashboard and recovery-mode styling

- `src/styles/`
  - global variables/reset, shell chrome, shared workspace cards, and responsive cascade rules

- `src/modules/delegation/`
  - Delegation Monitor center workspace
  - host-owned task workspace listing
  - selected task result and verification review
  - touch-friendly task selection and explicit start controls
  - supervision surface only; Augmentor remains the delegation manager

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
  - current first-party implementation behind the `addon.living-archive` slot
  - archive trust surfaces gated by `addon.living-archive` as the active `memory-system`
  - stable memory actions are called through the active memory-provider broker; Living Archive-only source import/TOL tools remain local to this workspace
  - if another memory add-on owns the slot, the shell shows a replacement-provider message instead of rendering the Living Archive workspace
  - runtime status surface
  - `ArchiveSearchPanel` trusted wiki/source search and source queueing surface
  - `ArchiveSourceScanResults` mapped-source scan result and review queueing surface
  - `ArchiveAudio2TolIntake` optional Audio2TOL add-on bridge surface; hidden unless `addon.audio2tol` is installed and enabled
  - `ArchiveDocumentReader` guarded document read surface
  - `ArchiveRecentActivity` archive activity feed
  - `ArchiveDiagnostics` runtime paths, permission matrix, ingest route probe, deterministic lint, and semantic lint surface

- `examples/`
  - sideloadable reference add-on manifests and local services used to prove replacement contracts
  - `examples/addons/reference-memory.json`
  - `examples/reference-memory-service.mjs`
  - `examples/living-archive-mcp.mjs`
    - standalone stdio MCP bridge for external clients that need scoped Living Archive and memory-provider tools
    - V1 live mode proxies `RESONANTOS_MEMORY_SERVICE_URL` / `--memory-service-url` to the host-mediated `POST /memory/{operation}` contract
    - portable fallback points at `ResonantOS_User/Memory` through `RESONANTOS_MEMORY_ROOT` or `--memory-root`
    - cannot write trusted AI Memory wiki pages directly; portable writes are restricted to intake and review-request artifacts, while live trusted promotion must go through approved host review artifacts
    - architecture reference: `docs/architecture/ADR-029-living-archive-mcp-bridge.md`
  - `examples/living-archive-memory-service.mjs`
    - loopback HTTP memory service for the portable `ResonantOS_User/Memory` folder
    - implements the V1 `POST /memory/{operation}` contract for status/search/read/intake/ingest-request/review-listing/lint
    - deliberately rejects provider-only trusted promotion and semantic operations until those are mediated by the full desktop host provider
    - lets MCP clients point `RESONANTOS_MEMORY_SERVICE_URL` at a real ResonantOS-owned local endpoint instead of a mock
  - `src-tauri/src/memory_service.rs`
    - host-owned launcher for the Living Archive local memory service
    - resolves the canonical Portable User State memory root, starts/stops the Node service on loopback, and reports endpoint/session status through narrow IPC commands
  - `src/modules/settings/SettingsWorkspace.tsx`
    - Memory Bridge section exposes start/stop/status controls for the local memory service
  - `ArchiveReviewDesk` touch-friendly ingest queue, review artifact, approval, and promotion workflow
  - `ArchiveSourceRegistry` imported-library and mapped-source registry
  - `ArchiveLibraryImporter` folder/vault import surface
  - `ArchiveClassificationReviewPanel` host-owned classification and plan-only reorganisation surface
  - permission matrix
  - archive ingest probe controller
  - archive runtime/search/read/queue/approval controller
  - background sync controller that runs source scan, queueing, maintenance, promotion, navigation refresh, and lint through the active memory-provider broker
  - Audio2TOL intake analysis reference for the optional Audio2TOL add-on bridge: `docs/architecture/AUDIO2TOL_INTAKE_ANALYSIS.md`
  - memory domain architecture reference: `docs/architecture/ADR-013-living-archive-memory-domains.md`
  - system architecture memory reference: `docs/architecture/ADR-014-system-architecture-memory.md`
  - portable user-state root reference: `docs/architecture/ADR-022-portable-user-state-secure-vault.md`

- `src/modules/addons/`
  - add-on catalog
  - manifest details
  - capability grant surface
  - Browser setup surface for explicit grants and Chromium engine installation/status
  - `ObsidianAddonPanel` V1 vault bridge for selecting, scanning, and previewing markdown notes
  - `ObsidianAddonSections` owns the vault bridge presentational sections so the panel controller does not become a UI monolith
  - `obsidian-addon-model` owns Obsidian sync-state, prompt, slug, and raw-intake serialization helpers
  - Augmentor note-action handoff for read-only Obsidian summaries, organization proposals, and archive-intake planning
  - manual changed-note refresh after external Obsidian edits, with explicit queueing still required
  - selectable changed/new note review list with deterministic change reasons before batch queueing into raw intake
  - capability-gated Obsidian note copy into raw Living Archive intake with explicit confirmation
  - capped batch queueing for scanned Obsidian notes into raw intake, still review-gated
  - local sync index for new, changed, and queued-unchanged vault-note state
  - recent Obsidian intake history and focused review-desk navigation
  - planned ADR-019 Obsidian workspace shell should split into `ObsidianWorkspace`, `ObsidianVaultTree`, `ObsidianEditor`, `ObsidianPreview`, and `ObsidianMetadataPanel`
  - add-on install/grant controller
  - delegation target metadata reference: `docs/architecture/ADR-015-delegation-fabric-addon-catalog-native-tools.md`
  - planned launcher integration for opening installed add-ons in the center workspace

- `src/modules/obsidian/`
  - ADR-019 central Obsidian-compatible workspace
  - ADR-020 clean-room Resonant Notes behavior over Markdown vaults
  - workspace gate for selected vault, filesystem grant, and `ui-embedding`
  - vault note list loaded through host-mediated commands
  - markdown editor and preview toggle
  - read-only note metadata panel for frontmatter, tags, and wikilinks
  - vault index panel for search results and selected-note backlinks
  - search result and backlink navigation uses the guarded workspace note-open path
  - Obsidian-reference workspace layout: compact tabs, left ribbon, one active sidebar view, central editor/preview, bottom status bar
  - dirty-state, discard, and audited save through `obsidian_write_note`
  - `obsidian-workspace-model` owns metadata parsing and preview rendering helpers
  - future split target: `ObsidianVaultTree`, `ObsidianEditor`, and `ObsidianPreview`

- `src/modules/opencode/`
  - optional OpenCode add-on workspace
  - compact toolbar and hidden settings drawer for installed runtime, scoped workspace path, and capability grants
  - embeds OpenCode's own web UI after host launch
  - does not replace Resonant Notes or trusted Living Archive ingest

- `src/modules/paperclip/`
  - development-only Paperclip organizational runtime workspace
  - excluded from the public default add-on catalog until an explicit future add-on release
  - embeds Paperclip's own UI after host-mediated connection to a local loopback endpoint
  - shows ResonantOS-owned health, grants, company/agent/issue summaries, and delegation handoff controls
  - must not duplicate Paperclip's full UI or bypass ResonantOS capability gates

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
  - ADR-026 replacement-slot resolution in `system-slots.ts`
  - first-run recommended add-on activation for Augmentor Chat and Living Archive
  - `chat-interface` and `memory-system` availability gates used by the shell
  - cross-window runtime-state event sync for main shell and floating chat surfaces

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
- evolve Obsidian from read-only vault bridge into the ADR-019 hosted Obsidian-compatible workspace after write/audit host commands exist
- evolve Browser from one-shot Chromium capture into a persistent controlled Chromium sidecar session
- add module-local tests for `overview`, `strategist`, `archive`, `addons`, and `settings`
- continue shrinking shell-owned orchestration logic, especially remaining state commit/update helpers and top-level shell wiring in `src/App.tsx`
- introduce clearer IPC boundaries as Rust-side services expand
- continue evolving trusted wiki promotion from whole-page generated writes into schema-aware merge workflows
- split any future oversized Rust host module before it regains mixed persistence + execution + recovery concerns
