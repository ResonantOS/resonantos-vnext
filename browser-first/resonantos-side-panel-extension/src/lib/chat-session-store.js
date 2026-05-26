const defaultNow = () => new Date().toISOString();
const defaultId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createChatSessionStore({
  storage,
  storageKeys,
  getModel,
  getThinkingDepth,
  setModel,
  setThinkingDepth,
  isAllowedModel,
  isAllowedThinkingDepth,
  now = defaultNow,
  createId = defaultId
}) {
  let messages = [];
  let forks = [];
  let attachments = [];

  const validMessage = (message) =>
    message &&
    ["user", "assistant", "system"].includes(message.role) &&
    typeof message.content === "string";

  async function persist() {
    await storage?.set?.({
      [storageKeys.messages]: messages,
      [storageKeys.forks]: forks,
      [storageKeys.model]: getModel(),
      [storageKeys.thinkingDepth]: getThinkingDepth(),
      [storageKeys.attachments]: attachments
    }).catch(() => undefined);
  }

  async function hydrate() {
    const settings = await storage?.get?.([
      storageKeys.messages,
      storageKeys.forks,
      storageKeys.model,
      storageKeys.thinkingDepth,
      storageKeys.attachments
    ]).catch(() => ({}));
    if (settings?.[storageKeys.model] && isAllowedModel(settings[storageKeys.model])) {
      setModel(settings[storageKeys.model]);
    }
    if (settings?.[storageKeys.thinkingDepth] && isAllowedThinkingDepth(settings[storageKeys.thinkingDepth])) {
      setThinkingDepth(settings[storageKeys.thinkingDepth]);
    }
    messages = Array.isArray(settings?.[storageKeys.messages]) ? settings[storageKeys.messages].filter(validMessage) : [];
    forks = Array.isArray(settings?.[storageKeys.forks]) ? settings[storageKeys.forks] : [];
    attachments = Array.isArray(settings?.[storageKeys.attachments]) ? settings[storageKeys.attachments] : [];
    return snapshot();
  }

  function snapshot() {
    return {
      messages,
      forks,
      attachments
    };
  }

  function getMessages() {
    return messages;
  }

  function getForks() {
    return forks;
  }

  function getAttachments() {
    return attachments;
  }

  function findMessage(id) {
    return messages.find((message) => message.id === id) ?? null;
  }

  async function addMessage(role, content, { persist: shouldPersist = true, usage = null } = {}) {
    const text = String(content ?? "").trim();
    if (!text) return null;
    const message = {
      id: createId(),
      role,
      content: text,
      usage,
      createdAt: now()
    };
    messages = [...messages, message];
    if (shouldPersist) {
      await persist();
    }
    return message;
  }

  async function forkFromMessage(id) {
    const index = messages.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const fork = {
      id: `fork-${Date.now()}`,
      sourceMessageId: id,
      createdAt: now(),
      messages: messages.slice(0, index + 1)
    };
    forks = [...forks, fork];
    messages = fork.messages.map((message) => ({ ...message }));
    await persist();
    return fork;
  }

  async function deleteMessage(id) {
    const before = messages.length;
    messages = messages.filter((message) => message.id !== id);
    if (messages.length === before) return false;
    await persist();
    return true;
  }

  async function trimToPreviousUserMessage(id) {
    const index = messages.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const userIndex = messages.slice(0, index).findLastIndex((message) => message.role === "user");
    if (userIndex < 0) return null;
    const userMessage = messages[userIndex];
    messages = messages.slice(0, userIndex + 1);
    await persist();
    return userMessage;
  }

  async function addAttachments(nextAttachments) {
    attachments = [...attachments, ...nextAttachments];
    await persist();
    return attachments;
  }

  async function removeAttachment(id) {
    attachments = attachments.filter((attachment) => attachment.id !== id);
    await persist();
    return attachments;
  }

  async function clearAttachments() {
    attachments = [];
    await persist();
    return attachments;
  }

  return {
    addAttachments,
    addMessage,
    clearAttachments,
    deleteMessage,
    findMessage,
    forkFromMessage,
    getAttachments,
    getForks,
    getMessages,
    hydrate,
    persist,
    removeAttachment,
    snapshot,
    trimToPreviousUserMessage
  };
}
