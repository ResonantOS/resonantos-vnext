export function createBrowserPageActions(deps) {
  const {
    addMessage,
    bridgeRequest,
    chrome,
    isReadableBrowserTab,
    normalizeBrowserUrl,
    permissionForUrl,
    renderSitePermissionPanel,
    setActivity,
    setContextMeter,
    setControlledTabId,
    setLastSnapshot,
    setStatus,
    siteKeyForUrl,
    sleep
  } = deps;

  async function activeTab() {
    const controlledTabId = deps.getControlledTabId();
    if (controlledTabId) {
      const controlled = await chrome.tabs.get(controlledTabId).catch(() => null);
      if (isReadableBrowserTab(controlled)) {
        return controlled;
      }
      setControlledTabId(null);
    }
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const activeReadable = tabs.find((tab) => tab.active && isReadableBrowserTab(tab));
    if (activeReadable) {
      setControlledTabId(activeReadable.id);
      return activeReadable;
    }
    const readableTabs = tabs.filter(isReadableBrowserTab);
    if (readableTabs.length) {
      const tab = readableTabs.at(-1);
      setControlledTabId(tab.id);
      return tab;
    }
    const allTabs = await chrome.tabs.query({});
    const fallback = allTabs.find((tab) => tab.active && isReadableBrowserTab(tab)) ??
      allTabs.filter(isReadableBrowserTab).at(-1) ??
      tabs.find((tab) => tab.active);
    if (isReadableBrowserTab(fallback)) {
      setControlledTabId(fallback.id);
    }
    return fallback;
  }

  async function openBrowserUrl(target) {
    const url = normalizeBrowserUrl(target);
    const targetTab = await activeTab();
    setActivity("tool-running", "Navigating browser", url);
    setStatus("Navigating");
    if (targetTab?.id && isReadableBrowserTab(targetTab)) {
      await chrome.tabs.update(targetTab.id, { url, active: true });
      setControlledTabId(targetTab.id);
    } else {
      const tab = await chrome.tabs.create({ url, active: true });
      setControlledTabId(tab.id);
    }
    setLastSnapshot(null);
    setContextMeter(null);
    await addMessage("system", `Opened ${url}`);
    setStatus("Ready");
    return { ok: true, action: "open", url };
  }

  async function searchBrowser({ query, action }) {
    const url = action === "news"
      ? `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&setlang=en-US`
      : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    setActivity("tool-running", action === "news" ? "Searching news" : "Searching web", query);
    setStatus(action === "news" ? "Searching news" : "Searching web");
    const targetTab = await activeTab();
    if (targetTab?.id && isReadableBrowserTab(targetTab)) {
      await chrome.tabs.update(targetTab.id, { url, active: true });
      setControlledTabId(targetTab.id);
    } else {
      const tab = await chrome.tabs.create({ url, active: true });
      setControlledTabId(tab.id);
    }
    setLastSnapshot(null);
    setContextMeter(null);
    if (action === "news") {
      const news = await bridgeRequest("/web/news", {
        method: "POST",
        body: { query, limit: 5 }
      }).catch((error) => ({ error: error instanceof Error ? error.message : String(error), items: [] }));
      const headlines = news.items?.length
        ? `\n\nTop headlines:\n${news.items.map((item, index) => `${index + 1}. ${item.title}${item.source ? ` — ${item.source}` : ""}`).join("\n")}`
        : `\n\nI opened the news search, but headline extraction failed${news.error ? `: ${news.error}` : "."}`;
      await addMessage("system", `Opened news search for "${query}".${headlines}`);
    } else {
      await addMessage("system", `Opened web search for "${query}".`);
    }
    setActivity("completed", action === "news" ? "News search opened" : "Web search opened", query);
    setStatus("Ready");
    return { ok: true, action, query, url };
  }

  function mergeFrameSnapshots(responses) {
    const snapshots = responses
      .filter((response) => response?.ok && response.snapshot)
      .map((response) => response.snapshot);
    if (!snapshots.length) {
      return null;
    }
    const topSnapshot = snapshots.find((snapshot) => snapshot.frame?.isTop) ?? snapshots[0];
    return {
      ...topSnapshot,
      text: snapshots.map((snapshot) => snapshot.text).filter(Boolean).join("\n\n--- frame ---\n\n").slice(0, 24000),
      links: snapshots.flatMap((snapshot) => snapshot.links ?? []).slice(0, 140),
      controls: snapshots.flatMap((snapshot) => snapshot.controls ?? []).slice(0, 140),
      fields: snapshots.flatMap((snapshot) => snapshot.fields ?? []).slice(0, 140),
      frames: snapshots.map((snapshot) => ({
        title: snapshot.title,
        url: snapshot.url,
        isTop: Boolean(snapshot.frame?.isTop),
        words: String(snapshot.text ?? "").split(/\s+/).filter(Boolean).length,
        controls: snapshot.controls?.length ?? 0,
        fields: snapshot.fields?.length ?? 0
      }))
    };
  }

  async function sendContentActionToFrames(tabId, message) {
    const frames = await chrome.webNavigation?.getAllFrames?.({ tabId }).catch(() => null);
    const frameIds = Array.isArray(frames) && frames.length ? frames.map((frame) => frame.frameId) : [0];
    const responses = [];
    for (const frameId of frameIds) {
      const response = await chrome.tabs.sendMessage(tabId, message, { frameId }).catch((error) => ({
        ok: false,
        frameId,
        error: String(error)
      }));
      responses.push({ ...response, frameId });
    }
    if (message.type === "read_page") {
      const snapshot = mergeFrameSnapshots(responses);
      return snapshot ? { ok: true, snapshot, frameResponses: responses.length } : { ok: false, error: "No readable frame returned page context." };
    }
    const success = responses.find((response) => response?.ok);
    if (success) return success;
    const approval = responses.find((response) => response?.approvalRequired);
    if (approval) return approval;
    return responses.find((response) => response?.error) ?? { ok: false, error: "No frame handled this browser action." };
  }

  async function sendContentAction(payload) {
    const tab = await activeTab();
    if (!tab?.id || !isReadableBrowserTab(tab)) {
      return { ok: false, error: "No normal web page is active for this browser action." };
    }
    const siteMode = await permissionForUrl(tab.url);
    if (siteMode === "blocked") {
      return { ok: false, error: `Assistant is blocked on ${siteKeyForUrl(tab.url)}.` };
    }
    if (siteMode === "read-only" && payload.type !== "read_page" && payload.type !== "detect_forms" && payload.type !== "control_overlay") {
      return { ok: false, error: `Assistant actions are read-only on ${siteKeyForUrl(tab.url)}.` };
    }
    const message = {
      channel: "resonantos.browser_first.content",
      ...payload
    };
    const firstAttempt = await sendContentActionToFrames(tab.id, message);
    const shouldInjectContentScript = !firstAttempt?.ok &&
      /receiving end|connection|No readable frame returned page context/i.test(firstAttempt?.error ?? "");
    if (firstAttempt?.ok || !shouldInjectContentScript) {
      return firstAttempt;
    }
    if (chrome.scripting?.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content.js"]
      }).catch(() => undefined);
    } else {
      await chrome.tabs.reload(tab.id);
      await sleep(1200);
    }
    return sendContentActionToFrames(tab.id, message);
  }

  const setPageControlOverlay = async (active, label = "", phase = "") => sendContentAction({
    type: "control_overlay",
    active,
    label: label || (active ? "Augmentor is operating this page" : ""),
    phase
  });

  async function typeIntoActivePage({ text, field = "", ref = "", submit, userApproved = false }) {
    setActivity("tool-running", "Typing into page", text);
    setStatus("Typing");
    const response = await sendContentAction({ type: "type_text", text, field, ref, submit, userApproved });
    if (response?.ok) {
      await addMessage(
        "system",
        `Typed into the active page${response.submitted ? " and submitted it" : ""}: "${response.typedText}"`
      );
      setStatus("Ready");
      setActivity("completed", "Typed into page", response.fieldName || response.tagName || "active field");
      return response;
    }
    await addMessage("system", `I could not type into the page: ${response?.error ?? "unknown error"}`);
    setStatus("Page action failed");
    setActivity("failed", "Typing failed", response?.error ?? "unknown error");
    return response;
  }

  async function clickActivePageText({ text, ref = "", userApproved = false }) {
    setActivity("tool-running", "Clicking page element", text || ref);
    setStatus("Clicking");
    const response = await sendContentAction({ type: "click_text", text, ref, userApproved });
    if (response?.ok) {
      await addMessage("system", `Clicked "${response.clickedText || text || ref}" on the active page.`);
      setStatus("Ready");
      setActivity("completed", "Clicked page element", response.clickedText || text || ref);
      return response;
    }
    await addMessage("system", `I could not click "${text || ref}": ${response?.error ?? "unknown error"}`);
    setStatus("Page action failed");
    setActivity("failed", "Click failed", response?.error ?? "unknown error");
    return response;
  }

  async function scrollActivePage({ direction = "down", amount = 720 } = {}) {
    setActivity("tool-running", "Scrolling page", direction);
    setStatus("Scrolling");
    const response = await sendContentAction({ type: "scroll_page", direction, amount });
    if (response?.ok) {
      await addMessage("system", `Scrolled ${response.direction}. Position: ${response.scrollY}/${response.maxScrollY}.`);
      setStatus("Ready");
      setActivity("completed", "Scrolled page", response.direction);
      return response;
    }
    await addMessage("system", `I could not scroll the page: ${response?.error ?? "unknown error"}`);
    setStatus("Page action failed");
    setActivity("failed", "Scroll failed", response?.error ?? "unknown error");
    return response;
  }

  async function detectActivePageForms() {
    setActivity("retrieving", "Inspecting page forms", "Looking for editable fields and forms");
    setStatus("Inspecting forms");
    const response = await sendContentAction({ type: "detect_forms" });
    if (!response?.ok) {
      await addMessage("system", `I could not inspect forms: ${response?.error ?? "unknown error"}`);
      setStatus("Page action failed");
      setActivity("failed", "Form inspection failed", response?.error ?? "unknown error");
      return response;
    }
    const formLines = (response.forms ?? []).map((form) => {
      const fields = (form.fields ?? []).map((field) => field.label || field.name || field.id || field.type || field.tagName).filter(Boolean).join(", ");
      return `- form ${form.index}${form.id ? ` #${form.id}` : ""}: ${fields || "no labelled fields"}`;
    });
    const looseLines = (response.looseFields ?? []).map((field) => `- ${field.label || field.name || field.id || field.type || field.tagName}`);
    await addMessage(
      "system",
      [
        `Detected ${(response.forms ?? []).length} form(s) and ${(response.looseFields ?? []).length} loose editable field(s).`,
        formLines.length ? "\nForms:\n" + formLines.join("\n") : "",
        looseLines.length ? "\nLoose fields:\n" + looseLines.slice(0, 12).join("\n") : "",
        "\nPublic submit, wallet, payment, login, and credential actions remain human-approval gated."
      ].filter(Boolean).join("\n")
    );
    setStatus("Ready");
    setActivity("completed", "Inspected page forms", `${(response.forms ?? []).length} forms`);
    return response;
  }

  async function refreshTabContext() {
    setStatus("Reading");
    const tab = await activeTab();
    const label = tab?.title || tab?.url || "No page context";
    deps.setReadButtonTitle(`Attach/read current page: ${label}`);
    await renderSitePermissionPanel(tab);
    setStatus("Ready");
    return tab;
  }

  async function readActivePage({ announce = true } = {}) {
    const tab = await refreshTabContext();
    if (!tab?.id || !isReadableBrowserTab(tab)) {
      if (announce) {
        await addMessage("system", "I cannot read this tab yet. Open a normal web page and try again.");
      }
      return null;
    }

    setActivity("reading", "Reading browser page", tab.title || tab.url);
    setStatus("Reading page");
    const response = await sendContentAction({
      channel: "resonantos.browser_first.content",
      type: "read_page"
    });

    setLastSnapshot(response?.snapshot ?? null);
    setContextMeter(response?.snapshot ?? null);
    setStatus(response?.ok ? "Ready" : "Read failed");
    if (announce) {
      await addMessage(
        "system",
        response?.ok
          ? `Page context attached: ${response.snapshot.title || "Untitled"}\n${response.snapshot.url}`
          : `I could not read the page: ${response?.error ?? "unknown error"}`
      );
    }
    return response;
  }

  async function summarizeSnapshot() {
    const response = deps.getLastSnapshot() ? { ok: true, snapshot: deps.getLastSnapshot() } : await readActivePage({ announce: false });
    const snapshot = response?.snapshot;
    if (!snapshot) {
      await addMessage("system", "No page context is attached yet. Use the plus button first.");
      return;
    }

    const text = snapshot.text || "";
    setActivity("reading", "Summarising page context", snapshot.title || snapshot.url);
    const words = text.split(/\s+/).filter(Boolean);
    const excerpt = words.slice(0, 46).join(" ");
    await addMessage(
      "system",
      `Page context captured.\n\nTitle: ${snapshot.title || "Untitled"}\nURL: ${snapshot.url}\nVisible text: about ${words.length} words.\nLinks found: ${snapshot.links?.length ?? 0}.\n\nOpening signal: ${excerpt}${words.length > 46 ? "..." : ""}`
    );
    return { ok: true, snapshot };
  }

  return {
    activeTab,
    clickActivePageText,
    detectActivePageForms,
    mergeFrameSnapshots,
    openBrowserUrl,
    readActivePage,
    refreshTabContext,
    scrollActivePage,
    searchBrowser,
    sendContentAction,
    sendContentActionToFrames,
    setPageControlOverlay,
    summarizeSnapshot,
    typeIntoActivePage
  };
}
