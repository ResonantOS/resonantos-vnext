// Intent citation: docs/architecture/ADR-027-living-archive-llm-wiki-compliance.md

import type {
  ArchiveAiMemoryBuildJobSummary,
  ArchiveAiMemoryBuildResult,
  ArchiveImportedLibrarySummary,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
} from "../../core/contracts";

export type ArchiveRecommendedActionKind =
  | "import"
  | "build"
  | "continue"
  | "repair"
  | "promote"
  | "maintenance"
  | "review-exceptions"
  | "complete";

export type ArchiveRecommendedAction = {
  kind: ArchiveRecommendedActionKind;
  title: string;
  description: string;
  buttonLabel: string;
  humanWork: "none" | "exception-only" | "required";
  manifestPath?: string;
};

export function selectLatestArchiveBuild(
  latestLibrary: ArchiveImportedLibrarySummary | undefined,
  archiveAiMemoryBuildResult: ArchiveAiMemoryBuildResult | null,
  archiveAiMemoryBuildJobs: ArchiveAiMemoryBuildJobSummary[],
): ArchiveAiMemoryBuildResult | ArchiveAiMemoryBuildJobSummary | undefined {
  if (!latestLibrary) {
    return undefined;
  }

  return archiveAiMemoryBuildResult?.manifestPath === latestLibrary.manifestPath
    ? archiveAiMemoryBuildResult
    : archiveAiMemoryBuildJobs.find((job) => job.manifestPath === latestLibrary.manifestPath);
}

export function selectArchiveRecommendedAction({
  latestLibrary,
  latestBuild,
  archiveQueue,
  archiveReviewArtifacts,
}: {
  latestLibrary?: ArchiveImportedLibrarySummary;
  latestBuild?: ArchiveAiMemoryBuildResult | ArchiveAiMemoryBuildJobSummary;
  archiveQueue: ArchiveQueuedIngestRequest[];
  archiveReviewArtifacts: ArchiveReviewArtifact[];
}): ArchiveRecommendedAction {
  const approvedUnpromoted = archiveReviewArtifacts.filter(
    (artifact) =>
      artifact.decision.status === "approved" &&
      artifact.promotion?.status !== "promoted" &&
      artifact.proposedPages.length > 0,
  ).length;
  const pendingOrQueued = archiveQueue.length + archiveReviewArtifacts.filter((artifact) => artifact.decision.status === "pending").length;
  const escalated = archiveReviewArtifacts.filter((artifact) => artifact.decision.status === "escalated").length;

  if (!latestLibrary) {
    return {
      kind: "import",
      title: "Connect your first knowledge folder.",
      description: "Choose a folder once. ResonantOS copies it into managed memory and starts preparing it for Augmentor.",
      buttonLabel: "Start Memory Import",
      humanWork: "none",
    };
  }

  if (!latestBuild) {
    return {
      kind: "build",
      title: "Let AI build the memory layer.",
      description: "The archive will queue sources, create review artifacts, verify safe summaries, and promote trusted pages where policy allows.",
      buttonLabel: "Build AI Memory",
      humanWork: "exception-only",
      manifestPath: latestLibrary.manifestPath,
    };
  }

  if (latestBuild.status === "attention") {
    return {
      kind: "repair",
      title: "AI Memory needs repair.",
      description: latestBuild.nextAction || "The last build found recoverable queue or provider issues. Let ResonantOS repair the build state.",
      buttonLabel: "Repair With AI",
      humanWork: "exception-only",
      manifestPath: latestBuild.manifestPath,
    };
  }

  if (latestBuild.status !== "complete" && latestBuild.status !== "needs-human-review") {
    return {
      kind: "continue",
      title: "AI is still building memory.",
      description: latestBuild.nextAction || "Continue the controlled AI Memory build from the saved job state.",
      buttonLabel: "Continue AI Build",
      humanWork: "exception-only",
      manifestPath: latestBuild.manifestPath,
    };
  }

  if (approvedUnpromoted > 0) {
    return {
      kind: "promote",
      title: "Trusted pages are ready.",
      description: `${approvedUnpromoted} approved artifact(s) can be written into the AI wiki now.`,
      buttonLabel: "Promote Approved",
      humanWork: "none",
    };
  }

  if (pendingOrQueued > 0) {
    return {
      kind: "maintenance",
      title: "Let AI continue curation.",
      description: `${pendingOrQueued} queued or pending item(s) can be processed by the archive service.`,
      buttonLabel: "Let AI Continue",
      humanWork: "none",
    };
  }

  if (escalated > 0) {
    return {
      kind: "review-exceptions",
      title: "Human judgment is needed only for exceptions.",
      description: `${escalated} artifact(s) were escalated because the system could not safely promote them automatically.`,
      buttonLabel: "Review Exceptions",
      humanWork: "required",
    };
  }

  return {
    kind: "complete",
    title: "Memory is ready.",
    description: "No queued work is waiting. You can ask Augmentor questions against trusted wiki memory.",
    buttonLabel: "Ask Augmentor",
    humanWork: "none",
  };
}
