export function normalizeWalletProviderState(raw = {}, tab = {}) {
  const phantomSolana = raw.phantomSolana ?? {};
  const phantomEthereum = raw.phantomEthereum ?? {};
  const detectedProviders = [
    phantomSolana.detected ? "Phantom Solana" : "",
    phantomEthereum.detected ? "Phantom Ethereum" : ""
  ].filter(Boolean);
  return {
    checkedAt: new Date().toISOString(),
    detectionOnly: true,
    detected: detectedProviders.length > 0,
    providers: {
      phantomEthereum: {
        detected: Boolean(phantomEthereum.detected),
        isPhantom: Boolean(phantomEthereum.isPhantom),
        isConnected: Boolean(phantomEthereum.isConnected),
        publicKeyPreview: String(phantomEthereum.publicKeyPreview ?? "")
      },
      phantomSolana: {
        detected: Boolean(phantomSolana.detected),
        isPhantom: Boolean(phantomSolana.isPhantom),
        isConnected: Boolean(phantomSolana.isConnected),
        publicKeyPreview: String(phantomSolana.publicKeyPreview ?? "")
      }
    },
    source: raw.source || "main-world-probe",
    tab: {
      id: tab?.id ?? null,
      title: tab?.title ?? "",
      url: tab?.url ?? ""
    }
  };
}

export function walletStateSummary(state) {
  if (!state?.detected) {
    return "No Phantom wallet provider was detected on the active page.";
  }
  const lines = [];
  if (state.providers?.phantomSolana?.detected) {
    lines.push(`Phantom Solana: ${state.providers.phantomSolana.isConnected ? "connected" : "available, not connected"}${state.providers.phantomSolana.publicKeyPreview ? ` · ${state.providers.phantomSolana.publicKeyPreview}` : ""}`);
  }
  if (state.providers?.phantomEthereum?.detected) {
    lines.push(`Phantom Ethereum: ${state.providers.phantomEthereum.isConnected ? "connected" : "available, not connected"}${state.providers.phantomEthereum.publicKeyPreview ? ` · ${state.providers.phantomEthereum.publicKeyPreview}` : ""}`);
  }
  return lines.join("\n");
}

export function walletStateMarkdown(state) {
  return [
    "Wallet status",
    walletStateSummary(state),
    "",
    `Page: ${state?.tab?.title || "Untitled"}`,
    state?.tab?.url || "No page URL",
    "",
    "Boundary: this is read-only detection. ResonantOS did not request wallet connection, did not ask for a signature, did not expose seed/private keys, and did not submit a transaction."
  ].join("\n");
}
