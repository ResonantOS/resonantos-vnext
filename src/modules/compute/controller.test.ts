import { describe, expect, it } from "vitest";
import { buildDefaultState } from "../../core/defaults";
import type { ComputePassiveDiagnosticsResult } from "../../core/contracts";
import {
  applyComputePassiveDiagnostics,
  applyComputeSafeCommandResult,
  quarantineComputeNodeForReview,
  revokeComputeNodeTrust,
  submitLocalSafeCommandProbe,
} from "./controller";

const diagnostics: ComputePassiveDiagnosticsResult = {
  nodeId: "compute-desktop-local",
  os: "linux",
  arch: "amd64",
  family: "unix",
  executableSuffix: "",
  checkedAt: "2026-05-10T12:00:00.000Z",
  summary: "Passive local diagnostics detected linux/amd64.",
};

describe("applyComputePassiveDiagnostics", () => {
  it("updates local node probe facts and writes job/audit records", () => {
    const state = buildDefaultState([]);
    const result = applyComputePassiveDiagnostics(state, diagnostics);

    const localNode = result.state.computeFabric.nodes.find((node) => node.id === "compute-desktop-local");
    expect(result.validation.valid).toBe(true);
    expect(localNode?.probe).toMatchObject({
      os: "linux",
      arch: "amd64",
      checkedAt: "2026-05-10T12:00:00.000Z",
    });
    expect(localNode?.notes?.[0]).toBe("Passive local diagnostics detected linux/amd64.");
    expect(result.state.computeFabric.jobs).toHaveLength(1);
    expect(result.state.computeFabric.jobs[0]).toMatchObject({
      id: "compute-passive-diagnostics-compute-desktop-local",
      jobType: "passive-probe",
      status: "succeeded",
      networkPolicy: { mode: "none" },
    });
    expect(result.state.computeFabric.audit.map((record) => record.event)).toEqual(["submitted", "completed"]);
  });

  it("does not mutate state when the diagnostics target is not a valid compute node", () => {
    const state = buildDefaultState([]);
    const result = applyComputePassiveDiagnostics(state, {
      ...diagnostics,
      nodeId: "missing-node",
    });

    expect(result.validation.valid).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state.computeFabric.jobs).toHaveLength(0);
    expect(result.state.computeFabric.audit).toHaveLength(0);
  });
});

describe("compute node lifecycle actions", () => {
  it("quarantines and revokes a node through module actions", () => {
    const quarantined = quarantineComputeNodeForReview(
      buildDefaultState([]),
      "compute-desktop-local",
      "Manual review requested.",
      "2026-05-10T12:00:00.000Z",
    );
    const revoked = revokeComputeNodeTrust(
      quarantined.state,
      "compute-desktop-local",
      "User disabled trust.",
      "2026-05-10T12:05:00.000Z",
    );

    expect(quarantined.validation.valid).toBe(true);
    expect(revoked.validation.valid).toBe(true);
    expect(revoked.state.computeFabric.nodes.find((node) => node.id === "compute-desktop-local")).toMatchObject({
      enrollmentState: "revoked",
      healthState: "unavailable",
    });
    expect(revoked.state.computeFabric.audit.map((record) => record.event)).toEqual(["quarantined", "revoked"]);
  });
});

describe("applyComputeSafeCommandResult", () => {
  it("submits the closed local safe-command probe request", () => {
    const result = submitLocalSafeCommandProbe(buildDefaultState([]), "2026-05-10T12:01:00.000Z");

    expect(result.validation.valid).toBe(true);
    expect(result.request).toEqual({
      nodeId: "compute-desktop-local",
      jobId: "compute-local-safe-command-probe",
      command: ["uname", "-s", "-m", "-r"],
    });
    expect(result.state.computeFabric.jobs[0]).toMatchObject({
      id: "compute-local-safe-command-probe",
      jobType: "safe-command",
      targetNodeId: "compute-desktop-local",
      status: "queued",
      command: {
        command: ["uname", "-s", "-m", "-r"],
      },
    });
  });

  it("updates a matching job and records bounded command artifacts", () => {
    const state = applyComputePassiveDiagnostics(buildDefaultState([]), diagnostics).state;
    const updated = applyComputeSafeCommandResult(state, {
      nodeId: "compute-desktop-local",
      jobId: "compute-passive-diagnostics-compute-desktop-local",
      command: ["uname", "-m"],
      status: "succeeded",
      exitCode: 0,
      stdout: "arm64\n",
      stderr: "",
      startedAt: "2026-05-10T12:01:00.000Z",
      completedAt: "2026-05-10T12:01:01.000Z",
      summary: "Compute safe command `uname` succeeded.",
    });

    expect(updated.computeFabric.jobs[0].status).toBe("succeeded");
    expect(updated.computeFabric.artifacts).toEqual([
      expect.objectContaining({
        id: "compute-passive-diagnostics-compute-desktop-local-stdout",
        jobId: "compute-passive-diagnostics-compute-desktop-local",
        path: "compute/artifacts/compute-passive-diagnostics-compute-desktop-local/stdout.txt",
        sizeBytes: 6,
        sha256: "c1669e1d8edca98769c37d494b76442a1d6e5ffffd7b4da1fb63aef8ebaf6f01",
      }),
    ]);
    expect(updated.computeFabric.audit.at(-1)).toMatchObject({
      event: "completed",
      nodeId: "compute-desktop-local",
      metadata: {
        command: ["uname", "-m"],
        exitCode: 0,
        stdoutBytes: 6,
        stderrBytes: 0,
        artifactIds: ["compute-passive-diagnostics-compute-desktop-local-stdout"],
      },
    });
  });

  it("records stderr as a separate artifact when a command fails closed", () => {
    const submitted = submitLocalSafeCommandProbe(buildDefaultState([]), "2026-05-10T12:01:00.000Z").state;
    const updated = applyComputeSafeCommandResult(submitted, {
      nodeId: "compute-desktop-local",
      jobId: "compute-local-safe-command-probe",
      command: ["uname", "-s", "-m", "-r"],
      status: "failed",
      exitCode: null,
      stdout: "",
      stderr: "desktop shell only",
      startedAt: "2026-05-10T12:01:00.000Z",
      completedAt: "2026-05-10T12:01:01.000Z",
      summary: "Compute safe command probe failed before completion.",
    });

    expect(updated.computeFabric.jobs[0].status).toBe("failed");
    expect(updated.computeFabric.artifacts).toEqual([
      expect.objectContaining({
        id: "compute-local-safe-command-probe-stderr",
        path: "compute/artifacts/compute-local-safe-command-probe/stderr.txt",
        sizeBytes: 18,
        sha256: "bf244c741bfc1e7a8082321c91c8a222be24d26ffc963a1702acb704c929b6bc",
      }),
    ]);
    expect(updated.computeFabric.audit.at(-1)?.metadata).toMatchObject({
      artifactIds: ["compute-local-safe-command-probe-stderr"],
    });
  });
});
