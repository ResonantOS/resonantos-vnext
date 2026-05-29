export function createComposerController({ commandForm, commandInput, navigator }) {
  let undoStack = [""];
  let undoApplying = false;
  const ownerDocument = commandInput.ownerDocument ?? globalThis.document;

  function resetUndoStack(value = commandInput.value) {
    undoStack = [String(value ?? "")];
  }

  function pushUndoSnapshot(value = commandInput.value) {
    if (undoApplying) return;
    const snapshot = String(value ?? "");
    if (undoStack.at(-1) === snapshot) return;
    undoStack = [...undoStack, snapshot].slice(-80);
  }

  function selection() {
    return {
      start: commandInput.selectionStart ?? commandInput.value.length,
      end: commandInput.selectionEnd ?? commandInput.value.length
    };
  }

  function replaceSelection(text) {
    pushUndoSnapshot();
    const { start, end } = selection();
    commandInput.setRangeText(String(text ?? ""), start, end, "end");
    commandInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function writeClipboardText(text) {
    const value = String(text ?? "");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    if (ownerDocument?.execCommand) {
      const { start, end } = selection();
      const previousActiveElement = ownerDocument.activeElement;
      commandInput.focus();
      if (start === end) {
        commandInput.select();
      }
      const copied = ownerDocument.execCommand("copy");
      commandInput.setSelectionRange(start, end);
      if (previousActiveElement?.focus && previousActiveElement !== commandInput) {
        previousActiveElement.focus();
      }
      return copied;
    }
    return false;
  }

  async function readClipboardText() {
    if (!navigator.clipboard?.readText) return "";
    return navigator.clipboard.readText();
  }

  function undoInput() {
    const current = commandInput.value;
    if (undoStack.at(-1) !== current) {
      pushUndoSnapshot(current);
    }
    if (undoStack.length <= 1) return;
    undoStack = undoStack.slice(0, -1);
    const previous = undoStack.at(-1) ?? "";
    undoApplying = true;
    commandInput.value = previous;
    commandInput.setSelectionRange(previous.length, previous.length);
    commandInput.dispatchEvent(new Event("input", { bubbles: true }));
    undoApplying = false;
  }

  async function handleClipboardShortcut(event) {
    const shortcutKey = event.key.toLowerCase();
    if (!(event.metaKey || event.ctrlKey) || event.altKey || !["x", "c", "v"].includes(shortcutKey)) {
      return false;
    }
    if (shortcutKey === "v" && !navigator.clipboard?.readText) {
      return false;
    }
    event.preventDefault();
    const { start, end } = selection();
    const selectedText = commandInput.value.slice(start, end);
    if (shortcutKey === "c") {
      await writeClipboardText(selectedText || commandInput.value).catch(() => undefined);
      return true;
    }
    if (shortcutKey === "x") {
      await writeClipboardText(selectedText || commandInput.value).catch(() => undefined);
      if (selectedText) {
        replaceSelection("");
      } else {
        pushUndoSnapshot();
        commandInput.value = "";
        commandInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    }
    const pastedText = await readClipboardText().catch(() => "");
    if (pastedText) {
      replaceSelection(pastedText);
    }
    return true;
  }

  function handleKeydown(event) {
    if (event.isComposing) return;
    const shortcutKey = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey && shortcutKey === "z") {
      event.preventDefault();
      undoInput();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.altKey && ["x", "c", "v"].includes(shortcutKey)) {
      if (shortcutKey === "v" && !navigator.clipboard?.readText) {
        return;
      }
      void handleClipboardShortcut(event);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.altKey && shortcutKey === "a") {
      event.preventDefault();
      commandInput.select();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commandForm.requestSubmit();
    }
  }

  function bind() {
    commandInput.addEventListener("keydown", handleKeydown);
    commandInput.addEventListener("input", () => {
      pushUndoSnapshot();
    });
  }

  return {
    bind,
    handleClipboardShortcut,
    handleKeydown,
    pushUndoSnapshot,
    resetUndoStack,
    undoInput
  };
}
