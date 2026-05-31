# ResonantOS Browser-First Core Implementation Feature List

Status: active implementation guide  
Scope: browser-first ResonantOS core only  
Out of scope for this phase: processor-specific add-ons, Audio2TOL-specific flows, Hermes-specific internals, OpenCode-specific internals, wallet transaction automation

## Product Direction

ResonantOS is now a browser-first AI workspace. The browser is the primary app surface, and ResonantOS lives inside it as:

- a main new-tab workspace for full-screen Augmentor interaction, projects, history, memory, settings, and add-on entrypoints
- a persistent side-panel workspace for browser-context interaction while the human is browsing
- a host-mediated control layer for browser actions, memory writes, provider access, and future add-on dispatch

The base system must stay useful without optional add-ons. Add-ons may extend it, but the core should not depend on them.

## Core Feature Areas

### 1. Main Workspace

Goal: make the new-tab workspace the main place where the user starts work.

Required behavior:

- New tab opens a clean Augmentor chat by default.
- Main chat and side-panel chat share the same underlying chat capabilities.
- The side-panel chat stays closed when the user is in the main full-screen chat workspace.
- If a task requires browser control, the workspace can shift into browser/task mode while keeping Augmentor visible in the side panel.
- The left rail supports New Chat, Search, Pinned Add-ons, Projects, Chats, Settings, and user/account area.
- Chats can be pinned, unpinned, forked, deleted, and moved into/out of projects.
- Projects represent real work containers, not add-ons.
- A project can contain chats, artifacts, and later code/doc references.
- Settings provides a management surface for active and archived chats/projects so the main workspace rail does not become the only place to organize work.

Current status:

- Main workspace exists.
- Left rail has New Chat, Search, Pinned Add-ons, Projects, Chats, Settings, pin/fork/delete controls, and drag/drop project assignment.
- Project assignment now requires a real active project container; stale project links are cleared during chat-session hydration.
- Left rail chat/project rows expose active-chat and project-expanded ARIA state so persisted rail interactions remain keyboard/screen-reader inspectable.
- Rail search now uses a shared tested matcher for loose chats and projects, so projects remain visible when their name or any contained chat matches the search.
- Settings > Chats & Projects now shows active chats/projects, search, project creation, project rename, project pin/unpin, chat project assignment, archive, restore, confirmation-based delete actions, and recent intake artifact filter/preview/review/export actions.
- Needs deeper validation around empty states, keyboard accessibility, and persisted rail interactions.

### 2. Augmentor Chat

Goal: make Augmentor reliable and consistent in both full-screen and side-panel formats.

Required behavior:

- Blank new chats by default unless the user chooses a previous session.
- Markdown renders as formatted content, not raw syntax.
- Enter sends, Shift+Enter inserts a newline.
- Command+A, Command+C, Command+X, Command+V, Command+Z work in chat inputs.
- Copy, fork, edit, retry, delete, and artifact/intake actions are available where appropriate.
- The composer shows model, context window, attachments, intake/save controls, microphone state, and send action with compact icons.
- Augmentor should not expose internal tool instructions as user-facing answer text.
- Augmentor can delegate from normal chat language through the ResonantOS agent control layer, without requiring the user to manually switch to a separate delegation command surface.
- Natural delegation remains mediated: Hermes, OpenCode, and Resonant Engineer receive governed task packets; add-ons do not become trusted core agents.
- When Augmentor is working, the UI shows what it is doing.

Current status:

- Core chat works against configured providers.
- Keyboard behavior is partially implemented and has passed recent checks.
- Main and side-panel composer parity is partially implemented.
- Natural language delegation routing is implemented for Hermes, OpenCode, and Resonant Engineer so Augmentor does not incorrectly deny delegated work when the target is clear.
- Delegation routing has been hardened so “spawn,” “dispatch,” and “agent control layer” phrasing is intercepted before provider chat, and the provider prompt tells Augmentor that governed delegation is a ResonantOS capability.
- Needs deterministic end-to-end UI verification after each composer change.

### 3. Agent Control Mode

Goal: make Augmentor able to operate the current webpage in a Comet-level pattern while preserving human approval for sensitive actions.

Required behavior:

- Augmentor can observe the current page.
- Augmentor can plan browser actions.
- Augmentor can click, type, scroll, navigate, and verify results through safe host-mediated commands.
- The human sees a persistent AI-control overlay while the browser is under agent control.
- The overlay shows the current action, such as reading, clicking, typing, taking screenshot, working, or waiting for approval.
- The human can stop an active run.
- Stopping an active Agent Control run records the stopped step in the durable trace instead of only changing the top-level job status.
- Sensitive actions, credential entry, wallet actions, checkout, public posting, and irreversible actions require explicit approval or are blocked.
- Browser jobs are logged as structured artifacts.

Current status:

- Agent control mode exists and can complete several tested browsing/search/cart/booking scenarios.
- Approval gates exist.
- Overlay exists and has been iterated toward Comet-like behavior.
- Page overlay now updates per active/blocked/failed step with the current action label and phase, instead of only showing a generic run-level state.
- Agent Control progress summaries now distinguish successful completion from terminal resolution, so blocked/failed steps are visible without pretending the task fully completed.
- Agent Control now performs post-action page-state verification for successful browser mutation/navigation steps and records uncertainty when no visible state change is detected.
- Agent Control now prevents repeated identical actions after a no-visible-change verification result, so it stops with guidance instead of looping on the same click/type/navigation.
- Cancelled runs now surface as stopped, preserve the interrupted step, and sync that trace back to the browser job record.
- Durable browser jobs now flag stale running/approval work when no progress has been recorded for the threshold window; `/jobs` and the monitor show last-activity timing plus recommended human action without silently changing job state.
- Blocked browser-control delegations now carry a bounded context packet for the receiving add-on agent, including source run id, controlled target, progress, blocker reason, recent trace, and authority boundaries.
- The Add-ons workspace now exposes recent governed delegation packets for Hermes, OpenCode, and Resonant Engineer, including source and context-packet evidence.
- Needs stronger action trace, long-run resilience, and broader deterministic fixture tests.

### 4. Living Archive Core

Goal: implement the LLM Wiki memory pattern as a core memory system without add-on lock-in.

Required behavior:

- Preserve human/source knowledge separately from AI-curated memory.
- Maintain a governed intake/review/draft/verify/promote pipeline.
- Connected folders and Obsidian vaults can be registered as memory sources.
- Source scan classifies files before intake.
- Compatible text/markdown/json/csv files can become governed intake artifacts.
- Raw audio/media stays classified but is not directly ingested by the base system.
- AI Memory wiki promotion remains controlled by the Living Archive pipeline, not arbitrary add-on writes.
- The system keeps index/log/review/promotion artifacts clear and auditable.

Current status:

- Memory root and Living Archive pipeline exist.
- Connected source settings, folder browse, scan, enable/disable/remove, source review, and selected-file governed intake exist.
- Review, draft, verification, promotion, and restore flows exist.
- Wiki health now checks for missing `index.md`/`log.md`, broken wiki links, orphan pages, duplicate titles, and pages missing from `index.md`.
- Source file intake now records content hashes and source versions, rejects unchanged duplicate imports, and preserves the original connected source.
- Source version history is visible from Connected Source Review, using the host-managed source version manifest.
- Connected Source Review marks compatible files as new, changed, unchanged, or tracked against the source version manifest.
- Changed/tracked compatible files can open a bounded diff preview against the last governed intake artifact.
- Connected Source Review can create governed intake from all new/changed compatible files in one action while skipping unchanged files.
- Needs scheduled wiki lint operations and richer source-change approval UX.

### 5. Settings

Goal: make Settings a coherent control center, not a scattered debug page.

Required sections:

- Overview and system health
- Provider Profiles
- Model Routing and cost strategy
- Browser and Agent Control
- Memory / Living Archive
- Projects and Workspaces
- Add-ons
- Privacy and Permissions
- Diagnostics and Logs
- About / Version / Updates

Required behavior:

- Settings should use a left sub-navigation inside the main workspace.
- Each section should have clear user-facing explanation and compact controls.
- Dangerous or privileged operations must be explicit and reversible where possible.
- Provider credentials must not be exposed raw in the UI.

Current status:

- Settings exists and has a modular implementation baseline.
- Memory source management is implemented.
- Overview now exposes Open Diagnostics, Export Report, and governed Resonant Engineer recovery handoff actions.
- Needs information architecture cleanup against the current feature list.

### 6. Add-on Platform Boundary

Goal: keep ResonantOS modular without letting add-ons become trusted core by accident.

Required behavior:

- Core includes add-on registry and capability model.
- Base install may show pinned add-on entrypoints, but add-ons are optional.
- Add-ons declare capabilities.
- ResonantOS mediates provider, memory, browser, filesystem, and future wallet access.
- Add-on-specific flows stay out of base core unless implemented as generic contracts.

Current status:

- Add-on manifest/draft surfaces exist.
- Pinned add-on UI exists.
- Add-on status now exposes requested, granted, and denied capability metadata for core-visible add-ons.
- Settings > Add-ons renders granted, needs-review, and denied capability groups so users can inspect trust posture without granting new authority from the screen.
- Processor-specific add-on workflows are deferred.
- Needs install/enable/disable UX validation and future host-mediated grant/revoke flows.

### 7. Provider Fabric

Goal: route AI work according to user strategy, capability, cost, and availability.

Required behavior:

- User can configure provider profiles.
- The system supports primary and fallback routes.
- Routing considers workload type, quality needs, cost, local/cloud availability, and recovery mode.
- Missing credentials produce clear actionable errors.
- Provider access is mediated by ResonantOS.

Current status:

- Provider profile and routing implementation exists.
- MiniMax integration has been used successfully.
- Provider Settings now shows host vault state, credential presence, model cost/quality metadata, and routing strategies that depend on each provider.
- Provider Settings can run a host-mediated readiness check for each provider without exposing credentials or spending model tokens.
- Provider Settings links directly to centralized Routing so users can adjust model/fallback strategy from the provider profile flow.
- Provider Settings can save per-provider allowed-model policy, and provider routing ignores disabled models for both Auto routing and manual model selection.
- Provider Settings has an explicit user-triggered connectivity test that checks bounded provider endpoint reachability without sending prompts or model generation requests.
- Provider Settings shows bounded, redacted provider diagnostics history so repeated auth/network failures are visible without rerunning checks.
- Provider Settings derives recovery suggestions from recent diagnostics history, including credential recovery, missing credential, network-route instability, and reachable/no-action states.
- Chat composers now include an Auto route option. Auto route sends the Augmentor Chat workload to the host so the provider fabric can apply the user-approved primary/fallback strategy.
- Provider fallback behavior now has deterministic coverage for primary subscription routing, disabled-model fallback, paid escalation, hard-stop no-route behavior, and local recovery fallback.
- Needs deeper provider-specific runbooks after recovery suggestions identify the failure class.

### 8. Deterministic Testing And Release Discipline

Goal: every implemented slice must be tested before being called done.

Required checks:

- Focused unit/contract tests for the changed area.
- Full browser-first test suite after meaningful changes.
- Production build before release/push.
- App install/reopen after app-shell changes.
- Screenshot or UI-level verification after visual/frontend changes when practical.

Current baseline commands:

```bash
node --test browser-first/test/*.test.mjs
npm run build
npm run browser-first:install
```

Rust/Tauri checks apply only when the legacy Tauri app is changed.

## Immediate Core Sequence

1. Stabilize current core after the recent UI/settings/memory work.
2. Complete Settings information architecture and Provider Profiles UX.
3. Strengthen main workspace chat/session/project persistence.
4. Improve Agent Control Mode trace, status, stop controls, and deterministic fixtures.
5. Expand Living Archive core wiki health/lint/versioning tests.
6. Validate real local CLI execution enablement UX for Hermes and OpenCode. Both add-ons now have governed packet lifecycle routes, deterministic start/read-result coverage, and explicit opt-in before real local CLI execution.
7. Improve add-on capability review UI without implementing processor-specific add-ons.
8. Run full deterministic verification and push only after green checks.
