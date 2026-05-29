const APPROVAL_REQUIRED_ACTIONS = new Set([
  "wallet_connect",
  "wallet_sign",
  "wallet_switch_network",
  "public_submit",
  "sensitive_type",
  "credential_autofill",
]);

const MAIN_WORKSPACE_PATH = "/src/main-workspace.html";

const isMainWorkspaceUrl = (url = "") => {
  try {
    return new URL(url).pathname === MAIN_WORKSPACE_PATH;
  } catch {
    return false;
  }
};

const activeTabForWindow = async (windowId) => {
  const query = windowId === undefined
    ? { active: true, currentWindow: true }
    : { active: true, windowId };
  const [tab] = await chrome.tabs.query(query).catch(() => []);
  return tab ?? null;
};

const setSidePanelEnabledForTab = async (tabId, enabled) => {
  if (typeof chrome.sidePanel?.setOptions !== "function") {
    return;
  }
  if (tabId === undefined) {
    return;
  }
  await chrome.sidePanel.setOptions({ tabId, enabled }).catch(() => undefined);
};

const setSidePanelEnabledForActiveTab = async (windowId, enabled) => {
  const tab = await activeTabForWindow(windowId);
  await setSidePanelEnabledForTab(tab?.id, enabled);
};

const syncSidePanelForTab = async (tab) => {
  if (tab?.id === undefined || typeof tab.url !== "string") {
    return;
  }
  await setSidePanelEnabledForTab(tab.id, !isMainWorkspaceUrl(tab.url));
};

const syncSidePanelForActiveTab = async (windowId) => {
  await syncSidePanelForTab(await activeTabForWindow(windowId));
};

const openResonantSidePanel = async (windowId, { force = false } = {}) => {
  if (typeof chrome.sidePanel?.open !== "function" || windowId === undefined) {
    return false;
  }
  const tab = await activeTabForWindow(windowId);
  if (tab?.id === undefined) {
    return false;
  }
  if (isMainWorkspaceUrl(tab.url) && !force) {
    await setSidePanelEnabledForTab(tab.id, false);
    return false;
  }
  await setSidePanelEnabledForTab(tab.id, true);
  await chrome.sidePanel.open({ windowId }).catch(() => undefined);
  return true;
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
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

chrome.tabs.onActivated?.addListener?.((activeInfo) => {
  void syncSidePanelForActiveTab(activeInfo.windowId);
});

chrome.tabs.onUpdated?.addListener?.((_tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    void syncSidePanelForTab(tab);
  }
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

  if (message.type === "open_side_panel") {
    const windowId = sender.tab?.windowId;
    if (windowId !== undefined) {
      void openResonantSidePanel(windowId, { force: Boolean(message.force) }).then((opened) => sendResponse({ ok: true, opened }));
      return true;
    }
    chrome.windows.getCurrent((window) => {
      void openResonantSidePanel(window?.id, { force: Boolean(message.force) }).then((opened) => sendResponse({ ok: true, opened }));
    });
    return true;
  }

  if (message.type === "suppress_side_panel_on_main_workspace") {
    const windowId = sender.tab?.windowId;
    const suppress = async (tab) => {
      if (tab?.id === undefined || !isMainWorkspaceUrl(tab.url)) {
        sendResponse({ ok: false, suppressed: false });
        return;
      }
      await chrome.sidePanel?.setOptions?.({ tabId: tab.id, enabled: false })?.catch?.(() => undefined);
      sendResponse({ ok: true, suppressed: true });
    };
    if (sender.tab) {
      void suppress(sender.tab);
      return true;
    }
    void activeTabForWindow(windowId).then(suppress);
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
