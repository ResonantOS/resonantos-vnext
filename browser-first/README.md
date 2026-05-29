# ResonantOS Browser-First Extension

Intent citation: `docs/architecture/ADR-037-browser-first-chromium-resonantos.md`

ResonantOS is an AI-powered browser extension that lives inside your Chromium-family browser (Chrome, Brave, Edge). Not a Tauri desktop app. Not an Electron sidecar. Not an external browser controlled by CDP. The browser IS the product.

## What You Get

### Core Experience (Manolo's Architecture)
- **Augmentor** — AI chat assistant in the browser side panel. Reads your current page, answers questions, takes actions
- **Agent Control** — tell the AI to click, type, scroll, and navigate for you. Visual overlay shows what the AI is doing in real-time (green borders, action bubbles, phase toasts, stop button)
- **Main Workspace** — new-tab page with workspace rail: Answer, Artifacts, Add-ons, Living Archive, Hermes, OpenCode, Settings
- **Living Archive** — save, search, and recall anything you've browsed
- **Hermes** — delegation workspace for complex tasks
- **OpenCode** — governed coding handoffs
- **Add-on Registry** — discoverable add-on catalog with trust boundaries

### Extension Tabs (Tom's Additions)
- **Protocol Store** — browse and install AI protocols (full-tab)
- **Shield** — security audit trail showing what the AI blocked or approved (full-tab)
- **R-Awareness** — see how much context the AI has about your current page (full-tab)
- **Wallet Adapter** — Phantom/Solana wallet detection and public key read

### Three-Layer Interaction System
The browser AI operates across three modes of engagement:

| Layer | Mode | Who Acts | Files |
|-------|------|----------|-------|
| Agent Control Overlay | **Autonomous** | AI acts, human watches | `content.js` (Manolo) |
| Resonator | **Guidance** | AI shows, human acts | `resonator.js` (Tom) |
| Resonant Context SDK | **Awareness** | AI observes silently | `resonant-context.js` + `context-plugins.js` (Tom) |

**Resonant Context SDK** silently tracks what the user sees (viewport sections, dwell time, scroll depth, form state, overlays) and feeds that context to the AI. Domain-specific plugins for Jupiter DEX, Amazon, Google, GitHub, and more.

**Resonator** provides visual guidance without taking control: highlights, arrows, spotlights, numbered step badges. The AI points at things on the page.

**Agent Control Overlay** (Manolo's) handles full autonomous operation: the AI clicks, types, scrolls, and navigates while showing the user what it's doing.

### Dynamic Addon System (Option F)
Add-ons are self-contained folders in `browser-first/addons/` with an `addon.json` manifest. The addon discovery engine auto-registers them on startup. No code changes, no registry edits, no merge conflicts.

See `browser-first/addons/ADDON-SPEC.md` for the full spec.

**Registered Addons:**

| Addon | Mode | Description |
|-------|------|-------------|
| **Blackboard** | visual-surface | Canvas, documents, tables, web embeds, slideshows. Michel's Atomic Design. |
| **Fleet & Compute** | utility | Mission control dashboard: fleet monitoring, cloud infrastructure, compute fabric governance |
| **Resonant Context** | awareness-engine | Viewport observer, dwell tracking, domain-specific plugins |
| **Resonator** | visual-guide | Highlights, arrows, spotlights, step badges |
| **Shield** | security-monitor | Security audit log viewer |
| **Archive** | memory-system | Living Archive browser |
| **Awareness** | page-observer | R-Awareness context viewer |
| **Protocol Store** | utility | Protocol/tool browser |
| **Wallet Adapter** | utility | Phantom wallet detection |

## Directory Structure

```
browser-first/
  addons/                          # Option F addon system
    ADDON-SPEC.md                  # Developer spec for building addons
    blackboard/                    # Visual display surface (Michel's Atomic Design)
      addon.json
      blackboard.html/css/js
    fleet-compute/                 # Mission control dashboard
      addon.json
      fleet-compute.html/css/js
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
    run-browser-first.mjs          # Main bridge server
    bridge-server.mjs              # HTTP bridge
    addon-discovery.mjs            # Dynamic addon scanner
    provider-router.mjs            # Multi-provider API routing
    audit-trail.mjs                # Security event logging
    living-archive.mjs             # Page archival service
    system-prompts.mjs             # Centralized prompt management
    update-check.mjs               # Version checking
  resonantos-side-panel-extension/ # Chrome extension source
    manifest.json
    src/
      background.js                # Service worker
      content.js                   # Page injection (Agent Control overlay)
      side-panel.html/js/css       # Augmentor chat panel
      main-workspace.html/js/css   # New-tab workspace
      resonant-context.js          # Viewport observer SDK
      resonator.js                 # Visual guide layer
      context-plugins.js           # Domain-specific configs
      wallet-adapter.js            # Phantom wallet adapter
      protocol-store.html/js       # Protocol browser (full-tab)
      shield-tab.html/js           # Security audit (full-tab)
      archive-tab.html/js          # Living Archive (full-tab)
      awareness-tab.html/js        # R-Awareness viewer (full-tab)
      blackboard.html/js/css       # Visual canvas (full-tab, in addons/)
      lib/                         # Modular source (Manolo's extractors)
        agent-control-planner.js
        agent-control-runner.js
        browser-command-parser.js
        browser-job-store.js
        chat-session-store.js
        side-panel-command-router.js
        ... (20+ modules)
  native-messaging/                # Chrome native messaging host
    com.resonantos.bridge.json
    install-native-host.sh
    resonantos-bridge-host
  test/                            # Test suite
    *.test.mjs                     # 233+ tests, Node.js test runner
  install.sh                       # macOS/Linux installer
  install.ps1                      # Windows PowerShell installer
  install.bat                      # Windows batch installer
  uninstall.ps1                    # Windows uninstaller
  package-extension.sh             # Build distribution zip
  TESTING.md                       # Install & test guide
  webstore/                        # Chrome Web Store submission
    LISTING.md
    PRIVACY-POLICY.md
    PUBLISH-CHECKLIST.md
    REVIEW-NOTES.md
    assets/REQUIRED-ASSETS.md
```

## Install & Run

### Quick Start (5 minutes)

```bash
# Clone the repo
git clone https://github.com/ResonantOS/resonantos-vnext.git
cd resonantos-vnext

# Install dependencies
npm ci

# Start the bridge server
node browser-first/host/run-browser-first.mjs

# Load the extension in Chrome/Brave:
# 1. Go to chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select: browser-first/resonantos-side-panel-extension/
```

### Cross-Platform Installers

```bash
# macOS/Linux
bash browser-first/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File browser-first/install.ps1

# Windows (cmd)
browser-first\install.bat
```

See `browser-first/TESTING.md` for detailed instructions.

## Testing

```bash
# Run all tests (233+)
npm run test:browser-first

# Run addon discovery tests only
node --test browser-first/test/addon-discovery.test.mjs

# Validate manifest
python3 -m json.tool browser-first/resonantos-side-panel-extension/manifest.json
```

## CI

GitHub Actions workflow at `.github/workflows/browser-first-ci.yml`:
- Node 22+
- Manifest validation
- Syntax check all extension JS
- Full test suite (233+ tests)

## Building Addons

See `browser-first/addons/ADDON-SPEC.md` for the complete developer guide.

Quick version:
1. Create a folder in `browser-first/addons/your-addon/`
2. Write `addon.json` with required fields (id, name, version, description, mode, trust, boundary)
3. Add your HTML/CSS/JS files
4. The addon discovery engine finds it automatically

## Security

- All API keys and credentials stay on the host behind the bridge server
- Extension never makes direct network calls to fleet machines or cloud APIs
- Bridge token authentication for all routes
- Content Security Policy on all HTML pages
- `detectInjection()` with NFKC normalization and zero-width char stripping
- Sender validation on all `chrome.runtime.onMessage` handlers
- Addon manifests validated for path traversal, trust claims, and injection

## Credits

- **Manolo Remiddi** — Architecture, Agent Control overlay, workspace system, Compute Fabric (ADR-032), modular source extraction
- **Tom Pennington** — Resonant Context SDK, Resonator, addon system (Option F), Fleet & Compute dashboard, security hardening, install scripts, CI
- **Michel** — Atomic Design system (tokens, typography, component hierarchy, WCAG accessibility)
- **Analog 6** — AVD implementation partner

## License

See repository root.
