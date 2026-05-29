import assert from "node:assert/strict";
import test from "node:test";

import { createSidePanelCommandRouter } from "../resonantos-side-panel-extension/src/lib/side-panel-command-router.js";

function createHarness() {
  const calls = [];
  const handler = (name) => async (...args) => {
    calls.push([name, ...args]);
  };
  const router = createSidePanelCommandRouter({
    bindMentionedTab: handler("bind"),
    cancelBrowserJob: handler("cancel"),
    approveControlPreflight: handler("approve-control"),
    continueBrowserJob: handler("continue"),
    clickActivePageText: handler("click"),
    denyControlPreflight: handler("deny-control"),
    detectActivePageForms: handler("forms"),
    explainStructuredPageEditBoundary: handler("structured"),
    handleWalletBoundary: handler("wallet"),
    openBrowserUrl: handler("open"),
    pauseBrowserJob: handler("pause"),
    resumeBrowserJob: handler("resume"),
    runBrowserCommand: handler("browser"),
    runCapabilitiesCommand: handler("capabilities"),
    runChatTurn: handler("chat"),
    runControlCommand: handler("control"),
    runDelegateCommand: handler("delegate"),
    runDraftAddonCommand: handler("draft"),
    runGoalCommand: handler("goal"),
    runHistorySearchCommand: handler("history"),
    runJobsCommand: handler("jobs"),
    runMemorySearchCommand: handler("memory"),
    reportBrowserJob: handler("report"),
    runSitePermissionCommand: handler("site"),
    runStatusCommand: handler("status"),
    saveIntake: handler("save"),
    scrollActivePage: handler("scroll"),
    searchBrowser: handler("search"),
    summarizeSnapshot: handler("summary"),
    typeIntoActivePage: handler("type")
  });
  return { calls, router };
}

test("side panel command router dispatches slash commands", async () => {
  const harness = createHarness();

  await harness.router.respondToCommand("/goal build the app");
  await harness.router.respondToCommand("/delegate opencode fix tests");
  await harness.router.respondToCommand("/status");
  await harness.router.respondToCommand("/browser open resonantos.com");
  await harness.router.respondToCommand("/control find a booking");
  await harness.router.respondToCommand("/email Follow up | body: Draft the email");
  await harness.router.respondToCommand("/calendar Planning | body: Draft the event");
  await harness.router.respondToCommand("/save selection");
  await harness.router.respondToCommand("/trail dao research");

  assert.deepEqual(harness.calls, [
    ["bind", "/goal build the app"],
    ["goal", "build the app"],
    ["bind", "/delegate opencode fix tests"],
    ["delegate", "opencode fix tests"],
    ["bind", "/status"],
    ["status"],
    ["bind", "/browser open resonantos.com"],
    ["browser", "open resonantos.com"],
    ["bind", "/control find a booking"],
    ["control", "find a booking"],
    ["bind", "/email Follow up | body: Draft the email"],
    ["draft", "email", "Follow up | body: Draft the email"],
    ["bind", "/calendar Planning | body: Draft the event"],
    ["draft", "calendar", "Planning | body: Draft the event"],
    ["bind", "/save selection"],
    ["save", "selection"],
    ["bind", "/trail dao research"],
    ["save", "trail dao research"]
  ]);
});

test("side panel command router dispatches browser state slash commands", async () => {
  const harness = createHarness();

  await harness.router.respondToCommand("/site read-only");
  await harness.router.respondToCommand("/memory augmentatism");
  await harness.router.respondToCommand("/history resonantos");
  await harness.router.respondToCommand("/capabilities");
  await harness.router.respondToCommand("/jobs running");
  await harness.router.respondToCommand("/pause job-a");
  await harness.router.respondToCommand("/resume job-a");
  await harness.router.respondToCommand("/continue job-a");
  await harness.router.respondToCommand("/report job-a");
  await harness.router.respondToCommand("/cancel job-a");
  await harness.router.respondToCommand("/approve-control control-a");
  await harness.router.respondToCommand("/deny-control control-a");

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "bind", "site",
    "bind", "memory",
    "bind", "history",
    "bind", "capabilities",
    "bind", "jobs",
    "bind", "pause",
    "bind", "resume",
    "bind", "continue",
    "bind", "report",
    "bind", "cancel",
    "bind", "approve-control",
    "bind", "deny-control"
  ]);
});

test("side panel command router dispatches natural browser intents before chat", async () => {
  const harness = createHarness();

  await harness.router.respondToCommand("take control: find the booking page");
  await harness.router.respondToCommand('type "resonantos" into the search bar');
  await harness.router.respondToCommand('click "Add to cart"');
  await harness.router.respondToCommand("can you read this page?");
  await harness.router.respondToCommand("can you check the loaded page?");
  await harness.router.respondToCommand("what can you see here?");
  await harness.router.respondToCommand("scroll to the bottom");
  await harness.router.respondToCommand("show form fields");
  await harness.router.respondToCommand("go to resonantos.com/dao");
  await harness.router.respondToCommand("find latest AI news on the internet");
  await harness.router.respondToCommand("go to amazon.it and find me a rtx5090");

  assert.deepEqual(harness.calls.filter((call) => call[0] !== "bind").map((call) => call[0]), [
    "control",
    "type",
    "click",
    "summary",
    "summary",
    "summary",
    "scroll",
    "forms",
    "open",
    "search",
    "control"
  ]);
  assert.deepEqual(harness.calls.at(-1), ["control", "go to amazon.it and find me a rtx5090"]);
});

test("side panel command router gates wallet terms and falls back to chat", async () => {
  const harness = createHarness();

  await harness.router.respondToCommand("help me with Phantom wallet");
  await harness.router.respondToCommand("hello");

  assert.deepEqual(harness.calls.filter((call) => call[0] !== "bind").map((call) => call[0]), ["wallet", "chat"]);
});
