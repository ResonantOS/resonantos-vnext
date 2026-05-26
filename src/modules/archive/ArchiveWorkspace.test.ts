import { describe, expect, it } from "vitest";
import type { ArchiveAiMemoryBuildJobSummary } from "../../core/contracts";
import { canContinueAiMemoryForCostPolicy, selectAutoContinuableAiMemoryJob } from "./archive-ai-memory-jobs";

const job = (overrides: Partial<ArchiveAiMemoryBuildJobSummary>): ArchiveAiMemoryBuildJobSummary => ({
  jobId: "resonant-os-base-unix-10",
  jobFile: "/tmp/review/jobs/resonant-os-base-unix-10.json",
  status: "running",
  libraryName: "RESONANT_OS_BASE",
  manifestPath: "/tmp/resonant-os-base-manifest.json",
  startedAt: "unix:10",
  finishedAt: "unix:12",
  recordsSeen: 1454,
  queuedThisRun: 6,
  processedThisRun: 6,
  promotedThisRun: 4,
  queueRemaining: 1448,
  reviewPending: 0,
  reviewApproved: 0,
  reviewEscalated: 0,
  reviewRejected: 0,
  errors: [],
  nextAction: "Continue the AI Memory build.",
  ...overrides,
});

describe("ArchiveWorkspace AI Memory auto-continuation policy", () => {
  it("selects safe running and ready-to-promote jobs", () => {
    expect(selectAutoContinuableAiMemoryJob([job({ status: "running" })], "local-and-subscription", "subscription")?.jobId).toBe(
      "resonant-os-base-unix-10",
    );
    expect(selectAutoContinuableAiMemoryJob([job({ status: "ready-to-promote" })], "local-and-subscription", "subscription")?.jobId).toBe(
      "resonant-os-base-unix-10",
    );
  });

  it("blocks jobs requiring human attention or missing continuation state", () => {
    expect(selectAutoContinuableAiMemoryJob([job({ status: "complete" })])).toBeUndefined();
    expect(selectAutoContinuableAiMemoryJob([job({ status: "needs-human-review", reviewEscalated: 1 })])).toBeUndefined();
    expect(
      selectAutoContinuableAiMemoryJob(
        [job({ status: "running", reviewEscalated: 1, queueRemaining: 20 })],
        "local-and-subscription",
        "subscription",
      )?.jobId,
    ).toBe("resonant-os-base-unix-10");
    expect(selectAutoContinuableAiMemoryJob([job({ status: "running", reviewEscalated: 1, queueRemaining: 0 })])).toBeUndefined();
    expect(selectAutoContinuableAiMemoryJob([job({ status: "attention", errors: ["provider failed"] })])).toBeUndefined();
    expect(selectAutoContinuableAiMemoryJob([job({ manifestPath: "" })])).toBeUndefined();
  });

  it("blocks unattended AI Memory continuation when provider cost policy does not allow it", () => {
    expect(canContinueAiMemoryForCostPolicy("off", "subscription")).toBe(false);
    expect(canContinueAiMemoryForCostPolicy("local-and-subscription", "subscription")).toBe(true);
    expect(canContinueAiMemoryForCostPolicy("local-and-subscription", "free-local")).toBe(true);
    expect(canContinueAiMemoryForCostPolicy("local-and-subscription", "paid-api")).toBe(false);
    expect(canContinueAiMemoryForCostPolicy("any-configured-route", "paid-api")).toBe(true);
    expect(selectAutoContinuableAiMemoryJob([job({ status: "running" })], "off", "subscription")).toBeUndefined();
    expect(selectAutoContinuableAiMemoryJob([job({ status: "running" })], "local-and-subscription", "paid-api")).toBeUndefined();
  });
});
