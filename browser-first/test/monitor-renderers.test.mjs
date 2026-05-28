import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  controlActionStateLabel,
  controlRunProgress,
  createMonitorRenderers,
  sitePermissionDescription
} from "../resonantos-side-panel-extension/src/lib/monitor-renderers.js";

function createHarness(overrides = {}) {
  const dom = new JSDOM(`
    <section id="site" hidden>
      <strong id="host"></strong>
      <select id="mode">
        <option value="ask-before-action"></option>
        <option value="read-only"></option>
        <option value="trusted-for-safe-actions"></option>
        <option value="blocked"></option>
      </select>
      <p id="note"></p>
    </section>
    <section id="jobs" hidden>
      <strong id="jobs-title"></strong>
      <button id="jobs-toggle"></button>
      <ul id="jobs-list"></ul>
    </section>
    <section id="consents" hidden>
      <strong id="consents-title"></strong>
      <ol id="consents-list"></ol>
    </section>
    <section id="control" hidden>
      <strong id="control-title"></strong>
      <span id="control-status"></span>
      <button id="control-stop"></button>
      <div id="control-current"><small></small><strong></strong></div>
      <ol id="control-steps"></ol>
      <div id="control-artifacts"></div>
    </section>
    <section id="approval" hidden>
      <strong id="approval-title"></strong>
      <p id="approval-reason"></p>
      <button id="approval-approve"></button>
      <button id="approval-trust"></button>
    </section>
  `);
  globalThis.document = dom.window.document;
  const calls = [];
  const state = {
    browserJobs: overrides.browserJobs ?? [],
    contextDockExpanded: overrides.contextDockExpanded ?? true,
    currentControlRun: overrides.currentControlRun ?? null,
    jobMonitorCollapsed: overrides.jobMonitorCollapsed ?? true,
    pendingApproval: overrides.pendingApproval ?? null,
    tab: overrides.tab ?? { url: "https://example.com/page" },
    continued: [],
    reported: [],
    revoked: []
  };
  const renderers = createMonitorRenderers({
    activeTab: async () => state.tab,
    approvalBoundaryForStep: (step) => step.boundary ?? "safe",
    controlStepLabel: (step) => step.label ?? step.type,
    elements: {
      approvalApproveButton: dom.window.document.querySelector("#approval-approve"),
      approvalCard: dom.window.document.querySelector("#approval"),
      approvalReason: dom.window.document.querySelector("#approval-reason"),
      approvalTitle: dom.window.document.querySelector("#approval-title"),
      approvalTrustSiteButton: dom.window.document.querySelector("#approval-trust"),
      controlArtifacts: dom.window.document.querySelector("#control-artifacts"),
      controlCurrentAction: dom.window.document.querySelector("#control-current"),
      controlMonitor: dom.window.document.querySelector("#control"),
      controlMonitorStatus: dom.window.document.querySelector("#control-status"),
      controlMonitorTitle: dom.window.document.querySelector("#control-title"),
      controlStopButton: dom.window.document.querySelector("#control-stop"),
      controlStepList: dom.window.document.querySelector("#control-steps"),
      jobList: dom.window.document.querySelector("#jobs-list"),
      jobMonitor: dom.window.document.querySelector("#jobs"),
      jobMonitorTitle: dom.window.document.querySelector("#jobs-title"),
      jobMonitorToggle: dom.window.document.querySelector("#jobs-toggle"),
      sitePermissionHost: dom.window.document.querySelector("#host"),
      sitePermissionMode: dom.window.document.querySelector("#mode"),
      sitePermissionNote: dom.window.document.querySelector("#note"),
      sitePermissionPanel: dom.window.document.querySelector("#site"),
      taskConsentList: dom.window.document.querySelector("#consents-list"),
      taskConsentPanel: dom.window.document.querySelector("#consents"),
      taskConsentTitle: dom.window.document.querySelector("#consents-title")
    },
    getBrowserJobs: () => state.browserJobs,
    getContextDockExpanded: () => state.contextDockExpanded,
    getCurrentControlRun: () => state.currentControlRun,
    getJobMonitorCollapsed: () => state.jobMonitorCollapsed,
    getPendingApproval: () => state.pendingApproval,
    getTaskConsents: async () => overrides.taskConsents ?? {},
    isReadableBrowserTab: (tab) => /^https?:\/\//i.test(tab?.url ?? ""),
    onContinueBrowserJob: (job) => state.continued.push(job.id),
    onSaveBrowserJobReport: (job) => state.reported.push(job.id),
    onRevokeTaskConsent: (consent) => state.revoked.push(consent.taskClass),
    permissionForUrl: async () => overrides.permission ?? "trusted-for-safe-actions",
    siteKeyForUrl: (url) => new URL(url).hostname.replace(/^www\./, ""),
    updateContextDockVisibility: () => calls.push("dock")
  });

  return {
    calls,
    dom,
    renderers,
    state
  };
}

test("monitor renderers describe site permission modes", () => {
  assert.equal(sitePermissionDescription("blocked"), "Augmentor cannot read or operate this site.");
  assert.equal(sitePermissionDescription("read-only"), "Augmentor can read context but cannot click, type, or scroll.");
  assert.match(sitePermissionDescription("trusted-for-safe-actions"), /Safe actions can run/);
  assert.match(sitePermissionDescription("ask-before-action"), /asks before risky actions/);
});

test("monitor renderers calculate control run progress", () => {
  assert.deepEqual(controlRunProgress({
    status: "running",
    steps: [{ state: "completed" }, { state: "active" }, { state: "pending" }]
  }), {
    active: 1,
    activeLabel: "step 2/3",
    blocked: -1,
    completed: 1,
    currentStep: { state: "active" },
    label: "running · step 2/3",
    total: 3
  });
  assert.equal(controlActionStateLabel("active"), "working");
  assert.equal(controlActionStateLabel("completed"), "done");
  assert.equal(controlActionStateLabel("blocked"), "needs review");
});

test("monitor renderers hide control monitor when no run exists", () => {
  const harness = createHarness();

  harness.renderers.renderControlMonitor();

  assert.equal(harness.dom.window.document.querySelector("#control").hidden, true);
  assert.equal(harness.dom.window.document.querySelector("#approval").hidden, true);
  assert.deepEqual(harness.calls, ["dock"]);
});

test("monitor renderers render control steps, artifacts, and approval boundaries", () => {
  const harness = createHarness({
    currentControlRun: {
      goal: "find product",
      status: "approval",
      steps: [{ type: "read", state: "completed", note: "saw page" }, { type: "click", label: "Click button", state: "blocked" }],
      artifacts: [{ type: "report", path: "/tmp/report.md" }]
    },
    pendingApproval: {
      reason: "Click needs approval.",
      step: { type: "click", label: "Click button", boundary: "public-submit" }
    }
  });

  harness.renderers.renderControlMonitor();

  assert.equal(harness.dom.window.document.querySelector("#control").hidden, false);
  assert.equal(harness.dom.window.document.querySelector("#control-title").textContent, "find product");
  assert.equal(harness.dom.window.document.querySelector("#control-status").dataset.status, "approval");
  assert.equal(harness.dom.window.document.querySelector("#control-status").textContent, "approval · blocked at 2/2");
  assert.equal(harness.dom.window.document.querySelector("#control-stop").hidden, false);
  assert.equal(harness.dom.window.document.querySelector("#control-current").dataset.state, "blocked");
  assert.equal(harness.dom.window.document.querySelector("#control-current small").textContent, "Needs approval");
  assert.equal(harness.dom.window.document.querySelector("#control-current strong").textContent, "Click button");
  assert.deepEqual([...harness.dom.window.document.querySelectorAll("#control-steps li")].map((item) => ({
    index: item.dataset.index,
    state: item.dataset.state,
    text: item.querySelector(".control-step-main").textContent,
    note: item.querySelector(".control-step-note")?.textContent ?? "",
    badge: item.querySelector(".control-step-state")?.textContent ?? ""
  })), [
    { index: "1", state: "completed", text: "read", note: "saw page", badge: "done" },
    { index: "2", state: "blocked", text: "Click button", note: "", badge: "needs review" }
  ]);
  assert.match(harness.dom.window.document.querySelector("#control-artifacts").textContent, /report: \/tmp\/report\.md/);
  assert.equal(harness.dom.window.document.querySelector("#approval").hidden, false);
  assert.equal(harness.dom.window.document.querySelector("#approval-approve").disabled, false);
  assert.equal(harness.dom.window.document.querySelector("#approval-trust").disabled, true);
  assert.match(harness.dom.window.document.querySelector("#approval-reason").textContent, /Public-submit boundary/);
});

test("monitor renderers render collapsed and expanded browser jobs", () => {
  const browserJobs = [
    { id: "job-a", goal: "A task", status: "running", updatedAt: "2026-05-26T10:00:00.000Z", planner: "loop" },
    {
      id: "job-b",
      goal: "B task",
      status: "completed",
      updatedAt: "2026-05-26T09:00:00.000Z",
      planner: "loop",
      steps: [{ state: "completed", label: "Read page" }, { state: "blocked", label: "Click Submit" }]
    }
  ];
  const harness = createHarness({ browserJobs, jobMonitorCollapsed: true });

  harness.renderers.renderJobMonitor();

  assert.equal(harness.dom.window.document.querySelector("#jobs").hidden, false);
  assert.equal(harness.dom.window.document.querySelector("#jobs-title").textContent, "1 active · 2 total");
  assert.equal(harness.dom.window.document.querySelector("#jobs-toggle").textContent, "Show");
  assert.equal(harness.dom.window.document.querySelector("#jobs-list").hidden, true);

  harness.state.jobMonitorCollapsed = false;
  harness.renderers.renderJobMonitor();

  assert.equal(harness.dom.window.document.querySelector("#jobs-toggle").textContent, "Hide");
  assert.equal(harness.dom.window.document.querySelector("#jobs-list").hidden, false);
  assert.deepEqual([...harness.dom.window.document.querySelectorAll("#jobs-list > li")].map((item) => item.dataset.status), ["running", "completed"]);
  assert.match(harness.dom.window.document.querySelector("#jobs-list").textContent, /done · Read page/);
  harness.dom.window.document.querySelectorAll(".job-actions button")[1].click();
  assert.deepEqual(harness.state.continued, ["job-b"]);
  harness.dom.window.document.querySelectorAll(".job-actions button")[2].click();
  assert.deepEqual(harness.state.reported, ["job-b"]);
});

test("monitor renderers show and hide site permission panel", async () => {
  const harness = createHarness({ permission: "read-only" });

  await harness.renderers.renderSitePermissionPanel();

  assert.equal(harness.dom.window.document.querySelector("#site").hidden, false);
  assert.equal(harness.dom.window.document.querySelector("#host").textContent, "example.com");
  assert.equal(harness.dom.window.document.querySelector("#mode").value, "read-only");
  assert.match(harness.dom.window.document.querySelector("#note").textContent, /cannot click/);

  harness.state.contextDockExpanded = false;
  await harness.renderers.renderSitePermissionPanel();

  assert.equal(harness.dom.window.document.querySelector("#site").hidden, true);
});

test("monitor renderers show and revoke task consent history", async () => {
  const harness = createHarness({
    taskConsents: {
      "example.com::booking": {
        siteKey: "example.com",
        taskClass: "booking",
        mode: "allow-safe",
        grantedAt: 1000,
        expiresAt: 2000
      },
      "other.com::research": {
        siteKey: "other.com",
        taskClass: "research",
        mode: "allow-safe",
        grantedAt: 1000,
        expiresAt: 2000
      }
    }
  });

  await harness.renderers.renderTaskConsentPanel();

  assert.equal(harness.dom.window.document.querySelector("#consents").hidden, false);
  assert.match(harness.dom.window.document.querySelector("#consents-title").textContent, /1 trusted task class/);
  assert.match(harness.dom.window.document.querySelector("#consents-list").textContent, /booking/);
  assert.doesNotMatch(harness.dom.window.document.querySelector("#consents-list").textContent, /research/);
  harness.dom.window.document.querySelector("#consents-list button").click();
  assert.deepEqual(harness.state.revoked, ["booking"]);

  harness.state.contextDockExpanded = false;
  await harness.renderers.renderTaskConsentPanel();
  assert.equal(harness.dom.window.document.querySelector("#consents").hidden, true);
});
