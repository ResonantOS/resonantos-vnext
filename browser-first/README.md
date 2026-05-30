# Gradient Performance Addon

**PR: Community Addon Submission**

Training metrics and fleet performance dashboard.

## What It Does

Three tabs:

- **Training** — Active and completed training runs with loss sparkline charts, progress bars, step counters, and ETA. Create new runs, update step counts, delete completed runs.
- **Benchmarks** — Comparative bar chart of model scores. Add your own benchmark results. "Ours" entries highlighted.
- **Fleet Speed** — Tokens per second for each fleet node via direct Ollama HTTP probe. Sorted by speed, color-coded (green ≥10 t/s, yellow 5-10, red <5).

All data persists in Chrome Storage. Fleet speed probes use direct `fetch()` to Ollama endpoints.

## First Use

Opens with a seed training run ("Ternary Sunrise v1") and benchmark entries showing the comparison format.

## Install

Drop `addons/gradient-perf/` into `browser-first/addons/`.

## Tests

```bash
node --test browser-first/test/gradient-perf-tab.test.mjs
# 14 tests, 0 failures
```

## Files

```
addons/gradient-perf/
  addon.json
  gradient-perf.html / .css / .js
docs/screenshots/
  gradient-perf.png
test/
  gradient-perf-tab.test.mjs
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

## Gradient Performance Addon

**ID:** `addon.gradient-perf` | **Mode:** `utility` | **Trust:** `host-mediated`

Training metrics and fleet performance dashboard for AI workloads:

- **Training loss** — live training curve visualization
- **Benchmark scores** — per-model benchmark results
- **Token generation speeds** — tokens/sec per fleet node
- **Node comparison** — side-by-side performance across the fleet

**Commands:** `/gradient`, `/perf`, `/benchmark`

**Boundary:** Read-only performance metrics display. No external network access. Data sourced from host-mediated bridge.

![Gradient Performance Screenshot](docs/screenshots/gradient-perf.png)

### Addon Structure

```
browser-first/addons/gradient-perf/
  addon.json          # Manifest
  gradient-perf.html  # Metrics dashboard UI
  gradient-perf.css   # Chart + dashboard styles
  gradient-perf.js    # Training metrics + benchmark logic
browser-first/docs/screenshots/
  gradient-perf.png   # Screenshot
```