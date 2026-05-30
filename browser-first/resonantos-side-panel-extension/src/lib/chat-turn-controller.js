export const DEFAULT_MAX_HISTORY_MESSAGES = 16;

export function pageContextForSnapshot(snapshot) {
  if (!snapshot) return null;
  const text = String(snapshot.text ?? "").slice(0, 7000);
  return [
    `Title: ${snapshot.title || "Untitled"}`,
    `URL: ${snapshot.url || "unknown"}`,
    text ? `Visible text:\n${text}` : ""
  ].filter(Boolean).join("\n\n");
}

export function runtimeContextForAttachments(attachments) {
  return attachments.length
    ? `Composer attachments:\n${attachments.map((item) => `- ${item.name}: ${item.content ?? item.summary}`).join("\n")}`
    : null;
}

export function providerMessagesFromHistory(messages, maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES) {
  return messages
    .filter((message) => ["user", "assistant"].includes(message.role))
    .slice(-maxHistoryMessages)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function createChatTurnController({
  addMessage,
  bridgeRequest,
  chatSessionStore,
  clearActivitySoon,
  clearAttachments,
  getLastSnapshot,
  getModel,
  getSystemPrompt = () => "",
  getThinkingDepth,
  maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES,
  setActivity,
  setStatus,
  setTurnBusy = () => undefined
}) {
  let activeAbortController = null;

  async function bridgeChat({ signal } = {}) {
    const attachments = chatSessionStore.getAttachments();
    return bridgeRequest("/augmentor/chat", {
      method: "POST",
      signal,
      body: {
        model: getModel(),
        workload: "augmentor-chat",
        thinkingDepth: getThinkingDepth(),
        systemPrompt: getSystemPrompt(),
        pageContext: pageContextForSnapshot(getLastSnapshot()),
        runtimeContext: runtimeContextForAttachments(attachments),
        messages: providerMessagesFromHistory(chatSessionStore.getMessages(), maxHistoryMessages)
      }
    });
  }

  async function runChatTurn() {
    if (activeAbortController) return;
    activeAbortController = new AbortController();
    setTurnBusy(true, { canStop: true });
    setStatus("Thinking");
    setActivity("thinking", "Thinking", "Calling the selected model route");
    try {
      const result = await bridgeChat({ signal: activeAbortController.signal });
      setStatus("Writing");
      setActivity("writing", "Writing response", result.model || getModel());
      await addMessage("assistant", result.reply, { usage: result.usage ?? { providerId: result.providerId, model: result.model } });
      await clearAttachments();
      setStatus("Ready");
    } catch (error) {
      if (error?.name === "AbortError") {
        setStatus("Stopped");
        await addMessage("system", "Response stopped by the human before a reply was returned.");
        return;
      }
      setStatus("Provider failed");
      await addMessage("system", error instanceof Error ? error.message : String(error));
    } finally {
      activeAbortController = null;
      setTurnBusy(false, { canStop: false });
      clearActivitySoon();
    }
  }

  function stopChatTurn() {
    activeAbortController?.abort();
  }

  return {
    bridgeChat,
    runChatTurn,
    stopChatTurn
  };
}
