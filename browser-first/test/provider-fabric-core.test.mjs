import assert from "node:assert/strict";
import test from "node:test";

import {
  providerConnectivityTarget,
  providerRouteForWorkload,
  resolveRoutingStrategies,
} from "../host/provider-fabric-core.mjs";

test("provider fabric auto route uses primary subscription model when available", () => {
  const secrets = { "shared-minimax": "stored-minimax" };
  const strategies = resolveRoutingStrategies({ secrets });
  const decision = providerRouteForWorkload({
    workloadId: "augmentor-chat",
    requestedModel: "__auto__",
    secrets,
    strategies,
  });

  assert.equal(decision.source, "strategy");
  assert.equal(decision.strategy.id, "augmentor-chat");
  assert.equal(decision.route.providerId, "shared-minimax");
  assert.equal(decision.route.wireModel, "MiniMax-M2.7");
});

test("provider fabric skips disabled primary models and uses next allowed configured fallback", () => {
  const secrets = { "shared-minimax": "stored-minimax", "shared-openai": "stored-openai" };
  const preferences = {
    allowedModels: {
      "shared-minimax": ["MiniMax-M2.7"],
      "shared-openai": ["gpt-5.5", "gpt-5.4-mini"],
    },
  };
  const strategies = resolveRoutingStrategies({ secrets, preferences });
  const augmentor = strategies.find((strategy) => strategy.id === "augmentor-chat");

  assert.equal(augmentor.primary.model, "MiniMax-M2.7-highspeed");
  assert.equal(augmentor.primary.state, "disabled");
  assert.equal(augmentor.fallbackChain[0].model, "MiniMax-M2.7");
  assert.equal(augmentor.fallbackChain[0].state, "available");

  const decision = providerRouteForWorkload({
    workloadId: "augmentor-chat",
    requestedModel: "__auto__",
    secrets,
    strategies,
  });

  assert.equal(decision.route.providerId, "shared-minimax");
  assert.equal(decision.route.wireModel, "MiniMax-M2.7");
});

test("provider fabric escalates to paid fallback only when subscription route is unavailable", () => {
  const secrets = { "shared-openai": "stored-openai" };
  const strategies = resolveRoutingStrategies({ secrets });
  const decision = providerRouteForWorkload({
    workloadId: "augmentor-chat",
    requestedModel: "__auto__",
    secrets,
    strategies,
  });

  assert.equal(decision.strategy.id, "augmentor-chat");
  assert.equal(decision.route.providerId, "shared-openai");
  assert.equal(decision.route.wireModel, "gpt-5.5");
});

test("provider fabric blocks manual selection of disabled models", () => {
  const preferences = {
    allowedModels: {
      "shared-minimax": ["MiniMax-M2.7"],
    },
  };
  const decision = providerRouteForWorkload({
    workloadId: "augmentor-chat",
    requestedModel: "MiniMax-M2.7-highspeed",
    secrets: { "shared-minimax": "stored-minimax" },
    preferences,
    strategies: resolveRoutingStrategies({
      secrets: { "shared-minimax": "stored-minimax" },
      preferences,
    }),
  });

  assert.equal(decision.route, null);
  assert.equal(decision.source, "manual");
  assert.equal(decision.reason, "model-disabled");
});

test("provider fabric hard-stop workloads return no route when trusted chain is unavailable", () => {
  const secrets = {};
  const strategies = resolveRoutingStrategies({ secrets });
  const archive = strategies.find((strategy) => strategy.id === "archive-ingest");
  const decision = providerRouteForWorkload({
    workloadId: "archive-ingest",
    requestedModel: "__auto__",
    secrets,
    strategies,
  });

  assert.equal(archive.hardStop, true);
  assert.equal(archive.routeState, "unavailable");
  assert.equal(decision.route, null);
  assert.equal(decision.strategy.id, "archive-ingest");
});

test("provider fabric can use local runtime as final fallback when configured", () => {
  const secrets = {};
  const localRuntimeUrl = "http://127.0.0.1:11434/v1";
  const strategies = resolveRoutingStrategies({ secrets, localRuntimeUrl });
  const decision = providerRouteForWorkload({
    workloadId: "augmentor-chat",
    requestedModel: "__auto__",
    secrets,
    strategies,
    localRuntimeUrl,
  });

  assert.equal(decision.route.providerId, "desktop-local");
  assert.equal(decision.route.apiBaseUrl, localRuntimeUrl);
  assert.equal(decision.route.wireModel, "batiai/gemma4-e2b:q4");
});

test("provider fabric exposes bounded connectivity targets without prompts", () => {
  const openAi = providerConnectivityTarget("shared-openai");
  const miniMax = providerConnectivityTarget("shared-minimax");
  const local = providerConnectivityTarget("desktop-local", { localRuntimeUrl: "http://127.0.0.1:11434/v1/models" });

  assert.equal(openAi.url, "https://api.openai.com/v1/models");
  assert.equal(openAi.sendsCredential, true);
  assert.equal(miniMax.url, "https://api.minimax.io/v1/models");
  assert.equal(miniMax.sendsCredential, true);
  assert.equal(local.url, "http://127.0.0.1:11434/v1/models");
  assert.equal(local.sendsCredential, false);
  assert.equal(providerConnectivityTarget("unknown-provider"), null);
});
