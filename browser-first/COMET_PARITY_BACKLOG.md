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
- Durable Browser Jobs v2: persistent job registry, persisted active job id, interrupted-job recovery after reload, visible job monitor, `/jobs`, `/pause`, `/resume`, `/continue`, `/report`, and `/cancel`. Resume/continue restart from persisted step history and job reports can be written to Living Archive intake.
- Browser page summaries can be generated into Living Archive intake with source provenance, review queueing, and a deterministic fallback when the provider is unavailable.
- Multi-tab browser research trails can be captured into one Living Archive intake bundle with per-page provenance and review queueing.
- Agent Control visual overlay v1: persistent Matrix-style green perimeter, in-page action toast, and highlighted clicked/typed targets for the full control session.
- Agent Control UX vNext baseline: structured per-action observation/decision/action/result/safety details, completion/blocker summary cards, and persisted replay details in durable browser jobs.
- Shopping/search/cart-style flows with safety stops.
- Wallet, payment, login, credential, and public submit boundaries.

## Remaining Capability Work

1. Parallel / Durable Browser Jobs
   - Multiple concurrent browser tasks with separate monitors.
   - Full same-job continuation instead of continuation jobs.

2. Email / Calendar Add-ons
   - Gmail/Calendar-style integrations as add-ons with explicit approval.
   - Draft-only by default; sending/scheduling requires human approval.

3. Secure Autofill Model
   - Do not implement raw credential/payment autofill until vault, approval, and audit ADRs are complete.
   - Search/query field submission can remain allowed when content-script checks classify it as search-like.

## Validation Rule

Every capability must include:

- deterministic contract test
- live browser-host test where browser behavior matters
- documented safety boundary
- no raw credential, wallet, payment, login, or public-submit automation by default
