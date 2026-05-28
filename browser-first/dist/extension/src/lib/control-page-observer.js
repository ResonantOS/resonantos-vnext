export function createControlPageObserver({
  browserJobStore,
  chrome,
  getControlledTabId,
  getCurrentControlRun,
  getLastSnapshot,
  isReadableBrowserTab,
  readActivePage,
  setActivity
}) {
  const listReadableTabSnapshots = async () => {
    const tabs = await chrome.tabs.query({}).catch(() => []);
    return tabs
      .filter(isReadableBrowserTab)
      .slice(0, 30)
      .map((tab) => ({
        id: tab.id,
        title: tab.title || "",
        url: tab.url || "",
        active: Boolean(tab.active),
        controlled: tab.id === getControlledTabId()
      }));
  };

  const observeControlPage = async () => {
    const job = browserJobStore.currentJob();
    if (job?.status === "cancelled") {
      throw new Error("Browser job was cancelled.");
    }
    if (job?.status === "paused") {
      throw new Error("Browser job is paused.");
    }
    setActivity("reading", "Observing active page", getCurrentControlRun()?.goal ?? "browser task");
    const snapshotResponse = await readActivePage({ announce: false }).catch(() => null);
    const snapshot = snapshotResponse?.snapshot ?? getLastSnapshot();
    if (!snapshot) return null;
    return {
      ...snapshot,
      tabs: await listReadableTabSnapshots()
    };
  };

  return {
    listReadableTabSnapshots,
    observeControlPage
  };
}
