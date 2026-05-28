import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrowserJobStore,
  isActiveBrowserJobStatus,
  isTerminalBrowserJobStatus,
  normalizeBrowserJob
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
        safetyClass: "safe"
      },
      updatedAt: "2026-05-26T10:00:00.000Z"
    }],
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
      safetyClass: "safe"
    },
    updatedAt: "2026-05-26T10:00:00.000Z"
  }]);
  assert.equal(isActiveBrowserJobStatus("running"), true);
  assert.equal(isTerminalBrowserJobStatus("cancelled"), true);
  assert.equal(isTerminalBrowserJobStatus("paused"), false);
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

  const job = await harness.store.createJob({ goal: "Find a booking slot", planner: "loop", summary: "summary" });

  assert.equal(job.id, "job-1");
  assert.equal(harness.store.getActiveJobId(), "job-1");
  assert.equal(harness.store.currentJob().id, "job-1");
  assert.equal(harness.store.findJob().id, "job-1");
  assert.equal(harness.store.findJob("booking").id, "job-1");
  assert.equal(harness.writes.at(-1).jobs[0].status, "running");
  assert.equal(harness.writes.at(-1).active, "job-1");
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
  assert.deepEqual(withSteps.steps, [{ type: "read", label: "Read page", state: "completed", note: "saw result", details: {}, updatedAt: null }]);

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
