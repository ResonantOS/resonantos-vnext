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
  getThinkingDepth,
  maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES,
  setActivity,
  setStatus
}) {
  async function bridgeChat() {
    const attachments = chatSessionStore.getAttachments();
    return bridgeRequest("/augmentor/chat", {
      method: "POST",
      body: {
        model: getModel(),
        thinkingDepth: getThinkingDepth(),
        pageContext: pageContextForSnapshot(getLastSnapshot()),
        runtimeContext: runtimeContextForAttachments(attachments),
        messages: providerMessagesFromHistory(chatSessionStore.getMessages(), maxHistoryMessages)
      }
    });
  }

  async function runChatTurn() {
    setStatus("Thinking");
    setActivity("thinking", "Thinking", "Calling the selected model route");
    try {
      const result = await bridgeChat();
      setStatus("Writing");
      setActivity("writing", "Writing response", result.model || getModel());
      await addMessage("assistant", result.reply, { usage: result.usage ?? { providerId: result.providerId, model: result.model } });
      await clearAttachments();
      setStatus("Ready");
    } catch (error) {
      setStatus("Provider failed");
      await addMessage("system", error instanceof Error ? error.message : String(error));
    } finally {
      clearActivitySoon();
    }
  }

  return {
    bridgeChat,
    runChatTurn
  };
}
