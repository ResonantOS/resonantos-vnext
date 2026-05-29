import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  ACTION_ICONS,
  createSidePanelRenderers,
  markdownToSafeHtml,
  messageLabel
} from "../resonantos-side-panel-extension/src/lib/side-panel-renderers.js";

function createHarness({ messages = [], attachments = [], renderEmptyState } = {}) {
  const dom = new JSDOM('<section id="transcript"></section><div id="attachments"></div>');
  globalThis.document = dom.window.document;
  const calls = [];
  const renderers = createSidePanelRenderers({
    attachmentStrip: dom.window.document.querySelector("#attachments"),
    transcript: dom.window.document.querySelector("#transcript"),
    getAttachments: () => attachments,
    getMessages: () => messages,
    onRemoveAttachment: (id) => calls.push(["remove", id]),
    onCopyMessage: (id) => calls.push(["copy", id]),
    onDeleteMessage: (id) => calls.push(["delete", id]),
    onEditMessage: (id) => calls.push(["edit", id]),
    onForkMessage: (id) => calls.push(["fork", id]),
    onRegenerateMessage: (id) => calls.push(["regenerate", id]),
    onSaveMessageToArchive: (id) => calls.push(["archive", id]),
    onShowMessageStats: (id) => calls.push(["stats", id]),
    renderEmptyState,
    scrollTranscriptToBottom: () => calls.push(["scroll"]),
    window: dom.window
  });
  return {
    attachmentsEl: dom.window.document.querySelector("#attachments"),
    calls,
    dom,
    renderers,
    transcript: dom.window.document.querySelector("#transcript")
  };
}

test("side panel renderers map message labels", () => {
  assert.equal(messageLabel("user"), "You");
  assert.equal(messageLabel("system"), "System");
  assert.equal(messageLabel("assistant"), "Augmentor");
});

test("side panel renderers render attachment chips and remove callbacks", () => {
  const harness = createHarness({
    attachments: [{ id: "file-a", name: "notes.md" }]
  });

  harness.renderers.renderAttachments();

  assert.equal(harness.attachmentsEl.hidden, false);
  assert.equal(harness.attachmentsEl.querySelector("strong").textContent, "notes.md");
  harness.attachmentsEl.querySelector("button").click();
  assert.deepEqual(harness.calls, [["remove", "file-a"]]);
});

test("side panel renderers render role-specific message actions", () => {
  const harness = createHarness({
    messages: [
      { id: "u1", role: "user", content: "hello", createdAt: "2026-05-26T10:00:00.000Z" },
      { id: "a1", role: "assistant", content: "answer", usage: { model: "test" }, createdAt: "2026-05-26T10:01:00.000Z" }
    ]
  });

  harness.renderers.renderMessages();

  const articles = harness.transcript.querySelectorAll("article.message");
  assert.equal(articles.length, 2);
  assert.equal(articles[0].querySelector("strong").textContent, "You");
  assert.equal(articles[1].querySelector("strong").textContent, "Augmentor");
  assert.deepEqual([...articles[0].querySelectorAll(".message-action")].map((button) => button.dataset.action), ["copy", "fork", "edit", "delete"]);
  assert.deepEqual([...articles[1].querySelectorAll(".message-action")].map((button) => button.dataset.action), ["copy", "fork", "archive", "refresh", "stats", "delete"]);

  articles[1].querySelector('[data-action="archive"]').click();
  assert.ok(harness.calls.some((call) => call[0] === "archive" && call[1] === "a1"));
  assert.ok(harness.calls.some((call) => call[0] === "scroll"));
});

test("side panel renderers allow host-specific empty states", () => {
  const harness = createHarness({
    renderEmptyState: (container) => {
      const empty = container.ownerDocument.createElement("section");
      empty.className = "empty-hero";
      empty.textContent = "Main workspace";
      container.append(empty);
    }
  });

  harness.renderers.renderMessages();

  assert.equal(harness.transcript.querySelector(".empty-hero").textContent, "Main workspace");
  assert.equal(harness.transcript.querySelector(".empty-state"), null);
  assert.ok(harness.calls.some((call) => call[0] === "scroll"));
});

test("side panel renderers format safe markdown without exposing raw markup", () => {
  const html = markdownToSafeHtml("I'm **Augmentor**\n\n- one\n- `two`\n\n<script>alert(1)</script>");

  assert.match(html, /<strong>Augmentor<\/strong>/);
  assert.match(html, /<ul><li>one<\/li><li><code>two<\/code><\/li><\/ul>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  const harness = createHarness({
    messages: [{ id: "a1", role: "assistant", content: "I'm **Augmentor**", createdAt: "2026-05-26T10:01:00.000Z" }]
  });
  harness.renderers.renderMessages();

  assert.equal(harness.transcript.querySelector(".message-content strong").textContent, "Augmentor");
});

test("side panel renderers flash copied icon and then restore it", async () => {
  const timers = [];
  const harness = createHarness({
    messages: [{ id: "copy-id", role: "assistant", content: "answer", createdAt: "2026-05-26T10:01:00.000Z" }]
  });
  harness.dom.window.setTimeout = (callback) => {
    timers.push(callback);
    return 1;
  };
  harness.renderers.renderMessages();

  const button = harness.transcript.querySelector('[data-action="copy"]');
  harness.renderers.flashCopied("copy-id");

  assert.match(button.innerHTML, /m5 12 4 4L19 6/);
  timers[0]();
  assert.match(button.innerHTML, /M8 8\.5A2\.5/);
});
