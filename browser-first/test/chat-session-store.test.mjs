import assert from "node:assert/strict";
import test from "node:test";

import { createChatSessionStore } from "../resonantos-side-panel-extension/src/lib/chat-session-store.js";

function createHarness(initial = {}) {
  const writes = [];
  let model = "MiniMax-M2.7";
  let thinkingDepth = "high";
  const storage = {
    get: async () => initial,
    set: async (payload) => {
      writes.push(payload);
      Object.assign(initial, payload);
    }
  };
  const store = createChatSessionStore({
    storage,
    storageKeys: {
      messages: "messages",
      forks: "forks",
      sessions: "sessions",
      activeSessionId: "activeSessionId",
      model: "model",
      thinkingDepth: "thinkingDepth",
      attachments: "attachments"
    },
    getModel: () => model,
    getThinkingDepth: () => thinkingDepth,
    setModel: (value) => {
      model = value;
    },
    setThinkingDepth: (value) => {
      thinkingDepth = value;
    },
    isAllowedModel: (value) => ["MiniMax-M2.7", "gpt-5.5"].includes(value),
    isAllowedThinkingDepth: (value) => ["low", "high"].includes(value),
    now: () => "2026-05-26T00:00:00.000Z",
    createId: (() => {
      let index = 0;
      return () => `message-${++index}`;
    })()
  });
  return {
    getModel: () => model,
    getThinkingDepth: () => thinkingDepth,
    store,
    writes
  };
}

test("chat session store hydrates valid state and ignores invalid messages/settings", async () => {
  const harness = createHarness({
    messages: [
      { id: "a", role: "user", content: "hello", createdAt: "now" },
      { id: "b", role: "bad", content: "drop me", createdAt: "now" }
    ],
    forks: [{ id: "fork-a" }],
    model: "gpt-5.5",
    thinkingDepth: "low",
    attachments: [{ id: "file-a", name: "a.md" }]
  });

  await harness.store.hydrate();

  assert.equal(harness.getModel(), "gpt-5.5");
  assert.equal(harness.getThinkingDepth(), "low");
  assert.equal(harness.store.getMessages().length, 1);
  assert.equal(harness.store.getSessions().length, 1);
  assert.equal(harness.store.getForks().length, 1);
  assert.equal(harness.store.getAttachments().length, 1);
});

test("chat session store creates and switches durable chat workspaces", async () => {
  const harness = createHarness();

  await harness.store.hydrate();
  await harness.store.addMessage("user", "first workspace question");
  const firstSessionId = harness.store.getActiveSessionId();
  const second = await harness.store.createSession();
  await harness.store.addMessage("user", "second workspace question");

  assert.notEqual(second.id, firstSessionId);
  assert.equal(harness.store.getMessages()[0].content, "second workspace question");
  assert.equal(harness.store.getSessions()[0].title, "second workspace question");

  await harness.store.switchSession(firstSessionId);

  assert.equal(harness.store.getMessages()[0].content, "first workspace question");
  assert.equal(harness.store.getActiveSessionId(), firstSessionId);
});

test("chat session store renames, deletes, and tracks session workspace metadata", async () => {
  const harness = createHarness();

  await harness.store.hydrate();
  const first = harness.store.getActiveSession();
  await harness.store.setActiveSessionWorkspace("memory");
  await harness.store.renameSession(first.id, "Research memory work");
  await harness.store.addMessage("user", "this should not overwrite the edited title");

  assert.equal(harness.store.getActiveSession().title, "Research memory work");
  assert.equal(harness.store.getActiveSession().titleEdited, true);
  assert.equal(harness.store.getActiveSession().workspaceId, "memory");

  const second = await harness.store.createSession({ workspaceId: "opencode" });
  assert.equal(second.workspaceId, "opencode");
  assert.equal(harness.store.getActiveSessionId(), second.id);

  await harness.store.deleteSession(second.id);
  assert.equal(harness.store.getActiveSessionId(), first.id);
  assert.equal(harness.store.getActiveSession().workspaceId, "memory");
});

test("chat session store adds, deletes, forks, and trims messages", async () => {
  const harness = createHarness();

  const user = await harness.store.addMessage("user", "first");
  await harness.store.addMessage("assistant", "answer");
  const secondUser = await harness.store.addMessage("user", "second");
  await harness.store.addMessage("assistant", "second answer");

  assert.equal(user.id, "message-1");
  assert.equal(harness.store.getMessages().length, 4);

  const fork = await harness.store.forkFromMessage(secondUser.id);
  assert.equal(fork.sourceMessageId, secondUser.id);
  assert.equal(harness.store.getMessages().length, 3);
  assert.equal(harness.store.getForks().length, 1);

  await harness.store.deleteMessage(user.id);
  assert.equal(harness.store.findMessage(user.id), null);
});

test("chat session store trims to previous user message for regeneration", async () => {
  const harness = createHarness();

  const user = await harness.store.addMessage("user", "first");
  const assistant = await harness.store.addMessage("assistant", "answer");

  const regeneratedFrom = await harness.store.trimToPreviousUserMessage(assistant.id);

  assert.equal(regeneratedFrom.id, user.id);
  assert.deepEqual(harness.store.getMessages().map((message) => message.id), [user.id]);
});

test("chat session store manages attachments and persists selected provider settings", async () => {
  const harness = createHarness();

  await harness.store.addAttachments([{ id: "a", name: "a.md" }, { id: "b", name: "b.md" }]);
  assert.equal(harness.store.getAttachments().length, 2);

  await harness.store.removeAttachment("a");
  assert.deepEqual(harness.store.getAttachments().map((attachment) => attachment.id), ["b"]);

  await harness.store.clearAttachments();
  assert.equal(harness.store.getAttachments().length, 0);
  assert.equal(harness.writes.at(-1).model, "MiniMax-M2.7");
  assert.equal(harness.writes.at(-1).thinkingDepth, "high");
});
