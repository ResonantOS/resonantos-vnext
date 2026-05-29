import assert from "node:assert/strict";
import test from "node:test";

import { createBridgeClient } from "../resonantos-side-panel-extension/src/lib/bridge-client.js";
import { startBridgeServer } from "../host/bridge-server.mjs";

test("bridge privileged routes require a route-scoped capability token", async () => {
  const bridgeToken = "general-test-token";
  const capabilityToken = "credential-write-test-token";
  const server = await startBridgeServer({
    port: 0,
    bridgeToken,
    bridgeCapabilityTokens: {
      "provider-credential-write": capabilityToken,
    },
    extensionOrigin: "chrome-extension://test",
    routes: [
      { method: "GET", path: "/public", handler: async () => ({ public: true }) },
      {
        method: "POST",
        path: "/providers/credentials",
        requiredCapability: "provider-credential-write",
        handler: async () => ({ saved: true }),
      },
    ],
  });
  const address = server.address();
  const bridgeUrl = `http://127.0.0.1:${address.port}`;
  const client = createBridgeClient({
    bridgeUrl,
    bridgeToken,
    bridgeCapabilityTokens: {
      "provider-credential-write": capabilityToken,
    },
  });

  try {
    assert.equal((await client("/public", { method: "GET" })).public, true);

    await assert.rejects(
      () => client("/providers/credentials", {
        method: "POST",
        body: { providerId: "shared-minimax", credential: "minimax-test-credential" },
      }),
      /requires provider-credential-write capability/,
    );

    const wrongCapability = await fetch(`${bridgeUrl}/providers/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ResonantOS-Bridge-Token": bridgeToken,
        "X-ResonantOS-Bridge-Capability-Token": "wrong-token",
      },
      body: JSON.stringify({ providerId: "shared-minimax", credential: "minimax-test-credential" }),
    });
    assert.equal(wrongCapability.status, 403);

    const saved = await client("/providers/credentials", {
      method: "POST",
      capability: "provider-credential-write",
      body: { providerId: "shared-minimax", credential: "minimax-test-credential" },
    });
    assert.equal(saved.saved, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
