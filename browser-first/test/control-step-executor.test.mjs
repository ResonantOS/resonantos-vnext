import assert from "node:assert/strict";
import test from "node:test";

import { createControlStepExecutor } from "../resonantos-side-panel-extension/src/lib/control-step-executor.js";

function createHarness(overrides = {}) {
  const events = [];
  const tabs = overrides.tabs ?? [
    { id: 1, active: true, title: "ResonantOS", url: "https://resonantos.com/" },
    { id: 2, active: false, title: "Booking", url: "https://manoloremiddi.com/booking" },
    { id: 3, active: false, title: "Settings", url: "chrome://extensions/" }
  ];
  let controlledTabId = overrides.controlledTabId ?? 1;
  let lastSnapshot = { title: "Cached" };
  const executor = createControlStepExecutor({
    addMessage: async (role, content) => events.push(["message", role, content]),
    chrome: {
      tabs: {
        get: async (id) => tabs.find((tab) => tab.id === id) ?? null,
        query: async () => tabs,
        update: async (id, patch) => events.push(["tab-update", id, patch])
      }
    },
    clickActivePageText: async (payload) => {
      events.push(["click", payload]);
      return { ok: true, clickedText: payload.text || payload.ref };
    },
    detectActivePageForms: async () => {
      events.push(["forms"]);
      return { ok: true, forms: [] };
    },
    getControlledTabId: () => controlledTabId,
    isReadableBrowserTab: (tab) => /^https?:\/\//i.test(String(tab?.url ?? "")),
    openBrowserUrl: async (target) => {
      events.push(["open", target]);
      return { ok: true, action: "open", url: target };
    },
    scrollActivePage: async (payload) => {
      events.push(["scroll", payload]);
      return { ok: true, direction: payload.direction };
    },
    searchBrowser: async (payload) => {
      events.push(["search", payload]);
      return { ok: true, action: payload.action, query: payload.query };
    },
    setActivity: (phase, label, detail) => events.push(["activity", phase, label, detail]),
    setContextMeter: (snapshot) => events.push(["meter", snapshot]),
    setControlledTabId: (id) => {
      controlledTabId = id;
      events.push(["controlled", id]);
    },
    setLastSnapshot: (snapshot) => {
      lastSnapshot = snapshot;
      events.push(["snapshot", snapshot]);
    },
    sleep: async (ms) => events.push(["sleep", ms]),
    summarizeSnapshot: async () => {
      events.push(["summary"]);
      return { ok: true, snapshot: lastSnapshot };
    },
    typeIntoActivePage: async (payload) => {
      events.push(["type", payload]);
      return { ok: true, typedText: payload.text };
    }
  });
  return {
    events,
    executor,
    getControlledTabId: () => controlledTabId,
    getLastSnapshot: () => lastSnapshot
  };
}

test("control step executor lists readable tabs and marks the controlled tab", async () => {
  const harness = createHarness();

  const result = await harness.executor.executeControlStep({ type: "tabs" });

  assert.equal(result.ok, true);
  assert.equal(result.tabs.length, 2);
  assert.equal(result.tabs[0].controlled, true);
  assert.equal(result.tabs.some((tab) => tab.url.startsWith("chrome:")), false);
  assert.ok(harness.events.some((event) => event[0] === "message" && /Open browser tabs/.test(event[2])));
});

test("control step executor switches readable tabs and clears stale page context", async () => {
  const harness = createHarness();

  const result = await harness.executor.executeControlStep({ type: "switch_tab", tabId: 2 });

  assert.equal(result.ok, true);
  assert.equal(harness.getControlledTabId(), 2);
  assert.equal(harness.getLastSnapshot(), null);
  assert.ok(harness.events.some((event) => event[0] === "tab-update" && event[1] === 2));
  assert.ok(harness.events.some((event) => event[0] === "meter" && event[1] === null));
  assert.ok(harness.events.some((event) => event[0] === "message" && /Switched controlled tab/.test(event[2])));
});

test("control step executor rejects unreadable tab switches", async () => {
  const harness = createHarness();

  const result = await harness.executor.executeControlStep({ type: "switch_tab", tabId: 3 });

  assert.equal(result.ok, false);
  assert.match(result.error, /not a readable web page/);
  assert.equal(harness.getControlledTabId(), 1);
});

test("control step executor delegates browser mutation steps and waits for page state", async () => {
  const harness = createHarness();

  await harness.executor.executeControlStep({ type: "open", target: "https://example.com/" });
  await harness.executor.executeControlStep({ type: "search", action: "news", query: "ai" });
  await harness.executor.executeControlStep({ type: "click", text: "Continue", ref: "c1", userApproved: true });
  await harness.executor.executeControlStep({ type: "type", text: "hello", field: "search", submit: true });
  await harness.executor.executeControlStep({ type: "scroll", direction: "down" });
  await harness.executor.executeControlStep({ type: "forms" });
  await harness.executor.executeControlStep({ type: "wait", ms: 250 });

  assert.ok(harness.events.some((event) => event[0] === "open" && event[1] === "https://example.com/"));
  assert.ok(harness.events.some((event) => event[0] === "search" && event[1].query === "ai"));
  assert.ok(harness.events.some((event) => event[0] === "click" && event[1].ref === "c1"));
  assert.ok(harness.events.some((event) => event[0] === "type" && event[1].submit === true));
  assert.ok(harness.events.some((event) => event[0] === "scroll" && event[1].direction === "down"));
  assert.ok(harness.events.some((event) => event[0] === "forms"));
  assert.ok(harness.events.some((event) => event[0] === "sleep" && event[1] === 1200));
  assert.ok(harness.events.some((event) => event[0] === "sleep" && event[1] === 500));
  assert.ok(harness.events.some((event) => event[0] === "sleep" && event[1] === 250));
});

test("control step executor summarizes read steps and rejects unknown steps", async () => {
  const harness = createHarness();

  const read = await harness.executor.executeControlStep({ type: "read" });
  const unknown = await harness.executor.executeControlStep({ type: "unknown" });

  assert.equal(read.ok, true);
  assert.ok(harness.events.some((event) => event[0] === "summary"));
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /Unknown control step/);
});
