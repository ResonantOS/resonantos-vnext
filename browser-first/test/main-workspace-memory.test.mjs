import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { renderLivingArchiveWorkspace } from "../resonantos-side-panel-extension/src/lib/main-workspace-memory.js";

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

test("living archive workspace renders status, search, and intake through bridge routes", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/memory/status") {
      return {
        exists: true,
        wiki: { pages: 12, index: { exists: true } },
        intake: { artifacts: 4 },
        review: { requests: 2, artifacts: 3 }
      };
    }
    if (route === "/memory/search") {
      return {
        matches: [{ title: "ResonantOS", path: "AI_MEMORY/wiki/resonantos.md", excerpt: "ResonantOS memory result" }]
      };
    }
    if (route === "/archive/intake") {
      return { path: "INTAKE/browser/note.md", bytes: 42 };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderLivingArchiveWorkspace({ container, bridgeRequest });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(container.textContent, /AI-curated memory/);
    assert.match(container.textContent, /12/);
    assert.match(container.textContent, /4/);
    assert.match(container.textContent, /5/);

    const searchInput = container.querySelector("input[type='search']");
    searchInput.value = "resonant";
    container.querySelector(".memory-search").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) => route === "/memory/search" && options.body.query === "resonant"));
    assert.match(container.textContent, /ResonantOS memory result/);

    const [titleInput, noteInput] = container.querySelectorAll(".memory-intake input, .memory-intake textarea");
    titleInput.value = "Browser note";
    noteInput.value = "Save this note to intake.";
    container.querySelector(".memory-intake").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(calls.some(([route, options]) => route === "/archive/intake" && options.body.title === "Browser note"));
    assert.match(container.textContent, /INTAKE\/browser\/note\.md/);
  } finally {
    cleanup();
  }
});

test("living archive workspace can run an initial routed search", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/memory/status") {
      return { exists: true, wiki: { pages: 1, index: { exists: true } }, intake: { artifacts: 0 }, review: { requests: 0, artifacts: 0 } };
    }
    if (route === "/memory/search") {
      return { matches: [{ title: "Augmentor", path: "AI_MEMORY/wiki/augmentor.md", excerpt: "Augmentor search result" }] };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderLivingArchiveWorkspace({ container, bridgeRequest, initialQuery: "augmentor" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(calls.some(([route, options]) => route === "/memory/search" && options.body.query === "augmentor"));
    assert.match(container.textContent, /Augmentor search result/);
  } finally {
    cleanup();
  }
});
