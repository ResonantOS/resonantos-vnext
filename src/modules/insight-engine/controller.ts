// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import type { Dispatch, SetStateAction } from "react";
import type { AddOnManifest, ArchiveSearchPageHit, ArchiveStats, ResonantShellState } from "../../core/contracts";
import { resolveMemoryProviderBroker } from "../../core/memory-provider";
import { resolveAgentChatRoute } from "../../core/provider-service";
import { requestProviderServiceChatCompletion } from "../../core/runtime";
import { buildPatternAnalysisPrompt } from "./prompts";
import type { Insight, InsightAnalysisResult } from "./types";

const INSIGHT_ANALYSIS_AGENT_ID = "strategist.core";
const SEARCH_QUERIES = ["knowledge", "project", "research", "notes", "system"];
const MAX_PAGES_PER_QUERY = 10;

/** Clamp a raw confidence value to the valid [0, 1] range. */
export const clampConfidence = (raw: unknown): number => {
  const n = typeof raw === "number" ? raw : 0;
  return Math.min(1, Math.max(0, n));
};

/** Parse a single raw LLM insight object into a typed Insight. */
export const parseRawInsight = (raw: unknown, index: number): Insight | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const validTypes = ["pattern", "anomaly", "connection", "suggestion"] as const;
  const type = validTypes.includes(r["type"] as (typeof validTypes)[number])
    ? (r["type"] as Insight["type"])
    : "suggestion";

  const title = typeof r["title"] === "string" ? r["title"] : `Insight ${index + 1}`;
  const description = typeof r["description"] === "string" ? r["description"] : "";
  const confidence = clampConfidence(r["confidence"]);
  const createdAt = new Date().toISOString();

  const evidence: Insight["evidence"] = [];
  if (Array.isArray(r["evidence"])) {
    for (const e of r["evidence"]) {
      if (typeof e === "object" && e !== null && !Array.isArray(e)) {
        const ev = e as Record<string, unknown>;
        if (typeof ev["pageId"] === "string" && typeof ev["title"] === "string") {
          evidence.push({
            pageId: ev["pageId"],
            title: ev["title"],
            excerpt: typeof ev["excerpt"] === "string" ? ev["excerpt"] : "",
          });
        }
      }
    }
  }

  return {
    id: `insight-${Date.now()}-${index}`,
    type,
    title,
    description,
    confidence,
    evidence,
    createdAt,
    dismissed: false,
  };
};

/** Parse the raw LLM JSON response into a typed Insight array. */
export const parseInsightResponse = (raw: string): Insight[] => {
  let parsed: unknown;
  try {
    // Strip possible markdown fences
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const insights: Insight[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const insight = parseRawInsight(parsed[i], i);
    if (insight) insights.push(insight);
  }
  return insights;
};

/** Deduplicate pages by pageId, keeping highest-scoring hit. */
const deduplicatePages = (pages: ArchiveSearchPageHit[]): ArchiveSearchPageHit[] => {
  const seen = new Map<string, ArchiveSearchPageHit>();
  for (const page of pages) {
    const existing = seen.get(page.pageId);
    if (!existing || page.score > existing.score) {
      seen.set(page.pageId, page);
    }
  }
  return Array.from(seen.values());
};

/**
 * Run cross-document pattern analysis over Living Archive content.
 * Returns structured insights without throwing on empty archive.
 */
export const runInsightAnalysis = async (
  state: ResonantShellState,
  manifests: AddOnManifest[],
  dispatch: Dispatch<SetStateAction<InsightAnalysisResult | null>>,
): Promise<InsightAnalysisResult> => {
  const startMs = Date.now();

  const broker = resolveMemoryProviderBroker(state, manifests);

  // Collect pages from multiple broad queries
  let allPages: ArchiveSearchPageHit[] = [];
  let archiveStats: ArchiveStats | undefined;

  try {
    const statusResult = await broker.status();
    archiveStats = statusResult.stats;
  } catch {
    // Non-fatal — continue without stats
  }

  if (broker.supports.search) {
    for (const query of SEARCH_QUERIES) {
      try {
        const result = await broker.search(query, MAX_PAGES_PER_QUERY);
        allPages.push(...result.pages);
      } catch {
        // Skip failed queries
      }
    }
  }

  const pages = deduplicatePages(allPages);

  // Return early with empty result if archive has no content
  if (pages.length === 0) {
    const emptyResult: InsightAnalysisResult = {
      insights: [],
      pagesAnalyzed: 0,
      analysisModel: "none",
      durationMs: Date.now() - startMs,
    };
    dispatch(emptyResult);
    return emptyResult;
  }

  // Build prompt and resolve provider route
  const prompt = buildPatternAnalysisPrompt(pages, archiveStats);
  const route = resolveAgentChatRoute(state, INSIGHT_ANALYSIS_AGENT_ID);
  const model = route.model ?? "unknown";

  let rawResponse = "";
  try {
    rawResponse = await requestProviderServiceChatCompletion({
      providerId: route.provider?.id ?? "",
      providerType: route.provider?.providerType ?? "anthropic",
      apiBaseUrl: route.provider?.apiBaseUrl,
      runtimeNodeId: route.runtimeNode?.id,
      runtimeNodeKind: route.runtimeNode?.kind,
      runtimeNodeEndpoint: route.runtimeNode?.endpoint,
      authTier: route.provider?.authTier,
      model,
      reasoningEffort: "medium",
      systemPrompt: "You are a knowledge analyst. Respond only with valid JSON.",
      messages: [
        {
          id: `insight-user-${Date.now()}`,
          threadId: "insight-engine",
          channelId: "insight-engine",
          role: "user",
          author: "insight-engine",
          content: prompt,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  } catch {
    // LLM unavailable — return empty rather than throw
    const fallback: InsightAnalysisResult = {
      insights: [],
      pagesAnalyzed: pages.length,
      analysisModel: model,
      durationMs: Date.now() - startMs,
    };
    dispatch(fallback);
    return fallback;
  }

  const insights = parseInsightResponse(rawResponse);

  const result: InsightAnalysisResult = {
    insights,
    pagesAnalyzed: pages.length,
    analysisModel: model,
    durationMs: Date.now() - startMs,
  };

  dispatch(result);
  return result;
};
