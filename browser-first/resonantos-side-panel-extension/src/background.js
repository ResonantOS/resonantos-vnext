const APPROVAL_REQUIRED_ACTIONS = new Set([
  "wallet_connect",
  "wallet_sign",
  "wallet_switch_network",
  "public_submit",
  "sensitive_type",
  "credential_autofill",
]);

const openResonantSidePanel = async (windowId) => {
  if (typeof chrome.sidePanel?.open !== "function" || windowId === undefined) {
    return;
  }
  await chrome.sidePanel.open({ windowId }).catch(() => undefined);
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  setTimeout(() => {
    chrome.windows.getCurrent((window) => {
      void openResonantSidePanel(window?.id);
    });
  }, 1500);
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
  if (!message || message.channel !== "resonantos.browser_first") {
    return false;
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

  if (message.type === "action_request") {
    const action = String(message.action ?? "");
    const approvalRequired = APPROVAL_REQUIRED_ACTIONS.has(action);
    sendResponse({
      ok: !approvalRequired,
      approvalRequired,
      deniedToAutomation: approvalRequired,
      reason: approvalRequired
        ? "Wallet, credential, public-submit, and sensitive actions require explicit human approval."
        : "Safe browser action can be routed through the governed ResonantOS tool bridge."
    });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown ResonantOS browser-first message." });
  return true;
});
