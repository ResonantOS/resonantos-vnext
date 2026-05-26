import { existsSync, readdirSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import http from "node:http";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const hostBinary = path.join(
  repoRoot,
  "addons",
  "resonant-browser-native",
  "build",
  "ResonantBrowserNativeHost.app",
  "Contents",
  "MacOS",
  "ResonantBrowserNativeHost",
);
const resonantExtension = path.join(repoRoot, "browser-first", "resonantos-side-panel-extension");
const defaultProfile = path.join(os.homedir(), "ResonantOS_User", "BrowserFirst", "Profiles", "main");
const phantomExtensionId = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const resonantExtensionId = "cdpdmmalhmokbfcfgogoepnjplaakgnl";
const defaultBridgePort = 47773;

function parseArgs(argv) {
  const parsed = new Map();
  for (const arg of argv) {
    const [key, ...valueParts] = arg.replace(/^--/, "").split("=");
    parsed.set(key, valueParts.length ? valueParts.join("=") : "true");
  }
  return parsed;
}

function latestManifestDirectory(root) {
  if (!existsSync(root)) {
    return null;
  }
  const versions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(root, name, "manifest.json")))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  return versions[0] ? path.join(root, versions[0]) : null;
}

function chromeProfileRoots() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return [
      path.join(home, "Library", "Application Support", "Google", "Chrome"),
      path.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser"),
      path.join(home, "Library", "Application Support", "Chromium"),
    ];
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return [
      path.join(local, "Google", "Chrome", "User Data"),
      path.join(local, "BraveSoftware", "Brave-Browser", "User Data"),
      path.join(local, "Chromium", "User Data"),
    ];
  }
  return [
    path.join(home, ".config", "google-chrome"),
    path.join(home, ".config", "BraveSoftware", "Brave-Browser"),
    path.join(home, ".config", "chromium"),
  ];
}

function findPhantomExtension() {
  if (process.env.RESONANTOS_PHANTOM_EXTENSION_DIR) {
    const override = path.resolve(process.env.RESONANTOS_PHANTOM_EXTENSION_DIR);
    return existsSync(path.join(override, "manifest.json")) ? override : null;
  }
  for (const root of chromeProfileRoots()) {
    if (!existsSync(root)) {
      continue;
    }
    const profileNames = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (entry.name === "Default" || /^Profile \d+$/i.test(entry.name)))
      .map((entry) => entry.name);
    for (const profile of profileNames) {
      const candidate = latestManifestDirectory(path.join(root, profile, "Extensions", phantomExtensionId));
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function seedPinnedExtensions(profileDir, extensionIds) {
  const defaultDir = path.join(profileDir, "Default");
  const preferencesPath = path.join(defaultDir, "Preferences");
  await mkdir(defaultDir, { recursive: true });
  let preferences = {};
  if (existsSync(preferencesPath)) {
    preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
  }
  preferences.extensions = preferences.extensions ?? {};
  preferences.account_values = preferences.account_values ?? {};
  preferences.account_values.extensions = preferences.account_values.extensions ?? {};
  preferences.extensions.pinned_extensions = unique([
    ...extensionIds,
    ...(preferences.extensions.pinned_extensions ?? []),
  ]);
  preferences.account_values.extensions.pinned_extensions = unique([
    ...extensionIds,
    ...(preferences.account_values.extensions.pinned_extensions ?? []),
  ]);
  await writeFile(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`);
}

function providerSecretsPath() {
  return path.join(os.homedir(), "ResonantOS_User", "Secrets", "provider-secrets.json");
}

function userRoot() {
  return path.join(os.homedir(), "ResonantOS_User");
}

function memoryRoot() {
  return path.join(userRoot(), "Memory");
}

function browserFirstRoot() {
  return path.join(userRoot(), "BrowserFirst");
}

function safeFileSlug(value) {
  return String(value ?? "item")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

async function listFilesRecursive(root, predicate, limit = 300) {
  const files = [];
  async function walk(current) {
    if (files.length >= limit || !existsSync(current)) {
      return;
    }
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= limit || entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  await walk(root);
  return files;
}

async function countFiles(root, predicate) {
  return (await listFilesRecursive(root, predicate, 10_000)).length;
}

async function pathSummary(filePath) {
  if (!existsSync(filePath)) {
    return { exists: false, path: filePath };
  }
  const details = await stat(filePath);
  return {
    exists: true,
    path: filePath,
    bytes: details.size,
    modifiedAt: details.mtime.toISOString(),
  };
}

async function readProviderSecrets() {
  const filePath = providerSecretsPath();
  if (!existsSync(filePath)) {
    return {};
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sanitizeAssistantContent(providerType, content) {
  if (providerType !== "minimax") {
    return String(content ?? "").trim();
  }
  return String(content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
}

function providerRouteForModel(model) {
  if (model?.startsWith("gpt-")) {
    return {
      providerId: "shared-openai",
      providerType: "openai",
      apiBaseUrl: "https://api.openai.com/v1",
      wireModel: model,
      label: "Shared OpenAI",
    };
  }
  return {
    providerId: "shared-minimax",
    providerType: "minimax",
    apiBaseUrl: "https://api.minimax.io/v1",
    wireModel: model === "MiniMax-M2.7-highspeed" ? "MiniMax-M2.7" : model || "MiniMax-M2.7",
    label: "Shared MiniMax",
  };
}

function extractAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text ?? part?.content ?? "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

async function executeBridgeChat(payload) {
  const route = providerRouteForModel(payload.model);
  const secrets = await readProviderSecrets();
  const apiKey = secrets[route.providerId];
  if (!apiKey) {
    throw new Error(`${route.label} credential missing. Add it in ResonantOS Provider Profiles.`);
  }
  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .filter((message) => ["user", "assistant"].includes(message?.role) && String(message?.content ?? "").trim())
        .map((message) => ({ role: message.role, content: String(message.content).trim() }))
    : [];
  if (!messages.length) {
    throw new Error("No chat message was provided.");
  }
  const systemPrompt = [
    "You are Augmentor, the Strategist agent inside ResonantOS.",
    "You are running inside the ResonantOS browser side bar.",
    "The web page remains in the main browser viewport; never suggest replacing the page with chat UI.",
    "ResonantOS provides host-mediated browser tools outside the model call: open/search pages, read the active page, click visible page text, and type into editable fields.",
    "If the user asks you to navigate, search a site, shop, book, click, type, or operate a webpage, do not claim you will do it in plain chat. Those requests must be handled by the host Agent Control Mode before the model call.",
    "If such a browser-action request reaches you anyway, state that the browser-control router missed it and ask the user to retry with `/control <task>`; do not pretend that you opened pages or clicked anything.",
    "When the host has already returned a browser-tool result in the conversation, treat that result as authoritative and explain the next useful action.",
    "If the user asks for a browser action that was not executed by the host, ask them to retry with a specific page action instead of claiming you are only a text assistant.",
    "Wallet signing, seed phrases, credential autofill, and public submissions require explicit human approval and must not be automated.",
    "Be direct, pragmatic, and concise.",
    "If browser page context is provided, use it as context but do not claim to mutate memory or execute tools unless the host explicitly returned that result.",
    payload.pageContext ? `Current browser page context:\n${String(payload.pageContext).slice(0, 8000)}` : "",
    payload.runtimeContext ? `Current ResonantOS runtime context:\n${String(payload.runtimeContext).slice(0, 6000)}` : "",
  ].filter(Boolean).join("\n\n");
  const requestMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];
  const response = await fetch(`${route.apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.wireModel,
      messages: requestMessages,
      ...(route.providerType === "openai" ? { reasoning_effort: payload.thinkingDepth ?? "minimal" } : {}),
    }),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = responsePayload?.error?.message ?? `Provider request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  const reply = sanitizeAssistantContent(route.providerType, extractAssistantContent(responsePayload));
  if (!reply) {
    throw new Error("Provider returned an empty reply.");
  }
  return {
    reply,
    providerId: route.providerId,
    model: payload.model || route.wireModel,
    usage: responsePayload?.usage ?? null,
  };
}

async function executeInlineAssistant(payload) {
  const action = String(payload.action ?? "summarize").trim().toLowerCase();
  const prompt = String(payload.prompt ?? "").trim().slice(0, 1200);
  const selection = String(payload.selection ?? "").trim().slice(0, 8000);
  const pageContext = String(payload.pageContext ?? "").trim().slice(0, 4000);
  if (!selection) {
    throw new Error("Inline Assistant requires selected text.");
  }
  if (action === "custom" && !prompt) {
    return {
      reply: "Add a custom instruction, then press Ask.",
      providerId: "local-fallback",
      model: "local-inline-fallback",
      usage: null,
    };
  }
  const route = providerRouteForModel(payload.model);
  const secrets = await readProviderSecrets();
  const apiKey = secrets[route.providerId];
  if (!apiKey) {
    return {
      reply: fallbackInlineAssistant({ action, selection, prompt }),
      providerId: "local-fallback",
      model: "local-inline-fallback",
      usage: null,
    };
  }
  const systemPrompt = [
    "You are Augmentor Inline Assistant inside the ResonantOS browser.",
    "Answer only the selected text task. Be concise and useful.",
    "Do not execute browser actions, make purchases, submit forms, access credentials, or claim you changed the page.",
    "For fact-checking, separate verified-looking claims from uncertainty and suggest what should be checked next.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    action,
    customInstruction: prompt || null,
    selectedText: selection,
    pageContext,
  });
  const response = await fetch(`${route.apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.wireModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(route.providerType === "openai" ? { reasoning_effort: payload.thinkingDepth ?? "minimal" } : {}),
    }),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      reply: fallbackInlineAssistant({ action, selection, prompt }),
      providerId: "local-fallback",
      model: "local-inline-fallback",
      usage: { providerError: responsePayload?.error?.message ?? `HTTP ${response.status}` },
    };
  }
  const reply = sanitizeAssistantContent(route.providerType, extractAssistantContent(responsePayload));
  return {
    reply: reply || fallbackInlineAssistant({ action, selection, prompt }),
    providerId: route.providerId,
    model: payload.model || route.wireModel,
    usage: responsePayload?.usage ?? null,
  };
}

function fallbackInlineAssistant({ action, selection, prompt = "" }) {
  const text = String(selection ?? "").replace(/\s+/g, " ").trim();
  const clipped = text.length > 700 ? `${text.slice(0, 700)}...` : text;
  if (action === "custom") {
    return `Custom instruction queued for configured model:\n${prompt}\n\nSelected text:\n${clipped}`;
  }
  if (action === "translate") {
    return `Translation needs the configured model. Selected text:\n\n${clipped}`;
  }
  if (action === "rewrite" || action === "improve") {
    return clipped.replace(/\bteh\b/gi, "the").replace(/\bi\b/g, "I");
  }
  if (action === "define") {
    return `Definition context needed. Selected phrase: ${clipped}`;
  }
  if (action === "fact-check") {
    return `Fact-check queue:\n- Claim to verify: ${clipped}\n- Check primary sources before relying on this.`;
  }
  if (action === "explain") {
    return `Plain-language explanation:\n${clipped}`;
  }
  return `Summary:\n${clipped}`;
}

function extractJsonObject(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error("Planner returned an empty response.");
  }
  try {
    return JSON.parse(text);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]?.trim();
    if (fenced) {
      return JSON.parse(fenced);
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Planner response was not valid JSON.");
  }
}

function trimPlannerSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  return {
    title: String(snapshot.title ?? "").slice(0, 180),
    url: String(snapshot.url ?? "").slice(0, 800),
    text: String(snapshot.text ?? "").slice(0, 6000),
    viewport: snapshot.viewport ?? null,
    links: Array.isArray(snapshot.links) ? snapshot.links.slice(0, 30) : [],
    controls: Array.isArray(snapshot.controls) ? snapshot.controls.slice(0, 40) : [],
    fields: Array.isArray(snapshot.fields) ? snapshot.fields.slice(0, 30) : [],
    tabs: Array.isArray(snapshot.tabs) ? snapshot.tabs.slice(0, 30) : [],
    walletProviders: snapshot.walletProviders ?? null,
  };
}

function sanitizeControlText(value, label, max = 280) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`Planner step is missing ${label}.`);
  }
  return text.slice(0, max);
}

function sanitizeControlUrl(value) {
  const text = sanitizeControlText(value, "target", 900).replace(/[.,;:!?]+$/, "");
  const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Planner can only open http or https pages.");
  }
  return url.toString();
}

function stepRequiresHumanApproval(step) {
  const combined = `${step.type ?? ""} ${step.text ?? ""} ${step.field ?? ""} ${step.target ?? ""} ${step.query ?? ""}`.toLowerCase();
  return /\b(seed|private key|password|passphrase|wallet|phantom|sign|signature|approve|confirm|buy|sell|swap|stake|unstake|bridge|mint|claim|pay|payment|checkout|login|submit|publish|post|delete|remove|transfer)\b/.test(combined);
}

function sanitizeControlStep(step) {
  if (!step || typeof step !== "object") {
    throw new Error("Planner step must be an object.");
  }
  const type = String(step.type ?? "").trim().toLowerCase();
  if (["inspect", "read"].includes(type)) {
    return { type: "read" };
  }
  if (type === "forms") {
    return { type: "forms" };
  }
  if (type === "tabs") {
    return { type: "tabs" };
  }
  if (type === "switch_tab") {
    const tabId = Number(step.tabId ?? step.id);
    if (!Number.isInteger(tabId) || tabId < 0) {
      throw new Error("Switch-tab action requires a numeric tabId.");
    }
    return { type: "switch_tab", tabId };
  }
  if (type === "open") {
    const sanitized = { type: "open", target: sanitizeControlUrl(step.target ?? step.url) };
    if (stepRequiresHumanApproval(sanitized)) {
      throw new Error("Planner attempted to open a restricted wallet/payment/signing target.");
    }
    return sanitized;
  }
  if (type === "search") {
    return {
      type: "search",
      action: step.action === "news" ? "news" : "search",
      query: sanitizeControlText(step.query, "query", 220),
    };
  }
  if (type === "click") {
    const sanitized = {
      type: "click",
      text: step.text ? sanitizeControlText(step.text, "text") : "",
      ref: step.ref ? sanitizeControlText(step.ref, "ref", 80) : "",
    };
    if (!sanitized.text && !sanitized.ref) {
      throw new Error("Planner click step requires text or ref.");
    }
    if (stepRequiresHumanApproval(sanitized)) {
      throw new Error("Planner attempted to automate a restricted click.");
    }
    return sanitized;
  }
  if (type === "type") {
    const sanitized = {
      type: "type",
      text: sanitizeControlText(step.text, "text", 600),
      field: step.field ? sanitizeControlText(step.field, "field", 160) : "",
      ref: step.ref ? sanitizeControlText(step.ref, "ref", 80) : "",
      submit: Boolean(step.submit),
    };
    if (stepRequiresHumanApproval(sanitized)) {
      throw new Error("Planner attempted to automate restricted typing.");
    }
    return sanitized;
  }
  if (type === "scroll") {
    const direction = ["up", "down", "top", "bottom"].includes(step.direction) ? step.direction : "down";
    return { type: "scroll", direction };
  }
  if (type === "wait") {
    const ms = Math.min(5000, Math.max(250, Number(step.ms ?? 1000) || 1000));
    return { type: "wait", ms };
  }
  if (type === "stop") {
    return {
      type: "stop",
      reason: String(step.reason ?? "Planner stopped before a restricted action.").slice(0, 500),
    };
  }
  throw new Error(`Unsupported planner step type: ${type || "missing"}.`);
}

function sanitizeNextActionDecision(decision) {
  if (!decision || typeof decision !== "object") {
    throw new Error("Next-action response must be an object.");
  }
  const status = String(decision.status ?? "continue").trim().toLowerCase();
  if (!["continue", "done", "needs_approval", "blocked"].includes(status)) {
    throw new Error(`Unsupported next-action status: ${status || "missing"}.`);
  }
  const base = {
    source: String(decision.source ?? "llm").slice(0, 80),
    status,
    thought: String(decision.thought ?? "").trim().slice(0, 500),
    doneSummary: decision.doneSummary ? String(decision.doneSummary).trim().slice(0, 700) : null,
    approvalReason: decision.approvalReason ? String(decision.approvalReason).trim().slice(0, 700) : null,
    action: null,
  };
  if (status === "done") {
    return {
      ...base,
      doneSummary: base.doneSummary || base.thought || "The browser task is complete.",
    };
  }
  if (status === "needs_approval" || status === "blocked") {
    return {
      ...base,
      approvalReason: base.approvalReason || base.thought || "The browser task cannot continue safely.",
    };
  }
  let action = null;
  try {
    action = sanitizeControlStep(decision.action);
  } catch (error) {
    return {
      ...base,
      status: "blocked",
      approvalReason: error instanceof Error ? error.message : String(error),
      action: null,
    };
  }
  if (action.type === "stop") {
    return {
      ...base,
      status: "needs_approval",
      approvalReason: action.reason,
    };
  }
  if (stepRequiresHumanApproval(action)) {
    return {
      ...base,
      status: "needs_approval",
      approvalReason: "This browser action requires human approval.",
      action: null,
    };
  }
  return { ...base, action };
}

function sanitizeControlPlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new Error("Planner response must be an object.");
  }
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];
  const steps = [];
  for (const rawStep of rawSteps.slice(0, 8)) {
    const step = sanitizeControlStep(rawStep);
    if (step.type === "stop") {
      return {
        summary: String(plan.summary ?? "Planner stopped before a restricted action.").slice(0, 500),
        steps,
        needsApproval: true,
        approvalReason: step.reason,
      };
    }
    steps.push(step);
  }
  if (!steps.length && !plan.needsApproval) {
    throw new Error("Planner returned no executable steps.");
  }
  return {
    summary: String(plan.summary ?? "Browser control plan").slice(0, 500),
    steps,
    needsApproval: Boolean(plan.needsApproval),
    approvalReason: plan.approvalReason ? String(plan.approvalReason).slice(0, 500) : null,
  };
}

async function executeControlPlan(payload) {
  const route = providerRouteForModel(payload.model);
  const secrets = await readProviderSecrets();
  const apiKey = secrets[route.providerId];
  if (!apiKey) {
    throw new Error(`${route.label} credential missing. Falling back to deterministic browser control is required.`);
  }
  const goal = String(payload.goal ?? "").trim();
  if (!goal) {
    throw new Error("Planner requires a browser goal.");
  }
  const pageSnapshot = trimPlannerSnapshot(payload.pageSnapshot);
  const plannerPrompt = [
    "You are the ResonantOS browser control planner.",
    "Return strict JSON only. Do not include markdown or commentary.",
    "You do not execute actions. You only propose a bounded plan for the host to validate and execute.",
    "Allowed step types:",
    "- {\"type\":\"read\"}",
    "- {\"type\":\"open\",\"target\":\"https://example.com\"}",
    "- {\"type\":\"search\",\"query\":\"query\",\"action\":\"search|news\"}",
    "- {\"type\":\"forms\"}",
    "- {\"type\":\"tabs\"}",
    "- {\"type\":\"switch_tab\",\"tabId\":123}",
    "- {\"type\":\"click\",\"text\":\"visible button or link text\",\"ref\":\"optional observed control ref\"}",
    "- {\"type\":\"type\",\"text\":\"text to type\",\"field\":\"optional visible search/input label\",\"ref\":\"optional observed field ref\",\"submit\":false}",
    "- {\"type\":\"scroll\",\"direction\":\"up|down|top|bottom\"}",
    "- {\"type\":\"stop\",\"reason\":\"why human approval is required\"}",
    "Never plan wallet signing, seed phrases, passwords, payments, public posting, account login, destructive document changes, or public form submission. Search-field enter is allowed.",
    "If the goal requires one of those restricted actions, return needsApproval true and a stop reason.",
    "Prefer read/forms before clicking or typing when the page state is unclear.",
    "Use visible controls and fields from the supplied snapshot when possible.",
    "JSON schema: {\"summary\":\"short\", \"steps\":[...], \"needsApproval\":false, \"approvalReason\":null}",
  ].join("\n");
  const userPrompt = JSON.stringify({
    goal,
    pageSnapshot,
  });
  const response = await fetch(`${route.apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.wireModel,
      messages: [
        { role: "system", content: plannerPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(route.providerType === "openai" ? { reasoning_effort: payload.thinkingDepth ?? "minimal", response_format: { type: "json_object" } } : {}),
    }),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = responsePayload?.error?.message ?? `Provider planner request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  const content = sanitizeAssistantContent(route.providerType, extractAssistantContent(responsePayload));
  return {
    plan: sanitizeControlPlan(extractJsonObject(content)),
    providerId: route.providerId,
    model: payload.model || route.wireModel,
    usage: responsePayload?.usage ?? null,
  };
}

async function executeNextAction(payload) {
  const route = providerRouteForModel(payload.model);
  const secrets = await readProviderSecrets();
  const apiKey = secrets[route.providerId];
  if (!apiKey) {
    throw new Error(`${route.label} credential missing. Falling back to deterministic browser control is required.`);
  }
  const goal = String(payload.goal ?? "").trim();
  if (!goal) {
    throw new Error("Next-action route requires a browser goal.");
  }
  const pageSnapshot = trimPlannerSnapshot(payload.pageSnapshot);
  const history = Array.isArray(payload.history)
    ? payload.history.slice(-10).map((item) => ({
        action: item?.action ?? null,
        result: item?.result ?? null,
        observation: item?.observation ?? null,
      }))
    : [];
  const nextActionPrompt = [
    "You are the ResonantOS browser agent controller.",
    "You are not a chatbot in this route. You choose exactly one next browser action after observing the current page.",
    "Return strict JSON only. Do not include markdown or commentary.",
    "Use an observe-decide-act-verify loop: choose one action, wait for the host to execute it, then decide again from the next observation.",
    "The observation can include open tabs. Use them for context, but act only through the controlled tab unless an explicit tab-switch tool exists.",
    "Allowed action types:",
    "- {\"type\":\"read\"}",
    "- {\"type\":\"open\",\"target\":\"https://example.com\"}",
    "- {\"type\":\"search\",\"query\":\"query\",\"action\":\"search|news\"}",
    "- {\"type\":\"forms\"}",
    "- {\"type\":\"tabs\"}",
    "- {\"type\":\"switch_tab\",\"tabId\":123}",
    "- {\"type\":\"click\",\"text\":\"visible button, link, option, or control text\",\"ref\":\"optional observed control ref\"}",
    "- {\"type\":\"type\",\"text\":\"text to type\",\"field\":\"optional visible search/input label\",\"ref\":\"optional observed field ref\",\"submit\":false}",
    "- {\"type\":\"scroll\",\"direction\":\"up|down|top|bottom\"}",
    "- {\"type\":\"wait\",\"ms\":1000}",
    "Never automate wallet signing, seed phrases, passwords, payment, checkout, login, public submission, posting, destructive document edits, or irreversible account actions. Search-field enter is allowed.",
    "If the next step needs one of those actions, return status needs_approval with approvalReason.",
    "If the goal is complete based on the current page observation, return status done and doneSummary.",
    "If you cannot continue because the page lacks the required controls or content, return status blocked and approvalReason.",
    "Prefer observed refs from controls and fields when available; otherwise use precise visible text. Do not claim completion unless the observation proves it.",
    "JSON schema: {\"thought\":\"short user-visible status\", \"status\":\"continue|done|needs_approval|blocked\", \"action\":{...}|null, \"approvalReason\":null|string, \"doneSummary\":null|string}",
  ].join("\n");
  const userPrompt = JSON.stringify({
    goal,
    pageSnapshot,
    history,
  });
  const response = await fetch(`${route.apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.wireModel,
      messages: [
        { role: "system", content: nextActionPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(route.providerType === "openai" ? { reasoning_effort: payload.thinkingDepth ?? "minimal", response_format: { type: "json_object" } } : {}),
    }),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = responsePayload?.error?.message ?? `Provider next-action request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  const content = sanitizeAssistantContent(route.providerType, extractAssistantContent(responsePayload));
  return {
    decision: sanitizeNextActionDecision(extractJsonObject(content)),
    providerId: route.providerId,
    model: payload.model || route.wireModel,
    usage: responsePayload?.usage ?? null,
  };
}

async function executeMemoryStatus() {
  const root = memoryRoot();
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  const intakeRoot = path.join(root, "INTAKE");
  const reviewRoot = path.join(root, "REVIEW");
  const indexPath = path.join(root, "AI_MEMORY", "wiki", "index.md");
  const logPath = path.join(root, "AI_MEMORY", "wiki", "log.md");
  const markdownPredicate = (filePath) => /\.(md|markdown)$/i.test(filePath);
  return {
    root,
    exists: existsSync(root),
    wiki: {
      root: wikiRoot,
      pages: await countFiles(wikiRoot, markdownPredicate),
      index: await pathSummary(indexPath),
      log: await pathSummary(logPath),
    },
    intake: {
      root: intakeRoot,
      artifacts: await countFiles(intakeRoot, () => true),
    },
    review: {
      root: reviewRoot,
      requests: await countFiles(path.join(reviewRoot, "requests"), () => true),
      artifacts: await countFiles(path.join(reviewRoot, "artifacts"), () => true),
    },
  };
}

async function executeMemorySearch(payload) {
  const query = String(payload.query ?? "").trim().toLowerCase();
  if (query.length < 2) {
    throw new Error("Memory search requires at least two characters.");
  }
  const root = path.join(memoryRoot(), "AI_MEMORY");
  const files = await listFilesRecursive(root, (filePath) => /\.(md|markdown)$/i.test(filePath), 600);
  const matches = [];
  for (const filePath of files) {
    const content = await readFile(filePath, "utf8").catch(() => "");
    const index = content.toLowerCase().indexOf(query);
    if (index < 0) {
      continue;
    }
    const start = Math.max(0, index - 160);
    const end = Math.min(content.length, index + query.length + 220);
    matches.push({
      path: path.relative(memoryRoot(), filePath),
      title: path.basename(filePath, path.extname(filePath)),
      excerpt: content.slice(start, end).replace(/\s+/g, " ").trim(),
    });
    if (matches.length >= Number(payload.limit ?? 8)) {
      break;
    }
  }
  return { query, matches };
}

async function executeArchiveIntake(payload) {
  const title = String(payload.title ?? "Browser note").trim().slice(0, 180);
  const content = String(payload.content ?? "").trim();
  if (!content) {
    throw new Error("Archive intake requires content.");
  }
  const intakeDir = path.join(memoryRoot(), "INTAKE", "browser");
  await mkdir(intakeDir, { recursive: true });
  const now = new Date();
  const fileName = `${now.toISOString().replace(/[:.]/g, "-")}-${safeFileSlug(title)}.md`;
  const filePath = path.join(intakeDir, fileName);
  const frontmatter = {
    source: "resonantos-browser-first",
    actor: "augmentor.browser",
    title,
    createdAt: now.toISOString(),
    url: payload.url ?? null,
    sourceMessageId: payload.sourceMessageId ?? null,
  };
  const body = [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    "",
    `# ${title}`,
    "",
    content,
    "",
  ].join("\n");
  await writeFile(filePath, body);
  const logPath = path.join(memoryRoot(), "INTAKE", "browser", "log.md");
  await appendFile(logPath, `## [${now.toISOString()}] browser-intake | ${title}\n- file: ${fileName}\n\n`);
  return {
    path: path.relative(memoryRoot(), filePath),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function executeGoalRecord(payload) {
  const mission = String(payload.mission ?? "").trim();
  if (mission.length < 8) {
    throw new Error("Goal requires a concrete mission.");
  }
  const goalDir = path.join(browserFirstRoot(), "Goals");
  await mkdir(goalDir, { recursive: true });
  const goal = {
    id: `goal-${Date.now()}`,
    mission,
    success: payload.success ?? [],
    constraints: payload.constraints ?? [],
    createdAt: new Date().toISOString(),
    status: "active",
  };
  const goalPath = path.join(goalDir, `${goal.id}.json`);
  await writeFile(goalPath, `${JSON.stringify(goal, null, 2)}\n`);
  return { ...goal, path: path.relative(userRoot(), goalPath) };
}

async function executeDelegationRecord(payload) {
  const target = String(payload.target ?? "").trim().toLowerCase();
  const mission = String(payload.mission ?? "").trim();
  if (!["hermes", "opencode", "engineer"].includes(target)) {
    throw new Error("Delegation target must be hermes, opencode, or engineer.");
  }
  if (mission.length < 8) {
    throw new Error("Delegation requires a concrete mission.");
  }
  const taskDir = path.join(browserFirstRoot(), "Delegations", target);
  await mkdir(taskDir, { recursive: true });
  const id = `${target}-${Date.now()}`;
  const taskPath = path.join(taskDir, `${id}.md`);
  const body = [
    `# Delegation: ${target}`,
    "",
    `- id: ${id}`,
    `- createdAt: ${new Date().toISOString()}`,
    `- source: ResonantOS Browser Layer`,
    `- trust: add-on agent, not core trusted Strategist`,
    "",
    "## Mission",
    mission,
    "",
    "## Boundary",
    "The add-on receives a task packet only. Provider secrets, wallet actions, and trusted memory writes remain host-mediated.",
    "",
  ].join("\n");
  await writeFile(taskPath, body);
  return { id, target, mission, path: path.relative(userRoot(), taskPath), status: "queued" };
}

async function executeAddonsStatus() {
  return {
    addons: [
      {
        id: "addon.hermes",
        name: "Hermes",
        available: existsSync(path.join(repoRoot, "src", "modules", "hermes")),
        mode: "delegation-addon",
        trust: "add-on agent",
      },
      {
        id: "addon.opencode",
        name: "OpenCode",
        available: existsSync(path.join(repoRoot, "src", "modules", "opencode")),
        mode: "coding-addon",
        trust: "add-on agent",
      },
      {
        id: "addon.living-archive",
        name: "Living Archive",
        available: existsSync(memoryRoot()),
        mode: "memory-system",
        trust: "host-mediated memory provider",
      },
    ],
  };
}

async function executeNewsSearch(payload) {
  const query = String(payload.query ?? "top stories").trim() || "top stories";
  const url = query === "top stories"
    ? "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en"
    : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 ResonantOS BrowserFirst" },
  });
  if (!response.ok) {
    throw new Error(`News fetch failed with HTTP ${response.status}.`);
  }
  const xml = await response.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .slice(0, Number(payload.limit ?? 5))
    .map((match) => {
      const item = match[0];
      const title = decodeXmlEntities(/<title>([\s\S]*?)<\/title>/i.exec(item)?.[1] ?? "");
      const link = decodeXmlEntities(/<link>([\s\S]*?)<\/link>/i.exec(item)?.[1] ?? "");
      const source = decodeXmlEntities(/<source[^>]*>([\s\S]*?)<\/source>/i.exec(item)?.[1] ?? "");
      const publishedAt = decodeXmlEntities(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1] ?? "");
      return { title, link, source, publishedAt };
    })
    .filter((item) => item.title);
  return { query, items };
}

async function executeSystemStatus() {
  const secrets = await readProviderSecrets();
  const [memory, addons] = await Promise.all([executeMemoryStatus(), executeAddonsStatus()]);
  const goalsDir = path.join(browserFirstRoot(), "Goals");
  const delegationsDir = path.join(browserFirstRoot(), "Delegations");
  return {
    bridge: "resonantos-browser-first",
    providers: {
      "shared-minimax": Boolean(secrets["shared-minimax"]),
      "shared-openai": Boolean(secrets["shared-openai"]),
    },
    memory,
    addons: addons.addons,
    records: {
      goals: await countFiles(goalsDir, (filePath) => filePath.endsWith(".json")),
      delegations: await countFiles(delegationsDir, (filePath) => filePath.endsWith(".md")),
    },
  };
}

async function startBridgeServer(port) {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        writeJson(response, 204, {});
        return;
      }
      if (request.method === "GET" && request.url === "/status") {
        writeJson(response, 200, { ok: true, ...(await executeSystemStatus()) });
        return;
      }
      if (request.method === "POST" && request.url === "/augmentor/chat") {
        const payload = await readJsonBody(request);
        const result = await executeBridgeChat(payload);
        writeJson(response, 200, { ok: true, ...result });
        return;
      }
      if (request.method === "POST" && request.url === "/augmentor/inline") {
        const payload = await readJsonBody(request);
        const result = await executeInlineAssistant(payload);
        writeJson(response, 200, { ok: true, ...result });
        return;
      }
      if (request.method === "POST" && request.url === "/augmentor/control-plan") {
        const payload = await readJsonBody(request);
        const result = await executeControlPlan(payload);
        writeJson(response, 200, { ok: true, ...result });
        return;
      }
      if (request.method === "POST" && request.url === "/augmentor/next-action") {
        const payload = await readJsonBody(request);
        const result = await executeNextAction(payload);
        writeJson(response, 200, { ok: true, ...result });
        return;
      }
      if (request.method === "GET" && request.url === "/memory/status") {
        writeJson(response, 200, { ok: true, ...(await executeMemoryStatus()) });
        return;
      }
      if (request.method === "POST" && request.url === "/memory/search") {
        writeJson(response, 200, { ok: true, ...(await executeMemorySearch(await readJsonBody(request))) });
        return;
      }
      if (request.method === "POST" && request.url === "/archive/intake") {
        writeJson(response, 200, { ok: true, ...(await executeArchiveIntake(await readJsonBody(request))) });
        return;
      }
      if (request.method === "GET" && request.url === "/addons/status") {
        writeJson(response, 200, { ok: true, ...(await executeAddonsStatus()) });
        return;
      }
      if (request.method === "POST" && request.url === "/web/news") {
        writeJson(response, 200, { ok: true, ...(await executeNewsSearch(await readJsonBody(request))) });
        return;
      }
      if (request.method === "POST" && request.url === "/addons/delegate") {
        writeJson(response, 200, { ok: true, ...(await executeDelegationRecord(await readJsonBody(request))) });
        return;
      }
      if (request.method === "POST" && request.url === "/goals") {
        writeJson(response, 200, { ok: true, ...(await executeGoalRecord(await readJsonBody(request))) });
        return;
      }
      writeJson(response, 404, { ok: false, error: "Unknown browser-first bridge route." });
    } catch (error) {
      writeJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

const args = parseArgs(process.argv.slice(2));
const url = args.get("url") ?? "https://resonantos.com";
const profileDir = path.resolve(args.get("profile") ?? process.env.RESONANTOS_BROWSER_FIRST_PROFILE ?? defaultProfile);
const autoOpenSidePanel = args.get("auto-open-side-panel") !== "false";
const bridgePort = Number(args.get("bridge-port") ?? process.env.RESONANTOS_BROWSER_FIRST_BRIDGE_PORT ?? defaultBridgePort);
const remoteDebuggingPort = args.get("remote-debugging-port") ?? process.env.RESONANTOS_BROWSER_FIRST_REMOTE_DEBUGGING_PORT;

if (!existsSync(hostBinary)) {
  console.error(`Browser-first host binary is missing: ${hostBinary}`);
  console.error("Run: npm run browser-native:build:required");
  process.exit(1);
}

if (!existsSync(path.join(resonantExtension, "manifest.json"))) {
  console.error(`ResonantOS browser layer extension is missing: ${resonantExtension}`);
  process.exit(1);
}

await mkdir(profileDir, { recursive: true });

const extensionDirs = [resonantExtension];
const phantomExtension = findPhantomExtension();
if (phantomExtension) {
  extensionDirs.push(phantomExtension);
}

await seedPinnedExtensions(profileDir, [resonantExtensionId, phantomExtension ? phantomExtensionId : null]);
const bridgeServer = await startBridgeServer(bridgePort);

const hostArgs = [
  "--resonantos-browser-first",
  `--url=${url}`,
  `--resonantos-user-data-dir=${profileDir}`,
  `--resonantos-extension-dirs=${extensionDirs.join(",")}`,
  ...(remoteDebuggingPort ? [`--resonantos-remote-debugging-port=${remoteDebuggingPort}`] : []),
];

console.log("Launching ResonantOS Browser-First host");
console.log(JSON.stringify({ hostBinary, url, profileDir, extensionDirs, phantomLoaded: Boolean(phantomExtension), pinnedExtensions: [resonantExtensionId, phantomExtension ? phantomExtensionId : null].filter(Boolean), bridgeUrl: `http://127.0.0.1:${bridgePort}`, remoteDebuggingPort: remoteDebuggingPort ?? "ephemeral" }, null, 2));

const child = spawn(hostBinary, hostArgs, {
  cwd: repoRoot,
  stdio: "inherit",
});

if (autoOpenSidePanel && process.platform === "darwin") {
  setTimeout(() => {
    spawn("osascript", [
      "-e",
      [
        "tell application \"System Events\"",
        "set frontmost of first process whose name contains \"ResonantBrowserNativeHost\" to true",
        "delay 0.2",
        "keystroke \"a\" using {option down, shift down}",
        "end tell",
      ].join("\n"),
    ], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }, 6500);
}

child.on("exit", (code, signal) => {
  bridgeServer.close();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
