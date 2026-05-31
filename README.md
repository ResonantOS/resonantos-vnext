# ResonantOS vNext

> Modular desktop shell and add-on SDK for human-AI collaboration.

ResonantOS vNext is a **browser-first** platform where AI lives inside your browser chrome — not as a separate app, not as a dashboard, but as a native layer of your browsing experience.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Chromium Browser                    │
│  ┌───────────────────────┐  ┌────────────────┐  │
│  │   ResonantOS          │  │  Active Tab    │  │
│  │   Side Panel          │  │  (any page)    │  │
│  │                       │  │                │  │
│  │  • Augmentor Chat     │  │  Content       │  │
│  │  • Addon Tabs         │  │  Scripts:      │  │
│  │  • Agent Control      │  │  • Context SDK │  │
│  │  • Living Archive     │  │  • Resonator   │  │
│  │                       │  │                │  │
│  └───────────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────┘
          │                           │
          └─────────┬─────────────────┘
                    │
          ┌─────────▼─────────┐
          │   Bridge Server   │
          │  • Provider Router│
          │  • Living Archive │
          │  • Audit Trail    │
          └───────────────────┘
```

The target is a Chromium-family browser where ResonantOS lives inside browser chrome. It is **not** a Tauri dashboard, an Electron sidecar, or a screenshot browser.

## What's Here

### Core Platform

| Component | Description |
|-----------|-------------|
| **Side Panel Extension** | Chrome extension with Augmentor chat, addon system, and agent controls |
| **Addon Discovery Engine** | Auto-discovers and loads addons from `browser-first/addons/` at startup |
| **Resonant Context SDK** | Viewport observer — tracks what the user sees on any webpage |
| **Resonator** | Visual guide layer — highlights, arrows, spotlights, step badges |
| **Shield** | Security audit trail with XSS protection |
| **Wallet Adapter** | Read-only Phantom detection with approval-gated connect/sign |
| **Browser Control v3** | AI-controlled browser actions with safety boundaries |
| **Living Archive** | Save, search, and recall anything you've browsed |

### Add-on Catalog

Self-contained add-ons that plug into the side panel. Drop a folder, it works.

| Add-on | What It Does |
|--------|-------------|
| **Blackboard** | 7-mode visual surface — Canvas, Document, Table, Web Embed, Image, Slideshow, Annotate |
| **Fleet & Compute** | Monitor your fleet of machines running Ollama with live HTTP probes |
| **Task Board** | Kanban board with drag-and-drop across Ready / In Progress / Blocked / Done |
| **System Map** | Interactive topology graph of your fleet with zoom, pan, and minimap |
| **Open Items** | Track work items across Needs Attention / Pending / Completed |
| **Gradient Performance** | Training metrics, model benchmarks, and fleet speed dashboard |

### Security

- Addon manifest validation (path traversal, symlink escape, trust tiers, injection blocking)
- Wallet operations gated through `requestApproval()` — no raw signing power
- XSS protection via `escapeHtml()` on all untrusted fields
- CI pipeline with SHA-pinned GitHub Actions and enforced `npm audit`
- Content script privacy: password fields excluded, `data-rc-ignore` opt-out

## Quick Start

### Browser Extension (development)

```bash
cd browser-first
# Load as unpacked extension in Chrome/Brave:
# 1. Navigate to chrome://extensions
# 2. Enable Developer Mode
# 3. Load unpacked → select browser-first/resonantos-side-panel-extension/
```

### Bridge Server

```bash
cd browser-first/host
node bridge-server.mjs
```

### Run Tests

```bash
node --test browser-first/test/*.test.mjs
```

## Non-Negotiable Gates

Before this becomes the default app:

- Phantom must install/open in the same browser profile
- Wallet connect/sign flows must require human approval
- Augmentor controls the active tab only through typed mediated tools
- No page, add-on, or assistant can get raw wallet/signing power

## Building Add-ons

See [`browser-first/addons/ADDON-SPEC.md`](browser-first/addons/ADDON-SPEC.md) for the complete developer guide.

Quick start:
```
browser-first/addons/my-addon/
  addon.json     # Manifest (required)
  my-addon.html  # UI (optional)
  my-addon.js    # Logic (optional)
```

## Contributing

See [`browser-first/PR-PLAN.md`](browser-first/PR-PLAN.md) for the current contribution plan and merge order.

## Git Workflow

- Active development happens on `browser-first-preview`
- `dev` tracks the Tauri-era codebase (historical)
- `main` is the stable preview/release branch
- Community contributions via PR against `browser-first-preview`

## Structure

```
resonantos-vnext/
├── browser-first/                    # ← The product
│   ├── resonantos-side-panel-extension/
│   │   ├── manifest.json
│   │   └── src/                      # Extension source
│   ├── addons/                       # Drop-in add-ons
│   │   ├── ADDON-SPEC.md             # Developer spec
│   │   ├── blackboard/
│   │   ├── fleet-compute/
│   │   ├── task-board/
│   │   ├── canvas/
│   │   ├── open-items/
│   │   └── gradient-perf/
│   ├── host/                         # Bridge server modules
│   │   ├── addon-discovery.mjs
│   │   ├── provider-router.mjs
│   │   ├── living-archive.mjs
│   │   ├── audit-trail.mjs
│   │   └── bridge-server.mjs
│   ├── test/                         # 114 tests
│   ├── docs/
│   │   ├── screenshots/              # 27 addon screenshots
│   │   └── architecture/
│   └── PR-PLAN.md                    # Contribution guide
├── src/                              # Legacy Tauri shell (historical)
├── src-tauri/                        # Legacy Tauri backend (historical)
└── docs/
    └── architecture/
        └── ADR-037-browser-first-chromium-resonantos.md
```

## License

Public source preview. See repository for terms.
