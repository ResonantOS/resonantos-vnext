# Chrome Web Store — Store Listing Copy

Use this document to populate the listing form at
https://chrome.google.com/webstore/devconsole when submitting the extension.

---

## Extension Name

```
ResonantOS Browser Layer
```

---

## Short Description  *(132 characters max)*

```
AI strategist sidebar for Web3. Reads pages, assists trades, manages memory. Pairs with Phantom wallet. Human-approval gated.
```

Character count: 126 ✓

---

## Category

**Productivity**

---

## Language

**English**

---

## Detailed Description  *(16,000 characters max)*

```
ResonantOS Browser Layer brings an AI strategist directly into your browser
as a persistent side panel — always available, never intrusive, and
architecturally incapable of acting without your explicit approval.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT IT DOES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ AUGMENTOR SIDEBAR
  A lightweight AI assistant reads the current page and surfaces relevant
  context, suggestions, and risk flags — from DeFi protocol documentation
  to NFT contract details.  It does not send page content to any remote
  server without your explicit instruction.

▸ LIVING ARCHIVE CONTEXT
  As you browse, ResonantOS builds a local memory of pages, trades, and
  decisions you care about.  The side panel surfaces relevant memories
  when you revisit similar contexts — like having a research assistant who
  actually remembers what you looked at last week.

▸ PHANTOM WALLET PAIRING
  ResonantOS detects Phantom wallet activity on the current page and can
  surface risk analysis before you sign a transaction.  It never requests
  wallet access itself.  Signing always goes through the standard Phantom
  flow; ResonantOS only observes and advises.

▸ HUMAN-APPROVAL GATE
  Every action that touches your wallet, submits a form, or modifies
  credentials is gated behind a human-approval step.  The gate cannot be
  bypassed by the AI or by the page.  You decide.  Always.

▸ TASK MONITOR
  Long-running research or monitoring tasks run in the background and
  surface results in the side panel when complete.  No need to keep a tab
  open.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ResonantOS is built around a layered security architecture:

1. LOCAL-FIRST PROCESSING
   All AI inference happens through a local bridge server running on your
   machine (port 47773).  Page content, wallet activity, and memory context
   never leave your device unless you explicitly configure an external AI
   provider and initiate a request.

2. APPROVAL-REQUIRED ACTION SET
   Six categories of action require explicit human approval before
   execution:
     • wallet_connect      — connecting to a wallet
     • wallet_sign         — signing a transaction or message
     • wallet_switch_network — switching chains
     • public_submit       — submitting any public form
     • sensitive_type      — typing into password / private-key fields
     • credential_autofill — filling stored credentials

3. AUDIT TRAIL
   Every wallet-related action request — approved or denied — is logged
   to the local bridge's audit endpoint.  The log is stored on your
   machine and is never transmitted.

4. NO CREDENTIAL ACCESS
   The extension cannot read, copy, or transmit wallet seed phrases,
   private keys, or passwords.  It observes activity but has no mechanism
   to extract secrets.

5. CONTENT SCRIPT ISOLATION
   The content script that reads page context runs in an isolated world
   and communicates only with the extension's own service worker —
   never directly with external servers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Install the extension and click the toolbar icon.
2. The side panel opens on the right side of your browser window.
3. Install the ResonantOS bridge (a small local server) by running the
   one-line installer provided in the extension's welcome screen.
4. Browse normally.  Augmentor analyses the current page in the background
   and surfaces relevant context without disrupting your workflow.
5. When a wallet action is detected, the approval gate activates and waits
   for your explicit confirmation before anything proceeds.
6. Open the panel anytime with Alt+Shift+A.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAO & GOVERNANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ResonantOS is developed under an open governance model.  The roadmap,
security model, and approval gate rules are all subject to community
review.  Feature proposals, security audits, and protocol changes are
discussed publicly before implementation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERMISSIONS EXPLAINED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ activeTab   — Read the current page's title and URL so Augmentor can
                provide relevant context.  No data is stored or transmitted
                without user action.

▸ sidePanel   — Display the Augmentor UI in Chrome's native side panel.
                Required for the core UI.

▸ storage     — Save your preferences and local memory context on your
                device.  Not synced to any server.

▸ tabs        — Monitor tab changes so the side panel context updates when
                you navigate to a new page.

▸ host_permissions (http://* and https://*)
              — Required so the content script can read page context on
                any site you choose to use Augmentor on.  The script only
                activates when the side panel is open and only sends data
                to the local bridge (127.0.0.1:47773).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY COMMITMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ No telemetry.  We do not collect usage data.
▸ No tracking.  We do not follow you across sites.
▸ No remote storage.  Memory context stays on your machine.
▸ No ads.  Ever.
▸ API keys you configure for external AI providers are stored locally
  only and are never transmitted to ResonantOS servers (there are none).

Full privacy policy: https://resonantos.io/privacy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Chrome 116 or later (or any Chromium-based browser supporting sidePanel API)
▸ Brave Browser is fully supported
▸ ResonantOS local bridge (macOS/Linux installer provided in-extension)
▸ Optional: Phantom wallet extension for Web3 features

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPEN SOURCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The extension source and the local bridge daemon are open source.
Audit them, fork them, improve them.
Source: https://github.com/resonantos/resonantos-vnext

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Documentation: https://resonantos.io/docs
▸ GitHub issues: https://github.com/resonantos/resonantos-vnext/issues
▸ Discord community: https://discord.gg/resonantos
```

---

## Website URL

```
https://resonantos.io
```

## Support URL

```
https://resonantos.io/support
```

## Privacy Policy URL

```
https://resonantos.io/privacy
```
