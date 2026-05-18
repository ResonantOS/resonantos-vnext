// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import type { ArchiveSearchPageHit, ArchiveStats } from "../../core/contracts";

export interface PageSummary {
  pageId: string;
  title: string;
  pageType: string;
  snippet: string;
}

export const buildPatternAnalysisPrompt = (pages: ArchiveSearchPageHit[], stats: ArchiveStats | undefined): string => {
  const pageCount = pages.length;
  const statsBlock = stats
    ? `Archive stats: ${stats.pagesTotal} total pages, ${stats.sourcesTotal} sources, ${stats.activity7d} activities in last 7 days.`
    : "Archive stats: unavailable.";

  const pageBlock =
    pageCount === 0
      ? "No pages available for analysis."
      : pages
          .map(
            (p, i) =>
              `[${i + 1}] ID: ${p.pageId} | Type: ${p.pageType} | Title: ${p.title}\nExcerpt: ${p.snippet}`,
          )
          .join("\n\n");

  return `You are a knowledge analyst performing cross-document pattern analysis over a personal Living Archive.

${statsBlock}

## Archive Pages (${pageCount} retrieved)

${pageBlock}

## Your Task

Analyze the pages above and return a JSON array of insight objects. Each insight must have:
- "type": one of "pattern" | "anomaly" | "connection" | "suggestion"
- "title": short title (≤ 10 words)
- "description": 1-3 sentence explanation
- "confidence": float between 0.0 and 1.0
- "evidence": array of { "pageId", "title", "excerpt" } objects (reference pages that support this insight)

Focus on:
1. Recurring themes or concepts across multiple documents
2. Anomalies or gaps — topics referenced but not elaborated, or unusual outliers
3. Connections between seemingly unrelated topics
4. Areas that appear underexplored and warrant further investigation

Respond ONLY with a valid JSON array. Do not include any explanation outside the JSON.

Example format:
[
  {
    "type": "pattern",
    "title": "Frequent focus on distributed systems",
    "description": "Multiple documents mention distributed state and consensus. This appears to be a recurring architectural concern.",
    "confidence": 0.87,
    "evidence": [
      { "pageId": "page-001", "title": "Architecture Notes", "excerpt": "CAP theorem tradeoffs..." }
    ]
  }
]`;
};
