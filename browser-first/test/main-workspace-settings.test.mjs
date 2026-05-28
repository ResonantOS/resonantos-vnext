import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { renderSettingsWorkspace } from "../resonantos-side-panel-extension/src/lib/main-workspace-settings.js";

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

test("settings workspace renders provider status without exposing credentials", async () => {
  const { container, cleanup } = setupDom();
  const bridgeRequest = async (route) => {
    if (route === "/providers/status") {
      return {
        providers: [
          {
            id: "shared-openai",
            label: "OpenAI",
            role: "High-reasoning fallback",
            models: ["gpt-5.5"],
            configured: false,
            credentialPreview: "missing"
          },
          {
            id: "shared-minimax",
            label: "MiniMax",
            role: "Default Augmentor provider",
            models: ["MiniMax-M2.7"],
            configured: true,
            credentialPreview: "stored"
          }
        ]
      };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderSettingsWorkspace({ container, bridgeRequest });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(container.textContent, /Provider Profiles/);
    assert.match(container.textContent, /MiniMax/);
    assert.match(container.textContent, /OpenAI/);
    assert.match(container.textContent, /1\/2 provider profiles configured/);
    assert.doesNotMatch(container.textContent, /sk-|Bearer|api_key/i);
  } finally {
    cleanup();
  }
});

test("settings workspace saves provider credentials through the host bridge", async () => {
  const { container, cleanup } = setupDom();
  const calls = [];
  let configured = false;
  const bridgeRequest = async (route, options = {}) => {
    calls.push([route, options]);
    if (route === "/providers/status") {
      return {
        providers: [{
          id: "shared-minimax",
          label: "MiniMax",
          role: "Default Augmentor provider",
          models: ["MiniMax-M2.7"],
          configured,
          credentialPreview: configured ? "stored" : "missing"
        }]
      };
    }
    if (route === "/providers/credentials") {
      configured = true;
      return { providerId: options.body.providerId, configured: true, savedAt: "2026-05-28T00:00:00.000Z" };
    }
    throw new Error(`Unexpected route ${route}`);
  };

  try {
    renderSettingsWorkspace({ container, bridgeRequest });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const input = container.querySelector("input[name='credential']");
    input.value = "minimax-test-credential";
    container.querySelector(".settings-provider-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(calls.some(([route, options]) =>
      route === "/providers/credentials" &&
      options.body.providerId === "shared-minimax" &&
      options.body.credential === "minimax-test-credential"
    ));
    assert.equal(input.value, "");
    assert.match(container.textContent, /1\/1 provider profiles configured/);
  } finally {
    cleanup();
  }
});
