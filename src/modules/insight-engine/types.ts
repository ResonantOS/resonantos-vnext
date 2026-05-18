// Intent citation: docs/architecture/ADR-002-modular-codebase.md

export interface Insight {
  id: string;
  type: "pattern" | "anomaly" | "connection" | "suggestion";
  title: string;
  description: string;
  confidence: number; // 0-1
  evidence: { pageId: string; title: string; excerpt: string }[];
  createdAt: string;
  dismissed: boolean;
}

export interface InsightAnalysisResult {
  insights: Insight[];
  pagesAnalyzed: number;
  analysisModel: string;
  durationMs: number;
}
