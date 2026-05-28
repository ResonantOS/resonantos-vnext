export function createControlStepExecutor({
  addMessage,
  chrome,
  clickActivePageText,
  detectActivePageForms,
  getControlledTabId,
  isReadableBrowserTab,
  openBrowserUrl,
  scrollActivePage,
  searchBrowser,
  setActivity,
  setContextMeter,
  setControlledTabId,
  setLastSnapshot,
  sleep,
  summarizeSnapshot,
  typeIntoActivePage
}) {
  const listReadableTabs = async () => {
    const tabs = await chrome.tabs.query({}).catch(() => []);
    return tabs.filter(isReadableBrowserTab).map((tab) => ({
      id: tab.id,
      title: tab.title || "",
      url: tab.url || "",
      active: Boolean(tab.active),
      controlled: tab.id === getControlledTabId()
    }));
  };

  const executeControlStep = async (step) => {
    if (step.type === "inspect" || step.type === "read") {
      return summarizeSnapshot();
    }
    if (step.type === "tabs") {
      const readableTabs = await listReadableTabs();
      await addMessage(
        "system",
        readableTabs.length
          ? `Open browser tabs:\n${readableTabs.map((tab) => `- ${tab.id}${tab.controlled ? " [controlled]" : tab.active ? " [active]" : ""}: ${tab.title || tab.url}`).join("\n")}`
          : "No readable browser tabs are open."
      );
      return { ok: true, tabs: readableTabs };
    }
    if (step.type === "switch_tab") {
      const tab = await chrome.tabs.get(step.tabId).catch(() => null);
      if (!isReadableBrowserTab(tab)) {
        return { ok: false, error: `Tab ${step.tabId} is not a readable web page.` };
      }
      setControlledTabId(tab.id);
      await chrome.tabs.update(tab.id, { active: true });
      setLastSnapshot(null);
      setContextMeter(null);
      await addMessage("system", `Switched controlled tab to ${tab.title || tab.url}.`);
      return { ok: true, tabId: tab.id, title: tab.title || "", url: tab.url || "" };
    }
    if (step.type === "open") {
      const result = await openBrowserUrl(step.target);
      await sleep(1200);
      return result;
    }
    if (step.type === "search") {
      const result = await searchBrowser({ query: step.query, action: step.action });
      await sleep(1200);
      return result;
    }
    if (step.type === "forms") {
      return detectActivePageForms();
    }
    if (step.type === "click") {
      const result = await clickActivePageText({ text: step.text, ref: step.ref, userApproved: step.userApproved });
      await sleep(500);
      return result;
    }
    if (step.type === "type") {
      const result = await typeIntoActivePage({ text: step.text, field: step.field, ref: step.ref, submit: step.submit, userApproved: step.userApproved });
      await sleep(500);
      return result;
    }
    if (step.type === "scroll") {
      return scrollActivePage({ direction: step.direction });
    }
    if (step.type === "wait") {
      setActivity("tool-running", "Waiting for page state", `${step.ms ?? 1000}ms`);
      await sleep(step.ms ?? 1000);
      return { ok: true, waitedMs: step.ms ?? 1000 };
    }
    return { ok: false, error: `Unknown control step: ${step.type}` };
  };

  return {
    executeControlStep,
    listReadableTabs
  };
}
