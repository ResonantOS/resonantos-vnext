// protocol-store.js — Standalone Protocol Store page logic
// Self-contained: includes el(), bridgeRequest(), getWalletAddr() helpers.

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
    // Retry once after 2 s
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
const PROTOCOL_GRID = document.getElementById("protocol-grid");
const STORE_SEARCH_INPUT = document.getElementById("store-search");
const STORE_CATEGORY_FILTERS = document.getElementById("store-category-filters");
const STORE_SUBMIT_BTN = document.getElementById("store-submit-btn");
const STORE_SUBMIT_FORM = document.getElementById("store-submit-form");
const STORE_SUBMIT_CONFIRM = document.getElementById("store-submit-confirm");
const STORE_SUBMIT_CANCEL = document.getElementById("store-submit-cancel");
const TAB_ALL = document.getElementById("tab-all");
const TAB_OWNED = document.getElementById("tab-owned");
const STORE_CLOSE_BTN = document.getElementById("store-close-btn");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let _storeProtocols = [];
let _storeCategory = "";
let _storeTab = "all"; // "all" | "owned"

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
const categoryStars = (rating) => {
  if (!rating) return "★☆☆☆☆";
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full));
};

const renderProtocolCard = async (proto) => {
  const card = el("div", { className: "protocol-card" });

  // Header row: name + category badge
  const header = el("div", { className: "protocol-card-header" });
  const nameEl = el("p", { className: "protocol-card-name", text: proto.name ?? "Unnamed" });
  const catEl = el("span", { className: "protocol-category" });
  catEl.dataset.cat = proto.category ?? "Tool";
  catEl.textContent = proto.category ?? "Tool";
  header.append(nameEl, catEl);

  // Description
  const desc = el("p", { className: "protocol-card-desc", text: proto.description ?? "" });

  // Footer: meta + install button
  const footer = el("div", { className: "protocol-card-footer" });
  const meta = el("div", { className: "protocol-meta" });

  const priceEl = el("span", { className: "protocol-price" + (proto.price === 0 ? " free" : "") });
  priceEl.textContent = proto.price === 0 ? "Free" : `${proto.price} ${proto.priceToken ?? "RES"}`;

  const ratingEl = el("span", { className: "protocol-rating" });
  ratingEl.textContent = categoryStars(proto.rating) + (proto.rating ? ` ${Number(proto.rating).toFixed(1)}` : "");

  const installsEl = el("span", { className: "protocol-installs" });
  installsEl.textContent = `${proto.installs ?? 0} installs`;

  const authorEl = el("span", { className: "protocol-author" });
  authorEl.textContent = `by ${proto.authorName ?? proto.author ?? "Unknown"}`;

  meta.append(priceEl, ratingEl, installsEl, authorEl);

  const installBtn = el("button", { className: "protocol-install-btn" });
  installBtn.type = "button";
  installBtn.textContent = proto.price === 0 ? "Install" : `Buy ${proto.price} $RES`;
  installBtn.addEventListener("click", async () => {
    installBtn.disabled = true;
    installBtn.textContent = "Installing…";
    const walletAddr = (await getWalletAddr()) ?? "anonymous";
    try {
      if (proto.price > 0) {
        installBtn.textContent = "Purchase (bridge)";
        await bridgeRequest("/store/install", {
          method: "POST",
          body: { protocolId: proto.id, walletAddress: walletAddr },
        });
        installBtn.textContent = "Purchased!";
      } else {
        await bridgeRequest("/store/install", {
          method: "POST",
          body: { protocolId: proto.id, walletAddress: walletAddr },
        });
        installBtn.textContent = "Installed ✓";
      }
      setTimeout(() => void refreshStore(), 1200);
    } catch (err) {
      installBtn.disabled = false;
      installBtn.textContent = proto.price === 0 ? "Install" : `Buy ${proto.price} $RES`;
      console.warn("[store] install error:", err);
    }
  });

  footer.append(meta, installBtn);
  card.append(header, desc, footer);
  return card;
};

const renderProtocolGrid = async (protocols) => {
  if (!PROTOCOL_GRID) return;
  PROTOCOL_GRID.replaceChildren();
  if (!protocols.length) {
    PROTOCOL_GRID.append(el("span", { className: "store-placeholder", text: "No protocols found." }));
    return;
  }
  for (const proto of protocols) {
    PROTOCOL_GRID.append(await renderProtocolCard(proto));
  }
};

const refreshStore = async () => {
  if (!PROTOCOL_GRID) return;
  PROTOCOL_GRID.replaceChildren(el("span", { className: "store-placeholder", text: "Loading…" }));
  try {
    const query = STORE_SEARCH_INPUT?.value.trim() ?? "";
    if (_storeTab === "owned") {
      const walletAddr = (await getWalletAddr()) ?? "anonymous";
      const result = await bridgeRequest(`/store/owned?address=${encodeURIComponent(walletAddr)}`);
      _storeProtocols = result.protocols ?? [];
    } else {
      const params = new URLSearchParams();
      if (_storeCategory) params.set("category", _storeCategory);
      if (query) params.set("q", query);
      const qs = params.toString();
      const result = await bridgeRequest(`/store/protocols${qs ? "?" + qs : ""}`);
      _storeProtocols = result.protocols ?? [];
    }
    await renderProtocolGrid(_storeProtocols);
  } catch (err) {
    if (!PROTOCOL_GRID) return;
    PROTOCOL_GRID.replaceChildren(
      el("span", { className: "panel-section-error", text: `Store unavailable: ${String(err.message ?? err)}` })
    );
  }
};

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

// Close tab button
if (STORE_CLOSE_BTN) {
  STORE_CLOSE_BTN.addEventListener("click", () => {
    window.close();
  });
}

// Category filter buttons
if (STORE_CATEGORY_FILTERS) {
  STORE_CATEGORY_FILTERS.addEventListener("click", (e) => {
    const btn = e.target.closest(".store-cat-btn");
    if (!btn) return;
    _storeCategory = btn.dataset.cat ?? "";
    STORE_CATEGORY_FILTERS.querySelectorAll(".store-cat-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    void refreshStore();
  });
}

// Search input — debounced
if (STORE_SEARCH_INPUT) {
  let _storeSearchTimer = null;
  STORE_SEARCH_INPUT.addEventListener("input", () => {
    clearTimeout(_storeSearchTimer);
    _storeSearchTimer = setTimeout(() => void refreshStore(), 400);
  });
}

// Tab: All
if (TAB_ALL) {
  TAB_ALL.addEventListener("click", () => {
    _storeTab = "all";
    TAB_ALL.classList.add("active");
    TAB_OWNED?.classList.remove("active");
    void refreshStore();
  });
}

// Tab: My Protocols
if (TAB_OWNED) {
  TAB_OWNED.addEventListener("click", () => {
    _storeTab = "owned";
    TAB_OWNED.classList.add("active");
    TAB_ALL?.classList.remove("active");
    void refreshStore();
  });
}

// Submit form toggle
if (STORE_SUBMIT_BTN && STORE_SUBMIT_FORM) {
  STORE_SUBMIT_BTN.addEventListener("click", () => {
    STORE_SUBMIT_FORM.hidden = false;
    STORE_SUBMIT_BTN.hidden = true;
  });
}

if (STORE_SUBMIT_CANCEL && STORE_SUBMIT_FORM && STORE_SUBMIT_BTN) {
  STORE_SUBMIT_CANCEL.addEventListener("click", () => {
    STORE_SUBMIT_FORM.hidden = true;
    STORE_SUBMIT_BTN.hidden = false;
  });
}

if (STORE_SUBMIT_CONFIRM) {
  STORE_SUBMIT_CONFIRM.addEventListener("click", async () => {
    const name = document.getElementById("submit-name")?.value.trim();
    const desc = document.getElementById("submit-desc")?.value.trim();
    const category = document.getElementById("submit-category")?.value;
    const price = Number(document.getElementById("submit-price")?.value ?? 0);
    const walletAddr = (await getWalletAddr()) ?? "anonymous";
    if (!name || !desc) {
      STORE_SUBMIT_CONFIRM.textContent = "Name + description required";
      setTimeout(() => { STORE_SUBMIT_CONFIRM.textContent = "Submit Protocol"; }, 2000);
      return;
    }
    STORE_SUBMIT_CONFIRM.disabled = true;
    STORE_SUBMIT_CONFIRM.textContent = "Submitting…";
    try {
      await bridgeRequest("/store/protocols", {
        method: "POST",
        body: {
          name,
          description: desc,
          category,
          price,
          priceToken: "RES",
          author: walletAddr,
          authorName: walletAddr.slice(0, 8) + "…",
        },
      });
      STORE_SUBMIT_CONFIRM.textContent = "Submitted ✓";
      if (STORE_SUBMIT_FORM) STORE_SUBMIT_FORM.hidden = true;
      if (STORE_SUBMIT_BTN) STORE_SUBMIT_BTN.hidden = false;
      void refreshStore();
    } catch (err) {
      STORE_SUBMIT_CONFIRM.disabled = false;
      STORE_SUBMIT_CONFIRM.textContent = "Failed — retry";
      console.warn("[store] submit error:", err);
    } finally {
      setTimeout(() => {
        if (STORE_SUBMIT_CONFIRM) {
          STORE_SUBMIT_CONFIRM.disabled = false;
          STORE_SUBMIT_CONFIRM.textContent = "Submit Protocol";
        }
      }, 3000);
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap — load protocols on page open
// ---------------------------------------------------------------------------
void refreshStore();
