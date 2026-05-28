# ResonantOS Browser Extension — Install Guide

> **Time to first run: ~5 minutes**
> **Skill level: Basic — if you can install a Chrome extension, you can do this**

---

## What Is This?

ResonantOS is an AI-powered browser extension that lives in your Chrome/Brave/Edge sidebar. Think of it as an AI copilot that can see what you're looking at and help you navigate the web.

**What you get:**
- **Augmentor** — AI chat assistant that can read your current page and answer questions about it
- **Agent Control** — tell the AI to click, type, scroll, and navigate pages for you (with safety gates)
- **Protocol Store** — browse and install AI protocols (opens as its own tab)
- **Shield** — security audit trail showing what the AI blocked or approved (opens as its own tab)
- **Living Archive** — save and search anything you've browsed (opens as its own tab)
- **R-Awareness** — see how much context the AI has about your current page (opens as its own tab)
- **Blackboard** — visual display canvas for diagrams, tables, documents, presentations (opens as its own tab)
- **Voice dictation** — speak your questions

Your API keys never leave your computer. The extension talks to a local bridge server running on your machine.

---

## What You Need

| Requirement | Version | How to Check |
|-------------|---------|-------------|
| **Node.js** | **22 or newer** | Run `node -v` in Terminal |
| **Chrome, Brave, or Edge** | Any recent version | Must support side panels |
| **Git** | Any | Run `git --version` in Terminal |
| **API key** | At least one | See "Supported Providers" below |

**Don't have Node.js?** Download it from https://nodejs.org (pick the LTS version).

**Need a free API key?** [Groq](https://console.groq.com) gives free keys with generous limits — sign up takes 30 seconds.

---

## Step 1: Get the Code

Open Terminal (Mac) or Command Prompt (Windows) and run:

```bash
git clone https://github.com/ResonantOS/resonantos-vnext.git
cd resonantos-vnext
git checkout tom/browser-first-merged
```

---

## Step 2: Start the Bridge Server

The bridge is a lightweight local server that handles AI calls. It has zero npm dependencies — just Node.js.

```bash
node browser-first/host/run-browser-first.mjs
```

You should see output confirming the bridge is running on port 47773.

> **Leave this terminal window open.** The bridge needs to keep running while you use the extension.

---

## Step 3: Load the Extension in Your Browser

1. Open **Chrome** or **Brave**
2. Type `chrome://extensions/` in the address bar and press Enter
3. Turn on **Developer mode** (toggle switch in the top right corner)
4. Click the **"Load unpacked"** button
5. Navigate to where you cloned the repo and select this folder:
   ```
   resonantos-vnext/browser-first/resonantos-side-panel-extension/
   ```
6. You'll see a **ResonantOS** card appear on the extensions page
7. The **◈** icon appears in your browser toolbar

---

## Step 4: Open ResonantOS

- Click the **◈ ResonantOS icon** in your toolbar, OR
- Press **Alt+Shift+A** (keyboard shortcut)

The side panel opens on the right side of your browser.

---

## Step 5: Add Your API Key

1. Click the **⚙ gear icon** in the side panel header
2. Enter an API key:
   - **OpenAI** → paste your `sk-proj-...` key
   - **MiniMax** → paste your `eyJ...` key
3. Click **"Save Keys"**
4. The status line should show "Connected to [model] · Ready"

> **More providers** (Anthropic, Groq, DeepSeek, xAI) can be added via the bridge API. Additional provider fields are coming in a future UI update.

---

## Step 6: Try It Out

### Chat with Augmentor
Type a message in the "Message Augmentor" box and press Enter (or click ➜).

### Read a Page
Navigate to any website, then click the **◎** button in the composer toolbar (or just ask "What am I looking at?"). Augmentor reads the page and responds.

### Agent Control
Type `/control` followed by a task, like:
```
/control Search Google for "best hiking trails near me" and read the top result
```
The AI plans steps, shows you what it's doing with a green overlay, and asks for approval before sensitive actions.

### Open Feature Tabs
Click any of the 4 buttons at the bottom of the side panel:
- **◈ Protocol Store** — AI protocol marketplace
- **◈ Shield** — security audit trail
- **◈ Archive** — search and save pages
- **◈ R-Awareness** — context awareness metrics

### Blackboard
Ask Augmentor to show something visually:
```
/draw a diagram of how photosynthesis works
```
The Blackboard opens as its own tab.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Side panel won't open | Try right-clicking the ◈ icon → "Open side panel" |
| "Bridge offline" banner | Make sure `node run-browser-first.mjs` is still running in Terminal |
| No AI response | Click ⚙, check that you saved a valid API key |
| Extension doesn't appear | Make sure you selected `resonantos-side-panel-extension/` folder, not `browser-first/` |
| Can't find the icon | Click the puzzle piece 🧩 in the toolbar → pin ResonantOS |

---

## Supported AI Providers

| Provider | Models | Key Format | Free? |
|----------|--------|-----------|-------|
| OpenAI | GPT-5.5, GPT-4o | `sk-proj-...` | No |
| Anthropic | Claude Sonnet 4, Opus 4 | `sk-ant-...` | No |
| Groq | Llama 3.3 70B, Llama 4 Scout | `gsk_...` | **Yes** ✅ |
| DeepSeek | Chat, Reasoner | `sk-...` | Cheap |
| xAI | Grok-3, Grok-4 | `xai-...` | No |
| MiniMax | MiniMax 2.7 | `eyJ...` | No |

---

## Project Structure

```
resonantos-vnext/
└── browser-first/
    ├── resonantos-side-panel-extension/   ← LOAD THIS IN CHROME
    │   ├── manifest.json
    │   ├── icon16/48/128.png
    │   └── src/
    │       ├── side-panel.html/js/css     ← Main sidebar (Augmentor chat)
    │       ├── background.js              ← Service worker
    │       ├── content.js                 ← Page interaction
    │       ├── lib/                       ← 22 modular engine files
    │       ├── protocol-store.html/js     ← Protocol marketplace (tab)
    │       ├── shield-tab.html/js         ← Security audit (tab)
    │       ├── archive-tab.html/js        ← Living Archive (tab)
    │       ├── awareness-tab.html/js      ← Context metrics (tab)
    │       ├── blackboard.html/js/css     ← Visual canvas (tab)
    │       ├── wallet-adapter.js          ← Wallet integration
    │       ├── resonant-context.js        ← Context awareness SDK
    │       ├── context-plugins.js         ← Domain-specific plugins
    │       └── resonator.js               ← Visual guide overlay
    │
    ├── host/                              ← BRIDGE SERVER
    │   ├── run-browser-first.mjs          ← Start this with Node
    │   └── bridge-server.mjs              ← Auth layer
    │
    └── TESTING.md                         ← This file
```

---

## Reporting Bugs

When reporting an issue, include:
1. **Browser + version** (e.g., Brave 1.75)
2. **OS** (macOS, Windows, Linux)
3. **What you did** (steps to reproduce)
4. **What happened** vs. what you expected
5. **Terminal output** (copy any errors from the bridge server window)
6. **Browser console** (press F12 → Console tab while side panel is open)
7. **Screenshot** if it's a visual issue

---

*Last updated: May 26, 2026*
