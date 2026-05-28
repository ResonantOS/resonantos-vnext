// archive-tab.js — Self-contained Living Archive sidecar tab

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const _bridgeConfig = globalThis.__RESONANTOS_BRIDGE_CONFIG__ ?? {};
const BRIDGE_URL = _bridgeConfig.bridgeUrl || "http://127.0.0.1:47773";
const BRIDGE_TOKEN = _bridgeConfig.bridgeToken || "";

// ---------------------------------------------------------------------------
// Helper: el() — minimal DOM element creator
// ---------------------------------------------------------------------------
const el = (tag, { className, text } = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

// ---------------------------------------------------------------------------
// Helper: bridgeRequest() — fetch from the local bridge server
// ---------------------------------------------------------------------------
const bridgeRequest = async (route, options = {}) => {
  const url = `${BRIDGE_URL}${route}`;
  const fetchOptions = {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(BRIDGE_TOKEN ? { "X-ResonantOS-Bridge-Token": BRIDGE_TOKEN } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  };

  const attempt = async () => {
    const response = await fetch(url, fetchOptions);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload?.error ?? `Bridge request failed with HTTP ${response.status}.`);
    }
    return payload;
  };

  try {
    return await attempt();
  } catch (firstError) {
    const isNetworkError =
      firstError instanceof TypeError ||
      String(firstError).includes("Failed to fetch") ||
      String(firstError).includes("NetworkError");
    if (!isNetworkError) throw firstError;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    return await attempt();
  }
};

// ---------------------------------------------------------------------------
// Helper: getWalletAddr() — reads stored wallet address from chrome.storage
// ---------------------------------------------------------------------------
const getWalletAddr = async () => {
  try {
    const data = await chrome.storage.local.get("walletAddress");
    return data.walletAddress ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const archiveSearchInput = document.getElementById("archive-search-input");
const archiveSearchBtn = document.getElementById("archive-search-btn");
const archiveResultsEl = document.getElementById("archive-results");
const archiveWikiPagesEl = document.getElementById("archive-wiki-pages");
const archiveIntakesEl = document.getElementById("archive-intakes");
const archiveQuickSaveBtn = document.getElementById("archive-quick-save");

// ---------------------------------------------------------------------------
// Escape helper
// ---------------------------------------------------------------------------
const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
const runSearch = async () => {
  const query = archiveSearchInput?.value?.trim() ?? "";
  if (!query) return;
  if (archiveResultsEl) archiveResultsEl.innerHTML = '<p class="sidecar-placeholder">Searching…</p>';
  try {
    const result = await bridgeRequest("/memory/search", { method: "POST", body: { query } });
    const hits = result.results ?? [];
    if (!hits.length) {
      archiveResultsEl.innerHTML = '<p class="sidecar-placeholder">No results.</p>';
      return;
    }
    archiveResultsEl.innerHTML = hits.map(h =>
      `<div class="archive-result">
        <strong>${escapeHtml(h.title || h.path || "Untitled")}</strong>
        <p>${escapeHtml((h.snippet || "").slice(0, 200))}</p>
      </div>`
    ).join("");
  } catch (err) {
    if (archiveResultsEl) archiveResultsEl.innerHTML = `<p class="sidecar-placeholder">${escapeHtml(err.message || String(err))}</p>`;
  }
};

// ---------------------------------------------------------------------------
// Quick Save
// ---------------------------------------------------------------------------
const quickSave = async () => {
  if (!archiveQuickSaveBtn) return;
  archiveQuickSaveBtn.disabled = true;
  archiveQuickSaveBtn.textContent = "Saving…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab");
    await bridgeRequest("/archive/intake", { method: "POST", body: { url: tab.url, title: tab.title, source: "quick-save" } });
    archiveQuickSaveBtn.textContent = "Saved ✓";
    setTimeout(() => { archiveQuickSaveBtn.textContent = "Quick Save Current Page"; archiveQuickSaveBtn.disabled = false; }, 2000);
  } catch (err) {
    archiveQuickSaveBtn.textContent = "Error";
    setTimeout(() => { archiveQuickSaveBtn.textContent = "Quick Save Current Page"; archiveQuickSaveBtn.disabled = false; }, 2000);
  }
};

// ---------------------------------------------------------------------------
// Load archive meta stats
// ---------------------------------------------------------------------------
const loadArchiveMeta = async () => {
  try {
    const result = await bridgeRequest("/archive/stats");
    if (archiveWikiPagesEl) archiveWikiPagesEl.textContent = String(result.wikiPages ?? "—");
    if (archiveIntakesEl) archiveIntakesEl.textContent = String(result.intakes ?? "—");
  } catch {
    // stats are non-critical, fail silently
  }
};

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
if (archiveSearchBtn) archiveSearchBtn.addEventListener("click", () => void runSearch());
if (archiveSearchInput) {
  archiveSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void runSearch();
  });
}
if (archiveQuickSaveBtn) archiveQuickSaveBtn.addEventListener("click", () => void quickSave());

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
loadArchiveMeta();

// ---------------------------------------------------------------------------
// Close tab button — uses chrome.tabs API (window.close blocked on non-script-opened tabs)
// ---------------------------------------------------------------------------
const closeTabBtn = document.getElementById("close-tab-btn");
if (closeTabBtn) {
  closeTabBtn.addEventListener("click", async () => {
    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) await chrome.tabs.remove(tab.id);
    } catch {
      window.close(); // fallback
    }
  });
}
