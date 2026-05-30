export const providerProfiles = [
  {
    id: "shared-minimax",
    label: "MiniMax",
    providerType: "minimax",
    authType: "api-key",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
    role: "Default Augmentor and agent-control provider",
  },
  {
    id: "shared-openai",
    label: "OpenAI",
    providerType: "openai",
    authType: "api-key",
    models: ["gpt-5.5", "gpt-5.4-mini"],
    role: "High-reasoning fallback and archive-quality provider",
  },
];

export const modelCatalog = [
  {
    model: "MiniMax-M2.7-highspeed",
    label: "MiniMax 2.7 High Speed",
    providerId: "shared-minimax",
    providerLabel: "MiniMax",
    runtime: "cloud",
    costTier: "subscription",
    qualityTier: "daily strategic work",
  },
  {
    model: "MiniMax-M2.7",
    label: "MiniMax 2.7",
    providerId: "shared-minimax",
    providerLabel: "MiniMax",
    runtime: "cloud",
    costTier: "subscription",
    qualityTier: "routine and fallback work",
  },
  {
    model: "gpt-5.5",
    label: "GPT 5.5",
    providerId: "shared-openai",
    providerLabel: "OpenAI",
    runtime: "cloud",
    costTier: "paid-per-call",
    qualityTier: "highest reasoning",
  },
  {
    model: "gpt-5.4-mini",
    label: "GPT 5.4 Mini",
    providerId: "shared-openai",
    providerLabel: "OpenAI",
    runtime: "cloud",
    costTier: "paid-per-call",
    qualityTier: "lightweight high-reasoning fallback",
  },
  {
    model: "batiai/gemma4-e2b:q4",
    label: "Gemma 4 2B",
    providerId: "desktop-local",
    providerLabel: "Desktop Local",
    runtime: "local",
    costTier: "local-free",
    qualityTier: "last resort recovery",
  },
];

export const defaultRoutingStrategies = [
  {
    id: "augmentor-chat",
    label: "Augmentor Chat",
    workload: "trusted_conversation",
    primaryModel: "MiniMax-M2.7-highspeed",
    fallbackModels: ["MiniMax-M2.7", "gpt-5.5", "batiai/gemma4-e2b:q4"],
    costPosture: "subscription-first",
    hardStop: false,
    notes: "Use fast subscription capacity first, then higher reasoning only when subscription routes fail.",
  },
  {
    id: "agent-control",
    label: "Agent Control",
    workload: "browser_execution",
    primaryModel: "MiniMax-M2.7-highspeed",
    fallbackModels: ["MiniMax-M2.7", "gpt-5.5"],
    costPosture: "responsive-subscription",
    hardStop: false,
    notes: "Browser control needs a responsive model, but high-cost escalation should remain visible.",
  },
  {
    id: "archive-ingest",
    label: "Archive Ingest",
    workload: "knowledge_promotion",
    primaryModel: "gpt-5.5",
    fallbackModels: ["gpt-5.4-mini", "MiniMax-M2.7"],
    costPosture: "quality-first",
    hardStop: true,
    notes: "Knowledge writes should prefer the strongest verifier route and stop if no trusted model is available.",
  },
  {
    id: "routine-delegation",
    label: "Routine Delegation",
    workload: "delegated_routine_work",
    primaryModel: "MiniMax-M2.7",
    fallbackModels: ["MiniMax-M2.7-highspeed", "batiai/gemma4-e2b:q4"],
    costPosture: "low-cost-first",
    hardStop: false,
    notes: "Routine background work should avoid expensive routes unless explicitly escalated.",
  },
  {
    id: "recovery-engineer",
    label: "Recovery Engineer",
    workload: "resurrect_mode",
    primaryModel: "MiniMax-M2.7-highspeed",
    fallbackModels: ["gpt-5.5", "MiniMax-M2.7", "batiai/gemma4-e2b:q4"],
    costPosture: "best-available-in-emergency",
    hardStop: false,
    notes: "Emergency recovery should find the best reachable brain, with Gemma 4 2B as the final local fallback.",
  },
];

export function providerProfileById(providerId) {
  return providerProfiles.find((profile) => profile.id === providerId) ?? null;
}

export function modelById(model) {
  return modelCatalog.find((entry) => entry.model === model) ?? null;
}

export function inferProviderType(providerId) {
  if (providerId === "shared-openai" || String(providerId ?? "").includes("openai")) return "openai";
  if (providerId === "desktop-local" || String(providerId ?? "").includes("local")) return "openai-compatible";
  return "minimax";
}

export function modelCatalogEntriesForProvider(profile) {
  const providerId = String(profile?.id ?? "").trim();
  const providerLabel = String(profile?.label ?? providerId ?? "Provider");
  const providerType = profile?.providerType ?? inferProviderType(providerId);
  return (profile?.models ?? [])
    .map((entry) => {
      const model = typeof entry === "string" ? entry : entry?.model;
      if (!model) return null;
      const builtIn = modelCatalog.find((catalogEntry) => catalogEntry.model === model);
      return {
        model,
        label: typeof entry === "string" ? (builtIn?.label ?? model) : (entry.label ?? builtIn?.label ?? model),
        providerId,
        providerLabel,
        providerType,
        runtime: typeof entry === "string" ? (builtIn?.runtime ?? "cloud") : (entry.runtime ?? builtIn?.runtime ?? "cloud"),
        costTier: typeof entry === "string" ? (builtIn?.costTier ?? "custom") : (entry.costTier ?? builtIn?.costTier ?? "custom"),
        qualityTier: typeof entry === "string" ? (builtIn?.qualityTier ?? "custom") : (entry.qualityTier ?? builtIn?.qualityTier ?? "custom"),
        wireModel: typeof entry === "string" ? (builtIn?.wireModel ?? model) : (entry.wireModel ?? builtIn?.wireModel ?? model),
      };
    })
    .filter(Boolean);
}

export function allowedModelsForProvider(providerId, preferences = {}) {
  const declaredModels = modelCatalog
    .filter((entry) => entry.providerId === providerId)
    .map((entry) => entry.model);
  const configured = Array.isArray(preferences.allowedModels?.[providerId])
    ? preferences.allowedModels[providerId].filter((model) => declaredModels.includes(model))
    : declaredModels;
  return new Set(configured.length ? configured : declaredModels);
}

export function isModelAllowed(model, preferences = {}) {
  const catalogEntry = modelById(model);
  if (!catalogEntry) {
    return false;
  }
  return allowedModelsForProvider(catalogEntry.providerId, preferences).has(model);
}

export function normalizeFallbackModels(value) {
  const allowed = new Set(modelCatalog.map((entry) => entry.model));
  return [...new Set((Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((model) => String(model ?? "").trim())
    .filter((model) => allowed.has(model)))]
    .slice(0, 6);
}

export function normalizeRoutingStrategy(base, override = {}) {
  const primaryModel = modelById(override.primaryModel) ? override.primaryModel : base.primaryModel;
  return {
    ...base,
    primaryModel,
    fallbackModels: normalizeFallbackModels(override.fallbackModels ?? base.fallbackModels)
      .filter((model) => model !== primaryModel),
    costPosture: String(override.costPosture ?? base.costPosture).trim().slice(0, 80) || base.costPosture,
    hardStop: typeof override.hardStop === "boolean" ? override.hardStop : base.hardStop,
  };
}

export function modelRuntimeState(model, { secrets = {}, preferences = {}, localRuntimeUrl = "" } = {}) {
  const catalogEntry = modelById(model);
  if (!catalogEntry) {
    return null;
  }
  const allowed = isModelAllowed(model, preferences);
  const configured = catalogEntry.providerId === "desktop-local"
    ? Boolean(localRuntimeUrl)
    : Boolean(secrets[catalogEntry.providerId]);
  return {
    ...catalogEntry,
    allowed,
    configured: allowed && configured,
    state: !allowed ? "disabled" : configured ? "available" : "unavailable",
  };
}

export function resolveRoutingStrategies({
  secrets = {},
  overrides = {},
  preferences = {},
  localRuntimeUrl = "",
} = {}) {
  return defaultRoutingStrategies.map((base) => {
    const strategy = normalizeRoutingStrategy(base, overrides[base.id]);
    const chain = [strategy.primaryModel, ...strategy.fallbackModels]
      .map((model) => modelRuntimeState(model, { secrets, preferences, localRuntimeUrl }))
      .filter(Boolean);
    return {
      ...strategy,
      primary: chain[0] ?? null,
      fallbackChain: chain.slice(1),
      routeState: chain.some((entry) => entry.configured) ? "routable" : "unavailable",
    };
  });
}

export function providerRouteForModel(model, { localRuntimeUrl = "" } = {}) {
  if (model === "__auto__" || model === "auto") {
    return null;
  }
  if (model?.startsWith("batiai/")) {
    return {
      providerId: "desktop-local",
      providerType: "openai-compatible",
      apiBaseUrl: localRuntimeUrl || "http://127.0.0.1:11434/v1",
      wireModel: model,
      label: "Desktop Local",
    };
  }
  if (model?.startsWith("gpt-")) {
    return {
      providerId: "shared-openai",
      providerType: "openai",
      apiBaseUrl: "https://api.openai.com/v1",
      wireModel: model,
      label: "Shared OpenAI",
    };
  }
  return {
    providerId: "shared-minimax",
    providerType: "minimax",
    apiBaseUrl: "https://api.minimax.io/v1",
    wireModel: model === "MiniMax-M2.7-highspeed" ? "MiniMax-M2.7" : model || "MiniMax-M2.7",
    label: "Shared MiniMax",
  };
}

export function providerConnectivityTarget(providerId, { localRuntimeUrl = "" } = {}) {
  if (providerId === "desktop-local") {
    return {
      providerId,
      url: localRuntimeUrl || "http://127.0.0.1:11434/v1/models",
      label: "Desktop Local",
      sendsCredential: false,
    };
  }
  if (providerId === "shared-openai") {
    return {
      providerId,
      url: "https://api.openai.com/v1/models",
      label: "Shared OpenAI",
      sendsCredential: true,
    };
  }
  if (providerId === "shared-minimax") {
    return {
      providerId,
      url: "https://api.minimax.io/v1/models",
      label: "Shared MiniMax",
      sendsCredential: true,
    };
  }
  return null;
}

export function providerRouteForWorkload({
  workloadId,
  requestedModel = "",
  secrets = {},
  preferences = {},
  strategies = [],
  localRuntimeUrl = "",
} = {}) {
  const explicitModel = String(requestedModel ?? "").trim();
  if (explicitModel && !["__auto__", "auto", "strategy"].includes(explicitModel)) {
    if (!isModelAllowed(explicitModel, preferences)) {
      return {
        route: null,
        source: "manual",
        strategy: null,
        requestedModel: explicitModel,
        reason: "model-disabled",
      };
    }
    const explicitRoute = providerRouteForModel(explicitModel, { localRuntimeUrl });
    return {
      route: explicitRoute,
      source: "manual",
      strategy: null,
      requestedModel: explicitModel,
    };
  }
  const strategy = strategies.find((entry) => entry.id === workloadId || entry.workload === workloadId)
    ?? strategies.find((entry) => entry.id === "augmentor-chat")
    ?? null;
  const chain = [strategy?.primary, ...(strategy?.fallbackChain ?? [])].filter(Boolean);
  const available = chain.find((entry) =>
    entry.providerId === "desktop-local"
      ? Boolean(localRuntimeUrl)
      : Boolean(secrets[entry.providerId])
  );
  if (!available) {
    return {
      route: null,
      source: "strategy",
      strategy,
      requestedModel: explicitModel || "__auto__",
    };
  }
  return {
    route: providerRouteForModel(available.model, { localRuntimeUrl }),
    source: "strategy",
    strategy,
    requestedModel: explicitModel || "__auto__",
  };
}
