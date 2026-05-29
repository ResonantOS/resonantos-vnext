export function createComposerController({ commandForm, commandInput, navigator, forceClipboardFallback = false }) {
  let undoStack = [""];
  let undoApplying = false;

  function selectedRange() {
    const start = commandInput.selectionStart ?? 0;
    const end = commandInput.selectionEnd ?? start;
    return {
      end,
      selectedText: commandInput.value.slice(start, end),
      start
    };
  }

  function resetUndoStack(value = commandInput.value) {
    undoStack = [String(value ?? "")];
  }

  function pushUndoSnapshot(value = commandInput.value) {
    if (undoApplying) return;
    const snapshot = String(value ?? "");
    if (undoStack.at(-1) === snapshot) return;
    undoStack = [...undoStack, snapshot].slice(-80);
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

  function replaceSelection(text) {
    const { start, end } = selectedRange();
    commandInput.setRangeText(String(text ?? ""), start, end, "end");
    commandInput.dispatchEvent(new Event("input", { bubbles: true }));
    pushUndoSnapshot();
  }

  async function handleClipboardShortcut(event) {
    const shortcutKey = event.key.toLowerCase();
    if (!(event.metaKey || event.ctrlKey) || event.altKey || !["x", "c", "v"].includes(shortcutKey)) {
      return false;
    }
    const clipboard = navigator?.clipboard;
    const { selectedText } = selectedRange();

    if (shortcutKey === "c") {
      if (!selectedText || !clipboard?.writeText) return false;
      event.preventDefault();
      await clipboard.writeText(selectedText);
      return true;
    }

    if (shortcutKey === "x") {
      if (!selectedText || !clipboard?.writeText) return false;
      event.preventDefault();
      await clipboard.writeText(selectedText);
      replaceSelection("");
      return true;
    }

    if (shortcutKey === "v") {
      if (!clipboard?.readText) return false;
      event.preventDefault();
      replaceSelection(await clipboard.readText());
      return true;
    }

    return false;
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
      if (!forceClipboardFallback && !event.resonantosUseClipboardFallback) {
        return;
      }
      void handleClipboardShortcut(event).catch(() => undefined);
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
    replaceSelection,
    resetUndoStack,
    selectedRange,
    undoInput
  };
}
