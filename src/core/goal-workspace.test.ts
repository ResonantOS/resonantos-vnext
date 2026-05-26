import { describe, expect, it } from "vitest";
import { buildDefaultState } from "./defaults";
import {
  addGoalStepToState,
  addGoalWorkspace,
  archiveGoalWorkspace,
  attachGoalArtifact,
  attachGoalDelegation,
  attachGoalMemoryRef,
  buildGoalWorkspaceStatus,
  completeGoalWorkspace,
  createGoalArtifact,
  createGoalBlocker,
  createGoalDelegationRef,
  createGoalMemoryRef,
  createGoalStep,
  createGoalWorkspace,
  formatGoalWorkspaceStatus,
  markGoalBlocked,
  normalizeGoalWorkspaces,
  resolveGoalBlocker,
  resumeGoalWorkspace,
  updateGoalStepStatus,
} from "./goal-workspace";
import { normalizeState } from "./runtime";
import type { GoalWorkspace, ResonantShellState } from "./contracts";

const createdAt = "2026-05-24T10:00:00.000Z";

const createStateWithGoal = (): { state: ResonantShellState; goal: GoalWorkspace } => {
  const state = buildDefaultState([]);
  const goal = createGoalWorkspace({
    mission: "Build the persistent goal runtime for Augmentor objectives.",
    successCriteria: ["Goals persist", "Status reports active work"],
    constraints: ["Do not depend on command parser work"],
    allowedAgents: ["augmentor", "opencode"],
    allowedTools: ["delegation.create_packet"],
    createdAt,
  });
  return { state: addGoalWorkspace(state, goal), goal };
};

describe("Goal Workspace Runtime", () => {
  it("creates a durable goal workspace with default step and system memory reference", () => {
    const goal = createGoalWorkspace({
      mission: "Build the persistent goal runtime for Augmentor objectives.",
      createdAt,
    });

    expect(goal.id).toMatch(/^goal-build-the-persistent-goal-runtime-for-augmentor-objectiv/);
    expect(goal.id).toContain("20260524100000");
    expect(goal.phase).toBe("active");
    expect(goal.costPolicy.preferredCostTier).toBe("subscription");
    expect(goal.steps?.[0]).toMatchObject({
      label: "Clarify success criteria and execution boundaries.",
      status: "planned",
    });
    expect(goal.memoryRefs[0]).toMatchObject({
      ref: "system://resonantos-super-ai-app-plan",
      kind: "system-memory",
    });
    expect(typeof goal.memoryRefs[0]).toBe("object");
  });

  it("updates steps, artifacts, delegations, and memory refs immutably", () => {
    const { state, goal } = createStateWithGoal();
    const step = createGoalStep({
      label: "Implement the core lifecycle operations.",
      status: "active",
      createdAt: "2026-05-24T10:05:00.000Z",
    });
    const withStep = addGoalStepToState(state, goal.id, step);
    const completed = updateGoalStepStatus(withStep, goal.id, step.id, "completed", "2026-05-24T10:20:00.000Z");
    const withArtifact = attachGoalArtifact(
      completed,
      goal.id,
      createGoalArtifact({
        label: "Goal runtime test evidence",
        type: "verification-report",
        createdAt: "2026-05-24T10:22:00.000Z",
        path: "src/core/goal-workspace.test.ts",
      }),
    );
    const withDelegation = attachGoalDelegation(
      withArtifact,
      goal.id,
      createGoalDelegationRef({
        workspaceId: "workspace-opencode-goal-runtime",
        packetId: "delegation-opencode-goal-runtime",
        targetAgentId: "opencode.runtime",
        createdAt: "2026-05-24T10:23:00.000Z",
      }),
    );
    const withMemory = attachGoalMemoryRef(
      withDelegation,
      goal.id,
      createGoalMemoryRef({
        ref: "archive://concept/super-ai-app",
        label: "Super AI App concept",
        addedAt: "2026-05-24T10:24:00.000Z",
      }),
    );
    const updatedGoal = withMemory.goalWorkspaces.find((item) => item.id === goal.id);

    expect(state.goalWorkspaces[0].steps).toHaveLength(1);
    expect(updatedGoal?.steps?.find((item) => item.id === step.id)?.status).toBe("completed");
    expect(updatedGoal?.artifacts[0]).toMatchObject({ label: "Goal runtime test evidence" });
    expect(updatedGoal?.delegationRefs[0]).toMatchObject({ targetAgentId: "opencode.runtime" });
    expect(updatedGoal?.memoryRefs[0]).toMatchObject({ ref: "archive://concept/super-ai-app", kind: "living-archive" });
    expect(updatedGoal?.phase).toBe("delegated");
  });

  it("deduplicates goal state attachments by their durable identities", () => {
    const { state, goal } = createStateWithGoal();
    const sameGoalTwice = addGoalWorkspace(addGoalWorkspace(state, goal), goal);
    const memoryRef = createGoalMemoryRef({
      ref: "archive://concept/super-ai-app",
      addedAt: "2026-05-24T10:24:00.000Z",
    });
    const withMemoryTwice = attachGoalMemoryRef(attachGoalMemoryRef(sameGoalTwice, goal.id, memoryRef), goal.id, memoryRef);
    const step = createGoalStep({
      label: "Implement the core lifecycle operations.",
      createdAt: "2026-05-24T10:05:00.000Z",
    });
    const withStepTwice = addGoalStepToState(addGoalStepToState(withMemoryTwice, goal.id, step), goal.id, step);
    const normalized = withStepTwice.goalWorkspaces.find((item) => item.id === goal.id);

    expect(withStepTwice.goalWorkspaces.filter((item) => item.id === goal.id)).toHaveLength(1);
    expect(normalized?.memoryRefs.filter((item) => item.ref === memoryRef.ref)).toHaveLength(1);
    expect(normalized?.steps?.filter((item) => item.id === step.id)).toHaveLength(1);
  });

  it("formats goal status with completed versus total steps", () => {
    const { state, goal } = createStateWithGoal();
    const step = createGoalStep({
      label: "Implement the core lifecycle operations.",
      status: "active",
      createdAt: "2026-05-24T10:05:00.000Z",
    });
    const withStep = addGoalStepToState(state, goal.id, step);
    const completed = updateGoalStepStatus(withStep, goal.id, step.id, "completed", "2026-05-24T10:20:00.000Z");
    const status = buildGoalWorkspaceStatus(completed);
    const rendered = formatGoalWorkspaceStatus(status);

    expect(status.active[0]).toMatchObject({ completedSteps: 1, totalSteps: 2 });
    expect(rendered).toContain("1/2 steps complete");
  });

  it("blocks, resolves, resumes, completes, and archives goals", () => {
    const { state, goal } = createStateWithGoal();
    const blocked = markGoalBlocked(
      state,
      goal.id,
      createGoalBlocker({
        label: "Need human approval for paid model escalation.",
        severity: "high",
        createdAt: "2026-05-24T11:00:00.000Z",
      }),
    );
    const blockerId = blocked.goalWorkspaces[0].blockers[0].id;
    const resolved = resolveGoalBlocker(blocked, goal.id, blockerId, "2026-05-24T11:10:00.000Z", "human");
    const resumed = resumeGoalWorkspace(resolved, goal.id, "2026-05-24T11:11:00.000Z");
    const completed = completeGoalWorkspace(resumed, goal.id, "2026-05-24T12:00:00.000Z");
    const archived = archiveGoalWorkspace(completed, goal.id, "2026-05-24T12:30:00.000Z");

    expect(blocked.goalWorkspaces[0].phase).toBe("blocked");
    expect(resolved.goalWorkspaces[0].phase).toBe("active");
    expect(resumed.goalWorkspaces[0]).toMatchObject({ phase: "active", resumedAt: "2026-05-24T11:11:00.000Z" });
    expect(completed.goalWorkspaces[0]).toMatchObject({ phase: "completed", completedAt: "2026-05-24T12:00:00.000Z" });
    expect(archived.goalWorkspaces[0]).toMatchObject({ phase: "archived", archivedAt: "2026-05-24T12:30:00.000Z" });
  });

  it("normalizes persisted goals after a JSON round trip", () => {
    const { state, goal } = createStateWithGoal();
    const persisted = JSON.parse(JSON.stringify(state)) as ResonantShellState;
    const normalized = normalizeState(persisted, buildDefaultState([]));

    expect(normalized.goalWorkspaces.find((item) => item.id === goal.id)).toBeDefined();
    expect(normalized.goalWorkspaces[0].memoryRefs[0]).toMatchObject({
      ref: "system://resonantos-super-ai-app-plan",
      kind: "system-memory",
    });
  });

  it("migrates legacy string memory refs and missing step arrays", () => {
    const legacyGoal = {
      id: "goal-legacy",
      title: "Legacy goal",
      mission: "Keep an older goal usable after migration.",
      phase: "active",
      createdAt,
      updatedAt: createdAt,
      owningAgentId: "strategist.core",
      threadId: "thread-main-desktop",
      successCriteria: [],
      constraints: [],
      allowedAgents: [],
      allowedTools: [],
      memoryRefs: ["system://legacy-architecture"],
      costPolicy: {
        sensitivity: "medium",
        preferredCostTier: "subscription",
        allowPaidEscalation: false,
        rationale: "legacy",
      },
      artifacts: [],
      blockers: [],
      delegationRefs: [],
    } as unknown as GoalWorkspace;

    const [normalized] = normalizeGoalWorkspaces([legacyGoal]);

    expect(normalized.steps).toEqual([]);
    expect(normalized.successCriteria).toEqual(["Define concrete success criteria with the human."]);
    expect(normalized.allowedAgents).toEqual(["augmentor"]);
    expect(normalized.memoryRefs[0]).toMatchObject({ ref: "system://legacy-architecture", kind: "system-memory" });
  });

  it("restores required system memory when persisted goals are missing memory refs", () => {
    const legacyGoal = {
      id: "goal-missing-memory",
      title: "",
      mission: "Keep a partial persisted goal usable after schema migration.",
      phase: "active",
      createdAt,
      updatedAt: createdAt,
      owningAgentId: "strategist.core",
      threadId: "thread-main-desktop",
      successCriteria: [],
      constraints: [],
      allowedAgents: [],
      allowedTools: [],
      costPolicy: {
        sensitivity: "medium",
        preferredCostTier: "subscription",
        allowPaidEscalation: false,
        rationale: "legacy",
      },
      artifacts: [],
      blockers: [],
      delegationRefs: [],
    } as unknown as GoalWorkspace;

    const [normalized] = normalizeGoalWorkspaces([legacyGoal]);

    expect(normalized.title).toBe("Keep a partial persisted goal usable after schema migration.");
    expect(normalized.memoryRefs[0]).toMatchObject({
      ref: "system://resonantos-super-ai-app-plan",
      kind: "system-memory",
    });
  });

  it("surfaces goals in status buckets for /status and task monitors", () => {
    const { state, goal } = createStateWithGoal();
    const blocked = markGoalBlocked(
      state,
      goal.id,
      createGoalBlocker({
        label: "Waiting for user approval.",
        createdAt: "2026-05-24T11:00:00.000Z",
      }),
    );
    const status = buildGoalWorkspaceStatus(blocked);
    const rendered = formatGoalWorkspaceStatus(status);

    expect(status.total).toBe(1);
    expect(status.blocked[0]).toMatchObject({
      title: "Build the persistent goal runtime for Augmentor objectives.",
      openBlockers: 1,
    });
    expect(status.needsAttention).toHaveLength(1);
    expect(rendered).toContain("Goal workspace status");
    expect(rendered).toContain("Waiting for user approval");
  });
});
