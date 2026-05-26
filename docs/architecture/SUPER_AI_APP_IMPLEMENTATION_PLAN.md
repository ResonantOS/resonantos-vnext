# ResonantOS Super AI App Implementation Plan

Status: planning document
Date: 2026-05-24
Intent citation: ADR-015, ADR-018, ADR-025

## Purpose

Turn ResonantOS from a modular AI dashboard into a super AI app: one trusted control surface where the human can set goals, supervise long-running work, delegate to specialized agents/add-ons, operate browser sessions, preserve memory, and audit results.

This plan is written for parallel `/goal` sessions. Each workstream should be implementable independently, with explicit contracts and deterministic validation.

## Current GitHub State

Repository: `ResonantOS/resonantos-vnext`

Observed branches after fetch:

- `origin/main`: `17796fd` - last known passing public baseline.
- `origin/dev`: `ffc839d` - ahead of `main` with chat/context-memory, auth/API proxy, runtime adapter, Camofox, mobile/cloud UI, Architecture Canvas, and other community work.
- `origin/fix/gtk-children-prop-error`: `9f1d051` - defensive chat rendering fix on top of dev and tunnel work.

Important status:

- Latest `origin/dev` GitHub Actions run failed on macOS and Ubuntu at `cargo fmt --check`.
- Windows passed on the same run.
- Failures are formatting-related in Camofox/Marionette/Resonator Rust files, not frontend test failures.
- `origin/dev` also contains committed build artifacts under `crates/resonator-control/target/`, despite `.gitignore` excluding `crates/*/target/`. This must be cleaned before `dev` is treated as a merge-ready base.
- All public issues are currently closed, but several contain useful feedback that must be preserved:
  - Linux GTK/WebKit rendering glitches need environment/platform handling.
  - Browser child window focus issues were fixed by PR #7.
  - Chat detached tab orientation was fixed by PR #7.
  - Runtime Adapter Layer was implemented in dev.
  - Pi5 split-mode backend PR #12 was closed/paused because GTK rendering on Pi5 was still not acceptable.

Recommended branch posture:

- Do not merge `origin/dev` wholesale into main work until CI is green and generated artifacts are removed.
- Use `origin/main` as the stable baseline if immediate release safety matters.
- Use `origin/dev` as the feature mining branch for Runtime Adapter, Camofox research, cloud/auth, and mobile UI improvements.
- First maintenance task should be `dev` cleanup: remove generated target artifacts, run `cargo fmt`, re-run CI, and then decide which features graduate.

## Browser Engine Decision

### Chromium / CDP Path

Strengths:

- Chrome DevTools Protocol is the mature instrumentation layer for Chromium-family browsers.
- Microsoft WebView2 on Windows is Chromium-based and updates itself.
- Playwright and similar tools provide robust cross-browser automation and agent/MCP control.
- Best path for extension-heavy workflows on Chromium-compatible browsers, including wallets and password managers.
- Best fit for deterministic AI browser actions: accessibility snapshots, click/type/read/capture evidence, network tracing, and screenshots.

Weaknesses:

- True embedded Chromium with extension support is hard in Tauri.
- CEF packaging and in-process embedding remain complex.
- Wallet/Bitwarden compatibility must be proven before product commitment.

### Firefox / Camofox / Marionette Path

Strengths:

- Firefox has official remote protocols: Marionette and WebDriver BiDi.
- Camofox/Camoufox may be useful for anti-detection or sites that block normal Chromium automation.
- The dev branch has a concrete Camofox service, Marionette bridge, add-on manifest, and tests.

Weaknesses:

- Repo gap analysis says Camofox is not a true embedded browser. It uses screenshot refresh and/or OS window overlay strategies.
- Human interaction inside the ResonantOS frame is not solved.
- Phantom wallet end-to-end flow was not proven.
- Firefox/Gecko embedding into Tauri is not a clean product path.
- The Camofox branch currently breaks CI formatting and needs cleanup.

### Browser Recommendation

Use a dual-engine architecture, but keep Chromium as the primary product browser.

- `Resonant Browser` remains the default browser add-on.
- Primary engine: Chromium-compatible controlled browser with CDP/Playwright-style semantics.
- Secondary engine: Camofox as an optional stealth/research backend, not the default browser replacement.
- The user sees one Browser surface. Engine routing is internal and policy-based.
- Camofox may handle specific anti-bot or blocked-site cases if it can pass deterministic tests.
- Wallet/browser-extension workflows should not depend on Camofox until Phantom/Bitwarden are proven end-to-end.

Required browser acceptance tests:

- AI and human operate the same visible browser session.
- Browser state survives workspace switches.
- `read_page`, `click`, `type`, `scroll`, `screenshot`, and `capture_evidence` work through host-mediated tools.
- Sensitive typing requires human approval.
- Extension loading requires human approval.
- Wallet confirmation state is visible and auditable.
- Linux does not spawn persistent/dismissal-broken child windows.
- Camofox is marked experimental until it passes actual interactive and wallet tests.

## Super AI App Target Model

ResonantOS should provide:

- A trusted front door: Augmentor.
- Persistent goal workspaces.
- Delegation to specialized worker agents/add-ons.
- Browser/tool operation through explicit capability gates.
- Skills and workflow packages for repeatable operations.
- Active task monitoring and artifact review.
- Living Archive intake for useful outputs.
- Cost-aware provider and runtime routing.
- Cross-channel continuity, including detached chat and future Telegram/mobile surfaces.

Augmentor should be the executive operator, not the default worker.

Augmentor owns:

- understanding user intent
- clarifying goals and constraints
- selecting/directing the right tool or agent
- creating delegation packets
- monitoring task status
- reviewing returned artifacts
- explaining results
- writing useful outputs to intake

Augmentor should not directly bypass:

- provider routing
- capability grants
- archive write boundaries
- browser safety approvals
- filesystem/process guardrails

## Workstream 0: Stabilize GitHub Base

Goal:

Make the current community/dev branch trustworthy enough to use as an integration source.

Scope:

- Remove committed generated artifacts under `crates/resonator-control/target/`.
- Run `cargo fmt` over dev Camofox/Marionette/Resonator files.
- Re-run `npm test -- --run`, `npm run build`, `cargo test`, and GitHub Actions.
- Review `origin/fix/gtk-children-prop-error` and cherry-pick or merge the defensive `MessageContent` fix if not already present in the chosen base.
- Decide whether `origin/dev` becomes the new base or remains a feature-mining branch.

Deliverables:

- Green CI on `dev`.
- Short merge-readiness report.
- Explicit list of features accepted, rejected, or deferred from `dev`.

Do not:

- Start new super-app features before this is complete if the work will target `dev`.
- Merge Camofox as default browser.

## Workstream 1: Augmentor Command Layer

Goal:

Give Augmentor explicit super-app commands that turn chat into an operating surface.

Commands:

- `/goal`
- `/delegate`
- `/browser`
- `/status`

Implementation:

- Add a command parser in the chat controller, separate from normal LLM message handling.
- Commands should produce typed host actions, not string heuristics.
- Keep command execution in controller modules, not `App.tsx`.
- Store command results as conversation messages plus structured task/goal state.

`/goal` behavior:

- Creates a persistent Goal Workspace.
- Captures mission, success criteria, constraints, budget/cost policy, deadline, active context, memory refs, and allowed agents/tools.
- Can run for long tasks across sessions.
- Tracks phases: proposed, active, waiting, delegated, blocked, completed, archived.
- Must expose progress and artifacts in `/status`.

`/delegate` behavior:

- Creates a Delegation Packet.
- Lets Augmentor choose or the user specify target: Hermes, OpenCode, Engineer, Browser, Logician, or future add-on.
- Includes mission, files/sources in scope, tool grants, forbidden actions, verification requirements, return protocol, and cost policy.
- Can either create-only or dispatch if target runtime supports dispatch and approval is satisfied.

`/browser` behavior:

- Starts a browser task under the Browser Skill.
- Supports inspect, navigate, research, fill, capture evidence, and compare.
- Sensitive actions require approval.

`/status` behavior:

- Shows active goals, delegated tasks, browser sessions, blocked approvals, recent artifacts, and failed checks.

Validation:

- Unit tests for parser.
- Controller tests for each command.
- App-level test for creating a goal, delegating to OpenCode, and showing `/status`.

## Workstream 2: Goal Workspace Runtime

Goal:

Implement durable long-running task state so Augmentor can keep working on an objective rather than a single chat turn.

Data model:

- `GoalWorkspace`
- `GoalPhase`
- `GoalStep`
- `GoalArtifact`
- `GoalBlocker`
- `GoalCostPolicy`
- `GoalDelegationRef`
- `GoalMemoryRef`

Storage:

- Host-owned runtime state initially.
- Later: persisted goal workspaces under ResonantOS state root.

Required operations:

- create goal
- update goal phase
- add step
- attach artifact
- attach delegation
- mark blocker
- resume goal
- archive goal

UI:

- Goal strip in chat.
- Goal detail in center workspace.
- Goal appears in Delegation Monitor/status dashboard.

Validation:

- Goals survive app reload.
- Goals can continue after provider fallback.
- Blocked goals show approval/action required.

## Workstream 3: Delegation Dispatch Layer

Goal:

Move from “workspace created” to controlled dispatch for add-on workers.

Targets:

- Hermes for communication/coordinator tasks.
- OpenCode for coding work.
- Engineer for system repair/recovery tasks.
- Browser for web-operation tasks.

Implementation:

- Extend Delegation Packet with dispatch state.
- Add dispatch adapters per target.
- Add collection and verification hooks.
- Keep human-visible monitoring.

State machine:

- created
- approved
- dispatched
- running
- awaiting-human
- returned
- verified
- rejected
- completed

Rules:

- No silent destructive actions.
- No worker output is promoted into code, config, or memory without review/verification.
- Every dispatch must record audit events.

Validation:

- Dispatch to OpenCode visible session.
- Dispatch to Hermes returns draft/artifact without external send.
- Failed dispatch degrades safely.

## Workstream 4: Browser Control Skill And Tool Bridge

Goal:

Allow Augmentor, Hermes, and delegated browser tasks to operate the browser safely through host tools.

Implementation:

- Add Browser Augmentor Skill document.
- Define a canonical `BrowserTask`.
- Add a tool bridge that maps typed browser actions to current `createBrowserToolRunner`.
- Add capability checks at bridge level and runtime level.
- Add evidence capture artifacts.

Core tools:

- health
- start/open_url
- read_page
- click
- type
- scroll
- screenshot
- capture_evidence
- extension list/load/disable
- wallet confirmation status

Approval gates:

- sensitive typing
- extension loading
- wallet actions
- financial/public/external submissions
- login/account mutation

Engine routing:

- default: Chromium/CDP-compatible engine
- experimental: Camofox for selected blocked/anti-detection cases
- routing decision must be auditable

Validation:

- Browser read/click/type against deterministic local test page.
- Sensitive type blocked without approval.
- Evidence artifact written to intake or task workspace.
- Camofox remains hidden/experimental unless interactive tests pass.

## Workstream 5: Runtime Adapter Integration

Goal:

Use the dev Runtime Adapter Layer to support external execution backends without giving up ResonantOS control.

Implementation:

- Review and adapt `src/core/runtime-adapter/*` from `origin/dev`.
- Align types with existing provider fabric and add-on capability grants.
- Runtime adapters should be execution backends, not policy owners.
- Native adapter remains fallback.
- External adapters may include Codex CLI, Claude Code, OpenCode, Hermes, local model runtimes.

Rules:

- ResonantOS keeps the loop, policy, memory boundary, and audit trail.
- Runtime adapters execute bounded tool calls or delegated tasks.
- Shield/Logician-style checks remain host-side.

Validation:

- Registry selects healthy runtime by tier.
- Degraded runtime falls back to native.
- Security-tier mismatch denies execution.

## Workstream 6: Super-App Task Monitor

Goal:

Expose a clear, touch-friendly central surface for goals, delegations, browser tasks, and artifacts.

UI:

- Active Goals
- Running Tasks
- Waiting For User
- Recent Artifacts
- Failed/Blocked
- Provider/Runtime Cost State

Requirements:

- Desktop and touch-screen compatible.
- No dense equal-weight cards.
- Prioritize what the human must decide now.
- Every item has clear action: inspect, approve, stop, resume, archive.

Validation:

- 390px mobile-width layout does not overflow.
- Touch targets meet minimum size.
- No text overlap.

## Workstream 7: Context Capture / AppShots Equivalent

Goal:

Let the user attach current app/window/browser context to Augmentor or a goal.

V1 scope:

- Browser screenshot/evidence capture.
- Current ResonantOS workspace context.
- Selected file/note/chat context.

V2 scope:

- OS-level screenshot/window capture if platform permissions allow.
- Global hotkey capture.

Rules:

- User-initiated capture only.
- Audit what was captured.
- Sensitive regions can be excluded later.

Validation:

- Capture can seed `/goal` and `/delegate`.
- Captured evidence is available to worker agent.

## Workstream 8: Skills And Plugin Sharing

Goal:

Make repeatable operating methods first-class and shareable.

Implementation:

- Standardize Augmentor Skill documents.
- Let add-ons declare skills, command hooks, and workflows.
- Add skill discovery in Add-ons workspace.
- Add skill invocation metadata for `/goal`, `/delegate`, and `/browser`.

V1:

- Local bundled skills only.

V2:

- Curated/signed skill sharing.
- Workspace/team sharing.

Validation:

- Skill docs referenced by manifests exist.
- Logician checks fail if skill docs are missing.
- Augmentor can list available skills for a task.

## Recommended Parallel Session Split

Use one branch/session per workstream after Workstream 0.

Suggested session goals:

1. `goal/dev-stabilization`
   - Clean `origin/dev`, remove generated artifacts, fix formatting, green CI.

2. `goal/augmentor-command-layer`
   - Implement `/goal`, `/delegate`, `/browser`, `/status` command parser and controller tests.

3. `goal/goal-workspace-runtime`
   - Implement durable goal workspace contracts/state/UI.

4. `goal/browser-tool-bridge`
   - Implement Browser Skill, typed BrowserTask bridge, deterministic local browser action tests.

5. `goal/delegation-dispatch`
   - Implement controlled dispatch lifecycle for Hermes/OpenCode/Engineer.

6. `goal/runtime-adapter-integration`
   - Review/adapt dev runtime adapter layer into current architecture.

7. `goal/task-monitor-ui`
   - Build touch-friendly super-app task monitor.

Merge order:

1. Dev stabilization.
2. Command layer contracts.
3. Goal workspace runtime.
4. Browser bridge.
5. Delegation dispatch.
6. Runtime adapter integration.
7. Task monitor UI.

Reason:

The command layer defines the user-facing contract. Goal workspace and browser/delegation implementation can then attach to that contract without each session inventing its own flow.

## Implementation Status

Updated 2026-05-24:

- Command layer: implemented for `/goal`, `/delegate`, `/browser`, and `/status`.
- Goal workspace runtime: implemented as the single core runtime in `src/core/goal-workspace.ts`.
- Browser Tool Bridge v1: implemented through typed Browser host commands. Camofox remains experimental and is not the default browser bridge.
- Delegation Dispatch v1: implemented for Engineer, Hermes, and OpenCode, with add-on targets requiring installed/enabled state before dispatch.
- Runtime Adapter Integration v1: provider execution now hard-stops when a route lacks an approved execution adapter.
- Task Monitor UI v1: Delegation workspace now shows durable goals, needs-attention counts, delegation references, artifacts, and task workspaces.
- Detailed command contract: `AUGMENTOR_COMMAND_EXECUTION_LAYER.md`.

## Non-Negotiable Quality Gates

Every workstream must include:

- deterministic tests
- no `App.tsx` monolith growth
- no direct secret access from frontend
- no direct archive trusted writes from add-ons
- no browser sensitive typing without approval
- no external/public send without approval
- no generated build artifacts committed
- docs updated when contracts change

Required validation before any merge:

- `npm test -- --run`
- `npm run build`
- `cargo fmt --check`
- `cargo test`
- relevant add-on manifest validation
- responsive UI check if UI changed

## Research Sources

- YouTube transcript: AI Agent update video, `52ltebR4Jnw`.
- OpenAI Codex release notes and docs for goal mode, plugins/skills, design annotations, and app/window context.
- Tauri WebView versions documentation: Windows uses WebView2/Chromium; macOS and Linux use WebKit/WKWebView/WebKitGTK.
- Chrome DevTools Protocol documentation: CDP instruments, inspects, debugs, and profiles Chromium-family browsers.
- Playwright documentation: one API for Chromium, Firefox, and WebKit automation; MCP supports agent browser control.
- Mozilla Firefox Source Docs: Marionette and WebDriver BiDi are official Firefox remote control protocols.
- ResonantOS repo reports: Camofox gap analysis, correction plan, edge-case report, browser QA report.
