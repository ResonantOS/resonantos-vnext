# ResonantOS Feature Inventory

Date: 2026-05-26
Branch: `browser-first-preview`
Product direction: browser-first ResonantOS, with the desktop vNext implementation retained as the reference platform and feature reservoir.

This document separates three things that must not be confused:

- **Browser-first working set**: features already implemented and validated in the current browser-first app path.
- **Browser-first next work**: features we are about to add or deepen next.
- **Desktop vNext feature inventory**: features present in the existing Tauri/desktop ResonantOS vNext codebase that still matter, even if they have not yet been ported into the browser-first shell.

## 1. Browser-First Working Set

These are the features currently implemented in the browser-first version.

### Browser Host

- ResonantOS now has a browser-first product path documented by `ADR-037-browser-first-chromium-resonantos`.
- The product path is a Chromium-family browser app with ResonantOS living inside browser chrome.
- The current app installs locally as `/Applications/ResonantOS Browser.app`.
- The installed app is replaced by `npm run browser-first:install` after updates.
- The native Browser host uses the CEF-based `ResonantBrowserNativeHost` path.
- The browser host loads the ResonantOS side-panel extension by default.
- The browser host loads Phantom Wallet into the same browser profile when the local Phantom extension is available.
- The browser host pins the ResonantOS extension and Phantom extension in the profile configuration.
- The browser host supports deterministic local testing through a controlled remote-debugging port.
- The Browser host is not the old Tauri webview browser and is not an external Chrome/Brave control workaround.

### ResonantOS Side Panel

- ResonantOS is exposed as a browser side panel.
- The side panel opens by default in the browser-first app.
- The side panel contains the Augmentor chat interface.
- The side panel is intended to remain beside the webpage, not replace the webpage.
- The side panel can be hidden or shown through the extension control.
- The side panel is packaged as a Chromium Manifest V3 extension.
- The side panel has browser-level permissions for active tab access, scripting, tabs, history, side panel, clipboard read/write, and web navigation.

### Augmentor Chat

- Augmentor chat works inside the browser side panel.
- Provider calls route through the local browser-first bridge.
- Current provider profile display is visible in the composer.
- Model selection is present in the composer.
- Thinking depth selection is present in the composer.
- Intake action affordance is present in the composer.
- Attachment affordance is present in the composer.
- Microphone affordance is present, but full dictation remains dependent on runtime permission/provider support.
- Context percentage indicator is present.
- Send button is icon-based.
- The chat starts without the earlier hardcoded placeholder assistant message.
- Chat supports Markdown rendering.
- Chat supports copy, fork, edit, regenerate, save/intake, and delete message actions.
- Chat supports multiple session state through the browser extension storage layer.
- Chat transcript persists across panel reloads.
- Chat input supports Enter to send.
- Chat input supports Shift+Enter for newline.
- Chat input supports Command+A, Command+C, Command+X, Command+V, and Command+Z.
- Command+Q is handled by the native browser host to quit the app.

### Browser Reading And Context

- Augmentor can read the active webpage through mediated content-script messages.
- Page observations include title, URL, visible text, viewport state, links, controls, editable fields, iframe summaries, and wallet-provider detection.
- Readable iframe content is merged into page observations where browser security allows it.
- Stable element refs are assigned to visible controls and fields.
- Augmentor can use refs to avoid ambiguous click/type targets.
- The system keeps a controlled-tab binding so Augmentor acts on the intended webpage, not on the side-panel tab.
- Page context can be attached into chat.
- Inline selected text can be sent into the side panel.

### Agent Control Mode

- Agent Control Mode exists and runs through an observe -> decide -> act -> verify loop.
- Agent Control Mode can be triggered with `/control <goal>`.
- Natural browser-task phrasing can route into Agent Control Mode.
- The model is treated as a next-action controller, not as a raw browser automation authority.
- The host validates every proposed action.
- The loop is capped at a safety limit.
- The loop stops on blocked, failed, approval-required, paused, cancelled, or completed states.
- The loop records a durable browser job.
- The loop records step state as pending, active, completed, blocked, or failed.
- The control runner now writes result summaries into the step timeline.
- The control monitor now renders the task as a visible action timeline.
- The control monitor shows current status and progress.
- The control monitor persists job state through browser storage.
- Agent Control reports can be saved into Living Archive intake through the bridge path.
- The Augmentor sidebar can save the current browser page or selected page text directly into Living Archive intake; these captures remain raw intake artifacts and still require review, verification, and promotion before becoming trusted AI Memory.
- Browser artifacts can request Living Archive review, and the browser-first Living Archive workspace now exposes an auditable review queue with `pending`, `in-progress`, `approved`, and `rejected` state transitions.
- Review queue cards now show an archive pipeline timeline for `Intake`, `Review`, `Draft`, `Verify`, `Revise`, `Promote`, and `Restore`, using host-read artifact metadata rather than UI guesses.
- Approved browser-first review requests can generate draft wiki-update artifacts under `Memory/REVIEW/artifacts`; these drafts are not trusted AI Memory until a later host-mediated ingest/verifier/promote path completes.
- Draft wiki-update artifacts can be previewed through a scoped `REVIEW/artifacts` host read path before any trusted promotion work is attempted.
- Draft wiki-update artifacts must pass a host-owned verifier gate before promotion; the verifier writes an auditable verification artifact under `Memory/REVIEW/verifications` and records `verificationStatus: verified` on the draft.
- The verifier always runs deterministic host checks and can optionally call a configured provider for semantic challenge review; OpenAI is preferred for archive-quality verification, MiniMax is used as fallback, and unavailable provider review is recorded without exposing credentials.
- Verification artifacts can be previewed from the Living Archive workspace through a scoped `REVIEW/verifications` host read path before promotion.
- Drafts that fail verification can be revised through a scoped host route that creates a new draft from the source artifact plus verifier findings, marks the old draft as revised, and points the review request at the revised draft.
- Browser-first draft artifacts can now be explicitly promoted into `AI_MEMORY/wiki` through a scoped host action that requires an approved source review request, backs up overwritten wiki pages, marks the artifact as promoted, and appends to `index.md` / `log.md`.
- Browser-first promotion now uses section-aware markdown merge: matching `##` sections are updated, unmatched existing sections are preserved, new sections are appended, and superseded sections are retained for provenance.
- The browser-first Living Archive workspace now shows promotion history from promoted review artifacts, including the promoted wiki page and backup path when a page was overwritten.
- Promotion history can restore a promoted wiki page from its recorded backup through a scoped host action; the restore operation backs up the current page first and appends a restore event to the wiki log.

### Browser Tools Available To Augmentor

- Read active page.
- Open URL in the controlled browser tab.
- Search through a mediated search action.
- Inspect forms.
- List readable tabs.
- Switch controlled tab to a listed readable tab.
- Click visible safe controls by text.
- Click visible safe controls by observed ref.
- Type into editable fields by label.
- Type into editable fields by observed ref.
- Submit search-like fields only.
- Scroll up, down, top, or bottom.
- Wait between observations.

### Safety Boundaries

- Wallet actions are human-only by default.
- Wallet connect/sign/network-switch actions are blocked from automation.
- Payment, checkout, buy/sell, bridge, mint, claim, transfer, and signing actions are blocked from automation.
- Login and credential actions are blocked from automation.
- Public submit actions require approval.
- Non-search field submission requires approval.
- Site trust never bypasses wallet, payment, login, credential, signing, or public-submit boundaries.
- Planner-proposed actions are sanitized before execution.
- Restricted planner actions are blocked before reaching the content script where possible.
- Page mutation commands respect site permission state.

### Site Permissions

- Site permission modes exist:
- `blocked`: Augmentor cannot read or operate the site.
- `read-only`: Augmentor can read context but cannot click, type, or scroll.
- `ask-before-action`: default cautious posture.
- `trusted-for-safe-actions`: safe actions can run, but hard boundaries remain human-only.
- Current-site permission control appears in the side panel.
- `/site block`, `/site ask`, and related site-permission commands exist.
- Site permissions persist in extension storage.
- Inline Assistant hides on blocked sites.

### Approval Flow

- Approval card appears for public-submit and similar gated actions.
- User can approve once for eligible public-submit style actions.
- User can deny an approval request.
- User can trust safe actions for a site only when the boundary is safe.
- Hard wallet/payment/login/credential boundaries do not expose an approval bypass.
- Denied actions stop the current task and preserve the record.

### Browser Job Monitor

- Browser jobs are durable in extension storage.
- The side panel shows job count and recent jobs.
- `/jobs` lists browser jobs.
- `/pause <job>` pauses a job.
- `/resume <job>` queues a job for restart.
- `/cancel <job>` cancels a job.
- Job monitor can collapse/expand.
- Completed, blocked, approval, paused, cancelled, and running states are represented.

### Agent Control Visual Feedback

- Agent Control Mode has a persistent green Matrix-style page perimeter overlay.
- The overlay starts once when the agent begins operating the page.
- The overlay remains active across the whole control session.
- The overlay stops only when control returns to the human.
- The overlay has continuous animated wave/pixel movement.
- The overlay shows a bottom in-page action toast.
- The target element is highlighted when the agent clicks or types.
- A temporary in-page action bubble appears over the target element when the agent acts.
- The action bubble is part of the tested content-script contract.

### Inline Assistant

- Inline Assistant appears when the user selects text on a permitted webpage.
- Inline Assistant supports summarize, explain, fact-check, translate, rewrite, custom ask, send to side panel, and insert actions.
- Inline Assistant custom prompt input exists.
- Inline Assistant can send selected page context to the Augmentor side panel.
- Inline Assistant is hidden on blocked sites.

### Browser History And Page Commands

- Browser history metadata search exists through `/history`.
- `/capabilities` explains what Augmentor can do on the current page.
- `/browser read` reads the current page.
- `/browser forms` inspects forms.
- `/browser click "text"` clicks visible text where safe.
- `/browser type "text"` types into the active/available editable field.
- `/browser scroll down/up/top/bottom` scrolls the page.

### Provider Bridge

- Browser-first uses a local loopback bridge for provider and memory operations.
- The bridge requires an auth token.
- The bridge does not allow unauthenticated localhost requests.
- The bridge does not expose raw provider credentials to the extension.
- The bridge can execute Augmentor chat calls.
- The bridge can execute Inline Assistant calls.
- The bridge can execute control-plan and next-action calls.
- The bridge can expose memory status/search/intake operations.

### Deterministic Validation Already Passing

- `npm run test:browser-first`: passed.
- `npm run test:browser-first-live`: passed.
- `npm run test:browser-native`: passed in the prior full chain for the current branch.
- `npm test -- --run`: passed in the prior full chain for the current branch.
- `npm run build`: passed.
- `npm run browser-first:install`: passed and installed `/Applications/ResonantOS Browser.app`.
- `git diff --check`: passed.

Known validation note: Vite still reports the existing large chunk warning in the desktop build. This warning is not caused by the browser-first Agent Control changes.

## 2. Browser-First Features We Are About To Add

These are the next capability areas planned for the browser-first app.

### Agent Control Quality

- Make the control monitor more Comet-level by showing a clearer live current action.
- Add expandable per-action details: observation, decision, action, result, and safety classification.
- Add task summary cards at completion.
- Add visible blockers with recommended next human action.
- Add better progress semantics for multi-step tasks.
- Add replayable run reports so a completed control task can be inspected later.
- Add clearer distinction between reading, deciding, acting, verifying, blocked, and waiting.

### Agent Control Browser Capability

- Improve page observation quality for complex modern web apps.
- Improve element targeting when the page has repeated labels.
- Add stronger form-field mapping.
- Add better editable document handling.
- Add page-state verification after actions.
- Add more robust tab-aware workflows.
- Add multi-tab tasks with explicit safe tab switching.
- Add user-visible current controlled tab and reason.
- Add action retries when an action does not change the page state.
- Add page-specific task adapters only when they can stay behind the same safety boundaries.

### Consent And Permission UX

- Add task-class consent history.
- Add “allow once for this task class” for safe task classes.
- Add clearer “what Augmentor can see/do now” inside the control monitor.
- Add better human-intervention states for login, wallet, checkout, and public submit.
- Add better site permission explanations.
- Add audit trail for approvals and denials.

### Memory And Archive Integration In Browser-First

- Connect browser-first Agent Control reports more deeply to Living Archive intake.
- Add saved page/context artifacts into intake from the browser side panel.
- Add “save this page to memory” flow.
- Add “summarize this page into memory” flow.
- Add “create research trail” flow for multi-page browsing.
- Add source provenance for browser-collected artifacts.
- Keep direct trusted wiki writes blocked; browser artifacts must enter intake/review.

### Add-on Integration In Browser-First

- Port the Add-on Registry visibility into the browser-first environment.
- Expose Hermes and OpenCode as controlled add-on targets from the browser-first side panel.
- Route delegation through approved add-on manifests, not raw command execution.
- Add task handoff artifacts from browser-first Agent Control into delegation workspaces.
- Keep add-ons untrusted by default.

### Wallet And DAO Workflows

- Keep Phantom inside the same browser profile.
- Add wallet state detection without raw signing power.
- Add dApp fixture tests around wallet provider presence.
- Add explicit wallet approval UX for human-only actions.
- Add DAO workflow helpers that read pages, prepare instructions, and stop before signing/submitting.
- Add audit trail for wallet-adjacent tasks.

### Browser Product Surface

- Improve the side-panel chat layout further.
- Add stronger compact mode for current site and browser jobs.
- Add better keyboard shortcut coverage.
- Add settings surfaces for provider, memory, permissions, and extension state.
- Add first-run onboarding for browser-first ResonantOS.
- Add export/debug report for support.

## 3. Desktop ResonantOS vNext Feature Inventory

These features exist in the desktop vNext codebase and remain important. Some will be ported into browser-first. Some may remain as separate modules or become add-ons.

### Desktop Shell

- Tauri desktop shell.
- Left navigation rail.
- Central workspace.
- Persistent right chat rail.
- Collapsible/resizeable chat rail.
- Home/Overview workspace.
- Settings workspace.
- Add-ons workspace.
- Archive workspace.
- Delegation workspace.
- Compute Fabric workspace.
- Browser workspace.
- Obsidian workspace.
- Audio2TOL workspace.
- Recovery workspace.
- Terminal workspace.
- OpenCode workspace.
- Hermes workspace.
- Paperclip workspace scaffold.
- Module-based code organization under `src/modules`.

### Kernel / No-Lock-In Direction

- `ADR-026` defines a minimal kernel with replaceable default add-ons.
- Augmentor Chat is treated as a recommended bundled chat-interface add-on, not mandatory core.
- Living Archive is treated as a recommended bundled memory-system add-on, not mandatory core.
- First-run flow can ask whether to enable recommended Augmentor Chat and Living Archive.
- If no memory-system add-on is active, Archive route prompts the user to choose one.
- If Augmentor Chat is disabled, the Resonant Engineer remains reachable from Settings/recovery.
- Add-on slots and surface routing exist in SDK contracts.

### Augmentor Chat In Desktop vNext

- Persistent chat rail.
- Multiple conversations.
- Pin, rename, branch/fork, delete.
- Per-message actions.
- Markdown rendering.
- Context usage indicator.
- Context memory map.
- Attachments foundation.
- Dictation foundation.
- Chat route requests.
- Provider-routed messages.
- Streaming/abort capability policy.
- Interruption behavior.
- Compact memory injection into prompts.
- Floating detached chat window through Tauri windowing.

### Context Memory

- Raw transcript ledger.
- Compact memory state.
- Automatic compaction threshold.
- Manual compaction.
- Hard-stop threshold.
- Branched chat carries compact memory.
- Compact memory preserves user intent, rationale, tasks, decisions, preferences, artifacts, risks, questions, paths, URLs, and commit references.
- Context-memory visual map.
- User correction of compacted memory fields.

### Provider Fabric

- Central provider routing.
- Provider profiles.
- Runtime nodes.
- Model strategy/fallback policies.
- Provider health state.
- Cost posture labels.
- Strategy settings for primary chat, recovery, archive ingest, and routine/background work.
- MiniMax provider integration.
- Local runtime representation.
- LAN runtime placeholders.
- Provider diagnostics.
- Recovery/resurrect routing distinction.

### Compute Fabric

- Compute Fabric workspace.
- Runtime capability modeling.
- Local/remote runtime node representation.
- Strategy planning tests.
- Cost-aware routing direction.
- Recovery floor model.

### Resonant Engineer / Recovery

- Resonant Engineer agent concept.
- Emergency recovery mode.
- Local fallback model path.
- Recovery dashboard.
- Recovery action templates.
- Recovery tool loop foundation.
- Diagnosis-first recovery workflow.
- Provider restoration priority.
- Recovery report generation direction.
- Guardrails for command/file access.

### Living Archive / LLM Wiki

- Memory-provider broker.
- Living Archive add-on contract.
- Status, search, read, intake write, ingest request, review operations.
- Third-party memory provider reference service.
- Living Archive MCP bridge.
- Local Living Archive memory service.
- Settings Memory Bridge launcher.
- Scoped archive IPC commands.
- Portable User State memory root.
- Source folder import.
- Folder/vault preflight.
- Copy-on-import default.
- Move import blocked until audited.
- Mixed Library classification.
- Human Knowledge, External Knowledge, AI Memory, Mixed Library domains.
- Source manifests.
- Version ledgers.
- SHA-256 source/version hashes.
- SQLite `wiki.db` schema for pages, sources, links, provenance, and activity.
- Guarded document reads.
- Intake artifact writes.
- Collision-safe intake filenames.
- Review queue.
- Review artifacts.
- Promotion state.
- `Promote Approved` action.
- Strategist-owned verification and approval path.
- Provider-backed ingest writer and verifier routes.
- Semantic lint.
- Semantic repair queueing.
- Background cycle.
- Auto-sync policy with cost gates.
- Durable AI Memory build jobs.
- Continue Build action.
- Queue integrity checks.
- Large text chunk staging.
- Non-text attachment stubs.
- Section-aware markdown merge.
- Superseded-section provenance.
- System Architecture Memory under `Memory/AI_MEMORY/system`.
- Augmentor and Engineer prompts can load System Architecture Memory before user knowledge intake.

### Add-on SDK And Registry

- Add-on manifest contracts.
- Manifest validation tests.
- Surface routing tests.
- Public manifest tests.
- Capability grant model direction.
- Add-on registry.
- Add-on workspace.
- Bundled/recommended add-on catalog direction.
- Development manifests for optional systems.
- Runtime categories: UI modules, embedded modules, local services, agent add-ons, channel add-ons.
- Replaceable `chat-interface` slot direction.
- Replaceable `memory-system` slot direction.

### Delegation

- Delegation core contracts.
- Delegation workspace.
- Delegation packets.
- Delegation to approved add-ons direction.
- Hermes/OpenCode delegation direction.
- Artifact return direction.
- Delegation tests.

### Logician

- Logician core module.
- Protocol/gate/evidence settings.
- Deterministic test coverage.
- Execution-layer direction started but not yet a complete product feature.

### Browser Add-on In Desktop vNext

- Earlier desktop Browser workspace exists.
- Earlier browser workspace is not the final product browser direction.
- Browser-first branch supersedes the Tauri webview browser work for wallet-capable browser UX.

### Obsidian / Notes

- Obsidian add-on panels.
- Obsidian workspace.
- Obsidian vault tree.
- Metadata panel.
- Vault index panel.
- Editor component.
- Resonant Notes direction.
- Obsidian remains optional/add-on, not core dependency.

### Audio2TOL

- Audio2TOL workspace.
- Audio2TOL pipeline workspace.
- Archive Audio2TOL intake bridge.
- Audio2TOL bundle detection.
- TOL raw audio/transcript/analysis/rendered-note bundle direction.
- TOL remains optional and appears only when the Audio2TOL add-on is installed/enabled.

### Telegram

- Telegram add-on panel.
- Telegram channel direction.
- Telegram service path in desktop vNext status docs.
- Bot token storage through portable secret vault direction.
- Inbound text routing to Augmentor direction.
- Voice/audio download metadata foundation.
- Transcription hook still needed.

### OpenCode / Hermes / Terminal / Paperclip

- OpenCode workspace scaffold.
- Hermes workspace scaffold.
- Terminal workspace.
- Paperclip workspace scaffold.
- Hosted-service add-on direction.
- These systems are add-ons, not trusted core agents.
- Their outputs should enter Living Archive only as intake/artifacts unless a trusted ingest service promotes them.

### Wallet / Web3 Architecture

- Wallet/Web3 ADR exists.
- Custody model is hybrid local plus managed accounts.
- Signing and privileged key operations belong behind host-side boundaries.
- Add-ons cannot get raw signing power.
- Browser-first product direction now requires wallet-compatible browser host behavior.
- Phantom-in-same-profile is the current browser-first target.

## 4. Current Gaps And Risks

- Browser-first is now the product direction, but not all desktop vNext modules have been ported into it.
- Living Archive is complete for desktop V1 architecture, but browser-first memory UX is not complete.
- Add-on registry exists in desktop vNext; browser-first add-on management is not yet fully surfaced.
- Hermes/OpenCode delegation is not yet browser-first production behavior.
- Wallet actions intentionally stop at human approval boundaries; automated signing is not a goal.
- Browser-first provider credentials depend on the local bridge and provider secrets path.
- Browser-first validation is strong locally on this Mac, but cross-platform browser-first packaging needs its own CI path.
- The old desktop/Tauri app and new browser-first app currently coexist in the repository; documentation must keep the distinction explicit.

## 5. Recommended Next Implementation Sequence

1. **Agent Control UX vNext**
   - Add richer action details, current action state, blockers, and completion cards.
   - Reason: this directly improves the Comet-level experience the user sees every day.

2. **Browser-First Memory Bridge UX**
   - Add save page, save selection, research trail intake flows, and promotion from approved draft artifacts into the existing trusted ingest/verifier pipeline.
   - Reason: this connects the browser product to the LLM Wiki / Living Archive advantage.

3. **Browser-First Add-on Surface**
   - Expose installed/available add-ons and route delegation to approved add-ons.
   - Reason: this restores the ResonantOS modular platform vision inside the browser app.

4. **Hermes/OpenCode Delegation**
   - Add controlled task handoff and artifact return.
   - Reason: this makes Augmentor more powerful without giving add-ons trusted core authority.

5. **Wallet/DAO Workflow Guardrails**
   - Add DAO helpers, wallet state detection, and audit trail while keeping signing human-only.
   - Reason: this supports ResonantDAO use cases without compromising security.

6. **Browser-First Onboarding And Settings**
   - Add provider, memory, permissions, add-ons, and diagnostics settings inside the browser-first app.
   - Reason: the product needs to be usable without terminal/config knowledge.
