# Chrome Web Store — Extension Review Preparation Notes

This document is intended for the Chrome Web Store review team and for
internal use during the submission process.  It explains every permission
requested, all content script behavior, and how AI calls are routed.

---

## 1. Permissions Justification

### `activeTab`

**Why we need it:**
The Augmentor AI assistant reads the title and URL of the currently active
tab to provide page-relevant context in the side panel.  Without `activeTab`
the extension would need the broader `tabs` permission for tab metadata — we
prefer the narrower `activeTab` for the tab metadata use case.

**What we do NOT do with it:**
- We do not read page DOM content via `activeTab` directly; that is handled
  by the content script injection (separate permission scope).
- We do not screenshot, record, or transmit tab content to remote servers.

**Code location:** `src/background.js` — `chrome.runtime.onMessage` handler
for `active_tab_context` message type.

---

### `sidePanel`

**Why we need it:**
The entire UI of ResonantOS lives in Chrome's native side panel.  Without
`sidePanel` we cannot open or control the panel programmatically.

**What we do NOT do with it:**
- We do not open the panel on tabs the user has not interacted with.
- The panel opens on install (one-time welcome) and on user action
  (toolbar click or Alt+Shift+A shortcut).

**Code location:** `src/background.js` — `chrome.sidePanel.open()` calls.

---

### `storage`

**Why we need it:**
User preferences (theme, enabled features), Living Archive memory context
(page summaries the user explicitly saves), and bridge connection state are
persisted using `chrome.storage.local`.

**What we do NOT do with it:**
- We do not use `chrome.storage.sync` — data never leaves the device.
- We do not store sensitive financial data, wallet keys, or credentials.
- We do not store personally identifiable information.

**Code location:** `src/side-panel.js` — settings persistence.

---

### `tabs`

**Why we need it:**
The side panel must update its context display when the user navigates to a
new page or switches tabs.  Without `tabs` we cannot listen for tab activation
or URL-change events.

**What we do NOT do with it:**
- We do not enumerate all open tabs or read tab content from tabs the user
  is not currently viewing.
- We do not persist or transmit tab history.

**Code location:** `src/background.js` — tab event listeners.

---

### `host_permissions: ["http://*/*", "https://*/*"]`

**Why we need it:**
The content script (`src/content.js`) must be injected into pages the user
visits so it can extract page context (title, URL, selected text) and detect
wallet action attempts on those pages.  Chrome requires broad `host_permissions`
for content scripts that run on arbitrary sites.

**What the content script does:**
1. Listens for messages from the extension's side panel.
2. When the panel requests page context, sends back the page title, URL, and
   optionally selected text.
3. Detects wallet action events (via DOM observation of Phantom/Solana
   provider events) and notifies the background service worker, which then
   activates the human-approval gate.

**What the content script does NOT do:**
- It does not exfiltrate page content to any remote server.
- All data flows from content script → background service worker → local
  bridge (127.0.0.1:47773).  The local bridge is on the user's own machine.
- It does not inject ads, modify page content, or interact with the page DOM
  beyond reading it.
- It does not run on extension pages, chrome://* pages, or the Chrome Web
  Store itself.

**Why we cannot use a narrower permission:**
We cannot enumerate a specific list of host patterns because Augmentor is a
general-purpose research assistant that users invoke on any site they browse.
A closed allowlist would break the core use case.

---

## 2. Content Script Behavior

**File:** `src/content.js`
**Injection point:** `document_idle` (after the page has finished loading)
**Matches:** `http://*/*`, `https://*/*`

### What it does

The content script runs in an **isolated world** (Chrome's default content
script sandbox).  It cannot access page JavaScript variables, the page's
window object, or any data stored by the page's own scripts.

It communicates exclusively with the extension's service worker
(`src/background.js`) via `chrome.runtime.sendMessage` / `postMessage`.

Message types the content script sends:
- `active_tab_context` — page title + URL, triggered by a side panel request.
- `wallet_action_detected` — fired when Phantom's injected provider emits a
  sign/connect event, triggering the approval gate.

**No data is sent to any external server by the content script.**  All
outbound data flows through the background service worker, which routes to
the local bridge at `http://127.0.0.1:47773`.

---

## 3. AI Call Routing — Local Bridge Architecture

**All AI calls go through a local server, not directly to AI providers.**

Architecture:

```
Extension (side-panel.js)
    │
    │  HTTP POST to http://127.0.0.1:47773
    ▼
ResonantOS Bridge (bridge-daemon.mjs, running on user's machine)
    │
    │  Optional: HTTP to external AI provider (only if user configured one)
    ▼
OpenAI / Anthropic / local LLM (user-configured, user's own API key)
```

The bridge is not a cloud service.  It is a Node.js process the user installs
and runs locally.  The extension cannot function as an AI assistant without
the bridge running, which means:

- **No hidden cloud backend.**  There is no ResonantOS server that page
  content passes through.
- **User-controlled AI provider.**  The user supplies their own API keys to
  their AI provider of choice.  ResonantOS never sees those keys.
- **Offline operation.**  If the user configures a local LLM (e.g. Ollama),
  no network calls leave the machine at all.

### Why port 47773?

Port 47773 was chosen to be outside common port ranges and unlikely to
conflict with other development services.  It is not privileged (above 1024).
The bridge binds to `127.0.0.1` (loopback) only — it is not accessible from
the network.

---

## 4. Human-Approval Gate

Six action categories are hardcoded as requiring human approval:

| Action | Description |
|--------|-------------|
| `wallet_connect` | Connecting a wallet to a dApp |
| `wallet_sign` | Signing a transaction or arbitrary message |
| `wallet_switch_network` | Changing the active blockchain network |
| `public_submit` | Submitting a form to a public endpoint |
| `sensitive_type` | Typing into a password or private-key field |
| `credential_autofill` | Autofilling stored credentials |

When the AI or a page script requests one of these actions, the background
service worker:
1. Intercepts the request.
2. Returns `{ approvalRequired: true, deniedToAutomation: true }` immediately.
3. Surfaces the approval prompt in the side panel.
4. Only proceeds after the user explicitly clicks "Approve".

This gate **cannot be bypassed by the page, by the AI, or by any extension
message**.  It is enforced in the background service worker, which is isolated
from page JavaScript.

---

## 5. No Remote Code Execution

The extension does not fetch or execute remote JavaScript.  All code is
bundled at install time.  There is no `eval()` usage and no dynamic script
loading from external URLs.

---

## 6. Single-Purpose Declaration

The extension's single purpose is:
**Providing an AI-assisted research and approval layer for Web3 browsing via a
persistent side panel connected to a local AI bridge.**

All permissions are directly required for this purpose.  There are no features
that use permissions beyond what is documented here.

---

## 7. Data Handling Summary for Reviewers

| Category | Collected? | Stored Where? | Transmitted To? |
|----------|-----------|--------------|----------------|
| Page title / URL | Yes (when panel open) | Local bridge only | Local bridge (127.0.0.1) |
| Page text content | On user request only | Local bridge only | Local bridge → user's AI provider (if configured) |
| Wallet action type | Yes (for approval gate) | Local audit log (device) | Nowhere |
| Public wallet address | Optional (audit log) | Local audit log (device) | Nowhere |
| User preferences | Yes | chrome.storage.local | Nowhere |
| Telemetry / analytics | No | N/A | N/A |
| Personally identifiable info | No | N/A | N/A |

---

## 8. Contact for Reviewers

If the review team has questions or requires additional information:

- GitHub repository: https://github.com/resonantos/resonantos-vnext
- Issues / contact: https://github.com/resonantos/resonantos-vnext/issues
