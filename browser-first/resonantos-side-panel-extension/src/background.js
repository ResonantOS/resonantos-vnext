const APPROVAL_REQUIRED_ACTIONS = new Set([
  "wallet_connect",
  "wallet_sign",
  "wallet_switch_network",
  "public_submit",
  "sensitive_type",
  "credential_autofill",
]);

const WALLET_ACTIONS = new Set([
  "wallet_connect",
  "wallet_sign",
  "wallet_switch_network",
]);

const BRIDGE_URL = "http://127.0.0.1:47773";

// Track whether the side panel is currently open.
// Updated via port connection from side-panel.js (name: "side-panel").
let sidePanelOpen = false;

/**
 * logWalletActionToBridge — sends a wallet audit entry to the host bridge.
 * Fire-and-forget: failures are logged to console only.
 */
function logWalletActionToBridge(payload) {
  fetch(`${BRIDGE_URL}/audit/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.warn("[ResonantOS] Wallet audit log failed:", err));
}

const openResonantSidePanel = async (windowId) => {
  if (typeof chrome.sidePanel?.open !== "function" || windowId === undefined) {
    return;
  }
  await chrome.sidePanel.open({ windowId }).catch(() => undefined);
  // Mark panel as open; port disconnect from side-panel.js will clear this.
  sidePanelOpen = true;
};

// When the side panel loads it connects a port named "side-panel".
// Port disconnect fires when the panel is closed, letting us clear the flag.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "side-panel") return;
  sidePanelOpen = true;
  port.onDisconnect.addListener(() => {
    sidePanelOpen = false;
  });
});

// Redirect new tabs to the main workspace while the side panel is open.
chrome.tabs.onCreated.addListener((tab) => {
  if (!sidePanelOpen) return;
  const pending = tab.pendingUrl ?? tab.url ?? "";
  if (pending === "chrome://newtab/" || pending === "about:blank" || pending === "") {
    const workspaceUrl = chrome.runtime.getURL("src/main-workspace.html");
    chrome.tabs.update(tab.id, { url: workspaceUrl });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  setTimeout(() => {
    chrome.windows.getCurrent((window) => {
      void openResonantSidePanel(window?.id);
    });
  }, 1500);

  // Check if native messaging host (bridge) is available
  try {
    const port = chrome.runtime.connectNative("com.resonantos.bridge");
    port.onMessage.addListener((msg) => {
      if (msg?.ok) console.log("[ResonantOS] Bridge native host connected");
      port.disconnect();
    });
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message || "";
      if (err.includes("not found") || err.includes("Specified native messaging host not found")) {
        console.log("[ResonantOS] Bridge native host not installed. Bridge server on port 47773 required.");
      }
    });
  } catch {
    // Native messaging not available — bridge must be started manually
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  await openResonantSidePanel(tab.windowId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-augmentor-side-panel") {
    return;
  }
  chrome.windows.getCurrent((window) => {
    void openResonantSidePanel(window?.id);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Blackboard to-panel relay: blackboard tab → side panel ─────────────────
  // Store in chrome.storage.session so the side panel can pick it up via onChanged listener.
  if (message && message.channel === "resonantos.blackboard.to_panel") {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "Unauthorized sender" });
      return true;
    }
    const record = { ...(message.payload ?? {}), _ts: Date.now() };
    chrome.storage.session.set({ blackboardToPanel: record }).catch(() => undefined);
    sendResponse({ ok: true });
    return true;
  }

  // ── Blackboard relay: side panel → blackboard tab ──────────────────────────
  if (message && message.channel === "resonantos.blackboard.relay") {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: "Unauthorized sender" });
      return true;
    }
    chrome.tabs.query({}, (tabs) => {
      const bbTab = tabs.find((t) => t.url?.includes("blackboard.html"));
      if (bbTab) {
        chrome.tabs.sendMessage(bbTab.id, message.payload, () => {
          const err = chrome.runtime.lastError; // suppress unchecked error
          sendResponse({ ok: true, relayed: true });
        });
      } else {
        sendResponse({ ok: true, relayed: false, reason: "Blackboard tab not open" });
      }
    });
    return true; // async
  }

  if (!message || message.channel !== "resonantos.browser_first") {
    return false;
  }

  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "Unauthorized sender" });
    return true;
  }

  if (message.type === "active_tab_context") {
    sendResponse({
      ok: true,
      tabId: sender.tab?.id ?? null,
      title: sender.tab?.title ?? "",
      url: sender.tab?.url ?? "",
      receivedAt: new Date().toISOString()
    });
    return true;
  }

  if (message.type === "open_side_panel") {
    const windowId = sender.tab?.windowId;
    if (windowId !== undefined) {
      void openResonantSidePanel(windowId).then(() => sendResponse({ ok: true }));
      return true;
    }
    chrome.windows.getCurrent((window) => {
      void openResonantSidePanel(window?.id).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "action_request") {
    const action = String(message.action ?? "");
    const approvalRequired = APPROVAL_REQUIRED_ACTIONS.has(action);
    const isWalletAction = WALLET_ACTIONS.has(action);

    // Log all wallet-related action requests to the audit trail.
    if (isWalletAction) {
      logWalletActionToBridge({
        action,
        pageUrl: sender.tab?.url ?? null,
        walletAddress: message.walletAddress ?? null,
        approved: !approvalRequired,
        timestamp: new Date().toISOString(),
        details: {
          tabId: sender.tab?.id ?? null,
          tabTitle: sender.tab?.title ?? null,
          origin: message.origin ?? null,
        },
      });
    }

    sendResponse({
      ok: !approvalRequired,
      approvalRequired,
      deniedToAutomation: approvalRequired,
      reason: approvalRequired
        ? "Wallet, credential, public-submit, and sensitive actions require explicit human approval."
        : "Safe browser action can be routed through the governed ResonantOS tool bridge.",
    });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown ResonantOS browser-first message." });
  return true;
});
