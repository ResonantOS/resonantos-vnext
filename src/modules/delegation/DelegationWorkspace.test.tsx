// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildDefaultState } from "../../core/defaults";
import { createGoalWorkspace } from "../../core/goal-workspace";
import { DelegationWorkspace } from "./DelegationWorkspace";

vi.mock("../../core/runtime", () => ({
  requestExecuteOpenCodeTask: vi.fn(),
  requestFinishTaskWorkspace: vi.fn(),
  requestHermesChatCompletion: vi.fn(),
  requestListTaskWorkspaces: vi.fn(async () => []),
  requestReadTaskWorkspace: vi.fn(),
}));

describe("DelegationWorkspace task monitor", () => {
  it("renders durable goal status alongside delegation workspaces", () => {
    const state = buildDefaultState([]);
    const goal = createGoalWorkspace({
      mission: "Build the governed browser execution layer",
      threadId: "thread-main-desktop",
      successCriteria: ["Browser commands execute through typed host commands"],
      createdAt: "2026-05-24T12:00:00.000Z",
    });

    render(
      <DelegationWorkspace
        state={{ ...state, goalWorkspaces: [goal] }}
        chatBusy={false}
        onStartWorkspace={vi.fn()}
        onAskAugmentor={vi.fn()}
      />,
    );

    expect(screen.getByText("Task Monitor")).toBeTruthy();
    expect(screen.getByText("Active goals")).toBeTruthy();
    expect(screen.getAllByText("Build the governed browser execution layer").length).toBeGreaterThan(0);
    expect(screen.getByText("0/1 steps")).toBeTruthy();
  });
});
