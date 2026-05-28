import assert from "node:assert/strict";
import test from "node:test";

import {
  createAppCommandHandlers,
  parseCommandSections,
  parseHistorySearchCommand,
  sitePermissionModeFromText
} from "../resonantos-side-panel-extension/src/lib/app-command-handlers.js";

function createHarness(overrides = {}) {
  const calls = [];
  const jobs = overrides.jobs ?? [{ id: "job-a", goal: "Find slot", status: "running" }];
  const browserJobStore = {
    findJob: (query = "") => query ? jobs.find((job) => job.id.includes(query) || job.goal.toLowerCase().includes(String(query).toLowerCase())) ?? null : jobs[0] ?? null,
    getActiveJobId: () => overrides.activeJobId ?? "job-a",
    getJobs: () => jobs
  };
  const bridgeResponses = {
    "/goals": { id: "goal-a", mission: "Build" },
    "/addons/delegate": { id: "delegation-a", target: "opencode", path: "/tmp/task" },
    "/status": {
      providers: { "shared-minimax": true, "shared-openai": false },
      memory: { wiki: { pages: 3 }, intake: { artifacts: 2 }, review: { requests: 1, artifacts: 1 } },
      addons: [{ name: "OpenCode", available: true, mode: "addon" }],
      records: { goals: 1, delegations: 2 }
    },
    "/memory/search": { query: "resonant", matches: [{ title: "ResonantOS", path: "wiki/resonantos.md", excerpt: "OS" }] },
    ...overrides.bridgeResponses
  };
  const handlers = createAppCommandHandlers({
    activeTab: async () => ({ url: "https://example.com/page" }),
    addMessage: async (role, content) => calls.push(["message", role, content]),
    bridgeRequest: async (path, options = {}) => {
      calls.push(["bridge", path, options.body ?? null]);
      return bridgeResponses[path];
    },
    browserJobStore,
    chrome: {
      history: {
        search: async () => [
          { title: "Example", url: "https://example.com/" },
          { title: "Other", url: "https://other.example/" }
        ]
      },
      tabs: {
        query: async () => [
          { title: "Example tab", url: "https://example.com/page" },
          { title: "Private tab", url: "https://example.com/private", incognito: true },
          { title: "Other tab", url: "https://other.example/page" },
          { title: "Extension tab", url: "chrome-extension://abc/panel.html" }
        ]
      }
    },
    finishControlRun: (status) => calls.push(["finish", status]),
    getCurrentControlRun: () => overrides.currentControlRun ?? { status: "running" },
    permissionForUrl: async () => "ask-before-action",
    renderJobMonitor: () => calls.push(["renderJobs"]),
    renderSitePermissionPanel: async () => calls.push(["renderSite"]),
    restartBrowserJob: async (job) => calls.push(["restart", job.id, job.goal, job.steps?.length ?? 0]),
    setActivity: (...args) => calls.push(["activity", ...args]),
    setSitePermission: async (_url, mode) => ({ key: "example.com", mode }),
    setStatus: (status) => calls.push(["status", status]),
    siteKeyForUrl: () => "example.com",
    updateBrowserJob: async (id, patch) => calls.push(["updateJob", id, patch])
  });
  return { calls, handlers };
}

test("app command handlers parse sections and site permission modes", () => {
  assert.deepEqual(parseCommandSections("Build | success: tests, build | constraints: safe"), [
    "Build",
    "success: tests, build",
    "constraints: safe"
  ]);
  assert.equal(sitePermissionModeFromText("block this site"), "blocked");
  assert.equal(sitePermissionModeFromText("read only"), "read-only");
  assert.equal(sitePermissionModeFromText("trusted"), "trusted-for-safe-actions");
  assert.equal(sitePermissionModeFromText("normal"), "ask-before-action");
});

test("app command handlers parse history filters", () => {
  assert.deepEqual(parseHistorySearchCommand("resonant dao | site:www.resonantos.com/path | days:7 | limit:12 | tabs:yes"), {
    days: 7,
    includeTabs: true,
    maxResults: 12,
    query: "resonant dao",
    site: "resonantos.com"
  });
  assert.equal(parseHistorySearchCommand("recent tabs").includeTabs, true);
  assert.equal(parseHistorySearchCommand("recent tabs").query, "");
});

test("app command handlers create goals and delegations", async () => {
  const harness = createHarness();

  await harness.handlers.runGoalCommand("Build | success: tests, build | constraints: safe");
  await harness.handlers.runDelegateCommand("opencode fix browser tests");
  await harness.handlers.runDelegateCommand("hermes coordinate the research handoff");

  assert.ok(harness.calls.some((call) => call[0] === "bridge" && call[1] === "/goals" && call[2].mission === "Build"));
  assert.ok(harness.calls.some((call) => call[0] === "bridge" && call[1] === "/addons/delegate" && call[2].target === "opencode"));
  assert.ok(harness.calls.some((call) => call[0] === "bridge" && call[1] === "/addons/delegate" && call[2].target === "hermes"));
  assert.ok(harness.calls.some((call) => call[0] === "message" && /Goal workspace recorded/.test(call[2])));
});

test("app command handlers report status, memory, history, capabilities, and site permissions", async () => {
  const harness = createHarness();

  await harness.handlers.runStatusCommand();
  await harness.handlers.runMemorySearchCommand("resonant");
  await harness.handlers.runHistorySearchCommand("example");
  await harness.handlers.runCapabilitiesCommand();
  await harness.handlers.runSitePermissionCommand("trusted");

  assert.ok(harness.calls.some((call) => call[0] === "message" && /ResonantOS Browser status/.test(call[2])));
  assert.ok(harness.calls.some((call) => call[0] === "message" && /Living Archive matches/.test(call[2])));
  assert.ok(harness.calls.some((call) => call[0] === "message" && /Browser history matches/.test(call[2])));
  assert.ok(harness.calls.some((call) => call[0] === "message" && /What Augmentor can do now/.test(call[2])));
  assert.ok(harness.calls.some((call) => call[0] === "message" && /Assistant permission to trusted-for-safe-actions/.test(call[2])));
});

test("app command handlers synthesize filtered history and recent readable tabs", async () => {
  const harness = createHarness();

  await harness.handlers.runHistorySearchCommand("example | site:example.com | days:7 | tabs");

  const message = harness.calls.find((call) => call[0] === "message" && /Recent readable tabs/.test(call[2]))?.[2] ?? "";
  assert.match(message, /Example tab/);
  assert.match(message, /Browser history matches for "example"/);
  assert.match(message, /Filter: site example.com/);
  assert.match(message, /Window: 7 day/);
  assert.match(message, /Incognito activity is excluded/);
  assert.doesNotMatch(message, /Private tab/);
  assert.doesNotMatch(message, /Other tab/);
});

test("app command handlers manage browser jobs", async () => {
  const harness = createHarness();

  await harness.handlers.runJobsCommand();
  await harness.handlers.pauseBrowserJob("job-a");
  await harness.handlers.resumeBrowserJob("job-a");
  await harness.handlers.cancelBrowserJob("job-a");

  assert.ok(harness.calls.some((call) => call[0] === "message" && /Browser jobs/.test(call[2])));
  assert.ok(harness.calls.some((call) => call[0] === "finish" && call[1] === "paused"));
  assert.ok(harness.calls.some((call) => call[0] === "updateJob" && call[2].status === "paused"));
  assert.ok(harness.calls.some((call) => call[0] === "updateJob" && call[2].status === "cancelled"));
});

test("app command handlers continue a previous browser job through restart boundary", async () => {
  const harness = createHarness({
    jobs: [{
      id: "job-b",
      goal: "Find product",
      status: "completed",
      steps: [{ type: "read", label: "Read page", state: "completed" }]
    }]
  });

  await harness.handlers.continueBrowserJob("job-b");

  assert.ok(harness.calls.some((call) => call[0] === "message" && /Continuing browser job job-b/.test(call[2])));
  assert.ok(harness.calls.some((call) => call[0] === "restart" && call[1] === "job-b" && call[2] === "Find product" && call[3] === 1));
});
