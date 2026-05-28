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
  let sessions = [];
  let activeSessionId = "";

  const validMessage = (message) =>
    message &&
    ["user", "assistant", "system"].includes(message.role) &&
    typeof message.content === "string";

  const sessionTitleFromMessages = (items = []) => {
    const firstUser = items.find((message) => message.role === "user");
    const title = String(firstUser?.content ?? "New chat").replace(/\s+/g, " ").trim();
    return title.length > 46 ? `${title.slice(0, 43)}...` : title;
  };

  const normalizeSession = (session) => {
    const normalizedMessages = Array.isArray(session?.messages) ? session.messages.filter(validMessage) : [];
    const titleEdited = Boolean(session?.titleEdited);
    return {
      id: String(session?.id || `session-${createId()}`),
      title: String(session?.title || sessionTitleFromMessages(normalizedMessages)).trim() || "New chat",
      titleEdited,
      workspaceId: typeof session?.workspaceId === "string" ? session.workspaceId : "answer",
      createdAt: session?.createdAt || now(),
      updatedAt: session?.updatedAt || session?.createdAt || now(),
      messages: normalizedMessages
    };
  };

  const ensureSession = () => {
    if (!sessions.length) {
      sessions = [normalizeSession({
        id: `session-${createId()}`,
        title: "New chat",
        messages: [],
        createdAt: now(),
        updatedAt: now()
      })];
    }
    if (!activeSessionId || !sessions.some((session) => session.id === activeSessionId)) {
      activeSessionId = sessions[0].id;
    }
    const active = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
    activeSessionId = active.id;
    messages = active.messages.map((message) => ({ ...message }));
  };

  const writeActiveSession = () => {
    if (!sessions.length) {
      sessions = [normalizeSession({
        id: activeSessionId || `session-${createId()}`,
        title: sessionTitleFromMessages(messages),
        messages,
        createdAt: messages[0]?.createdAt || now(),
        updatedAt: messages.at(-1)?.createdAt || now()
      })];
      activeSessionId = sessions[0].id;
    }
    if (!activeSessionId || !sessions.some((session) => session.id === activeSessionId)) {
      activeSessionId = sessions[0].id;
    }
    sessions = sessions.map((session) => session.id === activeSessionId
      ? {
          ...session,
          title: session.titleEdited ? session.title : sessionTitleFromMessages(messages),
          updatedAt: now(),
          messages: messages.map((message) => ({ ...message }))
        }
      : session);
  };

  async function persist() {
    writeActiveSession();
    await storage?.set?.({
      [storageKeys.messages]: messages,
      [storageKeys.forks]: forks,
      [storageKeys.sessions]: sessions,
      [storageKeys.activeSessionId]: activeSessionId,
      [storageKeys.model]: getModel(),
      [storageKeys.thinkingDepth]: getThinkingDepth(),
      [storageKeys.attachments]: attachments
    }).catch(() => undefined);
  }

  async function hydrate() {
    const settings = await storage?.get?.([
      storageKeys.messages,
      storageKeys.forks,
      storageKeys.sessions,
      storageKeys.activeSessionId,
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
    const legacyMessages = Array.isArray(settings?.[storageKeys.messages]) ? settings[storageKeys.messages].filter(validMessage) : [];
    sessions = Array.isArray(settings?.[storageKeys.sessions])
      ? settings[storageKeys.sessions].map(normalizeSession)
      : [];
    if (!sessions.length && legacyMessages.length) {
      sessions = [normalizeSession({
        title: sessionTitleFromMessages(legacyMessages),
        messages: legacyMessages,
        createdAt: legacyMessages[0]?.createdAt || now(),
        updatedAt: legacyMessages.at(-1)?.createdAt || now()
      })];
    }
    activeSessionId = String(settings?.[storageKeys.activeSessionId] || sessions[0]?.id || "");
    ensureSession();
    forks = Array.isArray(settings?.[storageKeys.forks]) ? settings[storageKeys.forks] : [];
    attachments = Array.isArray(settings?.[storageKeys.attachments]) ? settings[storageKeys.attachments] : [];
    return snapshot();
  }

  function snapshot() {
    return {
      messages,
      sessions,
      activeSessionId,
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

  function getSessions() {
    return sessions;
  }

  function getActiveSessionId() {
    return activeSessionId;
  }

  function getActiveSession() {
    return sessions.find((session) => session.id === activeSessionId) ?? null;
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
    writeActiveSession();
    if (shouldPersist) {
      await persist();
    }
    return message;
  }

  async function createSession({ workspaceId = "answer" } = {}) {
    writeActiveSession();
    const session = normalizeSession({
      title: "New chat",
      workspaceId,
      messages: [],
      createdAt: now(),
      updatedAt: now()
    });
    sessions = [session, ...sessions];
    activeSessionId = session.id;
    messages = [];
    attachments = [];
    await persist();
    return session;
  }

  async function ensureFreshSession({ workspaceId = "answer" } = {}) {
    ensureSession();
    const active = getActiveSession();
    const activeIsBlank = active && active.messages.length === 0 && active.title === "New chat";
    if (activeIsBlank) {
      return active;
    }
    return createSession({ workspaceId });
  }

  async function switchSession(id) {
    writeActiveSession();
    const session = sessions.find((item) => item.id === id);
    if (!session) return null;
    activeSessionId = session.id;
    messages = session.messages.map((message) => ({ ...message }));
    attachments = [];
    await persist();
    return session;
  }

  async function renameSession(id, title) {
    const nextTitle = String(title ?? "").replace(/\s+/g, " ").trim();
    if (!nextTitle) return null;
    let renamed = null;
    sessions = sessions.map((session) => {
      if (session.id !== id) return session;
      renamed = {
        ...session,
        title: nextTitle.length > 60 ? `${nextTitle.slice(0, 57)}...` : nextTitle,
        titleEdited: true,
        updatedAt: now()
      };
      return renamed;
    });
    if (!renamed) return null;
    await persist();
    return renamed;
  }

  async function deleteSession(id) {
    if (!sessions.some((session) => session.id === id)) {
      return false;
    }
    sessions = sessions.filter((session) => session.id !== id);
    if (!sessions.length) {
      const session = normalizeSession({
        title: "New chat",
        messages: [],
        createdAt: now(),
        updatedAt: now()
      });
      sessions = [session];
      activeSessionId = session.id;
      messages = [];
    } else if (activeSessionId === id) {
      activeSessionId = sessions[0].id;
      messages = sessions[0].messages.map((message) => ({ ...message }));
    }
    attachments = [];
    await persist();
    return true;
  }

  async function setActiveSessionWorkspace(workspaceId) {
    const normalized = String(workspaceId || "answer");
    sessions = sessions.map((session) => session.id === activeSessionId
      ? { ...session, workspaceId: normalized, updatedAt: now() }
      : session);
    await persist();
    return getActiveSession();
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
    const session = normalizeSession({
      id: fork.id,
      title: `Fork: ${sessionTitleFromMessages(messages)}`,
      messages,
      createdAt: fork.createdAt,
      updatedAt: fork.createdAt
    });
    sessions = [session, ...sessions];
    activeSessionId = session.id;
    await persist();
    return fork;
  }

  async function deleteMessage(id) {
    const before = messages.length;
    messages = messages.filter((message) => message.id !== id);
    if (messages.length === before) return false;
    writeActiveSession();
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
    writeActiveSession();
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
    createSession,
    deleteMessage,
    deleteSession,
    ensureFreshSession,
    findMessage,
    forkFromMessage,
    getActiveSession,
    getActiveSessionId,
    getAttachments,
    getForks,
    getMessages,
    getSessions,
    hydrate,
    persist,
    renameSession,
    removeAttachment,
    setActiveSessionWorkspace,
    snapshot,
    switchSession,
    trimToPreviousUserMessage
  };
}
