import type {
  ArchiveAiMemoryAutomationCostPolicy,
  ArchiveAiMemoryBuildJobSummary,
  ProviderCostPosture,
} from "../../core/contracts";

export const canContinueAiMemoryForCostPolicy = (
  policy: ArchiveAiMemoryAutomationCostPolicy,
  costPosture: ProviderCostPosture | undefined,
): boolean => {
  if (policy === "off") {
    return false;
  }
  if (policy === "any-configured-route") {
    return true;
  }
  return costPosture === "free-local" || costPosture === "subscription" || costPosture === "emergency-only";
};

export const selectAutoContinuableAiMemoryJob = (
  jobs: ArchiveAiMemoryBuildJobSummary[],
  costPolicy: ArchiveAiMemoryAutomationCostPolicy = "local-and-subscription",
  costPosture?: ProviderCostPosture,
): ArchiveAiMemoryBuildJobSummary | undefined =>
  canContinueAiMemoryForCostPolicy(costPolicy, costPosture)
    ? jobs.find(
        (job) =>
          ["running", "ready-to-promote"].includes(job.status) &&
          job.errors.length === 0 &&
          (job.reviewEscalated === 0 || job.queueRemaining > 0) &&
          job.manifestPath.trim(),
      )
    : undefined;
