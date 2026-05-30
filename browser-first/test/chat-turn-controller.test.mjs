import assert from "node:assert/strict";
import test from "node:test";

import {
  createChatTurnController,
  pageContextForSnapshot,
  providerMessagesFromHistory,
  runtimeContextForAttachments
} from "../resonantos-side-panel-extension/src/lib/chat-turn-controller.js";

test("chat turn controller builds compact page and runtime context", () => {
  assert.equal(pageContextForSnapshot(null), null);
  assert.equal(pageContextForSnapshot({ title: "Page", url: "https://example.com/", text: "Visible" }), "Title: Page\n\nURL: https://example.com/\n\nVisible text:\nVisible");
  assert.equal(runtimeContextForAttachments([]), null);
  assert.equal(runtimeContextForAttachments([
    { name: "a.md", content: "alpha" },
    { name: "b.pdf", summary: "metadata only" }
  ]), "Composer attachments:\n- a.md: alpha\n- b.pdf: metadata only");
});

test("chat turn controller filters provider messages to recent user/assistant turns", () => {
  const messages = [
    { role: "system", content: "skip" },
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
    { role: "user", content: "three" }
  ];

  assert.deepEqual(providerMessagesFromHistory(messages, 2), [
    { role: "assistant", content: "two" },
    { role: "user", content: "three" }
  ]);
});

function createHarness({ fail = false, systemPrompt = "" } = {}) {
  const events = [];
  const attachments = [{ name: "notes.md", content: "notes" }];
  const messages = [
    { role: "system", content: "skip" },
    { role: "user", content: "hello" }
  ];
  const controller = createChatTurnController({
    addMessage: async (role, content, options = {}) => events.push(["message", role, content, options]),
    bridgeRequest: async (path, request) => {
      events.push(["bridge", path, request]);
      if (fail) throw new Error("provider down");
      return { reply: "answer", providerId: "provider-a", model: "model-a", usage: { tokens: 7 } };
    },
    chatSessionStore: {
      getAttachments: () => attachments,
      getMessages: () => messages
    },
    clearActivitySoon: () => events.push(["clearActivitySoon"]),
    clearAttachments: async () => events.push(["clearAttachments"]),
    getLastSnapshot: () => ({ title: "Page", url: "https://example.com/", text: "Visible" }),
    getModel: () => "MiniMax-M2.7",
    getSystemPrompt: () => systemPrompt,
    getThinkingDepth: () => "high",
    setActivity: (...args) => events.push(["activity", ...args]),
    setStatus: (status) => events.push(["status", status])
  });
  return { controller, events };
}

test("chat turn controller calls provider and records assistant reply", async () => {
  const harness = createHarness();

  await harness.controller.runChatTurn();

  assert.deepEqual(harness.events[0], ["status", "Thinking"]);
  assert.ok(harness.events.some((event) => event[0] === "bridge" && event[1] === "/augmentor/chat"));
  const bridgeEvent = harness.events.find((event) => event[0] === "bridge");
  assert.equal(bridgeEvent[2].body.model, "MiniMax-M2.7");
  assert.equal(bridgeEvent[2].body.systemPrompt, "");
  assert.equal(bridgeEvent[2].body.workload, "augmentor-chat");
  assert.equal(bridgeEvent[2].body.thinkingDepth, "high");
  assert.match(bridgeEvent[2].body.pageContext, /Visible text/);
  assert.match(bridgeEvent[2].body.runtimeContext, /notes\.md/);
  assert.ok(harness.events.some((event) => event[0] === "message" && event[1] === "assistant" && event[2] === "answer"));
  assert.ok(harness.events.some((event) => event[0] === "clearAttachments"));
  assert.deepEqual(harness.events.at(-1), ["clearActivitySoon"]);
});

test("chat turn controller forwards the user-configured Augmentor prompt", async () => {
  const harness = createHarness({ systemPrompt: "Use the ResonantOS profile rules." });

  await harness.controller.runChatTurn();

  const bridgeEvent = harness.events.find((event) => event[0] === "bridge");
  assert.equal(bridgeEvent[2].body.systemPrompt, "Use the ResonantOS profile rules.");
});

test("chat turn controller reports provider failure", async () => {
  const harness = createHarness({ fail: true });

  await harness.controller.runChatTurn();

  assert.ok(harness.events.some((event) => event[0] === "status" && event[1] === "Provider failed"));
  assert.ok(harness.events.some((event) => event[0] === "message" && event[1] === "system" && event[2] === "provider down"));
  assert.deepEqual(harness.events.at(-1), ["clearActivitySoon"]);
});
