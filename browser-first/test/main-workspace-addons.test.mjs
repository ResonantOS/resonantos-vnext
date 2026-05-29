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
  let draftStatus = "draft-only";
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options.body ?? null]);
    if (route === "/addons/status") {
      return {
        addons: [
          { id: "addon.hermes", name: "Hermes", available: true, mode: "delegation-addon", trust: "add-on agent" },
          { id: "addon.opencode", name: "OpenCode", available: false, mode: "coding-addon", trust: "add-on agent" },
          { id: "addon.living-archive", name: "Living Archive", available: true, mode: "memory-system", trust: "host-mediated memory provider" },
          { id: "addon.email", name: "Email", available: true, mode: "draft-only-communication-addon", trust: "host-mediated draft provider" },
          { id: "addon.calendar", name: "Calendar", available: true, mode: "draft-only-scheduling-addon", trust: "host-mediated draft provider" }
        ]
      };
    }
    if (route === "/addons/draft/list") {
      return {
        drafts: [{
          id: "email-draft-a",
          intent: "Project update",
          path: "BrowserFirst/AddOnDrafts/email/email-draft-a.md",
          status: draftStatus,
          target: "email",
          updatedAt: "2026-05-29T10:00:00.000Z"
        }]
      };
    }
    if (route === "/addons/draft/transition") {
      draftStatus = options.body.status;
      return { id: "email-draft-a", status: draftStatus };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  renderAddOnsWorkspace({
    container,
    bridgeRequest,
    onOpenWorkspace: (workspaceId) => opened.push(workspaceId)
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls.map((call) => call[0]), ["/addons/status", "/addons/draft/list"]);
  assert.match(container.textContent, /Replaceable capabilities, explicit trust/);
  assert.match(container.textContent, /5 add-ons visible/);
  assert.match(container.textContent, /Hermes/);
  assert.match(container.textContent, /OpenCode/);
  assert.match(container.textContent, /Living Archive/);
  assert.match(container.textContent, /Email/);
  assert.match(container.textContent, /Calendar/);
  assert.match(container.textContent, /not trusted core agents/i);
  assert.match(container.textContent, /Direct trusted wiki writes remain blocked/);
  assert.match(container.textContent, /Sending and scheduling remain human-approval gated/);
  assert.match(container.textContent, /Draft approval/);
  assert.match(container.textContent, /Project update/);
  assert.match(container.textContent, /External send\/schedule remains blocked here/);
  const buttons = [...container.querySelectorAll(".addon-card > .addon-card-actions button")];
  assert.equal(buttons.length, 3);
  assert.equal(buttons.find((button) => /OpenCode/.test(button.textContent)).disabled, true);
  buttons.find((button) => /Hermes/.test(button.textContent)).click();
  buttons.find((button) => /Living Archive/.test(button.textContent)).click();
  assert.deepEqual(opened, ["hermes", "memory"]);

  container.querySelector(".addon-draft-card button").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(calls.some((call) => call[0] === "/addons/draft/transition" && call[1].status === "approved-for-manual-send"));
  assert.match(container.textContent, /approved-for-manual-send/);
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
  assert.match(container.textContent, /Draft review unavailable: host unavailable/);
  assert.equal(container.querySelector(".addons-status").dataset.tone, "error");
  assert.doesNotMatch(container.textContent, /token|secret|credential/i);
});
