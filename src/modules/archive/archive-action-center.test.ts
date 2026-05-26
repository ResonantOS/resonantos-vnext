import { describe, expect, it } from "vitest";
import type {
  ArchiveAiMemoryBuildJobSummary,
  ArchiveImportedLibrarySummary,
  ArchiveReviewArtifact,
} from "../../core/contracts";
import { selectArchiveRecommendedAction } from "./archive-action-center";

const library: ArchiveImportedLibrarySummary = {
  libraryId: "resonant-os-base",
  libraryName: "RESONANT_OS_BASE",
  domain: "mixed-library",
  importMode: "copy",
  manifestPath: "/tmp/manifest.json",
  originalPath: "/tmp/source",
  canonicalRoot: "/tmp/Memory/INTAKE/imports/mixed/sources/resonant-os-base",
  filesSeen: 102,
  filesImported: 100,
  skippedFiles: 2,
  classificationStatus: "needs-ai-assisted-classification",
  metadataStandard: "obsidian-compatible-existing-vault",
  obsidianVaultDetected: true,
  recordsCount: 100,
  importedAt: "unix:1",
};

const job = (status: ArchiveAiMemoryBuildJobSummary["status"]): ArchiveAiMemoryBuildJobSummary => ({
  jobId: "job-1",
  jobFile: "/tmp/job.json",
  status,
  libraryName: library.libraryName,
  manifestPath: library.manifestPath,
  startedAt: "unix:1",
  recordsSeen: 100,
  queuedThisRun: 10,
  processedThisRun: 5,
  promotedThisRun: 2,
  queueRemaining: 5,
  reviewPending: 0,
  reviewApproved: 0,
  reviewEscalated: 0,
  reviewRejected: 0,
  errors: [],
  nextAction: "Continue the build.",
});

const artifact = (status: ArchiveReviewArtifact["decision"]["status"]): ArchiveReviewArtifact => ({
  artifactFile: `/tmp/${status}.json`,
  checkedAt: "unix:1",
  requestFile: "/tmp/request.json",
  sourcePath: "/tmp/source.md",
  sourceType: "md",
  intent: "review-and-ingest",
  providerId: "shared-minimax",
  model: "MiniMax-M2.7",
  summary: "Summary.",
  confidence: "high",
  doctrineSensitivity: "low",
  recommendedTier: "strategist-review",
  recommendationReason: "Routine source summary.",
  proposedPages: [{ type: "summary", title: "Source", content: "Body" }],
  decision: { status },
});

describe("Living Archive recommended action center", () => {
  it("starts with import when no library is connected", () => {
    expect(
      selectArchiveRecommendedAction({
        archiveQueue: [],
        archiveReviewArtifacts: [],
      }).kind,
    ).toBe("import");
  });

  it("prioritizes building or repairing AI memory before manual review", () => {
    expect(
      selectArchiveRecommendedAction({
        latestLibrary: library,
        archiveQueue: [],
        archiveReviewArtifacts: [],
      }).kind,
    ).toBe("build");

    expect(
      selectArchiveRecommendedAction({
        latestLibrary: library,
        latestBuild: job("attention"),
        archiveQueue: [],
        archiveReviewArtifacts: [artifact("escalated")],
      }).kind,
    ).toBe("repair");
  });

  it("promotes approved artifacts before asking the human to review exceptions", () => {
    expect(
      selectArchiveRecommendedAction({
        latestLibrary: library,
        latestBuild: job("complete"),
        archiveQueue: [],
        archiveReviewArtifacts: [artifact("approved"), artifact("escalated")],
      }).kind,
    ).toBe("promote");
  });

  it("shows human review only after AI work and promotion work are exhausted", () => {
    expect(
      selectArchiveRecommendedAction({
        latestLibrary: library,
        latestBuild: job("needs-human-review"),
        archiveQueue: [],
        archiveReviewArtifacts: [artifact("escalated")],
      }).kind,
    ).toBe("review-exceptions");
  });
});
