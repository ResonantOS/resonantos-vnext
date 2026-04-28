# ResonantOS vNext Project Status

Last updated: 2026-04-28

This document is the operational checkpoint for what exists now, what is partially built, and what still needs to be done. It is intentionally shorter than the ADRs and backlog: use it to regain project state quickly before deciding the next work item.

## Current Product Direction

ResonantOS vNext is a desktop-first modular operating system for human-AI collaboration. It is not an OpenClaw dashboard. OpenClaw, Hermes, Obsidian, OpenCode, Audio2TOL, Shield, Logician, and similar systems are add-ons.

The core product remains:

- ResonantOS shell
- Strategist agent, default name `Augmentor`
- Resonant Engineer agent for setup, repair, recovery, and system maintenance
- Living Archive

The shell direction is a three-zone app:

- a thin left app launcher rail for core modules and add-ons
- a central workspace where apps, archive, settings, terminals, and embedded tools open
- a persistent right AI chat rail that can switch agents, manage chat history, and collapse or resize

## Current Validation Snapshot

The latest deterministic check completed with:

- `npm test -- --run`: 110 passed
- `npm run build`: passed
- `cargo fmt --check && cargo test`: 53 passed, 2 ignored Browser execution tests
- `npm run tauri:build`: passed and generated the macOS app and DMG

Known validation note:

- Vite still reports the existing large chunk warning.

This status document records that result as the current worktree checkpoint. Re-run the same commands before tagging a release or merging a large follow-up.

## Early Access Pause Point

This is a reasonable checkpoint for an internal dev-team review, not for public release.

What the team should review:

- the app shell, persistent chat rail, and workspace layout direction
- the current Living Archive import path and guided first-run flow
- the single private-data root direction in `ADR-022`
- the alpha handoff audit in `docs/ALPHA_PREVIEW_AUDIT_2026-04-28.md`
- the add-on SDK direction, especially manifest authority and capability gates
- the current boundaries between core services, add-ons, provider runtime nodes, and experimental integrations

Known limits for reviewers:

- Living Archive import is safe-copy oriented; move/reorganisation execution is intentionally blocked
- add-ons are catalog entries and are not installed or trusted by default
- Browser, Obsidian, OpenCode, and Terminal add-ons are early foundations, not complete production integrations
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
- Cost-aware strategy is now recognized as a product requirement, but the full policy UI is not built.

### Living Archive Host Service

- Living Archive is implemented as a host-owned service boundary, not an add-on.
- Runtime/config resolution, archive status, search, document reads, intake writes, ingest request queueing, and review queue operations are present.
- Add-ons and non-core agents are constrained to scoped reads and intake writes.
- Trusted knowledge page writes remain reserved to Strategist-owned ingest/review flows.
- Approval decisions can promote reviewed artifacts into trusted wiki memory with backup/provenance behavior.
- Source folder scanning and source manifests exist.
- Audio2TOL-style bundle detection and queueing exist only as an optional add-on bridge; TOL is not part of the base Living Archive workflow unless `addon.audio2tol` is installed and enabled.
- System architecture memory exists under `Memory/AI_MEMORY/system` and is loaded into Augmentor and Engineer prompts.

### Living Archive Memory Domains

- ADR-013 defines the memory domain model:
- `Human Knowledge` for user-owned identity, thinking, notes, and original knowledge.
- `External Knowledge` for research, meetings, business/project material, and knowledge not owned by the user.
- `AI Memory` for AI-curated memory, synthesis, system memory, and trusted generated knowledge.
- `Mixed Library` as the staging path for imported folders or vaults that contain mixed material.
- ADR-022 defines the Portable User State Root as the long-term single private data package for memory, config, encrypted secrets, wallet vaults, logs, and backups.
- Source-local `_LivingArchive` output is now considered transitional; new import work should target `ResonantOS_User/Memory`.
- First host resolver is implemented: ResonantOS initializes `ResonantOS_User`, creates the standard private-data subfolders and manifest, and routes new Living Archive managed memory through `ResonantOS_User/Memory`.

### Library Import And Reorganisation Planning

- Folder/vault import exists through the `ArchiveLibraryImporter` module.
- Copy import is the safe default.
- Host-side move imports are rejected before files are touched.
- The UI disables `Move into Living Archive` until audited execution exists.
- Mixed-library classification review is host-owned.
- Classification review artifacts must be inside imported-library metadata roots and linked from known import manifests.
- Library import preflight is implemented and non-destructive: it reports supported/skipped files, noisy folders, skipped examples, Obsidian detection, estimated managed storage, and a recommended import plan before copy.
- The recommended import plan keeps friction low: ResonantOS auto-excludes obvious technical folders, flags ambiguous folders, and exposes one primary `Import Recommended Plan` action instead of forcing manual file curation.
- The preflight UI can open a new Augmentor session with a structured prompt containing the current preflight and recommended-plan context, so the user can ask why files were skipped or what to do next from inside ResonantOS.
- The Living Archive workspace is now guided by default: the first screen is a short import-oriented start page, with Review, Sources, Search, Help, and Advanced panels behind tabs instead of rendering every subsystem at once.
- The Help tab owns explanatory copy; the default Start tab should stay action-oriented and avoid long reading blocks.
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
- `src/sdk/addons` now exposes manifest validation, stable capabilities, service protocol constants, and add-on SDK types.
- Runtime manifest loading validates bundled and sideloaded manifests before they are accepted by the shell.
- SDK validation now enforces authority consistency: archive scopes require archive capabilities, shared provider profiles require the provider capability, and embedded surfaces require UI embedding.
- Bundled manifest conformance is covered by deterministic tests.
- Resonant Browser now declares an SDK V0 local-service manifest with `browser-control`, but the live engine host is not implemented yet.
- The codebase has an initial add-on/catalog shape.
- Add-ons remain constrained by explicit capabilities in the architecture.
- Full signed add-on registry, marketplace, sideload hardening, and service lifecycle are not implemented yet.

### Resonant Browser

- ADR-017 now defines Browser as a live internal browser add-on controlled by the human and, later, by approved AI tools.
- The screenshot/CDP prototype is rejected as the Browser UI foundation and replaced in the workspace by a live Tauri child WebView.
- The Browser add-on setup still lives in Add-ons: install/enable and grant `network`, `ui-embedding`, and `browser-control`.
- The Browser workspace now opens a real live viewport for user scrolling, clicking, typing, and navigation in the center column.
- Current limitation: the live Tauri child WebView is not the final Chromium-class AI-control engine. The remaining engine decision is Electron WebContentsView/BrowserView add-on host or CEF child-view host.
- `src-tauri/src/browser_service.rs` still contains the deprecated screenshot prototype and should be removed or repurposed only after the live engine path is selected.

### Documentation And Architecture Standards

- ADRs 001-022 exist and define the major architecture rules.
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
- First ADR-019 host boundary is implemented:
  - `obsidian_write_note` writes only existing markdown notes inside the approved vault
  - it rejects stale saves when the note changed on disk after opening
  - it snapshots the previous note into `.resonantos/obsidian-note-versions`
  - it writes an audit record into `.resonantos/obsidian-note-audit`
  - the Tauri command requires the Obsidian add-on filesystem grant before execution
- First ADR-019 central workspace shell is implemented:
  - installed/enabled Obsidian add-on exposes an Obsidian dock workspace
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
- Obsidian V2 graph view, richer editor controls, and Augmentor note actions.
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

- Cost-aware provider strategy UI.
- User-defined fallback ladder editor.
- Per-agent model policies that include price, latency, quality, subscription availability, and local runtime availability.
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
- Keep `App.tsx` as shell composition; move feature orchestration into module controllers/hooks.
- Keep archive UI modules split when they cross meaningful ownership boundaries.
- Every architecture change should update the relevant ADR, `MODULE_MAP.md`, and `FEATURE_BACKLOG.md`.
- Every user-visible feature should have deterministic tests before being called done.

## Recommended Next Work

1. Review and commit the current hardening/refactor work if the diff is acceptable.
2. Finish the Living Archive audited reorganisation design before building execution UI.
3. Add cost-aware provider strategy and fallback ladder UX.
4. Continue app-shell simplification toward the launcher/workspace/chat model.
5. Add cross-platform validation and code-splitting work before the UI grows further.
