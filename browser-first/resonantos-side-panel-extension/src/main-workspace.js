import {
  parseDraftAddonCommand,
} from "./lib/app-command-handlers.js";
import {
  normalizeBrowserUrl,
  parseAmazonShoppingTask,
  parseAutonomousBrowserActionIntent,
  parseNaturalBrowserIntent
} from "./lib/browser-command-parser.js";
import { createBridgeClient } from "./lib/bridge-client.js";
import { createChatSessionStore } from "./lib/chat-session-store.js";
import { createComposerController } from "./lib/composer-controller.js";
import { renderAddOnsWorkspace } from "./lib/main-workspace-addons.js";
import { renderArtifactsWorkspace } from "./lib/main-workspace-artifacts.js";
import { renderLivingArchiveWorkspace } from "./lib/main-workspace-memory.js";
import { renderOpenCodeWorkspace } from "./lib/main-workspace-opencode.js";
import { renderSettingsWorkspace } from "./lib/main-workspace-settings.js";
import { ACTION_ICONS, markdownToSafeHtml } from "./lib/side-panel-renderers.js";

const STORAGE_KEYS = {
  messages: "augmentorBrowserMessages",
  forks: "augmentorBrowserForks",
  sessions: "augmentorBrowserSessions",
  activeSessionId: "augmentorActiveBrowserSessionId",
  model: "augmentorModel",
  thinkingDepth: "augmentorThinkingDepth",
  attachments: "augmentorBrowserAttachments",
  pendingSidebarPrompt: "augmentorPendingSidebarPrompt",
  activeWorkspace: "augmentorMainWorkspace"
};

const MODEL_LABELS = {
  "MiniMax-M2.7": "MiniMax 2.7",
  "MiniMax-M2.7-highspeed": "MiniMax 2.7 High Speed",
  "gpt-5.5": "GPT 5.5",
  "gpt-5.4-mini": "GPT 5.4 Mini",
  "batiai/gemma4-e2b:q4": "Gemma 4 2B"
};

const transcript = document.querySelector("#transcript");
const workspaceButtons = [...document.querySelectorAll("[data-workspace]")];
const newChatButton = document.querySelector("#new-chat");
const openSidebarButton = document.querySelector("#open-sidebar");
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
const connectionLine = document.querySelector("#connection-line");
const bridgeRequest = createBridgeClient();
let busy = false;
let activeWorkspace = "answer";
let pendingWorkspaceAction = null;
const allowedWorkspaces = new Set(["answer", "artifacts", "addons", "memory", "hermes", "opencode", "settings"]);

const supportsThinkingDepth = (model) => model.startsWith("gpt-5.");
const composerController = createComposerController({ commandForm, commandInput, navigator });
const assistantTextFromResponse = (response) => String(response?.content ?? response?.reply ?? "").trim();
const parseHermesSlashCommand = (value) => {
  const match = /^\/\s*hermes(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? (match[1] ?? "").trim() : null;
};
const parseMemorySlashCommand = (value) => {
  const match = /^\/\s*(?:memory|archive)(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? (match[1] ?? "").trim() : null;
};
const parseOpenCodeSlashCommand = (value) => {
  const match = /^\/\s*(?:opencode|open\s+code)(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? (match[1] ?? "").trim() : null;
};
const parseDraftSlashCommand = (value) => {
  const match = /^\/\s*(email|calendar)(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? { target: match[1].toLowerCase(), body: (match[2] ?? "").trim() } : null;
};
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

function updateConnectionLine(status = "Ready") {
  const model = MODEL_LABELS[modelSelect.value] ?? modelSelect.value;
  thinkingDepthSelect.hidden = !supportsThinkingDepth(modelSelect.value);
  connectionLine.title = `Connected to ${model} · ${status}`;
  connectionLine.setAttribute("aria-label", connectionLine.title);
  connectionLine.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2-7 4 14 2-7h4"/></svg>
  `;
}

function updateContextMeter() {
  const totalChars = chatSessionStore.getMessages()
    .reduce((total, message) => total + String(message.content ?? "").length, 0);
  const roughPercent = Math.min(99, Math.max(0, Math.round(totalChars / 900)));
  contextMeter.style.setProperty("--context-used", `${roughPercent}%`);
  contextMeter.querySelector(".context-meter-label").textContent = `${roughPercent}%`;
  contextMeter.setAttribute("aria-label", `Context usage ${roughPercent} percent`);
}

function setActiveWorkspace(workspaceId, { persist = false } = {}) {
  activeWorkspace = allowedWorkspaces.has(workspaceId) ? workspaceId : "answer";
  document.body.dataset.workspace = activeWorkspace;
  workspaceButtons.forEach((button) => {
    const active = button.dataset.workspace === activeWorkspace;
    button.classList.toggle("active", active);
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
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

function renderAttachments() {
  const attachments = chatSessionStore.getAttachments();
  attachmentStrip.replaceChildren();
  attachmentStrip.hidden = attachments.length === 0;
  attachments.forEach((attachment) => {
    const chip = document.createElement("span");
    chip.className = "attachment-chip";
    chip.textContent = attachment.name;
    attachmentStrip.append(chip);
  });
}

function emptyHero() {
  const hero = document.createElement("section");
  hero.className = "empty-hero";
  hero.innerHTML = `
    <span class="hero-kicker">AI browser workspace</span>
    <h1>Ask, browse, remember, delegate.</h1>
    <p>Start in full-screen Augmentor. When a task needs the web, memory, Hermes, or OpenCode, ResonantOS routes it into the right workspace with the same governed boundaries.</p>
    <div class="capability-grid" aria-label="ResonantOS quick starts">
      <button type="button" data-workspace-command="answer" data-prompt="Help me think through the best next step for this project.">
        <span>Answer</span>
        <strong>Think with Augmentor</strong>
        <small>Strategy, planning, synthesis, and direct conversation.</small>
      </button>
      <button type="button" data-workspace-command="browser" data-prompt="Go to resonantos.com and summarize the DAO page.">
        <span>Browser Control</span>
        <strong>Operate the web</strong>
        <small>Open pages, read, click, type, and stop at approval gates.</small>
      </button>
      <button type="button" data-workspace-command="memory" data-prompt="/memory ResonantOS">
        <span>Living Archive</span>
        <strong>Search AI Memory</strong>
        <small>Query the LLM Wiki and save notes to governed intake.</small>
      </button>
      <button type="button" data-workspace-command="artifacts" data-prompt="">
        <span>Artifacts</span>
        <strong>Review browser reports</strong>
        <small>Open saved Agent Control reports and intake evidence.</small>
      </button>
      <button type="button" data-workspace-command="addons" data-prompt="">
        <span>Add-ons</span>
        <strong>Inspect replaceable tools</strong>
        <small>See available add-ons, trust tier, and governed launch targets.</small>
      </button>
      <button type="button" data-workspace-command="hermes" data-prompt="/hermes">
        <span>Hermes</span>
        <strong>Open coordination workspace</strong>
        <small>Delegate communication, routine research, and follow-up work.</small>
      </button>
      <button type="button" data-workspace-command="opencode" data-prompt="/opencode Inspect the browser-first workspace and return changed files, tests, and risks.">
        <span>OpenCode</span>
        <strong>Delegate coding work</strong>
        <small>Create bounded coding handoffs with artifact return rules.</small>
      </button>
      <button type="button" data-workspace-command="settings" data-prompt="">
        <span>Settings</span>
        <strong>Provider profiles</strong>
        <small>Add model credentials through the host vault boundary.</small>
      </button>
    </div>
  `;
  hero.querySelectorAll("[data-workspace-command]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (["settings", "artifacts", "addons"].includes(button.dataset.workspaceCommand)) {
        setActiveWorkspace(button.dataset.workspaceCommand, { persist: true });
        renderAll();
        return;
      }
      commandInput.value = button.dataset.prompt;
      if (button.dataset.workspaceCommand === "answer") {
        commandInput.focus();
        return;
      }
      await commandForm.requestSubmit();
    });
  });
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
    renderSettingsWorkspace({ container: transcript, bridgeRequest });
    return;
  }
  const messages = chatSessionStore.getMessages();
  if (!messages.length) {
    transcript.append(emptyHero());
    return;
  }
  messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;
    article.dataset.messageId = message.id;
    const header = document.createElement("div");
    header.className = "message-header";
    const label = document.createElement("strong");
    label.textContent = message.role === "user" ? "You" : message.role === "system" ? "System" : "Augmentor";
    const time = document.createElement("time");
    time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    header.append(label, time);
    const body = document.createElement("div");
    body.className = "message-content";
    body.innerHTML = markdownToSafeHtml(message.content);
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.append(messageActionButton("copy", "Copy", "Copy this message", () => void copyMessage(message)));
    actions.append(messageActionButton("fork", "Fork", "Fork the conversation up to this message", () => void forkFromMessage(message.id)));
    if (message.role === "user") {
      actions.append(messageActionButton("edit", "Edit", "Edit this message in the composer", () => editMessage(message.id)));
    }
    if (message.role === "assistant") {
      actions.append(messageActionButton("archive", "Save to Living Archive", "Save this message to Living Archive intake", () => void saveMessageToArchive(message.id)));
      actions.append(messageActionButton("refresh", "Regenerate", "Regenerate from the previous user message", () => void regenerateFromMessage(message.id)));
      if (message.usage) {
        actions.append(messageActionButton("stats", "Stats", "Show generation stats", () => void showMessageStats(message.id)));
      }
    }
    actions.append(messageActionButton("delete", "Delete", "Delete this message", () => void deleteMessage(message.id)));
    article.append(header, body, actions);
    transcript.append(article);
  });
  requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function messageActionButton(action, label, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-action";
  button.dataset.action = action;
  button.title = title;
  button.setAttribute("aria-label", label);
  button.innerHTML = ACTION_ICONS[action];
  button.addEventListener("click", onClick);
  return button;
}

async function copyMessage(message) {
  const text = String(message?.content ?? "");
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      flashCopied(message.id);
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
  flashCopied(message.id);
}

function flashCopied(messageId) {
  const escapedId = window.CSS?.escape ? window.CSS.escape(messageId) : String(messageId).replace(/["\\]/g, "\\$&");
  const button = transcript.querySelector(`[data-message-id="${escapedId}"] .message-action[data-action="copy"]`);
  if (!button) return;
  button.innerHTML = ACTION_ICONS.check;
  window.setTimeout(() => {
    button.innerHTML = ACTION_ICONS.copy;
  }, 1400);
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
  busy = true;
  commandInput.disabled = true;
  renderAll();
  try {
    await runChatTurn(userMessage.content);
  } catch (error) {
    await addMessage("system", `Regeneration failed: ${error instanceof Error ? error.message : String(error)}`);
    updateConnectionLine("Failed");
  } finally {
    busy = false;
    commandInput.disabled = false;
  }
}

function renderAll() {
  setActiveWorkspace(activeWorkspace);
  renderMessages();
  renderAttachments();
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
  return message;
}

async function openSidebar() {
  await chrome.runtime.sendMessage({
    channel: "resonantos.browser_first",
    type: "open_side_panel"
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
  updateConnectionLine("Thinking");
  const response = await bridgeRequest("/augmentor/chat", {
    method: "POST",
    body: {
      model: modelSelect.value,
      thinkingDepth: thinkingDepthSelect.value,
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

commandForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const prompt = commandInput.value.trim();
  if (!prompt) return;
  busy = true;
  commandInput.disabled = true;
  try {
    await addMessage("user", prompt);
    commandInput.value = "";
    composerController.resetUndoStack("");
    const shouldControl = parseAutonomousBrowserActionIntent(prompt) ||
      parseNaturalBrowserIntent(prompt);
    if (parseMemorySlashCommand(prompt) !== null) {
      await runMemoryCommand(prompt);
    } else if (parseOpenCodeSlashCommand(prompt) !== null) {
      await runOpenCodeCommand(prompt);
    } else if (parseHermesSlashCommand(prompt) !== null) {
      await runHermesDelegation(prompt);
    } else if (await runDraftAddonCommand(prompt)) {
      // Draft-only communication/scheduling packets are handled locally.
    } else if (shouldControl) {
      await handoffToBrowserControl(prompt);
    } else {
      await runChatTurn(prompt);
    }
  } catch (error) {
    await addMessage("system", `Main workspace request failed: ${error instanceof Error ? error.message : String(error)}`);
    updateConnectionLine("Failed");
  } finally {
    busy = false;
    commandInput.disabled = false;
  }
});

composerController.bind();

newChatButton?.addEventListener("click", async () => {
  activeWorkspace = "answer";
  await persistActiveWorkspace();
  await chatSessionStore.createSession({ workspaceId: "answer" });
  commandInput.value = "";
  composerController.resetUndoStack("");
  renderAll();
  commandInput.focus();
});

openSidebarButton.addEventListener("click", () => void openSidebar());
readPageButton?.addEventListener("click", () => void handoffSidebarPrompt(
  "/browser read",
  "Opened the sidebar to read the current browser page."
));
saveIntakeButton?.addEventListener("click", () => void handoffSidebarPrompt(
  "/save page",
  "Opened the sidebar to save the current browser page to Living Archive intake."
));
saveSelectionButton?.addEventListener("click", () => void handoffSidebarPrompt(
  "/save selection",
  "Opened the sidebar to save selected browser text to Living Archive intake."
));
contextToggleButton?.addEventListener("click", () => void openSidebar());
workspaceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveWorkspace(button.dataset.workspace, { persist: true });
    renderAll();
  });
});
attachFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const attachments = Array.from(fileInput.files ?? []).map((file) => ({
    id: `${Date.now()}-${file.name}`,
    name: file.name,
    type: file.type,
    size: file.size
  }));
  await chatSessionStore.addAttachments(attachments);
  renderAll();
  fileInput.value = "";
});
modelSelect.addEventListener("change", () => void chatSessionStore.persist().then(() => updateConnectionLine()));
thinkingDepthSelect.addEventListener("change", () => void chatSessionStore.persist());
dictateButton.addEventListener("click", () => {
  void addMessage("system", "Audio dictate is not available in this browser runtime yet.");
});

await Promise.all([
  chatSessionStore.hydrate(),
  hydrateActiveWorkspace()
]);
await chatSessionStore.ensureFreshSession({ workspaceId: "answer" });
activeWorkspace = "answer";
await persistActiveWorkspace();
renderAll();
