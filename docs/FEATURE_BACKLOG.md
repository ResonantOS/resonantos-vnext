# ResonantOS vNext Feature Backlog

Last updated: 2026-04-25

## Core Shell

- Added UI/UX product direction on 2026-04-25:
  - documented the ResonantOS app-shell target in `docs/product/UX-001-resonantos-app-shell.md`
  - default experience should become Home / Apps, not a settings-style overview
  - left and right rails must both be collapsible
  - center workspace should launch add-ons as apps
  - terminal/TUI add-ons such as OpenClaw and Hermes should open in the center as terminal workspaces
  - embedded add-ons such as Obsidian, OpenCode, and Browser should open in the center as embedded app workspaces
  - active workspaces should support full-screen mode over the ResonantOS chrome
- Completed on 2026-04-23:
  - extracted `chat`
  - extracted `archive`
  - extracted `addons`
  - extracted `settings`
  - extracted `overview`
  - extracted `strategist`
  - moved chat execution into `src/modules/chat/controller.ts`
  - moved archive probe execution into `src/modules/archive/controller.ts`
  - moved recovery mode/session actions into `src/modules/recovery/controller.ts`
  - moved Strategist thread/channel actions into `src/modules/strategist/controller.ts`
  - moved shell boot/hydration into `src/modules/shell/controller.ts`
  - moved shell-derived view state into `src/modules/shell/selectors.ts`
  - moved chat composer file/dictation behavior into `src/modules/chat/composer-controller.ts`
  - moved provider profile updates into `src/modules/settings/controller.ts`
  - moved add-on install/grant mutations into `src/modules/addons/controller.ts`
  - added `Resonant Engineer Agent` recovery runtime diagnostics
  - added host-mediated recovery tool loop for file reads, code search, targeted file edits, and safe command execution
  - split the Rust host into `host_state`, `provider_service`, and `recovery_service` modules
- Add module-local test files as each section moves out of `App.tsx`.
- Add a repo-level architecture map for module ownership.

## Strategist

- Real context accounting instead of shell-side character estimate.
- Conversation compaction and summary checkpoints.
- Multiple Strategist identities/channels beyond the current desktop baseline.
- Telegram channel integration.

## Chat Rail

- Added first safe interruption behavior:
  - Stop keeps a visible interrupted assistant message
  - stale provider replies are suppressed after interruption
  - host-side abort is requested when the selected route declares abort support
- Added first streaming capability policy:
  - provider execution adapters now declare streaming and abort support
  - chat only uses streaming when the selected route supports it
  - the activity rail distinguishes streamed replies from generic thinking
- Desktop-safe audio dictate implementation.
- Attachment pipeline beyond text embedding and metadata fallback.
- Richer thread management for multiple Strategist instances.

## Context Memory

- Added architecture policy on 2026-04-25:
  - `ADR-016` defines host-owned Context Memory Compaction
  - raw chat transcripts remain append-only and recoverable
  - compact state must preserve decisions, preferences, facts, open tasks, artifacts, risks, and recent turns
  - compaction must be source-linked, auditable, and provider-independent
  - provider-native compaction and prompt caching are optimizations, not memory authority
- Implemented first compaction foundation on 2026-04-25:
  - provider-aware heuristic context budget replaces the visual-only character estimate
  - custom/forked threads survive runtime normalization
  - append-only transcript ledger records visible chat mutations and compaction events
  - deterministic compact-state generation preserves user intent, rationale, tasks, decisions, preferences, artifacts, risks, and questions
  - context percentage control runs `Compact now` for the active thread
  - provider prompt assembly includes compact memory plus preserved recent/new turns after compaction
  - automatic compaction runs before provider calls when effective context reaches the 80% threshold
- Ensure chat branching copies compact state and source references, not only visible messages.

## Living Archive

- Completed on 2026-04-23:
  - added a real host-mediated archive service in `src-tauri/src/archive_service.rs`
  - added archive runtime resolution from `ARCHIVE_CONFIG.json` + `VAULT_MAP.json`
  - added SQLite-backed archive stats and recent activity reads
  - added real archive search and guarded document reads
  - added intake artifact writes and ingest-request queue writes
  - added review queue reads and review-artifact processing for queued ingest requests
  - added archive approval-tier evaluation and persisted review decisions for review artifacts
  - added approved review-artifact promotion into trusted wiki pages with backup-on-overwrite, SQLite index upsert, and append-only provenance merge for existing pages
  - connected Strategist chat turns to Living Archive context retrieval through scoped host-mediated search/read
  - added visible archive citation pills on Strategist replies that used retrieved archive pages
  - added chat-to-archive intake capture so assistant replies can be saved as `chat-insights` and queued for review
  - upgraded the Archive workspace from policy-only to runtime + search + reader surfaces
  - split the Archive Review Desk into a module-owned touch-friendly workflow for queue processing, proposed-page review, approval, and trusted wiki promotion
  - documented the real Audio2TOL output shape and TOL bundle requirements in `AUDIO2TOL_INTAKE_ANALYSIS.md`
  - added host-mediated Audio2TOL bundle detection and intake queuing for raw audio, transcript, protocol analysis, and processing metadata
  - added a touch-friendly Audio2TOL bundle queue surface in the Archive workspace
  - added host-mediated source folder scanning with file fingerprinting and new/changed/unchanged detection for mapped raw and derived source roots
  - added Archive workspace controls for source folder scans, changed/new source review, and selected source queueing
- Added architecture policy on 2026-04-23:
  - tiered approval model in `ADR-012` so archive promotion defaults to Strategist review instead of blanket human review
- Added architecture policy on 2026-04-24:
  - memory domains and library import model in `ADR-013`
  - Human Knowledge, External Knowledge, and AI Memory are first-class domains
  - Mixed Library is a staging state for AI-assisted classification, not a final memory domain
  - non-Obsidian folders use Obsidian-compatible frontmatter, tags, and wikilinks by default
  - copy-on-import is default, move-on-import is explicit, reference-in-place is advanced/temporary
  - managed Living Archive copy becomes the canonical knowledge base after import
  - source versioning should use local Git-style history plus structured metadata
- Added first Library Importer implementation on 2026-04-24:
  - connect a folder or Obsidian vault path from the Archive workspace
  - choose Mixed Library, Human Knowledge, or External Knowledge
  - choose copy, move, or reference import mode
  - create a managed canonical source location under the selected memory domain
  - write first-version records, classification status, metadata standard, Obsidian detection, and an import manifest with source hashes
- Added first classification review and folder picker implementation on 2026-04-24:
  - native desktop folder picker through the Tauri dialog plugin
  - deterministic first-pass Mixed Library classification proposals
  - proposed ownership tags, source-type tags, review tags, and wikilinks
  - explicit user approval before future reorganisation commands are allowed to move files
- Added host-owned classification and version artifacts on 2026-04-25:
  - Mixed Library imports now write `library-classification-review` artifacts from the archive host service
  - frontend classification previews consume host-returned proposals instead of generating their own authority
  - imported libraries now write a JSONL source-version ledger next to the import manifest
  - archive host now exposes imported-library registry reads from persisted manifests
- Added System Architecture Memory foundation on 2026-04-25:
  - `ADR-014` defines host-owned ResonantOS architecture memory available before user knowledge intake
  - archive host now exposes `archive_system_memory` and `archive_refresh_system_memory`
  - deterministic system pages are generated under `Memory/AI_MEMORY/system`
  - source-hash manifest is generated under `Memory/AI_MEMORY/provenance/system-memory-manifest.json`
  - Strategist and Resonant Engineer chat prompts now load System Architecture Memory before normal user archive context
- Continue Library Importer:
  - add user confirmation for move-on-import before files are moved
  - upgrade the JSONL source-version ledger into local Git-style source history where appropriate
  - expose imported libraries as first-class cards with rescan/sync controls using the host registry
  - upgrade deterministic host-owned classification artifacts into Strategist-owned model review artifacts
- Add optional background folder watching on top of the deterministic source scan command.
- Scoped add-on archive read/write flow.
- Replace append-only provenance merge with deeper section-level semantic merge logic.

## Add-on Platform

- Added architecture policy on 2026-04-25:
  - `ADR-015` defines Delegation Packets as the source of truth for delegated tasks
  - `TASK.md` is now an interoperability artifact generated from structured delegation state
  - Augmentor is defined as the executive interface, not default worker
  - Engineer is defined as the repair specialist with audited stronger tools
  - Obsidian, Browser, OpenCode, Hermes, and OpenClaw are the first add-on catalog targets
  - LangGraph is a candidate orchestration backend for durable delegated workflows, while Mangle/Shield-style checks remain deterministic policy enforcement
- Added Delegation Packet foundation on 2026-04-25:
  - core contracts now define `DelegationPacket`, `DelegationTarget`, `TaskWorkspace`, `ArtifactReturn`, native tool capabilities, verification requirements, and validation results
  - `src/core/delegation.ts` validates delegation packet quality and renders generated `TASK.md`
  - add-on manifests now expose delegation metadata for Obsidian, Browser, OpenCode, Hermes, and OpenClaw
- Added Task Workspace foundation on 2026-04-25:
  - Rust host now exposes `delegation_create_task_workspace`
  - validated packets can create execution-free task workspace folders under app-owned storage
  - task workspaces write `delegation.packet.json`, generated `TASK.md`, artifacts/log/result/verification placeholders, and an audit log
  - the Resonant Engineer Agent is exposed as the first native delegation target so Augmentor can delegate before external add-ons are wired
- Added first Augmentor-to-Engineer delegation path on 2026-04-25:
  - explicit Strategist chat requests such as "delegate this diagnostic to the Engineer" create a validated Engineer Delegation Packet
  - the chat creates the task workspace and reports the packet/TASK paths back to the user
  - execution remains separate from workspace creation so Augmentor cannot accidentally trigger worker action
- Added first bounded Engineer task start path on 2026-04-25:
  - explicit Strategist chat requests such as "start engineer task workspace-id" read an existing task workspace
  - the task is sent to the Resonant Engineer Agent through the existing audited recovery turn loop
  - the host writes `result.md`, `verification.json`, and `logs/audit.jsonl` back into the task workspace
  - this is still a narrow v1 bridge; no external add-on worker dispatch has been enabled yet
- Added first Delegation Monitor UI on 2026-04-25:
  - new left-nav Delegation workspace lists host-owned task workspaces
  - users can start an Engineer task from the center workspace without typing the command phrase
  - the monitor exposes packet, task, result, verification, artifacts, and audit paths
  - Augmentor remains the delegation manager; the monitor is only the supervision/control surface
- Build add-on launcher UX from `docs/product/UX-001-resonantos-app-shell.md`.
- Continue Delegation Monitor with result preview, verification status parsing, and Promote/Archive controls.
- Add center-workspace app opening state for installed add-ons.
- Add workspace renderers for add-on runtime types:
  - embedded app
  - terminal/TUI app
  - agent workspace
  - channel/background service status
- Runtime lifecycle manager.
- Capability grant UX.
- SDK documentation.
- Sidecar isolation model and health monitoring.
- Implement ADR-006 contracts in `src/core/` and host services.

## Security and Web3

- Wallet integration architecture.
- Secure signing flow in Rust.
- Capability separation for blockchain actions.
- Implement ADR-008 and ADR-009 service boundaries.

## Provider Fabric

- Expand current flattened provider profiles into provider profiles + runtime nodes + routing decisions.
- Add supported / experimental / unavailable status handling.
- Add resurrect / panic local fallback flow.
- Implement ADR-005 policy engine contracts.
- Extend the current recovery tool loop into remote runtime nodes and cloud-promotion paths for the Resonant Engineer Agent.

## Recovery Tooling

- Completed on 2026-04-23:
  - added stronger-route probing in recovery mode
  - added ranked candidate list in the red recovery rail
  - added one-click promotion of the Resonant Engineer Agent onto a stronger validated route
  - removed hard-coded user paths from recovery root resolution
  - tightened the recovery command allowlist to reduce arbitrary script execution risk
  - moved recovery orchestration and tools into a dedicated Rust recovery service module
- Surface recovery checklist and change log as first-class UI, not just shell state.
- Persist structured Engineer tool events, not only text summaries.
- Add richer recovery tools:
  - structured log discovery
  - ADR/doc lookup shortcuts
  - safer diff/patch primitives
  - recovery report artifact generation
- Add explicit review controls before high-impact code or config edits outside the active workspace.

## Productization

- Windows and Linux validation.
- replace the current dynamic recovery-root heuristics with an explicit user-configured workspace/archive root model
- Update strategy.
- Crash reporting and diagnostics.
- Accessibility review.
