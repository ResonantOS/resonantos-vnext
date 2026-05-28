// wallet-adapter.js — DAO Wallet Adapter for ResonantOS Side Panel
// Vanilla JS, no build step, no npm packages.
// Wallet interactions relay through the content script (page context holds window.phantom).
// wallet_connect and wallet_sign are gated through background.js approval system.

// ---- State ----

let walletState = {
  connected: false,
  address: null,
  balance: null,
  network: null,
  provider: null,
};

// ---- Approval Gate ----

const requestApproval = (action) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { channel: "resonantos.browser_first", type: "action_request", action },
      (response) => resolve(response ?? { ok: false, approvalRequired: true, deniedToAutomation: true })
    );
  });

// ---- Content Script Relay ----

const sendWalletAction = async (type, payload = {}) => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs.find((t) => typeof t?.url === "string" && /^https?:\/\//i.test(t.url));
  if (!tab?.id) {
    return { ok: false, error: "No active web page available for wallet operations." };
  }
  return chrome.tabs
    .sendMessage(tab.id, { channel: "resonantos.browser_first.content", type, ...payload })
    .catch((error) => ({ ok: false, error: String(error) }));
};

// ---- Public API ----

export const detectWallet = async () => {
  const response = await sendWalletAction("wallet_detect");
  if (response?.ok) {
    walletState.provider = response.provider || null;
    walletState.network = response.network || null;
    walletState.connected = Boolean(response.connected);
    walletState.address = response.address || null;
  }
  return response;
};

export const connectWallet = async () => {
  const approval = await requestApproval("wallet_connect");
  if (!approval.ok || approval.deniedToAutomation) {
    return {
      ok: false,
      approvalRequired: true,
      error:
        "Wallet connect is human-approval gated. Please open Phantom directly and connect, then click ↻ Refresh.",
    };
  }
  const response = await sendWalletAction("wallet_connect");
  if (response?.ok) {
    walletState.connected = true;
    walletState.address = response.address;
    walletState.provider = response.provider;
    walletState.network = response.network;
    await refreshBalance();
  }
  return response;
};

export const disconnectWallet = async () => {
  const response = await sendWalletAction("wallet_disconnect");
  walletState = { connected: false, address: null, balance: null, network: null, provider: null };
  return response;
};

export const getBalance = async () => {
  if (!walletState.connected || !walletState.address) {
    return { ok: false, error: "Wallet not connected." };
  }
  const response = await sendWalletAction("wallet_balance", { address: walletState.address });
  if (response?.ok) {
    walletState.balance = response.balance;
    walletState.network = response.network;
  }
  return response;
};

export const signTransaction = async (transactionBase64) => {
  const approval = await requestApproval("wallet_sign");
  if (!approval.ok || approval.deniedToAutomation) {
    return {
      ok: false,
      approvalRequired: true,
      error: "Transaction signing requires explicit human approval.",
    };
  }
  return sendWalletAction("wallet_sign_transaction", { transactionBase64 });
};

export const refreshWalletState = async () => {
  const response = await sendWalletAction("wallet_detect");
  if (!response?.ok) {
    renderWalletSection();
    return;
  }
  walletState.provider = response.provider || null;
  walletState.network = response.network || null;
  walletState.connected = Boolean(response.connected);
  walletState.address = response.address || null;
  if (walletState.connected) {
    await refreshBalance();
  } else {
    walletState.balance = null;
  }
  renderWalletSection();
};

export const getWalletState = () => ({ ...walletState });

// ---- Internal ----

const refreshBalance = async () => {
  const response = await getBalance();
  if (response?.ok) {
    renderWalletSection();
  }
  return response;
};

const truncateAddress = (address) => {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
};

// ---- UI ----

const WALLET_SECTION_ID = "wallet-section";
const WALLET_BODY_ID = "wallet-body";

export const injectWalletSection = (parentElement) => {
  if (document.getElementById(WALLET_SECTION_ID)) return;

  const section = document.createElement("details");
  section.id = WALLET_SECTION_ID;
  section.className = "wallet-section";

  const summary = document.createElement("summary");
  summary.className = "wallet-summary";
  summary.textContent = "◈ Wallet";

  const body = document.createElement("div");
  body.id = WALLET_BODY_ID;
  body.className = "wallet-body";

  section.append(summary, body);
  // Insert before the first child of parentElement (above chat)
  parentElement.prepend(section);

  // Detect on open
  section.addEventListener("toggle", () => {
    if (section.open) {
      void refreshWalletState();
    }
  });

  renderWalletSection();
};

export const renderWalletSection = () => {
  const body = document.getElementById(WALLET_BODY_ID);
  if (!body) return;

  const { connected, address, balance, network, provider } = walletState;
  const networkLabel =
    network === "mainnet-beta" ? "Mainnet" : network === "devnet" ? "Devnet" : network || "Unknown";
  const networkClass = network === "mainnet-beta" ? "wallet-network-mainnet" : "wallet-network-devnet";

  body.replaceChildren();

  if (connected && address) {
    // Address row
    const addrRow = document.createElement("div");
    addrRow.className = "wallet-row";
    const addrSpan = document.createElement("span");
    addrSpan.className = "wallet-address";
    addrSpan.textContent = truncateAddress(address);
    addrSpan.title = address;
    addrRow.append(addrSpan);

    // Network badge
    const netBadge = document.createElement("span");
    netBadge.className = `wallet-network-badge ${networkClass}`;
    netBadge.textContent = networkLabel;
    addrRow.append(netBadge);
    body.append(addrRow);

    // Balance row
    const balRow = document.createElement("div");
    balRow.className = "wallet-row";
    const balSpan = document.createElement("span");
    balSpan.className = "wallet-balance";
    balSpan.textContent = balance !== null ? `${balance} SOL` : "— SOL";
    balRow.append(balSpan);
    body.append(balRow);

    // Action buttons
    const btnRow = document.createElement("div");
    btnRow.className = "wallet-row wallet-btn-row";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "wallet-btn";
    refreshBtn.textContent = "↻ Refresh";
    refreshBtn.addEventListener("click", () => void refreshWalletState());

    const disconnectBtn = document.createElement("button");
    disconnectBtn.type = "button";
    disconnectBtn.className = "wallet-btn wallet-btn-danger";
    disconnectBtn.textContent = "Disconnect";
    disconnectBtn.addEventListener("click", async () => {
      disconnectBtn.disabled = true;
      await disconnectWallet();
      renderWalletSection();
    });

    btnRow.append(refreshBtn, disconnectBtn);
    body.append(btnRow);
  } else {
    // Not connected
    const statusRow = document.createElement("div");
    statusRow.className = "wallet-row wallet-status";
    statusRow.textContent = provider ? `${provider} detected — not connected` : "No Solana wallet detected";
    body.append(statusRow);

    const btnRow = document.createElement("div");
    btnRow.className = "wallet-row wallet-btn-row";

    const connectBtn = document.createElement("button");
    connectBtn.type = "button";
    connectBtn.className = "wallet-btn wallet-btn-primary";
    connectBtn.textContent = "Connect";
    connectBtn.addEventListener("click", async () => {
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting…";
      const result = await connectWallet();
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect";
      // Show result message
      const msgEl = body.querySelector(".wallet-msg");
      if (msgEl) {
        msgEl.textContent = result.ok
          ? "Connected!"
          : result.error || "Connection failed.";
      }
      if (result.ok) {
        renderWalletSection();
      }
    });

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "wallet-btn";
    refreshBtn.textContent = "↻ Refresh";
    refreshBtn.title = "Sync wallet state after connecting in Phantom";
    refreshBtn.addEventListener("click", () => void refreshWalletState());

    btnRow.append(connectBtn, refreshBtn);
    body.append(btnRow);

    const msg = document.createElement("small");
    msg.className = "wallet-msg";
    msg.textContent = provider
      ? "Wallet approval is human-gated. Connect in Phantom, then click ↻ Refresh."
      : "Install Phantom or Brave Wallet, then reload the page.";
    body.append(msg);
  }
};
