import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import {
  contextUsageSnapshot,
  createDictationController,
  hydrateProviderModelOptions,
  renderContextMemoryPopover,
  supportsThinkingDepth,
  updateContextMeterElement
} from "../resonantos-side-panel-extension/src/lib/composer-runtime.js";

test("composer runtime hydrates model options from Provider Fabric accounts", async () => {
  const dom = new JSDOM("<!doctype html><select id=\"model\"><option value=\"MiniMax-M2.7\">MiniMax 2.7</option></select>");
  globalThis.document = dom.window.document;
  const modelSelect = dom.window.document.querySelector("#model");
  const statuses = [];
  const result = await hydrateProviderModelOptions({
    bridgeRequest: async (route) => {
      assert.equal(route, "/providers/status");
      return {
        providers: [{
          id: "ollama-local",
          label: "Ollama Local",
          configured: true,
          models: [{ model: "llama3.2", label: "Llama 3.2", allowed: true }]
        }, {
          id: "openrouter",
          label: "OpenRouter",
          configured: false,
          models: [{ model: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", allowed: true }]
        }, {
          id: "disabled",
          label: "Disabled",
          configured: true,
          models: [{ model: "disabled-model", label: "Disabled", allowed: false }]
        }]
      };
    },
    getPreferredModel: () => "llama3.2",
    modelSelect,
    setStatus: (status) => statuses.push(status)
  });

  assert.equal(result.ok, true);
  assert.deepEqual([...modelSelect.options].map((option) => option.value), [
    "__auto__",
    "llama3.2",
    "anthropic/claude-sonnet-4.5"
  ]);
  assert.equal(modelSelect.value, "llama3.2");
  assert.match(modelSelect.options[1].textContent, /Ollama Local/);
  assert.match(modelSelect.options[2].textContent, /missing credential/);
  assert.ok(statuses.at(-1).includes("Loaded 2 provider model routes"));
  delete globalThis.document;
});

test("composer runtime estimates context usage from messages, attachments, and page context", () => {
  const snapshot = contextUsageSnapshot({
    attachments: [{ content: "attachment ".repeat(400) }],
    messages: [
      { content: "hello world" },
      { content: "assistant reply ".repeat(300) }
    ],
    model: "batiai/gemma4-e2b:q4",
    pageSnapshot: { title: "Page", url: "https://example.com", text: "page text ".repeat(500) }
  });

  assert.equal(snapshot.contextWindow, 8000);
  assert.ok(snapshot.usedTokens > 2000);
  assert.ok(snapshot.percent > 20);
  assert.match(snapshot.title, /Estimated context usage/);
});

test("composer runtime updates context meter title and label deterministically", () => {
  const dom = new JSDOM("<!doctype html><button id=\"meter\"><span class=\"context-meter-label\">0%</span></button>");
  const meter = dom.window.document.querySelector("#meter");
  updateContextMeterElement(meter, contextUsageSnapshot({
    messages: [{ content: "x".repeat(4000) }],
    model: "MiniMax-M2.7"
  }));

  assert.match(meter.querySelector(".context-meter-label").textContent, /%/);
  assert.match(meter.title, /Estimated tokens/);
  assert.match(meter.getAttribute("aria-label"), /Context usage/);
});

test("composer runtime renders a vNext-style context popover without chat injection", () => {
  const dom = new JSDOM("<!doctype html><section id=\"popover\"></section>");
  const popover = dom.window.document.querySelector("#popover");
  let compacted = false;
  let closed = false;
  renderContextMemoryPopover(popover, contextUsageSnapshot({
    attachments: [{ content: "note" }],
    messages: [{ content: "conversation" }],
    model: "MiniMax-M2.7",
    pageSnapshot: { title: "Page", url: "https://example.com", text: "page text" }
  }), {
    notice: "Compact memory refreshed locally.",
    onClose: () => {
      closed = true;
    },
    onCompact: () => {
      compacted = true;
    }
  });

  assert.match(popover.textContent, /Context map/);
  assert.match(popover.textContent, /Raw transcript/);
  assert.match(popover.textContent, /Compact memory/);
  assert.match(popover.textContent, /Page context/);
  assert.match(popover.textContent, /Compact memory refreshed locally/);
  popover.querySelector("button").click();
  assert.equal(compacted, true);
  popover.querySelectorAll("button")[1].click();
  assert.equal(closed, true);
});

test("composer runtime exposes GPT thinking-depth capability only for GPT routes", () => {
  assert.equal(supportsThinkingDepth("gpt-5.5"), true);
  assert.equal(supportsThinkingDepth("MiniMax-M2.7"), false);
  assert.equal(supportsThinkingDepth("__auto__"), false);
});

test("dictation controller starts speech recognition and appends transcript without blocking on getUserMedia", async () => {
  const dom = new JSDOM("<!doctype html><button id=\"mic\"></button><textarea id=\"input\"></textarea>");
  globalThis.Event = dom.window.Event;
  let recognitionInstance = null;
  class FakeRecognition {
    constructor() {
      recognitionInstance = this;
      this.continuous = null;
      this.interimResults = null;
      this.lang = "";
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    }
    start() {
      this.started = true;
    }
    stop() {
      this.stopped = true;
      this.onend?.();
    }
  }
  const button = dom.window.document.querySelector("#mic");
  const commandInput = dom.window.document.querySelector("#input");
  const statuses = [];
  const messages = [];
  const transcripts = [];
  const controller = createDictationController({
    addMessage: async (role, content) => messages.push({ role, content }),
    button,
    commandInput,
    navigatorRef: {
      mediaDevices: {
        getUserMedia: async () => {
          throw new Error("preflight microphone probe should not block speech recognition");
        }
      }
    },
    onTranscript: (text) => transcripts.push(text),
    setStatus: (status) => statuses.push(status),
    windowRef: { SpeechRecognition: FakeRecognition }
  });

  controller.toggle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(recognitionInstance.started, true);
  assert.equal(button.getAttribute("aria-pressed"), "true");

  recognitionInstance.onresult({
    results: [[{ transcript: "dictated words" }]]
  });
  assert.equal(commandInput.value, "dictated words");
  assert.deepEqual(transcripts, ["dictated words"]);

  controller.toggle();
  assert.equal(recognitionInstance.stopped, true);
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.deepEqual(messages, []);
  assert.ok(statuses.includes("Listening"));
  delete globalThis.Event;
});

test("dictation controller diagnoses denied speech recognition through microphone access", async () => {
  const dom = new JSDOM("<!doctype html><button id=\"mic\"></button><textarea id=\"input\"></textarea>");
  globalThis.Event = dom.window.Event;
  let recognitionInstance = null;
  class FakeRecognition {
    constructor() {
      recognitionInstance = this;
      this.onerror = null;
      this.onend = null;
    }
    start() {
      this.started = true;
    }
    stop() {
      this.onend?.();
    }
  }
  const notFound = new Error("no microphone");
  notFound.name = "NotFoundError";
  const messages = [];
  const controller = createDictationController({
    addMessage: async (role, content) => messages.push({ role, content }),
    button: dom.window.document.querySelector("#mic"),
    commandInput: dom.window.document.querySelector("#input"),
    navigatorRef: {
      mediaDevices: {
        getUserMedia: async () => {
          throw notFound;
        }
      }
    },
    windowRef: { SpeechRecognition: FakeRecognition }
  });

  controller.toggle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  recognitionInstance.onerror({ error: "not-allowed" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /No microphone input device was found/);
  delete globalThis.Event;
});
