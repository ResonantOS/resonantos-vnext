import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createComposerController } from "../resonantos-side-panel-extension/src/lib/composer-controller.js";

function createHarness({ clipboard = {} } = {}) {
  const dom = new JSDOM('<form id="form"><textarea id="input"></textarea></form>');
  globalThis.Event = dom.window.Event;
  const writes = [];
  const form = dom.window.document.querySelector("#form");
  const input = dom.window.document.querySelector("#input");
  form.requestSubmit = () => writes.push(["submit"]);
  const controller = createComposerController({
    commandForm: form,
    commandInput: input,
    navigator: { clipboard }
  });
  return {
    clipboard,
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

test("composer controller supports select all without blocking native clipboard shortcuts", async () => {
  let clipboardText = "";
  const harness = createHarness({
    clipboard: {
      readText: async () => clipboardText,
      writeText: async (value) => {
        clipboardText = value;
      }
    }
  });
  harness.input.value = "hello world";

  harness.controller.handleKeydown(keyEvent("a", { metaKey: true }));
  assert.equal(harness.input.selectionStart, 0);
  assert.equal(harness.input.selectionEnd, harness.input.value.length);

  for (const shortcut of ["x", "c", "v"]) {
    const event = keyEvent(shortcut, { metaKey: true });
    harness.controller.handleKeydown(event);
    assert.equal(event.defaultPrevented, undefined);
  }

  assert.equal(harness.input.value, "hello world");
  assert.equal(clipboardText, "");
});

test("composer controller provides explicit clipboard fallback when browser clipboard is available", async () => {
  let clipboardText = "";
  const harness = createHarness({
    clipboard: {
      readText: async () => clipboardText,
      writeText: async (value) => {
        clipboardText = value;
      }
    }
  });
  harness.input.value = "alpha beta";
  harness.input.setSelectionRange(6, 10);

  const copyEvent = keyEvent("c", { metaKey: true });
  assert.equal(await harness.controller.handleClipboardShortcut(copyEvent), true);
  assert.equal(copyEvent.defaultPrevented, true);
  assert.equal(clipboardText, "beta");

  harness.input.setSelectionRange(0, 5);
  const cutEvent = keyEvent("x", { metaKey: true });
  assert.equal(await harness.controller.handleClipboardShortcut(cutEvent), true);
  assert.equal(cutEvent.defaultPrevented, true);
  assert.equal(clipboardText, "alpha");
  assert.equal(harness.input.value, " beta");

  clipboardText = "gamma";
  harness.input.setSelectionRange(0, 0);
  const pasteEvent = keyEvent("v", { metaKey: true });
  assert.equal(await harness.controller.handleClipboardShortcut(pasteEvent), true);
  assert.equal(pasteEvent.defaultPrevented, true);
  assert.equal(harness.input.value, "gamma beta");
});

test("composer controller can opt into clipboard fallback for restricted runtimes", () => {
  let clipboardText = "";
  const dom = new JSDOM('<form id="form"><textarea id="input"></textarea></form>');
  globalThis.Event = dom.window.Event;
  const input = dom.window.document.querySelector("#input");
  input.value = "alpha beta";
  input.setSelectionRange(6, 10);
  const controller = createComposerController({
    commandForm: dom.window.document.querySelector("#form"),
    commandInput: input,
    forceClipboardFallback: true,
    navigator: {
      clipboard: {
        readText: async () => clipboardText,
        writeText: async (value) => {
          clipboardText = value;
        }
      }
    }
  });

  const event = keyEvent("x", { metaKey: true });
  controller.handleKeydown(event);

  assert.equal(event.defaultPrevented, true);
});
