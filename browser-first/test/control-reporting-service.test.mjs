import assert from "node:assert/strict";
import test from "node:test";

import { controlStepLabel } from "../resonantos-side-panel-extension/src/lib/agent-control-planner.js";
import { createControlReportingService } from "../resonantos-side-panel-extension/src/lib/control-reporting-service.js";

function createHarness(overrides = {}) {
  const events = [];
  let currentControlRun = Object.hasOwn(overrides, "currentControlRun") ? overrides.currentControlRun : {
    id: "job-1",
    goal: "find a booking slot",
    planner: "observe-act-verify-loop",
    startedAt: "2026-05-26T10:00:00.000Z",
    summary: "Observe and act"
  };
  let lastSnapshot = overrides.lastSnapshot ?? {
    title: "Booking",
    url: "https://manoloremiddi.com/booking"
  };
  let pendingApproval = overrides.pendingApproval ?? {
    step: { type: "click", text: "Submit" },
    reason: "Public submit requires approval."
  };
  const service = createControlReportingService({
    addMessage: async (role, content) => events.push(["message", role, content]),
    bridgeRequest: async (path, request) => {
      events.push(["bridge", path, request.body]);
      if (overrides.bridgeError) throw new Error(overrides.bridgeError);
      if (path === "/archive/intake") return { path: "/archive/browser-report.md" };
      if (path === "/addons/delegate") return { target: "engineer", id: "delegation-1" };
      throw new Error(`Unexpected bridge path ${path}`);
    },
    controlStepLabel,
    getCurrentControlRun: () => currentControlRun,
    getLastSnapshot: () => lastSnapshot,
    getPendingApproval: () => pendingApproval
  });
  return {
    events,
    service,
    setCurrentControlRun: (run) => {
      currentControlRun = run;
    },
    setLastSnapshot: (snapshot) => {
      lastSnapshot = snapshot;
    },
    setPendingApproval: (approval) => {
      pendingApproval = approval;
    }
  };
}

test("control reporting service builds browser control reports with boundaries", () => {
  const harness = createHarness();

  const report = harness.service.buildControlReport([
    { step: { type: "click", text: "Continue" }, result: { ok: true } },
    { step: { type: "click", text: "Submit" }, result: { ok: false, approvalRequired: true, error: "approval needed" } }
  ], "approval-required");

  assert.match(report, /# Browser Agent Control Report/);
  assert.match(report, /find a booking slot/);
  assert.match(report, /Click "Continue" — ok/);
  assert.match(report, /Click "Submit" — approval-required — approval needed/);
  assert.match(report, /Wallet, credential, public-submit, payment, and destructive actions/);
});

test("control reporting service saves reports to archive intake", async () => {
  const harness = createHarness();

  const result = await harness.service.saveControlReportToArchive([
    { step: { type: "read" }, result: { ok: true } }
  ], "completed");

  assert.deepEqual(result, { path: "/archive/browser-report.md" });
  const bridgeCall = harness.events.find((event) => event[0] === "bridge");
  assert.equal(bridgeCall[1], "/archive/intake");
  assert.equal(bridgeCall[2].sourceMessageId, "job-1");
  assert.equal(bridgeCall[2].url, "https://manoloremiddi.com/booking");
  assert.match(bridgeCall[2].title, /Browser control completed/);
  assert.match(bridgeCall[2].content, /Read active page — ok/);
});

test("control reporting service builds and saves durable browser job reports", async () => {
  const harness = createHarness();
  const job = {
    id: "job-2",
    goal: "compare a product",
    status: "completed",
    planner: "observe-act-verify-loop",
    createdAt: "2026-05-26T09:00:00.000Z",
    updatedAt: "2026-05-26T09:02:00.000Z",
    summary: "Observed and compared",
    steps: [
      { label: "Read page", state: "completed", note: "read product page" },
      { label: "Click details", state: "completed", note: "clicked details" }
    ],
    artifacts: [{ type: "archive-intake", path: "/archive/existing.md" }]
  };

  const report = harness.service.buildBrowserJobReport(job);
  assert.match(report, /# Browser Job Report/);
  assert.match(report, /compare a product/);
  assert.match(report, /Read page — completed — read product page/);
  assert.match(report, /archive-intake: \/archive\/existing\.md/);

  const result = await harness.service.saveBrowserJobReportToArchive(job);
  assert.deepEqual(result, { path: "/archive/browser-report.md" });
  const bridgeCall = harness.events.find((event) => event[0] === "bridge");
  assert.equal(bridgeCall[1], "/archive/intake");
  assert.equal(bridgeCall[2].sourceMessageId, "job-2");
  assert.match(bridgeCall[2].title, /Browser job completed/);
  assert.match(bridgeCall[2].content, /# Browser Job Report/);
});

test("control reporting service returns null when no run exists", async () => {
  const harness = createHarness({ currentControlRun: null });

  assert.equal(harness.service.buildControlReport([], "completed"), "");
  assert.equal(await harness.service.saveControlReportToArchive([], "completed"), null);
});

test("control reporting service delegates blocked control issues to Engineer", async () => {
  const harness = createHarness();

  await harness.service.delegateControlIssue();

  const bridgeCall = harness.events.find((event) => event[0] === "bridge");
  assert.equal(bridgeCall[1], "/addons/delegate");
  assert.equal(bridgeCall[2].target, "engineer");
  assert.match(bridgeCall[2].mission, /find a booking slot/);
  assert.match(bridgeCall[2].mission, /Blocked step: Click "Submit"/);
  assert.ok(harness.events.some((event) => event[0] === "message" && /Delegated blocked control task/.test(event[2])));
});

test("control reporting service reports delegation failures", async () => {
  const harness = createHarness({ bridgeError: "delegate down" });

  await harness.service.delegateControlIssue();

  assert.ok(harness.events.some((event) => event[0] === "message" && /Delegation failed: delegate down/.test(event[2])));
});
