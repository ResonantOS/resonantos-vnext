// shield-tab.js — Self-contained Shield sidecar tab

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
const shieldEventsEl = document.getElementById("shield-events");
const shieldRulesListEl = document.getElementById("shield-rules-list");
const shieldBlocksEl = document.getElementById("shield-blocks");
const shieldApprovalsEl = document.getElementById("shield-approvals");
const shieldRulesEl = document.getElementById("shield-rules");

// ---------------------------------------------------------------------------
// Escape helper
// ---------------------------------------------------------------------------
const escapeHtml = (text) => {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
};

// ---------------------------------------------------------------------------
// Load shield data
// ---------------------------------------------------------------------------
const loadShieldData = async () => {
  try {
    const result = await bridgeRequest("/shield/status");

    // Stats
    if (shieldBlocksEl) shieldBlocksEl.textContent = String(result.blocks ?? 0);
    if (shieldApprovalsEl) shieldApprovalsEl.textContent = String(result.approvals ?? 0);
    if (shieldRulesEl) shieldRulesEl.textContent = String(result.ruleCount ?? 0);

    // Events
    if (shieldEventsEl) {
      const events = result.recentEvents ?? [];
      if (!events.length) {
        shieldEventsEl.innerHTML = '<p class="sidecar-placeholder">No recent events.</p>';
      } else {
        shieldEventsEl.innerHTML = events.map(e =>
          `<div class="shield-event-row">
            <span class="shield-event-type shield-event-type-${escapeHtml(e.type ?? "info")}">${escapeHtml(e.type ?? "info")}</span>
            <span class="shield-event-msg">${escapeHtml(e.message ?? "")}</span>
            <span class="shield-event-time">${escapeHtml(e.timestamp ?? "")}</span>
          </div>`
        ).join("");
      }
    }

    // Rules
    if (shieldRulesListEl) {
      const rules = result.rules ?? [];
      if (!rules.length) {
        shieldRulesListEl.innerHTML = '<p class="sidecar-placeholder">No active rules loaded.</p>';
      } else {
        shieldRulesListEl.innerHTML = rules.map(r =>
          `<div class="shield-rule-row">
            <span class="shield-rule-name">${escapeHtml(r.name ?? r.id ?? "Unnamed")}</span>
            <span class="shield-rule-mode shield-rule-mode-${escapeHtml(r.mode ?? "advisory")}">${escapeHtml(r.mode ?? "advisory")}</span>
          </div>`
        ).join("");
      }
    }
  } catch (err) {
    if (shieldEventsEl) shieldEventsEl.innerHTML = `<p class="sidecar-placeholder">Shield bridge unavailable: ${escapeHtml(err.message || String(err))}</p>`;
    if (shieldRulesListEl) shieldRulesListEl.innerHTML = "";
  }
};

// ---------------------------------------------------------------------------
// Security event log from chrome.storage.local (written by content.js logSecurityEvent)
// ---------------------------------------------------------------------------
const securityLogEl = document.getElementById("shield-security-log");

const renderSecurityLog = (entries) => {
  if (!securityLogEl) return;
  if (!entries || !entries.length) {
    securityLogEl.innerHTML = '<p class="sidecar-placeholder">No security events recorded.</p>';
    return;
  }
  securityLogEl.innerHTML = entries
    .slice()
    .reverse()
    .map((e) =>
      `<div class="shield-event-row">
        <span class="shield-event-type shield-event-type-${escapeHtml(e.type ?? "info")}">${escapeHtml(e.type ?? "info")}</span>
        <span class="shield-event-msg">${escapeHtml(e.detail ?? e.text?.slice(0, 120) ?? "")}</span>
        <span class="shield-event-url">${escapeHtml((e.url ?? "").replace(/^https?:\/\//, "").slice(0, 60))}</span>
        <span class="shield-event-time">${escapeHtml(e.ts ?? "")}</span>
      </div>`
    )
    .join("");
};

const loadSecurityLog = async () => {
  try {
    const result = await chrome.storage.local.get("securityLog");
    renderSecurityLog(result.securityLog ?? []);
  } catch (err) {
    if (securityLogEl) securityLogEl.innerHTML = `<p class="sidecar-placeholder">Could not read security log: ${escapeHtml(String(err))}</p>`;
  }
};

// Live updates: re-render whenever securityLog changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.securityLog) {
    renderSecurityLog(changes.securityLog.newValue ?? []);
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
loadShieldData();
loadSecurityLog();

// ---------------------------------------------------------------------------
// Close tab button — Electron: IPC to remove BrowserView / Browser: chrome.tabs
// ---------------------------------------------------------------------------
const closeTabBtn = document.getElementById("close-tab-btn");
if (closeTabBtn) {
  closeTabBtn.addEventListener("click", async () => {
    // Electron PWA: close sidecar and return to main workspace
    if (window.resonantosElectronPWA?.closeSidecarTab) {
      window.resonantosElectronPWA.closeSidecarTab();
      return;
    }
    // Browser fallback
    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) await chrome.tabs.remove(tab.id);
    } catch {
      window.close();
    }
  });
}
