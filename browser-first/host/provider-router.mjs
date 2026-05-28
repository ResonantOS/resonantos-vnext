/**
 * provider-router.mjs — Multi-model provider routing for ResonantOS Browser-First.
 * Supports OpenAI, MiniMax, Anthropic, Groq, DeepSeek, xAI.
 * ESM module, no external dependencies.
 */

// Provider registry: keyed by internal provider name.
const PROVIDERS = {
  openai: {
    id: "shared-openai",
    label: "OpenAI",
    apiBaseUrl: "https://api.openai.com/v1",
    providerType: "openai",
    models: ["gpt-5.5", "gpt-5.4-mini", "gpt-4o"],
  },
  minimax: {
    id: "shared-minimax",
    label: "MiniMax",
    apiBaseUrl: "https://api.minimax.io/v1",
    providerType: "minimax",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
  },
  anthropic: {
    id: "shared-anthropic",
    label: "Anthropic",
    apiBaseUrl: "https://api.anthropic.com/v1",
    providerType: "anthropic",
    models: ["claude-sonnet-4", "claude-opus-4"],
  },
  groq: {
    id: "shared-groq",
    label: "Groq",
    apiBaseUrl: "https://api.groq.com/openai/v1",
    providerType: "openai",
    models: ["llama-3.3-70b-versatile", "llama-4-scout"],
  },
  deepseek: {
    id: "shared-deepseek",
    label: "DeepSeek",
    apiBaseUrl: "https://api.deepseek.com/v1",
    providerType: "openai",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  xai: {
    id: "shared-xai",
    label: "xAI",
    apiBaseUrl: "https://api.x.ai/v1",
    providerType: "openai",
    models: ["grok-4", "grok-3"],
  },
};

// Build a fast lookup: model string → provider entry.
const MODEL_TO_PROVIDER = new Map();
for (const [key, provider] of Object.entries(PROVIDERS)) {
  for (const model of provider.models) {
    MODEL_TO_PROVIDER.set(model, { key, provider });
  }
}

/**
 * routeForModel(model) → { providerId, apiBaseUrl, wireModel, providerType, label }
 * Falls back to MiniMax if the model is unknown.
 */
export function routeForModel(model) {
  const entry = MODEL_TO_PROVIDER.get(model);
  if (!entry) {
    // Legacy fallback: keep existing GPT/MiniMax heuristics.
    if (typeof model === "string" && model.startsWith("gpt-")) {
      return {
        providerId: "shared-openai",
        apiBaseUrl: "https://api.openai.com/v1",
        wireModel: model,
        providerType: "openai",
        label: "OpenAI",
      };
    }
    return {
      providerId: "shared-minimax",
      apiBaseUrl: "https://api.minimax.io/v1",
      wireModel: model || "MiniMax-M2.7",
      providerType: "minimax",
      label: "MiniMax",
    };
  }

  const { provider } = entry;
  // MiniMax highspeed maps to the same wire model name.
  const wireModel = model === "MiniMax-M2.7-highspeed" ? "MiniMax-M2.7" : model;

  return {
    providerId: provider.id,
    apiBaseUrl: provider.apiBaseUrl,
    wireModel,
    providerType: provider.providerType,
    label: provider.label,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sanitizeContent(providerType, content) {
  if (providerType === "minimax") {
    return String(content ?? "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
  }
  return String(content ?? "").trim();
}

function extractOpenAIContent(responsePayload) {
  const content = responsePayload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text ?? part?.content ?? "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractAnthropicContent(responsePayload) {
  const content = responsePayload?.content;
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text ?? "")
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}

// ── Public: executeChat ───────────────────────────────────────────────────────

/**
 * executeChat(payload, secrets) → { reply, providerId, model, usage }
 *
 * payload shape:
 *   model          — model string (e.g. "claude-sonnet-4")
 *   messages       — [{ role, content }]  (user/assistant only)
 *   systemPrompt   — string (optional)
 *   thinkingDepth  — "low"|"medium"|"high"  (OpenAI only, maps to reasoning_effort)
 *   maxTokens      — number (Anthropic: required; default 4096)
 *   pageContext    — additional context string injected into system prompt
 *   runtimeContext — attachment context string injected into system prompt
 */
export async function executeChat(payload, secrets) {
  const route = routeForModel(payload.model);
  const apiKey = secrets?.[route.providerId];

  if (!apiKey) {
    throw new Error(
      `${route.label} credential missing (key: "${route.providerId}"). ` +
        "Add it in ResonantOS Provider Profiles."
    );
  }

  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .filter(
          (m) =>
            ["user", "assistant"].includes(m?.role) &&
            String(m?.content ?? "").trim()
        )
        .map((m) => ({ role: m.role, content: String(m.content).trim() }))
    : [];

  if (!messages.length) {
    throw new Error("No chat message was provided.");
  }

  const systemParts = [payload.systemPrompt, payload.pageContext, payload.runtimeContext].filter(Boolean);
  const systemPrompt = systemParts.join("\n\n");

  // ── Anthropic Messages API ──────────────────────────────────────────────────
  if (route.providerType === "anthropic") {
    const body = {
      model: route.wireModel,
      max_tokens: Number(payload.maxTokens ?? 4096),
      messages,
    };
    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch(`${route.apiBaseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg =
        responsePayload?.error?.message ??
        `Anthropic request failed with HTTP ${response.status}.`;
      throw new Error(msg);
    }

    const reply = sanitizeContent(
      route.providerType,
      extractAnthropicContent(responsePayload)
    );
    if (!reply) throw new Error("Anthropic returned an empty reply.");

    return {
      reply,
      providerId: route.providerId,
      model: payload.model || route.wireModel,
      usage: responsePayload?.usage ?? null,
    };
  }

  // ── OpenAI-compatible (OpenAI, MiniMax, Groq, DeepSeek, xAI) ───────────────
  const requestMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const body = {
    model: route.wireModel,
    messages: requestMessages,
  };

  // OpenAI reasoning_effort (only on OpenAI proper, not other compat APIs).
  if (route.providerId === "shared-openai" && payload.thinkingDepth) {
    body.reasoning_effort = payload.thinkingDepth;
  }

  const response = await fetch(`${route.apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      responsePayload?.error?.message ??
      `${route.label} request failed with HTTP ${response.status}.`;
    throw new Error(msg);
  }

  const reply = sanitizeContent(
    route.providerType,
    extractOpenAIContent(responsePayload)
  );
  if (!reply) throw new Error(`${route.label} returned an empty reply.`);

  return {
    reply,
    providerId: route.providerId,
    model: payload.model || route.wireModel,
    usage: responsePayload?.usage ?? null,
  };
}

// ── Public: listProviders ─────────────────────────────────────────────────────

/**
 * listProviders(secrets) → Array of provider descriptors with `available` flag.
 */
export function listProviders(secrets) {
  return Object.entries(PROVIDERS).map(([key, provider]) => ({
    id: provider.id,
    label: provider.label,
    providerKey: key,
    providerType: provider.providerType,
    models: provider.models,
    available: Boolean(secrets?.[provider.id]),
  }));
}
