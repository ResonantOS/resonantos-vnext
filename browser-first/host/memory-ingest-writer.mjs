// Intent citation: docs/architecture/ADR-027-living-archive-llm-wiki-compliance.md

import { buildDeterministicWikiDraft } from "./memory-ingest-draft.mjs";

export const requiredWikiDraftSections = [
  "Summary",
  "Source Provenance",
  "Key Claims",
  "Entities And Concepts",
  "Existing Or Suggested Links",
  "Contradictions And Open Questions",
  "Maintenance Notes",
];

function sanitizeAssistantContent(providerType, content) {
  if (providerType !== "minimax") {
    return String(content ?? "").trim();
  }
  return String(content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
}

function extractAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text ?? part?.content ?? "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function validateWikiDraftContent(content) {
  const text = String(content ?? "").trim();
  const missingSections = requiredWikiDraftSections.filter((section) =>
    !new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im").test(text)
  );
  return {
    valid: text.length >= 300 && missingSections.length === 0,
    missingSections,
    bytes: Buffer.byteLength(text, "utf8"),
  };
}

export function buildArchiveIngestWriterMessages({
  sourceContent,
  sourcePath,
  sourceTitle,
  proposedPage,
  requestPath,
  existingIndex = "",
}) {
  const systemPrompt = [
    "You are the ResonantOS Living Archive ingest writer.",
    "You maintain an LLM Wiki: persistent, interlinked markdown memory compiled from raw sources.",
    "Write only the proposed wiki page markdown. Do not include commentary outside the page.",
    "Ground every important claim in the source. Do not invent facts.",
    "Preserve uncertainty, contradictions, and open questions instead of smoothing them away.",
    "Use wikilinks for entities, concepts, protocols, agents, projects, and related pages.",
    "The human/source artifact is immutable. You are writing only AI_MEMORY wiki content.",
    "Required sections: Summary, Source Provenance, Key Claims, Entities And Concepts, Existing Or Suggested Links, Contradictions And Open Questions, Maintenance Notes.",
  ].join("\n");
  const userPrompt = [
    `Source title: ${sourceTitle || "Untitled source"}`,
    `Source artifact: ${sourcePath || "unknown"}`,
    `Review request: ${requestPath || "unknown"}`,
    `Proposed wiki page: ${proposedPage || "AI_MEMORY/wiki/unknown.md"}`,
    "",
    "Current wiki index excerpt:",
    String(existingIndex || "(no index available)").slice(0, 8_000),
    "",
    "Raw source excerpt:",
    String(sourceContent || "").slice(0, 18_000),
  ].join("\n");
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

export async function runArchiveIngestWriterWithRoute({
  sourceContent,
  sourcePath,
  sourceTitle,
  proposedPage,
  requestPath,
  existingIndex = "",
  route,
  credential,
  fetchImpl = fetch,
  deterministicContent = "",
}) {
  const fallbackContent = deterministicContent || buildDeterministicWikiDraft({
    sourceContent,
    sourcePath,
    sourceTitle,
    proposedPage,
    requestPath,
  });
  if (!route || !credential) {
    return {
      content: fallbackContent,
      writerStatus: "deterministic-fallback",
      providerId: "",
      model: "",
      usage: null,
      fallbackReason: "No configured archive ingest writer provider was available.",
    };
  }

  try {
    const response = await fetchImpl(`${route.apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: route.wireModel,
        messages: buildArchiveIngestWriterMessages({
          sourceContent,
          sourcePath,
          sourceTitle,
          proposedPage,
          requestPath,
          existingIndex,
        }),
        ...(route.providerType === "openai" ? { reasoning_effort: "medium" } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        content: fallbackContent,
        writerStatus: "deterministic-fallback",
        providerId: route.providerId,
        model: route.wireModel,
        usage: payload?.usage ?? null,
        fallbackReason: payload?.error?.message ?? `Archive ingest writer failed with HTTP ${response.status}.`,
      };
    }
    const content = sanitizeAssistantContent(route.providerType, extractAssistantContent(payload));
    const validation = validateWikiDraftContent(content);
    if (!validation.valid) {
      return {
        content: fallbackContent,
        writerStatus: "deterministic-fallback",
        providerId: route.providerId,
        model: route.wireModel,
        usage: payload?.usage ?? null,
        fallbackReason: `Archive ingest writer response failed structure validation: missing ${validation.missingSections.join(", ") || "sufficient content"}.`,
      };
    }
    return {
      content,
      writerStatus: "provider-written",
      providerId: route.providerId,
      model: route.wireModel,
      usage: payload?.usage ?? null,
      fallbackReason: "",
    };
  } catch (error) {
    return {
      content: fallbackContent,
      writerStatus: "deterministic-fallback",
      providerId: route.providerId,
      model: route.wireModel,
      usage: null,
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}
