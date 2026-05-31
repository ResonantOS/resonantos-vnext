# ResonantOS vNext

> AI that lives inside your browser — not a separate app, not a dashboard. A native layer of your browsing experience.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Chromium Browser                    │
│  ┌───────────────────────┐  ┌────────────────┐  │
│  │   ResonantOS          │  │  Active Tab    │  │
│  │   Side Panel          │  │  (any page)    │  │
│  │                       │  │  Content       │  │
│  │  • Augmentor Chat     │  │  Scripts:      │  │
│  │  • Addon Tabs         │  │  • Context SDK │  │
│  │  • Agent Control      │  │  • Resonator   │  │
│  │  • Living Archive     │  │                │  │
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

---

## Get Started

### One-Line Install

**macOS / Linux:**
```bash
curl -fsSL https://resonantos.com/install.sh | bash
```

**Windows:** Download and double-click [`install.bat`](browser-first/install.bat), or run:
```powershell
powershell -ExecutionPolicy Bypass -File browser-first/install.ps1
```

That's it. The installer handles Node.js, cloning, the bridge server, browser detection, and extension loading.

### Manual Install

<details>
<summary>Click to expand manual steps</summary>

**Prerequisites:**

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | 22 or higher | `node --version` |
| npm | Included with Node | `npm --version` |
| Chrome, Brave, or Edge | Latest | Any Chromium-based browser |

**Steps:**

1. Clone the repository
```bash
git clone https://github.com/ResonantOS/resonantos-vnext.git
cd resonantos-vnext
npm ci
```

2. Start the bridge server
```bash
node browser-first/host/run-browser-first.mjs
```

3. Load the extension
   - Go to `chrome://extensions`
   - Enable **Developer Mode** (toggle top-right)
   - Click **Load unpacked** → select `browser-first/resonantos-side-panel-extension/`

4. Add an AI provider key
   - Click the extension icon → open Settings
   - Enter at least one API key (Groq is free)

</details>

---

## Configure AI Providers

| Provider | Model | Key Format | Free Tier |
|----------|-------|-----------|-----------|
| **Groq** | Llama 3.3 70B | `gsk_...` | ✅ Yes (rate limited) |
| OpenAI | GPT-5.5, GPT-4o | `sk-proj-...` | No |
| Anthropic | Claude Sonnet 4, Opus 4 | `sk-ant-...` | No |
| xAI | Grok 4 | `xai-...` | No |
| DeepSeek | DeepSeek V3, R1 | `sk-...` | ✅ Yes |
| Google | Gemini 2.5 Pro/Flash | `AIza...` | ✅ Yes (rate limited) |

---

## Verify Installation

- ✅ Bridge server logs: `ResonantOS browser-first bridge listening on http://127.0.0.1:47773`
- ✅ Extension icon appears in the browser toolbar
- ✅ Click icon → side panel opens → type "hello" → AI responds

---

## What's Inside

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

### Addon Catalog

Drop a folder into `browser-first/addons/` — it works automatically.

| Addon | What It Does |
|-------|-------------|
| **Blackboard** | 7-mode visual surface — Canvas, Document, Table, Web Embed, Image, Slideshow, Annotate |
| **Fleet & Compute** | Monitor your fleet of machines running Ollama with live HTTP probes |
| **Task Board** | Kanban board with drag-and-drop across Ready / In Progress / Blocked / Done |
| **System Map** | Interactive topology graph of your fleet with zoom, pan, and minimap |
| **Open Items** | Track work items across Needs Attention / Pending / Completed |
| **Gradient Performance** | Training metrics, model benchmarks, and fleet speed dashboard |

---

## Building Addons

See [`browser-first/addons/ADDON-SPEC.md`](https://github.com/ResonantOS/resonantos-vnext/blob/main/browser-first/addons/ADDON-SPEC.md) for the full developer guide.

Minimum structure:
```
browser-first/addons/my-addon/
  addon.json       # Manifest (required)
  my-addon.html    # UI (optional)
  my-addon.js      # Logic (optional)
```

---

## Security

- Addon manifest validation — path traversal, symlink escape, trust tiers, injection blocking
- Wallet operations gated through `requestApproval()` — no raw signing power
- XSS protection via `escapeHtml()` on all untrusted fields
- CI pipeline with SHA-pinned GitHub Actions and enforced `npm audit`
- Content script privacy: password fields excluded, `data-rc-ignore` opt-out

### Non-Negotiable Gates

- Phantom must install/open in the same browser profile
- Wallet connect/sign flows must require human approval
- Augmentor controls the active tab only through typed mediated tools
- No page, addon, or assistant can get raw wallet/signing power

---

## Contributing

See [`browser-first/PR-PLAN.md`](https://github.com/ResonantOS/resonantos-vnext/blob/main/browser-first/PR-PLAN.md) for the contribution plan and merge order. PRs go against `main`.

---

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
│   ├── install.sh                    # macOS/Linux installer
│   ├── install.ps1                   # Windows installer
│   └── PR-PLAN.md                    # Contribution guide
└── docs/
    └── architecture/
        └── ADR-037-browser-first-chromium-resonantos.md
```

---

## Uninstall

```bash
# macOS — remove native messaging host
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.resonantos.bridge.json

# Windows
powershell -ExecutionPolicy Bypass -File browser-first/uninstall.ps1
```

Then remove the extension from `chrome://extensions`.

---

## License

Public source preview. See repository for terms.
