import assert from "node:assert/strict";
import test from "node:test";

import { createControlRunState } from "../resonantos-side-panel-extension/src/lib/control-run-state.js";

function createHarness(overrides = {}) {
  const events = [];
  let activeJobId = overrides.activeJobId ?? "job-a";
  let currentControlRun = overrides.currentControlRun ?? null;
  let pendingApproval = { step: { type: "click", text: "Submit" } };
  let nowValue = overrides.nowMs ?? 1_000;
  const timers = [];
  const state = createControlRunState({
    browserJobStore: {
      getActiveJobId: () => activeJobId
    },
    getCurrentControlRun: () => currentControlRun,
    minimumOverlayMs: overrides.minimumOverlayMs,
    nowMs: () => nowValue,
    renderControlMonitor: () => events.push(["render"]),
    setCurrentControlRun: (run) => {
      currentControlRun = run;
      events.push(["run", run?.status ?? null]);
    },
    setPageControlOverlay: async (active, label, phase) => events.push(["overlay", active, label, phase]),
    setPendingApproval: (approval) => {
      pendingApproval = approval;
      events.push(["pending", approval]);
    },
    setTimeoutFn: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    updateBrowserJob: async (id, patch) => events.push(["job", id, patch])
  });
  return {
    events,
    getCurrentControlRun: () => currentControlRun,
    getPendingApproval: () => pendingApproval,
    runTimers: () => {
      const pending = timers.splice(0);
      pending.forEach((timer) => timer.callback());
      return pending;
    },
    setActiveJobId: (id) => {
      activeJobId = id;
    },
    setNowMs: (value) => {
      nowValue = value;
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
  assert.ok(harness.events.some((event) => event[0] === "overlay" && event[1] === true && /find booking/.test(event[2]) && event[3] === "working"));
});

test("control run state preserves resumed job steps and artifacts", () => {
  const harness = createHarness({ activeJobId: "job-resume" });

  const run = harness.state.startControlRun({
    goal: "resume booking",
    plan: {
      source: "planner",
      summary: "continue same durable job",
      artifacts: [{ type: "archive-intake", path: "/old.md" }],
      steps: [{ type: "read", label: "Read page", state: "completed", note: "already read" }]
    }
  });

  assert.equal(run.id, "job-resume");
  assert.equal(run.steps[0].state, "completed");
  assert.equal(run.steps[0].note, "already read");
  assert.deepEqual(run.artifacts, [{ type: "archive-intake", path: "/old.md" }]);
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
    minimumOverlayMs: 0,
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
  assert.ok(harness.events.some((event) => event[0] === "overlay" && event[1] === false && event[3] === "returning"));
  assert.ok(harness.events.some((event) =>
    event[0] === "job" &&
    event[1] === "job-a" &&
    event[2].status === "completed" &&
    event[2].planner === "planner"
  ));
});

test("control run state keeps short runs visibly active before clearing overlay", async () => {
  const harness = createHarness({ minimumOverlayMs: 900, nowMs: 1_000 });

  harness.state.startControlRun({
    goal: "quick read",
    plan: {
      source: "planner",
      summary: "short task",
      steps: [{ type: "read" }]
    }
  });
  harness.setNowMs(1_100);
  harness.state.finishControlRun("completed");

  assert.equal(harness.events.filter((event) => event[0] === "overlay" && event[1] === false).length, 0);
  const timers = harness.runTimers();
  assert.equal(timers[0].delay, 800);
  assert.ok(harness.events.some((event) => event[0] === "overlay" && event[1] === false && event[3] === "returning"));
});

test("control run state does not let an old delayed overlay release hide a newer run", async () => {
  const harness = createHarness({ minimumOverlayMs: 900, nowMs: 1_000 });

  harness.state.startControlRun({
    goal: "first task",
    plan: { source: "planner", summary: "first", steps: [] }
  });
  harness.setNowMs(1_100);
  harness.state.finishControlRun("completed");
  harness.setActiveJobId("job-b");
  harness.state.startControlRun({
    goal: "second task",
    plan: { source: "planner", summary: "second", steps: [] }
  });
  harness.runTimers();

  assert.equal(harness.events.filter((event) => event[0] === "overlay" && event[1] === false).length, 0);
  assert.ok(harness.events.some((event) => event[0] === "overlay" && event[1] === true && /second task/.test(event[2])));
});
