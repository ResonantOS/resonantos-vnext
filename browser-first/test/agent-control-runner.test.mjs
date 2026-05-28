import assert from "node:assert/strict";
import test from "node:test";

import { controlStepLabel } from "../resonantos-side-panel-extension/src/lib/agent-control-planner.js";
import {
  browserJobStepHistory,
  controlResultSummary,
  createAgentControlRunner
} from "../resonantos-side-panel-extension/src/lib/agent-control-runner.js";

function createHarness(overrides = {}) {
  const events = [];
  let activeJobId = "job-test";
  let controlRun = {
    id: activeJobId,
    goal: "test goal",
    planner: "observe-act-verify-loop",
    startedAt: "2026-05-26T00:00:00.000Z",
    summary: "test summary",
    artifacts: [],
    steps: []
  };
  let lastSnapshot = { title: "Fixture", url: "https://example.test/" };
  let pendingApproval = null;
  let decisionIndex = 0;
  const nextActionRequests = [];
  const decisions = overrides.decisions ?? [
    { status: "continue", thought: "click next", action: { type: "click", text: "Next" } },
    { status: "done", thought: "done", doneSummary: "Finished." }
  ];
  const stepResults = overrides.stepResults ?? [{ ok: true, clickedText: "Next" }];
  let stepResultIndex = 0;

  const deps = {
    addMessage: async (role, content) => events.push(["message", role, content]),
    appendControlStep: (step) => {
      controlRun.steps.push({ ...step, state: "pending" });
      return controlRun.steps.length - 1;
    },
    controlStepLabel,
    createBrowserJob: async ({ goal, planner, summary }) => {
      activeJobId = "job-created";
      controlRun = { ...controlRun, id: activeJobId, goal, planner, summary, steps: [], artifacts: [] };
      return { id: activeJobId, goal, planner, summary };
    },
    executeControlStep: async (step) => {
      events.push(["execute", step]);
      return stepResults[stepResultIndex++] ?? { ok: true };
    },
    finishControlRun: (status, artifact = null) => {
      controlRun = {
        ...controlRun,
        status,
        artifacts: artifact ? [...controlRun.artifacts, artifact] : controlRun.artifacts
      };
      events.push(["finish", status]);
    },
    getActiveJobId: () => activeJobId,
    getCurrentControlRun: () => controlRun,
    getLastSnapshot: () => lastSnapshot,
    observeControlPage: async () => {
      events.push(["observe"]);
      return lastSnapshot;
    },
    renderControlMonitor: () => events.push(["render"]),
    requestNextControlAction: async (request) => {
      nextActionRequests.push(request);
      return decisions[decisionIndex++] ?? { status: "done", doneSummary: "Finished." };
    },
    saveControlReportToArchive: async (_results, status) => ({ path: `/archive/${status}.md` }),
    setActivity: (phase, label, detail) => events.push(["activity", phase, label, detail]),
    setPageControlOverlay: async (active, label, phase) => events.push(["overlay", active, label, phase]),
    setPendingApproval: (approval) => {
      pendingApproval = approval;
      events.push(["pending", approval?.step?.type ?? null]);
    },
    setStatus: (status) => events.push(["status", status]),
    sleep: async () => undefined,
    startControlRun: ({ goal, plan }) => {
      controlRun = { ...controlRun, goal, planner: plan.source, summary: plan.summary, steps: [] };
      events.push(["start", goal]);
    },
    updateBrowserJob: async (jobId, patch) => events.push(["job", jobId, patch]),
    updateControlRunArtifacts: (artifacts) => {
      controlRun = { ...controlRun, artifacts };
      events.push(["artifacts", artifacts]);
    },
    updateControlStep: (index, state, note = "") => {
      controlRun.steps[index] = { ...controlRun.steps[index], state, note };
      events.push(["step", index, state, note]);
    }
  };

  return {
    events,
    getControlRun: () => controlRun,
    nextActionRequests,
    getPendingApproval: () => pendingApproval,
    runner: createAgentControlRunner(deps),
    setLastSnapshot: (snapshot) => {
      lastSnapshot = snapshot;
    }
  };
}

test("agent control runner completes an observe-act-verify loop", async () => {
  const harness = createHarness();

  const result = await harness.runner.continueControlLoop({ goal: "click next" });

  assert.equal(result.ok, true);
  assert.equal(harness.getControlRun().status, "completed");
  assert.deepEqual(harness.getControlRun().steps.map((step) => step.state), ["completed"]);
  assert.deepEqual(harness.getControlRun().steps.map((step) => step.note), ['clicked "Next"']);
  assert.deepEqual(
    harness.events.filter((event) => event[0] === "overlay").map((event) => event[3]),
    ["reading", "working", "clicking", "verifying", "reading", "working"]
  );
  assert.ok(harness.events.some((event) => event[0] === "message" && /Agent Control Mode completed/.test(event[2])));
});

test("agent control runner summarizes browser action results for the timeline", () => {
  assert.equal(controlResultSummary({ ok: true, clickedText: "Continue" }), 'clicked "Continue"');
  assert.equal(controlResultSummary({ ok: true, typedText: "pizza", submitted: true }), 'typed and submitted "pizza"');
  assert.equal(controlResultSummary({ ok: true, direction: "down" }), "scrolled down");
  assert.equal(controlResultSummary({ ok: false, approvalRequired: true, error: "Submit requires approval." }), "Submit requires approval.");
  assert.equal(controlResultSummary({ ok: false }), "action failed");
});

test("agent control runner converts persisted browser job steps into planner history", () => {
  const history = browserJobStepHistory({
    id: "job-old",
    goal: "find the booking slot",
    steps: [
      { type: "read", label: "Read booking page", state: "completed", note: "read page" },
      { type: "click", label: "Click next month", state: "failed", note: "button missing" }
    ]
  });

  assert.equal(history.length, 2);
  assert.deepEqual(history[0].action, { type: "read", label: "Read booking page" });
  assert.equal(history[0].result.ok, true);
  assert.equal(history[1].result.ok, false);
  assert.equal(history[1].result.error, "button missing");
});

test("agent control runner starts a control job and records the run shell", async () => {
  const harness = createHarness();

  await harness.runner.runControlCommand("find a booking slot");

  assert.equal(harness.getControlRun().id, "job-created");
  assert.equal(harness.getControlRun().planner, "observe-act-verify-loop");
  assert.ok(harness.events.some((event) => event[0] === "message" && /Agent Control Mode started/.test(event[2])));
});

test("agent control runner continues a previous job with seeded planner history", async () => {
  const harness = createHarness({
    decisions: [{ status: "done", thought: "done", doneSummary: "Already finished." }]
  });

  await harness.runner.runControlCommand("find a booking slot", {
    resumedFromJob: {
      id: "job-old",
      goal: "find a booking slot",
      steps: [{ type: "read", label: "Read booking page", state: "completed", note: "read page" }]
    }
  });

  assert.match(harness.getControlRun().summary, /Continuation of job-old/);
  assert.ok(harness.events.some((event) => event[0] === "message" && /Previous job: job-old/.test(event[2])));
  assert.equal(harness.nextActionRequests[0].history.length, 1);
  assert.equal(harness.nextActionRequests[0].history[0].action.label, "Read booking page");
});

test("agent control runner stores pending approval when a step requires human review", async () => {
  const harness = createHarness({
    decisions: [{ status: "continue", thought: "submit", action: { type: "click", text: "Submit" } }],
    stepResults: [{ ok: false, approvalRequired: true, error: "Public submit requires approval." }]
  });

  const result = await harness.runner.continueControlLoop({ goal: "submit form" });

  assert.equal(result.ok, false);
  assert.equal(result.approvalRequired, true);
  assert.equal(harness.getControlRun().status, "approval");
  assert.equal(harness.getPendingApproval().step.text, "Submit");
  assert.ok(harness.events.some((event) => event[0] === "pending" && event[1] === "click"));
});

test("agent control runner can approve or deny a pending step through injected state", async () => {
  const approvalHarness = createHarness({
    decisions: [{ status: "done", thought: "done", doneSummary: "Done after approval." }],
    stepResults: [{ ok: true, clickedText: "Submit" }]
  });
  const approval = {
    step: { type: "click", text: "Submit" },
    stepIndex: 0,
    results: [{ step: { type: "click", text: "Submit" }, result: { ok: false, approvalRequired: true } }],
    history: []
  };
  approvalHarness.getControlRun().steps.push({ type: "click", text: "Submit", state: "blocked" });

  await approvalHarness.runner.approvePendingControlStep(approval);

  assert.equal(approvalHarness.getControlRun().status, "completed");
  assert.equal(approvalHarness.getControlRun().steps[0].state, "completed");
  assert.equal(approvalHarness.getControlRun().steps[0].note, 'clicked "Submit"');

  const denyHarness = createHarness();
  denyHarness.getControlRun().steps.push({ type: "click", text: "Submit", state: "blocked" });
  await denyHarness.runner.denyPendingControlStep({ ...approval, results: [] });

  assert.equal(denyHarness.getControlRun().status, "denied");
  assert.equal(denyHarness.getControlRun().steps[0].state, "blocked");
});
