import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { renderOpenCodeWorkspace } from "../resonantos-side-panel-extension/src/lib/main-workspace-opencode.js";

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

test("opencode workspace renders runtime status and creates governed delegation packets", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/opencode/status") {
      return {
        installed: true,
        command: "/usr/local/bin/opencode",
        detail: "OpenCode runtime was detected.",
        delegationPackets: 1
      };
    }
    if (route === "/addons/delegate") {
      return {
        id: "opencode-1",
        path: "BrowserFirst/Delegations/opencode/opencode-1.md",
        status: "queued"
      };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderOpenCodeWorkspace({ container, bridgeRequest });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(container.textContent, /Scoped coding work/);
    assert.match(container.textContent, /OpenCode runtime was detected/);
    assert.match(container.textContent, /\/usr\/local\/bin\/opencode/);
    assert.match(container.textContent, /Provider secrets, wallet actions, and trusted Living Archive writes/);

    const mission = container.querySelector("textarea");
    mission.value = "Use OpenCode to inspect the browser-first workspace tests and return verification evidence.";
    container.querySelector(".opencode-task-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(calls.some(([route, options]) =>
      route === "/addons/delegate" &&
      options.body.target === "opencode" &&
      /browser-first workspace tests/.test(options.body.mission)
    ));
    assert.match(container.textContent, /Delegation queued: opencode-1/);
  } finally {
    cleanup();
  }
});

test("opencode workspace can create an initial routed delegation", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/opencode/status") {
      return { installed: false, command: "", detail: "OpenCode runtime was not detected." };
    }
    if (route === "/addons/delegate") {
      return { id: "opencode-routed", path: "BrowserFirst/Delegations/opencode/opencode-routed.md" };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderOpenCodeWorkspace({
      container,
      bridgeRequest,
      initialMission: "Refactor the browser-first workspace command routing and return tests."
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(calls.some(([route, options]) =>
      route === "/addons/delegate" &&
      options.body.target === "opencode" &&
      /command routing/.test(options.body.mission)
    ));
    assert.match(container.textContent, /opencode-routed/);
  } finally {
    cleanup();
  }
});
