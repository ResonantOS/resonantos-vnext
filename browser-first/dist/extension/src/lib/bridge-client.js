const defaultBridgeConfig = globalThis.__RESONANTOS_BRIDGE_CONFIG__ ?? {};

export function createBridgeClient(config = defaultBridgeConfig) {
  const bridgeUrl = config.bridgeUrl ?? "http://127.0.0.1:47773";
  const bridgeToken = config.bridgeToken ?? "";

  return async function bridgeRequest(route, options = {}) {
    const headers = options.body ? { "Content-Type": "application/json" } : {};
    if (bridgeToken) {
      headers["X-ResonantOS-Bridge-Token"] = bridgeToken;
    }
    const response = await fetch(`${bridgeUrl}${route}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload?.error ?? `Bridge request failed with HTTP ${response.status}.`);
    }
    return payload;
  };
}
