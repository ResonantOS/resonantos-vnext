import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBrowserUrl } from "../resonantos-side-panel-extension/src/lib/browser-command-parser.js";
import { createBrowserPageActions } from "../resonantos-side-panel-extension/src/lib/browser-page-actions.js";

function createHarness(overrides = {}) {
  const events = [];
  let controlledTabId = overrides.controlledTabId ?? 1;
  let lastSnapshot = overrides.lastSnapshot ?? null;
  let sendMessageCalls = 0;
  const tabs = overrides.tabs ?? [{ id: 1, active: true, title: "Example", url: "https://example.test/" }];
  const chrome = {
    tabs: {
      create: async (payload) => {
        events.push(["tab.create", payload]);
        return { id: 2, active: true, title: "", url: payload.url };
      },
      get: async (tabId) => tabs.find((tab) => tab.id === tabId) ?? null,
      query: async () => tabs,
      reload: async (tabId) => events.push(["tab.reload", tabId]),
      sendMessage: async (_tabId, message, options) => {
        sendMessageCalls += 1;
        events.push(["sendMessage", message.type, options?.frameId]);
        if (overrides.sendMessage) return overrides.sendMessage(sendMessageCalls, message, options);
        return { ok: true, snapshot: { title: "Frame", url: "https://example.test/", text: "hello world", frame: { isTop: true } } };
      },
      update: async (tabId, payload) => {
        events.push(["tab.update", tabId, payload]);
        return { id: tabId, ...payload };
      }
    },
    scripting: overrides.scripting ?? {
      executeScript: async (payload) => events.push(["inject", payload])
    },
    webNavigation: {
      getAllFrames: async () => overrides.frames ?? [{ frameId: 0 }]
    }
  };

  const actions = createBrowserPageActions({
    addMessage: async (role, content) => events.push(["message", role, content]),
    bridgeRequest: async (route, options) => {
      events.push(["bridge", route, options]);
      if (overrides.bridgeRequest) return overrides.bridgeRequest(route, options);
      return overrides.bridgeResponse ?? { items: [{ title: "Headline", source: "Source" }] };
    },
    chrome,
    getControlledTabId: () => controlledTabId,
    getLastSnapshot: () => lastSnapshot,
    isReadableBrowserTab: (tab) => typeof tab?.url === "string" && /^https?:\/\//i.test(tab.url),
    normalizeBrowserUrl,
    permissionForUrl: async () => overrides.permission ?? "ask-before-action",
    renderSitePermissionPanel: async (tab) => events.push(["site-panel", tab?.id ?? null]),
    setActivity: (phase, label, detail) => events.push(["activity", phase, label, detail]),
    setContextMeter: (snapshot) => events.push(["context", snapshot?.title ?? null]),
    setControlledTabId: (tabId) => {
      controlledTabId = tabId;
      events.push(["controlled", tabId]);
    },
    setLastSnapshot: (snapshot) => {
      lastSnapshot = snapshot;
      events.push(["snapshot", snapshot?.title ?? null]);
    },
    setReadButtonTitle: (title) => events.push(["read-title", title]),
    setStatus: (status) => events.push(["status", status]),
    siteKeyForUrl: (url) => new URL(url).host,
    sleep: async () => undefined
  });

  return {
    actions,
    events,
    getControlledTabId: () => controlledTabId,
    getLastSnapshot: () => lastSnapshot
  };
}

test("browser page actions open URLs in the controlled readable tab", async () => {
  const harness = createHarness();

  const result = await harness.actions.openBrowserUrl("resonantos.com");

  assert.deepEqual(result, { ok: true, action: "open", url: "https://resonantos.com/" });
  assert.equal(harness.getControlledTabId(), 1);
  assert.ok(harness.events.some((event) => event[0] === "tab.update" && event[2].url === "https://resonantos.com/"));
  assert.ok(harness.events.some((event) => event[0] === "message" && /Opened https:\/\/resonantos.com\//.test(event[2])));
});

test("browser page actions merge frame snapshots when reading the active page", async () => {
  const harness = createHarness({
    frames: [{ frameId: 0 }, { frameId: 7 }],
    sendMessage: (_call, _message, options) => ({
      ok: true,
      snapshot: {
        title: options.frameId === 0 ? "Top" : "Child",
        url: "https://example.test/",
        text: options.frameId === 0 ? "top text" : "child text",
        links: [{ text: "Link" }],
        controls: [{ text: "Button" }],
        fields: [{ label: "Email" }],
        frame: { isTop: options.frameId === 0 }
      }
    })
  });

  const result = await harness.actions.readActivePage({ announce: false });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.title, "Top");
  assert.match(result.snapshot.text, /top text/);
  assert.match(result.snapshot.text, /child text/);
  assert.equal(result.snapshot.frames.length, 2);
  assert.equal(harness.getLastSnapshot().title, "Top");
});

test("browser page actions inject content script after missing receiver failure", async () => {
  const harness = createHarness({
    sendMessage: (call) => call === 1
      ? { ok: false, error: "Could not establish connection. Receiving end does not exist." }
      : { ok: true, clickedText: "Continue" }
  });

  const result = await harness.actions.clickActivePageText({ text: "Continue" });

  assert.equal(result.ok, true);
  assert.ok(harness.events.some((event) => event[0] === "inject"));
  assert.ok(harness.events.some((event) => event[0] === "message" && /Clicked "Continue"/.test(event[2])));
});

test("browser page actions respect read-only site permission for mutations", async () => {
  const harness = createHarness({ permission: "read-only" });

  const result = await harness.actions.typeIntoActivePage({ text: "secret" });

  assert.equal(result.ok, false);
  assert.match(result.error, /read-only/);
  assert.ok(harness.events.some((event) => event[0] === "status" && event[1] === "Page action failed"));
});

test("browser page actions summarize existing snapshots without rereading", async () => {
  const harness = createHarness({
    lastSnapshot: {
      title: "Cached",
      url: "https://example.test/cached",
      text: "one two three",
      links: [{ text: "A" }]
    }
  });

  const result = await harness.actions.summarizeSnapshot();

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.title, "Cached");
  assert.ok(harness.events.some((event) => event[0] === "message" && /I can read this page/.test(event[2])));
  assert.ok(harness.events.some((event) => event[0] === "message" && /What is visible now: one two three/.test(event[2])));
  assert.equal(harness.events.some((event) => event[0] === "sendMessage"), false);
});

test("browser page actions save current page to archive intake", async () => {
  const harness = createHarness({
    lastSnapshot: {
      title: "Saved Page",
      url: "https://example.test/page",
      text: "Important page text for the archive.",
      links: [{ text: "Source", href: "https://example.test/source" }],
      controls: [],
      fields: []
    },
    bridgeRequest: async (route) => route === "/archive/intake"
      ? { path: "INTAKE/browser/saved-page.md", bytes: 100 }
      : { path: "REVIEW/requests/saved-page.md", status: "pending" }
  });

  const result = await harness.actions.saveCurrentPageToArchive();

  assert.equal(result.ok, true);
  assert.equal(result.path, "INTAKE/browser/saved-page.md");
  assert.equal(result.reviewRequestPath, "REVIEW/requests/saved-page.md");
  const bridgeCall = harness.events.find((event) => event[0] === "bridge" && event[1] === "/archive/intake");
  assert.equal(bridgeCall[2].body.origin, "browser-current-page");
  assert.equal(bridgeCall[2].body.url, "https://example.test/page");
  assert.match(bridgeCall[2].body.content, /Important page text/);
  const reviewCall = harness.events.find((event) => event[0] === "bridge" && event[1] === "/archive/review/request");
  assert.equal(reviewCall[2].body.path, "INTAKE/browser/saved-page.md");
  assert.ok(harness.events.some((event) => event[0] === "message" && /Saved this page/.test(event[2])));
  assert.equal(harness.events.some((event) => event[0] === "message" && /INTAKE\/browser|REVIEW\/requests/.test(event[2])), false);
});

test("browser page actions save selected text to archive intake", async () => {
  const harness = createHarness({
    sendMessage: (_call, message) => message.type === "get_selection"
      ? { ok: true, title: "Selection Page", url: "https://example.test/selection", selection: { text: "Selected passage" } }
      : { ok: false, error: "unexpected" },
    bridgeRequest: async (route) => route === "/archive/intake"
      ? { path: "INTAKE/browser/selection.md", bytes: 80 }
      : { path: "REVIEW/requests/selection.md", status: "pending" }
  });

  const result = await harness.actions.saveSelectionToArchive();

  assert.equal(result.ok, true);
  assert.equal(result.path, "INTAKE/browser/selection.md");
  assert.equal(result.reviewRequestPath, "REVIEW/requests/selection.md");
  const bridgeCall = harness.events.find((event) => event[0] === "bridge" && event[1] === "/archive/intake");
  assert.equal(bridgeCall[2].body.origin, "browser-selection");
  assert.equal(bridgeCall[2].body.url, "https://example.test/selection");
  assert.match(bridgeCall[2].body.content, /Selected passage/);
  const reviewCall = harness.events.find((event) => event[0] === "bridge" && event[1] === "/archive/review/request");
  assert.equal(reviewCall[2].body.path, "INTAKE/browser/selection.md");
  assert.equal(harness.events.some((event) => event[0] === "message" && /INTAKE\/browser|REVIEW\/requests/.test(event[2])), false);
});
