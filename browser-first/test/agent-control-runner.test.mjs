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
  const taskConsents = overrides.taskConsents ?? [];
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
    approvalBoundaryForStep: overrides.approvalBoundaryForStep ?? ((_step, reason = "") => /safe/i.test(reason) ? "safe" : /submit/i.test(reason) ? "public-submit" : "safe"),
    controlStepLabel,
    createBrowserJob: async ({ existingJob, goal, planner, summary }) => {
      activeJobId = existingJob?.id ?? "job-created";
      controlRun = { ...controlRun, id: activeJobId, goal, planner, summary, steps: [], artifacts: [] };
      return {
        id: activeJobId,
        goal,
        planner,
        summary,
        pageLock: { tabId: 12, siteKey: "example.test", url: "https://example.test/", reason: "Agent Control goal" }
      };
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
      controlRun = {
        ...controlRun,
        goal,
        planner: plan.source,
        summary: plan.summary,
        pageLock: plan.pageLock ?? null,
        artifacts: Array.isArray(plan.artifacts) ? plan.artifacts : [],
        steps: Array.isArray(plan.steps) ? plan.steps : []
      };
      events.push(["start", goal]);
    },
    taskConsentForStep: async () => taskConsents.shift() ?? null,
    updateBrowserJob: async (jobId, patch) => events.push(["job", jobId, patch]),
    updateControlRunArtifacts: (artifacts) => {
      controlRun = { ...controlRun, artifacts };
      events.push(["artifacts", artifacts]);
    },
    updateControlStep: (index, state, note = "", details = {}) => {
      controlRun.steps[index] = { ...controlRun.steps[index], state, note, details: { ...(controlRun.steps[index]?.details ?? {}), ...details } };
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
  assert.equal(harness.getControlRun().steps[0].details.confidence, "medium");
  assert.equal(harness.getControlRun().steps[0].details.safetyClass, "safe");
  assert.match(harness.getControlRun().steps[0].details.uncertainty, /No visible page-state change/);
  assert.equal(harness.nextActionRequests[1].history[0].result.verificationChanged, false);
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
  assert.equal(harness.getControlRun().pageLock.siteKey, "example.test");
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
      artifacts: [{ type: "archive-intake", path: "/old-report.md" }],
      steps: [{ type: "read", label: "Read booking page", state: "completed", note: "read page" }]
    }
  });

  assert.match(harness.getControlRun().summary, /Continuation of job-old/);
  assert.equal(harness.getControlRun().id, "job-old");
  assert.deepEqual(harness.getControlRun().steps.map((step) => step.state), ["completed"]);
  assert.deepEqual(harness.getControlRun().artifacts, [
    { type: "archive-intake", path: "/old-report.md" },
    { type: "archive-intake", path: "/archive/completed.md" }
  ]);
  assert.ok(harness.events.some((event) => event[0] === "message" && /Resumed same durable job: job-old/.test(event[2])));
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
  assert.equal(harness.getControlRun().steps[0].details.confidence, "low");
  assert.match(harness.getControlRun().steps[0].details.uncertainty, /Public submit requires approval/);
  assert.match(harness.getControlRun().steps[0].details.nextHumanAction, /approve once, deny, or delegate/);
  assert.ok(harness.events.some((event) => event[0] === "pending" && event[1] === "click"));
});

test("agent control runner uses scoped task consent only for safe approval retries", async () => {
  const harness = createHarness({
    decisions: [
      { status: "continue", thought: "click details", action: { type: "click", text: "Details" } },
      { status: "done", thought: "done", doneSummary: "Done after trusted safe action." }
    ],
    stepResults: [
      { ok: false, approvalRequired: true, error: "Safe action requires review." },
      { ok: true, clickedText: "Details" }
    ],
    taskConsents: [{ siteKey: "example.test", taskClass: "research" }]
  });

  const result = await harness.runner.continueControlLoop({ goal: "research fixture" });

  assert.equal(result.ok, true);
  assert.equal(harness.events.filter((event) => event[0] === "execute").length, 2);
  assert.equal(harness.events.find((event) => event[0] === "execute" && event[1].userApproved)?.[1].text, "Details");
  assert.equal(harness.getControlRun().steps[0].note, 'trusted task consent · clicked "Details"');
});

test("agent control runner blocks repeated no-change actions before re-executing them", async () => {
  const harness = createHarness({
    decisions: [
      { status: "continue", thought: "click next", action: { type: "click", text: "Next" } },
      { status: "continue", thought: "try next again", action: { type: "click", text: "Next" } }
    ],
    stepResults: [{ ok: true, clickedText: "Next" }]
  });

  const result = await harness.runner.continueControlLoop({ goal: "click next until it works" });

  assert.equal(result.ok, false);
  assert.equal(result.repeatNoChangePrevented, true);
  assert.equal(harness.getControlRun().status, "blocked");
  assert.equal(harness.events.filter((event) => event[0] === "execute").length, 1);
  assert.deepEqual(harness.getControlRun().steps.map((step) => step.state), ["completed", "blocked"]);
  assert.equal(harness.getControlRun().steps[1].note, "repeat no-change action prevented");
  assert.match(harness.getControlRun().steps[1].details.uncertainty, /repeated the same action/);
  assert.match(harness.getControlRun().steps[1].details.nextHumanAction, /more precise visible target/);
  assert.ok(harness.events.some((event) => event[0] === "message" && /repeated the same action/.test(event[2])));
});

test("agent control runner does not use task consent for public-submit approval", async () => {
  const harness = createHarness({
    decisions: [{ status: "continue", thought: "submit", action: { type: "click", text: "Submit" } }],
    stepResults: [{ ok: false, approvalRequired: true, error: "Clicking Submit looks like a submit/public action and requires human approval." }],
    taskConsents: [{ siteKey: "example.test", taskClass: "form-edit" }]
  });

  const result = await harness.runner.continueControlLoop({ goal: "fill this form" });

  assert.equal(result.ok, false);
  assert.equal(result.approvalRequired, true);
  assert.equal(harness.events.filter((event) => event[0] === "execute").length, 1);
  assert.equal(harness.getControlRun().status, "approval");
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
