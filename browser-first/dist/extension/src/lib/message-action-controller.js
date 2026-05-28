export function fileLooksTextLike(file) {
  return /^(text\/|application\/(json|xml|javascript|typescript))/i.test(file.type) ||
    /\.(md|txt|json|csv|ts|tsx|js|jsx|css|html|xml|yaml|yml)$/i.test(file.name);
}

export function createMessageActionController({
  addMessage,
  bridgeRequest,
  chatSessionStore,
  commandInput,
  composerController,
  fileInput,
  flashCopied,
  getLastSnapshot,
  getRespondToCommand,
  navigator,
  renderAttachments,
  renderMessages,
  setStatus
}) {
  async function clearAttachments() {
    await chatSessionStore.clearAttachments();
    renderAttachments();
  }

  async function copyMessage(id) {
    const message = chatSessionStore.findMessage(id);
    if (!message) return;
    await navigator.clipboard?.writeText?.(message.content).catch(() => undefined);
    flashCopied(id);
    setStatus("Copied");
  }

  async function forkFromMessage(id) {
    const fork = await chatSessionStore.forkFromMessage(id);
    if (!fork) return;
    renderMessages();
    setStatus("Forked");
  }

  async function deleteMessage(id) {
    await chatSessionStore.deleteMessage(id);
    renderMessages();
    setStatus("Deleted");
  }

  function editMessage(id) {
    const message = chatSessionStore.findMessage(id);
    if (!message || message.role !== "user") return;
    commandInput.value = message.content;
    composerController.resetUndoStack(message.content);
    commandInput.focus();
    setStatus("Editing");
  }

  async function saveMessageToArchive(id) {
    const message = chatSessionStore.findMessage(id);
    if (!message) return;
    setStatus("Saving");
    try {
      const result = await bridgeRequest("/archive/intake", {
        method: "POST",
        body: {
          title: `Augmentor message ${new Date(message.createdAt).toLocaleString()}`,
          content: message.content,
          sourceMessageId: message.id,
          url: getLastSnapshot()?.url ?? null
        }
      });
      await addMessage("system", `Saved to Living Archive intake: ${result.path}`);
      setStatus("Ready");
    } catch (error) {
      setStatus("Archive failed");
      await addMessage("system", error instanceof Error ? error.message : String(error));
    }
  }

  async function showMessageStats(id) {
    const message = chatSessionStore.findMessage(id);
    if (!message?.usage) {
      await addMessage("system", "No generation telemetry is available for this message.");
      return;
    }
    await addMessage("system", `Generation stats:\n${JSON.stringify(message.usage, null, 2)}`);
  }

  async function regenerateFromMessage(id) {
    const userMessage = await chatSessionStore.trimToPreviousUserMessage(id);
    if (!userMessage) {
      await addMessage("system", "No previous user message is available for regeneration.");
      return;
    }
    renderMessages();
    await getRespondToCommand()(userMessage.content);
  }

  async function attachFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const nextAttachments = [];
    for (const [index, file] of files.entries()) {
      let content = "";
      if (fileLooksTextLike(file) && file.size <= 64 * 1024) {
        content = (await file.text()).slice(0, 12000);
      }
      nextAttachments.push({
        id: `${file.name}-${file.size}-${Date.now()}-${index}`,
        name: file.name,
        size: file.size,
        type: file.type,
        summary: `${Math.round(file.size / 1024)} KB${content ? " · embedded text" : " · metadata only"}`,
        content
      });
    }
    await chatSessionStore.addAttachments(nextAttachments);
    if (fileInput) {
      fileInput.value = "";
    }
    renderAttachments();
    setStatus("Attached");
  }

  return {
    attachFiles,
    clearAttachments,
    copyMessage,
    deleteMessage,
    editMessage,
    forkFromMessage,
    regenerateFromMessage,
    saveMessageToArchive,
    showMessageStats
  };
}
