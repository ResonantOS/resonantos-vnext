# ResonantOS Browser-First Extension

Intent citation: `docs/architecture/ADR-037-browser-first-chromium-resonantos.md`

ResonantOS is an AI-powered browser extension that lives inside your Chromium-family browser (Chrome, Brave, Edge). Not a Tauri desktop app. Not an Electron sidecar. Not an external browser controlled by CDP. The browser IS the product.

---

## Features

### Augmentor — AI Chat Assistant
The core experience. A side-panel AI assistant that can see what you're looking at, understand your context, and take actions on your behalf. Supports multiple AI providers: Groq (free), OpenAI, Anthropic, xAI, DeepSeek, and Google.

- Chat in the browser sidebar while you browse
- Ask questions about the current page — the AI reads it in real-time
- Voice dictation support (when browser supports it)
- Multi-session chat with history
- Context meter showing how much page data the AI has

### Agent Control — Autonomous Browser Operation
Tell the AI to do things on the page. It clicks, types, scrolls, and navigates while showing you exactly what it's doing.

- Green pulsing border — "Augmentor is operating this page"
- Action bubbles floating above elements — "Clicking...", "Typing..."
- Phase toast bar — current state (working, reading, scrolling)
- STOP button — abort at any time
- Target highlighting — green outline on the element about to be acted on
- Inline assistant editing — AI can edit text directly on the page
- Human approval gates for sensitive actions (wallet, credentials)

### Resonant Context SDK — Silent Awareness
The AI silently understands what you're looking at. No clicks needed. It just knows.

- **Viewport tracking** — which sections of the page are visible right now (IntersectionObserver)
- **Dwell time** — how long you've been looking at each section (millisecond precision)
- **Scroll depth** — where in the page you are
- **Form state** — what fields exist, which are filled, what values they contain
- **Overlay detection** — is a dialog, drawer, or popup currently open?
- **Click history** — what you've clicked and when
- **Navigation tracking** — page transitions and URL changes
- **Domain-specific plugins** — custom tracking for Jupiter DEX, Amazon, Google, GitHub, and more

Files: `resonant-context.js`, `context-plugins.js`

### Resonator — Visual Guide Layer
When the AI wants to show you something without taking control, it uses Resonator.

- **Highlight** — pulsing green/purple border around an element ("This is the button you need")
- **Arrow** — animated arrow pointing at an element with label ("Click here to swap tokens")
- **Spotlight** — dims everything except one element ("Focus on this setting")
- **Step badges** — numbered circles 1, 2, 3 for walk-through sequences
- **One-command clear** — `Resonator.clear()` removes all overlays

All CSS animations — no JS animation loops. No performance impact. Solana brand colors (green #14F195, purple #9945FF).

File: `resonator.js`

### Three-Layer Interaction Architecture

These three systems form a spectrum of AI engagement:

```
Passive ──────── Guided ──────── Autonomous
   |                |                |
Resonant         Resonator      Agent Control
Context SDK     (highlights,     (clicks, types,
(observes,       arrows,          scrolls,
 tracks,         spotlights,      navigates)
 feeds           step badges)
 context)
```

| Layer | Mode | Who Acts | Builder |
|-------|------|----------|---------|
| Agent Control Overlay | **Autonomous** | AI acts, human watches | Manolo |
| Resonator | **Guidance** | AI shows, human acts | Tom |
| Resonant Context SDK | **Awareness** | AI observes silently | Tom |

### Blackboard — Visual Display Surface
Augmentor's canvas. A full-tab workspace where the AI renders things visually instead of just text.

**7 rendering modes:**
1. **Canvas** — freeform drawing (HTML5 Canvas, shapes)
2. **Document** — markdown/rich text with syntax-highlighted code blocks
3. **Table** — structured data tables with sortable columns
4. **Embed** — iframe any webpage (`/show <url>`)
5. **Image** — display generated or fetched images
6. **Present** — slideshow mode with slide navigation
7. **Annotate** — overlay annotations on canvas content

**Commands (from Augmentor chat):**
- `/blackboard` — open/focus the blackboard tab
- `/draw` — canvas diagram mode
- `/table` — data table mode
- `/doc` — markdown document mode
- `/show <url>` — embed a webpage
- `/present` — slideshow

**"Send to Augmentor" button** — captures blackboard content and sends it back to the AI as context. CSP-hardened. Michel's Atomic Design token system (Inter + Poppins typography).

Files: `addons/blackboard/blackboard.html`, `blackboard.css`, `blackboard.js`

### Fleet & Compute — Mission Control Dashboard
Unified monitoring for your entire infrastructure. Three tabbed views:

**Fleet Tab — Live Operations:**
- 9 node cards with online/offline/pending status, model assignments, token speeds
- Summary tiles: nodes online, offline, pending, total fleet RAM, engines running
- Engine status table: Loki Router, Purple Squid, Oracle, Specialists, Taskmaster
- Per-node details: CPU, RAM, OS, transport, roles, trust tier

**Cloud Tab — Infrastructure:**
- Hetzner VPS with CPU/RAM/Disk resource bars (color-coded: green <60%, amber 60-80%, red >80%)
- Service health grid with port checks (green UP, red DOWN)
- Domain cards with SSL certificate expiry countdown (green >30d, amber 7-30d, red <7d)
- RunPod balance, active pods, autopay status
- CI/CD status: repo, branch, last deploy

**Compute Fabric Tab — Governance (ADR-032):**
- Full ComputeNode records with enrollment state, trust tier, validation warnings
- Trust badges: Verified, Host-Key, Pending, Unverified
- Policy panels: Execution Boundary, Secrets Boundary, Cleanroom Boundary
- Job and artifact ledgers
- Validation warnings for misconfigured nodes

Auto-refresh: 5s (default), 10s, 30s, or Off. Dark mission-control theme.

Files: `addons/fleet-compute/fleet-compute.html`, `fleet-compute.css`, `fleet-compute.js`

### Protocol Store — AI Protocol Browser
Browse and install AI protocols. Opens as a full browser tab from the side panel.

File: `protocol-store.html`, `protocol-store.js`

### Shield — Security Audit Trail
Real-time security log showing what the AI blocked, approved, or flagged. Tracks all sensitive operations.

File: `shield-tab.html`, `shield-tab.js`

### Living Archive — Page Memory
Save and search anything you've browsed. Persistent page archival with full-text retrieval.

File: `archive-tab.html`, `archive-tab.js`

### R-Awareness — Context Viewer
See exactly how much context the AI has about your current page. Real-time viewport awareness display.

File: `awareness-tab.html`, `awareness-tab.js`

### Wallet Adapter — Phantom/Solana
Detects Phantom wallet, reads public key. Detection-only interface — no transaction signing from the extension.

File: `wallet-adapter.js`

### Main Workspace
The new-tab page with a workspace rail for navigating between views:
- **Answer** — full-screen Augmentor chat (Answer, Links, Images views)
- **Artifacts** — browser job reports, agent control reports, intake artifacts
- **Add-ons** — discoverable addon catalog with trust boundaries and status
- **Living Archive** — memory search, page counts, metrics
- **Hermes** — delegation workspace for complex tasks
- **OpenCode** — governed coding handoffs
- **Settings** — provider API key configuration

---

## Dynamic Addon System (Option F)

Add-ons are self-contained folders in `browser-first/addons/` with an `addon.json` manifest. The addon discovery engine (`addon-discovery.mjs`) scans the directory on startup and auto-registers everything it finds. No code changes needed. Drop a folder, it exists.

### Registered Addons (9)

| Addon | ID | Mode | Trust | Description |
|-------|----|------|-------|-------------|
| Blackboard | `addon.blackboard` | visual-surface | host-mediated | Canvas, documents, tables, embeds, slideshows |
| Fleet & Compute | `addon.fleet-compute` | utility | host-mediated | Fleet monitoring, cloud control, compute governance |
| Resonant Context | `addon.resonant-context` | awareness-engine | page-observer | Viewport tracking, dwell time, domain plugins |
| Resonator | `addon.resonator` | visual-guide | page-overlay | Highlights, arrows, spotlights, step badges |
| Shield | `addon.shield` | security-monitor | host-mediated | Security audit log |
| Archive | `addon.archive` | memory-system | host-mediated | Living Archive browser |
| Awareness | `addon.awareness` | page-observer | page-observer | R-Awareness context viewer |
| Protocol Store | `addon.protocol-store` | utility | host-mediated | Protocol/tool browser |
| Wallet Adapter | `addon.wallet-adapter` | utility | host-mediated | Phantom wallet detection |

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

---

## Bridge Server Modules

The bridge server (`host/run-browser-first.mjs`) mediates all communication between the extension and external services. API keys never leave the host.

| Module | File | Purpose |
|--------|------|---------|
| Provider Router | `provider-router.mjs` | Multi-provider API routing (Groq, OpenAI, Anthropic, xAI, DeepSeek, Google) |
| Addon Discovery | `addon-discovery.mjs` | Scans `addons/` directory, validates manifests, returns registry |
| Audit Trail | `audit-trail.mjs` | Security event logging for Shield |
| Living Archive | `living-archive.mjs` | Page archival, retrieval, and search |
| System Prompts | `system-prompts.mjs` | Centralized prompt management |
| Update Check | `update-check.mjs` | Version checking against upstream |

---

## Directory Structure

```
browser-first/
  addons/                          # Option F addon system
    ADDON-SPEC.md                  # Developer spec for building addons
    blackboard/                    # Visual display surface
      addon.json, blackboard.html/css/js
    fleet-compute/                 # Mission control dashboard
      addon.json, fleet-compute.html/css/js
    resonant-context/              # Viewport awareness engine
      addon.json
    resonator/                     # Visual guide layer
      addon.json
    shield/                        # Security monitor
      addon.json
    archive/                       # Living Archive browser
      addon.json
    awareness/                     # R-Awareness viewer
      addon.json
    protocol-store/                # Protocol browser
      addon.json
    wallet-adapter/                # Phantom wallet adapter
      addon.json
  host/                            # Bridge server modules
    run-browser-first.mjs          # Main bridge server (port 47773)
    bridge-server.mjs              # HTTP bridge core
    addon-discovery.mjs            # Dynamic addon scanner (397 lines)
    provider-router.mjs            # Multi-provider API routing
    audit-trail.mjs                # Security event logging
    living-archive.mjs             # Page archival service
    system-prompts.mjs             # Centralized prompt management
    update-check.mjs               # Version checking
  resonantos-side-panel-extension/ # Chrome extension source
    manifest.json                  # Extension manifest (MV3)
    src/
      background.js                # Service worker
      content.js                   # Page injection + Agent Control overlay
      side-panel.html/js/css       # Augmentor chat panel
      main-workspace.html/js/css   # New-tab workspace with rail
      resonant-context.js          # Viewport observer SDK
      resonator.js                 # Visual guide layer
      context-plugins.js           # Domain-specific configs
      wallet-adapter.js            # Phantom wallet adapter
      protocol-store.html/js       # Protocol browser (full-tab)
      shield-tab.html/js           # Security audit (full-tab)
      archive-tab.html/js          # Living Archive (full-tab)
      awareness-tab.html/js        # R-Awareness viewer (full-tab)
      lib/                         # Modular source
        agent-control-planner.js   # Plans browser automation steps
        agent-control-runner.js    # Executes planned steps
        browser-command-parser.js  # Parses natural language to actions
        browser-job-store.js       # Tracks automation jobs
        browser-page-actions.js    # Page interaction primitives
        chat-session-store.js      # Multi-session chat persistence
        chat-turn-controller.js    # Manages chat turn lifecycle
        composer-controller.js     # Chat input composition
        control-page-observer.js   # Observes page state during control
        control-planning-service.js # Plans multi-step automation
        control-reporting-service.js # Reports automation results
        control-run-state.js       # Tracks automation run state
        control-step-executor.js   # Executes individual steps
        message-action-controller.js # Handles message actions
        monitor-renderers.js       # Renders job monitoring UI
        side-panel-command-router.js # Routes slash commands
        side-panel-renderers.js    # Renders chat messages
        site-permission-store.js   # Per-site permission tracking
        tab-context-controller.js  # Manages tab context
        task-consent-store.js      # Tracks user consent per task
        approval-policy.js         # Human approval gate logic
        bridge-client.js           # Bridge server HTTP client
        app-command-handlers.js    # Application command handlers
        main-workspace-addons.js   # Add-on catalog renderer
        main-workspace-artifacts.js # Artifact viewer
        main-workspace-memory.js   # Memory/archive viewer
        main-workspace-opencode.js # OpenCode workspace
        main-workspace-settings.js # Settings/provider config
  native-messaging/                # Chrome native messaging host
    com.resonantos.bridge.json     # Native messaging manifest
    install-native-host.sh         # Host installer
    resonantos-bridge-host         # Host binary wrapper
  test/                            # Test suite (233+ tests)
    addon-discovery.test.mjs       # 38 tests — discovery, validation, security
    browser-first-contract.test.mjs # Extension structure contract tests
    wallet-adapter.test.mjs        # Wallet adapter tests
    protocol-store.test.mjs        # Protocol store tests
    shield-tab.test.mjs            # Shield tab tests
    archive-tab.test.mjs           # Archive tab tests
    awareness-tab.test.mjs         # Awareness tab tests
    ... (25+ more test files)
  install.sh                       # macOS/Linux installer
  install.ps1                      # Windows PowerShell installer
  install.bat                      # Windows batch installer
  uninstall.ps1                    # Windows uninstaller
  package-extension.sh             # Build distribution zip
  TESTING.md                       # Quick install & test reference
  webstore/                        # Chrome Web Store submission
    LISTING.md                     # Store listing copy
    PRIVACY-POLICY.md              # Privacy policy
    PUBLISH-CHECKLIST.md           # Pre-publish checklist
    REVIEW-NOTES.md                # Notes for Chrome review team
    assets/REQUIRED-ASSETS.md      # Required screenshots/assets list
```

---

## Install & Run

### Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | 22 or higher | `node --version` |
| npm | Included with Node | `npm --version` |
| Chrome, Brave, or Edge | Latest | Any Chromium-based browser |

### Quick Start (5 minutes)

```bash
# Clone and install
git clone https://github.com/ResonantOS/resonantos-vnext.git
cd resonantos-vnext
npm ci

# Start the bridge server
node browser-first/host/run-browser-first.mjs

# Load the extension:
# 1. Go to chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select: browser-first/resonantos-side-panel-extension/
```

### Cross-Platform Installers

```bash
# macOS/Linux (automated)
bash browser-first/install.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File browser-first/install.ps1

# Windows cmd
browser-first\install.bat
```

### Configure AI Providers

Open Settings in the workspace rail and enter at least one API key:

| Provider | Model | Key Format | Free Tier |
|----------|-------|-----------|-----------|
| **Groq** | Llama 3.3 70B | `gsk_...` | Yes (rate limited) |
| OpenAI | GPT-5.5, GPT-4o | `sk-proj-...` | No |
| Anthropic | Claude Sonnet 4, Opus 4 | `sk-ant-...` | No |
| xAI | Grok 4 | `xai-...` | No |
| DeepSeek | DeepSeek V3, R1 | `sk-...` | Yes |
| Google | Gemini 2.5 Pro/Flash | `AIza...` | Yes (rate limited) |

**Recommended for testing:** Groq — free, fast, no credit card.

### Verify Installation

1. Bridge server shows: `ResonantOS browser-first bridge listening on http://127.0.0.1:47773`
2. Extension icon appears in toolbar
3. Click icon → side panel opens → type "hello" → get AI response
4. Navigate to any page → ask "Read this page and summarize it"

---

## Testing

```bash
# Run full test suite (233+ tests)
npm run test:browser-first

# Expected:
# tests 233
# pass 233
# fail 0

# Addon discovery tests (38 tests)
node --test browser-first/test/addon-discovery.test.mjs

# Individual modules
node --test browser-first/test/wallet-adapter.test.mjs
node --test browser-first/test/protocol-store.test.mjs
node --test browser-first/test/shield-tab.test.mjs
```

### CI

GitHub Actions at `.github/workflows/browser-first-ci.yml`:
- Node 22+, manifest validation, syntax check, full test suite
- Triggers on push/PR to `browser-first-preview`

---

## Security

- All API keys and credentials stay on the host behind the bridge server
- Extension never makes direct network calls to fleet machines or cloud APIs
- Bridge token authentication on all routes
- Content Security Policy on all HTML pages
- `detectInjection()` with NFKC normalization and zero-width character stripping
- Sender validation on all `chrome.runtime.onMessage` handlers
- Addon manifests validated for path traversal, trust claims, symlink escape, injection
- 9 penetration test vulnerabilities found and fixed (4 Critical, 5 High)

---

## Architecture

```
User's Browser (Chrome/Brave/Edge)
  ├── Extension (side panel + content scripts)
  │   ├── Augmentor Chat ────────── side-panel.js
  │   ├── Agent Control Overlay ─── content.js (autonomous)
  │   ├── Resonant Context SDK ──── resonant-context.js (awareness)
  │   ├── Resonator Visual Guide ── resonator.js (guidance)
  │   └── Full-tab panels
  │       ├── Shield ────────────── security audit trail
  │       ├── Archive ───────────── Living Archive browser
  │       ├── Awareness ─────────── R-Awareness context viewer
  │       ├── Protocol Store ────── AI protocol browser
  │       ├── Blackboard ────────── visual canvas (7 render modes)
  │       └── Fleet & Compute ──── mission control dashboard
  │
  └── Bridge Server (Node.js, port 47773)
      ├── Provider Router ──── Groq/OpenAI/Anthropic/xAI/DeepSeek/Google
      ├── Addon Discovery ──── scans addons/ directory
      ├── Living Archive ───── page storage + retrieval
      ├── Audit Trail ──────── security event logging
      └── Fleet/Cloud APIs ─── host-mediated infrastructure monitoring
```

---

## Uninstall

```bash
# macOS — remove native messaging host
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.resonantos.bridge.json

# Windows
powershell -ExecutionPolicy Bypass -File browser-first\uninstall.ps1
```

Then remove the extension from `chrome://extensions`.

---

## Credits

- **Manolo Remiddi** — Architecture, Agent Control overlay, workspace system, Compute Fabric (ADR-032), modular source extraction
- **Tom Pennington** — Resonant Context SDK, Resonator, addon system (Option F), Fleet & Compute dashboard, Blackboard, security hardening, install scripts, CI
- **Michel** — Atomic Design system (tokens, Inter + Poppins typography, component hierarchy, WCAG accessibility)
- **Analog 6** — AVD implementation partner

---

## License

See repository root.
