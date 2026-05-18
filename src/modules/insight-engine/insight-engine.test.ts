// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import { describe, expect, it } from "vitest";
import type { ArchiveSearchPageHit, ArchiveStats } from "../../core/contracts";
import { clampConfidence, parseInsightResponse, parseRawInsight } from "./controller";
import { buildPatternAnalysisPrompt } from "./prompts";
import type { Insight } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePage = (overrides: Partial<ArchiveSearchPageHit> = {}): ArchiveSearchPageHit => ({
  pageId: "page-001",
  title: "Test Page",
  pageType: "knowledge",
  filePath: "/archive/test.md",
  score: 0.9,
  snippet: "This is a test excerpt about distributed systems and consensus protocols.",
  ...overrides,
});

const makeStats = (overrides: Partial<ArchiveStats> = {}): ArchiveStats => ({
  pagesTotal: 42,
  pagesByType: { knowledge: 30, draft: 12 },
  linksTotal: 120,
  sourcesTotal: 15,
  sourcesUnprocessed: 2,
  activity7d: 8,
  ...overrides,
});

// ---------------------------------------------------------------------------
// buildPatternAnalysisPrompt
// ---------------------------------------------------------------------------

describe("buildPatternAnalysisPrompt", () => {
  it("includes page title and snippet in the prompt", () => {
    const pages = [makePage({ title: "Consensus Algorithms", snippet: "Raft and Paxos are popular." })];
    const prompt = buildPatternAnalysisPrompt(pages, undefined);

    expect(prompt).toContain("Consensus Algorithms");
    expect(prompt).toContain("Raft and Paxos are popular.");
  });

  it("includes archive stats when provided", () => {
    const pages = [makePage()];
    const stats = makeStats({ pagesTotal: 99, sourcesTotal: 7 });
    const prompt = buildPatternAnalysisPrompt(pages, stats);

    expect(prompt).toContain("99");
    expect(prompt).toContain("7");
  });

  it("handles empty page array gracefully", () => {
    const prompt = buildPatternAnalysisPrompt([], undefined);

    expect(prompt).toContain("0");
    expect(prompt).toContain("No pages available");
  });

  it("includes all 4 required insight types in the prompt", () => {
    const prompt = buildPatternAnalysisPrompt([makePage()], makeStats());

    expect(prompt).toContain("pattern");
    expect(prompt).toContain("anomaly");
    expect(prompt).toContain("connection");
    expect(prompt).toContain("suggestion");
  });

  it("requests JSON output format", () => {
    const prompt = buildPatternAnalysisPrompt([makePage()], makeStats());

    expect(prompt).toContain("JSON");
  });
});

// ---------------------------------------------------------------------------
// parseInsightResponse — insight type handling
// ---------------------------------------------------------------------------

describe("parseInsightResponse", () => {
  it("parses all 4 valid insight types", () => {
    const types: Insight["type"][] = ["pattern", "anomaly", "connection", "suggestion"];
    const raw = JSON.stringify(
      types.map((type) => ({
        type,
        title: `A ${type} insight`,
        description: `This is a ${type}.`,
        confidence: 0.8,
        evidence: [],
      })),
    );

    const insights = parseInsightResponse(raw);

    expect(insights).toHaveLength(4);
    expect(insights.map((i) => i.type)).toEqual(types);
  });

  it("falls back to 'suggestion' for unknown insight types", () => {
    const raw = JSON.stringify([
      {
        type: "unknown-type",
        title: "Unknown",
        description: "desc",
        confidence: 0.5,
        evidence: [],
      },
    ]);

    const insights = parseInsightResponse(raw);

    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe("suggestion");
  });

  it("returns empty array for invalid JSON", () => {
    const insights = parseInsightResponse("not json at all {{{");

    expect(insights).toEqual([]);
  });

  it("returns empty array when LLM returns non-array JSON", () => {
    const insights = parseInsightResponse(JSON.stringify({ error: "something went wrong" }));

    expect(insights).toEqual([]);
  });

  it("strips markdown code fences before parsing", () => {
    const raw = "```json\n" + JSON.stringify([{ type: "pattern", title: "T", description: "D", confidence: 0.7, evidence: [] }]) + "\n```";
    const insights = parseInsightResponse(raw);

    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe("pattern");
  });

  it("sets dismissed to false on all parsed insights", () => {
    const raw = JSON.stringify([
      { type: "pattern", title: "T", description: "D", confidence: 0.5, evidence: [] },
    ]);
    const insights = parseInsightResponse(raw);

    expect(insights[0].dismissed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clampConfidence — confidence scoring
// ---------------------------------------------------------------------------

describe("clampConfidence", () => {
  it("returns 1 for values above 1", () => {
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(100)).toBe(1);
  });

  it("returns 0 for values below 0", () => {
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(-999)).toBe(0);
  });

  it("returns the value unchanged when within [0, 1]", () => {
    expect(clampConfidence(0)).toBe(0);
    expect(clampConfidence(0.5)).toBe(0.5);
    expect(clampConfidence(1)).toBe(1);
    expect(clampConfidence(0.75)).toBe(0.75);
  });

  it("returns 0 for non-numeric input", () => {
    expect(clampConfidence("high")).toBe(0);
    expect(clampConfidence(null)).toBe(0);
    expect(clampConfidence(undefined)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseRawInsight — individual insight parsing
// ---------------------------------------------------------------------------

describe("parseRawInsight", () => {
  it("returns null for non-object input", () => {
    expect(parseRawInsight(null, 0)).toBeNull();
    expect(parseRawInsight("string", 0)).toBeNull();
    expect(parseRawInsight([], 0)).toBeNull();
  });

  it("parses evidence array correctly", () => {
    const raw = {
      type: "connection",
      title: "Connection found",
      description: "Two topics are linked.",
      confidence: 0.9,
      evidence: [
        { pageId: "p1", title: "Page One", excerpt: "Some text" },
        { pageId: "p2", title: "Page Two", excerpt: "Other text" },
      ],
    };

    const insight = parseRawInsight(raw, 0);

    expect(insight).not.toBeNull();
    expect(insight!.evidence).toHaveLength(2);
    expect(insight!.evidence[0].pageId).toBe("p1");
  });

  it("clamps confidence during individual parsing", () => {
    const raw = { type: "pattern", title: "T", description: "D", confidence: 2.5, evidence: [] };
    const insight = parseRawInsight(raw, 0);

    expect(insight!.confidence).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Empty archive scenario
// ---------------------------------------------------------------------------

describe("empty archive handling", () => {
  it("buildPatternAnalysisPrompt with empty pages does not throw", () => {
    expect(() => buildPatternAnalysisPrompt([], undefined)).not.toThrow();
  });

  it("parseInsightResponse with empty string returns empty array not error", () => {
    expect(() => parseInsightResponse("")).not.toThrow();
    expect(parseInsightResponse("")).toEqual([]);
  });

  it("parseInsightResponse with empty JSON array returns empty insights", () => {
    const insights = parseInsightResponse("[]");
    expect(insights).toEqual([]);
  });
});
