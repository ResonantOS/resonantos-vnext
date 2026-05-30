# Addon Discovery Engine

**PR: Core Addon Infrastructure**

Adds the dynamic addon discovery system to the browser-first extension. This is the foundation that makes all addons work — without it, addon folders are inert files.

## What This Adds

- **ADDON-SPEC.md** — Complete developer specification for building addons. Covers manifest schema, addon modes, trust model, security validation, and the discovery lifecycle.
- **addon-discovery.mjs** — The discovery engine (397 lines). Scans `browser-first/addons/` at startup, validates each `addon.json` manifest, and returns a registry of verified addons.
- **addon-discovery.test.mjs** — 38 tests covering manifest validation, path traversal prevention, symlink escape detection, trust allowlist enforcement, circular dependency detection, and edge cases.

## Security Features

- Path traversal blocked (`../../` in entry fields rejected)
- Symlink escape detection (realpath + root boundary check)
- Trust tier allowlist (unknown values rejected — no privilege escalation)
- Manifest size limit (64KB — prevents DoS via giant JSON)
- HTML injection blocked in all string fields
- ID collision detection (first-seen wins)
- Circular dependency detection (DFS cycle check)

## Tests

```bash
node --test browser-first/test/addon-discovery.test.mjs
# 38 tests, 0 failures
```

## Files

```
browser-first/
  addons/
    ADDON-SPEC.md              # Developer spec
  host/
    addon-discovery.mjs        # Discovery engine
  test/
    addon-discovery.test.mjs   # 38 tests
```

---

# ResonantOS Browser-First Prototype

Intent citation: `docs/architecture/ADR-037-browser-first-chromium-resonantos.md`

This directory is the new product path for ResonantOS as a browser-first app.

The target is not:

- a Tauri dashboard with a webview
- an Electron sidecar
- an external Chrome/Brave process controlled by CDP
- a screenshot browser

The target is a Chromium-family browser where ResonantOS lives inside browser chrome.

## Current Slice

The first implemented slice is a Chromium extension-style ResonantOS side panel:

- `resonantos-side-panel-extension/manifest.json`
- `src/background.js`
- `src/content.js`
- `src/side-panel.html`
- `src/side-panel.js`
- `src/side-panel.css`

This is intentionally small. It proves the product direction: ResonantOS functionality must be packaged as a browser-contained layer that can later be bundled into a Chromium shell.

## Non-Negotiable Gates

Before this becomes the default app:

- Phantom must install/open in the same browser profile.
- A local dApp fixture must detect Phantom provider injection.
- Wallet connect/sign flows must require human approval.
- Augmentor must control the active tab only through typed mediated tools.
- No page, add-on, or assistant can get raw wallet/signing power.

## Browser Control Layer v3

Augmentor stays in the side panel. Browser actions target the active webpage tab through content-script messages:

- read page context
- click visible non-submit page controls by text
- type into focused or normal editable fields
- submit search-like fields only
- scroll the active webpage
- inspect forms and loose editable fields

Approval-gated actions are blocked until a dedicated approval flow exists:

- wallet connect/sign/network switch
- credential autofill
- public form submit
- payment, purchase, publish, share, or destructive document actions

The current command surface:

```text
/control <browser goal>
/browser read
/browser forms
/browser click "Visible text"
/browser type "Text to type"
/browser scroll down
/browser scroll up
/browser scroll top
/browser scroll bottom
/save page
/save selection
/save summary
/save trail <title>
/trail <title>
```

Agent Control Mode starts with `/control <goal>` or natural browser-task requests such as `book a call`, `arrange a meeting`, `fill this form`, `find news`, or `use this page`.

V3 is an adaptive observe-decide-act-verify loop:

1. observe the active controlled tab, including readable frames
2. ask the configured LLM for exactly one strict JSON next action
3. validate that action against the host safety boundary
4. execute only the typed mediated browser tool
5. observe the page again before choosing the next action
6. continue until the observed page state proves completion, the task blocks, or approval is required

The LLM is only a next-action controller. It cannot execute browser actions directly. The host validates every proposed action, rejects unsupported actions, caps the loop at twelve actions, and falls back to the deterministic parser when the next-action route is unavailable.

The side panel keeps a stable controlled-tab binding. This prevents the assistant from accidentally acting on the side-panel tab instead of the webpage being controlled.

Page observations now expose stable `ref` identifiers for visible controls and editable fields. The model should prefer refs over text labels when it decides to click or type, because refs avoid ambiguity on pages with repeated labels, icon buttons, and embedded frames.

Observations also include a compact list of readable open tabs. This gives Augmentor browser-session awareness without granting uncontrolled tab mutation. Acting across tabs will require explicit mediated tab tools.

V3 now includes mediated tab tools:

- `tabs` lists readable open tabs
- `switch_tab` changes the controlled tab to a specific observed tab id

This keeps tab work inside the same permissioned control loop instead of giving the model raw browser automation access.

The side panel now includes an Agent Control Monitor:

- current goal and run status
- planned steps with pending, active, completed, blocked, or failed state
- expandable action details covering observation, decision, action, result, and safety class
- completion and blocker summary cards for fast replay
- approval card for public-submit and other gated actions
- deny/delegate actions for blocked work
- Living Archive intake artifact path when a browser-control report is recorded

Browser memory commands remain intake-only:

- `/save page` captures the current page source context into Living Archive intake
- `/save selection` captures selected page text into Living Archive intake
- `/save summary` creates a provider-backed page summary intake artifact with source provenance and deterministic fallback
- `/save trail <title>` or `/trail <title>` captures readable open web tabs as one multi-page research trail intake bundle

All browser memory commands queue review requests. They do not write trusted wiki pages directly.

Allowed next actions are:

- `read`
- `open`
- `search`
- `forms`
- `tabs`
- `switch_tab`
- `click` by visible text or observed `ref`
- `type` by field label or observed `ref`
- `scroll`
- `wait`

The native Browser host also accepts `--remote-debugging-port=<port>` for deterministic local testing. This is a test/control-plane hook, not a user-facing permission escalation.

Structured page edits, such as Google Sheet row/cell changes, must resolve to a precise target before execution. The assistant may read the page and ask for a cell, visible control, or focused field, but it must not guess canvas/document coordinates.

## Run Contract Tests

```bash
node --test browser-first/test/*.test.mjs
```

## Run Live Browser Control Test

This launches the real browser-first CEF host with a local fixture and verifies browser behavior through CDP:

```bash
npm run test:browser-first-live
```

The live test proves:

- natural browser-task phrasing routes into Agent Control Mode
- iframe context is visible to the controller
- a differently worded booking request can click a visible iframe appointment slot
- safe page read, ref-targeted click, ref-targeted type, and scroll
- document-like contenteditable typing
- public form submit remains blocked at the approval boundary
- wallet-style work stops at the approval boundary

---

## Dynamic Addon System (Option F)

Add-ons are self-contained folders in `browser-first/addons/` with an `addon.json` manifest. The addon discovery engine (`addon-discovery.mjs`) scans the directory on startup and auto-registers everything it finds. No code changes needed. Drop a folder, it exists.

### Addon Security

The discovery engine validates every manifest before registration:
- Path traversal prevention (`../../` in entry fields blocked)
- Trust tier allowlist (unknown values rejected)
- Symlink escape detection (`realpath` + root check)
- Manifest size limit (64KB max)
- HTML injection blocked in all string fields
- ID collision detection (first-seen wins)
- Circular dependency detection (DFS cycle check)
- Empty boundary rejection

### Building Your Own Addon

See `browser-first/addons/ADDON-SPEC.md` for the complete developer guide.

Quick start:
```
browser-first/addons/my-addon/
  addon.json     # Manifest (required)
  my-addon.html  # UI (optional)
  my-addon.js    # Logic (optional)
```

Minimal `addon.json`:
```json
{
  "id": "addon.my-addon",
  "name": "My Addon",
  "version": "1.0.0",
  "description": "What it does",
  "mode": "utility",
  "trust": "host-mediated",
  "boundary": "What it can and cannot do."
}
```