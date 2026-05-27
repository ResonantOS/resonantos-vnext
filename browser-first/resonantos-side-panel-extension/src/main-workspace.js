import {
  normalizeBrowserUrl,
  parseAmazonShoppingTask,
  parseAutonomousBrowserActionIntent,
  parseNaturalBrowserIntent
} from "./lib/browser-command-parser.js";
import { createBridgeClient } from "./lib/bridge-client.js";
import { createChatSessionStore } from "./lib/chat-session-store.js";

const STORAGE_KEYS = {
  messages: "augmentorBrowserMessages",
  forks: "augmentorBrowserForks",
  sessions: "augmentorBrowserSessions",
  activeSessionId: "augmentorActiveBrowserSessionId",
  model: "augmentorModel",
  thinkingDepth: "augmentorThinkingDepth",
  attachments: "augmentorBrowserAttachments",
  pendingSidebarPrompt: "augmentorPendingSidebarPrompt"
};

const MODEL_LABELS = {
  "MiniMax-M2.7": "MiniMax 2.7",
  "MiniMax-M2.7-highspeed": "MiniMax 2.7 High Speed",
  "gpt-5.5": "GPT 5.5",
  "gpt-5.4-mini": "GPT 5.4 Mini",
  "batiai/gemma4-e2b:q4": "Gemma 4 2B"
};

const transcript = document.querySelector("#transcript");
const chatHistory = document.querySelector("#chat-history");
const newChatButton = document.querySelector("#new-chat");
const openSidebarButton = document.querySelector("#open-sidebar");
const commandForm = document.querySelector("#command-form");
const commandInput = document.querySelector("#command-input");
const attachFileButton = document.querySelector("#attach-file");
const fileInput = document.querySelector("#file-input");
const attachmentStrip = document.querySelector("#attachment-strip");
const modeSelect = document.querySelector("#mode-select");
const modelSelect = document.querySelector("#model-select");
const thinkingDepthSelect = document.querySelector("#thinking-depth");
const connectionLine = document.querySelector("#connection-line");
const bridgeRequest = createBridgeClient();
let busy = false;

const supportsThinkingDepth = (model) => model.startsWith("gpt-5.");
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
  connectionLine.textContent = `Connected to ${model} · ${status}`;
}

function renderChatHistory() {
  chatHistory.replaceChildren();
  chatSessionStore.getSessions().forEach((session) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = session.title || "New chat";
    button.title = session.title || "New chat";
    if (session.id === chatSessionStore.getActiveSessionId()) {
      button.setAttribute("aria-current", "true");
    }
    button.addEventListener("click", async () => {
      await chatSessionStore.switchSession(session.id);
      renderAll();
    });
    item.append(button);
    chatHistory.append(item);
  });
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
    <h1>ResonantOS</h1>
    <p>Ask Augmentor from the full workspace. If the task needs the web, ResonantOS will move into browser + sidebar control mode.</p>
    <div class="prompt-grid">
      <button type="button" data-prompt="Find the most relevant context about ResonantOS and summarize it.">Research the web</button>
      <button type="button" data-prompt="Help me plan the next implementation step for ResonantOS.">Plan work</button>
      <button type="button" data-prompt="Go to resonantos.com and inspect the DAO page.">Control browser</button>
    </div>
  `;
  hero.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      commandInput.value = button.dataset.prompt;
      commandInput.focus();
    });
  });
  return hero;
}

function renderMessages() {
  transcript.replaceChildren();
  const messages = chatSessionStore.getMessages();
  if (!messages.length) {
    transcript.append(emptyHero());
    return;
  }
  messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;
    const header = document.createElement("div");
    header.className = "message-header";
    const label = document.createElement("strong");
    label.textContent = message.role === "user" ? "You" : message.role === "system" ? "System" : "Augmentor";
    const time = document.createElement("time");
    time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    header.append(label, time);
    const body = document.createElement("p");
    body.textContent = message.content;
    article.append(header, body);
    transcript.append(article);
  });
  requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function renderAll() {
  renderMessages();
  renderAttachments();
  renderChatHistory();
  updateConnectionLine();
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
  await addMessage("assistant", response?.content || "No response was returned.", {
    usage: response?.usage ?? null
  });
  updateConnectionLine("Ready");
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
    const shouldControl = modeSelect.value === "browser" ||
      parseAutonomousBrowserActionIntent(prompt) ||
      parseNaturalBrowserIntent(prompt);
    if (shouldControl) {
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

commandInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  event.preventDefault();
  commandForm.requestSubmit();
});

newChatButton.addEventListener("click", async () => {
  await chatSessionStore.createSession();
  commandInput.value = "";
  renderAll();
  commandInput.focus();
});

openSidebarButton.addEventListener("click", () => void openSidebar());
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

await chatSessionStore.hydrate();
renderAll();
