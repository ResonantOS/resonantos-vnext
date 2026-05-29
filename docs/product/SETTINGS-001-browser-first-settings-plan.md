# SETTINGS-001: Browser-First Settings Plan

Status: Draft  
Date: 2026-05-29  
Track: Product / Architecture / UI

## Purpose

ResonantOS Settings must become the control center for the browser-first operating system, not a generic dashboard and not a clone of Hermes.

Hermes is useful as a reference because it exposes many operational surfaces that an AI agent runtime needs: model configuration, keys, sessions, logs, plugins, skills, profiles, cron jobs, analytics, and documentation. ResonantOS needs many of the same categories, but mapped to its own architecture:

- browser-first AI workspace
- Augmentor chat and Agent Control
- add-on capability grants
- provider fabric and cost-aware routing
- Living Archive / memory-system add-ons
- wallet-capable browser security
- projects, chats, artifacts, and workspaces
- local and remote runtime nodes

The goal is to use Hermes as a comparison guide, then build ResonantOS Settings around ResonantOS concepts.

## Current ResonantOS Baseline

The current browser-first Settings workspace is intentionally small:

- Provider Profiles
- provider credential save/update through the host bridge
- provider status without exposing raw secrets
- security note explaining provider grants
- archived chats and projects restore controls

This is useful but incomplete. It does not yet provide the system-level configuration needed for a mature browser-first AI app.

## Hermes Dashboard Reference

Hermes currently provides these relevant dashboard areas:

- Sessions: session history, message inspection, search, resume, and delete.
- Analytics: token, model, skill, and usage statistics.
- Models: model assignments, auxiliary task models, usage/cost summaries, and model configuration.
- Logs: filtered runtime logs and auto-refresh.
- Cron: scheduled jobs with create, pause, resume, trigger, and delete actions.
- Skills: installed skills, active skills, toolsets, and skill toggles.
- Plugins: plugin hub, plugin manifests, provider selections, and plugin rescan.
- Profiles: runtime profiles, setup commands, and profile-specific soul/context.
- Config: visual config editor plus raw YAML import/export.
- Keys: provider keys, OAuth providers, reveal/update/delete flows.
- Documentation: embedded docs entry point.
- Chat: embedded operational chat/TUI host.

Hermes also has useful dashboard infrastructure:

- protected local dashboard token for privileged endpoints
- theme/language controls
- status strip and footer
- plugin-provided dashboard pages
- route-level modular pages rather than one monolithic settings screen

## What ResonantOS Should Adopt

### Provider And Model Management

Adopt the concept of first-class provider/model settings.

ResonantOS-specific interpretation:

- provider profiles remain mediated by the ResonantOS host
- add-ons request scoped provider access, not raw credentials
- users can see configured providers, health, model availability, and fallback posture
- model routing is centralized in the provider fabric
- cost and subscription posture are visible to the user before routing choices are made

### Cost And Routing Strategy

Hermes model analytics should inspire a ResonantOS cost-aware routing page.

ResonantOS-specific interpretation:

- show estimated cost by provider/model/workload
- show subscription/local/free/paid routing labels
- let the user define task strategies such as Augmentor, Agent Control, archive ingest, routine work, recovery, and delegation
- expose fallback chains in plain language
- show when a higher-cost model will be used and why

### Sessions, Chats, Projects, And Archives

Adopt Hermes session visibility, but broaden it to ResonantOS work objects.

ResonantOS-specific interpretation:

- chats, projects, artifacts, browser jobs, and delegated tasks need one management surface
- archived work should live here rather than being an afterthought under Provider Profiles
- users need search, restore, delete, pin, fork, export, and project assignment controls

### Add-ons, Skills, And Plugins

Hermes separates skills and plugins; ResonantOS should map this to add-ons and capabilities.

ResonantOS-specific interpretation:

- add-ons are installable applications or services
- skills are capabilities exposed by add-ons or core modules
- every add-on has provenance, requested capabilities, granted capabilities, runtime state, and health
- curated add-ons may have recommended grants, but users can inspect and revoke them
- sideloaded add-ons are never implicitly trusted

### Logs, Diagnostics, And Doctor

Adopt Hermes logs/doctor/debug direction.

ResonantOS-specific interpretation:

- provide a support-ready diagnostics report
- expose system health, bridge health, extension health, browser host health, provider health, and add-on health
- logs must redact secrets by default
- privileged diagnostics stay behind host-mediated permissions

### Automations And Jobs

Hermes cron jobs map to ResonantOS automations and background jobs.

ResonantOS-specific interpretation:

- show scheduled jobs, background sync, archive cycles, delegated tasks, and browser jobs
- allow pause, resume, retry, delete, inspect, and export
- separate user-created automations from system maintenance jobs

### Profiles And Identity

Adopt the idea of profiles, but not Hermes profile semantics directly.

ResonantOS-specific interpretation:

- user identity, Augmentor identity, project identity, browser profile, and provider strategy are separate concepts
- profile settings should eventually manage user-level preferences, workspace defaults, and identity metadata
- the Resonant Engineer remains available even if the Augmentor Chat add-on is disabled

### Documentation And Help

Adopt embedded documentation.

ResonantOS-specific interpretation:

- Settings should explain why a setting matters, not only expose toggles
- advanced pages should link to ADRs and user-facing help
- help must be concise by default with expandable detail

## What ResonantOS Should Not Copy Directly

### Raw Env Editing As The Main UX

Hermes exposes env var management because it is an agent runtime dashboard. ResonantOS should not make raw environment variables the primary user flow.

Reason:

- ResonantOS will handle wallets, browser control, provider credentials, and add-ons
- raw env editing is too dangerous as the default interface
- secrets must stay behind host-side storage and explicit reveal/update flows

Raw config/env editing can exist only in Advanced Config.

### Raw YAML As The Primary Config Experience

Hermes raw YAML import/export is useful for power users. ResonantOS should keep this behind an advanced mode.

Reason:

- normal users need safe forms, explanations, previews, and rollback
- invalid config should not break the browser-first app

### Hermes-Specific Runtime Concepts

Do not copy Hermes-specific CLI, gateway, or platform settings into core ResonantOS Settings.

Reason:

- Hermes is an add-on in ResonantOS
- Hermes-specific configuration belongs inside the Hermes add-on workspace or add-on settings panel
- ResonantOS Settings should expose the add-on’s health, permissions, and launch/configure actions, not absorb Hermes internals into core

### Embedded Terminal Chat As A Settings Pattern

Hermes can embed a TUI chat. ResonantOS should not use Settings as a chat runtime.

Reason:

- Augmentor Chat is its own add-on/interface
- Settings is for configuration, diagnostics, and control
- operational chat belongs in the main workspace or sidebar, not inside Settings

## Proposed ResonantOS Settings Information Architecture

Settings should become one workspace with its own sub-sidebar. The global left rail remains a workspace/app launcher; the Settings sub-sidebar appears only inside Settings.

### Overview / Health

Purpose:

- show whether ResonantOS is ready
- summarize provider, browser, memory, add-on, and bridge health
- provide the top recommended action

Controls:

- run diagnostics
- export debug report
- open recovery mode
- restart safe local services where allowed

### Providers And Models

Purpose:

- configure provider profiles and models
- show provider health without exposing secrets
- manage primary/fallback model availability

Controls:

- add/update credentials
- select allowed models
- check provider readiness without exposing secrets
- view provider capability support

### Cost And Routing Strategy

Purpose:

- let the user agree with ResonantOS on how to spend intelligence
- make subscription/local/free/paid routing explicit

Controls:

- choose strategy per workload
- define fallback chain
- set cost posture
- configure higher-model escalation rules
- configure hard-stop behavior

### Browser And Agent Control

Purpose:

- manage AI control of webpages
- explain human approval modes
- control site-level permissions

Controls:

- ask-before-action policy
- approved/blocked sites
- sensitive-action approval rules
- browser automation history
- clear browser job state

### Add-ons And Permissions

Purpose:

- install, enable, disable, inspect, and repair add-ons
- manage capability grants

Controls:

- view installed add-ons
- view curated/sideloaded provenance
- inspect requested/granted capabilities
- revoke grants
- open add-on settings
- run add-on health checks

### Memory / Living Archive

Purpose:

- manage the active memory-system add-on
- configure source folders, archive sync, and AI Memory policies

Controls:

- select memory add-on
- connect folders or Obsidian vaults
- configure copy/move/reference policy
- view source registry
- configure auto-sync and cost posture
- open review/diagnostics when needed

### Chats, Projects, And Artifacts

Purpose:

- manage saved work objects
- prevent chat/project management from overcrowding the main workspace

Controls:

- search chats/projects/artifacts
- pin/unpin
- fork
- delete/archive/restore
- move chats into and out of projects
- export selected work

### Automations And Jobs

Purpose:

- manage scheduled and background work

Controls:

- list active jobs
- pause/resume/retry/delete
- inspect job logs
- separate user automations from system maintenance

### Profiles And Identity

Purpose:

- manage user identity, Augmentor identity, and workspace defaults

Controls:

- rename Augmentor
- configure default workspace behavior
- manage browser profile mapping
- manage project identity defaults

### Security, Wallet, And Keys

Purpose:

- centralize high-risk security controls

Controls:

- provider credential vault status
- wallet capability approvals
- signing policies
- reveal/update/delete secrets through host-mediated flows only
- audit sensitive actions

### Logs And Diagnostics

Purpose:

- make failures debuggable without exposing private data

Controls:

- filtered logs
- bridge status
- extension status
- add-on health reports
- export redacted diagnostics

### Appearance And Accessibility

Purpose:

- configure UI preferences

Controls:

- theme
- font scale
- density
- motion reduction
- touch target preference
- sidebar/sidebar history defaults

### Import, Export, And Backup

Purpose:

- manage portability and recovery

Controls:

- export settings
- import settings
- backup user state
- restore from backup
- inspect private data root location

### Advanced Config

Purpose:

- serve advanced users without endangering normal users

Controls:

- raw config view
- schema validation
- import/export raw config
- reset section to defaults
- show pending config diff before save

### Help And About

Purpose:

- explain what ResonantOS is doing and why

Controls:

- local docs
- architecture links
- version/build info
- support/debug instructions

## Prioritized Feature Backlog

### P0: Settings Foundation

- Build a modular Settings shell with a sub-sidebar and route-style sections.
- Move current Provider Profiles into `Providers And Models`.
- Move archived chats/projects into `Chats, Projects, And Artifacts`.
- Add `Overview / Health` with provider, bridge, browser host, add-on, and memory status cards.
- Add `Add-ons And Permissions` skeleton that lists add-ons, state, provenance, and capabilities.
- Add `Logs And Diagnostics` skeleton with redacted debug export placeholder.
- Keep every section in its own module file and test file.

### P1: Operational Control

- Add cost-aware routing strategy controls.
- Add browser and Agent Control permission settings.
- Add memory-system add-on settings for source folders, Obsidian vaults, auto-sync, and cost posture.
- Add automations/jobs settings.
- Add appearance/accessibility settings.
- Add search across settings sections.

### P2: Advanced And Power User Surfaces

- Add profiles/identity settings.
- Add import/export/backup settings.
- Add advanced config with schema validation and diff preview.
- Add OAuth/account provider flows where supported.
- Add plugin/add-on developer diagnostics.

## Implementation Rules

- Settings must be modular. Do not rebuild a monolithic settings file.
- The Settings workspace may own layout and routing only; each settings area owns its own renderer/controller.
- No raw provider credentials, wallet secrets, session tokens, or private keys may be rendered into the browser extension.
- Every privileged mutation must go through the host bridge with an explicit capability.
- Every settings section needs deterministic DOM tests before it is considered complete.
- Touch compatibility is required: primary controls should remain easy to hit and avoid dense default tables.
- Advanced technical data should be progressive-disclosure, not default visual noise.
- Hermes integration must stay add-on-scoped. Core ResonantOS Settings can show Hermes health/permissions, but Hermes-specific internals belong inside the Hermes workspace/add-on settings.

## Initial Implementation Sequence

1. Create the Settings sub-sidebar and section router.
2. Migrate existing Provider Profiles into the new Providers section without changing credential behavior.
3. Migrate archived chats/projects into the Chats/Projects section.
4. Add Overview / Health using existing bridge/provider/browser state where available.
5. Add Add-ons / Permissions skeleton using current add-on registry data.
6. Add Logs / Diagnostics skeleton and redacted debug report contract.
7. Only after the shell is stable, implement cost-aware routing and browser-control settings.

## Detailed Delivery Checklist

This checklist is the implementation tracker for the browser-first Settings workspace. Each slice must ship with deterministic tests and must preserve the host-mediated security boundary.

### Slice 1: Settings Shell Foundation

Status: Implemented.

Acceptance criteria:

- Settings renders as one center workspace with an internal sub-sidebar.
- The global left rail remains an app/workspace launcher, not a settings menu.
- Section routing works without reloading the page.
- The implementation exposes a stable `renderSettingsWorkspace(...)` entrypoint for the main workspace.
- CSS is responsive down to narrow windows and keeps controls inside their cards.

Verification:

- DOM test proves default Overview route.
- DOM test proves switching from Overview to Providers.
- Browser-first contract test still detects the Settings workspace.

### Slice 2: Providers And Models

Status: Implemented credential/readiness baseline; incomplete for allowed model selection.

Acceptance criteria:

- Provider status loads through `/providers/status`.
- Credentials save through `/providers/credentials` with `provider-credential-write`.
- Raw credentials, tokens, and previews are not rendered.
- Provider cards show model list, role, and configured/missing state.
- Provider readiness checks report local vault and routing availability through `/providers/health` without rendering credentials or spending model tokens.
- Provider cards link directly into the Routing section so fallback/cost strategy is discoverable from the provider profile that depends on it.
- Users can save allowed-model policy per provider through `/providers/model-preferences`; routing ignores disabled models for Auto routing and manual model selection.
- Provider fallback behavior has deterministic tests for primary subscription routing, disabled-model fallback, paid escalation, hard-stop no-route behavior, and local recovery fallback.
- Provider cards expose an explicit `/providers/connectivity-test` action that checks bounded endpoint reachability without sending prompts or model generation requests.
- Provider connectivity checks are recorded in a bounded, redacted `/providers/diagnostics-history` list so repeated failures can be compared without rerunning diagnostics.
- Provider Settings derives recovery suggestions from diagnostics history so repeated auth failures, missing credentials, network instability, and reachable states become clear next actions.

Future work:

- Add subscription/local/cost labels.
- Add deeper provider-specific runbooks once the generic recovery suggestion identifies the failure class.

### Slice 3: Chats, Projects, And Artifacts

Status: Implemented active chat/project management baseline plus archive restore.

Acceptance criteria:

- Archived chats and projects appear in Settings, not under Provider Profiles.
- Archived chats can be restored and opened.
- Archived projects can be restored.
- Active chats and projects appear with compact counts.
- Active chats can be opened, moved into or out of projects, archived, or deleted after confirmation.
- Active projects can be created, renamed, pinned/unpinned, archived, or deleted after confirmation.
- Search filters active and archived chats/projects.
- Recent intake artifacts appear in Settings with filter, preview, copy-path, and review-request actions.

Future work:

- Add deeper destructive-action confirmation copy.
- Improve artifact export and artifact management controls inside this section.
- Add richer artifact export controls beyond copy-path, preview, and review-request.

### Slice 4: Overview And Health

Status: Implemented baseline.

Acceptance criteria:

- Overview summarizes provider, add-on, memory, and browser bridge state.
- Overview degrades safely if a host endpoint is missing.
- Overview gives the user one clear recommended next action.

Future work:

- Add real browser host health.
- Add extension/native bridge version checks.
- Add memory add-on replacement warning.

Implemented:

- Overview exposes Open Diagnostics, Export Report, and Start Recovery Handoff actions.
- Export Report uses the same redacted diagnostics export capability as the Diagnostics section.
- Start Recovery Handoff creates a governed Resonant Engineer delegation packet instead of granting raw repair authority from Settings.

### Slice 5: Add-ons And Permissions

Status: Next.

Acceptance criteria:

- Add-ons section loads registry data from `/addons/status`.
- Each add-on shows name, availability, mode, trust/provenance, and boundary.
- Capability grants are shown if the registry provides requested/granted capability arrays.
- Requested, granted, pending-review, and denied capabilities render as separate review groups.
- Missing add-ons are clearly disabled.
- Hermes-specific internals stay out of core Settings.
- No add-on receives direct configuration authority from this screen unless a host-mediated route exists.

Tests:

- DOM test for available/missing add-ons.
- DOM test for capability summary.
- DOM test for bridge failure without secret leakage.

Implemented:

- Host `/addons/status` exposes requested, granted, and denied capability arrays for the currently visible add-on registry entries.
- Settings renders capability review groups as Granted, Needs review, and Denied without adding mutation controls.

### Slice 6: Logs And Diagnostics

Status: Implemented baseline; incomplete for live log filtering.

Acceptance criteria:

- Diagnostics route shows bridge status, browser host status, provider status, add-on status, and memory status.
- Redacted support report export exists as a host-mediated action.
- The report never includes raw credentials, wallet secrets, dashboard session tokens, or private key material.

Tests:

- DOM test for successful diagnostics summary.
- DOM test for report export route and capability.
- Redaction test using deliberately secret-looking fixture strings.

Future work:

- Add live log filters once a host log-read route exists.
- Add browser native host version/health once the native host exposes structured status.
- Add one-click Recovery handoff from failed diagnostics.

### Slice 7: Browser And Agent Control

Status: Implemented baseline.

Acceptance criteria:

- Settings exposes current site permission mode.
- User can view approved/blocked sites.
- User can revoke site permissions and task consent.
- User can inspect recent browser jobs and clear terminal job state.
- Wallet, credentials, public submit, and signing remain hard approval boundaries.

Tests:

- DOM test for current site mode.
- DOM test for site permission reset action.
- DOM test for task consent revoke action.
- DOM test for browser job history and terminal-job clearing.
- DOM test for unavailable browser/store degradation.
- Dangerous wallet, credential, public-submit, and signing boundaries remain described as approval-gated.

Implemented:

- Settings exposes the active tab site key and current permission mode when a readable tab exists.
- Settings lists stored site permissions and trusted task-class consents.
- Settings lets the user reset site permissions and revoke task consents through scoped stores.
- Settings lists recent browser jobs, highlights the focused job, and clears terminal browser-job history.
- Settings degrades to safe empty states when browser APIs or stores are unavailable.

Future work:

- Add editable global approval policy defaults after the policy contract is formalized.
- Add richer audit timeline filtering once audit storage gets its own indexed host route.
- Add one-click per-site permission promotion/demotion only after stronger confirmation UX is built.

### Slice 8: Cost And Routing Strategy

Status: Implemented baseline.

Acceptance criteria:

- User can see workload strategies for Augmentor, Agent Control, archive ingest, routine work, recovery, and delegation.
- Each strategy shows primary route, fallback chain, cost posture, and hard-stop behavior.
- UI distinguishes subscription, local, free, and paid-per-call routes.
- Saving a strategy goes through a host-mediated route.

Tests:

- DOM test for strategy rendering.
- DOM test for fallback chain rendering.
- Mutation test for save route and capability.
- Contract test for provider routing route and capability.

Implemented:

- Host exposes `/providers/routing-strategies` as the centralized routing policy surface.
- Host persists strategy overrides in `~/ResonantOS_User/ProviderFabric/routing-strategies.json` with private file permissions.
- Routing strategies cover Augmentor Chat, Agent Control, Archive Ingest, Routine Delegation, and Recovery Engineer.
- Settings shows primary model, fallback chain, configured/unavailable state, cost posture, hard-stop behavior, and workload class.
- Settings saves strategy changes through `provider-routing-write`; add-ons do not choose final models directly.

Future work:

- Add measured usage/cost summaries once provider usage accounting exists.
- Add richer local/remote runtime health checks for GX10 and desktop-local models.
- Add policy presets that can be negotiated during first-run setup.

### Slice 9: Memory / Living Archive Settings

Status: Implemented baseline; memory workspace remains the deep operations surface.

Acceptance criteria:

- User can see active memory-system add-on.
- User can choose/replace memory-system add-on when supported.
- User can see connected folders or Obsidian vaults.
- User can configure auto-sync and cost posture.
- Deep review and source-management workflows stay in the Memory workspace.

Tests:

- DOM test for active memory add-on.
- DOM test for source folder/vault status.
- DOM test for auto-sync and sync-mode save route.
- DOM test for settings error redaction.
- Contract test for memory settings route and capability.

Implemented:

- Host exposes `/memory/settings` as the memory-system configuration surface.
- Host persists memory settings in `~/ResonantOS_User/Memory/CONFIG/memory-settings.json` with private file permissions.
- Settings shows active memory-system add-on, wiki page count, intake artifact count, connected source count, and sync posture.
- Settings can register folders or Obsidian vaults with ownership class: human knowledge, external knowledge, or mixed library.
- Settings can mark source import mode: copy-on-import, move-on-import, or linked-read-only.
- Settings saves auto-sync and sync-mode policy through `memory-settings-write`.

Implemented after baseline:

- Host exposes `/memory/source/browse` with `memory-source-browse` capability.
- Folder browsing is host-mediated and uses platform folder dialogs without shell interpolation.
- The route supports deterministic `RESONANTOS_BROWSER_FIRST_PICK_FOLDER_RESULT` override for tests.
- Settings adds a Browse button that fills the source path and auto-selects Obsidian vault kind when `.obsidian` is detected.
- Cancellation leaves any existing typed path unchanged.
- Host exposes `/memory/source/scan` with `memory-source-scan` capability.
- Source scanning classifies files as compatible, processed, raw audio, media, hidden, or unsupported before the user saves the source.
- Settings shows the scan summary inline, including sample files and an import recommendation, so users can see what the Living Archive will be asked to handle.
- Scan results auto-select Obsidian vault kind when `.obsidian` is detected.
- Host exposes `/memory/source/action` with `memory-source-manage` capability.
- Settings can disable a source without deleting the record, re-enable disabled sources, or remove a source from active configuration.
- Source disable/remove operations append to `~/ResonantOS_User/Memory/CONFIG/source-audit.md` with redacted local paths.
- Host exposes `/memory/source/review` with `memory-source-review` capability for read-only connected-source review from the Living Archive workspace.
- Host exposes `/memory/source/intake` with `memory-source-intake` capability to create governed source review intake summaries under `Memory/INTAKE/sources`.
- The Living Archive workspace shows connected sources, candidate file classifications, source review boundaries, and a one-click governed intake summary path.
- Creating a source intake summary from the Living Archive workspace now automatically opens a review request against that summary, keeping it inside the existing review/draft/verify/promote pipeline.
- Host exposes `/memory/source/file-intake` with `memory-source-file-intake` capability for selected markdown/text-compatible source files.
- The Living Archive workspace can create individual governed intake artifacts from selected compatible source files and automatically open review requests for each artifact.
- Source review candidates are grouped by folder and can be filtered by category or filename text before selection.
- Connected sources can be filtered by active, disabled, missing, and text before starting source review.
- Host exposes `/memory/wiki/health` as a core LLM Wiki health route.
- The Living Archive workspace shows wiki health score, index/log state, broken-link samples, orphan-page samples, duplicate-title samples, and missing-index-entry samples.
- Selected source-file intake records `sourceContentHash`, `sourceVersion`, and `previousSourceContentHash` in frontmatter.
- Unchanged duplicate source-file imports are rejected so the source manifest reflects meaningful versions instead of repeated copies.
- Host exposes `/memory/source/versions` so the Living Archive workspace can show imported source-file version history.
- Host exposes `/memory/source/diff` so changed source files can be previewed against the last governed intake artifact without mutating the original source.
- Living Archive source review can create intake from all new/changed compatible files in one action and skip unchanged files.

Future work:

- Keep raw audio/media as classified source material only until the core add-on contract is ready; do not add processor-specific flows to the base Living Archive.
- Add scheduled wiki lint runs and versioned health snapshots after the core scheduler/audit store is finalized.
- Add source-change approval UX once the diff preview has been tested against larger real vaults.

### Slice 10: Appearance And Accessibility

Status: Implemented baseline for main workspace.

Acceptance criteria:

- Theme, density, font scale, reduced motion, and touch target preferences are configurable.
- Preferences apply to both main workspace and side panel where possible.
- Defaults remain readable and touch-compatible.

Tests:

- DOM test for preference save.
- CSS/state test for applied density/font classes.

Implemented:

- Settings exposes density, font scale, and motion preferences.
- Preferences persist in extension-local storage under `augmentorAppearancePreferences`.
- Main workspace applies preferences at startup and immediately after save.
- Compact density supports desktop power use; touch density increases minimum control size.
- Reduced motion disables long-running animation/transition behavior for accessibility.

Future work:

- Mirror preferences into the side-panel surface.
- Add visual theme presets after the design system variables are stabilized.
- Add OS-level reduced-motion/default-font detection where Chromium APIs expose it reliably.

### Slice 11: Profiles, Identity, Backup, Advanced Config, Help

Status: Deferred until core operational settings are stable.

Acceptance criteria:

- Profiles/Identity can rename Augmentor and show browser profile mapping.
- Backup can export/import safe user-owned state.
- Advanced Config has schema validation and diff preview.
- Help/About links local documentation and version/build metadata.

Tests:

- One deterministic test per sub-section before enabling it in the visible sidebar.

## Open Questions

- Should Settings open in the center workspace only, or should it support a detachable full-window mode later?
- Which sections should be visible in the first public build versus hidden behind Advanced?
- Should memory-system replacement be configured under Add-ons first or Memory first?
- Should Hermes expose a small ResonantOS-native add-on settings adapter, or should we embed its dashboard settings as-is?
