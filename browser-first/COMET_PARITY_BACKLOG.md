# Comet-Parity Backlog

Intent: keep the browser-first ResonantOS work aligned with the AI-browser capabilities users expect from Comet, while preserving stronger ResonantOS safety boundaries.

## Implemented

- Browser-first Chromium-family host with ResonantOS side panel.
- Augmentor chat in browser chrome.
- Agent Control Mode using observe -> decide -> act -> verify.
- Active page reading and visible-page context extraction.
- Click, type, scroll, forms inspection, tab listing, and tab switching through mediated tools.
- Stable page element refs for controls and fields.
- Iframe context support.
- `@tab` targeting by tab number, title, or URL fragment.
- Inline Assistant v1 for selected text.
- Inline Assistant custom prompt input.
- Inline Assistant v2: editable-field selection capture for inputs, textareas, and contenteditable surfaces; Insert replaces only the selected range; visible keyboard shortcuts are rendered for configured actions.
- Site permission modes: blocked, read-only, ask-before-action, trusted-for-safe-actions.
- Visible current-site permission control in the side panel.
- Task-level consent v1: approve once, trust safe actions by site + task class, expire stale grants, or deny, while keeping wallet/payment/login/signing/credential/public-submit boundaries human-only.
- Site Permission Controls v2: context dock manager lists stored site permissions and task-class consents across sites, with reset/revoke actions.
- Site Permission Controls v2 audit trail: site permission changes/resets and task-class consents/revocations record timestamp, source, and reason, and the permission manager surfaces latest audit evidence.
- Permission/Consent UX v2: the current-site panel states what Augmentor can see/do now for blocked, read-only, ask-before-action, and trusted-safe-action modes.
- Permission/Consent UX v3: long autonomous Agent Control tasks require a task-class preflight before Augmentor starts operating the page; `/approve-control <id>` starts the governed run, `/deny-control <id>` cancels it, stored safe task-class consent can skip the preflight, and hard wallet/payment/login/credential/signing/public-submit boundaries remain separately enforced.
- Permission/Consent UX v3.1: the preflight also appears as a context-dock approval card with clickable Approve and Deny buttons, so users do not have to type the slash commands.
- Permission/Consent UX v3.2: the preflight card can also trust safe actions for the current site + task class through the existing task-consent store, then start the governed control run while preserving hard boundaries.
- Permission/Consent UX v3.3: browser jobs persist the preflight decision that allowed the run to start, and both job monitor replay plus saved job reports show approve-once, trusted-safe-actions, skipped-by-consent, or resumed provenance.
- `/capabilities` permission summary for the current page.
- Browser History / Activity Search v2: `/history <query> | site:example.com | days:7 | tabs` supports date filtering, per-site filtering, readable open-tab synthesis, explicit incognito exclusion, and `/history <query> | intake` export into Living Archive intake with a review request.
- Browser-first Add-ons workspace lists visible add-ons, availability, trust tier, and governed workspace actions without granting new capabilities.
- Main workspace chat now matches the side-panel chat command behavior for keyboard shortcuts, SVG message actions, model/depth controls, shared ring-style context usage, and page/archive/status/mic icon controls. The new-tab main workspace opens first; the side-panel chat stays closed until explicitly opened or a browser-control handoff needs it.
- Main workspace page/context toolbar v1: read current page, save current page to Living Archive intake, save selected page text, and summarize visible context now run directly from the main workspace chat surface instead of opening the side panel for those non-control actions.
- Chat composer parity hardening: both main and side-panel chat inputs support select-all, copy, cut, paste, undo, Enter-to-send, and Shift+Enter newline through the shared composer controller. Native browser editing is preserved first; an explicit clipboard fallback remains available for restricted extension runtimes.
- Augmentor delegation hardening: natural chat phrases such as “spawn Hermes,” “dispatch this to OpenCode,” and “use the ResonantOS agent control layer” are routed before provider chat, and the provider prompt is barred from claiming delegation is outside Augmentor's ResonantOS capabilities.
- Hermes production delegation v1: `/hermes` and natural Hermes delegation now create governed task packets and immediately attempt a host-mediated Hermes lifecycle start. Result artifacts are readable from the Add-ons workspace, deterministic test execution is supported, and real Hermes CLI execution is explicit opt-in so provider secrets, wallet actions, external sends, and trusted memory writes stay mediated.
- OpenCode production delegation v1: `/opencode` workspace handoffs and natural OpenCode delegation now create governed coding packets, attempt host-mediated start/status/artifact/cancel lifecycle actions, and return reviewable coding artifacts. Deterministic execution covers the lifecycle, while real local OpenCode CLI execution remains explicit opt-in and scoped to the ResonantOS repository boundary.
- Email/Calendar Add-ons v1: `/email` and `/calendar` create host-mediated draft-only packets from both chat surfaces. Sending email and scheduling events remain human-approval gated and are not automated from chat.
- Email/Calendar Approval v1: the Add-ons workspace lists draft packets and can mark them approved for manual action or rejected with an audit entry; provider sending/scheduling remains blocked until connector-specific approval flows exist.
- Email/Calendar Provider Connectors v1.1: approved draft packets can open Gmail compose or Google Calendar event-template handoff URLs for human review. ResonantOS records an audit event and still does not send email, schedule events, expose credentials, or bypass the provider UI.
- Durable Browser Jobs v2: persistent job registry, persisted active job id, interrupted-job recovery after reload, visible job monitor, `/jobs`, `/pause`, `/resume`, `/continue`, `/report`, and `/cancel`. Resume/continue restart from persisted step history and job reports can be written to Living Archive intake.
- Durable Browser Jobs v2.1: resume/continue reuses the same durable job id, preserves prior step history/artifacts in the monitor, and appends new browser-control steps instead of creating continuation jobs.
- Parallel Browser Jobs v1: the monitor can show multiple durable jobs at once, mark the focused browser job, switch focus with `/jobs focus <job>`, and keep per-job Continue/Report controls without merging their traces.
- Parallel Browser Jobs v1.1: running/queued/approval jobs hold explicit tab/site page locks, conflicting Agent Control starts/resumes are blocked before action, paused/terminal jobs release locks, unresolved approval-paused jobs are cancelled when the user starts a new explicit control task on the same page, and the job monitor shows the locked site/tab.
- Parallel Browser Jobs scheduler state v1: the durable job store now computes scheduler capacity, runnable queued jobs, page-lock-blocked queued jobs, and capacity-waiting queued jobs. `/jobs` and the monitor surface this state so the user can see why a queued job can or cannot run before true simultaneous control loops are enabled.
- Parallel Browser Jobs execution scheduler v1: Agent Control requests are now created as queued durable jobs, a bounded scheduler starts multiple non-conflicting jobs, capacity-waiting work auto-drains as jobs finish, same-page conflicts remain queued instead of being rejected, paused/cancelled jobs stop browser actions, and hard human-only boundaries do not leave approval jobs holding page locks.
- Browser page summaries can be generated into Living Archive intake with source provenance, review queueing, and a deterministic fallback when the provider is unavailable.
- Multi-tab browser research trails can be captured into one Living Archive intake bundle with per-page provenance and review queueing.
- Living Archive wiki index maintenance v1: trusted promotion upserts the promoted page in `AI_MEMORY/wiki/index.md` as a deduplicated content catalog while preserving `log.md` as the append-only chronology.
- Living Archive wiki health v1.1: health checks now flag duplicate `index.md` catalog entries so old append-style drift is visible and repairable.
- Living Archive search v1.1: AI Memory search now uses `index.md` as the first navigation layer, prioritizes catalog hits, and falls back to page content when the catalog has not caught up.
- Living Archive LLM Wiki completion v1: bootstrap creates `AGENTS.md`, memory domains, `index.md`, and `log.md`; draft ingest artifacts prefer a configured archive ingest writer model with deterministic fallback and include claims/entities/concepts/links/open questions/provenance; health checks validate provenance and contradiction markers; MCP portable search/lint now exposes the same index-first wiki semantics to external agents such as Hermes.
- Agent Control visual overlay v1: persistent Matrix-style green perimeter, in-page action toast, and highlighted clicked/typed targets for the full control session.
- Agent Control UX vNext baseline: structured per-action observation/decision/action/result/safety details, completion/blocker summary cards, and persisted replay details in durable browser jobs.
- Agent Control timing evidence v1: control runs and individual steps record durable timing metadata; monitor details and saved reports show elapsed step/run durations for audit and debugging.
- Agent Control confidence/blocker evidence v1: steps now persist confidence, uncertainty, and recommended next human action; the control monitor and saved reports surface that evidence so blocked tasks tell the user what to do next.
- Agent Control controlled-target evidence v1: active runs persist and display the tab/site/page-lock reason that Augmentor is operating, and saved reports include the same target evidence.
- Agent Control aggregate progress v1: active runs now show phase semantics (reading, navigating, deciding, acting, approval, blocked, waiting, completed), percent complete, queued/blocked/failed counts, and a compact progress track; saved control/job reports include the same aggregate progress evidence.
- Agent Control page-state verification v1: after successful click/type/open/search/tab-switch actions, the runner rereads the page and records whether visible state changed, adding uncertainty evidence when an action appears to do nothing.
- Agent Control no-op repeat guard v1: if the planner repeats the same action after verification found no visible page change, the runner blocks before re-executing it and records guidance to inspect, retarget, or delegate.
- Durable Browser Jobs blocker guidance v1: expanded job rows now surface aggregate progress plus the latest recommended next human action, so blocked/failed jobs remain understandable outside the active Agent Control monitor.
- Durable Browser Jobs stale-progress evidence v1: running and approval jobs with no recent recorded progress are flagged passively in `/jobs` and the monitor with last-activity timing plus next human action, without silently mutating job status.
- Browser Control delegation packets v1: blocked control tasks delegated to the Resonant Engineer carry a bounded context packet with goal, target, aggregate progress, blocker, recent trace, and safety boundary while keeping add-ons outside provider, wallet, credential, and trusted-memory authority.
- Delegation packet review v1: the Add-ons workspace lists recent Hermes/OpenCode/Engineer handoff packets and highlights whether a bounded context packet is attached, so delegated work remains inspectable instead of disappearing into files.
- Artifacts Workspace action summary v1: browser-control reports and job reports now expose derived status, target, aggregate progress, and next-human-action summaries in artifact cards/previews, while preserving raw markdown as intake evidence.
- Secure Autofill Guard v1: content-script field classification permits search/query submits and non-sensitive document/generic typing, while blocking credential, login, payment, wallet, personal-contact, and non-search submit automation before any value is written.
- Wallet State Detection v1: `/wallet status` checks Phantom provider presence and connected/not-connected state from the active page's main world without requesting wallet connection, signatures, seed/private keys, credentials, or transaction submission.
- DAO Workflow Helper v1: `/dao <goal>` reads the active page, identifies visible wallet/governance controls and fields, prepares a safe sequence, and explicitly stops before wallet connect, signing, voting, transfer, transaction confirmation, or public submission.
- Wallet/DAO Audit Artifacts v1: `/wallet audit` and `/dao audit <goal>` save read-only wallet/provider state plus visible governance controls/fields into Living Archive intake and queue review, without requesting wallet connection, signing, voting, transfers, transactions, or public submission.
- Shopping/search/cart-style flows with safety stops.
- Wallet, payment, login, credential, and public submit boundaries.

## Remaining Capability Work

1. Parallel / Durable Browser Jobs
   - Implement per-job approval cards so safe public-submit approval can be reviewed for a background job without stealing focus from the current chat.
   - The execution scheduler is now present; next work is stronger live-test coverage for simultaneous multi-tab jobs after the browser host target-selection flake is fixed.

2. Email / Calendar Provider Connectors
   - Current connectors are manual provider handoffs only.
   - Future provider API connectors require explicit account grants, provider-specific approval flows, and audit trails before any send/schedule action can exist.

3. Secure Autofill Model
   - Vault-backed credential/payment/contact autofill remains blocked until vault, approval, and audit ADRs are complete.
   - Search/query field submission is allowed only when content-script checks classify the target as search-like.

4. Wallet And DAO Workflow Helpers
   - Wallet provider detection is read-only only.
   - DAO helpers now prepare page-specific instructions and stop before signing/submitting.
   - Wallet-adjacent audit artifacts now save read-only evidence to Living Archive intake and queue review.
   - Future work still needs richer dApp fixture coverage for common DAO providers.

## Validation Rule

Every capability must include:

- deterministic contract test
- live browser-host test where browser behavior matters
- documented safety boundary
- no raw credential, wallet, payment, login, or public-submit automation by default
