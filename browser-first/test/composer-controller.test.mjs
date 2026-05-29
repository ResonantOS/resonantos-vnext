import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createComposerController } from "../resonantos-side-panel-extension/src/lib/composer-controller.js";

function createHarness() {
  const dom = new JSDOM('<form id="form"><textarea id="input"></textarea></form>');
  globalThis.Event = dom.window.Event;
  const writes = [];
  let clipboardText = "";
  const form = dom.window.document.querySelector("#form");
  const input = dom.window.document.querySelector("#input");
  form.requestSubmit = () => writes.push(["submit"]);
  const controller = createComposerController({
    commandForm: form,
    commandInput: input,
    navigator: {
      clipboard: {
        readText: async () => clipboardText,
        writeText: async (text) => {
          clipboardText = text;
          writes.push(["clipboard", text]);
        }
      }
    }
  });
  return {
    controller,
    input,
    setClipboard: (text) => {
      clipboardText = text;
    },
    writes
  };
}

function createNativeClipboardHarness() {
  const dom = new JSDOM('<form id="form"><textarea id="input"></textarea></form>');
  globalThis.Event = dom.window.Event;
  const writes = [];
  const form = dom.window.document.querySelector("#form");
  const input = dom.window.document.querySelector("#input");
  form.requestSubmit = () => writes.push(["submit"]);
  dom.window.document.execCommand = (command) => {
    writes.push(["execCommand", command, input.selectionStart, input.selectionEnd]);
    return true;
  };
  const controller = createComposerController({
    commandForm: form,
    commandInput: input,
    navigator: {}
  });
  return {
    controller,
    input,
    writes
  };
}

function keyEvent(key, options = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    metaKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    shiftKey: false,
    ...options,
    key
  };
}

test("composer controller supports undo and enter submit", () => {
  const harness = createHarness();
  harness.input.value = "first";
  harness.controller.pushUndoSnapshot();
  harness.input.value = "second";
  harness.controller.pushUndoSnapshot();

  harness.controller.handleKeydown(keyEvent("z", { metaKey: true }));

  assert.equal(harness.input.value, "first");

  harness.controller.handleKeydown(keyEvent("Enter"));
  assert.deepEqual(harness.writes.at(-1), ["submit"]);

  harness.controller.handleKeydown(keyEvent("Enter", { shiftKey: true }));
  assert.deepEqual(harness.writes.at(-1), ["submit"]);
});

test("composer controller supports select all, copy, cut, and paste", async () => {
  const harness = createHarness();
  harness.input.value = "hello world";
  harness.input.setSelectionRange(0, 5);

  await harness.controller.handleClipboardShortcut(keyEvent("c", { metaKey: true }));
  assert.deepEqual(harness.writes.at(-1), ["clipboard", "hello"]);

  await harness.controller.handleClipboardShortcut(keyEvent("x", { metaKey: true }));
  assert.equal(harness.input.value, " world");
  assert.deepEqual(harness.writes.at(-1), ["clipboard", "hello"]);

  harness.setClipboard("hey");
  harness.input.setSelectionRange(0, 0);
  await harness.controller.handleClipboardShortcut(keyEvent("v", { metaKey: true }));
  assert.equal(harness.input.value, "hey world");

  harness.controller.handleKeydown(keyEvent("a", { metaKey: true }));
  assert.equal(harness.input.selectionStart, 0);
  assert.equal(harness.input.selectionEnd, harness.input.value.length);
});

test("composer controller does not block native paste when extension clipboard API is unavailable", async () => {
  const harness = createNativeClipboardHarness();
  harness.input.value = "native";
  const paste = keyEvent("v", { metaKey: true });

  harness.controller.handleKeydown(paste);
  assert.equal(paste.defaultPrevented, undefined);

  const handled = await harness.controller.handleClipboardShortcut(keyEvent("v", { metaKey: true }));
  assert.equal(handled, false);
});

test("composer controller falls back to native copy for copy and cut", async () => {
  const harness = createNativeClipboardHarness();
  harness.input.value = "hello world";
  harness.input.setSelectionRange(0, 5);

  await harness.controller.handleClipboardShortcut(keyEvent("c", { metaKey: true }));
  assert.deepEqual(harness.writes.at(-1), ["execCommand", "copy", 0, 5]);

  await harness.controller.handleClipboardShortcut(keyEvent("x", { metaKey: true }));
  assert.equal(harness.input.value, " world");
  assert.deepEqual(harness.writes.at(-1), ["execCommand", "copy", 0, 5]);
});
