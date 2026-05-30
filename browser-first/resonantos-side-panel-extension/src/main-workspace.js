import {
  parseDraftAddonCommand,
} from "./lib/app-command-handlers.js";
import {
  normalizeBrowserUrl,
  parseAmazonShoppingTask,
  parseNaturalBrowserIntent
} from "./lib/browser-command-parser.js";
import { createBrowserPageActions } from "./lib/browser-page-actions.js";
import { createBridgeClient } from "./lib/bridge-client.js";
import { createChatSessionStore } from "./lib/chat-session-store.js";
import { createComposerController } from "./lib/composer-controller.js";
import {
  contextUsageSnapshot,
  createDictationController,
  hydrateProviderModelOptions,
  modelLabel,
  renderContextMemoryPopover,
  supportsThinkingDepth,
  updateContextMeterElement
} from "./lib/composer-runtime.js";
import { applyAppearancePreferences } from "./lib/settings/appearance-section.js";
import { renderAddOnsWorkspace } from "./lib/main-workspace-addons.js";
import { renderArtifactsWorkspace } from "./lib/main-workspace-artifacts.js";
import { renderLivingArchiveWorkspace } from "./lib/main-workspace-memory.js";
import { renderOpenCodeWorkspace } from "./lib/main-workspace-opencode.js";
import { readPersonalizationSettings } from "./lib/personalization-settings.js";
import { railSearchMatchesProject, railSearchMatchesSession } from "./lib/main-workspace-rail.js";
import {
  parseDaoSlashCommand,
  parseDraftSlashCommand,
  parseHermesSlashCommand,
  parseMemorySlashCommand,
  parseOpenCodeSlashCommand,
  planMainWorkspacePrompt
} from "./lib/main-workspace-prompt-router.js";
import { renderSettingsWorkspace } from "./lib/main-workspace-settings.js";
import { fileLooksTextLike } from "./lib/message-action-controller.js";
import { createSitePermissionStore } from "./lib/site-permission-store.js";
import { createSidePanelRenderers } from "./lib/side-panel-renderers.js";
import { createTaskConsentStore } from "./lib/task-consent-store.js";

const STORAGE_KEYS = {
  messages: "augmentorBrowserMessages",
  forks: "augmentorBrowserForks",
  sessions: "augmentorBrowserSessions",
  activeSessionId: "augmentorActiveBrowserSessionId",
  model: "augmentorModel",
  thinkingDepth: "augmentorThinkingDepth",
  attachments: "augmentorBrowserAttachments",
  projects: "augmentorBrowserProjects",
  pendingSidebarPrompt: "augmentorPendingSidebarPrompt",
  activeWorkspace: "augmentorMainWorkspace",
  augmentorConfig: "augmentorConfig",
  sitePermissions: "augmentorSitePermissions",
  sitePermissionAudit: "augmentorSitePermissionAudit",
  taskConsents: "augmentorTaskConsents",
  taskConsentAudit: "augmentorTaskConsentAudit",
  browserJobs: "augmentorBrowserJobs",
  activeBrowserJob: "augmentorActiveBrowserJob",
  appearance: "augmentorAppearancePreferences",
  starterPromptsHidden: "augmentorStarterPromptsHidden",
  userProfile: "augmentorUserProfile"
};

const transcript = document.querySelector("#transcript");
const workspaceButtons = [...document.querySelectorAll("[data-workspace]")];
const newChatButton = document.querySelector("#new-chat");
const railNewChatButton = document.querySelector("#rail-new-chat");
const railSearchToggle = document.querySelector("#rail-search-toggle");
const railSearchBox = document.querySelector("#rail-search-box");
const railSearchInput = document.querySelector("#rail-search-input");
const railClearSearch = document.querySelector("#rail-clear-search");
const railChatList = document.querySelector("#rail-chat-list");
const railNewProjectButton = document.querySelector("#rail-new-project");
const railProjectList = document.querySelector("#rail-project-list");
const railAvatar = document.querySelector("#rail-avatar");
const railUserName = document.querySelector("#rail-user-name");
const railUserSubtitle = document.querySelector("#rail-user-subtitle");
const commandForm = document.querySelector("#command-form");
const commandInput = document.querySelector("#command-input");
const attachFileButton = document.querySelector("#attach-file");
const fileInput = document.querySelector("#file-input");
const attachmentStrip = document.querySelector("#attachment-strip");
const readPageButton = document.querySelector("#read-page");
const saveIntakeButton = document.querySelector("#save-intake");
const saveSelectionButton = document.querySelector("#save-selection");
const contextToggleButton = document.querySelector("#context-toggle");
const modelSelect = document.querySelector("#model-select");
const thinkingDepthSelect = document.querySelector("#thinking-depth");
const dictateButton = document.querySelector("#dictate-button");
const contextMeter = document.querySelector("#context-meter");
const contextPopover = document.querySelector("#context-popover");
const composerNotice = document.querySelector("#composer-notice");
const connectionLine = document.querySelector("#connection-line");
const sendButton = commandForm.querySelector(".send-button");
const bridgeRequest = createBridgeClient();
let busy = false;
let activeChatAbortController = null;
let activeWorkspace = "answer";
let pendingWorkspaceAction = null;
let controlledTabId = null;
let lastSnapshot = null;
let railSearchQuery = "";
let starterPromptsHidden = false;
let contextPopoverOpen = false;
let contextCompactNotice = "";
let personalizationSettings = null;
let initialSettingsSection = "overview";
const allowedWorkspaces = new Set(["answer", "artifacts", "addons", "memory", "hermes", "opencode", "settings"]);

function applyUserProfile(profile) {
  if (!profile) return;
  const name = profile.displayName || "ResonantOS User";
  if (railAvatar) railAvatar.textContent = name.trim().charAt(0).toUpperCase() || "R";
  if (railUserName) railUserName.textContent = name;
  if (railUserSubtitle) railUserSubtitle.textContent = profile.subtitle || "Local sovereign profile";
}

async function hydratePersonalizationSettings() {
  personalizationSettings = await readPersonalizationSettings(chrome.storage?.local, STORAGE_KEYS);
  applyUserProfile(personalizationSettings.profile);
  return personalizationSettings;
}

function setComposerBusy(next) {
  busy = Boolean(next);
  commandInput.disabled = busy;
  sendButton.classList.toggle("is-stop", busy);
  sendButton.setAttribute("aria-label", busy ? "Stop response" : "Send");
  sendButton.title = busy ? "Stop response" : "Send";
  sendButton.innerHTML = busy
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="8" height="8" rx="1.8"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
}

const composerController = createComposerController({
  commandForm,
  commandInput,
  forceClipboardFallback: true,
  navigator
});
const assistantTextFromResponse = (response) => String(response?.content ?? response?.reply ?? "").trim();
const providerMessagesFromHistory = (messages, limit = 18) => messages
  .filter((message) => ["user", "assistant"].includes(message.role))
  .slice(-limit)
  .map((message) => ({ role: message.role, content: message.content }));

const chatSessionStore = createChatSessionStore({
  storage: chrome.storage?.local,
  storageKeys: STORAGE_KEYS,
  getModel: () => modelSelect.value,
  getThinkingDepth: () => thinkingDepthSelect.value,
  setModel: (model) => {
    modelSelect.value = model;
  },
  setThinkingDepth: (depth) => {
    thinkingDepthSelect.value = depth;
  },
  isAllowedModel: (model) => [...modelSelect.options].some((option) => option.value === model),
  isAllowedThinkingDepth: (depth) => [...thinkingDepthSelect.options].some((option) => option.value === depth)
});
const sitePermissionStore = createSitePermissionStore({
  storage: chrome.storage?.local,
  sitePermissionAuditStorageKey: STORAGE_KEYS.sitePermissionAudit,
  sitePermissionStorageKey: STORAGE_KEYS.sitePermissions
});
const taskConsentStore = createTaskConsentStore({
  storage: chrome.storage?.local,
  taskConsentAuditStorageKey: STORAGE_KEYS.taskConsentAudit,
  taskConsentStorageKey: STORAGE_KEYS.taskConsents
});

const isReadableBrowserTab = (tab) => typeof tab?.url === "string" && /^https?:\/\//i.test(tab.url);
const setMainActivity = (_phase, label, detail = "") => {
  updateConnectionLine(detail ? `${label}: ${detail}` : label);
};
const browserPageActions = createBrowserPageActions({
  addMessage,
  bridgeRequest,
  chrome,
  getControlledTabId: () => controlledTabId,
  getLastSnapshot: () => lastSnapshot,
  getModel: () => modelSelect.value,
  getThinkingDepth: () => thinkingDepthSelect.value,
  isReadableBrowserTab,
  normalizeBrowserUrl,
  permissionForUrl: sitePermissionStore.permissionForUrl,
  renderSitePermissionPanel: async () => undefined,
  setActivity: setMainActivity,
  setContextMeter: () => updateContextMeter(),
  setControlledTabId: (tabId) => {
    controlledTabId = tabId;
  },
  setLastSnapshot: (snapshot) => {
    lastSnapshot = snapshot;
  },
  setReadButtonTitle: (title) => {
    readPageButton.title = title;
  },
  setStatus: updateConnectionLine,
  siteKeyForUrl: sitePermissionStore.siteKeyForUrl,
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
});

async function suppressSidebarChatForMainWorkspace() {
  await chrome.runtime.sendMessage({
    channel: "resonantos.browser_first",
    type: "suppress_side_panel_on_main_workspace"
  }).catch(() => undefined);
}

const chatRenderers = createSidePanelRenderers({
  attachmentStrip,
  transcript,
  getAttachments: () => chatSessionStore.getAttachments(),
  getMessages: () => chatSessionStore.getMessages(),
  onRemoveAttachment: async (id) => {
    await chatSessionStore.removeAttachment(id);
    renderAttachments();
    updateConnectionLine("Attachment removed");
  },
  onCopyMessage: (id) => void copyMessage(chatSessionStore.findMessage(id)),
  onDeleteMessage: (id) => void deleteMessage(id),
  onEditMessage: editMessage,
  onForkMessage: (id) => void forkFromMessage(id),
  onRegenerateMessage: (id) => void regenerateFromMessage(id),
  onSaveMessageToArchive: (id) => void saveMessageToArchive(id),
  onShowMessageStats: (id) => void showMessageStats(id),
  renderEmptyState: (container) => {
    container.append(emptyHero());
  },
  scrollTranscriptToBottom: () => {
    requestAnimationFrame(() => {
      transcript.scrollTop = transcript.scrollHeight;
    });
  },
  window
});

function updateConnectionLine(status = "Ready") {
  const model = modelLabel(modelSelect.value);
  thinkingDepthSelect.hidden = !supportsThinkingDepth(modelSelect.value);
  connectionLine.title = `Connected to ${model} · ${status}`;
  connectionLine.setAttribute("aria-label", connectionLine.title);
  connectionLine.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-7 4 14 2-7h4"/></svg>
  `;
}

function setComposerNotice(message = "") {
  if (!composerNotice) return;
  composerNotice.textContent = message;
  composerNotice.hidden = !message;
}

function updateContextMeter() {
  const usage = contextUsageSnapshot({
    attachments: chatSessionStore.getAttachments(),
    messages: chatSessionStore.getMessages(),
    model: modelSelect.value,
    pageSnapshot: lastSnapshot
  });
  updateContextMeterElement(contextMeter, usage);
  if (contextPopoverOpen) {
    renderContextPopover(usage);
  }
}

function compactContextLocally() {
  const messages = chatSessionStore.getMessages();
  const recent = messages.slice(-8);
  contextCompactNotice = `Compact memory refreshed locally. ${recent.length}/${messages.length} recent turns are preserved for continuity; raw transcript remains intact.`;
  renderContextPopover();
}

function renderContextPopover(snapshot = contextUsageSnapshot({
  attachments: chatSessionStore.getAttachments(),
  messages: chatSessionStore.getMessages(),
  model: modelSelect.value,
  pageSnapshot: lastSnapshot
})) {
  renderContextMemoryPopover(contextPopover, snapshot, {
    notice: contextCompactNotice,
    onClose: () => {
      contextPopoverOpen = false;
      contextPopover.hidden = true;
      contextMeter.setAttribute("aria-expanded", "false");
    },
    onCompact: compactContextLocally
  });
}

function toggleContextPopover() {
  contextPopoverOpen = !contextPopoverOpen;
  contextPopover.hidden = !contextPopoverOpen;
  contextMeter.setAttribute("aria-expanded", contextPopoverOpen ? "true" : "false");
  if (contextPopoverOpen) {
    contextCompactNotice = "";
    renderContextPopover();
  }
}

function relativeTime(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

function iconSvg(kind) {
  const paths = {
    archive: `<path d="M4 7h16v13H4z"/><path d="M4 7l2-4h12l2 4"/><path d="M9 12h6"/>`,
    chevronDown: `<path d="m7 10 5 5 5-5"/>`,
    chevronRight: `<path d="m10 7 5 5-5 5"/>`,
    delete: `<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/>`,
    dot: `<circle cx="12" cy="12" r="4"/>`,
    fork: `<path d="M7 6v5a3 3 0 0 0 3 3h7"/><path d="M14 10l4 4-4 4"/><path d="M7 6h4"/>`,
    folder: `<path d="M4 6h6l2 2h8v10H4z"/>`,
    pin: `<path d="m14 4 6 6"/><path d="m5 19 6-6"/><path d="m9 15-2-2 8-8 4 4-8 8-2-2Z"/>`,
    rename: `<path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m13 7 4 4"/>`,
    unpin: `<path d="m3 3 18 18"/><path d="m14 4 6 6"/><path d="m5 19 6-6"/><path d="m9 15-2-2 8-8 4 4"/>`
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind] ?? ""}</svg>`;
}

function orderedRailItems(items) {
  return [...items].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

async function switchToSession(sessionId) {
  const next = await chatSessionStore.switchSession(sessionId);
  activeWorkspace = allowedWorkspaces.has(next?.workspaceId) ? next.workspaceId : "answer";
  await persistActiveWorkspace();
  renderAll();
}

async function toggleSessionPinned(sessionId) {
  const session = chatSessionStore.getSessions().find((item) => item.id === sessionId);
  if (!session) return;
  await chatSessionStore.setSessionPinned(sessionId, !session.pinned);
  renderAll();
}

async function forkSessionFromRail(sessionId) {
  const fork = await chatSessionStore.forkSession(sessionId);
  if (!fork) return;
  activeWorkspace = "answer";
  await persistActiveWorkspace();
  renderAll();
}

async function deleteSessionFromRail(sessionId) {
  const session = chatSessionStore.getSessions().find((item) => item.id === sessionId);
  if (!session) return;
  if (!window.confirm(`Delete chat "${session.title}"? This cannot be undone.`)) return;
  await chatSessionStore.deleteSession(sessionId);
  activeWorkspace = "answer";
  await persistActiveWorkspace();
  renderAll();
}

async function archiveSessionFromRail(sessionId) {
  const session = chatSessionStore.getSessions().find((item) => item.id === sessionId);
  if (!session) return;
  await chatSessionStore.setSessionArchived(sessionId, true);
  updateConnectionLine(`Archived chat: ${session.title}`);
  activeWorkspace = "answer";
  await persistActiveWorkspace();
  renderAll();
}

async function renameSessionFromRail(sessionId) {
  const session = chatSessionStore.getSessions().find((item) => item.id === sessionId);
  if (!session) return;
  const title = window.prompt("Rename chat", session.title);
  if (!title?.trim()) return;
  await chatSessionStore.renameSession(sessionId, title);
  renderAll();
}

async function createProjectFromRail() {
  const name = window.prompt("Project name");
  if (!name?.trim()) return;
  const project = await chatSessionStore.createProject(name);
  updateConnectionLine(`Created project: ${project.name}`);
  renderAll();
}

async function assignSessionProject(sessionId, projectId = "") {
  const session = await chatSessionStore.setSessionProject(sessionId, projectId);
  if (!session) return;
  const project = chatSessionStore.getProjects().find((item) => item.id === projectId);
  updateConnectionLine(projectId ? `Moved to ${project?.name ?? "project"}` : "Moved out of project");
  renderAll();
}

async function toggleProjectExpanded(projectId) {
  const project = chatSessionStore.getProjects().find((item) => item.id === projectId);
  if (!project) return;
  await chatSessionStore.setProjectExpanded(projectId, !project.expanded);
  renderAll();
}

async function toggleProjectPinned(projectId) {
  const project = chatSessionStore.getProjects().find((item) => item.id === projectId);
  if (!project) return;
  await chatSessionStore.setProjectPinned(projectId, !project.pinned);
  renderAll();
}

async function renameProjectFromRail(projectId) {
  const project = chatSessionStore.getProjects().find((item) => item.id === projectId);
  if (!project) return;
  const name = window.prompt("Rename project", project.name);
  if (!name?.trim()) return;
  await chatSessionStore.renameProject(projectId, name);
  renderAll();
}

async function archiveProjectFromRail(projectId) {
  const project = chatSessionStore.getProjects().find((item) => item.id === projectId);
  if (!project) return;
  await chatSessionStore.setProjectArchived(projectId, true);
  updateConnectionLine(`Archived project: ${project.name}`);
  renderAll();
}

function railActionButton({ action, icon, label, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rail-chat-action";
  button.dataset.action = action;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = iconSvg(icon);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void onClick();
  });
  return button;
}

function railSessionActions(session) {
  const actions = document.createElement("span");
  actions.className = "rail-chat-actions";
  actions.append(
    railActionButton({
      action: session.pinned ? "unpin" : "pin",
      icon: session.pinned ? "unpin" : "pin",
      label: session.pinned ? "Unpin chat" : "Pin chat",
      onClick: () => toggleSessionPinned(session.id)
    }),
    railActionButton({
      action: "rename",
      icon: "rename",
      label: "Rename chat",
      onClick: () => renameSessionFromRail(session.id)
    }),
    railActionButton({
      action: "fork",
      icon: "fork",
      label: "Fork chat",
      onClick: () => forkSessionFromRail(session.id)
    }),
    railActionButton({
      action: "archive",
      icon: "archive",
      label: "Archive chat",
      onClick: () => archiveSessionFromRail(session.id)
    }),
    railActionButton({
      action: "delete",
      icon: "delete",
      label: "Delete chat",
      onClick: () => deleteSessionFromRail(session.id)
    })
  );
  return actions;
}

function railProjectActions(project) {
  const actions = document.createElement("span");
  actions.className = "rail-chat-actions rail-project-actions";
  actions.append(
    railActionButton({
      action: project.pinned ? "unpin-project" : "pin-project",
      icon: project.pinned ? "unpin" : "pin",
      label: project.pinned ? "Unpin project" : "Pin project",
      onClick: () => toggleProjectPinned(project.id)
    }),
    railActionButton({
      action: "rename-project",
      icon: "rename",
      label: "Rename project",
      onClick: () => renameProjectFromRail(project.id)
    }),
    railActionButton({
      action: "archive-project",
      icon: "archive",
      label: "Archive project",
      onClick: () => archiveProjectFromRail(project.id)
    }),
    railActionButton({
      action: "delete-project",
      icon: "delete",
      label: "Delete project",
      onClick: async () => {
        if (!window.confirm(`Delete project "${project.name}"? Chats will move back to the main chat list.`)) return;
        await chatSessionStore.deleteProject(project.id);
        renderAll();
      }
    })
  );
  return actions;
}

function railChatButton(session, projectLabelById) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rail-chat-button";
  button.draggable = true;
  button.dataset.sessionId = session.id;
  button.classList.toggle("active", session.id === chatSessionStore.getActiveSessionId());
  button.classList.toggle("pinned", Boolean(session.pinned));
  button.classList.toggle("unread", Boolean(session.unread));
  button.title = `${session.title}${session.projectId ? ` · ${projectLabelById[session.projectId] ?? "Project"}` : ""}`;
  button.setAttribute("aria-label", `Open chat: ${button.title}`);
  if (session.id === chatSessionStore.getActiveSessionId()) {
    button.setAttribute("aria-current", "true");
  }
  const unread = document.createElement("span");
  unread.className = "rail-unread-dot";
  unread.innerHTML = session.unread ? iconSvg("dot") : "";
  const title = document.createElement("span");
  title.className = "rail-chat-title";
  title.textContent = session.title || "New chat";
  const meta = document.createElement("span");
  meta.className = "rail-chat-meta";
  meta.innerHTML = `${session.pinned ? iconSvg("pin") : ""}<span>${relativeTime(session.updatedAt)}</span>`;
  const body = document.createElement("span");
  body.className = "rail-chat-body";
  const top = document.createElement("span");
  top.className = "rail-chat-top";
  top.append(unread, title, meta);
  const actionLine = document.createElement("span");
  actionLine.className = "rail-action-line";
  actionLine.append(railSessionActions(session));
  body.append(top, actionLine);
  button.append(body);
  button.addEventListener("click", async () => {
    await switchToSession(session.id);
  });
  button.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", session.id);
    event.dataTransfer.effectAllowed = "move";
  });
  return button;
}

function renderRailNavigation() {
  workspaceButtons.forEach((button) => {
    const active = button.dataset.workspace === activeWorkspace;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  railClearSearch.hidden = !railSearchQuery;
  const allSessions = chatSessionStore.getSessions().filter((session) => !session.archivedAt);
  const projectEntries = orderedRailItems(chatSessionStore.getProjects().filter((project) => !project.archivedAt))
    .map((project) => ({
      project,
      projectSessions: orderedRailItems(allSessions.filter((session) => session.projectId === project.id))
    }))
    .filter(({ project, projectSessions }) => railSearchMatchesProject(project, projectSessions, railSearchQuery));
  const projects = projectEntries.map(({ project }) => project);
  const projectLabelById = Object.fromEntries(chatSessionStore.getProjects().filter((project) => !project.archivedAt).map((project) => [project.id, project.name]));
  railProjectList.replaceChildren();
  if (!projectEntries.length) {
    const empty = document.createElement("li");
    empty.className = "rail-empty";
    empty.textContent = railSearchQuery ? "No projects found." : "Create a project folder for chats, artifacts, and code.";
    railProjectList.append(empty);
  }
  for (const { project, projectSessions } of projectEntries) {
    const row = document.createElement("li");
    row.className = "rail-project-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rail-project";
    button.dataset.projectId = project.id;
    button.classList.toggle("pinned", Boolean(project.pinned));
    button.setAttribute("aria-expanded", String(Boolean(project.expanded)));
    button.setAttribute("aria-label", `${project.expanded ? "Collapse" : "Expand"} project: ${project.name}. ${projectSessions.length} chat${projectSessions.length === 1 ? "" : "s"}.`);
    const top = document.createElement("span");
    top.className = "rail-project-top";
    top.innerHTML = `
      <span class="rail-project-expand">${iconSvg(project.expanded ? "chevronDown" : "chevronRight")}</span>
      ${iconSvg("folder")}
      <span class="rail-text">${project.name}</span>
      <kbd>${projectSessions.length}</kbd>
    `;
    const actionLine = document.createElement("span");
    actionLine.className = "rail-action-line";
    actionLine.append(railProjectActions(project));
    button.append(top, actionLine);
    button.addEventListener("click", () => void toggleProjectExpanded(project.id));
    button.addEventListener("dragover", (event) => {
      event.preventDefault();
      button.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });
    button.addEventListener("dragleave", () => {
      button.classList.remove("drag-over");
    });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      button.classList.remove("drag-over");
      const sessionId = event.dataTransfer.getData("text/plain");
      void assignSessionProject(sessionId, project.id);
    });
    row.append(button);
    if (project.expanded) {
      const list = document.createElement("ol");
      list.className = "rail-project-chat-list";
      for (const session of projectSessions) {
        const sessionRow = document.createElement("li");
        sessionRow.append(railChatButton(session, projectLabelById));
        list.append(sessionRow);
      }
      if (!projectSessions.length) {
        const emptyProject = document.createElement("li");
        emptyProject.className = "rail-empty rail-project-empty";
        emptyProject.textContent = "Drop chats here.";
        list.append(emptyProject);
      }
      row.append(list);
    }
    railProjectList.append(row);
  }
  const sessions = orderedRailItems(allSessions)
    .filter((session) => !session.projectId && railSearchMatchesSession(session, railSearchQuery))
    .slice(0, 28);
  railChatList.replaceChildren();
  if (!sessions.length) {
    const empty = document.createElement("li");
    empty.className = "rail-empty";
    empty.textContent = railSearchQuery ? "No chats found." : "No recent chats yet.";
    railChatList.append(empty);
    return;
  }
  for (const session of sessions) {
    const row = document.createElement("li");
    row.append(railChatButton(session, projectLabelById));
    railChatList.append(row);
  }
}

function setActiveWorkspace(workspaceId, { persist = false } = {}) {
  activeWorkspace = allowedWorkspaces.has(workspaceId) ? workspaceId : "answer";
  document.body.dataset.workspace = activeWorkspace;
  commandForm.hidden = activeWorkspace !== "answer";
  if (persist) {
    void persistActiveWorkspace();
    void chatSessionStore.setActiveSessionWorkspace(activeWorkspace);
  }
}

async function persistActiveWorkspace() {
  await chrome.storage?.local?.set?.({
    [STORAGE_KEYS.activeWorkspace]: activeWorkspace
  }).catch(() => undefined);
}

async function hydrateActiveWorkspace() {
  const settings = await chrome.storage?.local?.get?.([STORAGE_KEYS.activeWorkspace]).catch(() => ({}));
  activeWorkspace = allowedWorkspaces.has(settings?.[STORAGE_KEYS.activeWorkspace])
    ? settings[STORAGE_KEYS.activeWorkspace]
    : "answer";
}

async function hydrateAppearancePreferences() {
  const settings = await chrome.storage?.local?.get?.([STORAGE_KEYS.appearance]).catch(() => ({}));
  applyAppearancePreferences(settings?.[STORAGE_KEYS.appearance]);
}

async function hydrateStarterPromptPreference() {
  const settings = await chrome.storage?.local?.get?.([STORAGE_KEYS.starterPromptsHidden]).catch(() => ({}));
  starterPromptsHidden = Boolean(settings?.[STORAGE_KEYS.starterPromptsHidden]);
}

async function setStarterPromptPreference(hidden) {
  starterPromptsHidden = Boolean(hidden);
  await chrome.storage?.local?.set?.({
    [STORAGE_KEYS.starterPromptsHidden]: starterPromptsHidden
  }).catch(() => undefined);
  renderMessages();
}

function renderAttachments() {
  chatRenderers.renderAttachments();
}

const starterPrompts = [
  {
    eyebrow: "Strategy",
    title: "Plan the next move",
    prompt: "Help me think through the best next step for this project."
  },
  {
    eyebrow: "Web",
    title: "Research current context",
    prompt: "Search the web for the latest useful context about "
  },
  {
    eyebrow: "Page",
    title: "Read this page",
    prompt: "Read the current page and summarize what matters."
  },
  {
    eyebrow: "Risk",
    title: "Find blind spots",
    prompt: "Find the risks, blind spots, and next actions for this plan: "
  },
  {
    eyebrow: "Memory",
    title: "Search AI memory",
    prompt: "/memory "
  },
  {
    eyebrow: "Delegate",
    title: "Send to Hermes",
    prompt: "/hermes Research this and return sources, risks, and next actions: "
  }
];

function emptyHero() {
  const hero = document.createElement("section");
  hero.className = "empty-hero";
  hero.innerHTML = `
    <div class="empty-hero-copy">
      <span class="hero-kicker">AI browser workspace</span>
      <h1>Ask, browse, remember, delegate.</h1>
      <p>Start in full-screen Augmentor. If a task needs the web, memory, Hermes, or OpenCode, ResonantOS routes it through the governed command layer.</p>
    </div>
  `;

  const controls = document.createElement("div");
  controls.className = "starter-prompt-controls";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = starterPromptsHidden ? "Show suggestions" : "Hide suggestions";
  toggle.addEventListener("click", () => void setStarterPromptPreference(!starterPromptsHidden));
  controls.append(toggle);
  hero.append(controls);

  if (!starterPromptsHidden) {
    const grid = document.createElement("div");
    grid.className = "starter-prompt-grid";
    grid.setAttribute("aria-label", "Augmentor prompt suggestions");
    for (const item of starterPrompts.slice(0, 6)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.prompt = item.prompt;
      button.innerHTML = `
        <span></span>
        <strong></strong>
      `;
      button.querySelector("span").textContent = item.eyebrow;
      button.querySelector("strong").textContent = item.title;
      button.addEventListener("click", () => {
        commandInput.value = button.dataset.prompt;
        composerController.resetUndoStack(commandInput.value);
        commandInput.focus();
        commandInput.setSelectionRange?.(commandInput.value.length, commandInput.value.length);
      });
      grid.append(button);
    }
    hero.append(grid);
  }
  return hero;
}

function renderMessages() {
  transcript.replaceChildren();
  if (activeWorkspace === "hermes") {
    renderHermesWorkspace();
    return;
  }
  if (activeWorkspace === "memory") {
    const initialQuery = pendingWorkspaceAction?.workspace === "memory" ? pendingWorkspaceAction.query : "";
    pendingWorkspaceAction = null;
    renderLivingArchiveWorkspace({ container: transcript, bridgeRequest, initialQuery });
    return;
  }
  if (activeWorkspace === "artifacts") {
    renderArtifactsWorkspace({
      container: transcript,
      bridgeRequest,
      onContinueArtifact: continueFromArtifact
    });
    return;
  }
  if (activeWorkspace === "addons") {
    renderAddOnsWorkspace({
      container: transcript,
      bridgeRequest,
      onOpenProviderHandoff: async (handoff) => {
        if (!handoff?.url) return;
        await chrome.tabs.create({ url: handoff.url }).catch(() => undefined);
        await addMessage("system", `Opened ${handoff.provider} draft for human review. ResonantOS did not send or schedule anything.`);
      },
      onOpenWorkspace: async (workspaceId) => {
        setActiveWorkspace(workspaceId, { persist: true });
        renderAll();
      }
    });
    return;
  }
  if (activeWorkspace === "opencode") {
    const initialMission = pendingWorkspaceAction?.workspace === "opencode" ? pendingWorkspaceAction.mission : "";
    pendingWorkspaceAction = null;
    renderOpenCodeWorkspace({ container: transcript, bridgeRequest, initialMission });
    return;
  }
  if (activeWorkspace === "settings") {
    renderSettingsWorkspace({
      container: transcript,
      bridgeRequest,
      chatSessionStore,
      onOpenSession: async (sessionId) => {
        await switchToSession(sessionId);
      },
      onProfileUpdated: (next) => {
        personalizationSettings = next;
        applyUserProfile(next.profile);
      },
      onOpenWorkspace: async (workspaceId) => {
        setActiveWorkspace(workspaceId, { persist: true });
        renderAll();
      },
      onRestore: renderAll,
      chromeApi: chrome,
      sitePermissionStore,
      storage: chrome.storage?.local,
      storageKeys: STORAGE_KEYS,
      taskConsentStore,
      initialSection: initialSettingsSection
    });
    return;
  }
  chatRenderers.renderMessages();
}

async function copyMessage(message) {
  const text = String(message?.content ?? "");
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      chatRenderers.flashCopied(message.id);
      return;
    }
  } catch {
    // Fall through to the extension background fallback.
  }
  await chrome.runtime.sendMessage({
    channel: "resonantos.browser_first",
    type: "copy_text",
    text
  }).catch(() => undefined);
  chatRenderers.flashCopied(message.id);
}

function editMessage(messageId) {
  const message = chatSessionStore.findMessage(messageId);
  if (!message || message.role !== "user") return;
  commandInput.value = message.content;
  composerController.resetUndoStack(message.content);
  commandInput.focus();
  updateConnectionLine("Editing");
}

async function saveMessageToArchive(messageId) {
  const message = chatSessionStore.findMessage(messageId);
  if (!message) return;
  updateConnectionLine("Saving");
  try {
    const result = await bridgeRequest("/archive/intake", {
      method: "POST",
      body: {
        title: `Augmentor main workspace message ${new Date(message.createdAt).toLocaleString()}`,
        content: message.content,
        sourceMessageId: message.id,
        url: null
      }
    });
    await addMessage("system", `Saved to Living Archive intake: ${result.path}`);
    updateConnectionLine("Ready");
  } catch (error) {
    updateConnectionLine("Archive failed");
    await addMessage("system", error instanceof Error ? error.message : String(error));
  }
}

async function showMessageStats(messageId) {
  const message = chatSessionStore.findMessage(messageId);
  await addMessage(
    "system",
    message?.usage
      ? `Generation stats:\n${JSON.stringify(message.usage, null, 2)}`
      : "No generation telemetry is available for this message."
  );
}

async function forkFromMessage(messageId) {
  await chatSessionStore.forkFromMessage(messageId);
  activeWorkspace = "answer";
  await persistActiveWorkspace();
  renderAll();
}

async function deleteMessage(messageId) {
  await chatSessionStore.deleteMessage(messageId);
  renderAll();
}

async function regenerateFromMessage(messageId) {
  if (busy) return;
  const userMessage = await chatSessionStore.trimToPreviousUserMessage(messageId);
  if (!userMessage) return;
  setComposerBusy(true);
  renderAll();
  try {
    await runChatTurn(userMessage.content);
  } catch (error) {
    await addMessage("system", `Regeneration failed: ${error instanceof Error ? error.message : String(error)}`);
    updateConnectionLine("Failed");
  } finally {
    setComposerBusy(false);
  }
}

function renderAll() {
  setActiveWorkspace(activeWorkspace);
  renderMessages();
  renderAttachments();
  renderRailNavigation();
  updateContextMeter();
  updateConnectionLine();
}

function workspaceShell({ eyebrow, title, body }) {
  const section = document.createElement("section");
  section.className = "module-workspace";
  const copy = document.createElement("div");
  copy.className = "module-copy";
  const eyebrowNode = document.createElement("span");
  eyebrowNode.className = "module-eyebrow";
  eyebrowNode.textContent = eyebrow;
  const titleNode = document.createElement("h1");
  titleNode.textContent = title;
  const bodyNode = document.createElement("p");
  bodyNode.textContent = body;
  copy.append(eyebrowNode, titleNode, bodyNode);
  section.append(copy);
  return section;
}

async function statusForAddon(addonId) {
  const result = await bridgeRequest("/addons/status", { method: "GET" });
  return result?.addons?.find((addon) => addon.id === addonId) ?? null;
}

function renderStatusWorkspace({ eyebrow, title, body, addonId }) {
  const section = workspaceShell({ eyebrow, title, body });
  const status = document.createElement("div");
  status.className = "module-card";
  status.textContent = "Checking add-on status...";
  section.append(status);
  transcript.append(section);
  void statusForAddon(addonId).then((addon) => {
    status.textContent = addon
      ? `${addon.name}: ${addon.available ? "available" : "not available"} · ${addon.mode} · ${addon.trust}`
      : "This add-on is not registered yet.";
  }).catch((error) => {
    status.textContent = `Status unavailable: ${error instanceof Error ? error.message : String(error)}`;
  });
}

function renderHermesWorkspace() {
  const section = document.createElement("section");
  section.className = "hermes-dashboard-workspace";
  section.setAttribute("aria-label", "Hermes dashboard workspace");
  const status = document.createElement("div");
  status.className = "dashboard-status";
  status.textContent = "Checking Hermes status...";
  const frameCard = document.createElement("section");
  frameCard.className = "dashboard-frame-card";
  const iframe = document.createElement("iframe");
  iframe.title = "Hermes dashboard";
  iframe.hidden = true;
  const placeholder = document.createElement("div");
  placeholder.className = "dashboard-placeholder";
  const placeholderTitle = document.createElement("strong");
  placeholderTitle.textContent = "Hermes dashboard is not running";
  const placeholderBody = document.createElement("p");
  placeholderBody.textContent = "Start the local Hermes dashboard to load it here. Delegation remains available from Augmentor chat with /hermes.";
  const actions = document.createElement("div");
  actions.className = "module-action-row";
  const start = document.createElement("button");
  start.type = "button";
  start.textContent = "Start Dashboard";
  const stop = document.createElement("button");
  stop.type = "button";
  stop.textContent = "Stop";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";
  actions.append(start, stop, refresh);
  placeholder.append(placeholderTitle, placeholderBody, actions);
  frameCard.append(iframe, placeholder);
  section.append(status, frameCard);
  transcript.append(section);

  const setDashboardState = (dashboard) => {
    const running = Boolean(dashboard?.running);
    iframe.hidden = !running;
    placeholder.hidden = running;
    if (running) {
      iframe.src = dashboard.url;
    }
    status.textContent = running
      ? ""
      : `${dashboard?.rawStatus || "Hermes dashboard stopped"} · ${dashboard?.detail || "Start it to embed the workspace."}`;
  };
  const loadStatus = async () => {
    const [addon, dashboard] = await Promise.all([
      statusForAddon("addon.hermes"),
      bridgeRequest("/hermes/dashboard/status", { method: "POST", body: { port: 9119 } })
    ]);
    setDashboardState(dashboard);
    if (!addon?.available) {
      status.textContent = `${status.textContent}\nHermes add-on files are not available in this build.`;
    }
  };
  const startDashboard = async () => {
    start.disabled = true;
    status.textContent = "Starting Hermes dashboard...";
    try {
      setDashboardState(await bridgeRequest("/hermes/dashboard/start", {
        method: "POST",
        body: { host: "127.0.0.1", port: 9119, includeTui: true }
      }));
    } catch (error) {
      status.textContent = `Hermes dashboard failed to start: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      start.disabled = false;
    }
  };
  start.addEventListener("click", async () => {
    await startDashboard();
  });
  stop.addEventListener("click", async () => {
    stop.disabled = true;
    status.textContent = "Stopping Hermes dashboard...";
    try {
      setDashboardState(await bridgeRequest("/hermes/dashboard/stop", { method: "POST", body: { port: 9119 } }));
    } catch (error) {
      status.textContent = `Hermes dashboard failed to stop: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      stop.disabled = false;
    }
  });
  refresh.addEventListener("click", () => void loadStatus().catch((error) => {
    status.textContent = `Hermes status unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }));
  void loadStatus().catch((error) => {
    status.textContent = `Hermes status unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }).then(() => {
    if (iframe.hidden) {
      void startDashboard();
    }
  });
}

async function addMessage(role, content, options = {}) {
  const message = await chatSessionStore.addMessage(role, content, options);
  if (message) renderAll();
  updateContextMeter();
  return message;
}

const dictationController = createDictationController({
  addMessage,
  button: dictateButton,
  commandInput,
  navigatorRef: navigator,
  onTranscript: () => composerController.pushUndoSnapshot(),
  setNotice: setComposerNotice,
  setStatus: updateConnectionLine,
  windowRef: window
});

async function openSidebar() {
  await chrome.runtime.sendMessage({
    channel: "resonantos.browser_first",
    type: "open_side_panel",
    force: true
  }).catch(() => undefined);
}

async function handoffSidebarPrompt(prompt, message) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.pendingSidebarPrompt]: {
      prompt,
      createdAt: new Date().toISOString()
    }
  });
  if (message) {
    await addMessage("system", message);
  }
  await openSidebar();
}

async function continueFromArtifact(artifact) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.pendingSidebarPrompt]: {
      prompt: `/control continue from artifact ${artifact.path}`,
      createdAt: new Date().toISOString(),
      artifactPath: artifact.path,
      artifactTitle: artifact.title ?? ""
    }
  });
  await addMessage("system", `Sent artifact to Augmentor sidebar for continuation: ${artifact.path}`);
  await openSidebar();
}

async function handoffToBrowserControl(prompt) {
  const amazon = parseAmazonShoppingTask(prompt);
  const browserIntent = parseNaturalBrowserIntent(prompt);
  const target = amazon?.url || browserIntent?.target || "";
  await chrome.storage.local.set({
    [STORAGE_KEYS.pendingSidebarPrompt]: {
      prompt: `/control ${prompt}`,
      createdAt: new Date().toISOString()
    }
  });
  await addMessage("system", "Moving this task into browser control mode. Augmentor will continue from the sidebar while the page stays in the main browser workspace.");
  if (target) {
    await chrome.tabs.update({ url: normalizeBrowserUrl(target) }).catch(() => undefined);
  }
  await openSidebar();
}

async function runChatTurn(prompt) {
  activeChatAbortController = new AbortController();
  updateConnectionLine("Thinking");
  try {
    const response = await bridgeRequest("/augmentor/chat", {
      method: "POST",
      signal: activeChatAbortController.signal,
      body: {
        model: modelSelect.value,
        workload: "augmentor-chat",
        thinkingDepth: thinkingDepthSelect.value,
        systemPrompt: personalizationSettings?.augmentor?.systemPrompt ?? "",
        messages: [
          {
            role: "system",
            content: "Answer as Augmentor inside the full ResonantOS main workspace. If browser control is needed, say that the task is being handed to Agent Control Mode."
          },
          ...providerMessagesFromHistory(chatSessionStore.getMessages())
        ]
      }
    });
    await addMessage("assistant", assistantTextFromResponse(response) || "No response was returned.", {
      usage: response?.usage ?? null
    });
    updateConnectionLine("Ready");
  } catch (error) {
    if (error?.name === "AbortError") {
      updateConnectionLine("Stopped");
      await addMessage("system", "Response stopped by the human before a reply was returned.");
      return;
    }
    throw error;
  } finally {
    activeChatAbortController = null;
  }
}

async function runHermesDelegation(prompt) {
  const mission = parseHermesSlashCommand(prompt);
  if (!mission) {
    setActiveWorkspace("hermes", { persist: true });
    renderAll();
    await addMessage("system", "Opened Hermes workspace. Use `/hermes <mission>` when you want Augmentor to create a governed delegation packet.");
    return;
  }
  if (mission.length < 8) {
    await addMessage("system", "Use `/hermes <mission>` with a clear mission to create a governed Hermes delegation packet.");
    return;
  }
  updateConnectionLine("Delegating");
  const result = await bridgeRequest("/addons/delegate", {
    method: "POST",
    body: { target: "hermes", mission }
  });
  await addMessage("system", `Delegation queued for Hermes: ${result.id}\n${result.path}`);
  updateConnectionLine("Ready");
}

const delegationTargetLabel = (target) => {
  if (target === "opencode") return "OpenCode";
  if (target === "hermes") return "Hermes";
  if (target === "engineer") return "Resonant Engineer";
  return target;
};

async function runNaturalDelegation(intent) {
  if (!intent || intent.missingTarget) {
    await addMessage(
      "system",
      "I can delegate through the ResonantOS agent control layer. Choose Hermes for general agent work, OpenCode for coding, or Resonant Engineer for system repair."
    );
    return;
  }
  if (intent.mission.length < 8) {
    await addMessage("system", `Give ${delegationTargetLabel(intent.target)} a concrete mission before I create the delegation packet.`);
    return;
  }
  updateConnectionLine(`Delegating to ${delegationTargetLabel(intent.target)}`);
  const result = await bridgeRequest("/addons/delegate", {
    method: "POST",
    body: { target: intent.target, mission: intent.mission }
  });
  await addMessage(
    "system",
    [
      `Delegation queued for ${delegationTargetLabel(result.target)}: ${result.id}`,
      result.path,
      "Boundary: the add-on receives a governed task packet. ResonantOS keeps provider secrets, wallet actions, and trusted memory writes mediated."
    ].join("\n")
  );
  updateConnectionLine("Ready");
}

async function runMemoryCommand(prompt) {
  const query = parseMemorySlashCommand(prompt);
  setActiveWorkspace("memory", { persist: true });
  pendingWorkspaceAction = query ? { workspace: "memory", query } : null;
  renderAll();
  await chatSessionStore.addMessage(
    "system",
    query
      ? `Opened Living Archive and searched AI Memory for: ${query}`
      : "Opened Living Archive workspace. Use `/memory <query>` to search AI Memory directly.",
    { persist: true }
  );
}

async function runOpenCodeCommand(prompt) {
  const mission = parseOpenCodeSlashCommand(prompt);
  setActiveWorkspace("opencode", { persist: true });
  pendingWorkspaceAction = mission ? { workspace: "opencode", mission } : null;
  renderAll();
  await chatSessionStore.addMessage(
    "system",
    mission
      ? `Opened OpenCode and created a governed delegation for: ${mission}`
      : "Opened OpenCode workspace. Use `/opencode <mission>` to create a governed coding handoff.",
    { persist: true }
  );
}

async function runDraftAddonCommand(prompt) {
  const command = parseDraftSlashCommand(prompt);
  if (!command) return false;
  const draft = parseDraftAddonCommand(command.target, command.body);
  if (!draft) {
    await addMessage(
      "system",
      `Use \`/${command.target} <intent> | body: <draft text>\`. ${command.target === "email" ? "Sending" : "Scheduling"} remains human-approval gated.`
    );
    return true;
  }
  updateConnectionLine("Drafting");
  const result = await bridgeRequest("/addons/draft", {
    method: "POST",
    body: draft
  });
  await addMessage(
    "system",
    `${draft.target === "email" ? "Email" : "Calendar"} draft created: ${result.id}\n${result.path}\n${draft.target === "email" ? "Sending email" : "Scheduling calendar events"} is not automated from chat. Review and approve through the add-on approval flow.`
  );
  updateConnectionLine("Ready");
  return true;
}

async function runWalletStatusCommand() {
  const result = await browserPageActions.detectWalletState({ announce: true });
  if (!result?.ok) {
    updateConnectionLine("Wallet status unavailable");
  }
}

async function runDaoWorkflowCommand(prompt) {
  const command = parseDaoSlashCommand(prompt);
  if (command?.action === "audit") {
    await browserPageActions.saveWalletDaoAuditToArchive(command.goal);
    return;
  }
  await browserPageActions.prepareDaoWorkflowGuidance(command?.goal ?? "");
}

commandForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const prompt = commandInput.value.trim();
  if (!prompt) return;
  setComposerBusy(true);
  try {
    await addMessage("user", prompt);
    commandInput.value = "";
    composerController.resetUndoStack("");
    const promptPlan = planMainWorkspacePrompt(prompt);
    if (promptPlan.action === "memory") {
      await runMemoryCommand(prompt);
    } else if (promptPlan.action === "opencode") {
      await runOpenCodeCommand(prompt);
    } else if (promptPlan.action === "hermes") {
      await runHermesDelegation(prompt);
    } else if (promptPlan.action === "delegate") {
      await runNaturalDelegation(promptPlan.intent);
    } else if (promptPlan.action === "wallet") {
      const command = promptPlan.command;
      if (command?.action === "audit") {
        await browserPageActions.saveWalletDaoAuditToArchive(command.goal);
      } else {
        await runWalletStatusCommand();
      }
    } else if (promptPlan.action === "dao") {
      await runDaoWorkflowCommand(prompt);
    } else if (promptPlan.action === "draft" && await runDraftAddonCommand(prompt)) {
      // Draft-only communication/scheduling packets are handled locally.
    } else if (promptPlan.action === "control") {
      await handoffToBrowserControl(prompt);
    } else {
      await runChatTurn(prompt);
    }
  } catch (error) {
    await addMessage("system", `Main workspace request failed: ${error instanceof Error ? error.message : String(error)}`);
    updateConnectionLine("Failed");
  } finally {
    setComposerBusy(false);
  }
});

composerController.bind();

async function createNewChat() {
  activeWorkspace = "answer";
  await persistActiveWorkspace();
  await chatSessionStore.createSession({ workspaceId: "answer" });
  commandInput.value = "";
  composerController.resetUndoStack("");
  renderAll();
  commandInput.focus();
}

newChatButton?.addEventListener("click", createNewChat);
railNewChatButton?.addEventListener("click", createNewChat);
railSearchToggle?.addEventListener("click", () => {
  railSearchBox.hidden = !railSearchBox.hidden;
  if (!railSearchBox.hidden) {
    railSearchInput.focus();
    railSearchInput.select();
  }
});
railSearchInput?.addEventListener("input", () => {
  railSearchQuery = railSearchInput.value.trim();
  renderRailNavigation();
});
railClearSearch?.addEventListener("click", () => {
  railSearchQuery = "";
  railSearchInput.value = "";
  renderRailNavigation();
  railSearchInput.focus();
});
railNewProjectButton?.addEventListener("click", () => void createProjectFromRail());

document.querySelectorAll(".rail-recents[data-project-id]").forEach((target) => {
  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    target.classList.add("drag-over");
    event.dataTransfer.dropEffect = "move";
  });
  target.addEventListener("dragleave", () => {
    target.classList.remove("drag-over");
  });
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    target.classList.remove("drag-over");
    const sessionId = event.dataTransfer.getData("text/plain");
    void assignSessionProject(sessionId, target.dataset.projectId ?? "");
  });
});

readPageButton?.addEventListener("click", () => void browserPageActions.readActivePage());
saveIntakeButton?.addEventListener("click", () => void browserPageActions.saveCurrentPageToArchive());
saveSelectionButton?.addEventListener("click", () => void browserPageActions.saveSelectionToArchive());
contextToggleButton?.addEventListener("click", () => void browserPageActions.summarizeSnapshot());
contextMeter?.addEventListener("click", toggleContextPopover);
workspaceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.workspace === "settings") {
      initialSettingsSection = button.dataset.settingsSection || "overview";
    }
    setActiveWorkspace(button.dataset.workspace, { persist: true });
    renderAll();
    if (button.dataset.prompt) {
      commandInput.value = button.dataset.prompt;
      composerController.resetUndoStack(commandInput.value);
      if (button.dataset.workspace === "answer") {
        commandInput.focus();
      }
    }
  });
});
attachFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const attachments = [];
  for (const [index, file] of Array.from(fileInput.files ?? []).entries()) {
    let content = "";
    if (fileLooksTextLike(file) && file.size <= 64 * 1024) {
      content = (await file.text()).slice(0, 12000);
    }
    attachments.push({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      name: file.name,
      type: file.type,
      size: file.size,
      summary: `${Math.round(file.size / 1024)} KB${content ? " · embedded text" : " · metadata only"}`,
      content
    });
  }
  await chatSessionStore.addAttachments(attachments);
  renderAll();
  fileInput.value = "";
});
modelSelect.addEventListener("change", () => void chatSessionStore.persist().then(() => {
  updateConnectionLine();
  updateContextMeter();
}));
thinkingDepthSelect.addEventListener("change", () => void chatSessionStore.persist());
dictateButton.addEventListener("click", () => {
  dictationController.toggle();
});
sendButton.addEventListener("click", (event) => {
  if (!busy) return;
  event.preventDefault();
  activeChatAbortController?.abort();
});

await hydrateProviderModelOptions({
  bridgeRequest,
  getPreferredModel: () => modelSelect.value,
  modelSelect,
  setStatus: updateConnectionLine
});
await Promise.all([
  hydratePersonalizationSettings(),
  chatSessionStore.hydrate(),
  hydrateAppearancePreferences(),
  hydrateStarterPromptPreference(),
  hydrateActiveWorkspace()
]);
await suppressSidebarChatForMainWorkspace();
await chatSessionStore.ensureFreshSession({ workspaceId: "answer" });
activeWorkspace = "answer";
await persistActiveWorkspace();
renderAll();
