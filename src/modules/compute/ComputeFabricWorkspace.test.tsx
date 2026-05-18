// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDefaultState } from "../../core/defaults";
import { ComputeFabricWorkspace } from "./ComputeFabricWorkspace";
import { applyComputeSafeCommandResult, submitLocalSafeCommandProbe } from "./controller";

describe("ComputeFabricWorkspace", () => {
  afterEach(() => cleanup());

  const renderWorkspace = (overrides: Partial<ComponentProps<typeof ComputeFabricWorkspace>> = {}) =>
    render(
      <ComputeFabricWorkspace
        state={buildDefaultState([])}
        onRefreshLocalDiagnostics={async () => undefined}
        onRunLocalCommandProbe={async () => undefined}
        onQuarantineNode={() => undefined}
        onRevokeNode={() => undefined}
        {...overrides}
      />,
    );

  it("renders default compute nodes without enabling execution", () => {
    renderWorkspace();

    expect(screen.getByTestId("compute-fabric-workspace")).toBeTruthy();
    expect(screen.getByText("Runner registry and policy surface")).toBeTruthy();
    expect(screen.getByText("Desktop Local Host")).toBeTruthy();
    expect(screen.getByText("GX10 Inference Server")).toBeTruthy();
    expect(screen.getByText("ssh://rlab@gx10-23bd.local")).toBeTruthy();
    expect(screen.getByText("model-host")).toBeTruthy();
    expect(screen.getByText("No compute jobs yet.")).toBeTruthy();
    expect(screen.getByText("No artifacts recorded yet.")).toBeTruthy();
  });

  it("requests passive local diagnostics from the explicit action", async () => {
    const onRefreshLocalDiagnostics = vi.fn(async () => undefined);
    renderWorkspace({ onRefreshLocalDiagnostics });

    fireEvent.click(screen.getByRole("button", { name: "Refresh Local Facts" }));

    await waitFor(() => expect(onRefreshLocalDiagnostics).toHaveBeenCalledTimes(1));
  });

  it("runs the closed local command probe from the explicit action", async () => {
    const onRunLocalCommandProbe = vi.fn(async () => undefined);
    renderWorkspace({ onRunLocalCommandProbe });

    fireEvent.click(screen.getByRole("button", { name: "Run Local Command Probe" }));

    await waitFor(() => expect(onRunLocalCommandProbe).toHaveBeenCalledTimes(1));
  });

  it("exposes node lifecycle actions for enrolled nodes", () => {
    const onQuarantineNode = vi.fn();
    const onRevokeNode = vi.fn();
    renderWorkspace({ onQuarantineNode, onRevokeNode });

    fireEvent.click(screen.getAllByRole("button", { name: "Quarantine" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke Trust" })[0]);

    expect(onQuarantineNode).toHaveBeenCalledWith("compute-desktop-local");
    expect(onRevokeNode).toHaveBeenCalledWith("compute-desktop-local");
    expect(screen.getAllByRole("button", { name: "Quarantine" }).length).toBeGreaterThanOrEqual(2);
  });

  it("renders recorded command artifacts", () => {
    const submitted = submitLocalSafeCommandProbe(buildDefaultState([]), "2026-05-10T12:01:00.000Z").state;
    const state = applyComputeSafeCommandResult(submitted, {
      nodeId: "compute-desktop-local",
      jobId: "compute-local-safe-command-probe",
      command: ["uname", "-s", "-m", "-r"],
      status: "succeeded",
      exitCode: 0,
      stdout: "Darwin arm64 25.0.0\n",
      stderr: "",
      startedAt: "2026-05-10T12:01:00.000Z",
      completedAt: "2026-05-10T12:01:01.000Z",
      summary: "Compute safe command `uname` succeeded.",
    });

    renderWorkspace({ state });

    expect(screen.getByText("Artifact Ledger")).toBeTruthy();
    expect(screen.getByText("compute/artifacts/compute-local-safe-command-probe/stdout.txt")).toBeTruthy();
    expect(screen.getByText("20 bytes")).toBeTruthy();
  });
});
