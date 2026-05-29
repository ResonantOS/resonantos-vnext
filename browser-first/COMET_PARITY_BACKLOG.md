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
- Chat composer parity hardening: both main and side-panel chat inputs support select-all, copy, cut, paste, undo, Enter-to-send, and Shift+Enter newline through the shared composer controller, with native clipboard fallback when extension clipboard APIs are unavailable.
- Email/Calendar Add-ons v1: `/email` and `/calendar` create host-mediated draft-only packets from both chat surfaces. Sending email and scheduling events remain human-approval gated and are not automated from chat.
- Email/Calendar Approval v1: the Add-ons workspace lists draft packets and can mark them approved for manual action or rejected with an audit entry; provider sending/scheduling remains blocked until connector-specific approval flows exist.
- Durable Browser Jobs v2: persistent job registry, persisted active job id, interrupted-job recovery after reload, visible job monitor, `/jobs`, `/pause`, `/resume`, `/continue`, `/report`, and `/cancel`. Resume/continue restart from persisted step history and job reports can be written to Living Archive intake.
- Durable Browser Jobs v2.1: resume/continue reuses the same durable job id, preserves prior step history/artifacts in the monitor, and appends new browser-control steps instead of creating continuation jobs.
- Parallel Browser Jobs v1: the monitor can show multiple durable jobs at once, mark the focused browser job, switch focus with `/jobs focus <job>`, and keep per-job Continue/Report controls without merging their traces.
- Parallel Browser Jobs v1.1: running/queued/approval jobs hold explicit tab/site page locks, conflicting Agent Control starts/resumes are blocked before action, paused/terminal jobs release locks, unresolved approval-paused jobs are cancelled when the user starts a new explicit control task on the same page, and the job monitor shows the locked site/tab.
- Browser page summaries can be generated into Living Archive intake with source provenance, review queueing, and a deterministic fallback when the provider is unavailable.
- Multi-tab browser research trails can be captured into one Living Archive intake bundle with per-page provenance and review queueing.
- Agent Control visual overlay v1: persistent Matrix-style green perimeter, in-page action toast, and highlighted clicked/typed targets for the full control session.
- Agent Control UX vNext baseline: structured per-action observation/decision/action/result/safety details, completion/blocker summary cards, and persisted replay details in durable browser jobs.
- Secure Autofill Guard v1: content-script field classification permits search/query submits and non-sensitive document/generic typing, while blocking credential, login, payment, wallet, personal-contact, and non-search submit automation before any value is written.
- Shopping/search/cart-style flows with safety stops.
- Wallet, payment, login, credential, and public submit boundaries.

## Remaining Capability Work

1. Parallel / Durable Browser Jobs
   - True simultaneous background control loops still require a scheduler that can run more than one non-conflicting page-locked job at the same time. Current v1.1 prevents same-page races and preserves multiple durable job records, but the side panel still has one active control runner.

2. Email / Calendar Provider Connectors
   - Provider-specific Gmail/Calendar connectors.
   - Draft-only remains the default; sending/scheduling still requires human approval.

3. Secure Autofill Model
   - Vault-backed credential/payment/contact autofill remains blocked until vault, approval, and audit ADRs are complete.
   - Search/query field submission is allowed only when content-script checks classify the target as search-like.

## Validation Rule

Every capability must include:

- deterministic contract test
- live browser-host test where browser behavior matters
- documented safety boundary
- no raw credential, wallet, payment, login, or public-submit automation by default
