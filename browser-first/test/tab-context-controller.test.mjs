import assert from "node:assert/strict";
import test from "node:test";

import {
  createTabContextController,
  parseTabMention
} from "../resonantos-side-panel-extension/src/lib/tab-context-controller.js";

function createHarness(overrides = {}) {
  const events = [];
  const listeners = {
    activated: [],
    storage: [],
    updated: []
  };
  const tabs = overrides.tabs ?? [
    { id: 1, title: "ResonantOS", url: "https://resonantos.com/" },
    { id: 2, title: "Manolo Booking", url: "https://manoloremiddi.com/booking" },
    { id: 3, title: "Extension", url: "chrome://extensions/" }
  ];
  let controlledTabId = overrides.controlledTabId ?? null;
  let lastSnapshot = { title: "old" };
  const chrome = {
    storage: {
      local: {
        get: async (key) => {
          events.push(["storage-get", key]);
          return overrides.draft ? { augmentorInlineDraft: overrides.draft } : {};
        },
        remove: async (key) => events.push(["storage-remove", key])
      },
      onChanged: {
        addListener: (listener) => listeners.storage.push(listener)
      }
    },
    tabs: {
      onActivated: {
        addListener: (listener) => listeners.activated.push(listener)
      },
      onUpdated: {
        addListener: (listener) => listeners.updated.push(listener)
      },
      query: async () => tabs,
      update: async (id, patch) => events.push(["tab-update", id, patch])
    }
  };
  const controller = createTabContextController({
    addMessage: async (role, content) => events.push(["message", role, content]),
    chrome,
    getControlledTabId: () => controlledTabId,
    isReadableBrowserTab: (tab) => /^https?:\/\//i.test(String(tab?.url ?? "")),
    refreshTabContext: async () => events.push(["refresh"]),
    renderSitePermissionPanel: async (tab) => events.push(["render-site", tab?.id ?? null]),
    setContextMeter: (value) => events.push(["meter", value]),
    setControlledTabId: (id) => {
      controlledTabId = id;
      events.push(["controlled", id]);
    },
    setLastSnapshot: (snapshot) => {
      lastSnapshot = snapshot;
      events.push(["snapshot", snapshot]);
    },
    sitePermissionStorageKey: "augmentorSitePermissions"
  });
  return {
    controller,
    events,
    getControlledTabId: () => controlledTabId,
    getLastSnapshot: () => lastSnapshot,
    listeners
  };
}

test("tab context controller parses tab mentions", () => {
  assert.equal(parseTabMention("use @tab 2"), "tab 2");
  assert.equal(parseTabMention("look at @Booking."), "Booking");
  assert.equal(parseTabMention("no tab here"), null);
});

test("tab context controller resolves mentions by tab index, title, and url", async () => {
  const harness = createHarness();

  assert.equal((await harness.controller.resolveTabMention("use @tab 2"))?.id, 2);
  assert.equal((await harness.controller.resolveTabMention("use @booking"))?.id, 2);
  assert.equal((await harness.controller.resolveTabMention("use @resonantos.com"))?.id, 1);
  assert.equal(await harness.controller.resolveTabMention("no mention"), null);
});

test("tab context controller binds mentioned tab and clears stale context", async () => {
  const harness = createHarness();
  const tab = await harness.controller.bindMentionedTab("switch to @booking");

  assert.equal(tab.id, 2);
  assert.equal(harness.getControlledTabId(), 2);
  assert.equal(harness.getLastSnapshot(), null);
  assert.deepEqual(harness.events.filter((event) => event[0] === "tab-update")[0], ["tab-update", 2, { active: true }]);
  assert.ok(harness.events.some((event) => event[0] === "meter" && event[1] === null));
  assert.ok(harness.events.some((event) => event[0] === "render-site" && event[1] === 2));
  assert.ok(harness.events.some((event) => event[0] === "message" && /Using @tab context/.test(event[2])));
});

test("tab context controller consumes inline drafts and clears local draft storage", async () => {
  const harness = createHarness();
  await harness.controller.consumeInlineDraft({
    selection: "selected page text",
    title: "A page",
    url: "https://example.com/"
  });

  assert.ok(harness.events.some((event) => event[0] === "message" && /Inline Assistant context received/.test(event[2])));
  assert.ok(harness.events.some((event) => event[0] === "storage-remove" && event[1] === "augmentorInlineDraft"));
});

test("tab context controller wires storage and tab listeners", async () => {
  const harness = createHarness({ controlledTabId: 2 });
  harness.controller.bindBrowserListeners();

  assert.equal(harness.listeners.storage.length, 1);
  assert.equal(harness.listeners.activated.length, 1);
  assert.equal(harness.listeners.updated.length, 1);

  harness.listeners.storage[0]({ augmentorSitePermissions: { newValue: {} } }, "local");
  harness.listeners.storage[0]({ augmentorInlineDraft: { newValue: { selection: "draft" } } }, "local");
  harness.listeners.activated[0]();
  harness.listeners.updated[0](1, { status: "complete" });
  harness.listeners.updated[0](2, { status: "complete" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(harness.events.some((event) => event[0] === "render-site"));
  assert.ok(harness.events.some((event) => event[0] === "message" && /Inline Assistant context/.test(event[2])));
  assert.equal(harness.events.filter((event) => event[0] === "refresh").length, 2);
});

test("tab context controller hydrates initial context and pending draft", async () => {
  const harness = createHarness({ draft: { selection: "pending", title: "Draft page" } });
  await harness.controller.hydrateInitialContext();

  assert.ok(harness.events.some((event) => event[0] === "refresh"));
  assert.ok(harness.events.some((event) => event[0] === "storage-get" && event[1] === "augmentorInlineDraft"));
  assert.ok(harness.events.some((event) => event[0] === "message" && /Draft page/.test(event[2])));
});
