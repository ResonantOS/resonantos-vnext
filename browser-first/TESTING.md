# ResonantOS Browser Extension — Install & Test Guide

> **Time to first run: ~5 minutes**
> **Skill level: Basic — if you can install a Chrome extension, you can do this**

---

## What Is This?

ResonantOS is an AI-powered browser extension that lives in your Chrome/Brave/Edge sidebar. An AI copilot that can see what you're looking at, understand your context, guide you through tasks, and take actions on your behalf.

**What you get:**
- **Augmentor** — AI chat assistant that reads your current page and answers questions about it
- **Agent Control** — tell the AI to click, type, scroll, and navigate pages for you (with safety gates and visual feedback)
- **Resonant Context** — the AI silently understands what you're looking at (viewport tracking, dwell time, form state)
- **Resonator** — the AI highlights elements, draws arrows, shows step badges to guide you
- **Protocol Store** — browse and install AI protocols (opens as its own tab)
- **Shield** — security audit trail showing what the AI blocked or approved (opens as its own tab)
- **Living Archive** — save and search anything you've browsed (opens as its own tab)
- **R-Awareness** — see how much context the AI has about your current page (opens as its own tab)
- **Blackboard** — visual display canvas for diagrams, tables, documents, presentations (opens as its own tab)
- **Fleet & Compute** — mission control dashboard for monitoring your fleet machines, cloud infrastructure, and compute governance
- **Wallet Adapter** — Phantom/Solana wallet detection
- **Voice dictation** — speak your questions (when supported by browser)

---

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | 22 or higher | `node --version` |
| npm | Included with Node | `npm --version` |
| Chrome, Brave, or Edge | Latest | Any Chromium-based browser |
| Git | Any | `git --version` |

---

## Quick Install (macOS / Linux)

```bash
# 1. Clone the repository
git clone https://github.com/ResonantOS/resonantos-vnext.git
cd resonantos-vnext

# 2. Install dependencies
npm ci

# 3. Run the automated installer
bash browser-first/install.sh

# 4. Start the bridge server
node browser-first/host/run-browser-first.mjs
```

The installer will:
- Verify Node.js version
- Install the native messaging host for Chrome bridge communication
- Set up the LaunchAgent (macOS) or systemd service (Linux) for auto-start
- Print a success message with next steps

## Quick Install (Windows)

```powershell
# PowerShell (run as Administrator)
powershell -ExecutionPolicy Bypass -File browser-first\install.ps1
```

Or use the batch file:
```cmd
browser-first\install.bat
```

## Manual Install (Any OS)

```bash
# 1. Clone and install
git clone https://github.com/ResonantOS/resonantos-vnext.git
cd resonantos-vnext
npm ci

# 2. Start the bridge server
node browser-first/host/run-browser-first.mjs

# 3. Load the extension manually:
#    a. Open Chrome/Brave/Edge
#    b. Navigate to chrome://extensions (or brave://extensions)
#    c. Enable "Developer mode" (top right toggle)
#    d. Click "Load unpacked"
#    e. Select the folder: browser-first/resonantos-side-panel-extension/
#    f. The ResonantOS icon appears in your toolbar
```

---

## Configure AI Providers

The extension needs at least one AI provider to chat. Open the Settings workspace (click Settings in the workspace rail) and enter an API key:

| Provider | Model | Key Format | Free Tier |
|----------|-------|-----------|-----------|
| **Groq** | Llama 3.3 70B | `gsk_...` | Yes (rate limited) |
| OpenAI | GPT-5.5, GPT-4o | `sk-proj-...` | No |
| Anthropic | Claude Sonnet 4, Opus 4 | `sk-ant-...` | No |
| xAI | Grok 4 | `xai-...` | No |
| DeepSeek | DeepSeek V3, R1 | `sk-...` | Yes ($0.28/M tokens) |
| Google | Gemini 2.5 Pro/Flash | `AIza...` | Yes (rate limited) |

**Recommended for testing:** Groq (free, fast, no credit card needed).

---

## Verify Installation

### 1. Check the bridge server
The bridge server should show:
```
ResonantOS browser-first bridge listening on http://127.0.0.1:47773
```

### 2. Check the extension
- Click the ResonantOS icon in your toolbar
- The side panel should open with the Augmentor chat
- Type "hello" — if you've configured a provider, you should get a response

### 3. Test Agent Control
- Navigate to any webpage
- In the Augmentor chat, type: "Read this page and summarize it"
- The AI should read the page context and respond

### 4. Test Resonant Context
- Navigate to a supported domain (e.g., jup.ag, amazon.com, google.com)
- Ask: "What am I looking at?"
- The AI should describe what's visible on the page with specific section awareness

---

## Run Tests

```bash
# Run the full test suite (233+ tests)
npm run test:browser-first

# Expected output:
# tests 233
# pass 233
# fail 0
# duration_ms ~4000
```

### Test by module:

```bash
# Addon discovery tests (38 tests)
node --test browser-first/test/addon-discovery.test.mjs

# Contract tests (verifies extension structure)
node --test browser-first/test/browser-first-contract.test.mjs

# Individual module tests
node --test browser-first/test/wallet-adapter.test.mjs
node --test browser-first/test/protocol-store.test.mjs
node --test browser-first/test/shield-tab.test.mjs
node --test browser-first/test/archive-tab.test.mjs
node --test browser-first/test/awareness-tab.test.mjs
```

---

## Addon System

ResonantOS uses a dynamic addon discovery system. Addons are self-contained folders in `browser-first/addons/` with an `addon.json` manifest.

### Currently Registered Addons (9)

| Addon | ID | Mode | Description |
|-------|----|------|-------------|
| Blackboard | `addon.blackboard` | visual-surface | Canvas, documents, tables, embeds, slideshows |
| Fleet & Compute | `addon.fleet-compute` | utility | Fleet monitoring, cloud control, compute governance |
| Resonant Context | `addon.resonant-context` | awareness-engine | Viewport tracking, dwell time, domain plugins |
| Resonator | `addon.resonator` | visual-guide | Highlights, arrows, spotlights, step badges |
| Shield | `addon.shield` | security-monitor | Security audit log |
| Archive | `addon.archive` | memory-system | Living Archive browser |
| Awareness | `addon.awareness` | page-observer | R-Awareness context viewer |
| Protocol Store | `addon.protocol-store` | utility | Protocol/tool browser |
| Wallet Adapter | `addon.wallet-adapter` | utility | Phantom wallet detection |

### Building Your Own Addon

See `browser-first/addons/ADDON-SPEC.md` for the complete developer guide.

Minimal addon:
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

Drop the folder in `browser-first/addons/`, restart the extension, and it appears in the Add-ons workspace.

---

## Uninstall

### macOS/Linux
```bash
# Remove native messaging host
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.resonantos.bridge.json
# Or for Brave:
rm ~/Library/Application\ Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.resonantos.bridge.json
```

### Windows
```powershell
powershell -ExecutionPolicy Bypass -File browser-first\uninstall.ps1
```

Then remove the extension from `chrome://extensions`.

---

## Troubleshooting

### Bridge server won't start
- Check Node.js version: `node --version` (must be 22+)
- Check port 47773 is not in use: `lsof -i :47773`
- Try: `npx kill-port 47773` then restart

### Extension not loading
- Ensure "Developer mode" is enabled in `chrome://extensions`
- Check the extension isn't showing errors (red icon)
- Click "Errors" on the extension card for details

### No AI response
- Check that at least one provider API key is configured in Settings
- Check the bridge server is running (look for "Bridge Connected" indicator)
- Check browser console for errors (F12 → Console)

### Agent Control not working
- The page must be a regular HTTP/HTTPS page (not `chrome://` or extension pages)
- Some sites block content script injection (banking sites, etc.)
- Check Shield tab for any blocked actions

---

## Architecture

```
User's Browser (Chrome/Brave/Edge)
  ├── Extension (side panel + content scripts)
  │   ├── Augmentor Chat (side-panel.js)
  │   ├── Agent Control Overlay (content.js)
  │   ├── Resonant Context SDK (resonant-context.js)
  │   ├── Resonator Visual Guide (resonator.js)
  │   └── Full-tab panels (Shield, Archive, Awareness, Protocol Store, Blackboard)
  │
  └── Bridge Server (Node.js, port 47773)
      ├── Provider Router (Groq, OpenAI, Anthropic, xAI, DeepSeek, Google)
      ├── Addon Discovery (scans addons/ directory)
      ├── Living Archive (page storage + retrieval)
      ├── Audit Trail (security event logging)
      └── Fleet/Cloud/Compute status endpoints
```

---

## Credits

- **Manolo Remiddi** — Architecture, Agent Control overlay, workspace system, Compute Fabric (ADR-032)
- **Tom Pennington** — Resonant Context SDK, Resonator, addon system, Fleet & Compute dashboard, security hardening, install scripts, CI
- **Michel** — Atomic Design system (tokens, typography, component hierarchy, WCAG accessibility)
- **Analog 6** — AVD implementation partner
