import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createComposerController } from "../resonantos-side-panel-extension/src/lib/composer-controller.js";

function createHarness() {
  const dom = new JSDOM('<form id="form"><textarea id="input"></textarea></form>');
  globalThis.Event = dom.window.Event;
  const writes = [];
  const form = dom.window.document.querySelector("#form");
  const input = dom.window.document.querySelector("#input");
  form.requestSubmit = () => writes.push(["submit"]);
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

test("composer controller supports select all without blocking native clipboard shortcuts", async () => {
  const harness = createHarness();
  harness.input.value = "hello world";

  harness.controller.handleKeydown(keyEvent("a", { metaKey: true }));
  assert.equal(harness.input.selectionStart, 0);
  assert.equal(harness.input.selectionEnd, harness.input.value.length);

  for (const shortcut of ["x", "c", "v"]) {
    const event = keyEvent(shortcut, { metaKey: true });
    harness.controller.handleKeydown(event);
    assert.equal(event.defaultPrevented, undefined);
    assert.equal(await harness.controller.handleClipboardShortcut(event), false);
  }

  assert.equal(harness.input.value, "hello world");
});
