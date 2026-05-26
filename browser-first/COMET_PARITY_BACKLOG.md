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
- Site permission modes: blocked, read-only, ask-before-action, trusted-for-safe-actions.
- Visible current-site permission control in the side panel.
- `/capabilities` permission summary for the current page.
- Local browser history metadata search through `/history`.
- Shopping/search/cart-style flows with safety stops.
- Wallet, payment, login, credential, and public submit boundaries.

## Remaining Capability Work

1. Inline Assistant v2
   - Add stronger editable-field insertion flow.
   - Add configurable action list and keyboard shortcuts.

2. Browser History / Activity Search v2
   - Add per-site and incognito exclusion.
   - Add date filters and recent-tabs/history synthesis.

3. Site Permission Controls v2
   - Add task-level consent: allow once, allow for this site, deny.

4. Parallel / Durable Browser Jobs
   - Multiple concurrent browser tasks with separate monitors.
   - Pause/resume/cancel per task.
   - Long-running task reports into Living Archive intake.

5. Email / Calendar Add-ons
   - Gmail/Calendar-style integrations as add-ons with explicit approval.
   - Draft-only by default; sending/scheduling requires human approval.

6. Secure Autofill Model
   - Do not implement raw credential/payment autofill until vault, approval, and audit ADRs are complete.
   - Search/query field submission can remain allowed when content-script checks classify it as search-like.

7. Permission / Consent UX
   - Ask whether Augmentor may operate the browser for each task class.
   - Remember per-task preference only within safe scopes.
   - Make “what I can see/do now” visible in the control monitor.

## Validation Rule

Every capability must include:

- deterministic contract test
- live browser-host test where browser behavior matters
- documented safety boundary
- no raw credential, wallet, payment, login, or public-submit automation by default
