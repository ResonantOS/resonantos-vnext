import assert from "node:assert/strict";
import test from "node:test";

import { createControlPageObserver } from "../resonantos-side-panel-extension/src/lib/control-page-observer.js";

function createHarness(overrides = {}) {
  const events = [];
  const tabs = overrides.tabs ?? [
    { id: 1, title: "Active", url: "https://active.example/", active: true },
    { id: 2, title: "Other", url: "https://other.example/", active: false },
    { id: 3, title: "Internal", url: "chrome://extensions/", active: false }
  ];
  const observer = createControlPageObserver({
    browserJobStore: {
      currentJob: () => overrides.job ?? { status: "running" }
    },
    chrome: {
      tabs: {
        query: async () => tabs
      }
    },
    getControlledTabId: () => overrides.controlledTabId ?? 2,
    getCurrentControlRun: () => overrides.currentControlRun ?? { goal: "find booking" },
    getLastSnapshot: () => Object.hasOwn(overrides, "lastSnapshot")
      ? overrides.lastSnapshot
      : { title: "Cached", url: "https://cached.example/" },
    isReadableBrowserTab: (tab) => /^https?:\/\//i.test(String(tab?.url ?? "")),
    readActivePage: async (options) => {
      events.push(["read", options]);
      if (overrides.readError) throw new Error(overrides.readError);
      return Object.hasOwn(overrides, "snapshotResponse")
        ? overrides.snapshotResponse
        : { snapshot: { title: "Fresh", url: "https://fresh.example/" } };
    },
    setActivity: (phase, label, detail) => events.push(["activity", phase, label, detail])
  });
  return { events, observer };
}

test("control page observer reads active page and enriches it with readable tabs", async () => {
  const harness = createHarness();

  const snapshot = await harness.observer.observeControlPage();

  assert.equal(snapshot.title, "Fresh");
  assert.deepEqual(snapshot.tabs.map((tab) => tab.id), [1, 2]);
  assert.equal(snapshot.tabs[1].controlled, true);
  assert.ok(harness.events.some((event) => event[0] === "activity" && event[2] === "Observing active page" && event[3] === "find booking"));
  assert.ok(harness.events.some((event) => event[0] === "read" && event[1].announce === false));
});

test("control page observer falls back to last snapshot when active read fails", async () => {
  const harness = createHarness({ readError: "tab unavailable" });

  const snapshot = await harness.observer.observeControlPage();

  assert.equal(snapshot.title, "Cached");
  assert.equal(snapshot.tabs.length, 2);
});

test("control page observer returns null when no snapshot exists", async () => {
  const harness = createHarness({ snapshotResponse: null, lastSnapshot: null });

  const snapshot = await harness.observer.observeControlPage();

  assert.equal(snapshot, null);
});

test("control page observer blocks paused and cancelled jobs", async () => {
  await assert.rejects(
    () => createHarness({ job: { status: "paused" } }).observer.observeControlPage(),
    /paused/
  );
  await assert.rejects(
    () => createHarness({ job: { status: "cancelled" } }).observer.observeControlPage(),
    /cancelled/
  );
});

test("control page observer limits tab enrichment to thirty readable tabs", async () => {
  const harness = createHarness({
    tabs: Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      title: `Tab ${index + 1}`,
      url: `https://tab-${index + 1}.example/`,
      active: index === 0
    }))
  });

  const tabs = await harness.observer.listReadableTabSnapshots();

  assert.equal(tabs.length, 30);
  assert.equal(tabs[0].active, true);
});
