# ResonantOS vNext Project Status

Last updated: 2026-05-05

This document is the operational checkpoint for what exists now, what is partially built, and what still needs to be done. It is intentionally shorter than the ADRs and backlog: use it to regain project state quickly before deciding the next work item.

## Current Product Direction

ResonantOS vNext is a desktop-first modular operating system for human-AI collaboration. It is not an OpenClaw dashboard. OpenClaw, Hermes, Obsidian, OpenCode, Paperclip, Audio2TOL, Shield, Logician, and similar systems are add-ons.

The core product direction is now the no-lock-in model from `ADR-026`.

The non-replaceable kernel is:

- ResonantOS shell
- Resonant Engineer agent for setup, repair, recovery, and system maintenance
- add-on registry, capability broker, provider fabric, secure local state, audit log, and privileged IPC mediation

The recommended defaults are bundled add-ons, not mandatory core lock-ins:

- Augmentor Chat as the default primary-agent/chat-interface add-on
- Living Archive as the default memory-system add-on

First-run setup should ask the user whether to enable these recommended defaults. The user may skip them and install replacements.

Runtime enforcement now exists for this direction:

- `chat-interface` and `memory-system` replacement slots are resolved from add-on manifests.
- A first-run prompt asks whether to enable the recommended Augmentor Chat and Living Archive add-ons.
- If no memory-system add-on is active, the Archive route prompts the user to choose a memory add-on instead of pretending the core archive is always present.
- If Augmentor Chat is disabled, the Resonant Engineer remains reachable from Settings as a kernel-owned setup assistant; recovery mode remains independent from the chat add-on.

The shell direction is a three-zone app:

- a thin left app launcher rail for core modules and add-ons
- a central workspace where apps, archive, settings, terminals, and embedded tools open
- a persistent right AI chat rail that can switch agents, manage chat history, and collapse or resize

## Current Validation Snapshot

The latest deterministic check completed with:

- `npm test -- --run`: 168 passed
- `npm run test:living-archive-mcp`: passed
- `npm run test:living-archive-memory-service`: passed
- `npm run build`: passed
- `cargo fmt --check`: passed
- `cargo test --lib`: 100 passed, 3 ignored
- `git diff --check`: passed
- `npm run tauri:build`: passed on macOS aarch64 and produced `ResonantOS.app` plus `ResonantOS_0.1.0_aarch64.dmg`

Known validation notes:

- Vite still reports the existing large chunk warning.
- The current macOS package build is locally verified; cross-platform packaging still depends on CI/tech-team machines.
- Linux x86_64 Haswell local native packaging is partially blocked in one tech-team test by a rustc 1.95 / LLVM compiler ICE while compiling the GTK dependency path. The repo now pins Rust `1.94.1` for alpha builds; retest Linux native packaging through rustup-managed `1.94.1` before treating the failure as ResonantOS source breakage.

This status document records that result as the current worktree checkpoint. Re-run the same commands before tagging a release or merging a large follow-up.

## Public Source Preview Scope

This is a reasonable checkpoint for a public source preview of ResonantOS vNext and the add-on SDK foundation.

This is not a finished consumer product release and not a packaged stable installer release.

What the team should review:

- the app shell, persistent chat rail, and workspace layout direction
- the current Living Archive import path and guided first-run flow
- the single private-data root direction in `ADR-022`
- the alpha handoff audit in `docs/ALPHA_PREVIEW_AUDIT_2026-04-28.md`
- the internal alpha distribution guide in `docs/ALPHA_DISTRIBUTION.md`
- the add-on repo/registry model in `ADR-023`
- the add-on SDK direction, especially manifest authority and capability gates
- the current boundaries between core services, add-ons, provider runtime nodes, and experimental integrations

Release scope:

- publish the vNext repository as the visible current ResonantOS codebase
- keep the older OpenClaw-centered Alpha repository private to avoid product confusion
- ship the SDK/contracts and default recommended catalog
- do not release any new optional add-on in this checkpoint
- keep Paperclip development connector code excluded from the public default add-on catalog until a future explicit add-on release

Known limits for reviewers:

- Living Archive import is safe-copy oriented; move/reorganisation execution is intentionally blocked
- Living Archive AI Memory builds now persist job summaries, restore them in the Review Desk, support user-triggered `Continue Build`, and can auto-continue safe jobs only when the persisted Archive automation policy and provider-cost gate allow it
- add-ons are catalog entries and are not installed or trusted by default; the basic default catalog now exposes only recommended Augmentor Chat and Living Archive contracts
- Browser, Obsidian, OpenCode, and Terminal add-ons are early foundations, not complete production integrations
- Paperclip is now specified in `ADR-028` as a future optional organizational runtime add-on; development connector code exists, but it is excluded from the public default catalog until explicitly released
- wallet and encrypted vault implementation is architectural only
- recovery mode exists, but the Engineer is not yet a complete autonomous repair operator
- UI polish is still active work, especially around responsiveness and information density

## Implemented

### Desktop Shell And UI Foundation

- Tauri desktop app is running as the target product surface.
- The app has a shell structure with left navigation, central workspace, top status area, and right chat rail.
- The UI direction has moved away from a settings-page-only dashboard toward an app launcher/workspace model.
- Touch-friendly sizing is a stated UI requirement for new surfaces.
- Product UX direction is documented in `docs/product/UX-001-resonantos-app-shell.md`.

### Chat Rail And Agents

- Persistent right-side chat rail exists.
- Chat supports agent selection between Augmentor and Resonant Engineer without automatically entering recovery mode.
- Augmentor Chat can detach into a native floating Tauri window using the `floating-window` add-on surface contract.
- Telegram Channel now has a host-mediated service path: the add-on stores its bot token in the portable secret vault, long-polls Telegram through the Rust host, routes inbound text to Augmentor through the provider fabric, sends the reply back to Telegram, and mirrors both sides into local ResonantOS chat history.
- Telegram voice/audio files are downloaded into local app state and mirrored as protected message metadata; full audio understanding still needs a configured transcription provider hook before the content can be treated as understood speech.
- Runtime-state updates are broadcast across windows so the main shell and floating chat can stay in sync after persisted state changes.
- Chat history supports multiple conversations, pinning, deletion, branching/forking, and per-message actions.
- Assistant replies render Markdown.
- User messages and assistant messages use different visual treatment.
- Context usage is visible in compact form.
- Foundation exists for transcript preservation and context compaction.
- Dictation remains limited by the current Tauri/runtime permission path and is not complete.

### Context Memory Compaction

- ADR-016 defines host-owned context compaction.
- Raw transcripts are preserved separately from compact state.
- Compact state preserves durable facts, user intent, decisions, open loops, and archive/provider/tool references.
- Compaction is designed to trigger before the context window is exhausted, with a target threshold documented around 80%.
- Manual compaction and automatic pre-send compaction are implemented.
- Compact memory is injected into the next provider prompt with recent uncompressed turns.
- Branched chats carry compact memory forward.
- Compact state now extracts stable facts, user preferences, tasks, risks, unresolved questions, file paths, URLs, and commit references.
- Context hard-stop behavior is enforced if usage remains above the hard threshold after compaction.
- The chat rail context percentage opens a visual context-memory map showing used budget, compaction/hard-stop thresholds, prompt memory layers, preserved intent, why, facts, decisions, tasks, artifacts, and source ids.
- The context-memory map is available in the right chat rail, inside the composer toolbar: click the context percentage beside the `+` attachment button.
- The context-memory map supports user correction of compacted memory fields while preserving the raw transcript unchanged.
- Current implementation is still not a fully proven long-session memory system because it needs long-run evaluation and stronger provenance/review history for memory edits.

### Provider Fabric

- Provider routing is centralized in ResonantOS rather than delegated to add-ons.
- Provider profiles, runtime nodes, route resolution, fallback policies, and health state are represented in code.
- MiniMax is integrated as the current working provider path.
- Local runtimes are represented as provider runtime nodes.
- Provider diagnostics and smoke-test paths exist.
- Routing distinguishes normal provider use from recovery/resurrect behavior.
- The Strategy settings page now exposes editable workload routes, fallback chains, hard-stop vs fallback behavior, and cost posture labels for primary chat, recovery, archive ingest, and routine/background work.
- User-owned LAN runtimes remain non-routable placeholders until setup discovers a real model-list endpoint; verified LAN runtimes can participate in strategy/fallback routing before the desktop emergency floor.

### Paperclip Add-on Direction

- `ADR-028` defines Paperclip as an optional hosted organizational runtime add-on.
- Paperclip should be supervised by ResonantOS, not treated as a replacement shell or trusted memory system.
- The intended integration is similar to the OpenCode hosted-service pattern, but with stricter boundaries because Paperclip can coordinate multiple agents, budgets, companies, and tickets.
- V0 should detect/connect/launch Paperclip, embed its UI, list companies/agents/issues, create issues from ResonantOS Delegation Packets, collect artifacts, and queue those artifacts into Living Archive intake.
- Paperclip outputs are external work artifacts. They must not write trusted Living Archive wiki pages directly.

### Living Archive Memory System

- Living Archive is now treated as the bundled recommended `memory-system` add-on contract, while its current implementation still uses host-owned service boundaries for privileged filesystem, review, and indexing operations.
- `src/core/memory-provider.ts` defines the first neutral memory-provider broker for status, search, read, intake write, ingest request, and review operations.
- Augmentor chat memory retrieval, chat insight intake, and the stable Archive workspace flows route through the active memory-provider broker instead of directly depending on Living Archive.
- The broker now supports sideloaded `http-json` memory providers via `POST /memory/{operation}` endpoints.
- A working reference third-party memory provider exists at `examples/reference-memory-service.mjs` with sideload manifest `examples/addons/reference-memory.json`; automated tests spawn it and prove a non-Living Archive provider can satisfy the broker.
- A standalone Living Archive MCP bridge now exists at `examples/living-archive-mcp.mjs`; V1 exposes scoped status/search/read/intake/ingest-request/review/maintenance/lint tools over stdio, proxies a live `POST /memory/{operation}` provider when `RESONANTOS_MEMORY_SERVICE_URL` is configured, and falls back to `ResonantOS_User/Memory` portable-folder mode without allowing direct trusted wiki writes.
- A local loopback Living Archive memory service now exists at `examples/living-archive-memory-service.mjs`; it exposes the V1 `POST /memory/{operation}` contract for portable status/search/read/intake/review-listing/lint so external MCP clients can use a real local endpoint before the full desktop host provider launcher is productized.
- The desktop host now has a narrow Memory Bridge launcher in `src-tauri/src/memory_service.rs` and a Settings section that can start, stop, and inspect the local Living Archive memory service using the canonical Portable User State memory root.
- Native Living Archive IPC commands are now brokered by the active add-on contract: `addon.living-archive` must be enabled with `memory-provider` and the action-specific grant before the Rust host executes archive actions.
- If another memory add-on owns the `memory-system` slot, the shell does not render the bundled Living Archive workspace as if it were core memory.
- Runtime/config resolution, archive status, search, document reads, intake writes, ingest request queueing, and review queue operations are present.
- Add-ons and non-core agents are constrained to scoped reads and intake writes.
- Trusted knowledge page writes remain reserved to Strategist-owned ingest/review flows.
- Approval decisions can promote reviewed artifacts into trusted wiki memory with backup/provenance behavior.
- Source folder scanning and source manifests exist.
- The host now initializes the SQLite `wiki.db` schema for pages, sources, links, page-source provenance, and activity logs instead of relying on a pre-existing database.
- Archive document reads are guarded to Living Archive roots and mapped source roots, not the whole Portable User State root, so `Secrets` and other non-memory private data are outside the read boundary.
- Intake artifact filenames are validated as plain filenames to prevent path traversal outside the managed intake bucket.
- Source/version hashes now use SHA-256 for stable long-term provenance instead of process-local hashing.
- Audio2TOL-style bundle detection and queueing exist only as an optional add-on bridge; TOL is not part of the base Living Archive workflow unless `addon.audio2tol` is installed and enabled.
- System architecture memory exists under `Memory/AI_MEMORY/system` and is loaded into Augmentor and Engineer prompts.
- `ADR-027` now defines Living Archive LLM Wiki compliance as the binding implementation standard.
- The V1 LLM Wiki loop is implemented: source scan, queue, ingest, verifier approval, promotion, index/log refresh, deterministic lint, semantic lint, and semantic repair queueing.
- `background-cycle` scans watched source roots, queues new/changed files, runs provider-backed maintenance, refreshes navigation, and returns a transparent summary of queued, skipped, processed, and promoted work.
- Auto sync remains opt-in because provider usage can cost money; the user policy is persisted and AI Memory auto-builds can be limited to manual-only, local/subscription routes, or any configured route.
- Imported-library AI Memory queues are now durable per source: request filenames include source identity/path hash, and persisted job summaries detect stale path failures or queue-loss mismatches as `attention` instead of silently presenting false completion.
- Live AI Memory build results now apply the same queue-integrity check as restored job summaries, so queue-loss cannot be masked by escalated review artifacts during the current run.
- Escalated artifacts no longer stop unrelated source processing; they stay visible for review while the remaining durable queue can continue under the saved automation/cost policy.
- Review execution is now backend-scoped to the expected review subdirectories, so request processing cannot be pointed at arbitrary archive JSON and decision/promotion cannot be pointed outside `Memory/REVIEW/artifacts`.
- Intake artifact writes are collision-safe and preserve existing raw evidence by allocating a unique filename instead of overwriting same-named artifacts.
- Review artifacts now expose promotion state back to the UI. Already-promoted artifacts are marked as in-wiki work, and the Review Desk has a single `Promote Approved` action for approved, unpromoted artifacts.
- Ingest outputs that return useful structured fields but malformed `proposed_pages` are repaired into conservative source-summary pages, preventing the AI Memory build from dead-ending on model formatting drift.
- Archive maintenance now attempts AI repair/reverification for repairable escalated artifacts before asking the human to review exceptions. Safe repaired artifacts can be approved and promoted through the normal trusted-wiki path.
- Routine archive approval can be completed by a Strategist-owned AI verifier; human review is reserved for high-risk, doctrine-sensitive, low-confidence, destructive, or ambiguous cases.
- Ingest writer and verifier routes can use separate provider/model fields, allowing premium ingest and cheaper/local verification when configured.
- Semantic lint never mutates trusted memory directly; findings become repair-source artifacts that re-enter the normal ingest/review/promote path.
- Large text sources are chunk-staged with manifests recorded in review artifacts.
- Non-text sources become conservative attachment stubs unless a specialist add-on pipeline emits text/structured intake bundles.
- Promotion now performs section-aware markdown merge for existing pages and keeps superseded sections with provenance, reducing append-only drift.

Current Living Archive status:

- Functionally complete for V1 architecture and ready for real-data validation.
- Not yet production-grade until tested against the user's full ResonantOS Base and real provider routes.
- Remaining work is hardening/productization: richer attachment add-ons, domain-specific merge policies, native filesystem event watchers, and UI refinement.

### Living Archive Memory Domains

- ADR-013 defines the memory domain model:
- `Human Knowledge` for user-owned identity, thinking, notes, and original knowledge.
- `External Knowledge` for research, meetings, business/project material, and knowledge not owned by the user.
- `AI Memory` for AI-curated memory, synthesis, system memory, and trusted generated knowledge.
- `Mixed Library` as the staging path for imported folders or vaults that contain mixed material.
- ADR-022 defines the Portable User State Root as the long-term single private data package for memory, config, encrypted secrets, wallet vaults, logs, and backups.
- Source-local `_LivingArchive` output is now considered transitional; new import work should target `ResonantOS_User/Memory`.
- First host resolver is implemented: ResonantOS initializes `ResonantOS_User` in the user's home folder by default, creates the standard private-data subfolders and manifest, and routes new Living Archive managed memory through `ResonantOS_User/Memory`.

### Library Import And Reorganisation Planning

- Folder/vault import exists through the `ArchiveLibraryImporter` module.
- Copy import is the safe default.
- Host-side move imports are rejected before files are touched.
- The UI disables `Move into Living Archive` until audited execution exists.
- Mixed-library classification review is host-owned.
- Classification review artifacts must be inside imported-library metadata roots and linked from known import manifests.
- Library import preflight is implemented and non-destructive: it reports supported/skipped files, noisy folders, skipped examples, Obsidian detection, estimated managed storage, and a recommended import plan before copy.
- The recommended import plan keeps friction low: ResonantOS auto-excludes obvious technical folders, flags ambiguous folders, and exposes one primary `Let AI Import This` action instead of forcing manual file curation.
- The preflight UI can open a new Augmentor session with a structured prompt containing the current preflight and recommended-plan context, so the user can ask why files were skipped or what to do next from inside ResonantOS.
- The Living Archive workspace is now agent-led by default: the first screen shows the Living Archive Agent, one recommended next action, and a simple Add Knowledge flow. Review, Sources, Search, Help, and Diagnostics are hidden behind Advanced tools instead of rendering every subsystem at once.
- The Help tab owns explanatory copy; the default Start tab should stay action-oriented and avoid long reading blocks.
- The Start tab now shows a compact memory status when imported libraries already exist, including managed memory location, managed file count, AI task count, and the latest canonical library path. The importer stays hidden until the user adds another folder.
- The Start tab now includes an AI Memory Curator action center that chooses the next best archive action for the user: import, build, repair, continue, promote, process maintenance, or review exceptions. Human review is presented as exception handling, not the normal path.
- Current limitation: single-file document upload is not implemented yet; the visible safe path is folder or Obsidian-vault import through the host folder picker.
- Imported-library cards now expose `Build AI Memory`, which starts a durable AI Memory build job. The job queues eligible managed text sources, runs a bounded provider-routed maintenance batch, promotes approved artifacts, persists job state, and reports progress/status back to the user. Imported sources remain raw evidence until processed, approved, and promoted; this keeps the LLM Wiki trust boundary intact while making the promotion path visible and usable.
- The Start tab now reloads the latest persisted AI Memory job for the current library after restart and exposes `Repair AI Memory Build` when a prior job needs attention.
- Reorganisation plans can be generated as preview-only artifacts.
- Reorganisation plans are explicitly marked `eligibleForExecution = false`.
- Actual file moves are not implemented and should not be added without audit, rollback, approval, and tests.

### Recovery And Resonant Engineer

- Recovery mode exists as a distinct emergency mode.
- Recovery mode uses the Resonant Engineer agent.
- The Engineer is also available outside recovery mode for normal setup and maintenance work.
- Recovery diagnostics, route candidates, and model promotion concepts are present.
- The recovery UI has a dedicated red emergency visual treatment.
- The current Engineer is not yet a fully capable autonomous repair operator.

### Delegation And Add-on Foundation

- ADR-015 defines Delegation Packets, task workspaces, artifact return, add-on catalog direction, and native tool fabric.
- ADR-018 defines Add-on SDK V0 as the binding internal add-on standard.
- ADR-023 defines the add-on repository and registry model: core app stays separate from creator-owned add-on repos, curated registry metadata, sideloaded add-ons, and first-party add-on repositories.
- ADR-024 defines the future Add-on Store and commerce direction: screenshots, ratings, reviews, pricing, subscriptions, and wallet-mediated purchases are store-layer features built on top of Registry trust state, not replacements for capability review.
- `UX-002` captures the Glocal Discovery Interface: a reusable advanced search, filter, timeline, map, and graph pattern inspired by the Glocal Music startup concept. This can later power the Add-on Store, Living Archive exploration, research datasets, marketplaces, ResonantDAO community discovery, and a future Glocal Music add-on.
- `src/sdk/addons` now exposes manifest validation, stable capabilities, service protocol constants, and add-on SDK types.
- `src/sdk/addons` now includes Add-on Registry V0 helpers that derive discovery/catalog entries separately from host-owned installation state.
- Registry V0 records provenance, review state, artifact references, compatibility, requested capabilities, and current install state without installing or trusting add-ons.
- The Add-ons workspace now surfaces Registry V0 state on add-on cards and detail panels so reviewers can distinguish catalog/discovery, review, verification, and install state.
- Bundled add-ons now remain available-only by default; no bundled add-on is installed, enabled, or granted capabilities in default state.
- Sideloaded registry entries are forced to unverified/unreviewed provenance even when their manifest claims stronger trust.
- Runtime manifest loading validates bundled and sideloaded manifests before they are accepted by the shell.
- SDK validation now enforces authority consistency: archive scopes require archive capabilities, shared provider profiles require the provider capability, and embedded surfaces require UI embedding.
- Bundled manifest conformance is covered by deterministic tests.
- Resonant Browser now declares an SDK V0 local-service manifest with `browser-control`, but the live engine host is not implemented yet.
- The codebase has an initial add-on/catalog shape.
- Add-ons remain constrained by explicit capabilities in the architecture.
- Full signed add-on registry, marketplace, sideload hardening, and service lifecycle are not implemented yet.
- GitHub Actions now includes `.github/workflows/alpha-build.yml` for internal macOS, Windows, and Linux alpha artifacts.

### Resonant Browser

- ADR-017 now defines Browser as a live internal browser add-on controlled by the human and, later, by approved AI tools.
- The screenshot/CDP prototype is rejected as the Browser UI foundation and replaced in the workspace by a live Tauri child WebView.
- The Browser add-on setup still lives in Add-ons: install/enable and grant `network`, `ui-embedding`, and `browser-control`.
- The Browser workspace now opens a real live viewport for user scrolling, clicking, typing, and navigation in the center column.
- Current limitation: the live Tauri child WebView is not the final Chromium-class AI-control engine. The remaining engine decision is Electron WebContentsView/BrowserView add-on host or CEF child-view host.
- `src-tauri/src/browser_service.rs` still contains the deprecated screenshot prototype and should be removed or repurposed only after the live engine path is selected.

### Documentation And Architecture Standards

- ADRs 001-023 exist and define the major architecture rules.
- `docs/architecture/MODULE_MAP.md` maps module ownership.
- `docs/FEATURE_BACKLOG.md` tracks larger backlog items.
- `docs/architecture/ARCHITECTURE_AUDIT_2026-04-26.md` records the modularity and hardening checkpoint.
- The current standard is to update ADRs, module map, and backlog when architecture or ownership changes.

## Recent Hardening Confirmed In Worktree

The latest hardening/refactor pass is present in the worktree:

- host rejects move imports before touching files
- UI disables move import until audited execution exists
- duplicate frontend-only classification approval block was removed
- `ArchiveLibraryImporter` was extracted from `ArchiveWorkspace`
- `ArchiveWorkspace` is currently 754 lines after extraction
- classification review access is restricted to known imported-library metadata roots
- reorganisation plans are preview-only and not executable
- ADR, backlog, and module map docs were updated for the reorganisation planning command
- Obsidian V1 is now a real read-only vault bridge add-on:
  - `addon.obsidian` no longer claims full embedded-app behavior for V1
  - users can select a vault/markdown folder, scan notes, and preview markdown through host-mediated commands
  - selected notes can be opened in the external Obsidian app through a validated `obsidian://open` handoff
  - selected notes can be handed to Augmentor for summarization, Obsidian organization suggestions, or archive-intake planning
  - selected notes can be queued into raw Living Archive intake only after granting `archive-intake-write` and confirming the action
  - scanned notes can be batch-queued into raw intake with a small V1 cap, explicit grant, and confirmation
  - users can manually refresh changed notes after editing externally; refresh reports new/changed note counts and does not queue anything automatically
  - changed/new notes are shown in a selectable review panel before batch queueing so users can choose raw-intake candidates and inspect deterministic change reasons
  - scanned notes show new, changed, and queued-unchanged sync status from a local add-on sync index
  - the add-on records recent queued notes and can deep-link the user back to the Living Archive review desk
  - trusted Living Archive writes remain outside the Obsidian add-on boundary
  - the V1 implementation is split into controller, presentational sections, and model/helper modules to keep add-on work parallel-safe
- ADR-019 now defines Obsidian V2 as a ResonantOS-hosted Obsidian-compatible workspace:
  - this is the production path for working inside ResonantOS
  - it should operate the same vault files through host-mediated commands
  - it should not rely on unsupported native Obsidian/Electron window embedding
  - external Obsidian remains available through validated URI handoff
- ADR-020 now defines Resonant Notes as the clean-room implementation direction:
  - ResonantOS may implement Obsidian-compatible Markdown, frontmatter, tags, wikilinks, backlinks, and graph behavior
  - ResonantOS must not copy, de-minify, translate, or derive implementation from Obsidian's proprietary application code
  - the Obsidian add-on remains the bridge for existing vaults and external Obsidian handoff
  - the V2 file explorer now defaults folders closed, persists expanded folders per vault, and creates notes/folders through inline audited controls
  - rename/move is inline, the last selected note is restored per vault, and initial Obsidian-style shortcuts are wired
  - note/folder context menus and persisted open-note tabs are implemented as the next Obsidian-familiar workspace layer
  - Resonant Notes is lazy-loaded from the shell, and the CodeMirror editor engine is split into dedicated editor/core/markdown chunks
  - shell route splitting now lazy-loads Living Archive, Browser, Add-ons, Settings, Delegation, Recovery, Overview, Strategist, Terminal, and Resonant Notes; OpenCode remains mounted until its active-service lifecycle is reviewed
  - the public add-on name, dock label, and icon are now Resonant Notes; `addon.obsidian` remains the stable internal compatibility id
  - the Resonant Notes workspace now opts into full-height shell layout so the editor uses the available center pane instead of leaving unused bottom space
- First ADR-019 host boundary is implemented:
  - `obsidian_write_note` writes only existing markdown notes inside the approved vault
  - it rejects stale saves when the note changed on disk after opening
  - it snapshots the previous note into `.resonantos/obsidian-note-versions`
  - it writes an audit record into `.resonantos/obsidian-note-audit`
  - the Tauri command requires the Obsidian add-on filesystem grant before execution
- First ADR-019 central workspace shell is implemented:
  - installed/enabled notes add-on exposes a Resonant Notes dock workspace
  - workspace gates on selected vault, filesystem grant, and `ui-embedding`
  - the workspace gate can now grant workspace access and open the native vault picker when no vault is configured
  - workspace loads the vault note list through host commands
  - selected notes open in a markdown editor with preview toggle and dirty-state
  - selected drafts show a read-only metadata panel for frontmatter, tags, and wikilinks
  - the host now exposes a clean-room vault index with note search, tags, outgoing wikilinks, and backlinks
  - vault index search results and backlinks now navigate to notes through the same guarded open path as the note list
  - the workspace UI now follows the Obsidian reference more closely with a compact tab strip, left ribbon, one active sidebar view, central document surface, and bottom status bar
  - file explorer is the default sidebar view; search and backlinks are selected from the ribbon instead of being shown as permanent competing columns
  - Save calls `obsidian_write_note` with the note's expected modified marker
  - this is still a V2 shell, not full Obsidian plugin/canvas/graph compatibility

Treat this as active current state. If committing, review the full diff first because these changes were produced in a parallel chat.

## Still Missing

### Living Archive

- Audited reorganisation execution command.
- Human approval UI for executing a reorganisation plan.
- Rollback execution for reorganisations.
- File watcher or scheduled sync for imported folders and Obsidian vaults.
- Clear rescan/sync UX for versioned source updates.
- Local Git-style versioning or equivalent immutable history for imported knowledge.
- AI-assisted classification beyond the deterministic first-pass rules.
- Rich review UX for large mixed libraries, including paging and bulk approval.
- Resonant Notes graph view, richer editor controls, and Augmentor note actions.
- Full semantic merge and conflict handling for changed documents.

### Chat And Memory

- Production-quality compaction evaluation with long-session tests.
- Dedicated review history for compact-memory edits.
- Provider-native context-budget integration per model.
- Attachment upload pipeline.
- Regenerate-message execution.
- Native microphone/dictation implementation.
- Local-model TPS/token telemetry wired only when a local runtime reports it.

### Provider Strategy

- Strategy UX is implemented as a first editable policy surface for workload primary routes, fallback-chain selection, failure behavior, and cost posture.
- User-defined creation/reordering of fallback chains is not complete; current UX edits the existing strategy profile and chains.
- Per-agent/workload model policies include cost posture, locality, quality intent, subscription/local availability, and hard-stop/fallback behavior at the route level, but need richer explanatory guidance and history.
- Provider health history.
- Automatic route switching with clear user-visible explanation.
- Complete Anthropic, Gemini, OpenAI, and additional local runtime support.
- Clean handling for experimental subscription-capable auth paths.

### Add-on Platform

- Signed curated add-on registry.
- Sideload install flow with strong warnings and capability review.
- Add-on service lifecycle manager.
- Runtime isolation for local services and embedded surfaces.
- Public SDK packaging, examples, and developer documentation.
- Extract experimental add-on implementations into creator-owned or first-party add-on repositories before public alpha.
- True live embedded Chromium viewport with click/type/read-page/download tools.
- Full embedded Obsidian, OpenCode, OpenClaw terminal/TUI, and Hermes integrations.
- OpenCode add-on spike:
  - ADR-021 defines OpenCode as an optional hosted local-service add-on, not a ResonantOS core dependency
  - host commands now probe OpenCode and can launch/stop `opencode web` for a scoped workspace after grants
  - the center workspace can embed OpenCode's own web UI after launch
  - the OpenCode workspace keeps runtime setup and grants behind a settings control so the embedded OpenCode UI remains the primary surface
  - production use still needs cross-platform embed validation, SDK/API task dispatch, diff capture, and versioning gates

### Recovery And Engineer

- A full Engineer action template with diagnosis, research, documentation lookup, controlled changes, and final report.
- Approved code-edit tools for the Engineer with audit logs.
- Automatic escalation from last-resort local model to a stronger available model.
- Better recovery status streaming in chat and central dashboard.
- Deterministic recovery-mode integration tests beyond smoke coverage.

### Security And Web3

- Wallet/Web3 implementation is not built.
- Signing requests, confirmation UI, and custody tiers are still architectural only.
- Portable User State root resolution is implemented; encrypted secure vault storage from `ADR-022` is not built.
- Capability gates need deeper enforcement across all future add-on actions.
- Secret-handling and audit trails need a dedicated hardening pass before wallet work.

### Cross-platform And Productization

- Windows and Linux validation are still missing.
- macOS packaging exists, but release/update flow is not complete.
- Large chunk warning needs code-splitting/performance work.
- Accessibility and touch-screen QA need explicit test passes.
- Onboarding is not complete.
- Public/private repository setup and release governance still need a final decision.

## Current Guardrails

- Do not allow add-ons to write trusted knowledge pages directly.
- Do not enable move imports until audited execution, approval, rollback, and tests exist.
- Do not treat reorganisation plans as executable; they are preview artifacts only.
- Do not place privileged filesystem, provider secrets, wallet signing, or process orchestration in TypeScript UI code.
- Do not scatter user private data across source folders or app internals; new memory, config, secrets, wallet, logs, and backup work must target the Portable User State Root from `ADR-022`.
- Escalated Living Archive review artifacts require explicit human approve/reject actions before trusted wiki promotion; do not let verifier or Strategist actors resolve human-review work.
- Keep `App.tsx` as shell composition; move feature orchestration into module controllers/hooks.
- Keep archive UI modules split when they cross meaningful ownership boundaries.
- Every architecture change should update the relevant ADR, `MODULE_MAP.md`, and `FEATURE_BACKLOG.md`.
- Every user-visible feature should have deterministic tests before being called done.

## Recommended Next Work

1. Review and commit the current hardening/refactor work if the diff is acceptable.
2. Finish the Living Archive audited reorganisation design before building execution UI.
3. Extend provider strategy from editing existing chains to creating/reordering named fallback chains with user-facing cost estimates.
4. Continue app-shell simplification toward the launcher/workspace/chat model.
5. Add cross-platform validation and code-splitting work before the UI grows further.
