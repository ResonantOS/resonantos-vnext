// awareness-tab.js — Self-contained R-Awareness sidecar tab

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
const awRichnessEl = document.getElementById("aw-richness");
const awSectionsEl = document.getElementById("aw-sections");
const awDwellEl = document.getElementById("aw-dwell");
const awPluginEl = document.getElementById("aw-plugin");
const awRefreshBtn = document.getElementById("aw-refresh-btn");
const awSectionsList = document.getElementById("aw-sections-list");

// ---------------------------------------------------------------------------
// Escape helper
// ---------------------------------------------------------------------------
const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
};

// ---------------------------------------------------------------------------
// Refresh context — reads the active tab via content script message
// ---------------------------------------------------------------------------
const refreshContext = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const response = await chrome.tabs.sendMessage(tab.id, {
      channel: "resonantos.browser_first.content",
      type: "read_page"
    });
    const ctx = response?.snapshot?.resonantContext;
    if (ctx) {
      if (awRichnessEl) awRichnessEl.textContent = `${ctx.richness ?? 0}%`;
      if (awSectionsEl) awSectionsEl.textContent = String((ctx.visibleSections || []).length);
      if (awDwellEl) awDwellEl.textContent = ctx.activeDwellSection?.label ?? "none";
      if (awPluginEl) awPluginEl.textContent = ctx.domainPlugin ?? "generic";

      // Render visible sections list
      if (awSectionsList) {
        const sections = ctx.visibleSections ?? [];
        if (!sections.length) {
          awSectionsList.innerHTML = '<p class="sidecar-placeholder">No sections detected.</p>';
        } else {
          awSectionsList.innerHTML = sections.map(s =>
            `<div class="aw-section-row">
              <span class="aw-section-label">${escapeHtml(s.label ?? s.id ?? "Section")}</span>
              <span class="aw-section-richness">${escapeHtml(String(s.richness ?? ""))}</span>
            </div>`
          ).join("");
        }
      }
    } else {
      if (awSectionsList) awSectionsList.innerHTML = '<p class="sidecar-placeholder">No R-Awareness context found on this page.</p>';
    }
  } catch (err) {
    if (awSectionsList) awSectionsList.innerHTML = `<p class="sidecar-placeholder">Could not read page context: ${escapeHtml(err.message || String(err))}</p>`;
  }
};

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
if (awRefreshBtn) awRefreshBtn.addEventListener("click", () => void refreshContext());

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
