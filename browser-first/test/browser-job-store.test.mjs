import assert from "node:assert/strict";
import test from "node:test";

import {
  browserJobSchedulerState,
  createBrowserJobStore,
  isActiveBrowserJobStatus,
  isLockHoldingBrowserJobStatus,
  isTerminalBrowserJobStatus,
  normalizeBrowserJob,
  normalizePageLock,
  normalizePreflightDecision,
  staleBrowserJobEvidence
} from "../resonantos-side-panel-extension/src/lib/browser-job-store.js";

function createHarness(initial = {}) {
  const writes = [];
  const storage = {
    get: async () => initial,
    set: async (payload) => {
      writes.push(payload);
      Object.assign(initial, payload);
    }
  };
  let idIndex = 0;
  const store = createBrowserJobStore({
    storage,
    storageKeys: {
      activeBrowserJob: "active",
      browserJobs: "jobs",
      jobMonitorCollapsed: "collapsed"
    },
    maxJobs: 3,
    now: () => "2026-05-26T10:00:00.000Z",
    createId: () => `job-${++idIndex}`
  });
  return {
    store,
    writes
  };
}

test("browser job store normalizes job shape and status classes", () => {
  const job = normalizeBrowserJob({
    id: 42,
    goal: "x".repeat(400),
    status: "bad",
    planner: "p".repeat(200),
    summary: "s".repeat(800),
    artifacts: Array.from({ length: 25 }, (_, index) => ({ index })),
    steps: [{
      type: "click",
      text: "Continue",
      state: "completed",
      note: "clicked",
      details: {
        phase: "verified",
        observation: { title: "Example", url: "https://example.com" },
        decision: "Click the visible button.",
        action: "Click Continue",
        result: "clicked Continue",
        safetyClass: "safe",
        confidence: "high",
        uncertainty: "Repeated label on page.",
        nextHumanAction: "Review target if the click fails."
      },
      timing: {
        startedAt: "2026-05-26T09:59:59.000Z",
        startedAtMs: 1000,
        completedAt: "2026-05-26T10:00:00.000Z",
        completedAtMs: 1800,
        durationMs: 800
      },
      updatedAt: "2026-05-26T10:00:00.000Z"
    }],
    preflightDecision: {
      id: "control-abc",
      goal: "book a call",
      siteKey: "example.com",
      taskClass: "booking",
      mode: "trusted-safe-actions",
      permissionMode: "ask-before-action",
      decidedAt: "2026-05-26T09:59:00.000Z",
      source: "control-preflight",
      reason: "Human trusted safe actions."
    },
    pageLock: {
      type: "tab",
      tabId: 12,
      url: "https://example.com/booking",
      siteKey: "example.com",
      acquiredAt: "2026-05-26T09:59:30.000Z",
      reason: "Agent Control goal"
    },
    timing: {
      startedAt: "2026-05-26T09:59:00.000Z",
      startedAtMs: 1000,
      completedAt: "2026-05-26T10:00:00.000Z",
      completedAtMs: 3000,
      durationMs: 2000
    },
    lastError: "e"
  }, { now: () => "2026-05-26T10:00:00.000Z" });

  assert.equal(job.id, "42");
  assert.equal(job.goal.length, 300);
  assert.equal(job.status, "queued");
  assert.equal(job.planner.length, 120);
  assert.equal(job.summary.length, 700);
  assert.equal(job.artifacts.length, 20);
  assert.deepEqual(job.steps, [{
    type: "click",
    label: "Continue",
    state: "completed",
    note: "clicked",
    details: {
      phase: "verified",
      observation: { title: "Example", url: "https://example.com" },
      decision: "Click the visible button.",
      action: "Click Continue",
      result: "clicked Continue",
      safetyClass: "safe",
      confidence: "high",
      uncertainty: "Repeated label on page.",
      nextHumanAction: "Review target if the click fails."
    },
    timing: {
      startedAt: "2026-05-26T09:59:59.000Z",
      startedAtMs: 1000,
      completedAt: "2026-05-26T10:00:00.000Z",
      completedAtMs: 1800,
      durationMs: 800
    },
    updatedAt: "2026-05-26T10:00:00.000Z"
  }]);
  assert.deepEqual(job.timing, {
    startedAt: "2026-05-26T09:59:00.000Z",
    startedAtMs: 1000,
    completedAt: "2026-05-26T10:00:00.000Z",
    completedAtMs: 3000,
    durationMs: 2000
  });
  assert.deepEqual(job.preflightDecision, {
    id: "control-abc",
    goal: "book a call",
    siteKey: "example.com",
    taskClass: "booking",
    mode: "trusted-safe-actions",
    permissionMode: "ask-before-action",
    decidedAt: "2026-05-26T09:59:00.000Z",
    source: "control-preflight",
    reason: "Human trusted safe actions."
  });
  assert.deepEqual(job.pageLock, {
    type: "tab",
    tabId: 12,
    url: "https://example.com/booking",
    siteKey: "example.com",
    acquiredAt: "2026-05-26T09:59:30.000Z",
    reason: "Agent Control goal"
  });
  assert.equal(isActiveBrowserJobStatus("running"), true);
  assert.equal(isLockHoldingBrowserJobStatus("running"), true);
  assert.equal(isLockHoldingBrowserJobStatus("paused"), false);
  assert.equal(isTerminalBrowserJobStatus("cancelled"), true);
  assert.equal(isTerminalBrowserJobStatus("paused"), false);
});

test("browser job store normalizes page locks conservatively", () => {
  assert.equal(normalizePageLock(null), null);
  assert.equal(normalizePageLock({}), null);
  assert.deepEqual(normalizePageLock({
    type: "page",
    tabId: "42",
    url: "https://example.com/path",
    siteKey: "example.com",
    acquiredAt: "2026-05-26T09:59:30.000Z",
    reason: "r".repeat(240)
  }, { now: () => "2026-05-26T10:00:00.000Z" }), {
    type: "page",
    tabId: 42,
    url: "https://example.com/path",
    siteKey: "example.com",
    acquiredAt: "2026-05-26T09:59:30.000Z",
    reason: "r".repeat(180)
  });
});

test("browser job store normalizes preflight decisions conservatively", () => {
  assert.equal(normalizePreflightDecision(null), null);
  assert.deepEqual(normalizePreflightDecision({
    id: "x".repeat(200),
    goal: "g".repeat(400),
    siteKey: "s".repeat(200),
    taskClass: "t".repeat(120),
    mode: "unsafe",
    permissionMode: "trusted-for-safe-actions",
    decidedAt: "2026-05-26T09:59:00.000Z",
    source: "human",
    reason: "r".repeat(400)
  }), {
    id: "x".repeat(120),
    goal: "g".repeat(300),
    siteKey: "s".repeat(120),
    taskClass: "t".repeat(80),
    mode: "not-required",
    permissionMode: "trusted-for-safe-actions",
    decidedAt: "2026-05-26T09:59:00.000Z",
    source: "human",
    reason: "r".repeat(240)
  });
});

test("browser job store hydrates, compacts, and persists browser jobs", async () => {
  const harness = createHarness({
    collapsed: false,
    jobs: [
      { id: "old", goal: "old", status: "completed", updatedAt: "2026-05-25T10:00:00.000Z" },
      { id: "new", goal: "new", status: "running", updatedAt: "2026-05-26T10:00:00.000Z" },
      { id: "bad", goal: "bad", status: "bad", updatedAt: "2026-05-24T10:00:00.000Z" },
      { id: "drop", goal: "drop", updatedAt: "2026-05-23T10:00:00.000Z" }
    ]
  });

  await harness.store.hydrate();

  assert.equal(harness.store.getMonitorCollapsed(), false);
  assert.deepEqual(harness.store.getJobs().map((job) => job.id), ["new", "old", "bad"]);
  assert.equal(harness.store.findJob("new").status, "running");
  assert.equal(harness.store.findJob("bad").status, "queued");

  await harness.store.persist();

  assert.deepEqual(harness.writes.at(-1).jobs.map((job) => job.id), ["new", "old", "bad"]);
  assert.equal(harness.writes.at(-1).collapsed, false);
  assert.equal(harness.writes.at(-1).active, "new");
});

test("browser job store creates active jobs and finds by active, id, or goal", async () => {
  const harness = createHarness();

  const job = await harness.store.createJob({
    goal: "Find a booking slot",
    planner: "loop",
    summary: "summary",
    pageLock: {
      tabId: 7,
      url: "https://example.com/booking",
      siteKey: "example.com",
      reason: "booking task"
    },
    preflightDecision: {
      id: "control-1",
      goal: "Find a booking slot",
      siteKey: "example.com",
      taskClass: "booking",
      mode: "approved-once",
      permissionMode: "ask-before-action",
      decidedAt: "2026-05-26T09:59:00.000Z",
      source: "control-preflight",
      reason: "Approved once."
    }
  });

  assert.equal(job.id, "job-1");
  assert.equal(harness.store.getActiveJobId(), "job-1");
  assert.equal(harness.store.currentJob().id, "job-1");
  assert.equal(harness.store.findJob().id, "job-1");
  assert.equal(harness.store.findJob("booking").id, "job-1");
  assert.equal(harness.writes.at(-1).jobs[0].status, "running");
  assert.equal(harness.writes.at(-1).jobs[0].pageLock.tabId, 7);
  assert.equal(harness.writes.at(-1).jobs[0].pageLock.siteKey, "example.com");
  assert.equal(harness.writes.at(-1).jobs[0].preflightDecision.mode, "approved-once");
  assert.equal(harness.writes.at(-1).jobs[0].preflightDecision.taskClass, "booking");
  assert.equal(harness.writes.at(-1).active, "job-1");
});

test("browser job store blocks conflicting active page locks and releases them when paused or terminal", async () => {
  const harness = createHarness();

  const first = await harness.store.createJob({
    goal: "Book a call",
    pageLock: {
      tabId: 7,
      url: "https://example.com/booking",
      siteKey: "example.com",
      reason: "first task"
    }
  });

  assert.equal(harness.store.conflictingActiveJobForLock({
    tabId: 7,
    url: "https://example.com/other",
    siteKey: "other.example"
  })?.id, first.id);
  assert.equal(harness.store.conflictingActiveJobForLock({
    tabId: 8,
    url: "https://example.com/booking",
    siteKey: "example.com"
  })?.id, first.id);

  await assert.rejects(
    () => harness.store.createJob({
      goal: "Second same tab",
      pageLock: {
        tabId: 7,
        url: "https://example.com/booking",
        siteKey: "example.com"
      }
    }),
    /already controlled by job-1/
  );

  await harness.store.updateJob(first.id, { status: "paused" });
  assert.equal(harness.store.findJob(first.id).pageLock, null);

  const second = await harness.store.createJob({
    goal: "Second after pause",
    pageLock: {
      tabId: 7,
      url: "https://example.com/booking",
      siteKey: "example.com"
    }
  });
  assert.equal(second.id, "job-2");

  await harness.store.updateJob(second.id, { status: "completed" });
  assert.equal(harness.store.findJob(second.id).pageLock, null);
});

test("browser job scheduler identifies runnable, locked, and capacity-waiting queued jobs", () => {
  const state = browserJobSchedulerState([
    {
      id: "running-a",
      goal: "Use DAO page",
      status: "running",
      pageLock: { tabId: 1, siteKey: "dao.example", url: "https://dao.example/" }
    },
    {
      id: "approval-a",
      goal: "Review shop page",
      status: "approval",
      pageLock: { tabId: 2, siteKey: "shop.example", url: "https://shop.example/cart" }
    },
    {
      id: "queued-open",
      goal: "Read docs",
      status: "queued",
      pageLock: { tabId: 3, siteKey: "docs.example", url: "https://docs.example/" }
    },
    {
      id: "queued-locked",
      goal: "Click DAO vote",
      status: "queued",
      pageLock: { tabId: 4, siteKey: "dao.example", url: "https://dao.example/vote" }
    },
    {
      id: "queued-capacity",
      goal: "Research unrelated page",
      status: "queued",
      pageLock: { tabId: 5, siteKey: "research.example", url: "https://research.example/" }
    },
    { id: "paused-a", goal: "Paused", status: "paused" },
    { id: "done-a", goal: "Done", status: "completed" }
  ], { maxConcurrent: 3 });

  assert.equal(state.maxConcurrent, 3);
  assert.equal(state.activeSlots, 2);
  assert.equal(state.availableSlots, 1);
  assert.deepEqual(state.runnableQueued.map((job) => job.id), ["queued-open"]);
  assert.deepEqual(state.lockBlockedQueued.map((job) => [job.id, job.blockerId]), [["queued-locked", "running-a"]]);
  assert.deepEqual(state.capacityBlockedQueued.map((job) => job.id), ["queued-capacity"]);
  assert.equal(state.paused, 1);
  assert.equal(state.terminal, 1);
});

test("browser job store exposes scheduler state for monitor and command surfaces", async () => {
  const harness = createHarness({
    jobs: [
      { id: "running", goal: "Running", status: "running", pageLock: { tabId: 1, siteKey: "a.example" } },
      { id: "queued", goal: "Queued", status: "queued", pageLock: { tabId: 2, siteKey: "b.example" } }
    ]
  });

  await harness.store.hydrate();

  const state = harness.store.getSchedulerState({ maxConcurrent: 2 });
  assert.equal(state.running, 1);
  assert.deepEqual(state.runnableQueued.map((job) => job.id), ["queued"]);
});

test("browser job store detects stale running and approval jobs without mutating status", async () => {
  const stale = staleBrowserJobEvidence({
    id: "job-stale",
    goal: "Find a product",
    status: "running",
    updatedAt: "2026-05-26T09:40:00.000Z",
    steps: [{ type: "read", label: "Read page", state: "completed", updatedAt: "2026-05-26T09:41:00.000Z" }]
  }, {
    now: "2026-05-26T10:00:00.000Z",
    thresholdMs: 10 * 60 * 1000
  });

  assert.equal(stale.reason, "Running job has no recent recorded progress.");
  assert.equal(stale.lastActivityAt, "2026-05-26T09:41:00.000Z");
  assert.equal(stale.ageMs, 19 * 60 * 1000);
  assert.match(stale.nextHumanAction, /continue the job/);

  assert.equal(staleBrowserJobEvidence({
    id: "job-recent",
    goal: "Recent",
    status: "running",
    updatedAt: "2026-05-26T09:55:00.000Z"
  }, {
    now: "2026-05-26T10:00:00.000Z",
    thresholdMs: 10 * 60 * 1000
  }), null);

  assert.equal(staleBrowserJobEvidence({
    id: "job-completed",
    goal: "Completed",
    status: "completed",
    updatedAt: "2026-05-26T09:00:00.000Z"
  }, {
    now: "2026-05-26T10:00:00.000Z",
    thresholdMs: 10 * 60 * 1000
  }), null);

  const approval = staleBrowserJobEvidence({
    id: "job-approval",
    goal: "Approve click",
    status: "approval",
    updatedAt: "2026-05-26T09:00:00.000Z"
  }, {
    now: "2026-05-26T10:00:00.000Z",
    thresholdMs: 10 * 60 * 1000
  });
  assert.equal(approval.reason, "Approval has been waiting without recorded progress.");
  assert.match(approval.nextHumanAction, /approval card/);

  const harness = createHarness({
    jobs: [
      { id: "job-stale", goal: "stale", status: "running", updatedAt: "2026-05-26T09:40:00.000Z" },
      { id: "job-done", goal: "done", status: "completed", updatedAt: "2026-05-26T09:00:00.000Z" }
    ]
  });
  await harness.store.hydrate();

  const staleJobs = harness.store.getStaleJobs({ thresholdMs: 10 * 60 * 1000 });
  assert.equal(staleJobs.length, 1);
  assert.equal(staleJobs[0].job.id, "job-stale");
  assert.equal(harness.store.findJob("job-stale").status, "running");
});

test("browser job store updates terminal completion and monitor collapsed state", async () => {
  const harness = createHarness();
  const job = await harness.store.createJob({ goal: "Task" });

  const updated = await harness.store.updateJob(job.id, { status: "completed", artifacts: [{ type: "report", path: "/tmp/report.md" }] });

  assert.equal(updated.status, "completed");
  assert.equal(updated.completedAt, "2026-05-26T10:00:00.000Z");
  assert.deepEqual(updated.artifacts, [{ type: "report", path: "/tmp/report.md" }]);

  const withSteps = await harness.store.updateJob(job.id, {
    steps: [{ type: "read", label: "Read page", state: "completed", note: "saw result" }]
  });
  assert.deepEqual(withSteps.steps, [{ type: "read", label: "Read page", state: "completed", note: "saw result", details: {}, timing: {}, updatedAt: null }]);

  await harness.store.toggleMonitorCollapsed();
  assert.equal(harness.store.getMonitorCollapsed(), false);
  assert.equal(harness.writes.at(-1).collapsed, false);
});

test("browser job store persists active job and recovers interrupted jobs after reload", async () => {
  const harness = createHarness({
    active: "running-job",
    jobs: [
      { id: "running-job", goal: "recover me", status: "running", updatedAt: "2026-05-26T09:00:00.000Z" },
      { id: "done-job", goal: "done", status: "completed", updatedAt: "2026-05-26T08:00:00.000Z" }
    ]
  });

  await harness.store.hydrate();

  assert.equal(harness.store.getActiveJobId(), "running-job");

  const recovered = await harness.store.recoverInterruptedJobs();

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].status, "paused");
  assert.equal(recovered[0].lastError, "Recovered after browser host reload");
  assert.equal(harness.store.findJob("running-job").status, "paused");
  assert.equal(harness.writes.at(-1).active, "running-job");

  await harness.store.activateJob("done-job");
  assert.equal(harness.store.getActiveJobId(), "done-job");
  assert.equal(harness.writes.at(-1).active, "done-job");
});
