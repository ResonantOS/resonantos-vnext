import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { renderArtifactsWorkspace } from "../resonantos-side-panel-extension/src/lib/main-workspace-artifacts.js";

function setupDom() {
  const dom = new JSDOM("<!doctype html><main id=\"root\"></main>", { url: "https://resonantos.local/" });
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  return {
    container: dom.window.document.querySelector("#root"),
    cleanup: () => {
      delete globalThis.document;
      delete globalThis.HTMLElement;
      delete globalThis.Event;
    }
  };
}

test("artifacts workspace lists and previews archive intake artifacts", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/archive/intake/list") {
      return {
        root: "Memory/INTAKE",
        entries: [
          {
            path: "INTAKE/browser/job-report.md",
            title: "Browser job completed: compare a product",
            kind: "browser-job-report",
            bytes: 2048,
            modifiedAt: "2026-05-28T10:00:00.000Z",
            excerpt: "Observed, clicked, verified, and returned artifacts."
          }
        ]
      };
    }
    if (route === "/archive/intake/read") {
      return {
        path: options.body.path,
        title: "Browser job completed: compare a product",
        kind: "browser-job-report",
        bytes: 2048,
        modifiedAt: "2026-05-28T10:00:00.000Z",
        content: "# Browser Job Report\n\n## Goal\ncompare a product",
        truncated: false
      };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderArtifactsWorkspace({ container, bridgeRequest });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(container.textContent, /Reports and intake created by browser work/);
    assert.match(container.textContent, /Browser job completed/);
    assert.match(container.textContent, /# Browser Job Report/);
    assert.ok(calls.some(([route]) => route === "/archive/intake/list"));
    assert.ok(calls.some(([route, options]) => route === "/archive/intake/read" && options.body.path === "INTAKE/browser/job-report.md"));

    container.querySelector(".artifact-row").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls.filter(([route]) => route === "/archive/intake/read").length, 2);
  } finally {
    cleanup();
  }
});

test("artifacts workspace reports empty intake clearly", async () => {
  const { container, cleanup } = setupDom();
  try {
    renderArtifactsWorkspace({
      container,
      bridgeRequest: async () => ({ root: "Memory/INTAKE", entries: [] })
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(container.textContent, /No browser reports or intake artifacts found yet/);
  } finally {
    cleanup();
  }
});
