import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { renderAddOnsWorkspace } from "../resonantos-side-panel-extension/src/lib/main-workspace-addons.js";

test("add-ons workspace renders registry status and governed open actions", async () => {
  const dom = new JSDOM(`<main id="root"></main>`, { url: "https://example.test/" });
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector("#root");
  const opened = [];
  const calls = [];
  const bridgeRequest = async (route) => {
    calls.push(route);
    assert.equal(route, "/addons/status");
    return {
      addons: [
        { id: "addon.hermes", name: "Hermes", available: true, mode: "delegation-addon", trust: "add-on agent" },
        { id: "addon.opencode", name: "OpenCode", available: false, mode: "coding-addon", trust: "add-on agent" },
        { id: "addon.living-archive", name: "Living Archive", available: true, mode: "memory-system", trust: "host-mediated memory provider" }
      ]
    };
  };

  renderAddOnsWorkspace({
    container,
    bridgeRequest,
    onOpenWorkspace: (workspaceId) => opened.push(workspaceId)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, ["/addons/status"]);
  assert.match(container.textContent, /Replaceable capabilities, explicit trust/);
  assert.match(container.textContent, /3 add-ons visible/);
  assert.match(container.textContent, /Hermes/);
  assert.match(container.textContent, /OpenCode/);
  assert.match(container.textContent, /Living Archive/);
  assert.match(container.textContent, /not trusted core agents/i);
  assert.match(container.textContent, /Direct trusted wiki writes remain blocked/);
  const buttons = [...container.querySelectorAll(".addon-card-actions button")];
  assert.equal(buttons.length, 3);
  assert.equal(buttons.find((button) => /OpenCode/.test(button.textContent)).disabled, true);
  buttons.find((button) => /Hermes/.test(button.textContent)).click();
  buttons.find((button) => /Living Archive/.test(button.textContent)).click();
  assert.deepEqual(opened, ["hermes", "memory"]);
});

test("add-ons workspace reports bridge failures without exposing secrets", async () => {
  const dom = new JSDOM(`<main id="root"></main>`, { url: "https://example.test/" });
  globalThis.document = dom.window.document;
  const container = dom.window.document.querySelector("#root");

  renderAddOnsWorkspace({
    container,
    bridgeRequest: async () => {
      throw new Error("host unavailable");
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(container.textContent, /Add-on registry unavailable: host unavailable/);
  assert.equal(container.querySelector(".addons-status").dataset.tone, "error");
  assert.doesNotMatch(container.textContent, /token|secret|credential/i);
});
