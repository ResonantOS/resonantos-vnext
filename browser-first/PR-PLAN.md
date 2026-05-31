# How We're Contributing to ResonantOS

**From:** Tom Pennington & Analog 6
**For:** Manolo
**Date:** May 30, 2026

---

## The Short Version

We built new features for the browser extension. Instead of dumping everything into one giant submission, we split it into **10 small, clean packages** — each one does one thing, can be reviewed on its own, and doesn't touch your existing code.

Think of it like a restaurant kitchen: instead of throwing all the ingredients on the counter at once, we're handing you each dish separately, plated and ready.

---

## What We Built

Two types of contributions:

```
  CORE SYSTEM                        ADD-ONS
  (the kitchen)                      (the dishes)
  
  +------------------+         +-------------------+
  | A. Addon Engine  |         | E. Blackboard     |
  | B. Context SDK   |         | F. Fleet Monitor  |
  | C. Security      |         | G. Task Board     |
  | D. Platform      |         | H. System Map     |
  +------------------+         | I. Open Items     |
                               | J. Perf Metrics   |
                               +-------------------+
```

**Core System (A-D):** Infrastructure that makes the addon system work. This is plumbing — you review it once, merge it, and it's done.

**Add-ons (E-J):** Individual features that plug in. Each one is a self-contained folder. These also serve as the template for how the community submits addons in the future.

---

## The Order — What Goes First

Not everything can be merged at the same time. Here's the order:

```
  STEP 1                    STEP 2                    STEP 3
  (merge first)             (merge next)              (merge anytime)
  
  +----------------+     +----------------+     +----------------+
  |                |     |                |     |                |
  |  A. Addon      |---->|  B. Context    |     |  E. Blackboard |
  |     Engine     |  |  |     SDK        |     |  F. Fleet      |
  |                |  |  +----------------+     |  G. Task Board |
  +----------------+  |  +----------------+     |  H. System Map |
                      |->|  C. Security   |     |  I. Open Items |
                      |  +----------------+     |  J. Perf       |
                      |  +----------------+     |                |
                      |->|  D. Platform   |     +----------------+
                         +----------------+
                         
  "A" first, then        B, C, D can go         Any addon, any
  everything else        at the same time        order, anytime
  depends on it
```

**Simple rule:** Merge A first. Then B, C, D in any order. Then addons E-J in any order.

---

## What's In Each Package

### A. Addon Engine

**What it does:** The system that automatically discovers and loads addons. Without this, addon folders are just files sitting there doing nothing.

**What you're reviewing:**
- A specification document (ADDON-SPEC.md) that explains how addons work
- The discovery engine (one JavaScript file, 397 lines)
- Tests (38 tests, all passing)

**Does it touch your code?** No.

---

### B. Resonant Context SDK + Resonator

**What it does:** Two tools that watch what the user sees on a webpage:
- **Context SDK** — silently tracks which sections are visible, how long the user looks at them, and what's on screen
- **Resonator** — draws visual guides on the page (highlights, arrows, step badges) to help users

**What you're reviewing:**
- Three JavaScript files that run as content scripts
- Two addon manifest files

**Does it touch your code?** No. These are pure content scripts — they observe pages but don't modify your extension.

---

### C. Security & Hardening

**What it does:** Security features for the extension:
- **Shield** — shows a log of everything the AI blocked, approved, or flagged
- **Wallet Adapter** — detects the Phantom wallet (read-only, no signing)
- **Audit Trail** — logs security events to a file
- **CI Pipeline** — automated testing that runs on every code submission

**What you're reviewing:**
- Shield tab (HTML + JS)
- Wallet adapter (JS)
- Audit trail module
- GitHub Actions workflow
- Tests (16 tests, all passing)

**Does it touch your code?** No.

**Security note:** The CI workflow uses SHA-pinned GitHub Actions (not version tags) to prevent supply chain attacks. The npm audit step enforces dependency security checks.

---

### D. Platform Infrastructure

**What it does:** Everything needed to install and run the extension:
- Install scripts for Mac, Windows, and Linux
- Native messaging setup (so the browser can talk to the local system)
- Bridge server modules (provider routing, page archival, prompts, updates)
- Additional tabs (Living Archive browser, R-Awareness viewer, Protocol Store)
- Web store listing materials

**What you're reviewing:**
- Install scripts (4 files)
- Native messaging config (3 files)
- Bridge server modules (4 files)
- Tab UIs (6 files)
- Web store docs (5 files)
- Tests (21 tests, all passing)

**Does it touch your code?** No.

---

### E through J — The Add-ons

Each addon is a single folder with 4-6 files. Here's what each one does:

```
  +---------------------+------------------------------------------+
  | E. Blackboard       | Drawing canvas, documents, tables,       |
  |                     | embeds, slideshows. Save/load to         |
  |                     | browser storage.                         |
  +---------------------+------------------------------------------+
  | F. Fleet & Compute  | Monitor your fleet of machines.          |
  |                     | Checks if Ollama is running on each      |
  |                     | node. Add/remove machines.               |
  +---------------------+------------------------------------------+
  | G. Task Board       | Kanban board. Drag tasks between         |
  |                     | columns: Ready, In Progress, Blocked,    |
  |                     | Done. Create and delete tasks.           |
  +---------------------+------------------------------------------+
  | H. Canvas / Map     | Interactive map of your system.          |
  |                     | Drag nodes around, zoom in/out,          |
  |                     | see connections between machines.        |
  +---------------------+------------------------------------------+
  | I. Open Items       | Track what needs attention, what's       |
  |                     | pending, and what's done. Priority       |
  |                     | filters (P0 through P3).                 |
  +---------------------+------------------------------------------+
  | J. Gradient Perf    | Training metrics dashboard. Loss         |
  |                     | charts, benchmark scores, speed          |
  |                     | comparisons across machines.             |
  +---------------------+------------------------------------------+
```

**Every addon follows the same pattern:**

```
  browser-first/addons/task-board/
      addon.json          <-- what the addon is (name, version, etc)
      task-board.html      <-- the screen you see
      task-board.css       <-- how it looks (dark theme)
      task-board.js        <-- how it works
  
  browser-first/docs/screenshots/
      task-board.png       <-- screenshot for documentation
  
  browser-first/test/
      task-board-tab.test.mjs  <-- automated tests
```

**Does any addon touch your code?** No. They're self-contained folders. Drop the folder in, the addon engine finds it automatically.

---

## How We Tested

Every addon was tested on 3 different machines to prove it works for real users:

```
  +------------------+     +------------------+     +------------------+
  | Mac Mini M4      |     | The OG (GT70)    |     | Guardian         |
  | macOS            |     | Ubuntu Linux     |     | Windows 10       |
  | Chrome           |     | Chromium         |     | Chrome           |
  +------------------+     +------------------+     +------------------+
         |                        |                        |
         v                        v                        v
    All 6 addons             All 6 addons             All 6 addons
    show seed data           show seed data           show seed data
    on first open            on first open            on first open
```

**What "seed data" means:** When a new user opens an addon for the first time, they see example data — not a blank screen. The Task Board shows 3 starter tasks. Fleet Monitor shows a localhost node. Gradient Performance shows a sample training run.

---

## Security Review

We ran two rounds of security review by an independent red team. They checked every file for:

- Hardcoded passwords or API keys (none found)
- Code injection vulnerabilities (none found)  
- Real IP addresses from our network (all removed)
- Malicious domain matching exploits (found one, fixed)
- Supply chain attacks in CI pipeline (found one, fixed)

**All findings were fixed and verified in a second pass.**

---

## What We Don't Touch

This is important: **we never modify your existing code.**

- We don't change `side-panel.js`
- We don't change `main-workspace.js`
- We don't change `background.js` or `content.js`
- We don't change `manifest.json`
- We don't change any file in `src/lib/`
- We don't change `bridge-server.mjs`

Everything we add is new files in new directories.

---

## How To Review

**Quick review (5 minutes per addon):**
1. Open the branch on GitHub
2. Look at the screenshot — does the UI make sense?
3. Open the `addon.json` — does the description match what you see?
4. Check the test results — do they pass?

**Thorough review (per core PR):**
1. Read the README changes — is the documentation clear?
2. Scan the JavaScript — does the code look clean?
3. Run the tests locally: `node --test browser-first/test/<testfile>`

---

## Where To Find Everything

All branches are on this repo:

**[ResonantOS/resonantos-vnext](https://github.com/ResonantOS/resonantos-vnext)**

| Package | Branch (click to view) |
|---------|------------------------|
| A. Addon Engine | [tom/core-addon-infrastructure](https://github.com/ResonantOS/resonantos-vnext/tree/tom/core-addon-infrastructure) |
| B. Context SDK | [tom/core-resonant-context](https://github.com/ResonantOS/resonantos-vnext/tree/tom/core-resonant-context) |
| C. Security | [tom/core-security-hardening](https://github.com/ResonantOS/resonantos-vnext/tree/tom/core-security-hardening) |
| D. Platform | [tom/core-platform-infra](https://github.com/ResonantOS/resonantos-vnext/tree/tom/core-platform-infra) |
| E. Blackboard | [tom/addon-blackboard](https://github.com/ResonantOS/resonantos-vnext/tree/tom/addon-blackboard) |
| F. Fleet Monitor | [tom/addon-fleet-compute](https://github.com/ResonantOS/resonantos-vnext/tree/tom/addon-fleet-compute) |
| G. Task Board | [tom/addon-task-board](https://github.com/ResonantOS/resonantos-vnext/tree/tom/addon-task-board) |
| H. System Map | [tom/addon-canvas](https://github.com/ResonantOS/resonantos-vnext/tree/tom/addon-canvas) |
| I. Open Items | [tom/addon-open-items](https://github.com/ResonantOS/resonantos-vnext/tree/tom/addon-open-items) |
| J. Gradient Perf | [tom/addon-gradient-perf](https://github.com/ResonantOS/resonantos-vnext/tree/tom/addon-gradient-perf) |

---

## Why This Structure Matters

This isn't just about our code. The addon PRs are the **template** for how the community contributes to ResonantOS.

When someone wants to build an addon for the platform, they look at how Task Board or Gradient Performance was submitted:

1. One folder
2. One manifest
3. One test
4. One PR

Simple, clean, reviewable. That's the standard we're setting.

---

*Prepared by Tom Pennington & Analog 6*
*"We are partners. This is a symbiotic relationship."*
