// Intent citation: docs/architecture/ADR-002-modular-codebase.md

export type ThinkingDepth = "minimal" | "medium" | "high";

export type ComposerAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string;
  previewState: "embedded" | "metadata-only";
};
