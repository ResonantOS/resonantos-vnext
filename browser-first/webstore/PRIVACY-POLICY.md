# ResonantOS Browser Layer — Privacy Policy

*Last updated: 2026-05-25*

This privacy policy describes how the **ResonantOS Browser Layer** Chrome
extension handles your data.  We are committed to a local-first, no-tracking
architecture.  This policy is written in plain language on purpose.

---

## 1. Who We Are

ResonantOS is an open-source project.  The extension is developed by the
ResonantOS team and community.  Source code is available at
https://github.com/resonantos/resonantos-vnext.

---

## 2. What Data the Extension Reads

When the side panel is open and active, the extension may read:

| Data | Purpose | Leaves Your Device? |
|------|---------|-------------------|
| **Page title** | Provide Augmentor with context about the current page | Only to local bridge (127.0.0.1:47773) |
| **Page URL** | Identify the site for context and risk analysis | Only to local bridge |
| **Page text content** | Surface relevant AI context via Augmentor | Only to local bridge; only when you initiate a request |
| **Wallet action type** | Trigger approval gate for sensitive wallet operations | Logged locally only |
| **Wallet address** (public) | Included in local audit log entry | Never transmitted externally |

**The extension does NOT read:**
- Private keys or seed phrases
- Passwords stored in password managers
- Browser history
- Cookies or authentication tokens
- Any data from tabs that do not have the side panel open

---

## 3. What Is NOT Collected

We do not collect:

- **No telemetry** — no usage statistics, crash reports, or feature analytics
  are sent anywhere.
- **No tracking** — no cross-site tracking, fingerprinting, or behavioral
  profiling.
- **No remote storage** — nothing you do inside the extension is stored on any
  server operated by ResonantOS.
- **No advertising data** — there are no ads and no data sold to advertisers.
- **No identity data** — we do not collect your name, email address, IP address,
  or any personally identifiable information.

---

## 4. Where Data Goes — Local Bridge Only

All processing happens through the **ResonantOS local bridge**, a small server
that runs exclusively on your own machine at `http://127.0.0.1:47773`.

- Page context sent to the bridge stays on your machine.
- The bridge is not a cloud service.  It has no outbound network connections
  except those you configure (e.g. an AI API key you supply).
- The bridge's audit log (wallet action events) is written to your local
  filesystem only.

**If you configure an external AI provider** (e.g. OpenAI or Anthropic) inside
the bridge, page content you explicitly submit for AI analysis will be sent to
that provider according to the provider's own privacy policy.  ResonantOS does
not operate any AI inference servers.

---

## 5. API Keys

Any API keys you configure for external AI providers are:

- Stored on your local machine only, inside the bridge's configuration file.
- Never transmitted to ResonantOS servers (there are none).
- Never visible to the extension's JavaScript layer.
- Your responsibility to keep secure.

---

## 6. Wallet Data

The extension integrates with Phantom wallet and other Solana-compatible
wallets.

- **We never request wallet access.**  We do not call `connect()` or prompt
  you to authorize the extension as a wallet application.
- **We cannot sign transactions** on your behalf.
- **We cannot transfer funds.**
- **Approval gate:** wallet_connect, wallet_sign, wallet_switch_network actions
  detected on a page are intercepted and require your explicit click-through
  before being allowed to proceed.  The detection is read-only.
- **Audit log:** each intercepted wallet action is logged locally with the
  action type, page URL, public wallet address (if available), and a
  timestamp.  This log never leaves your machine.

---

## 7. Storage

The extension uses `chrome.storage.local` to persist:

- Your preferences (panel layout, theme, enabled features)
- Living Archive memory context (page summaries you have saved)
- Bridge connection status

This data is stored in Chrome's local profile directory on your device.  It
is not synced to Google's servers (we use `storage.local`, not
`storage.sync`).

---

## 8. Permissions Justification

| Permission | Why It's Needed |
|-----------|----------------|
| `activeTab` | Read the current page's title and URL for Augmentor context.  Only active when the side panel is open. |
| `sidePanel` | Render the Augmentor UI in Chrome's native side panel API. |
| `storage` | Save your preferences and local memory context. |
| `tabs` | Detect tab navigation so the panel updates when you change pages. |
| `host_permissions: http://* https://*` | The content script needs to run on any page you choose to use Augmentor on.  Content is only forwarded to the local bridge (127.0.0.1), never to external servers. |

---

## 9. Children's Privacy

This extension is not directed at children under 13.  We do not knowingly
collect any information from children.

---

## 10. Changes to This Policy

If we make material changes to this policy, we will update the "Last updated"
date at the top and release a new extension version with the updated policy
link.  Significant changes will also be noted in the extension's release notes.

---

## 11. Contact

Questions about this privacy policy:

- Open an issue: https://github.com/resonantos/resonantos-vnext/issues
- Community Discord: https://discord.gg/resonantos

---

## 12. Open Source Verification

Because the extension is open source, you can verify every claim in this
policy by reading the code yourself:

- Extension source: `browser-first/resonantos-side-panel-extension/`
- Bridge daemon: `browser-first/host/bridge-daemon.mjs`
- Content script (what runs on pages): `src/content.js`
- Background service worker: `src/background.js`

We encourage independent security audits.
