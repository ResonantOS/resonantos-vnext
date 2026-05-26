import assert from "node:assert/strict";
import test from "node:test";

import { createControlRunState } from "../resonantos-side-panel-extension/src/lib/control-run-state.js";

function createHarness(overrides = {}) {
  const events = [];
  let activeJobId = overrides.activeJobId ?? "job-a";
  let currentControlRun = overrides.currentControlRun ?? null;
  let pendingApproval = { step: { type: "click", text: "Submit" } };
  const state = createControlRunState({
    browserJobStore: {
      getActiveJobId: () => activeJobId
    },
    getCurrentControlRun: () => currentControlRun,
    renderControlMonitor: () => events.push(["render"]),
    setCurrentControlRun: (run) => {
      currentControlRun = run;
      events.push(["run", run?.status ?? null]);
    },
    setPageControlOverlay: async (active, label) => events.push(["overlay", active, label]),
    setPendingApproval: (approval) => {
      pendingApproval = approval;
      events.push(["pending", approval]);
    },
    updateBrowserJob: async (id, patch) => events.push(["job", id, patch])
  });
  return {
    events,
    getCurrentControlRun: () => currentControlRun,
    getPendingApproval: () => pendingApproval,
    setActiveJobId: (id) => {
      activeJobId = id;
    },
    state
  };
}

test("control run state starts a run with active job id and overlay", () => {
  const harness = createHarness();

  const run = harness.state.startControlRun({
    goal: "find booking",
    plan: {
      source: "planner",
      summary: "read and click",
      steps: [{ type: "read" }, { type: "click", text: "Book" }]
    }
  });

  assert.equal(run.id, "job-a");
  assert.equal(harness.getPendingApproval(), null);
  assert.deepEqual(harness.getCurrentControlRun().steps.map((step) => step.state), ["pending", "pending"]);
  assert.ok(harness.events.some((event) => event[0] === "render"));
  assert.ok(harness.events.some((event) => event[0] === "overlay" && event[1] === true && /find booking/.test(event[2])));
});

test("control run state appends and updates steps immutably", () => {
  const harness = createHarness({
    currentControlRun: {
      id: "job-a",
      steps: [{ type: "read", state: "pending" }],
      artifacts: []
    }
  });

  const index = harness.state.appendControlStep({ type: "click", text: "Next" });
  harness.state.updateControlStep(1, "active", "Clicking");

  assert.equal(index, 1);
  assert.equal(harness.getCurrentControlRun().steps.length, 2);
  assert.equal(harness.getCurrentControlRun().steps[1].state, "active");
  assert.equal(harness.getCurrentControlRun().steps[1].note, "Clicking");
});

test("control run state ignores step updates when no run or index exists", () => {
  const harness = createHarness();

  assert.equal(harness.state.appendControlStep({ type: "read" }), -1);
  harness.state.updateControlStep(0, "active");

  assert.equal(harness.getCurrentControlRun(), null);
});

test("control run state updates artifacts without finishing", () => {
  const harness = createHarness({
    currentControlRun: {
      id: "job-a",
      steps: [],
      artifacts: []
    }
  });

  harness.state.updateControlRunArtifacts([{ type: "archive-intake", path: "/archive.md" }]);

  assert.deepEqual(harness.getCurrentControlRun().artifacts, [{ type: "archive-intake", path: "/archive.md" }]);
});

test("control run state finishes run, clears overlay, and syncs browser job", async () => {
  const harness = createHarness({
    currentControlRun: {
      id: "job-a",
      planner: "planner",
      summary: "summary",
      steps: [],
      artifacts: [{ type: "existing", path: "/old.md" }]
    }
  });

  harness.state.finishControlRun("completed", { type: "archive-intake", path: "/new.md" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.getCurrentControlRun().status, "completed");
  assert.ok(harness.getCurrentControlRun().completedAt);
  assert.deepEqual(harness.getCurrentControlRun().artifacts.map((artifact) => artifact.path), ["/old.md", "/new.md"]);
  assert.ok(harness.events.some((event) => event[0] === "overlay" && event[1] === false));
  assert.ok(harness.events.some((event) =>
    event[0] === "job" &&
    event[1] === "job-a" &&
    event[2].status === "completed" &&
    event[2].planner === "planner"
  ));
});
