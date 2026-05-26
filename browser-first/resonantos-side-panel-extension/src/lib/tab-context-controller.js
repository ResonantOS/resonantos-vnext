const INLINE_DRAFT_KEY = "augmentorInlineDraft";

export function parseTabMention(message) {
  const match = /@([a-z0-9][a-z0-9 .:_-]{0,80})/i.exec(String(message ?? ""));
  if (!match) return null;
  return match[1].trim().replace(/[.,;!?]+$/g, "");
}

export function createTabContextController({
  addMessage,
  chrome,
  getControlledTabId,
  isReadableBrowserTab,
  refreshTabContext,
  renderSitePermissionPanel,
  setContextMeter,
  setControlledTabId,
  setLastSnapshot,
  sitePermissionStorageKey
}) {
  const resolveTabMention = async (message) => {
    const raw = parseTabMention(message);
    if (!raw) return null;
    const tabs = (await chrome.tabs.query({}).catch(() => [])).filter(isReadableBrowserTab);
    if (/^tab\s+\d+$/i.test(raw)) {
      const index = Number(/\d+/.exec(raw)?.[0] ?? "0") - 1;
      return tabs[index] ?? null;
    }
    const needle = raw.toLowerCase();
    return tabs.find((tab) =>
      String(tab.title ?? "").toLowerCase().includes(needle) ||
      String(tab.url ?? "").toLowerCase().includes(needle)
    ) ?? null;
  };

  const bindMentionedTab = async (message) => {
    const tab = await resolveTabMention(message);
    if (!tab?.id) return null;
    setControlledTabId(tab.id);
    await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined);
    setLastSnapshot(null);
    setContextMeter(null);
    await renderSitePermissionPanel(tab);
    await addMessage("system", `Using @tab context: ${tab.title || tab.url}`);
    return tab;
  };

  const consumeInlineDraft = async (draft) => {
    if (!draft?.selection) return;
    await addMessage(
      "system",
      [
        "Inline Assistant context received.",
        draft.title ? `Page: ${draft.title}` : "",
        draft.url ? `URL: ${draft.url}` : "",
        "",
        String(draft.selection).slice(0, 4000)
      ].filter(Boolean).join("\n")
    );
    await chrome.storage?.local?.remove?.(INLINE_DRAFT_KEY).catch(() => undefined);
  };

  const handleStorageChanged = (changes, area) => {
    if (area === "local" && changes[INLINE_DRAFT_KEY]?.newValue) {
      void consumeInlineDraft(changes[INLINE_DRAFT_KEY].newValue);
    }
    if (area === "local" && changes[sitePermissionStorageKey]) {
      void renderSitePermissionPanel();
    }
  };

  const handleTabUpdated = (tabId, changeInfo) => {
    if (changeInfo.status === "complete" && (!getControlledTabId() || getControlledTabId() === tabId)) {
      void refreshTabContext();
    }
  };

  const bindBrowserListeners = () => {
    chrome.storage?.onChanged?.addListener(handleStorageChanged);
    chrome.tabs?.onActivated?.addListener(() => void refreshTabContext());
    chrome.tabs?.onUpdated?.addListener(handleTabUpdated);
  };

  const hydrateInitialContext = async () => {
    await refreshTabContext();
    const draft = await chrome.storage?.local?.get?.(INLINE_DRAFT_KEY).catch(() => ({}));
    await consumeInlineDraft(draft?.[INLINE_DRAFT_KEY]);
  };

  return {
    bindBrowserListeners,
    bindMentionedTab,
    consumeInlineDraft,
    handleStorageChanged,
    handleTabUpdated,
    hydrateInitialContext,
    resolveTabMention
  };
}
