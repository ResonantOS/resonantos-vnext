import { existsSync, readdirSync } from "node:fs";
import { appendFile, chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile, spawn } from "node:child_process";
import {
  createBridgeToken,
  runBridgeAuthSelfTest,
  bridgeServerPort,
  startBridgeServer,
  startBridgeServerWithFallback,
  writeBridgeConfig,
} from "./bridge-server.mjs";
import { mergePromotedMarkdownBody, summarizePromotedPageForIndex, upsertWikiIndexCatalogEntry } from "./archive-merge.mjs";
import {
  appendProviderHandoffAudit,
  buildProviderDraftHandoff,
  parseDraftPacketMarkdown,
} from "./addon-draft-connectors.mjs";
import { computeWikiHealth } from "./memory-wiki-health.mjs";
import { runWikiLint } from "./memory-wiki-lint.mjs";
import { searchMemoryWiki } from "./memory-search.mjs";
import { ensureLivingArchiveSchema } from "./memory-schema.mjs";
import { buildDeterministicWikiDraft } from "./memory-ingest-draft.mjs";
import { runArchiveIngestWriterWithRoute } from "./memory-ingest-writer.mjs";
import {
  lineDiffSummary,
  listSourceFileVersions,
  recordSourceFileIntakeArtifact,
  reserveSourceFileVersion,
  sourceContentHash,
} from "./memory-source-versioning.mjs";
import {
  buildMoveImportPreflight,
  executeMoveImport,
  rollbackMoveImport,
} from "./memory-source-move.mjs";
import { summarizeBrowserLaunchLog } from "./browser-launch-diagnostics.mjs";
import {
  defaultRoutingStrategies,
  inferProviderType,
  modelCatalog,
  modelCatalogEntriesForProvider,
  normalizeFallbackModels,
  normalizeRoutingStrategy,
  providerConnectivityTarget,
  providerProfiles,
  providerRouteForModel as providerFabricRouteForModel,
  providerRouteForWorkload as providerFabricRouteForWorkload,
  resolveRoutingStrategies,
} from "./provider-fabric-core.mjs";

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
const hostAppBundle = path.join(
  repoRoot,
  "addons",
  "resonant-browser-native",
  "build",
  "ResonantBrowserNativeHost.app",
);
const resonantExtension = path.join(repoRoot, "browser-first", "resonantos-side-panel-extension");
const defaultProfile = path.join(os.homedir(), "ResonantOS_User", "BrowserFirst", "Profiles", "main");
const phantomExtensionId = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const resonantExtensionId = "cdpdmmalhmokbfcfgogoepnjplaakgnl";
const defaultBridgePort = 47773;
const resonantExtensionOrigin = `chrome-extension://${resonantExtensionId}`;
const defaultMainWorkspaceUrl = `${resonantExtensionOrigin}/src/main-workspace.html`;

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

async function clearResonantNewTabOverride(profileDir, extensionId) {
  const preferencesPath = path.join(profileDir, "Default", "Preferences");
  if (!existsSync(preferencesPath)) {
    return;
  }
  let preferences = {};
  try {
    preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
  } catch {
    return;
  }
  const overrides = preferences.extensions?.chrome_url_overrides;
  const entries = Array.isArray(overrides?.newtab) ? overrides.newtab : [];
  const filtered = entries.filter((entry) => !String(entry?.entry ?? "").includes(extensionId));
  if (filtered.length === entries.length) {
    return;
  }
  if (filtered.length) {
    overrides.newtab = filtered;
  } else {
    delete overrides.newtab;
  }
  if (overrides && Object.keys(overrides).length === 0) {
    delete preferences.extensions.chrome_url_overrides;
  }
  await writeFile(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`);
}

async function removeCachedUnpackedExtension(profileDir, extensionId) {
  const defaultDir = path.join(profileDir, "Default");
  const cacheRoots = [
    path.join(defaultDir, "Extensions", extensionId),
    path.join(defaultDir, "Extension Scripts", extensionId),
    path.join(defaultDir, "Extension Rules", extensionId),
  ];
  for (const cacheRoot of cacheRoots) {
    await rm(cacheRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

function providerSecretsPath() {
  return path.join(os.homedir(), "ResonantOS_User", "Secrets", "provider-secrets.json");
}

function providerRoutingPath() {
  return path.join(os.homedir(), "ResonantOS_User", "ProviderFabric", "routing-strategies.json");
}

function providerModelPreferencesPath() {
  return path.join(os.homedir(), "ResonantOS_User", "ProviderFabric", "model-preferences.json");
}

function providerAccountsPath() {
  return path.join(os.homedir(), "ResonantOS_User", "ProviderFabric", "provider-accounts.json");
}

function providerDiagnosticsHistoryPath() {
  return path.join(os.homedir(), "ResonantOS_User", "ProviderFabric", "diagnostics-history.json");
}

function userRoot() {
  return path.resolve(process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT || path.join(os.homedir(), "ResonantOS_User"));
}

function memoryRoot() {
  return path.join(userRoot(), "Memory");
}

function memorySettingsPath() {
  return path.join(memoryRoot(), "CONFIG", "memory-settings.json");
}

function memorySourceAuditPath() {
  return path.join(memoryRoot(), "CONFIG", "source-audit.md");
}

function memorySourceFileManifestPath() {
  return path.join(memoryRoot(), "CONFIG", "source-file-versions.json");
}

function isInsidePath(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function browserFirstRoot() {
  return path.join(userRoot(), "BrowserFirst");
}

function diagnosticsRoot() {
  return path.join(browserFirstRoot(), "Diagnostics");
}

function browserLaunchLogPath() {
  return path.join(repoRoot, "logs", "browser-first-installed-app.log");
}

function browserDownloadsRoot() {
  return path.join(os.homedir(), "Downloads");
}

function browserDownloadsStatePath() {
  return path.join(browserFirstRoot(), "downloads-state.json");
}

async function browserDownloadsState() {
  if (!existsSync(browserDownloadsStatePath())) {
    return {};
  }
  try {
    return JSON.parse(await readFile(browserDownloadsStatePath(), "utf8"));
  } catch {
    return {};
  }
}

async function writeBrowserDownloadsState(state) {
  await mkdir(browserFirstRoot(), { recursive: true });
  await writeFile(browserDownloadsStatePath(), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function resolveDownloadFile(nameOrPath) {
  const root = path.resolve(browserDownloadsRoot());
  const raw = String(nameOrPath ?? "").trim();
  if (!raw) {
    throw new Error("Download action requires a file name.");
  }
  const unredacted = raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
  const candidate = path.isAbsolute(unredacted)
    ? path.resolve(unredacted)
    : path.resolve(root, unredacted);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error("Download action is limited to files inside the browser downloads folder.");
  }
  return candidate;
}

function launchDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function openOrRevealDownload(filePath, action) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile?.()) {
    throw new Error("Download file was not found.");
  }
  if (process.platform === "darwin") {
    launchDetached("open", action === "reveal" ? ["-R", filePath] : [filePath]);
    return;
  }
  if (process.platform === "win32") {
    if (action === "reveal") {
      launchDetached("explorer.exe", ["/select,", filePath]);
    } else {
      launchDetached("cmd.exe", ["/c", "start", "", filePath]);
    }
    return;
  }
  launchDetached("xdg-open", [action === "reveal" ? path.dirname(filePath) : filePath]);
}

function redactPathForDiagnostics(filePath) {
  return String(filePath ?? "").replace(os.homedir(), "~");
}

function redactDiagnosticText(value) {
  return String(value ?? "")
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted-key]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted-token]")
    .replace(/api[_-]?key\s*[:=]\s*[^\s]+/gi, "api_key=[redacted]")
    .replace(/token\s*[:=]\s*[^\s]+/gi, "token=[redacted]")
    .replace(/secret\s*[:=]\s*[^\s]+/gi, "secret=[redacted]")
    .replace(os.homedir(), "~");
}

function hermesHome(profileHome) {
  const value = String(profileHome ?? process.env.HERMES_HOME ?? "~/.hermes").trim();
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

function expandUserPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  return path.resolve(raw);
}

function hermesCommand(profileHome) {
  if (process.env.HERMES_COMMAND && existsSync(process.env.HERMES_COMMAND)) {
    return process.env.HERMES_COMMAND;
  }
  const home = hermesHome(profileHome);
  const candidates = [
    path.join(home, "hermes-agent", "venv", "bin", "hermes"),
    path.join(home, "venv", "bin", "hermes"),
    path.join(home, "bin", "hermes"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? firstExistingExecutable("hermes");
}

function executableCandidates(commandName) {
  const names = process.platform === "win32"
    ? [`${commandName}.cmd`, `${commandName}.exe`, commandName]
    : [commandName];
  return String(process.env.PATH ?? "")
    .split(path.delimiter)
    .flatMap((entry) => names.map((name) => path.join(entry, name)));
}

async function execFileStdout(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120_000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message || "Command failed.").trim()));
        return;
      }
      resolve(String(stdout ?? "").trim());
    });
  });
}

function firstExistingExecutable(commandName) {
  return executableCandidates(commandName).find((candidate) => existsSync(candidate)) ?? null;
}

function opencodeCommand() {
  if (process.env.OPENCODE_COMMAND && existsSync(process.env.OPENCODE_COMMAND)) {
    return process.env.OPENCODE_COMMAND;
  }
  const home = os.homedir();
  const candidates = [
    ...executableCandidates("opencode"),
    ...executableCandidates("opencode-ai"),
    path.join(home, ".local", "bin", "opencode"),
    path.join(home, ".npm-global", "bin", "opencode"),
    path.join(home, "node_modules", ".bin", process.platform === "win32" ? "opencode.cmd" : "opencode"),
    ...(process.platform === "darwin"
      ? ["/Applications/OpenCode.app/Contents/MacOS/opencode-cli"]
      : []),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function dashboardTarget(host = "127.0.0.1", port = 9119) {
  const normalizedHost = String(host || "127.0.0.1").trim().toLowerCase();
  if (!["127.0.0.1", "localhost"].includes(normalizedHost)) {
    throw new Error("Hermes dashboard can only bind to localhost or 127.0.0.1 from ResonantOS.");
  }
  const normalizedPort = Number(port || 9119);
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    throw new Error("Hermes dashboard port must be between 1 and 65535.");
  }
  return { host: "127.0.0.1", port: normalizedPort, url: `http://127.0.0.1:${normalizedPort}` };
}

async function socketOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(350);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
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

function slugifyProviderId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

function providerPreset(rawProviderType, rawTemplateId = rawProviderType) {
  const templateId = String(rawTemplateId ?? rawProviderType ?? "").trim().toLowerCase();
  const type = String(rawProviderType ?? "").trim().toLowerCase();
  if (templateId === "openai" || type === "openai") {
    return {
      providerType: "openai",
      authType: "api-key",
      apiBaseUrl: "https://api.openai.com/v1",
      models: [
        { model: "gpt-5.5", label: "GPT 5.5", runtime: "cloud", costTier: "paid-per-call", qualityTier: "highest reasoning" },
        { model: "gpt-5.4-mini", label: "GPT 5.4 Mini", runtime: "cloud", costTier: "paid-per-call", qualityTier: "lightweight high-reasoning fallback" },
      ],
    };
  }
  const openAiCompatiblePresets = {
    xai: { apiBaseUrl: "https://api.x.ai/v1", models: ["grok-4", "grok-3"] },
    deepseek: { apiBaseUrl: "https://api.deepseek.com/v1", models: ["deepseek-chat", "deepseek-reasoner"] },
    mistral: { apiBaseUrl: "https://api.mistral.ai/v1", models: ["mistral-large-latest", "mistral-small-latest", "open-mixtral"] },
    qwen: { apiBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", models: ["qwen-max", "qwen-plus", "qwen-turbo"] },
    "nvidia-nim": { apiBaseUrl: "https://integrate.api.nvidia.com/v1", models: ["nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/nemotron"] },
    "microsoft-azure": { apiBaseUrl: "", models: ["azure-model-deployment"] },
    openrouter: { apiBaseUrl: "https://openrouter.ai/api/v1", models: ["openai/gpt-5.5", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-pro"] },
    together: { apiBaseUrl: "https://api.together.xyz/v1", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-R1"] },
    huggingface: { apiBaseUrl: "", models: ["hf-model-id"] },
    groq: { apiBaseUrl: "https://api.groq.com/openai/v1", models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"] },
    fireworks: { apiBaseUrl: "https://api.fireworks.ai/inference/v1", models: ["accounts/fireworks/models/llama-v3p1-70b-instruct"] },
    hyperbolic: { apiBaseUrl: "https://api.hyperbolic.xyz/v1", models: ["meta-llama/Meta-Llama-3.1-70B-Instruct"] },
    "cloudflare-ai-gateway": { apiBaseUrl: "", models: ["gateway-model-id"] },
    litellm: { apiBaseUrl: "http://127.0.0.1:4000/v1", models: ["configured-model-alias"] },
    bifrost: { apiBaseUrl: "", models: ["bifrost-model-alias"] },
    localai: { apiBaseUrl: "http://127.0.0.1:8080/v1", models: ["local-model"] },
    "llama-cpp": { apiBaseUrl: "http://127.0.0.1:8080/v1", models: ["local-model"] },
    vllm: { apiBaseUrl: "http://127.0.0.1:8000/v1", models: ["local-model"] },
    "text-generation-webui": { apiBaseUrl: "http://127.0.0.1:5000/v1", models: ["local-model"] },
    "asus-gx10": { apiBaseUrl: "http://192.168.1.77:30004/v1", models: ["Qwen3.6-35B-A3B-Q4_K_M.gguf"] },
    "openai-compatible": { apiBaseUrl: "", models: ["model-id"] },
  };
  if (openAiCompatiblePresets[templateId] || type === "openai-compatible") {
    const preset = openAiCompatiblePresets[templateId] ?? openAiCompatiblePresets["openai-compatible"];
    return {
      providerType: "openai-compatible",
      authType: "api-key",
      apiBaseUrl: preset.apiBaseUrl,
      models: preset.models.map((model) => ({ model, label: model, runtime: "cloud", costTier: "custom", qualityTier: "custom" })),
    };
  }
  if (templateId === "anthropic" || type === "anthropic") {
    return {
      providerType: "anthropic",
      authType: "api-key",
      apiBaseUrl: "https://api.anthropic.com/v1",
      models: [
        { model: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", runtime: "cloud", costTier: "paid-per-call", qualityTier: "high reasoning" },
        { model: "claude-haiku-4.5", label: "Claude Haiku 4.5", runtime: "cloud", costTier: "paid-per-call", qualityTier: "fast lightweight" },
      ],
    };
  }
  if (templateId === "gemini" || templateId === "google" || type === "gemini" || type === "google") {
    return {
      providerType: "google",
      authType: "api-key",
      apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
      models: [
        { model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", runtime: "cloud", costTier: "paid-per-call", qualityTier: "high reasoning" },
        { model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", runtime: "cloud", costTier: "paid-per-call", qualityTier: "fast lightweight" },
        { model: "gemma", label: "Gemma", runtime: "cloud", costTier: "custom", qualityTier: "open model family" },
      ],
    };
  }
  const localPresets = {
    ollama: { apiBaseUrl: "http://127.0.0.1:11434", models: ["batiai/gemma4-e2b:q4"] },
    "lm-studio": { apiBaseUrl: "http://127.0.0.1:1234/v1", models: ["local-model"] },
    "dgx-spark": { apiBaseUrl: "http://dgx-spark.local:11434", models: ["local-model"] },
  };
  if (localPresets[templateId] || type === "local") {
    const preset = localPresets[templateId] ?? localPresets.ollama;
    return {
      providerType: "local",
      authType: "local-runtime",
      apiBaseUrl: preset.apiBaseUrl,
      models: preset.models.map((model) => ({ model, label: model, runtime: "local", costTier: "local-free", qualityTier: "local runtime" })),
    };
  }
  const customPresets = {
    cohere: { apiBaseUrl: "https://api.cohere.com", models: ["command-r-plus", "command-r"] },
    ai21: { apiBaseUrl: "https://api.ai21.com/studio/v1", models: ["jamba-large", "jamba-mini"] },
    replicate: { apiBaseUrl: "https://api.replicate.com", models: ["replicate-model-version"] },
  };
  if (customPresets[templateId] || type === "custom") {
    const preset = customPresets[templateId] ?? { apiBaseUrl: "", models: ["model-id"] };
    return {
      providerType: "custom",
      authType: "api-key",
      apiBaseUrl: preset.apiBaseUrl,
      models: preset.models.map((model) => ({ model, label: model, runtime: "cloud", costTier: "custom", qualityTier: "custom" })),
    };
  }
  return {
    providerType: "minimax",
    authType: "api-key",
    apiBaseUrl: "https://api.minimax.io/v1",
    models: [
      { model: "MiniMax-M2.7-highspeed", label: "MiniMax 2.7 High Speed", runtime: "cloud", costTier: "subscription", qualityTier: "daily strategic work", wireModel: "MiniMax-M2.7" },
      { model: "MiniMax-M2.7", label: "MiniMax 2.7", runtime: "cloud", costTier: "subscription", qualityTier: "routine and fallback work" },
    ],
  };
}

function normalizeProviderModelEntry(entry, presetModels = []) {
  const rawModel = typeof entry === "string" ? entry : entry?.model;
  const model = String(rawModel ?? "").trim().slice(0, 120);
  if (!model) return null;
  const preset = presetModels.find((candidate) => candidate.model === model) ?? modelCatalog.find((candidate) => candidate.model === model) ?? {};
  return {
    model,
    label: String((typeof entry === "string" ? preset.label : entry?.label) ?? preset.label ?? model).trim().slice(0, 120) || model,
    runtime: String((typeof entry === "string" ? preset.runtime : entry?.runtime) ?? preset.runtime ?? "cloud").trim().slice(0, 40) || "cloud",
    costTier: String((typeof entry === "string" ? preset.costTier : entry?.costTier) ?? preset.costTier ?? "custom").trim().slice(0, 60) || "custom",
    qualityTier: String((typeof entry === "string" ? preset.qualityTier : entry?.qualityTier) ?? preset.qualityTier ?? "custom").trim().slice(0, 100) || "custom",
    wireModel: String((typeof entry === "string" ? preset.wireModel : entry?.wireModel) ?? preset.wireModel ?? model).trim().slice(0, 120) || model,
  };
}

function normalizeProviderAccount(raw, existingProfiles = []) {
  const preset = providerPreset(raw?.providerType, raw?.templateId);
  const label = String(raw?.label ?? raw?.name ?? "").trim().slice(0, 80);
  if (!label) {
    throw new Error("Provider account name is required.");
  }
  const suppliedId = slugifyProviderId(raw?.id);
  const baseId = suppliedId || slugifyProviderId(`${preset.providerType}-${label}`) || `${preset.providerType}-account`;
  const existingIds = new Set(existingProfiles.map((profile) => profile.id));
  let id = baseId;
  if (!suppliedId) {
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
  }
  const modelSource = Array.isArray(raw?.models) && raw.models.length ? raw.models : preset.models;
  const models = unique(modelSource
    .map((entry) => normalizeProviderModelEntry(entry, preset.models))
    .filter(Boolean)
    .map((entry) => JSON.stringify(entry)))
    .map((entry) => JSON.parse(entry));
  if (!models.length) {
    throw new Error("At least one model must be declared for a provider account.");
  }
  return {
    id,
    label,
    providerType: preset.providerType,
    templateId: String(raw?.templateId ?? preset.providerType).trim().slice(0, 80),
    authType: String(raw?.authType ?? preset.authType).trim().slice(0, 40) || "api-key",
    apiBaseUrl: String(raw?.apiBaseUrl ?? preset.apiBaseUrl).trim().slice(0, 240),
    role: String(raw?.role ?? `${label} model account`).trim().slice(0, 160) || `${label} model account`,
    models,
    source: raw?.source === "built-in" ? "built-in" : "user",
  };
}

async function readProviderAccounts() {
  const filePath = providerAccountsPath();
  if (!existsSync(filePath)) {
    return [];
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
  return accounts.map((account) => normalizeProviderAccount(account, providerProfiles)).filter(Boolean);
}

async function writeProviderAccounts(accounts) {
  const filePath = providerAccountsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ accounts }, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
}

async function allProviderProfiles() {
  const customAccounts = await readProviderAccounts().catch(() => []);
  const builtIns = providerProfiles.map((profile) => ({
    ...profile,
    providerType: profile.providerType ?? inferProviderType(profile.id),
    apiBaseUrl: providerPreset(profile.providerType ?? inferProviderType(profile.id)).apiBaseUrl,
    source: "built-in",
  }));
  const byId = new Map(builtIns.map((profile) => [profile.id, profile]));
  for (const account of customAccounts) {
    byId.set(account.id, { ...byId.get(account.id), ...account, source: account.source === "built-in" ? "built-in-customized" : "user" });
  }
  return [...byId.values()];
}

async function allModelCatalog() {
  const profiles = await allProviderProfiles();
  const dynamicEntries = profiles.flatMap((profile) => modelCatalogEntriesForProvider(profile));
  const byProviderModel = new Map();
  for (const entry of [...modelCatalog, ...dynamicEntries]) {
    byProviderModel.set(`${entry.providerId}:${entry.model}`, entry);
  }
  return [...byProviderModel.values()];
}

async function providerProfileByIdDynamic(providerId) {
  return (await allProviderProfiles()).find((profile) => profile.id === providerId) ?? null;
}

function isModelAllowedForProviderModel(providerId, model, preferences = {}, catalog = modelCatalog) {
  const declaredModels = catalog
    .filter((entry) => entry.providerId === providerId)
    .map((entry) => entry.model);
  if (!declaredModels.includes(model)) {
    return false;
  }
  const configured = Array.isArray(preferences.allowedModels?.[providerId])
    ? preferences.allowedModels[providerId].filter((entry) => declaredModels.includes(entry))
    : declaredModels;
  return new Set(configured.length ? configured : declaredModels).has(model);
}

function providerModelRuntimeState(entry, { secrets = {}, preferences = {}, localRuntimeUrl = "", catalog = modelCatalog } = {}) {
  const allowed = isModelAllowedForProviderModel(entry.providerId, entry.model, preferences, catalog);
  const configured = entry.providerId === "desktop-local"
    ? Boolean(localRuntimeUrl)
    : Boolean(secrets[entry.providerId]);
  return {
    ...entry,
    allowed,
    configured: allowed && configured,
    state: !allowed ? "disabled" : configured ? "available" : "unavailable",
  };
}

async function readRoutingOverrides() {
  const filePath = providerRoutingPath();
  if (!existsSync(filePath)) {
    return {};
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readProviderModelPreferences() {
  const filePath = providerModelPreferencesPath();
  if (!existsSync(filePath)) {
    return {};
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readProviderDiagnosticsHistory() {
  const filePath = providerDiagnosticsHistoryPath();
  if (!existsSync(filePath)) {
    return [];
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

async function appendProviderDiagnosticHistory(entry) {
  const safeEntry = {
    providerId: String(entry.providerId ?? ""),
    label: String(entry.label ?? ""),
    testedAt: String(entry.testedAt ?? new Date().toISOString()),
    state: String(entry.state ?? "unknown"),
    status: typeof entry.status === "number" ? entry.status : null,
    latencyMs: typeof entry.latencyMs === "number" ? entry.latencyMs : null,
    endpoint: String(entry.endpoint ?? "provider endpoint"),
    detail: redactDiagnosticText(entry.detail),
  };
  const current = await readProviderDiagnosticsHistory().catch(() => []);
  const next = [safeEntry, ...current].slice(0, 30);
  const filePath = providerDiagnosticsHistoryPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ entries: next }, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return safeEntry;
}

async function resolvedRoutingStrategies() {
  const [secrets, overrides, preferences] = await Promise.all([
    readProviderSecrets(),
    readRoutingOverrides().catch(() => ({})),
    readProviderModelPreferences().catch(() => ({})),
  ]);
  return resolveRoutingStrategies({
    secrets,
    overrides,
    preferences,
    localRuntimeUrl: process.env.RESONANTOS_LOCAL_RUNTIME_URL,
  });
}

async function executeProviderStatus() {
  const [secrets, preferences, strategies, profiles, catalog] = await Promise.all([
    readProviderSecrets(),
    readProviderModelPreferences().catch(() => ({})),
    resolvedRoutingStrategies(),
    allProviderProfiles(),
    allModelCatalog(),
  ]);
  return {
    vault: {
      configured: existsSync(providerSecretsPath()),
      location: "ResonantOS local provider vault",
    },
    providers: profiles.map((profile) => ({
      ...profile,
      models: catalog
        .filter((entry) => entry.providerId === profile.id)
        .map((entry) => ({
          model: entry.model,
          label: entry.label,
          runtime: entry.runtime,
          costTier: entry.costTier,
          qualityTier: entry.qualityTier,
          allowed: isModelAllowedForProviderModel(profile.id, entry.model, preferences, catalog),
        })),
      routeConsumers: strategies
        .filter((strategy) =>
          [strategy.primary, ...(strategy.fallbackChain ?? [])]
            .some((entry) => entry?.providerId === profile.id)
        )
        .map((strategy) => ({
          id: strategy.id,
          label: strategy.label,
          workload: strategy.workload,
          routeState: strategy.routeState,
          hardStop: strategy.hardStop,
        })),
      configured: Boolean(secrets[profile.id]),
      credentialPreview: secrets[profile.id] ? "stored" : "missing",
    })),
  };
}

async function executeProviderHealthCheck(payload) {
  const providerId = String(payload.providerId ?? "").trim();
  const profile = await providerProfileByIdDynamic(providerId);
  if (!profile) {
    throw new Error("Unknown provider profile.");
  }
  const [secrets, preferences, strategies, catalog] = await Promise.all([
    readProviderSecrets(),
    readProviderModelPreferences().catch(() => ({})),
    resolvedRoutingStrategies(),
    allModelCatalog(),
  ]);
  const models = catalog.filter((entry) => entry.providerId === providerId);
  const configured = Boolean(secrets[providerId]);
  const routeConsumers = strategies.filter((strategy) =>
    [strategy.primary, ...(strategy.fallbackChain ?? [])]
      .some((entry) => entry?.providerId === providerId)
  );
  const blockedConsumers = routeConsumers.filter((strategy) => strategy.routeState !== "routable");
  const availableModels = models.filter((entry) => providerModelRuntimeState(entry, {
    secrets,
    preferences,
    catalog,
    localRuntimeUrl: process.env.RESONANTOS_LOCAL_RUNTIME_URL,
  })?.configured);
  const allowedModels = models.filter((entry) => isModelAllowedForProviderModel(providerId, entry.model, preferences, catalog));
  const state = configured && availableModels.length
    ? (blockedConsumers.length ? "degraded" : "ready")
    : configured && !allowedModels.length
      ? "disabled"
    : "missing-credential";
  return {
    providerId,
    label: profile.label,
    checkedAt: new Date().toISOString(),
    state,
    configured,
    models: models.map((entry) => ({
      model: entry.model,
      label: entry.label,
      runtime: entry.runtime,
      allowed: isModelAllowedForProviderModel(providerId, entry.model, preferences, catalog),
      configured: Boolean(providerModelRuntimeState(entry, {
        secrets,
        preferences,
        catalog,
        localRuntimeUrl: process.env.RESONANTOS_LOCAL_RUNTIME_URL,
      })?.configured),
    })),
    routeConsumers: routeConsumers.map((strategy) => ({
      id: strategy.id,
      label: strategy.label,
      routeState: strategy.routeState,
      hardStop: strategy.hardStop,
    })),
    detail: state === "ready"
      ? `${profile.label} is configured and available to all dependent routing strategies.`
      : state === "degraded"
        ? `${profile.label} is configured, but one or more dependent routing strategies still have no available route.`
        : state === "disabled"
          ? `${profile.label} is configured, but all declared models are disabled by the current allowed-model policy.`
        : `${profile.label} has no stored credential in the local provider vault.`,
  };
}

async function executeProviderConnectivityTest(payload) {
  const providerId = String(payload.providerId ?? "").trim();
  const profile = await providerProfileByIdDynamic(providerId);
  if (!profile) {
    throw new Error("Unknown provider profile.");
  }
  const secrets = await readProviderSecrets();
  const credential = secrets[providerId];
  if (!credential) {
    const result = {
      providerId,
      label: profile.label,
      testedAt: new Date().toISOString(),
      state: "missing-credential",
      endpoint: "provider models endpoint",
      detail: `${profile.label} cannot be tested because no credential is stored in the local provider vault.`,
    };
    await appendProviderDiagnosticHistory(result);
    return result;
  }
  const target = providerConnectivityTarget(providerId, {
    localRuntimeUrl: process.env.RESONANTOS_LOCAL_RUNTIME_URL,
  }) ?? (profile.apiBaseUrl ? {
    providerId,
    url: `${String(profile.apiBaseUrl).replace(/\/$/, "")}/models`,
    label: profile.label,
    sendsCredential: profile.authType !== "none",
  } : null);
  if (!target) {
    throw new Error("No connectivity diagnostic target exists for this provider.");
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(target.url, {
      method: "GET",
      headers: target.sendsCredential ? { Authorization: `Bearer ${credential}` } : {},
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const state = response.ok ? "reachable" : response.status === 401 || response.status === 403 ? "auth-failed" : "unreachable";
    const result = {
      providerId,
      label: profile.label,
      testedAt: new Date().toISOString(),
      state,
      status: response.status,
      latencyMs,
      endpoint: "provider models endpoint",
      detail: state === "reachable"
        ? `${profile.label} endpoint is reachable. No prompt or model generation request was sent.`
        : state === "auth-failed"
          ? `${profile.label} endpoint responded, but authentication failed. Update the stored credential.`
          : `${profile.label} endpoint responded with HTTP ${response.status}.`,
    };
    await appendProviderDiagnosticHistory(result);
    return result;
  } catch (error) {
    const result = {
      providerId,
      label: profile.label,
      testedAt: new Date().toISOString(),
      state: "network-failed",
      latencyMs: Date.now() - startedAt,
      endpoint: "provider models endpoint",
      detail: redactDiagnosticText(error instanceof Error ? error.message : String(error)),
    };
    await appendProviderDiagnosticHistory(result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeProviderDiagnosticsHistory() {
  return {
    entries: await readProviderDiagnosticsHistory(),
  };
}

async function executeProviderModelPreferencesSave(payload) {
  const providerId = String(payload.providerId ?? "").trim();
  const profile = await providerProfileByIdDynamic(providerId);
  if (!profile) {
    throw new Error("Unknown provider profile.");
  }
  const catalog = await allModelCatalog();
  const declaredModels = catalog
    .filter((entry) => entry.providerId === providerId)
    .map((entry) => entry.model);
  const allowedModels = unique((Array.isArray(payload.allowedModels) ? payload.allowedModels : [])
    .map((model) => String(model ?? "").trim())
    .filter((model) => declaredModels.includes(model)));
  if (!allowedModels.length) {
    throw new Error("At least one model must remain allowed for this provider.");
  }
  const current = await readProviderModelPreferences().catch(() => ({}));
  const next = {
    ...current,
    allowedModels: {
      ...(current.allowedModels ?? {}),
      [providerId]: allowedModels,
    },
  };
  const filePath = providerModelPreferencesPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return {
    providerId,
    allowedModels,
    savedAt: new Date().toISOString(),
    strategies: await resolvedRoutingStrategies(),
  };
}

async function executeProviderRoutingStrategies() {
  return {
    updatedAt: new Date().toISOString(),
    models: modelCatalog,
    strategies: await resolvedRoutingStrategies(),
  };
}

async function executeProviderRoutingStrategySave(payload) {
  const strategyId = String(payload.strategyId ?? "").trim();
  const base = defaultRoutingStrategies.find((strategy) => strategy.id === strategyId);
  if (!base) {
    throw new Error("Unknown routing strategy.");
  }
  const next = normalizeRoutingStrategy(base, {
    primaryModel: String(payload.primaryModel ?? "").trim(),
    fallbackModels: payload.fallbackModels,
    costPosture: payload.costPosture,
    hardStop: Boolean(payload.hardStop),
  });
  const current = await readRoutingOverrides().catch(() => ({}));
  const filePath = providerRoutingPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...current, [strategyId]: next }, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return {
    strategyId,
    savedAt: new Date().toISOString(),
    strategies: await resolvedRoutingStrategies(),
  };
}

async function executeProviderCredentialSave(payload) {
  const providerId = String(payload.providerId ?? "").trim();
  const credential = String(payload.credential ?? "").trim();
  const profile = await providerProfileByIdDynamic(providerId);
  if (!profile) {
    throw new Error("Unknown provider profile.");
  }
  if (credential.length < 8) {
    throw new Error("Credential is too short to save.");
  }
  const current = await readProviderSecrets();
  const filePath = providerSecretsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ ...current, [providerId]: credential }, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return {
    providerId,
    configured: true,
    savedAt: new Date().toISOString(),
  };
}

async function executeProviderAccountSave(payload) {
  const mode = String(payload.mode ?? (payload.id ? "update" : "create")).trim().toLowerCase();
  const existingCustom = await readProviderAccounts().catch(() => []);
  const profiles = await allProviderProfiles();
  const existing = payload.id ? profiles.find((profile) => profile.id === String(payload.id).trim()) : null;
  if (mode === "update" && !existing) {
    throw new Error("Unknown provider account.");
  }
  const base = existing ? { ...existing, ...payload } : payload;
  const normalized = normalizeProviderAccount(base, profiles.filter((profile) => profile.id !== String(payload.id ?? "")));
  const nextCustom = [
    ...existingCustom.filter((account) => account.id !== normalized.id),
    normalized,
  ].sort((left, right) => left.label.localeCompare(right.label));
  await writeProviderAccounts(nextCustom);
  const credential = String(payload.credential ?? "").trim();
  if (credential) {
    if (credential.length < 8) {
      throw new Error("Credential is too short to save.");
    }
    const currentSecrets = await readProviderSecrets();
    const filePath = providerSecretsPath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify({ ...currentSecrets, [normalized.id]: credential }, null, 2)}\n`, { mode: 0o600 });
    await chmod(filePath, 0o600).catch(() => undefined);
  }
  return {
    provider: normalized,
    savedAt: new Date().toISOString(),
    configured: Boolean(credential || (await readProviderSecrets())[normalized.id]),
  };
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
  return providerFabricRouteForModel(model, {
    localRuntimeUrl: process.env.RESONANTOS_LOCAL_RUNTIME_URL,
  });
}

async function providerRouteForWorkload(workloadId, requestedModel = "") {
  const [secrets, preferences, strategies] = await Promise.all([
    readProviderSecrets(),
    readProviderModelPreferences().catch(() => ({})),
    resolvedRoutingStrategies(),
  ]);
  return providerFabricRouteForWorkload({
    workloadId,
    requestedModel,
    secrets,
    preferences,
    strategies,
    localRuntimeUrl: process.env.RESONANTOS_LOCAL_RUNTIME_URL,
  });
}

function providerRouteForArchiveVerifier(secrets, requestedModel = "") {
  if (requestedModel) {
    const requestedRoute = providerRouteForModel(requestedModel);
    return secrets[requestedRoute.providerId] ? requestedRoute : null;
  }
  const openAiRoute = providerRouteForModel("gpt-5.5");
  if (secrets[openAiRoute.providerId]) {
    return openAiRoute;
  }
  const miniMaxRoute = providerRouteForModel("MiniMax-M2.7");
  return secrets[miniMaxRoute.providerId] ? miniMaxRoute : null;
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

async function runArchiveSemanticVerifier({ artifactPath, requestPath, sourceContent, proposedPage, proposedContent, requestedModel }) {
  const secrets = await readProviderSecrets();
  const route = providerRouteForArchiveVerifier(secrets, requestedModel);
  if (!route) {
    return {
      semanticStatus: "unavailable",
      semanticSummary: "No configured provider was available for semantic archive verification.",
      semanticFindings: [],
      providerId: "",
      model: "",
      usage: null,
    };
  }
  const systemPrompt = [
    "You are the ResonantOS Living Archive semantic verifier.",
    "Return strict JSON only. Do not include markdown.",
    "Your job is to challenge a draft wiki update before it enters trusted AI Memory.",
    "Check whether the proposed content is grounded in the source, whether it overclaims, loses important caveats, or creates misleading synthesis.",
    "Do not rewrite the page. Only verify it.",
    "Return JSON schema: {\"status\":\"verified|needs-revision\", \"summary\":\"short\", \"findings\":[\"...\"]}",
  ].join("\n");
  const userPrompt = JSON.stringify({
    artifactPath,
    requestPath,
    proposedPage,
    sourceExcerpt: String(sourceContent ?? "").slice(0, 10_000),
    proposedContent: String(proposedContent ?? "").slice(0, 10_000),
  });
  try {
    const response = await fetch(`${route.apiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secrets[route.providerId]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: route.wireModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        ...(route.providerType === "openai" ? { reasoning_effort: "minimal", response_format: { type: "json_object" } } : {}),
      }),
    });
    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        semanticStatus: "unavailable",
        semanticSummary: responsePayload?.error?.message ?? `Semantic verifier failed with HTTP ${response.status}.`,
        semanticFindings: [],
        providerId: route.providerId,
        model: route.wireModel,
        usage: responsePayload?.usage ?? null,
      };
    }
    const content = sanitizeAssistantContent(route.providerType, extractAssistantContent(responsePayload));
    const parsed = extractJsonObject(content);
    const status = String(parsed.status ?? "").toLowerCase() === "needs-revision" ? "needs-revision" : "verified";
    return {
      semanticStatus: status,
      semanticSummary: String(parsed.summary ?? (status === "verified" ? "Semantic verifier found no blocking issue." : "Semantic verifier requested revision.")).slice(0, 800),
      semanticFindings: Array.isArray(parsed.findings)
        ? parsed.findings.map((finding) => String(finding).trim()).filter(Boolean).slice(0, 8)
        : [],
      providerId: route.providerId,
      model: route.wireModel,
      usage: responsePayload?.usage ?? null,
    };
  } catch (error) {
    return {
      semanticStatus: "unavailable",
      semanticSummary: error instanceof Error ? error.message : String(error),
      semanticFindings: [],
      providerId: route.providerId,
      model: route.wireModel,
      usage: null,
    };
  }
}

async function runArchiveIngestWriter({
  sourceContent,
  sourcePath,
  sourceTitle,
  proposedPage,
  requestPath,
  existingIndex,
  requestedModel,
  deterministicContent,
}) {
  const secrets = await readProviderSecrets();
  const route = providerRouteForArchiveVerifier(secrets, requestedModel);
  return runArchiveIngestWriterWithRoute({
    sourceContent,
    sourcePath,
    sourceTitle,
    proposedPage,
    requestPath,
    existingIndex,
    route,
    credential: route ? secrets[route.providerId] : "",
    deterministicContent,
  });
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

async function executeBridgeChat(payload) {
  const routeDecision = await providerRouteForWorkload(payload.workload || "augmentor-chat", payload.model);
  const route = routeDecision.route;
  if (!route) {
    const label = routeDecision.strategy?.label ?? "Augmentor Chat";
    throw new Error(`${label} has no available provider route. Add a provider credential, configure a local runtime, or change the routing strategy in Settings > Routing.`);
  }
  const secrets = await readProviderSecrets();
  const apiKey = route.providerId === "desktop-local" ? "local-runtime" : secrets[route.providerId];
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
    "ResonantOS also provides a host-mediated agent control layer for delegation. Augmentor may delegate to approved add-on agents such as Hermes, OpenCode, and Resonant Engineer through governed task packets; never claim delegation is outside Augmentor's ResonantOS capabilities.",
    "If the user asks for delegation and the request was not executed before this model call, ask for the target agent and mission instead of telling them to use a separate system.",
    "If the user asks you to navigate, search a site, shop, book, click, type, or operate a webpage, do not claim you will do it in plain chat. Those requests must be handled by the host Agent Control Mode before the model call.",
    "If such a browser-action request reaches you anyway, do not mention routers, tools, internals, or implementation details. Say briefly that this needs Agent Control and ask the user to resend it as `/control <task>`.",
    "When the host has already returned a browser-tool result in the conversation, treat that result as authoritative and explain the next useful action.",
    "If the user asks for a browser action that was not executed by the host, ask them to retry with a specific page action instead of claiming you are only a text assistant.",
    "Wallet signing, seed phrases, credential autofill, and public submissions require explicit human approval and must not be automated.",
    "Be direct, pragmatic, and concise. Answer the human outcome first; do not expose file paths, route names, JSON, provider metadata, or system status unless the user asks for diagnostics.",
    "If browser page context is provided, use it as context but do not claim to mutate memory or execute tools unless the host explicitly returned that result.",
    payload.systemPrompt ? `Additional user-configured Augmentor system prompt:\n${String(payload.systemPrompt).slice(0, 8000)}` : "",
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
    model: routeDecision.source === "strategy" ? route.wireModel : (payload.model || route.wireModel),
    routeSource: routeDecision.source,
    routeStrategyId: routeDecision.strategy?.id ?? "",
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
  const schema = await ensureLivingArchiveSchema({ memoryRoot: root });
  const wikiRoot = path.join(root, "AI_MEMORY", "wiki");
  const intakeRoot = path.join(root, "INTAKE");
  const reviewRoot = path.join(root, "REVIEW");
  const indexPath = path.join(root, "AI_MEMORY", "wiki", "index.md");
  const logPath = path.join(root, "AI_MEMORY", "wiki", "log.md");
  const markdownPredicate = (filePath) => /\.(md|markdown)$/i.test(filePath);
  return {
    root,
    exists: existsSync(root),
    schema,
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

const defaultMemorySettings = {
  activeMemoryAddon: "living-archive",
  autoSync: false,
  costPosture: "use-archive-ingest-routing-strategy",
  syncMode: "manual-review",
  sources: [],
};

async function readMemorySettings() {
  const filePath = memorySettingsPath();
  if (!existsSync(filePath)) {
    return defaultMemorySettings;
  }
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  return {
    ...defaultMemorySettings,
    ...parsed,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}

function normalizeMemorySource(source) {
  const expandedPath = expandUserPath(source?.path);
  if (!expandedPath) {
    throw new Error("Memory source path is required.");
  }
  const kind = ["folder", "obsidian-vault"].includes(source?.kind) ? source.kind : "folder";
  const ownership = ["human-knowledge", "external-knowledge", "mixed-library"].includes(source?.ownership)
    ? source.ownership
    : "mixed-library";
  const importMode = ["copy-on-import", "move-on-import", "linked-readonly"].includes(source?.importMode)
    ? source.importMode
    : "copy-on-import";
  return {
    id: `source-${safeFileSlug(`${kind}-${expandedPath}`)}`,
    path: expandedPath,
    kind,
    ownership,
    importMode,
    exists: existsSync(expandedPath),
    lastSeenAt: new Date().toISOString(),
  };
}

function resolveMemorySettings(settings) {
  return {
    ...defaultMemorySettings,
    ...settings,
    root: memoryRoot(),
    sources: (settings.sources ?? []).map((source) => ({
      ...source,
      exists: existsSync(expandUserPath(source.path)),
    })),
  };
}

async function appendMemorySourceAudit(action, source, extra = {}) {
  const now = new Date().toISOString();
  const filePath = memorySourceAuditPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const entry = [
    `## [${now}] source_${action}`,
    `- source: ${redactPathForDiagnostics(source?.path ?? extra.sourceId ?? "unknown")}`,
    `- kind: ${source?.kind ?? "unknown"}`,
    `- ownership: ${source?.ownership ?? "unknown"}`,
    `- importMode: ${source?.importMode ?? "unknown"}`,
    extra.reason ? `- reason: ${redactDiagnosticText(extra.reason)}` : "",
    "",
  ].filter(Boolean).join("\n");
  await appendFile(filePath, entry);
  await chmod(filePath, 0o600).catch(() => undefined);
}

async function executeMemorySettings() {
  const [settings, status, addons] = await Promise.all([
    readMemorySettings(),
    executeMemoryStatus(),
    executeAddonsStatus(),
  ]);
  return {
    settings: resolveMemorySettings(settings),
    status,
    memoryAddons: addons.addons.filter((addon) => addon.mode === "memory-system"),
  };
}

async function executeMemorySettingsSave(payload = {}) {
  const current = await readMemorySettings();
  const next = {
    ...current,
    autoSync: typeof payload.autoSync === "boolean" ? payload.autoSync : current.autoSync,
    costPosture: String(payload.costPosture ?? current.costPosture).trim().slice(0, 100) || current.costPosture,
    syncMode: ["manual-review", "auto-intake-review", "paused"].includes(payload.syncMode) ? payload.syncMode : current.syncMode,
  };
  if (payload.activeMemoryAddon) {
    next.activeMemoryAddon = String(payload.activeMemoryAddon).trim().slice(0, 100) || current.activeMemoryAddon;
  }
  if (payload.source) {
    const normalized = normalizeMemorySource(payload.source);
    const existing = next.sources.filter((source) => source.id !== normalized.id && expandUserPath(source.path) !== normalized.path);
    next.sources = [...existing, normalized];
  }
  const filePath = memorySettingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return {
    savedAt: new Date().toISOString(),
    settings: resolveMemorySettings(next),
  };
}

async function executeMemorySourceAction(payload = {}) {
  const sourceId = String(payload.sourceId ?? "").trim();
  const action = String(payload.action ?? "").trim();
  if (!sourceId) {
    throw new Error("Memory source action requires a source id.");
  }
  if (!["disable", "enable", "remove"].includes(action)) {
    throw new Error("Unsupported memory source action.");
  }
  const current = await readMemorySettings();
  const source = current.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error("Memory source was not found.");
  }
  const now = new Date().toISOString();
  const nextSources = action === "remove"
    ? current.sources.filter((entry) => entry.id !== sourceId)
    : current.sources.map((entry) => entry.id === sourceId
        ? action === "enable"
          ? { ...entry, disabledAt: undefined, enabledAt: now, lastSeenAt: now }
          : { ...entry, disabledAt: now, lastSeenAt: now }
        : entry);
  const next = { ...current, sources: nextSources };
  const filePath = memorySettingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  await appendMemorySourceAudit(action, source, { reason: payload.reason, sourceId });
  return {
    action,
    sourceId,
    savedAt: now,
    settings: resolveMemorySettings(next),
  };
}

async function executeMemorySourceMovePreflight(payload = {}) {
  const sourcePath = expandUserPath(payload.path);
  if (!sourcePath) {
    throw new Error("Move import preflight requires a source folder path.");
  }
  return buildMoveImportPreflight({
    sourcePath,
    memoryRoot: memoryRoot(),
    kind: ["folder", "obsidian-vault"].includes(payload.kind) ? payload.kind : "folder",
    ownership: ["human-knowledge", "external-knowledge", "mixed-library"].includes(payload.ownership)
      ? payload.ownership
      : "mixed-library",
  });
}

async function executeMemorySourceMoveExecute(payload = {}) {
  const sourcePath = expandUserPath(payload.path);
  if (!sourcePath) {
    throw new Error("Move import execution requires a source folder path.");
  }
  const result = await executeMoveImport({
    sourcePath,
    memoryRoot: memoryRoot(),
    kind: ["folder", "obsidian-vault"].includes(payload.kind) ? payload.kind : "folder",
    ownership: ["human-knowledge", "external-knowledge", "mixed-library"].includes(payload.ownership)
      ? payload.ownership
      : "mixed-library",
    confirmation: payload.confirmation,
  });
  if (result.status !== "moved") {
    throw new Error(
      `Move import failed and automatic rollback restored ${result.rollbackRestoredCount ?? 0} file(s); ${result.rollbackSkippedCount ?? 0} skipped.`
    );
  }
  const current = await readMemorySettings();
  const normalized = normalizeMemorySource(result.source);
  const nextSource = {
    ...normalized,
    originalPath: result.source.originalPath,
    moveId: result.source.moveId,
    manifestPath: result.source.manifestPath,
    ledgerPath: result.source.ledgerPath,
  };
  const existing = current.sources.filter((source) =>
    source.id !== nextSource.id &&
    expandUserPath(source.path) !== nextSource.path &&
    expandUserPath(source.originalPath ?? "") !== result.source.originalPath
  );
  const next = { ...current, sources: [...existing, nextSource] };
  const filePath = memorySettingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  await appendMemorySourceAudit("move_execute", nextSource, {
    reason: `Moved source from ${redactPathForDiagnostics(result.source.originalPath)} to managed memory.`,
  });
  return {
    ...result,
    source: nextSource,
    settings: resolveMemorySettings(next),
  };
}

async function executeMemorySourceMoveRollback(payload = {}) {
  const ledgerPath = expandUserPath(payload.ledgerPath);
  if (!ledgerPath) {
    throw new Error("Move import rollback requires a ledger path.");
  }
  const moveLedgerRoot = path.join(memoryRoot(), "CONFIG", "move-imports");
  if (!isInsidePath(ledgerPath, moveLedgerRoot)) {
    throw new Error("Move import rollback ledger must stay inside Memory/CONFIG/move-imports.");
  }
  const report = await rollbackMoveImport({
    ledgerPath,
    confirmation: payload.confirmation,
  });
  const current = await readMemorySettings();
  const nextSources = current.sources.filter((source) => expandUserPath(source.ledgerPath ?? "") !== path.resolve(ledgerPath));
  const next = { ...current, sources: nextSources };
  const filePath = memorySettingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  await appendMemorySourceAudit("move_rollback", { path: ledgerPath, kind: "folder", ownership: "unknown", importMode: "move-on-import" }, {
    reason: `Rollback restored ${report.restoredCount} file(s); ${report.skippedCount} skipped.`,
  });
  return {
    ...report,
    settings: resolveMemorySettings(next),
  };
}

async function executeMemorySourceBrowse(payload = {}) {
  const override = String(process.env.RESONANTOS_BROWSER_FIRST_PICK_FOLDER_RESULT ?? "").trim();
  let selectedPath = override;
  if (!selectedPath) {
    const prompt = String(payload.prompt ?? "Select a folder or Obsidian vault for Living Archive").slice(0, 120);
    if (process.platform === "darwin") {
      selectedPath = await execFileStdout("/usr/bin/osascript", [
        "-e",
        `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`,
      ]).catch((error) => {
        if (/user canceled/i.test(error.message)) return "";
        throw error;
      });
    } else if (process.platform === "win32") {
      selectedPath = await execFileStdout("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-Command",
        [
          "Add-Type -AssemblyName System.Windows.Forms",
          "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
          `$dialog.Description = ${JSON.stringify(prompt)}`,
          "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }",
        ].join("; "),
      ]);
    } else {
      const picker = firstExistingExecutable("zenity") ?? firstExistingExecutable("kdialog");
      if (!picker) {
        throw new Error("No supported native folder picker was found. Install zenity/kdialog or paste the path manually.");
      }
      selectedPath = picker.endsWith("kdialog")
        ? await execFileStdout(picker, ["--getexistingdirectory", os.homedir(), "--title", prompt])
        : await execFileStdout(picker, ["--file-selection", "--directory", "--title", prompt]);
    }
  }
  selectedPath = expandUserPath(selectedPath);
  if (!selectedPath) {
    return { cancelled: true, path: "" };
  }
  if (!existsSync(selectedPath)) {
    throw new Error("Selected folder does not exist.");
  }
  const details = await stat(selectedPath);
  if (!details.isDirectory()) {
    throw new Error("Selected path is not a folder.");
  }
  return {
    cancelled: false,
    path: selectedPath,
    kind: existsSync(path.join(selectedPath, ".obsidian")) ? "obsidian-vault" : (payload.kind || "folder"),
  };
}

function classifyMemorySourceFile(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath).replace(/\\/g, "/");
  const extension = path.extname(filePath).toLowerCase();
  if (relative.split("/").some((part) => part.startsWith("."))) {
    return "hidden";
  }
  if ([".md", ".markdown", ".txt", ".csv", ".json", ".pdf", ".docx"].includes(extension)) {
    return "compatible";
  }
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(extension)) {
    return "raw-audio";
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(extension)) {
    return "media";
  }
  if ([".html", ".htm", ".xml", ".yaml", ".yml"].includes(extension)) {
    return "processed";
  }
  return "unsupported";
}

async function executeMemorySourceScan(payload = {}) {
  const sourcePath = expandUserPath(payload.path);
  if (!sourcePath) {
    throw new Error("Memory source scan requires a folder path.");
  }
  if (!existsSync(sourcePath)) {
    throw new Error("Memory source path does not exist.");
  }
  const details = await stat(sourcePath);
  if (!details.isDirectory()) {
    throw new Error("Memory source path must be a folder.");
  }
  const limit = Math.max(10, Math.min(5_000, Number(payload.limit ?? 2_000)));
  const files = await listFilesRecursive(sourcePath, () => true, limit + 1);
  const visibleFiles = files.slice(0, limit);
  const categories = {
    compatible: 0,
    "raw-audio": 0,
    processed: 0,
    media: 0,
    hidden: 0,
    unsupported: 0,
  };
  const samples = {};
  for (const filePath of visibleFiles) {
    const kind = classifyMemorySourceFile(filePath, sourcePath);
    categories[kind] += 1;
    samples[kind] = samples[kind] ?? [];
    if (samples[kind].length < 5) {
      samples[kind].push(path.relative(sourcePath, filePath).replace(/\\/g, "/"));
    }
  }
  return {
    path: sourcePath,
    kind: existsSync(path.join(sourcePath, ".obsidian")) ? "obsidian-vault" : "folder",
    totalScanned: visibleFiles.length,
    limitReached: files.length > limit,
    categories,
    samples,
    recommendation: categories.compatible || categories.processed
      ? "This source has compatible knowledge files and can be registered for governed intake."
      : categories["raw-audio"]
        ? "This source appears to contain raw audio. Register it only if an audio/TOL add-on will process it into intake bundles."
        : "This source has little directly compatible knowledge content. Review before registering.",
  };
}

async function sourceReviewSnapshot(source, limit = 2_000) {
  const sourcePath = expandUserPath(source.path);
  if (source.disabledAt) {
    throw new Error("Memory source is disabled. Re-enable it before review.");
  }
  if (!existsSync(sourcePath)) {
    throw new Error("Memory source path does not exist.");
  }
  const details = await stat(sourcePath);
  if (!details.isDirectory()) {
    throw new Error("Memory source path must be a folder.");
  }
  const scan = await executeMemorySourceScan({ path: sourcePath, limit });
  const files = await listFilesRecursive(sourcePath, () => true, Math.min(200, limit));
  const versionEntries = await listSourceFileVersions({
    manifestPath: memorySourceFileManifestPath(),
    sourceId: source.id,
    limit: 500,
  }).catch(() => ({ entries: [] }));
  const versionByFile = new Map((versionEntries.entries ?? []).map((entry) => [entry.sourceFile, entry]));
  const candidates = [];
  for (const filePath of files) {
    const category = classifyMemorySourceFile(filePath, sourcePath);
    if (!["compatible", "processed", "raw-audio"].includes(category)) {
      continue;
    }
    const fileDetails = await stat(filePath).catch(() => null);
    const relativePath = path.relative(sourcePath, filePath).replace(/\\/g, "/");
    const existingVersion = versionByFile.get(relativePath);
    let versionStatus = existingVersion ? "tracked" : "new";
    let currentHash = "";
    const extension = path.extname(filePath).toLowerCase();
    if (category === "compatible" && [".md", ".markdown", ".txt", ".csv", ".json"].includes(extension)) {
      const content = await readFile(filePath, "utf8").catch(() => "");
      currentHash = sourceContentHash(content);
      versionStatus = !existingVersion
        ? "new"
        : existingVersion.latestHash === currentHash
          ? "unchanged"
          : "changed";
    } else if (existingVersion) {
      versionStatus = "tracked";
    }
    candidates.push({
      path: path.relative(sourcePath, filePath).replace(/\\/g, "/"),
      category,
      bytes: fileDetails?.size ?? 0,
      modifiedAt: fileDetails?.mtime?.toISOString?.() ?? "",
      versionStatus,
      sourceVersion: existingVersion?.latestVersion ?? 0,
      currentHash,
      previousSourceContentHash: existingVersion?.latestHash ?? "",
    });
    if (candidates.length >= 25) {
      break;
    }
  }
  return {
    source: {
      id: source.id,
      path: source.path,
      kind: source.kind,
      ownership: source.ownership,
      importMode: source.importMode,
      exists: true,
    },
    scan,
    candidates,
    boundary: "Source review is read-only. Creating intake writes only to ResonantOS Memory/INTAKE and never mutates the source folder.",
  };
}

async function executeMemorySourceReview(payload = {}) {
  const sourceId = String(payload.sourceId ?? "").trim();
  if (!sourceId) {
    throw new Error("Memory source review requires a source id.");
  }
  const settings = await readMemorySettings();
  const source = settings.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error("Memory source was not found.");
  }
  return sourceReviewSnapshot(source, Math.max(10, Math.min(5_000, Number(payload.limit ?? 2_000))));
}

async function executeMemorySourceIntake(payload = {}) {
  const sourceId = String(payload.sourceId ?? "").trim();
  if (!sourceId) {
    throw new Error("Memory source intake requires a source id.");
  }
  const settings = await readMemorySettings();
  const source = settings.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error("Memory source was not found.");
  }
  const review = await sourceReviewSnapshot(source, 2_000);
  const now = new Date();
  const sourceName = path.basename(expandUserPath(source.path)) || "source";
  const intakeDir = path.join(memoryRoot(), "INTAKE", "sources");
  await mkdir(intakeDir, { recursive: true });
  const fileName = `${now.toISOString().replace(/[:.]/g, "-")}-${safeFileSlug(sourceName)}-source-review.md`;
  const filePath = path.join(intakeDir, fileName);
  const categoryLines = Object.entries(review.scan.categories ?? {})
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n");
  const candidateLines = review.candidates.length
    ? review.candidates.map((candidate) =>
        `- ${candidate.category} | ${candidate.path} | ${candidate.bytes} bytes | ${candidate.modifiedAt || "unknown modified time"}`
      ).join("\n")
    : "- No directly compatible candidates found.";
  const body = [
    "---",
    `source: ${JSON.stringify("resonantos-browser-first")}`,
    `actor: ${JSON.stringify("living-archive.source-review")}`,
    `type: ${JSON.stringify("source-review-intake")}`,
    `title: ${JSON.stringify(`Source Review: ${sourceName}`)}`,
    `createdAt: ${JSON.stringify(now.toISOString())}`,
    `sourceId: ${JSON.stringify(source.id)}`,
    `sourceKind: ${JSON.stringify(source.kind)}`,
    `ownership: ${JSON.stringify(source.ownership)}`,
    `importMode: ${JSON.stringify(source.importMode)}`,
    "---",
    "",
    `# Source Review: ${sourceName}`,
    "",
    "## Boundary",
    review.boundary,
    "",
    "## Source",
    `- path: ${source.path}`,
    `- kind: ${source.kind}`,
    `- ownership: ${source.ownership}`,
    `- import mode: ${source.importMode}`,
    "",
    "## Scan Summary",
    `- total scanned: ${review.scan.totalScanned}`,
    `- limit reached: ${review.scan.limitReached ? "yes" : "no"}`,
    categoryLines,
    "",
    "## Recommendation",
    review.scan.recommendation,
    "",
    "## Intake Candidates",
    candidateLines,
    "",
    "## Next Step",
    "Create a review request from this intake artifact before any AI Memory wiki promotion.",
    "",
  ].join("\n");
  await writeFile(filePath, body, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  await appendMemorySourceAudit("intake", source, { reason: `Created governed source review intake ${path.relative(memoryRoot(), filePath)}` });
  return {
    path: path.relative(memoryRoot(), filePath),
    bytes: Buffer.byteLength(body, "utf8"),
    sourceId,
    candidates: review.candidates.length,
    recommendation: review.scan.recommendation,
  };
}

function resolveSourceRelativeFile(sourcePath, relativePath) {
  const normalized = String(relativePath ?? "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("Selected source file path must stay inside the connected source.");
  }
  const resolved = path.resolve(sourcePath, normalized);
  const root = path.resolve(sourcePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Selected source file path escapes the connected source.");
  }
  return resolved;
}

async function executeMemorySourceFileIntake(payload = {}) {
  const sourceId = String(payload.sourceId ?? "").trim();
  const selectedFiles = Array.isArray(payload.files) ? payload.files.slice(0, 20) : [];
  if (!sourceId) {
    throw new Error("Selected file intake requires a source id.");
  }
  if (!selectedFiles.length) {
    throw new Error("Select at least one source file for intake.");
  }
  const settings = await readMemorySettings();
  const source = settings.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error("Memory source was not found.");
  }
  if (source.disabledAt) {
    throw new Error("Memory source is disabled. Re-enable it before intake.");
  }
  const sourcePath = expandUserPath(source.path);
  if (!existsSync(sourcePath)) {
    throw new Error("Memory source path does not exist.");
  }
  const intakeDir = path.join(memoryRoot(), "INTAKE", "sources", safeFileSlug(path.basename(sourcePath) || sourceId));
  await mkdir(intakeDir, { recursive: true });
  const now = new Date();
  const created = [];
  const rejected = [];
  for (const relativeFile of selectedFiles) {
    try {
      const sourceFile = resolveSourceRelativeFile(sourcePath, relativeFile);
      if (!existsSync(sourceFile)) {
        throw new Error("file missing");
      }
      const category = classifyMemorySourceFile(sourceFile, sourcePath);
      if (category !== "compatible") {
        throw new Error(`unsupported category ${category}`);
      }
      const extension = path.extname(sourceFile).toLowerCase();
      if (![".md", ".markdown", ".txt", ".csv", ".json"].includes(extension)) {
        throw new Error(`file type ${extension || "unknown"} requires a specialized add-on`);
      }
      const [details, sourceContent] = await Promise.all([
        stat(sourceFile),
        readFile(sourceFile, "utf8"),
      ]);
      const contentHash = sourceContentHash(sourceContent);
      const version = await reserveSourceFileVersion({
        manifestPath: memorySourceFileManifestPath(),
        sourceId: source.id,
        relativeFile,
        contentHash,
        sourceModifiedAt: details.mtime.toISOString(),
      });
      if (!version.changed) {
        throw new Error(`unchanged since imported version ${version.version}`);
      }
      const title = markdownTitle(sourceContent, path.basename(sourceFile, path.extname(sourceFile)));
      const intakeFile = `${now.toISOString().replace(/[:.]/g, "-")}-${safeFileSlug(relativeFile)}.md`;
      const intakePath = path.join(intakeDir, intakeFile);
      const body = [
        "---",
        `source: ${JSON.stringify("resonantos-browser-first")}`,
        `actor: ${JSON.stringify("living-archive.source-file-intake")}`,
        `type: ${JSON.stringify("source-file-intake")}`,
        `title: ${JSON.stringify(title)}`,
        `createdAt: ${JSON.stringify(now.toISOString())}`,
        `sourceId: ${JSON.stringify(source.id)}`,
        `sourcePath: ${JSON.stringify(source.path)}`,
        `sourceFile: ${JSON.stringify(String(relativeFile).replace(/\\/g, "/"))}`,
        `ownership: ${JSON.stringify(source.ownership)}`,
        `importMode: ${JSON.stringify(source.importMode)}`,
        `sourceModifiedAt: ${JSON.stringify(details.mtime.toISOString())}`,
        `sourceContentHash: ${JSON.stringify(version.contentHash)}`,
        `sourceVersion: ${JSON.stringify(version.version)}`,
        `previousSourceContentHash: ${JSON.stringify(version.previousHash)}`,
        "---",
        "",
        `# ${title}`,
        "",
        "## Boundary",
        "This intake artifact is a governed copy of a selected source file. The original source file was not modified.",
        "",
        "## Source File",
        `- source: ${source.path}`,
        `- file: ${String(relativeFile).replace(/\\/g, "/")}`,
        `- bytes: ${details.size}`,
        "",
        "## Content",
        sourceContent.trim() || "_Source file was empty._",
        "",
      ].join("\n");
      await writeFile(intakePath, body, { mode: 0o600 });
      await chmod(intakePath, 0o600).catch(() => undefined);
      const relativeIntakePath = path.relative(memoryRoot(), intakePath);
      await recordSourceFileIntakeArtifact({
        manifestPath: memorySourceFileManifestPath(),
        sourceId: source.id,
        relativeFile,
        version: version.version,
        intakePath: relativeIntakePath,
      });
      created.push({
        path: relativeIntakePath,
        sourceFile: String(relativeFile).replace(/\\/g, "/"),
        bytes: Buffer.byteLength(body, "utf8"),
        title,
        sourceContentHash: version.contentHash,
        sourceVersion: version.version,
        previousSourceContentHash: version.previousHash,
      });
    } catch (error) {
      rejected.push({
        sourceFile: String(relativeFile ?? ""),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!created.length) {
    throw new Error(`No selected source files could be imported. ${rejected.map((entry) => `${entry.sourceFile}: ${entry.reason}`).join("; ")}`);
  }
  await appendMemorySourceAudit("file_intake", source, {
    reason: `Created ${created.length} selected source file intake artifact(s). ${rejected.length} rejected.`,
  });
  return {
    sourceId,
    created,
    rejected,
  };
}

async function executeMemorySearch(payload) {
  return searchMemoryWiki({
    memoryRoot: memoryRoot(),
    query: payload.query,
    limit: payload.limit,
  });
}

async function executeMemoryWikiHealth() {
  return computeWikiHealth({
    wikiRoot: path.join(memoryRoot(), "AI_MEMORY", "wiki"),
  });
}

async function executeMemoryWikiLint(payload = {}) {
  return runWikiLint({
    memoryRoot: memoryRoot(),
    actor: "resonantos-browser-first",
    reason: String(payload.reason ?? "manual wiki lint").trim() || "manual wiki lint",
  });
}

async function executeMemorySourceVersions(payload = {}) {
  return listSourceFileVersions({
    manifestPath: memorySourceFileManifestPath(),
    sourceId: String(payload.sourceId ?? "").trim(),
    limit: Number(payload.limit ?? 100),
  });
}

async function executeMemorySourceDiff(payload = {}) {
  const sourceId = String(payload.sourceId ?? "").trim();
  const relativeFile = String(payload.file ?? "").replace(/\\/g, "/").trim();
  if (!sourceId) {
    throw new Error("Source diff requires a source id.");
  }
  if (!relativeFile) {
    throw new Error("Source diff requires a source file.");
  }
  const settings = await readMemorySettings();
  const source = settings.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error("Memory source was not found.");
  }
  if (source.disabledAt) {
    throw new Error("Memory source is disabled. Re-enable it before diff preview.");
  }
  const sourcePath = expandUserPath(source.path);
  const sourceFile = resolveSourceRelativeFile(sourcePath, relativeFile);
  if (!existsSync(sourceFile)) {
    throw new Error("Source file does not exist.");
  }
  const category = classifyMemorySourceFile(sourceFile, sourcePath);
  const extension = path.extname(sourceFile).toLowerCase();
  if (category !== "compatible" || ![".md", ".markdown", ".txt", ".csv", ".json"].includes(extension)) {
    throw new Error("Source diff only supports compatible text source files.");
  }
  const versions = await listSourceFileVersions({
    manifestPath: memorySourceFileManifestPath(),
    sourceId,
    limit: 500,
  });
  const versionEntry = versions.entries.find((entry) => entry.sourceFile === relativeFile);
  if (!versionEntry?.latestIntakePath) {
    return {
      sourceId,
      sourceFile: relativeFile,
      status: "unavailable",
      reason: "No previous governed intake artifact is recorded for this source file.",
      changes: [],
    };
  }
  const intakeFile = safeMemoryRelativePath(versionEntry.latestIntakePath, "INTAKE");
  const [currentContent, intakeContent] = await Promise.all([
    readFile(sourceFile, "utf8"),
    readFile(intakeFile, "utf8"),
  ]);
  const previousContent = markdownSection(intakeContent, "Content") || markdownBody(intakeContent);
  const diff = lineDiffSummary(previousContent.trimEnd(), currentContent.trimEnd(), {
    limit: Math.max(10, Math.min(200, Number(payload.limit ?? 80))),
  });
  const currentHash = sourceContentHash(currentContent);
  return {
    sourceId,
    sourceFile: relativeFile,
    status: currentHash === versionEntry.latestHash ? "unchanged" : "changed",
    latestVersion: versionEntry.latestVersion,
    latestIntakePath: versionEntry.latestIntakePath,
    previousHash: versionEntry.latestHash,
    currentHash,
    ...diff,
  };
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

function safeMemoryRelativePath(relativePath, requiredPrefix = "INTAKE") {
  const normalized = String(relativePath ?? "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || path.isAbsolute(normalized)) {
    throw new Error("Archive path must be a relative memory path.");
  }
  const prefix = `${requiredPrefix}/`;
  if (normalized !== requiredPrefix && !normalized.startsWith(prefix)) {
    throw new Error(`Archive path must stay inside ${requiredPrefix}.`);
  }
  const root = path.resolve(memoryRoot());
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Archive path escapes the memory root.");
  }
  return resolved;
}

function frontmatterValue(content, key) {
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(content);
  if (!match) return "";
  try {
    return JSON.parse(match[1]);
  } catch {
    return match[1].replace(/^["']|["']$/g, "");
  }
}

function writeFrontmatterValue(content, key, value) {
  const serialized = `${key}: ${JSON.stringify(value)}`;
  const linePattern = new RegExp(`^${key}:\\s*.+$`, "m");
  if (linePattern.test(content)) {
    return content.replace(linePattern, serialized);
  }
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end !== -1) {
      return `${content.slice(0, end)}\n${serialized}${content.slice(end)}`;
    }
  }
  return ["---", serialized, "---", "", content].join("\n");
}

function markdownTitle(content, fallback) {
  return frontmatterValue(content, "title") ||
    /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ||
    fallback;
}

function artifactKind(content, filePath) {
  if (content.includes("# Browser Job Report")) return "browser-job-report";
  if (content.includes("# Browser Agent Control Report")) return "browser-control-report";
  if (filePath.includes(`${path.sep}browser${path.sep}`)) return "browser-intake";
  return "intake";
}

function markdownBody(content) {
  return content.replace(/^---[\s\S]*?---\s*/m, "").trim();
}

function compactExcerpt(content, limit = 1_800) {
  return markdownBody(content)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function artifactInsights(content) {
  const value = String(content ?? "");
  const lineValue = (label) => {
    const match = new RegExp(`^-\\s*${label}:\\s*(.+)$`, "mi").exec(value);
    return match?.[1]?.trim() ?? "";
  };
  return {
    nextHumanAction: /^ {0,5}-\s*next human action:\s*(.+)$/gmi.exec(value)?.[1]?.trim() ?? "",
    percentComplete: lineValue("percentComplete"),
    phase: lineValue("phase"),
    status: lineValue("status"),
    summary: lineValue("summary"),
    targetReason: lineValue("targetReason"),
    targetSite: lineValue("targetSite")
  };
}

function markdownSection(content, heading) {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`, "m");
  return pattern.exec(content)?.[1]?.trim() ?? "";
}


async function executeArchiveIntakeList(payload = {}) {
  const limit = Math.max(1, Math.min(100, Number(payload.limit ?? 40)));
  const intakeRoot = path.join(memoryRoot(), "INTAKE");
  const files = await listFilesRecursive(intakeRoot, (filePath) => /\.(md|markdown)$/i.test(filePath), 2_000);
  const entries = await Promise.all(files
    .filter((filePath) => path.basename(filePath).toLowerCase() !== "log.md")
    .map(async (filePath) => {
      const [details, content] = await Promise.all([
        stat(filePath),
        readFile(filePath, "utf8").catch(() => ""),
      ]);
      const relativePath = path.relative(memoryRoot(), filePath);
      return {
        path: relativePath,
        title: markdownTitle(content, path.basename(filePath, path.extname(filePath))),
        kind: artifactKind(content, filePath),
        bytes: details.size,
        createdAt: frontmatterValue(content, "createdAt") || details.birthtime.toISOString(),
        insights: artifactInsights(content),
        modifiedAt: details.mtime.toISOString(),
        excerpt: content
          .replace(/^---[\s\S]*?---\s*/m, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 260),
      };
    }));
  entries.sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)));
  return { root: path.relative(userRoot(), intakeRoot), entries: entries.slice(0, limit) };
}

async function executeArchiveIntakeRead(payload) {
  const filePath = safeMemoryRelativePath(payload.path, "INTAKE");
  if (!/\.(md|markdown)$/i.test(filePath)) {
    throw new Error("Archive artifact preview only supports markdown intake files.");
  }
  const [details, content] = await Promise.all([stat(filePath), readFile(filePath, "utf8")]);
  return {
    path: path.relative(memoryRoot(), filePath),
    title: markdownTitle(content, path.basename(filePath, path.extname(filePath))),
    kind: artifactKind(content, filePath),
    bytes: details.size,
    insights: artifactInsights(content),
    modifiedAt: details.mtime.toISOString(),
    content: content.slice(0, 24_000),
    truncated: content.length > 24_000,
  };
}

async function executeArchiveReviewRequest(payload) {
  const artifactPath = String(payload.path ?? "").trim();
  const filePath = safeMemoryRelativePath(artifactPath, "INTAKE");
  if (!/\.(md|markdown)$/i.test(filePath)) {
    throw new Error("Archive review requests only support markdown intake artifacts.");
  }
  const content = await readFile(filePath, "utf8");
  const now = new Date();
  const title = markdownTitle(content, path.basename(filePath, path.extname(filePath)));
  const reason = String(payload.reason ?? "Review this intake artifact for possible Living Archive promotion.").trim().slice(0, 800);
  const requestDir = path.join(memoryRoot(), "REVIEW", "requests");
  await mkdir(requestDir, { recursive: true });
  const requestFile = `${now.toISOString().replace(/[:.]/g, "-")}-${safeFileSlug(title)}.md`;
  const requestPath = path.join(requestDir, requestFile);
  const requestBody = [
    "---",
    `source: ${JSON.stringify("resonantos-browser-first")}`,
    `type: ${JSON.stringify("archive-review-request")}`,
    `status: ${JSON.stringify("pending")}`,
    `createdAt: ${JSON.stringify(now.toISOString())}`,
    `artifactPath: ${JSON.stringify(artifactPath)}`,
    "---",
    "",
    `# Review Request: ${title}`,
    "",
    "## Reason",
    reason,
    "",
    "## Source Artifact",
    artifactPath,
    "",
    "## Boundary",
    "This request asks the Strategist-owned ingest path to evaluate the artifact. It does not promote or mutate trusted AI Memory by itself.",
    "",
  ].join("\n");
  await writeFile(requestPath, requestBody);
  return {
    path: path.relative(memoryRoot(), requestPath),
    sourceArtifactPath: artifactPath,
    status: "pending",
  };
}

async function executeArchiveReviewList(payload = {}) {
  const limit = Math.max(1, Math.min(100, Number(payload.limit ?? 30)));
  const requestsRoot = path.join(memoryRoot(), "REVIEW", "requests");
  const files = await listFilesRecursive(requestsRoot, (filePath) => /\.(md|markdown)$/i.test(filePath), 1_000);
  const requests = await Promise.all(files.map(async (filePath) => {
    const [details, content] = await Promise.all([
      stat(filePath),
      readFile(filePath, "utf8").catch(() => ""),
    ]);
    const reasonMatch = /## Reason\s+([\s\S]*?)(?:\n## |\s*$)/m.exec(content);
    const draftArtifactPath = frontmatterValue(content, "draftArtifactPath") || "";
    let draftState = {};
    if (draftArtifactPath) {
      try {
        const draftFile = safeMemoryRelativePath(draftArtifactPath, "REVIEW/artifacts");
        if (existsSync(draftFile)) {
          const draftContent = await readFile(draftFile, "utf8");
          draftState = {
            draftStatus: frontmatterValue(draftContent, "status") || "",
            draftVerificationStatus: frontmatterValue(draftContent, "verificationStatus") || "",
            draftVerifierArtifactPath: frontmatterValue(draftContent, "verifierArtifactPath") || "",
            draftRevisionStatus: frontmatterValue(draftContent, "revisionStatus") || "",
            revisedDraftPath: frontmatterValue(draftContent, "revisedDraftPath") || "",
            supersedesDraftPath: frontmatterValue(draftContent, "supersedesDraftPath") || "",
            promotionStatus: frontmatterValue(draftContent, "promotionStatus") || "",
            promotedPage: frontmatterValue(draftContent, "promotedPage") || "",
            promotedAt: frontmatterValue(draftContent, "promotedAt") || "",
            backupPath: frontmatterValue(draftContent, "backupPath") || "",
            rollbackStatus: frontmatterValue(draftContent, "rollbackStatus") || "",
            restoredAt: frontmatterValue(draftContent, "restoredAt") || "",
          };
        }
      } catch {
        draftState = { draftStatus: "unreadable" };
      }
    }
    return {
      path: path.relative(memoryRoot(), filePath),
      title: markdownTitle(content, path.basename(filePath, path.extname(filePath))).replace(/^Review Request:\s*/i, ""),
      status: frontmatterValue(content, "status") || "pending",
      artifactPath: frontmatterValue(content, "artifactPath") || "",
      draftArtifactPath,
      createdAt: frontmatterValue(content, "createdAt") || details.birthtime.toISOString(),
      modifiedAt: details.mtime.toISOString(),
      reason: String(reasonMatch?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      ...draftState,
    };
  }));
  requests.sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)));
  return { root: path.relative(userRoot(), requestsRoot), requests: requests.slice(0, limit) };
}

async function executeArchiveReviewTransition(payload = {}) {
  const requestPath = String(payload.path ?? "").trim();
  const nextStatus = String(payload.status ?? "").trim();
  const allowedStatuses = new Set(["pending", "in-progress", "approved", "rejected"]);
  if (!allowedStatuses.has(nextStatus)) {
    throw new Error("Review request status must be pending, in-progress, approved, or rejected.");
  }
  const filePath = safeMemoryRelativePath(requestPath, "REVIEW/requests");
  if (!/\.(md|markdown)$/i.test(filePath)) {
    throw new Error("Archive review status changes only support markdown review requests.");
  }
  const previous = await readFile(filePath, "utf8");
  if (frontmatterValue(previous, "type") !== "archive-review-request") {
    throw new Error("Archive review status changes require a review request file.");
  }
  const now = new Date().toISOString();
  const actor = String(payload.actor ?? "resonantos-browser-first").trim().slice(0, 120) || "resonantos-browser-first";
  const note = String(payload.note ?? "").trim().replace(/\s+/g, " ").slice(0, 800);
  const previousStatus = frontmatterValue(previous, "status") || "pending";
  let updated = previous;
  updated = writeFrontmatterValue(updated, "status", nextStatus);
  updated = writeFrontmatterValue(updated, "updatedAt", now);
  updated = writeFrontmatterValue(updated, "updatedBy", actor);
  if (note) {
    updated = writeFrontmatterValue(updated, "decisionNote", note);
  }
  const eventLines = [
    "",
    "## Review Event",
    `- at: ${now}`,
    `- actor: ${actor}`,
    `- from: ${previousStatus}`,
    `- to: ${nextStatus}`,
  ];
  if (note) {
    eventLines.push(`- note: ${note}`);
  }
  updated = `${updated.trimEnd()}\n${eventLines.join("\n")}\n`;
  await writeFile(filePath, updated);
  return {
    path: path.relative(memoryRoot(), filePath),
    previousStatus,
    status: nextStatus,
    updatedAt: now,
  };
}

async function executeArchiveReviewDraft(payload = {}) {
  const requestPath = String(payload.path ?? "").trim();
  const requestFile = safeMemoryRelativePath(requestPath, "REVIEW/requests");
  if (!/\.(md|markdown)$/i.test(requestFile)) {
    throw new Error("Archive review drafting only supports markdown review requests.");
  }
  const requestContent = await readFile(requestFile, "utf8");
  if (frontmatterValue(requestContent, "type") !== "archive-review-request") {
    throw new Error("Archive review drafting requires a review request file.");
  }
  const requestStatus = frontmatterValue(requestContent, "status") || "pending";
  if (requestStatus !== "approved") {
    throw new Error("Only approved review requests can generate draft wiki update artifacts.");
  }
  const existingDraft = frontmatterValue(requestContent, "draftArtifactPath");
  if (existingDraft) {
    const existingDraftPath = safeMemoryRelativePath(existingDraft, "REVIEW/artifacts");
    if (existsSync(existingDraftPath)) {
      return {
        path: existingDraft,
        requestPath,
        status: "draft-existing",
      };
    }
  }
  const artifactPath = frontmatterValue(requestContent, "artifactPath");
  const sourceFile = safeMemoryRelativePath(artifactPath, "INTAKE");
  if (!/\.(md|markdown)$/i.test(sourceFile)) {
    throw new Error("Draft wiki updates currently require a markdown intake source.");
  }
  const sourceContent = await readFile(sourceFile, "utf8");
  const now = new Date().toISOString();
  const sourceTitle = markdownTitle(sourceContent, path.basename(sourceFile, path.extname(sourceFile)));
  const draftDir = path.join(memoryRoot(), "REVIEW", "artifacts", "browser");
  await mkdir(draftDir, { recursive: true });
  const draftFile = `${now.replace(/[:.]/g, "-")}-${safeFileSlug(sourceTitle)}-draft.md`;
  const draftPath = path.join(draftDir, draftFile);
  const sourceExcerpt = compactExcerpt(sourceContent, 2_400);
  const proposedPage = `AI_MEMORY/wiki/${safeFileSlug(sourceTitle)}.md`;
  const indexPath = path.join(memoryRoot(), "AI_MEMORY", "wiki", "index.md");
  const existingIndex = existsSync(indexPath) ? await readFile(indexPath, "utf8").catch(() => "") : "";
  const writer = await runArchiveIngestWriter({
    sourceContent,
    sourcePath: artifactPath,
    sourceTitle,
    proposedPage,
    requestPath,
    existingIndex,
    requestedModel: payload.model,
  });
  const proposedContent = writer.content;
  const draftBody = [
    "---",
    `source: ${JSON.stringify("resonantos-browser-first")}`,
    `type: ${JSON.stringify("archive-draft-wiki-update")}`,
    `status: ${JSON.stringify("draft")}`,
    `createdAt: ${JSON.stringify(now)}`,
    `requestPath: ${JSON.stringify(requestPath)}`,
    `artifactPath: ${JSON.stringify(artifactPath)}`,
    `proposedPage: ${JSON.stringify(proposedPage)}`,
    `writerStatus: ${JSON.stringify(writer.writerStatus)}`,
    `writerProvider: ${JSON.stringify(writer.providerId)}`,
    `writerModel: ${JSON.stringify(writer.model)}`,
    `writerFallbackReason: ${JSON.stringify(writer.fallbackReason)}`,
    "---",
    "",
    `# Draft Wiki Update: ${sourceTitle}`,
    "",
    "## Summary",
    sourceExcerpt || "No source text was available for deterministic summarization.",
    "",
    "## Proposed Wiki Page",
    proposedPage,
    "",
    "## Proposed Content",
    proposedContent,
    "",
    "## Source Artifact",
    artifactPath,
    "",
    "## Review Request",
    requestPath,
    "",
    "## Boundary",
    "This artifact is a draft. It must not be treated as a trusted wiki page until the host-mediated ingest/review/promote path completes.",
    "",
    "## Writer Event",
    `- status: ${writer.writerStatus}`,
    `- provider: ${writer.providerId || "none"}`,
    `- model: ${writer.model || "none"}`,
    ...(writer.fallbackReason ? [`- fallback: ${writer.fallbackReason}`] : ["- fallback: none"]),
    "",
  ].join("\n");
  await writeFile(draftPath, draftBody);
  let updatedRequest = requestContent;
  updatedRequest = writeFrontmatterValue(updatedRequest, "draftArtifactPath", path.relative(memoryRoot(), draftPath));
  updatedRequest = writeFrontmatterValue(updatedRequest, "draftedAt", now);
  updatedRequest = `${updatedRequest.trimEnd()}\n\n## Review Event\n- at: ${now}\n- actor: resonantos-browser-first\n- from: approved\n- to: draft-created\n- artifact: ${path.relative(memoryRoot(), draftPath)}\n`;
  await writeFile(requestFile, updatedRequest);
  return {
    path: path.relative(memoryRoot(), draftPath),
    requestPath,
    proposedPage,
    status: "draft-created",
  };
}

async function executeArchiveReviewArtifactRead(payload = {}) {
  const artifactPath = String(payload.path ?? "").trim();
  const filePath = safeMemoryRelativePath(artifactPath, "REVIEW/artifacts");
  if (!/\.(md|markdown)$/i.test(filePath)) {
    throw new Error("Archive review artifact preview only supports markdown files.");
  }
  const [details, content] = await Promise.all([stat(filePath), readFile(filePath, "utf8")]);
  const type = frontmatterValue(content, "type");
  if (type && !String(type).startsWith("archive-")) {
    throw new Error("Archive review artifact preview requires an archive artifact file.");
  }
  return {
    path: path.relative(memoryRoot(), filePath),
    title: markdownTitle(content, path.basename(filePath, path.extname(filePath))),
    type: type || "archive-review-artifact",
    status: frontmatterValue(content, "promotionStatus") || frontmatterValue(content, "status") || "",
    verificationStatus: frontmatterValue(content, "verificationStatus") || "",
    verifierArtifactPath: frontmatterValue(content, "verifierArtifactPath") || "",
    semanticVerifierStatus: frontmatterValue(content, "semanticVerifierStatus") || "",
    semanticVerifierProvider: frontmatterValue(content, "semanticVerifierProvider") || "",
    semanticVerifierModel: frontmatterValue(content, "semanticVerifierModel") || "",
    writerStatus: frontmatterValue(content, "writerStatus") || "",
    writerProvider: frontmatterValue(content, "writerProvider") || "",
    writerModel: frontmatterValue(content, "writerModel") || "",
    writerFallbackReason: frontmatterValue(content, "writerFallbackReason") || "",
    proposedPage: frontmatterValue(content, "proposedPage") || "",
    bytes: details.size,
    modifiedAt: details.mtime.toISOString(),
    content: content.slice(0, 24_000),
    truncated: content.length > 24_000,
  };
}

async function executeArchiveReviewArtifactVerify(payload = {}) {
  const artifactPath = String(payload.path ?? "").trim();
  const artifactFile = safeMemoryRelativePath(artifactPath, "REVIEW/artifacts");
  if (!/\.(md|markdown)$/i.test(artifactFile)) {
    throw new Error("Archive review verification only supports markdown draft artifacts.");
  }
  const artifactContent = await readFile(artifactFile, "utf8");
  if (frontmatterValue(artifactContent, "type") !== "archive-draft-wiki-update") {
    throw new Error("Only draft wiki-update artifacts can be verified.");
  }
  if (frontmatterValue(artifactContent, "promotionStatus") === "promoted") {
    throw new Error("Promoted artifacts cannot be re-verified through this draft gate.");
  }
  const requestPath = frontmatterValue(artifactContent, "requestPath");
  const requestFile = safeMemoryRelativePath(requestPath, "REVIEW/requests");
  const requestContent = await readFile(requestFile, "utf8");
  const proposedPage = frontmatterValue(artifactContent, "proposedPage");
  const proposedContent = markdownSection(artifactContent, "Proposed Content");
  const sourceArtifactPath = frontmatterValue(artifactContent, "artifactPath");
  const findings = [];
  let sourceContent = "";
  if ((frontmatterValue(requestContent, "status") || "pending") !== "approved") {
    findings.push("Source review request is not approved.");
  }
  if (!proposedPage) {
    findings.push("Draft has no proposed wiki page.");
  } else {
    const pageFile = safeMemoryRelativePath(proposedPage, "AI_MEMORY/wiki");
    if (!/\.(md|markdown)$/i.test(pageFile)) {
      findings.push("Proposed wiki page is not a markdown file.");
    }
  }
  if (!proposedContent || proposedContent.length < 80) {
    findings.push("Proposed content is missing or too short to promote safely.");
  }
  let sourceTitle = "";
  if (!sourceArtifactPath) {
    findings.push("Draft has no source artifact path.");
  } else {
    const sourceFile = safeMemoryRelativePath(sourceArtifactPath, "INTAKE");
    if (!/\.(md|markdown)$/i.test(sourceFile) || !existsSync(sourceFile)) {
      findings.push("Source artifact is missing or is not markdown.");
    } else {
      sourceContent = await readFile(sourceFile, "utf8");
      sourceTitle = markdownTitle(sourceContent, path.basename(sourceFile, path.extname(sourceFile)));
      if (!compactExcerpt(sourceContent, 120)) {
        findings.push("Source artifact has no readable text.");
      }
    }
  }
  const semantic = findings.length
    ? {
        semanticStatus: "skipped",
        semanticSummary: "Semantic verification skipped because deterministic checks found blocking issues.",
        semanticFindings: [],
        providerId: "",
        model: "",
        usage: null,
      }
    : await runArchiveSemanticVerifier({
        artifactPath,
        requestPath,
        sourceContent,
        proposedPage,
        proposedContent,
        requestedModel: payload.model,
      });
  if (semantic.semanticStatus === "needs-revision") {
    findings.push(...semantic.semanticFindings.length
      ? semantic.semanticFindings.map((finding) => `Semantic verifier: ${finding}`)
      : ["Semantic verifier requested revision."]);
  }
  const now = new Date().toISOString();
  const verificationStatus = findings.length ? "needs-revision" : "verified";
  const verificationDir = path.join(memoryRoot(), "REVIEW", "verifications", "browser");
  await mkdir(verificationDir, { recursive: true });
  const verificationFile = `${now.replace(/[:.]/g, "-")}-${safeFileSlug(sourceTitle || proposedPage || artifactPath)}-verification.md`;
  const verificationPath = path.join(verificationDir, verificationFile);
  const verificationBody = [
    "---",
    `source: ${JSON.stringify("resonantos-browser-first")}`,
    `type: ${JSON.stringify("archive-verification-result")}`,
    `status: ${JSON.stringify(verificationStatus)}`,
    `createdAt: ${JSON.stringify(now)}`,
    `draftArtifactPath: ${JSON.stringify(artifactPath)}`,
    `requestPath: ${JSON.stringify(requestPath)}`,
    `sourceArtifactPath: ${JSON.stringify(sourceArtifactPath || "")}`,
    `proposedPage: ${JSON.stringify(proposedPage || "")}`,
    `semanticVerifierStatus: ${JSON.stringify(semantic.semanticStatus)}`,
    `semanticVerifierProvider: ${JSON.stringify(semantic.providerId)}`,
    `semanticVerifierModel: ${JSON.stringify(semantic.model)}`,
    "---",
    "",
    `# Archive Verification: ${sourceTitle || proposedPage || "Draft artifact"}`,
    "",
    "## Result",
    verificationStatus,
    "",
    "## Checks",
    "- request approved",
    "- proposed page scoped to AI_MEMORY/wiki",
    "- proposed content present",
    "- source artifact present under INTAKE",
    "",
    "## Findings",
    findings.length ? findings.map((finding) => `- ${finding}`).join("\n") : "- No blocking deterministic findings.",
    "",
    "## Semantic Verifier",
    `- status: ${semantic.semanticStatus}`,
    `- provider: ${semantic.providerId || "none"}`,
    `- model: ${semantic.model || "none"}`,
    `- summary: ${semantic.semanticSummary}`,
    ...(semantic.semanticFindings.length ? semantic.semanticFindings.map((finding) => `- finding: ${finding}`) : ["- finding: none"]),
    "",
    "## Boundary",
    "This verifier always runs deterministic host checks. When a provider is configured, it also records semantic challenge output before promotion.",
    "",
  ].join("\n");
  await writeFile(verificationPath, verificationBody);
  let updatedArtifact = artifactContent;
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "verificationStatus", verificationStatus);
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "verifiedAt", now);
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "verifierArtifactPath", path.relative(memoryRoot(), verificationPath));
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "semanticVerifierStatus", semantic.semanticStatus);
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "semanticVerifierProvider", semantic.providerId);
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "semanticVerifierModel", semantic.model);
  updatedArtifact = `${updatedArtifact.trimEnd()}\n\n## Verification Event\n- at: ${now}\n- actor: resonantos-browser-first\n- status: ${verificationStatus}\n- semantic verifier: ${semantic.semanticStatus}\n- verifier artifact: ${path.relative(memoryRoot(), verificationPath)}\n`;
  await writeFile(artifactFile, updatedArtifact);
  return {
    path: artifactPath,
    status: verificationStatus,
    verifierArtifactPath: path.relative(memoryRoot(), verificationPath),
    semanticVerifierStatus: semantic.semanticStatus,
    semanticVerifierProvider: semantic.providerId,
    semanticVerifierModel: semantic.model,
    semanticVerifierSummary: semantic.semanticSummary,
    findings,
  };
}

async function executeArchiveReviewArtifactRevise(payload = {}) {
  const artifactPath = String(payload.path ?? "").trim();
  const artifactFile = safeMemoryRelativePath(artifactPath, "REVIEW/artifacts");
  if (!/\.(md|markdown)$/i.test(artifactFile)) {
    throw new Error("Archive review revision only supports markdown draft artifacts.");
  }
  const artifactContent = await readFile(artifactFile, "utf8");
  if (frontmatterValue(artifactContent, "type") !== "archive-draft-wiki-update") {
    throw new Error("Only draft wiki-update artifacts can be revised.");
  }
  if (frontmatterValue(artifactContent, "promotionStatus") === "promoted") {
    throw new Error("Promoted artifacts cannot be revised through the draft gate.");
  }
  if (frontmatterValue(artifactContent, "verificationStatus") !== "needs-revision") {
    throw new Error("Draft revision requires verifier status needs-revision.");
  }

  const requestPath = frontmatterValue(artifactContent, "requestPath");
  const requestFile = safeMemoryRelativePath(requestPath, "REVIEW/requests");
  const requestContent = await readFile(requestFile, "utf8");
  if ((frontmatterValue(requestContent, "status") || "pending") !== "approved") {
    throw new Error("Draft revision requires the source review request to remain approved.");
  }

  const sourceArtifactPath = frontmatterValue(artifactContent, "artifactPath");
  const sourceFile = safeMemoryRelativePath(sourceArtifactPath, "INTAKE");
  if (!/\.(md|markdown)$/i.test(sourceFile) || !existsSync(sourceFile)) {
    throw new Error("Draft revision requires a readable markdown source artifact under INTAKE.");
  }
  const proposedPage = frontmatterValue(artifactContent, "proposedPage");
  const pageFile = safeMemoryRelativePath(proposedPage, "AI_MEMORY/wiki");
  if (!/\.(md|markdown)$/i.test(pageFile)) {
    throw new Error("Revised draft proposed page must remain under AI_MEMORY/wiki.");
  }

  const verifierArtifactPath = frontmatterValue(artifactContent, "verifierArtifactPath");
  let verifierContent = "";
  if (verifierArtifactPath) {
    const verifierFile = safeMemoryRelativePath(verifierArtifactPath, "REVIEW/verifications");
    if (existsSync(verifierFile)) {
      verifierContent = await readFile(verifierFile, "utf8");
    }
  }
  const sourceContent = await readFile(sourceFile, "utf8");
  const now = new Date().toISOString();
  const sourceTitle = markdownTitle(sourceContent, path.basename(sourceFile, path.extname(sourceFile)));
  const sourceExcerpt = compactExcerpt(sourceContent, 3_200);
  const verifierFindings = markdownSection(verifierContent, "Findings").trim();
  const semanticVerifier = markdownSection(verifierContent, "Semantic Verifier").trim();
  const revisionFindings = verifierFindings || "- Verifier artifact was unavailable; revise by preserving source boundaries and strengthening provenance.";
  const indexPath = path.join(memoryRoot(), "AI_MEMORY", "wiki", "index.md");
  const existingIndex = existsSync(indexPath) ? await readFile(indexPath, "utf8").catch(() => "") : "";
  const deterministicRevision = buildDeterministicWikiDraft({
    sourceContent,
    sourcePath: sourceArtifactPath,
    sourceTitle,
    proposedPage,
    requestPath,
    revised: true,
  });
  const writer = await runArchiveIngestWriter({
    sourceContent: [
      sourceContent,
      "",
      "Verifier findings to address:",
      revisionFindings,
      semanticVerifier,
    ].filter(Boolean).join("\n\n"),
    sourcePath: sourceArtifactPath,
    sourceTitle,
    proposedPage,
    requestPath,
    existingIndex,
    requestedModel: payload.model,
    deterministicContent: deterministicRevision,
  });

  const draftDir = path.join(memoryRoot(), "REVIEW", "artifacts", "browser");
  await mkdir(draftDir, { recursive: true });
  const revisionFile = `${now.replace(/[:.]/g, "-")}-${safeFileSlug(sourceTitle)}-revision.md`;
  const revisionPath = path.join(draftDir, revisionFile);
  const revisionBody = [
    "---",
    `source: ${JSON.stringify("resonantos-browser-first")}`,
    `type: ${JSON.stringify("archive-draft-wiki-update")}`,
    `status: ${JSON.stringify("draft")}`,
    `createdAt: ${JSON.stringify(now)}`,
    `requestPath: ${JSON.stringify(requestPath)}`,
    `artifactPath: ${JSON.stringify(sourceArtifactPath)}`,
    `proposedPage: ${JSON.stringify(proposedPage)}`,
    `supersedesDraftPath: ${JSON.stringify(artifactPath)}`,
    `verifierArtifactPath: ${JSON.stringify(verifierArtifactPath || "")}`,
    `revisionReason: ${JSON.stringify("Verifier returned needs-revision.")}`,
    `writerStatus: ${JSON.stringify(writer.writerStatus)}`,
    `writerProvider: ${JSON.stringify(writer.providerId)}`,
    `writerModel: ${JSON.stringify(writer.model)}`,
    `writerFallbackReason: ${JSON.stringify(writer.fallbackReason)}`,
    "---",
    "",
    `# Revised Draft Wiki Update: ${sourceTitle}`,
    "",
    "## Summary",
    "Revised after verifier findings. This draft keeps the original source as authority and records the verifier concerns it is intended to address.",
    "",
    sourceExcerpt || "No source text was available for deterministic revision.",
    "",
    "## Verifier Findings Addressed",
    revisionFindings,
    "",
    ...(semanticVerifier ? ["## Semantic Verifier Context", semanticVerifier, ""] : []),
    "## Proposed Wiki Page",
    proposedPage,
    "",
    "## Proposed Content",
    writer.content,
    "",
    "## Revision Notes",
    "- Preserves the raw intake source as the authority.",
    "- Carries verifier findings forward for the next verification pass.",
    "- Keeps promotion blocked until a fresh verifier result is recorded as verified.",
    "",
    "## Source Artifact",
    sourceArtifactPath,
    "",
    "## Review Request",
    requestPath,
    "",
    "## Superseded Draft",
    artifactPath,
    "",
    "## Boundary",
    "This artifact is a revised draft. It must not be treated as a trusted wiki page until the host-mediated ingest/review/promote path completes.",
    "",
    "## Writer Event",
    `- status: ${writer.writerStatus}`,
    `- provider: ${writer.providerId || "none"}`,
    `- model: ${writer.model || "none"}`,
    ...(writer.fallbackReason ? [`- fallback: ${writer.fallbackReason}`] : ["- fallback: none"]),
    "",
  ].join("\n");
  await writeFile(revisionPath, revisionBody);

  const revisionRelPath = path.relative(memoryRoot(), revisionPath);
  let updatedArtifact = artifactContent;
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "revisionStatus", "revised");
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "revisedDraftPath", revisionRelPath);
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "revisedAt", now);
  updatedArtifact = `${updatedArtifact.trimEnd()}\n\n## Revision Event\n- at: ${now}\n- actor: resonantos-browser-first\n- from: ${artifactPath}\n- to: ${revisionRelPath}\n- reason: verifier needs-revision\n`;
  await writeFile(artifactFile, updatedArtifact);

  let updatedRequest = requestContent;
  updatedRequest = writeFrontmatterValue(updatedRequest, "draftArtifactPath", revisionRelPath);
  updatedRequest = writeFrontmatterValue(updatedRequest, "revisedAt", now);
  updatedRequest = `${updatedRequest.trimEnd()}\n\n## Review Event\n- at: ${now}\n- actor: resonantos-browser-first\n- from: needs-revision\n- to: draft-revised\n- previous artifact: ${artifactPath}\n- artifact: ${revisionRelPath}\n`;
  await writeFile(requestFile, updatedRequest);

  return {
    path: revisionRelPath,
    previousDraftPath: artifactPath,
    requestPath,
    proposedPage,
    status: "draft-revised",
  };
}

async function executeArchiveVerificationRead(payload = {}) {
  const verifierPath = String(payload.path ?? "").trim();
  const filePath = safeMemoryRelativePath(verifierPath, "REVIEW/verifications");
  if (!/\.(md|markdown)$/i.test(filePath)) {
    throw new Error("Archive verification preview only supports markdown verifier artifacts.");
  }
  const [details, content] = await Promise.all([stat(filePath), readFile(filePath, "utf8")]);
  if (frontmatterValue(content, "type") !== "archive-verification-result") {
    throw new Error("Archive verification preview requires a verification result artifact.");
  }
  return {
    path: path.relative(memoryRoot(), filePath),
    title: markdownTitle(content, path.basename(filePath, path.extname(filePath))),
    status: frontmatterValue(content, "status") || "",
    semanticVerifierStatus: frontmatterValue(content, "semanticVerifierStatus") || "",
    semanticVerifierProvider: frontmatterValue(content, "semanticVerifierProvider") || "",
    semanticVerifierModel: frontmatterValue(content, "semanticVerifierModel") || "",
    draftArtifactPath: frontmatterValue(content, "draftArtifactPath") || "",
    proposedPage: frontmatterValue(content, "proposedPage") || "",
    bytes: details.size,
    modifiedAt: details.mtime.toISOString(),
    content: content.slice(0, 24_000),
    truncated: content.length > 24_000,
  };
}

async function executeArchiveReviewArtifactPromote(payload = {}) {
  const artifactPath = String(payload.path ?? "").trim();
  const artifactFile = safeMemoryRelativePath(artifactPath, "REVIEW/artifacts");
  if (!/\.(md|markdown)$/i.test(artifactFile)) {
    throw new Error("Archive review artifact promotion only supports markdown files.");
  }
  const artifactContent = await readFile(artifactFile, "utf8");
  if (frontmatterValue(artifactContent, "type") !== "archive-draft-wiki-update") {
    throw new Error("Only browser-first draft wiki-update artifacts can be promoted here.");
  }
  if (frontmatterValue(artifactContent, "promotionStatus") === "promoted") {
    return {
      path: artifactPath,
      status: "already-promoted",
      promotedPage: frontmatterValue(artifactContent, "promotedPage") || frontmatterValue(artifactContent, "proposedPage"),
      promotedAt: frontmatterValue(artifactContent, "promotedAt") || "",
      backupPath: frontmatterValue(artifactContent, "backupPath") || "",
    };
  }
  const requestPath = frontmatterValue(artifactContent, "requestPath");
  const requestFile = safeMemoryRelativePath(requestPath, "REVIEW/requests");
  const requestContent = await readFile(requestFile, "utf8");
  if ((frontmatterValue(requestContent, "status") || "pending") !== "approved") {
    throw new Error("Draft promotion requires the source review request to remain approved.");
  }
  if (frontmatterValue(artifactContent, "verificationStatus") !== "verified") {
    throw new Error("Draft promotion requires verifier status verified.");
  }
  const verifierArtifactPath = frontmatterValue(artifactContent, "verifierArtifactPath");
  if (!verifierArtifactPath || !existsSync(safeMemoryRelativePath(verifierArtifactPath, "REVIEW/verifications"))) {
    throw new Error("Draft promotion requires a recorded verifier artifact.");
  }
  const proposedPage = frontmatterValue(artifactContent, "proposedPage");
  const pageFile = safeMemoryRelativePath(proposedPage, "AI_MEMORY/wiki");
  if (!/\.(md|markdown)$/i.test(pageFile)) {
    throw new Error("Promoted wiki page must be a markdown file under AI_MEMORY/wiki.");
  }
  const proposedContent = markdownSection(artifactContent, "Proposed Content");
  if (!proposedContent) {
    throw new Error("Draft artifact has no Proposed Content section to promote.");
  }
  const now = new Date().toISOString();
  await mkdir(path.dirname(pageFile), { recursive: true });
  let backupPath = "";
  let existingPageContent = "";
  if (existsSync(pageFile)) {
    existingPageContent = await readFile(pageFile, "utf8");
    const backupDir = path.join(memoryRoot(), "AI_MEMORY", "backups", "promotions", now.replace(/[:.]/g, "-"));
    await mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, path.basename(pageFile));
    await copyFile(pageFile, backupFile);
    backupPath = path.relative(memoryRoot(), backupFile);
  }
  const pageTitle = markdownTitle(artifactContent, path.basename(pageFile, path.extname(pageFile))).replace(/^Draft Wiki Update:\s*/i, "");
  const mergedContent = mergePromotedMarkdownBody({
    existingContent: existingPageContent,
    promotedBody: proposedContent,
    sourcePath: frontmatterValue(artifactContent, "artifactPath") || "",
    artifactPath,
    promotedAt: now,
  });
  const pageBody = [
    "---",
    `source: ${JSON.stringify("resonantos-browser-first")}`,
    `type: ${JSON.stringify("ai-memory-page")}`,
    `title: ${JSON.stringify(pageTitle)}`,
    `updatedAt: ${JSON.stringify(now)}`,
    `reviewArtifact: ${JSON.stringify(artifactPath)}`,
    `sourceArtifact: ${JSON.stringify(frontmatterValue(artifactContent, "artifactPath") || "")}`,
    "---",
    "",
    mergedContent,
    "",
  ].join("\n");
  await writeFile(pageFile, pageBody);
  let updatedArtifact = artifactContent;
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "promotionStatus", "promoted");
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "promotedAt", now);
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "promotedPage", proposedPage);
  if (backupPath) {
    updatedArtifact = writeFrontmatterValue(updatedArtifact, "backupPath", backupPath);
  }
  updatedArtifact = `${updatedArtifact.trimEnd()}\n\n## Promotion Event\n- at: ${now}\n- actor: resonantos-browser-first\n- page: ${proposedPage}\n${backupPath ? `- backup: ${backupPath}\n` : ""}`;
  await writeFile(artifactFile, updatedArtifact);
  const indexPath = path.join(memoryRoot(), "AI_MEMORY", "wiki", "index.md");
  const logPath = path.join(memoryRoot(), "AI_MEMORY", "wiki", "log.md");
  await mkdir(path.dirname(indexPath), { recursive: true });
  const existingIndex = existsSync(indexPath) ? await readFile(indexPath, "utf8").catch(() => "") : "";
  const nextIndex = upsertWikiIndexCatalogEntry({
    existingIndex,
    pagePath: proposedPage,
    title: pageTitle,
    summary: summarizePromotedPageForIndex(proposedContent),
    sourceArtifact: frontmatterValue(artifactContent, "artifactPath") || "",
    promotedAt: now,
  });
  await writeFile(indexPath, nextIndex);
  await appendFile(logPath, `## [${now}] trusted_wiki_promote | ${pageTitle}\n- page: ${proposedPage}\n- review artifact: ${artifactPath}\n${backupPath ? `- backup: ${backupPath}\n` : ""}\n`);
  return {
    path: artifactPath,
    status: "promoted",
    promotedPage: proposedPage,
    promotedAt: now,
    backupPath,
  };
}

async function executeArchivePromotionList(payload = {}) {
  const limit = Math.max(1, Math.min(100, Number(payload.limit ?? 20)));
  const artifactsRoot = path.join(memoryRoot(), "REVIEW", "artifacts");
  const files = await listFilesRecursive(artifactsRoot, (filePath) => /\.(md|markdown)$/i.test(filePath), 2_000);
  const promotions = [];
  for (const filePath of files) {
    const [details, content] = await Promise.all([
      stat(filePath),
      readFile(filePath, "utf8").catch(() => ""),
    ]);
    if (frontmatterValue(content, "promotionStatus") !== "promoted") {
      continue;
    }
    const title = markdownTitle(content, path.basename(filePath, path.extname(filePath)))
      .replace(/^Draft Wiki Update:\s*/i, "");
    promotions.push({
      path: path.relative(memoryRoot(), filePath),
      title,
      status: "promoted",
      promotedPage: frontmatterValue(content, "promotedPage") || frontmatterValue(content, "proposedPage") || "",
      promotedAt: frontmatterValue(content, "promotedAt") || details.mtime.toISOString(),
      backupPath: frontmatterValue(content, "backupPath") || "",
      rollbackStatus: frontmatterValue(content, "rollbackStatus") || "",
      restoredAt: frontmatterValue(content, "restoredAt") || "",
      restoreBackupPath: frontmatterValue(content, "restoreBackupPath") || "",
      artifactPath: frontmatterValue(content, "artifactPath") || "",
      requestPath: frontmatterValue(content, "requestPath") || "",
      modifiedAt: details.mtime.toISOString(),
    });
  }
  promotions.sort((left, right) =>
    String(right.promotedAt || right.modifiedAt).localeCompare(String(left.promotedAt || left.modifiedAt))
  );
  return {
    root: path.relative(userRoot(), artifactsRoot),
    promotions: promotions.slice(0, limit),
  };
}

async function executeArchivePromotionRestore(payload = {}) {
  const artifactPath = String(payload.path ?? "").trim();
  const artifactFile = safeMemoryRelativePath(artifactPath, "REVIEW/artifacts");
  if (!/\.(md|markdown)$/i.test(artifactFile)) {
    throw new Error("Archive promotion restore only supports markdown review artifacts.");
  }
  const artifactContent = await readFile(artifactFile, "utf8");
  if (frontmatterValue(artifactContent, "type") !== "archive-draft-wiki-update") {
    throw new Error("Archive promotion restore requires a draft wiki-update artifact.");
  }
  if (frontmatterValue(artifactContent, "promotionStatus") !== "promoted") {
    throw new Error("Only promoted archive artifacts can be restored.");
  }
  const promotedPage = frontmatterValue(artifactContent, "promotedPage") || frontmatterValue(artifactContent, "proposedPage");
  const backupPath = frontmatterValue(artifactContent, "backupPath");
  if (!backupPath) {
    throw new Error("This promotion has no backup to restore.");
  }
  const pageFile = safeMemoryRelativePath(promotedPage, "AI_MEMORY/wiki");
  const backupFile = safeMemoryRelativePath(backupPath, "AI_MEMORY/backups/promotions");
  if (!existsSync(backupFile)) {
    throw new Error("Recorded promotion backup was not found.");
  }
  const now = new Date().toISOString();
  let restoreBackupPath = "";
  if (existsSync(pageFile)) {
    const restoreBackupDir = path.join(memoryRoot(), "AI_MEMORY", "backups", "restores", now.replace(/[:.]/g, "-"));
    await mkdir(restoreBackupDir, { recursive: true });
    const restoreBackupFile = path.join(restoreBackupDir, path.basename(pageFile));
    await copyFile(pageFile, restoreBackupFile);
    restoreBackupPath = path.relative(memoryRoot(), restoreBackupFile);
  }
  await mkdir(path.dirname(pageFile), { recursive: true });
  await copyFile(backupFile, pageFile);
  let updatedArtifact = artifactContent;
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "rollbackStatus", "restored");
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "restoredAt", now);
  updatedArtifact = writeFrontmatterValue(updatedArtifact, "restoreBackupPath", restoreBackupPath);
  updatedArtifact = `${updatedArtifact.trimEnd()}\n\n## Restore Event\n- at: ${now}\n- actor: resonantos-browser-first\n- page: ${promotedPage}\n- restored-from: ${backupPath}\n${restoreBackupPath ? `- previous-current-backup: ${restoreBackupPath}\n` : ""}`;
  await writeFile(artifactFile, updatedArtifact);
  const logPath = path.join(memoryRoot(), "AI_MEMORY", "wiki", "log.md");
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `## [${now}] trusted_wiki_restore | ${path.basename(promotedPage)}\n- page: ${promotedPage}\n- restored from: ${backupPath}\n- review artifact: ${artifactPath}\n${restoreBackupPath ? `- previous current backup: ${restoreBackupPath}\n` : ""}\n`);
  return {
    path: artifactPath,
    status: "restored",
    promotedPage,
    backupPath,
    restoredAt: now,
    restoreBackupPath,
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
  const contextMarkdown = String(payload.contextMarkdown ?? "").trim().slice(0, 24_000);
  const source = String(payload.source ?? "resonantos-chat").trim().slice(0, 120);
  const sourceControlRunId = String(payload.sourceControlRunId ?? "").trim().slice(0, 120);
  if (!["hermes", "opencode", "engineer"].includes(target)) {
    throw new Error("Delegation target must be hermes, opencode, or engineer.");
  }
  if (mission.length < 8) {
    throw new Error("Delegation requires a concrete mission.");
  }
  const taskDir = path.join(delegationRoot(), target);
  await mkdir(taskDir, { recursive: true });
  const id = `${target}-${Date.now()}`;
  const taskPath = path.join(taskDir, `${id}.md`);
  const body = [
    `# Delegation: ${target}`,
    "",
    `- id: ${id}`,
    `- createdAt: ${new Date().toISOString()}`,
    `- source: ResonantOS Browser Layer`,
    `- sourceKind: ${source || "resonantos-chat"}`,
    ...(sourceControlRunId ? [`- sourceControlRunId: ${sourceControlRunId}`] : []),
    `- status: queued`,
    `- trust: add-on agent, not core trusted Strategist`,
    "- allowedCapabilities: agent-delegation, archive-read-optional",
    "- forbiddenActions: provider-secrets, wallet-actions, trusted-memory-write, external-send",
    "- approvalRequiredBeforeExternalAction: true",
    "- expectedArtifacts: final-summary, actions-taken, approval-needs, residual-risks, verification",
    "",
    "## Mission",
    mission,
    "",
    "## Success Criteria",
    "- Return a concise final summary.",
    "- List actions taken or explain why no action was taken.",
    "- Identify any approval needed before external communication or public action.",
    "- State residual risks and verification evidence.",
    "",
    ...(contextMarkdown
      ? [
        "## Context Packet",
        contextMarkdown,
        ""
      ]
      : []),
    "## Artifact Return Contract",
    "- finalSummary: user-facing result",
    "- actionsTaken: bounded list",
    "- approvalNeeds: human review gates",
    "- residualRisks: uncertainty and limitations",
    "- verification: how the result was checked",
    "",
    "## Boundary",
    "The add-on receives a task packet only. Provider secrets, wallet actions, and trusted memory writes remain host-mediated.",
    "",
  ].join("\n");
  await writeFile(taskPath, body);
  return {
    hasContextPacket: Boolean(contextMarkdown),
    id,
    mission,
    path: path.relative(userRoot(), taskPath),
    source,
    sourceControlRunId,
    status: "queued",
    target,
  };
}

async function executeAddonDraftRecord(payload) {
  const target = String(payload.target ?? "").trim().toLowerCase();
  if (!["email", "calendar"].includes(target)) {
    throw new Error("Draft target must be email or calendar.");
  }
  const intent = String(payload.intent ?? payload.subject ?? payload.title ?? "").trim();
  const body = String(payload.body ?? payload.details ?? payload.mission ?? "").trim();
  if (intent.length < 3 || body.length < 8) {
    throw new Error("Draft requires a concrete intent and body.");
  }
  const draftDir = path.join(browserFirstRoot(), "AddOnDrafts", target);
  await mkdir(draftDir, { recursive: true });
  const id = `${target}-draft-${Date.now()}`;
  const draftPath = path.join(draftDir, `${id}-${safeFileSlug(intent)}.md`);
  const content = [
    `# ${target === "email" ? "Email" : "Calendar"} Draft`,
    "",
    `- id: ${id}`,
    `- createdAt: ${new Date().toISOString()}`,
    `- target: ${target}`,
    "- status: draft-only",
    "- approvalRequired: true",
    "- source: ResonantOS Browser Layer",
    "",
    "## Intent",
    intent,
    "",
    "## Draft Body",
    body,
    "",
    "## Boundary",
    target === "email"
      ? "This is a draft packet only. ResonantOS does not send email from this route; sending requires a separate human approval flow in the email add-on."
      : "This is a draft packet only. ResonantOS does not schedule calendar events from this route; scheduling requires a separate human approval flow in the calendar add-on.",
    "",
  ].join("\n");
  await writeFile(draftPath, content);
  return {
    approvalRequired: true,
    id,
    path: path.relative(userRoot(), draftPath),
    status: "draft-created",
    target,
  };
}

function draftRoot() {
  return path.join(browserFirstRoot(), "AddOnDrafts");
}

function delegationRoot() {
  return path.join(browserFirstRoot(), "Delegations");
}

function delegationArtifactRoot() {
  return path.join(browserFirstRoot(), "DelegationArtifacts");
}

function addonExecutionSettingsPath() {
  return path.join(browserFirstRoot(), "Settings", "addon-execution.json");
}

function defaultAddonExecutionSettings() {
  return {
    hermes: { localCliExecution: false },
    opencode: { localCliExecution: false },
  };
}

function normalizeAddonExecutionSettings(value = {}) {
  const defaults = defaultAddonExecutionSettings();
  return {
    hermes: { localCliExecution: Boolean(value?.hermes?.localCliExecution ?? defaults.hermes.localCliExecution) },
    opencode: { localCliExecution: Boolean(value?.opencode?.localCliExecution ?? defaults.opencode.localCliExecution) },
  };
}

async function readAddonExecutionSettings() {
  const raw = await readFile(addonExecutionSettingsPath(), "utf8").catch(() => "");
  if (!raw) return defaultAddonExecutionSettings();
  try {
    return normalizeAddonExecutionSettings(JSON.parse(raw));
  } catch {
    return defaultAddonExecutionSettings();
  }
}

async function writeAddonExecutionSettings(next) {
  const normalized = normalizeAddonExecutionSettings(next);
  const filePath = addonExecutionSettingsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => undefined);
  return normalized;
}

function addonLocalCliExecutionEnabled(addon, payload = {}, settings = defaultAddonExecutionSettings()) {
  if (addon === "hermes" && payload.enableHermesExecution === true) return true;
  if (addon === "opencode" && payload.enableOpenCodeExecution === true) return true;
  if (addon === "hermes" && /^enabled|true|1$/i.test(String(process.env.RESONANTOS_HERMES_EXECUTION ?? ""))) return true;
  if (addon === "opencode" && /^enabled|true|1$/i.test(String(process.env.RESONANTOS_OPENCODE_EXECUTION ?? ""))) return true;
  return Boolean(settings?.[addon]?.localCliExecution);
}

function resolveDraftPath(relativePath) {
  const resolved = path.resolve(userRoot(), String(relativePath ?? ""));
  const root = path.resolve(draftRoot());
  if (!resolved.startsWith(`${root}${path.sep}`) || !resolved.endsWith(".md")) {
    throw new Error("Draft path must point to a draft packet inside BrowserFirst/AddOnDrafts.");
  }
  return resolved;
}

function resolveDelegationPath(relativePath, expectedTarget = "") {
  const resolved = path.resolve(userRoot(), String(relativePath ?? ""));
  const target = String(expectedTarget ?? "").trim().toLowerCase();
  const root = path.resolve(target ? path.join(delegationRoot(), target) : delegationRoot());
  if (!resolved.startsWith(`${root}${path.sep}`) || !resolved.endsWith(".md")) {
    throw new Error("Delegation path must point to a task packet inside BrowserFirst/Delegations.");
  }
  return resolved;
}

function fieldFromMarkdown(content, field) {
  const match = new RegExp(`^- ${field}:\\s*(.+)$`, "mi").exec(content);
  return match ? match[1].trim() : "";
}

function sectionFromMarkdown(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`, "i").exec(content);
  return match ? match[1].trim() : "";
}

function sectionListFromMarkdown(content, heading) {
  return sectionFromMarkdown(content, heading)
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function draftSummaryFromMarkdown(filePath, content, details) {
  return {
    id: fieldFromMarkdown(content, "id") || path.basename(filePath, ".md"),
    target: fieldFromMarkdown(content, "target") || path.basename(path.dirname(filePath)),
    status: fieldFromMarkdown(content, "status") || "draft-only",
    approvalRequired: /- approvalRequired:\s*true/i.test(content),
    path: path.relative(userRoot(), filePath),
    intent: sectionFromMarkdown(content, "Intent").slice(0, 220),
    updatedAt: details?.mtime?.toISOString?.() ?? "",
  };
}

function delegationSummaryFromMarkdown(filePath, content, details) {
  const context = sectionFromMarkdown(content, "Context Packet");
  const result = sectionFromMarkdown(content, "Result");
  return {
    contextExcerpt: context.replace(/\s+/g, " ").slice(0, 360),
    hasContextPacket: Boolean(context),
    id: fieldFromMarkdown(content, "id") || path.basename(filePath, ".md"),
    mission: sectionFromMarkdown(content, "Mission").slice(0, 360),
    path: path.relative(userRoot(), filePath),
    resultArtifactPath: fieldFromMarkdown(content, "resultArtifactPath"),
    resultExcerpt: result.replace(/\s+/g, " ").slice(0, 360),
    sourceControlRunId: fieldFromMarkdown(content, "sourceControlRunId"),
    sourceKind: fieldFromMarkdown(content, "sourceKind") || "resonantos-chat",
    status: fieldFromMarkdown(content, "status") || "queued",
    target: path.basename(path.dirname(filePath)),
    updatedAt: details?.mtime?.toISOString?.() ?? "",
  };
}

async function executeAddonDraftList(payload) {
  const limit = Math.min(40, Math.max(1, Number(payload.limit ?? 20)));
  const target = String(payload.target ?? "").trim().toLowerCase();
  const roots = ["email", "calendar"]
    .filter((candidate) => !target || candidate === target)
    .map((candidate) => path.join(draftRoot(), candidate));
  const files = [];
  for (const root of roots) {
    files.push(...await listFilesRecursive(root, (filePath) => filePath.endsWith(".md"), limit));
  }
  const drafts = [];
  for (const filePath of files) {
    const [details, content] = await Promise.all([
      stat(filePath).catch(() => null),
      readFile(filePath, "utf8").catch(() => ""),
    ]);
    if (!details || !content) continue;
    drafts.push(draftSummaryFromMarkdown(filePath, content, details));
  }
  drafts.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return { root: path.relative(userRoot(), draftRoot()), drafts: drafts.slice(0, limit) };
}

async function executeDelegationList(payload) {
  const limit = Math.min(40, Math.max(1, Number(payload.limit ?? 20)));
  const target = String(payload.target ?? "").trim().toLowerCase();
  const roots = ["hermes", "opencode", "engineer"]
    .filter((candidate) => !target || candidate === target)
    .map((candidate) => path.join(delegationRoot(), candidate));
  const files = [];
  for (const root of roots) {
    files.push(...await listFilesRecursive(root, (filePath) => filePath.endsWith(".md"), limit));
  }
  const delegations = [];
  for (const filePath of files) {
    const [details, content] = await Promise.all([
      stat(filePath).catch(() => null),
      readFile(filePath, "utf8").catch(() => ""),
    ]);
    if (!details || !content) continue;
    delegations.push(delegationSummaryFromMarkdown(filePath, content, details));
  }
  delegations.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return { root: path.relative(userRoot(), delegationRoot()), delegations: delegations.slice(0, limit) };
}

async function executeHermesStatus(payload = {}) {
  const executionSettings = await readAddonExecutionSettings();
  const profileHome = hermesHome(payload.profileHome);
  const command = hermesCommand(profileHome);
  const dashboard = await executeHermesDashboardStatus({ profileHome, host: payload.host, port: payload.port });
  const taskRoot = path.join(delegationRoot(), "hermes");
  const tasks = await listFilesRecursive(taskRoot, (filePath) => filePath.endsWith(".md"), 200);
  const statusCounts = {};
  for (const filePath of tasks) {
    const content = await readFile(filePath, "utf8").catch(() => "");
    const status = fieldFromMarkdown(content, "status") || "queued";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  return {
    available: Boolean(command),
    command: command ? redactPathForDiagnostics(command) : "",
    dashboard,
    executionEnabled: addonLocalCliExecutionEnabled("hermes", payload, executionSettings),
    mode: command
      ? addonLocalCliExecutionEnabled("hermes", payload, executionSettings)
        ? "local-hermes-cli"
        : "local-hermes-cli-disabled"
      : "packet-only",
    profileHome: redactPathForDiagnostics(profileHome),
    taskCounts: statusCounts,
    boundary: "Hermes is an add-on agent. ResonantOS mediates task packets, artifacts, provider access, memory access, and external-send approval.",
  };
}

async function writeDelegationStatus(filePath, status, extraFields = {}) {
  const previous = await readFile(filePath, "utf8");
  let next = previous.replace(/^- status:\s*.+$/mi, `- status: ${status}`);
  for (const [field, value] of Object.entries(extraFields)) {
    const line = `- ${field}: ${String(value).replace(/\n/g, " ").trim()}`;
    const expression = new RegExp(`^- ${field}:\\s*.+$`, "mi");
    next = expression.test(next) ? next.replace(expression, line) : next.replace(/(\n## Mission\n)/, `\n${line}$1`);
  }
  await writeFile(filePath, next);
  return next;
}

function deterministicHermesResult(packet) {
  const mission = sectionFromMarkdown(packet, "Mission");
  const hasContext = Boolean(sectionFromMarkdown(packet, "Context Packet"));
  return {
    adapter: "deterministic",
    actionsTaken: [
      "Read the governed Hermes delegation packet.",
      "Checked the task boundary and artifact return contract.",
      hasContext ? "Reviewed the attached bounded context packet." : "No additional context packet was attached.",
      "Prepared a reviewable result without external sends or trusted memory writes.",
    ],
    approvalNeeds: [
      "Human approval is required before Hermes sends messages, schedules events, posts publicly, or changes external systems."
    ],
    finalSummary: `Hermes delegation is ready for review: ${mission}`,
    residualRisks: [
      "This deterministic adapter proves ResonantOS delegation lifecycle behavior; it does not claim the local Hermes model completed real-world research."
    ],
    verification: [
      "Task packet was parsed.",
      "Safety boundary was preserved.",
      "Result artifact was written under BrowserFirst/DelegationArtifacts/hermes."
    ],
  };
}

function buildHermesExecutionPrompt(packet) {
  const mission = sectionFromMarkdown(packet, "Mission");
  const context = sectionFromMarkdown(packet, "Context Packet");
  return [
    "You are Hermes operating as a ResonantOS add-on agent.",
    "",
    "Mission:",
    mission,
    "",
    context ? "Context packet:" : "",
    context,
    "",
    "Rules:",
    "- Return a reviewable artifact only.",
    "- Do not send messages, schedule events, post publicly, submit forms, operate wallets, expose secrets, or write trusted memory.",
    "- If external action is needed, list it under Approval Needs instead of performing it.",
    "- Keep the output concise and structured with these headings exactly: Final Summary, Actions Taken, Approval Needs, Residual Risks, Verification.",
  ].filter(Boolean).join("\n");
}

function parseHermesCliResult(output) {
  const text = String(output ?? "").trim();
  const actionsTaken = sectionListFromMarkdown(text, "Actions Taken");
  const approvalNeeds = sectionListFromMarkdown(text, "Approval Needs");
  const residualRisks = sectionListFromMarkdown(text, "Residual Risks");
  const verification = sectionListFromMarkdown(text, "Verification");
  return {
    adapter: "hermes-cli",
    actionsTaken: actionsTaken.length
      ? actionsTaken
      : ["Hermes returned a result through the local CLI adapter."],
    approvalNeeds: approvalNeeds.length
      ? approvalNeeds
      : ["Human approval is required before any external send, submission, wallet action, or trusted memory write."],
    finalSummary: sectionFromMarkdown(text, "Final Summary") || text.slice(0, 1600) || "Hermes completed without returning a summary.",
    residualRisks: residualRisks.length
      ? residualRisks
      : ["Hermes output was accepted as an add-on artifact and still requires normal human review."],
    verification: verification.length
      ? verification
      : ["Local Hermes CLI returned successfully."],
  };
}

async function runHermesCliDelegation(command, packet, payload = {}) {
  const prompt = buildHermesExecutionPrompt(packet);
  const toolsets = String(payload.toolsets ?? process.env.RESONANTOS_HERMES_TOOLSETS ?? "memory").trim();
  const args = ["chat", "-q", prompt, "-Q", "--source", "resonantos", "--max-turns", "8"];
  if (toolsets) args.push("--toolsets", toolsets);
  const output = await execFileStdout(command, args, {
    cwd: browserFirstRoot(),
    env: {
      ...process.env,
      HERMES_HOME: hermesHome(payload.profileHome),
    },
    timeout: Math.min(600_000, Math.max(30_000, Number(payload.timeoutMs ?? 180_000))),
  });
  return parseHermesCliResult(output);
}

async function writeHermesResultArtifact(taskPath, packet, result) {
  const id = fieldFromMarkdown(packet, "id") || path.basename(taskPath, ".md");
  const artifactDir = path.join(delegationArtifactRoot(), "hermes");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `${id}-result.md`);
  const lines = [
    `# Hermes Result: ${id}`,
    "",
    `- id: ${id}`,
    `- taskPath: ${path.relative(userRoot(), taskPath)}`,
    `- createdAt: ${new Date().toISOString()}`,
    `- adapter: ${result.adapter}`,
    "- status: completed",
    "- boundary: Reviewable artifact only. External sends and trusted memory writes remain blocked.",
    "",
    "## Final Summary",
    result.finalSummary,
    "",
    "## Actions Taken",
    ...result.actionsTaken.map((item) => `- ${item}`),
    "",
    "## Approval Needs",
    ...result.approvalNeeds.map((item) => `- ${item}`),
    "",
    "## Residual Risks",
    ...result.residualRisks.map((item) => `- ${item}`),
    "",
    "## Verification",
    ...result.verification.map((item) => `- ${item}`),
    "",
  ];
  await writeFile(artifactPath, lines.join("\n"));
  return artifactPath;
}

async function executeHermesDelegationStart(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "hermes");
  const packet = await readFile(taskPath, "utf8");
  const currentStatus = fieldFromMarkdown(packet, "status") || "queued";
  if (["completed", "cancelled"].includes(currentStatus)) {
    throw new Error(`Hermes delegation is already ${currentStatus}.`);
  }
  const adapter = String(payload.adapter ?? process.env.RESONANTOS_HERMES_ADAPTER ?? "auto").trim().toLowerCase();
  const profileHome = hermesHome(payload.profileHome);
  const command = hermesCommand(profileHome);
  const executionSettings = await readAddonExecutionSettings();
  await writeDelegationStatus(taskPath, "running", {
    startedAt: new Date().toISOString(),
    adapter: adapter || "auto",
  });
  if (adapter !== "deterministic" && !command) {
    const blockedAt = new Date().toISOString();
    const updated = await writeDelegationStatus(taskPath, "blocked", {
      blockedAt,
      blockedReason: "Hermes CLI unavailable",
    });
    return {
      ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
      blockedReason: "Hermes CLI unavailable. Install or configure Hermes, or run the deterministic adapter in tests.",
      status: "blocked",
    };
  }
  if (adapter !== "deterministic" && !addonLocalCliExecutionEnabled("hermes", payload, executionSettings)) {
    const blockedAt = new Date().toISOString();
    const updated = await writeDelegationStatus(taskPath, "blocked", {
      blockedAt,
      blockedReason: "Hermes execution requires explicit enablement",
    });
    return {
      ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
      blockedReason: "Hermes CLI was found, but execution is disabled. Set RESONANTOS_HERMES_EXECUTION=enabled or pass enableHermesExecution from a trusted Settings flow.",
      status: "blocked",
    };
  }
  let result;
  try {
    result = adapter === "deterministic"
      ? deterministicHermesResult(packet)
      : await runHermesCliDelegation(command, packet, payload);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const updated = await writeDelegationStatus(taskPath, "failed", {
      failedAt,
      failureReason: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    });
    return {
      ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
      failureReason: error instanceof Error ? error.message : String(error),
      status: "failed",
    };
  }
  const artifactPath = await writeHermesResultArtifact(taskPath, packet, result);
  let updated = await writeDelegationStatus(taskPath, "completed", {
    completedAt: new Date().toISOString(),
    resultArtifactPath: path.relative(userRoot(), artifactPath),
  });
  updated = `${updated.trimEnd()}\n\n## Result\n${result.finalSummary}\n\n## Result Artifact\n${path.relative(userRoot(), artifactPath)}\n`;
  await writeFile(taskPath, updated);
  return {
    ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
    adapter: result.adapter,
    artifact: {
      path: path.relative(userRoot(), artifactPath),
      ...result,
    },
    status: "completed",
  };
}

async function executeHermesDelegationStatus(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "hermes");
  const [details, content] = await Promise.all([stat(taskPath), readFile(taskPath, "utf8")]);
  return delegationSummaryFromMarkdown(taskPath, content, details);
}

async function executeHermesDelegationArtifact(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "hermes");
  const content = await readFile(taskPath, "utf8");
  const artifactRelative = fieldFromMarkdown(content, "resultArtifactPath");
  if (!artifactRelative) {
    throw new Error("Hermes delegation has no result artifact yet.");
  }
  const artifactPath = path.resolve(userRoot(), artifactRelative);
  const artifactRoot = path.resolve(path.join(delegationArtifactRoot(), "hermes"));
  if (!artifactPath.startsWith(`${artifactRoot}${path.sep}`) || !artifactPath.endsWith(".md")) {
    throw new Error("Hermes result artifact path is outside the approved artifact root.");
  }
  const artifact = await readFile(artifactPath, "utf8");
  return {
    actionsTaken: sectionListFromMarkdown(artifact, "Actions Taken"),
    approvalNeeds: sectionListFromMarkdown(artifact, "Approval Needs"),
    content: artifact,
    finalSummary: sectionFromMarkdown(artifact, "Final Summary"),
    path: path.relative(userRoot(), artifactPath),
    residualRisks: sectionListFromMarkdown(artifact, "Residual Risks"),
    verification: sectionListFromMarkdown(artifact, "Verification"),
  };
}

async function executeHermesDelegationCancel(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "hermes");
  const content = await readFile(taskPath, "utf8");
  const currentStatus = fieldFromMarkdown(content, "status") || "queued";
  if (["completed", "cancelled"].includes(currentStatus)) {
    return delegationSummaryFromMarkdown(taskPath, content, await stat(taskPath));
  }
  const updated = await writeDelegationStatus(taskPath, "cancelled", {
    cancelledAt: new Date().toISOString(),
    cancelReason: String(payload.reason ?? "Human cancelled Hermes delegation.").slice(0, 240),
  });
  return delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath));
}

async function executeOpenCodeStatus(payload = {}) {
  const executionSettings = await readAddonExecutionSettings();
  const command = opencodeCommand();
  const taskRoot = path.join(delegationRoot(), "opencode");
  const tasks = await listFilesRecursive(taskRoot, (filePath) => filePath.endsWith(".md"), 200);
  const statusCounts = {};
  for (const filePath of tasks) {
    const content = await readFile(filePath, "utf8").catch(() => "");
    const status = fieldFromMarkdown(content, "status") || "queued";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }
  return {
    installed: Boolean(command),
    command: command ? redactPathForDiagnostics(command) : "",
    mode: command && addonLocalCliExecutionEnabled("opencode", payload, executionSettings) ? "local-opencode-cli" : command ? "local-opencode-cli-disabled" : "packet-only",
    executionEnabled: addonLocalCliExecutionEnabled("opencode", payload, executionSettings),
    workspaceLaunch: "not-enabled-in-browser-first-v1",
    detail: command
      ? "OpenCode runtime was detected. ResonantOS can create governed coding packets and start execution only when explicit OpenCode execution is enabled."
      : "OpenCode runtime was not detected. Install or configure OpenCode before enabling local coding execution.",
    taskCounts: statusCounts,
    delegationPackets: tasks.length,
    requiredGrants: ["filesystem", "shell", "providers", "ui-embedding"],
    boundary: "OpenCode is an add-on agent. Filesystem, shell, provider secrets, wallet actions, and trusted memory writes remain mediated by ResonantOS.",
  };
}

function resolveOpenCodeWorkspacePath(payload = {}) {
  const workspacePath = payload.workspacePath
    ? expandUserPath(payload.workspacePath)
    : repoRoot;
  const resolved = path.resolve(workspacePath);
  const allowedRoot = path.resolve(repoRoot);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("OpenCode workspace path must stay inside the ResonantOS repository for browser-first V1.");
  }
  return resolved;
}

function deterministicOpenCodeResult(packet, payload = {}) {
  const mission = sectionFromMarkdown(packet, "Mission");
  return {
    adapter: "deterministic",
    actionsTaken: [
      "Read the governed OpenCode coding packet.",
      "Checked the coding handoff boundary and required artifact contract.",
      "Prepared a reviewable coding result without shell execution, file edits, provider-secret access, wallet actions, or trusted memory writes.",
    ],
    changedFiles: [],
    commandsRun: [],
    finalSummary: `OpenCode coding delegation is ready for review: ${mission}`,
    residualRisks: [
      "This deterministic adapter proves ResonantOS OpenCode delegation lifecycle behavior; it does not claim code was changed by a local OpenCode runtime."
    ],
    verification: [
      "Task packet was parsed.",
      "Workspace scope was checked.",
      "Result artifact was written under BrowserFirst/DelegationArtifacts/opencode."
    ],
    workspacePath: path.relative(repoRoot, resolveOpenCodeWorkspacePath(payload)) || ".",
  };
}

function buildOpenCodeExecutionPrompt(packet, workspacePath) {
  const mission = sectionFromMarkdown(packet, "Mission");
  const context = sectionFromMarkdown(packet, "Context Packet");
  return [
    "You are OpenCode operating as a ResonantOS add-on coding agent.",
    "",
    `Workspace: ${workspacePath}`,
    "",
    "Mission:",
    mission,
    "",
    context ? "Context packet:" : "",
    context,
    "",
    "Rules:",
    "- Work only inside the approved workspace.",
    "- Do not access provider secrets, wallets, trusted Living Archive writes, or external send/submission surfaces.",
    "- Return a reviewable artifact.",
    "- Keep the output structured with these headings exactly: Final Summary, Changed Files, Commands Run, Tests, Residual Risks, Verification.",
  ].filter(Boolean).join("\n");
}

function parseOpenCodeCliResult(output, workspacePath) {
  const text = String(output ?? "").trim();
  return {
    adapter: "opencode-cli",
    actionsTaken: ["Local OpenCode CLI returned a coding result through the host adapter."],
    changedFiles: sectionFromMarkdown(text, "Changed Files").split("\n").filter(Boolean),
    commandsRun: sectionFromMarkdown(text, "Commands Run").split("\n").filter(Boolean),
    finalSummary: sectionFromMarkdown(text, "Final Summary") || text.slice(0, 1600) || "OpenCode completed without returning a summary.",
    residualRisks: sectionFromMarkdown(text, "Residual Risks").split("\n").filter(Boolean).length
      ? sectionFromMarkdown(text, "Residual Risks").split("\n").filter(Boolean)
      : ["OpenCode output is an add-on artifact and still requires normal human review."],
    verification: sectionFromMarkdown(text, "Verification").split("\n").filter(Boolean).length
      ? sectionFromMarkdown(text, "Verification").split("\n").filter(Boolean)
      : sectionFromMarkdown(text, "Tests").split("\n").filter(Boolean).length
        ? sectionFromMarkdown(text, "Tests").split("\n").filter(Boolean)
        : ["Local OpenCode CLI returned successfully."],
    workspacePath: path.relative(repoRoot, workspacePath) || ".",
  };
}

async function runOpenCodeCliDelegation(command, packet, payload = {}) {
  const workspacePath = resolveOpenCodeWorkspacePath(payload);
  const prompt = buildOpenCodeExecutionPrompt(packet, workspacePath);
  const args = ["run", prompt, "--dir", workspacePath];
  const output = await execFileStdout(command, args, {
    cwd: workspacePath,
    timeout: Math.min(900_000, Math.max(30_000, Number(payload.timeoutMs ?? 300_000))),
  });
  return parseOpenCodeCliResult(output, workspacePath);
}

async function writeOpenCodeResultArtifact(taskPath, packet, result) {
  const id = fieldFromMarkdown(packet, "id") || path.basename(taskPath, ".md");
  const artifactDir = path.join(delegationArtifactRoot(), "opencode");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `${id}-result.md`);
  const lines = [
    `# OpenCode Result: ${id}`,
    "",
    `- id: ${id}`,
    `- taskPath: ${path.relative(userRoot(), taskPath)}`,
    `- createdAt: ${new Date().toISOString()}`,
    `- adapter: ${result.adapter}`,
    "- status: completed",
    `- workspacePath: ${result.workspacePath || "."}`,
    "- boundary: Reviewable coding artifact only. Shell, filesystem, provider secrets, trusted memory writes, and external sends remain governed by ResonantOS.",
    "",
    "## Final Summary",
    result.finalSummary,
    "",
    "## Actions Taken",
    ...(result.actionsTaken ?? []).map((item) => `- ${item}`),
    "",
    "## Changed Files",
    ...((result.changedFiles ?? []).length ? result.changedFiles : ["None reported."]).map((item) => `- ${item}`),
    "",
    "## Commands Run",
    ...((result.commandsRun ?? []).length ? result.commandsRun : ["None reported."]).map((item) => `- ${item}`),
    "",
    "## Residual Risks",
    ...(result.residualRisks ?? []).map((item) => `- ${item}`),
    "",
    "## Verification",
    ...(result.verification ?? []).map((item) => `- ${item}`),
    "",
  ];
  await writeFile(artifactPath, lines.join("\n"));
  return artifactPath;
}

async function executeOpenCodeDelegationStart(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "opencode");
  const packet = await readFile(taskPath, "utf8");
  const currentStatus = fieldFromMarkdown(packet, "status") || "queued";
  if (["completed", "cancelled"].includes(currentStatus)) {
    throw new Error(`OpenCode delegation is already ${currentStatus}.`);
  }
  const adapter = String(payload.adapter ?? process.env.RESONANTOS_OPENCODE_ADAPTER ?? "auto").trim().toLowerCase();
  const command = opencodeCommand();
  const executionSettings = await readAddonExecutionSettings();
  await writeDelegationStatus(taskPath, "running", {
    startedAt: new Date().toISOString(),
    adapter: adapter || "auto",
    workspacePath: path.relative(repoRoot, resolveOpenCodeWorkspacePath(payload)) || ".",
  });
  if (adapter !== "deterministic" && !command) {
    const updated = await writeDelegationStatus(taskPath, "blocked", {
      blockedAt: new Date().toISOString(),
      blockedReason: "OpenCode CLI unavailable",
    });
    return {
      ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
      blockedReason: "OpenCode CLI unavailable. Install or configure OpenCode, or run the deterministic adapter in tests.",
      status: "blocked",
    };
  }
  if (adapter !== "deterministic" && !addonLocalCliExecutionEnabled("opencode", payload, executionSettings)) {
    const updated = await writeDelegationStatus(taskPath, "blocked", {
      blockedAt: new Date().toISOString(),
      blockedReason: "OpenCode execution requires explicit enablement",
    });
    return {
      ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
      blockedReason: "OpenCode CLI was found, but execution is disabled. Set RESONANTOS_OPENCODE_EXECUTION=enabled or pass enableOpenCodeExecution from a trusted Settings flow.",
      status: "blocked",
    };
  }
  let result;
  try {
    result = adapter === "deterministic"
      ? deterministicOpenCodeResult(packet, payload)
      : await runOpenCodeCliDelegation(command, packet, payload);
  } catch (error) {
    const updated = await writeDelegationStatus(taskPath, "failed", {
      failedAt: new Date().toISOString(),
      failureReason: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    });
    return {
      ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
      failureReason: error instanceof Error ? error.message : String(error),
      status: "failed",
    };
  }
  const artifactPath = await writeOpenCodeResultArtifact(taskPath, packet, result);
  let updated = await writeDelegationStatus(taskPath, "completed", {
    completedAt: new Date().toISOString(),
    resultArtifactPath: path.relative(userRoot(), artifactPath),
  });
  updated = `${updated.trimEnd()}\n\n## Result\n${result.finalSummary}\n\n## Result Artifact\n${path.relative(userRoot(), artifactPath)}\n`;
  await writeFile(taskPath, updated);
  return {
    ...delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath)),
    artifact: {
      path: path.relative(userRoot(), artifactPath),
      ...result,
    },
    status: "completed",
  };
}

async function executeOpenCodeDelegationStatus(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "opencode");
  const [details, content] = await Promise.all([stat(taskPath), readFile(taskPath, "utf8")]);
  return delegationSummaryFromMarkdown(taskPath, content, details);
}

async function executeOpenCodeDelegationArtifact(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "opencode");
  const content = await readFile(taskPath, "utf8");
  const artifactRelative = fieldFromMarkdown(content, "resultArtifactPath");
  if (!artifactRelative) {
    throw new Error("OpenCode delegation has no result artifact yet.");
  }
  const artifactPath = path.resolve(userRoot(), artifactRelative);
  const artifactRoot = path.resolve(path.join(delegationArtifactRoot(), "opencode"));
  if (!artifactPath.startsWith(`${artifactRoot}${path.sep}`) || !artifactPath.endsWith(".md")) {
    throw new Error("OpenCode result artifact path is outside the approved artifact root.");
  }
  const artifact = await readFile(artifactPath, "utf8");
  return {
    changedFiles: sectionFromMarkdown(artifact, "Changed Files"),
    commandsRun: sectionFromMarkdown(artifact, "Commands Run"),
    content: artifact,
    finalSummary: sectionFromMarkdown(artifact, "Final Summary"),
    path: path.relative(userRoot(), artifactPath),
    residualRisks: sectionFromMarkdown(artifact, "Residual Risks"),
    verification: sectionFromMarkdown(artifact, "Verification"),
  };
}

async function executeOpenCodeDelegationCancel(payload = {}) {
  const taskPath = resolveDelegationPath(payload.path, "opencode");
  const content = await readFile(taskPath, "utf8");
  const currentStatus = fieldFromMarkdown(content, "status") || "queued";
  if (["completed", "cancelled"].includes(currentStatus)) {
    return delegationSummaryFromMarkdown(taskPath, content, await stat(taskPath));
  }
  const updated = await writeDelegationStatus(taskPath, "cancelled", {
    cancelledAt: new Date().toISOString(),
    cancelReason: String(payload.reason ?? "Human cancelled OpenCode delegation.").slice(0, 240),
  });
  return delegationSummaryFromMarkdown(taskPath, updated, await stat(taskPath));
}

async function executeAddonDraftRead(payload) {
  const filePath = resolveDraftPath(payload.path);
  const [details, content] = await Promise.all([stat(filePath), readFile(filePath, "utf8")]);
  return {
    ...draftSummaryFromMarkdown(filePath, content, details),
    content,
  };
}

async function executeAddonDraftTransition(payload) {
  const status = String(payload.status ?? "").trim().toLowerCase();
  if (!["approved-for-manual-send", "rejected", "draft-only"].includes(status)) {
    throw new Error("Draft status must be approved-for-manual-send, rejected, or draft-only.");
  }
  const filePath = resolveDraftPath(payload.path);
  const previous = await readFile(filePath, "utf8");
  const previousStatus = fieldFromMarkdown(previous, "status") || "draft-only";
  const reason = String(payload.reason ?? "Manual review from ResonantOS Add-ons workspace.").trim().slice(0, 240);
  const reviewer = String(payload.reviewer ?? "human").trim().slice(0, 80) || "human";
  const next = previous.replace(/^- status:\s*.+$/mi, `- status: ${status}`);
  const audit = [
    "",
    "## Audit",
    `- reviewedAt: ${new Date().toISOString()}`,
    `- reviewer: ${reviewer}`,
    `- previousStatus: ${previousStatus}`,
    `- newStatus: ${status}`,
    `- reason: ${reason}`,
    "- boundary: This review state does not send email or schedule calendar events.",
    "",
  ].join("\n");
  await writeFile(filePath, `${next.trimEnd()}\n${audit}`);
  const details = await stat(filePath);
  return draftSummaryFromMarkdown(filePath, await readFile(filePath, "utf8"), details);
}

async function executeAddonDraftProviderHandoff(payload) {
  const filePath = resolveDraftPath(payload.path);
  const provider = String(payload.provider ?? "").trim().toLowerCase();
  const content = await readFile(filePath, "utf8");
  const draft = parseDraftPacketMarkdown(content, {
    id: path.basename(filePath, ".md"),
    target: path.basename(path.dirname(filePath)),
  });
  if (draft.status !== "approved-for-manual-send") {
    throw new Error("Provider handoff requires a human-approved draft packet first.");
  }
  const handoff = buildProviderDraftHandoff(draft, provider);
  const reviewer = String(payload.reviewer ?? "human").trim().slice(0, 80) || "human";
  await writeFile(filePath, appendProviderHandoffAudit(content, handoff, reviewer));
  const details = await stat(filePath);
  return {
    ...draftSummaryFromMarkdown(filePath, await readFile(filePath, "utf8"), details),
    handoff,
  };
}

async function executeAddonsStatus() {
  const executionSettings = await readAddonExecutionSettings();
  return {
    addons: [
      {
        id: "addon.hermes",
        name: "Hermes",
        available: existsSync(path.join(repoRoot, "src", "modules", "hermes")),
        mode: "delegation-addon",
        trust: "add-on agent",
        requestedCapabilities: ["agent-delegation", "network", "notifications"],
        grantedCapabilities: ["agent-delegation"],
        execution: {
          localCliExecution: Boolean(executionSettings.hermes.localCliExecution),
          mode: hermesCommand() ? "local-cli-detected" : "packet-only",
        },
      },
      {
        id: "addon.opencode",
        name: "OpenCode",
        available: existsSync(path.join(repoRoot, "src", "modules", "opencode")),
        mode: "coding-addon",
        trust: "add-on agent",
        requestedCapabilities: ["agent-delegation", "filesystem-scoped", "shell", "providers"],
        grantedCapabilities: ["agent-delegation"],
        deniedCapabilities: executionSettings.opencode.localCliExecution ? [] : ["shell"],
        execution: {
          localCliExecution: Boolean(executionSettings.opencode.localCliExecution),
          mode: opencodeCommand() ? "local-cli-detected" : "packet-only",
        },
      },
      {
        id: "addon.living-archive",
        name: "Living Archive",
        available: existsSync(memoryRoot()),
        mode: "memory-system",
        trust: "host-mediated memory provider",
        requestedCapabilities: ["archive-read", "archive-intake-write", "archive-knowledge-write"],
        grantedCapabilities: ["archive-read", "archive-intake-write"],
        deniedCapabilities: ["archive-knowledge-write"],
      },
      {
        id: "addon.email",
        name: "Email",
        available: true,
        mode: "draft-only-communication-addon",
        trust: "host-mediated draft provider",
        providers: ["gmail"],
        requestedCapabilities: ["communication-draft", "provider-handoff"],
        grantedCapabilities: ["communication-draft", "provider-handoff"],
        deniedCapabilities: ["external-send"],
        boundary: "Draft packets only. Gmail handoff opens a compose draft for human review; ResonantOS does not send email.",
      },
      {
        id: "addon.calendar",
        name: "Calendar",
        available: true,
        mode: "draft-only-scheduling-addon",
        trust: "host-mediated draft provider",
        providers: ["google-calendar"],
        requestedCapabilities: ["calendar-draft", "provider-handoff"],
        grantedCapabilities: ["calendar-draft", "provider-handoff"],
        deniedCapabilities: ["external-schedule"],
        boundary: "Draft packets only. Google Calendar handoff opens an event template for human review; ResonantOS does not schedule events.",
      },
    ],
  };
}

async function executeAddonExecutionSettingsGet() {
  const settings = await readAddonExecutionSettings();
  return {
    settings,
    boundary: "Local CLI execution is disabled by default. Enabling it lets a configured add-on runtime execute through host-mediated adapters while preserving scoped task packets and artifact review.",
  };
}

async function executeAddonExecutionSettingsUpdate(payload = {}) {
  const current = await readAddonExecutionSettings();
  const addon = String(payload.addon ?? "").trim().toLowerCase();
  if (!["hermes", "opencode"].includes(addon)) {
    throw new Error("Execution settings can only be updated for Hermes or OpenCode.");
  }
  const next = normalizeAddonExecutionSettings(current);
  next[addon] = {
    ...next[addon],
    localCliExecution: Boolean(payload.localCliExecution),
  };
  const settings = await writeAddonExecutionSettings(next);
  return {
    addon,
    settings,
    status: settings[addon].localCliExecution ? "enabled" : "disabled",
  };
}

async function executeHermesDashboardStatus(payload = {}) {
  const target = dashboardTarget(payload.host, payload.port);
  const command = hermesCommand(payload.profileHome);
  const running = await socketOpen(target.host, target.port);
  return {
    running,
    url: target.url,
    host: target.host,
    port: target.port,
    command,
    profileHome: hermesHome(payload.profileHome),
    detail: running
      ? `Hermes dashboard is reachable at ${target.url}.`
      : `Hermes dashboard is not reachable at ${target.url}.`,
    rawStatus: command ? "Hermes CLI found." : "Hermes CLI was not found.",
  };
}

async function executeHermesDashboardStart(payload = {}) {
  const target = dashboardTarget(payload.host, payload.port);
  const profileHome = hermesHome(payload.profileHome);
  const command = hermesCommand(profileHome);
  if (!command) {
    throw new Error("Hermes CLI was not found. Install or configure Hermes before launching the dashboard.");
  }
  const alreadyRunning = await socketOpen(target.host, target.port);
  if (!alreadyRunning) {
    const args = ["dashboard", "--host", target.host, "--port", String(target.port), "--no-open"];
    if (payload.includeTui !== false) {
      args.push("--tui");
    }
    const child = spawn(command, args, {
      detached: true,
      env: { ...process.env, HERMES_HOME: profileHome },
      stdio: "ignore",
    });
    child.unref();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await socketOpen(target.host, target.port)) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return executeHermesDashboardStatus({ ...payload, host: target.host, port: target.port, profileHome });
}

async function executeHermesDashboardStop(payload = {}) {
  const profileHome = hermesHome(payload.profileHome);
  const command = hermesCommand(profileHome);
  if (!command) {
    throw new Error("Hermes CLI was not found. Install or configure Hermes before stopping the dashboard.");
  }
  await new Promise((resolve) => {
    const child = spawn(command, ["dashboard", "--stop"], {
      env: { ...process.env, HERMES_HOME: profileHome },
      stdio: "ignore",
    });
    child.once("exit", resolve);
    child.once("error", resolve);
  });
  return executeHermesDashboardStatus({ ...payload, profileHome });
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

async function readPackageVersion() {
  try {
    const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
    return String(pkg.version ?? "unknown");
  } catch {
    return "unknown";
  }
}

async function readExtensionVersion() {
  try {
    const manifest = JSON.parse(await readFile(path.join(resonantExtension, "manifest.json"), "utf8"));
    return String(manifest.version ?? "unknown");
  } catch {
    return "unknown";
  }
}

async function executeBrowserLaunchDiagnostics() {
  const logPath = browserLaunchLogPath();
  let logContent = "";
  let logStat = null;
  try {
    [logContent, logStat] = await Promise.all([
      readFile(logPath, "utf8"),
      stat(logPath),
    ]);
  } catch (error) {
    return {
      status: "missing-log",
      logPath: redactPathForDiagnostics(logPath),
      error: redactDiagnosticText(error instanceof Error ? error.message : error),
    };
  }
  return {
    ...summarizeBrowserLaunchLog(logContent),
    logPath: redactPathForDiagnostics(logPath),
    updatedAt: logStat?.mtime?.toISOString?.() ?? "",
  };
}

async function executeDiagnosticsReport() {
  const generatedAt = new Date().toISOString();
  const [statusResult, providerResult, addonResult, memoryResult, browserLaunchResult] = await Promise.allSettled([
    executeSystemStatus(),
    executeProviderStatus(),
    executeAddonsStatus(),
    executeMemoryStatus(),
    executeBrowserLaunchDiagnostics(),
  ]);
  const settledValue = (result) => result.status === "fulfilled"
    ? result.value
    : { unavailable: true, error: redactDiagnosticText(result.reason instanceof Error ? result.reason.message : result.reason) };
  const providers = settledValue(providerResult).providers ?? [];
  const addons = settledValue(addonResult).addons ?? [];
  const memory = settledValue(memoryResult);
  const report = {
    generatedAt,
    product: "ResonantOS Browser",
    version: await readPackageVersion(),
    extensionVersion: await readExtensionVersion(),
    platform: {
      os: process.platform,
      arch: process.arch,
      node: process.version,
    },
    paths: {
      userRoot: redactPathForDiagnostics(userRoot()),
      browserFirstRoot: redactPathForDiagnostics(browserFirstRoot()),
      memoryRoot: redactPathForDiagnostics(memoryRoot()),
      profileDir: redactPathForDiagnostics(profileDir),
    },
    status: settledValue(statusResult),
    providers: {
      total: providers.length,
      configured: providers.filter((provider) => provider.configured).length,
      entries: providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        configured: Boolean(provider.configured),
        models: provider.models ?? [],
        role: provider.role ?? "",
      })),
    },
    addons: {
      total: addons.length,
      available: addons.filter((addon) => addon.available || addon.enabled).length,
      entries: addons.map((addon) => ({
        id: addon.id,
        name: addon.name,
        available: Boolean(addon.available || addon.enabled),
        mode: addon.mode,
        trust: addon.trust,
      })),
    },
    memory: {
      wikiPages: memory?.wiki?.pages ?? 0,
      intakeArtifacts: memory?.intake?.artifacts ?? 0,
      reviewRequests: memory?.review?.requests ?? 0,
      reviewArtifacts: memory?.review?.artifacts ?? 0,
    },
    browserLaunch: settledValue(browserLaunchResult),
    redaction: "Provider credentials, bridge tokens, wallet secrets, private keys, and full home paths are excluded or redacted.",
  };
  const serialized = redactDiagnosticText(JSON.stringify(report, null, 2));
  await mkdir(diagnosticsRoot(), { recursive: true });
  const filePath = path.join(diagnosticsRoot(), `diagnostics-${generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(filePath, `${serialized}\n`, { mode: 0o600 });
  return {
    path: redactPathForDiagnostics(filePath),
    generatedAt,
    summary: {
      providers: report.providers,
      addons: report.addons,
      memory: report.memory,
      browserLaunch: report.browserLaunch,
    },
  };
}

async function executeBrowserDownloads() {
  const root = browserDownloadsRoot();
  const state = await browserDownloadsState();
  const clearedAtMs = Number.isFinite(Date.parse(state.clearedAt ?? ""))
    ? Date.parse(state.clearedAt)
    : 0;
  if (!existsSync(root)) {
    return {
      root: redactPathForDiagnostics(root),
      entries: [],
      total: 0,
      clearedAt: state.clearedAt ?? "",
    };
  }
  const names = await readdir(root).catch(() => []);
  const entries = [];
  for (const name of names) {
    if (!name || name.startsWith(".")) {
      continue;
    }
    const filePath = path.join(root, name);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile?.()) {
      continue;
    }
    if (clearedAtMs && fileStat.mtime.getTime() <= clearedAtMs) {
      continue;
    }
    entries.push({
      name,
      path: redactPathForDiagnostics(filePath),
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });
  }
  entries.sort((left, right) => String(right.modifiedAt).localeCompare(String(left.modifiedAt)));
  return {
    root: redactPathForDiagnostics(root),
    entries: entries.slice(0, 20),
    total: entries.length,
    clearedAt: state.clearedAt ?? "",
  };
}

async function executeBrowserDownloadAction(payload = {}) {
  const action = String(payload.action ?? "").trim();
  if (action === "clear-history") {
    const clearedAt = new Date().toISOString();
    await writeBrowserDownloadsState({ clearedAt });
    return {
      action,
      clearedAt,
      message: "Download history was cleared. Files were not deleted.",
    };
  }
  if (action !== "open" && action !== "reveal") {
    throw new Error("Unsupported download action.");
  }
  const filePath = resolveDownloadFile(payload.name ?? payload.path);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile?.()) {
    throw new Error("Download file was not found.");
  }
  if (!payload.dryRun) {
    await openOrRevealDownload(filePath, action);
  }
  return {
    action,
    dryRun: Boolean(payload.dryRun),
    name: path.basename(filePath),
    path: redactPathForDiagnostics(filePath),
  };
}

const bridgeRoutes = [
  { method: "GET", path: "/status", handler: executeSystemStatus },
  { method: "GET", path: "/providers/status", handler: executeProviderStatus },
  { method: "POST", path: "/providers/health", handler: executeProviderHealthCheck },
  { method: "POST", path: "/providers/connectivity-test", handler: executeProviderConnectivityTest },
  { method: "GET", path: "/providers/diagnostics-history", handler: executeProviderDiagnosticsHistory },
  { method: "GET", path: "/providers/routing-strategies", handler: executeProviderRoutingStrategies },
  {
    method: "POST",
    path: "/providers/credentials",
    requiredCapability: "provider-credential-write",
    handler: executeProviderCredentialSave,
  },
  {
    method: "POST",
    path: "/providers/accounts",
    requiredCapability: "provider-credential-write",
    handler: executeProviderAccountSave,
  },
  {
    method: "POST",
    path: "/providers/routing-strategies",
    requiredCapability: "provider-routing-write",
    handler: executeProviderRoutingStrategySave,
  },
  {
    method: "POST",
    path: "/providers/model-preferences",
    requiredCapability: "provider-routing-write",
    handler: executeProviderModelPreferencesSave,
  },
  { method: "POST", path: "/augmentor/chat", handler: executeBridgeChat },
  { method: "POST", path: "/augmentor/inline", handler: executeInlineAssistant },
  { method: "POST", path: "/augmentor/control-plan", handler: executeControlPlan },
  { method: "POST", path: "/augmentor/next-action", handler: executeNextAction },
  { method: "GET", path: "/memory/status", handler: executeMemoryStatus },
  { method: "GET", path: "/memory/settings", handler: executeMemorySettings },
  {
    method: "POST",
    path: "/memory/settings",
    requiredCapability: "memory-settings-write",
    handler: executeMemorySettingsSave,
  },
  {
    method: "POST",
    path: "/memory/source/browse",
    requiredCapability: "memory-source-browse",
    handler: executeMemorySourceBrowse,
  },
  {
    method: "POST",
    path: "/memory/source/scan",
    requiredCapability: "memory-source-scan",
    handler: executeMemorySourceScan,
  },
  {
    method: "POST",
    path: "/memory/source/action",
    requiredCapability: "memory-source-manage",
    handler: executeMemorySourceAction,
  },
  {
    method: "POST",
    path: "/memory/source/move-preflight",
    requiredCapability: "memory-source-move",
    handler: executeMemorySourceMovePreflight,
  },
  {
    method: "POST",
    path: "/memory/source/move-execute",
    requiredCapability: "memory-source-move",
    handler: executeMemorySourceMoveExecute,
  },
  {
    method: "POST",
    path: "/memory/source/move-rollback",
    requiredCapability: "memory-source-move",
    handler: executeMemorySourceMoveRollback,
  },
  {
    method: "POST",
    path: "/memory/source/review",
    requiredCapability: "memory-source-review",
    handler: executeMemorySourceReview,
  },
  {
    method: "POST",
    path: "/memory/source/intake",
    requiredCapability: "memory-source-intake",
    handler: executeMemorySourceIntake,
  },
  {
    method: "POST",
    path: "/memory/source/file-intake",
    requiredCapability: "memory-source-file-intake",
    handler: executeMemorySourceFileIntake,
  },
  { method: "POST", path: "/memory/search", handler: executeMemorySearch },
  { method: "GET", path: "/memory/wiki/health", handler: executeMemoryWikiHealth },
  {
    method: "POST",
    path: "/memory/wiki/lint",
    requiredCapability: "memory-source-review",
    handler: executeMemoryWikiLint,
  },
  { method: "POST", path: "/memory/source/versions", handler: executeMemorySourceVersions },
  {
    method: "POST",
    path: "/memory/source/diff",
    requiredCapability: "memory-source-review",
    handler: executeMemorySourceDiff,
  },
  { method: "POST", path: "/archive/intake", handler: executeArchiveIntake },
  { method: "POST", path: "/archive/intake/list", handler: executeArchiveIntakeList },
  { method: "POST", path: "/archive/intake/read", handler: executeArchiveIntakeRead },
  { method: "POST", path: "/archive/review/request", handler: executeArchiveReviewRequest },
  { method: "POST", path: "/archive/review/list", handler: executeArchiveReviewList },
  { method: "POST", path: "/archive/review/transition", handler: executeArchiveReviewTransition },
  { method: "POST", path: "/archive/review/draft", handler: executeArchiveReviewDraft },
  { method: "POST", path: "/archive/review/artifact/read", handler: executeArchiveReviewArtifactRead },
  { method: "POST", path: "/archive/review/artifact/verify", handler: executeArchiveReviewArtifactVerify },
  { method: "POST", path: "/archive/review/verification/read", handler: executeArchiveVerificationRead },
  { method: "POST", path: "/archive/review/artifact/revise", handler: executeArchiveReviewArtifactRevise },
  { method: "POST", path: "/archive/review/artifact/promote", handler: executeArchiveReviewArtifactPromote },
  { method: "POST", path: "/archive/review/promotions/list", handler: executeArchivePromotionList },
  { method: "POST", path: "/archive/review/promotions/restore", handler: executeArchivePromotionRestore },
  { method: "GET", path: "/addons/status", handler: executeAddonsStatus },
  { method: "GET", path: "/addons/execution-settings", handler: executeAddonExecutionSettingsGet },
  {
    method: "POST",
    path: "/addons/execution-settings",
    requiredCapability: "addon-execution-settings-write",
    handler: executeAddonExecutionSettingsUpdate,
  },
  { method: "GET", path: "/opencode/status", handler: executeOpenCodeStatus },
  { method: "GET", path: "/browser/downloads", handler: executeBrowserDownloads },
  { method: "GET", path: "/browser/launch-diagnostics", handler: executeBrowserLaunchDiagnostics },
  {
    method: "POST",
    path: "/browser/downloads/action",
    requiredCapability: "browser-download-action",
    handler: executeBrowserDownloadAction,
  },
  {
    method: "POST",
    path: "/diagnostics/report",
    requiredCapability: "diagnostics-report-export",
    handler: executeDiagnosticsReport,
  },
  { method: "POST", path: "/hermes/dashboard/status", handler: executeHermesDashboardStatus },
  { method: "POST", path: "/hermes/dashboard/start", handler: executeHermesDashboardStart },
  { method: "POST", path: "/hermes/dashboard/stop", handler: executeHermesDashboardStop },
  { method: "POST", path: "/hermes/status", handler: executeHermesStatus },
  { method: "POST", path: "/hermes/delegation/start", handler: executeHermesDelegationStart },
  { method: "POST", path: "/hermes/delegation/status", handler: executeHermesDelegationStatus },
  { method: "POST", path: "/hermes/delegation/artifact", handler: executeHermesDelegationArtifact },
  { method: "POST", path: "/hermes/delegation/cancel", handler: executeHermesDelegationCancel },
  { method: "POST", path: "/opencode/delegation/start", handler: executeOpenCodeDelegationStart },
  { method: "POST", path: "/opencode/delegation/status", handler: executeOpenCodeDelegationStatus },
  { method: "POST", path: "/opencode/delegation/artifact", handler: executeOpenCodeDelegationArtifact },
  { method: "POST", path: "/opencode/delegation/cancel", handler: executeOpenCodeDelegationCancel },
  { method: "POST", path: "/web/news", handler: executeNewsSearch },
  { method: "POST", path: "/addons/draft", handler: executeAddonDraftRecord },
  { method: "POST", path: "/addons/draft/list", handler: executeAddonDraftList },
  { method: "POST", path: "/addons/draft/read", handler: executeAddonDraftRead },
  { method: "POST", path: "/addons/draft/transition", handler: executeAddonDraftTransition },
  { method: "POST", path: "/addons/draft/handoff", handler: executeAddonDraftProviderHandoff },
  { method: "POST", path: "/addons/delegate", handler: executeDelegationRecord },
  { method: "POST", path: "/addons/delegate/list", handler: executeDelegationList },
  { method: "POST", path: "/goals", handler: executeGoalRecord },
];

const args = parseArgs(process.argv.slice(2));
const bridgeToken = args.get("bridge-token") ?? process.env.RESONANTOS_BROWSER_FIRST_BRIDGE_TOKEN ?? createBridgeToken();
const bridgeCapabilityTokens = {
  "provider-credential-write": args.get("provider-credential-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_PROVIDER_CREDENTIAL_TOKEN ??
    createBridgeToken(),
  "provider-routing-write": args.get("provider-routing-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_PROVIDER_ROUTING_TOKEN ??
    createBridgeToken(),
  "memory-settings-write": args.get("memory-settings-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SETTINGS_TOKEN ??
    createBridgeToken(),
  "memory-source-browse": args.get("memory-source-browse-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SOURCE_BROWSE_TOKEN ??
    createBridgeToken(),
  "memory-source-scan": args.get("memory-source-scan-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SOURCE_SCAN_TOKEN ??
    createBridgeToken(),
  "memory-source-manage": args.get("memory-source-manage-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SOURCE_MANAGE_TOKEN ??
    createBridgeToken(),
  "memory-source-move": args.get("memory-source-move-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SOURCE_MOVE_TOKEN ??
    createBridgeToken(),
  "memory-source-review": args.get("memory-source-review-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SOURCE_REVIEW_TOKEN ??
    createBridgeToken(),
  "memory-source-intake": args.get("memory-source-intake-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SOURCE_INTAKE_TOKEN ??
    createBridgeToken(),
  "memory-source-file-intake": args.get("memory-source-file-intake-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_MEMORY_SOURCE_FILE_INTAKE_TOKEN ??
    createBridgeToken(),
  "diagnostics-report-export": args.get("diagnostics-report-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_DIAGNOSTICS_REPORT_TOKEN ??
    createBridgeToken(),
  "browser-download-action": args.get("browser-download-action-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_BROWSER_DOWNLOAD_ACTION_TOKEN ??
    createBridgeToken(),
  "addon-execution-settings-write": args.get("addon-execution-settings-token") ??
    process.env.RESONANTOS_BROWSER_FIRST_ADDON_EXECUTION_SETTINGS_TOKEN ??
    createBridgeToken(),
};

if (args.get("bridge-auth-self-test") === "true") {
  const result = await runBridgeAuthSelfTest({
    port: Number(args.get("bridge-port") ?? 0),
    bridgeToken,
    extensionOrigin: resonantExtensionOrigin,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (args.get("hermes-delegation-self-test") === "true") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resonantos-hermes-bridge-"));
  const previousUserRoot = process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
  const previousHermesCommand = process.env.HERMES_COMMAND;
  process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = path.join(tempRoot, "ResonantOS_User");
  let server = null;
  let exitCode = 1;
  try {
    const fakeHermes = path.join(tempRoot, "bin", process.platform === "win32" ? "hermes.cmd" : "hermes");
    await mkdir(path.dirname(fakeHermes), { recursive: true });
    await writeFile(fakeHermes, process.platform === "win32" ? "@echo off\r\necho fake hermes\r\n" : "#!/bin/sh\necho fake hermes\n");
    await chmod(fakeHermes, 0o755).catch(() => undefined);
    process.env.HERMES_COMMAND = fakeHermes;
    server = await startBridgeServer({
      port: Number(args.get("bridge-port") ?? 0),
      bridgeToken,
      bridgeCapabilityTokens,
      extensionOrigin: resonantExtensionOrigin,
      routes: bridgeRoutes,
    });
    const actualPort = bridgeServerPort(server, Number(args.get("bridge-port") ?? 0));
    const request = async (route, body = {}) => {
      const response = await fetch(`http://127.0.0.1:${actualPort}${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": resonantExtensionOrigin,
          "X-ResonantOS-Bridge-Token": bridgeToken,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`${route} failed: ${payload.error || response.status}`);
      }
      return payload;
    };
    const created = await request("/addons/delegate", {
      target: "hermes",
      mission: "Prepare a routine coordination summary for deterministic Hermes lifecycle testing.",
      contextMarkdown: "Visible page and task context are bounded test evidence.",
    });
    const gated = await request("/addons/delegate", {
      target: "hermes",
      mission: "Check that real Hermes execution is gated unless explicitly enabled.",
    });
    const gatedStart = await request("/hermes/delegation/start", { path: gated.path });
    const statusBefore = await request("/hermes/delegation/status", { path: created.path });
    const started = await request("/hermes/delegation/start", { path: created.path, adapter: "deterministic" });
    const artifact = await request("/hermes/delegation/artifact", { path: created.path });
    const listed = await request("/addons/delegate/list", { target: "hermes", limit: 5 });
    const statusAfter = await request("/hermes/delegation/status", { path: created.path });
    const hermesStatus = await request("/hermes/status", {});
    const ok = (
      created.status === "queued" &&
      gatedStart.status === "blocked" &&
      /execution is disabled/i.test(gatedStart.blockedReason || "") &&
      statusBefore.status === "queued" &&
      started.status === "completed" &&
      /Hermes delegation is ready for review/.test(artifact.finalSummary) &&
      listed.delegations.some((delegation) => delegation.id === created.id && delegation.status === "completed") &&
      statusAfter.resultArtifactPath &&
      hermesStatus.boundary?.includes("Hermes is an add-on agent")
    );
    console.log(JSON.stringify({
      ok,
      artifactPath: artifact.path,
      created: created.id,
      gatedStatus: gatedStart.status,
      hermesMode: hermesStatus.mode,
      listed: listed.delegations.length,
      statusAfter: statusAfter.status,
    }, null, 2));
    exitCode = ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (previousUserRoot === undefined) {
      delete process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
    } else {
      process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = previousUserRoot;
    }
    if (previousHermesCommand === undefined) {
      delete process.env.HERMES_COMMAND;
    } else {
      process.env.HERMES_COMMAND = previousHermesCommand;
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(exitCode);
}

if (args.get("hermes-cli-execution-self-test") === "true") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resonantos-hermes-cli-bridge-"));
  const previousUserRoot = process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
  const previousHermesCommand = process.env.HERMES_COMMAND;
  process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = path.join(tempRoot, "ResonantOS_User");
  let server = null;
  let exitCode = 1;
  try {
    const fakeHermes = path.join(tempRoot, "bin", process.platform === "win32" ? "hermes.cmd" : "hermes");
    const fakeOutput = [
      "## Final Summary",
      "Hermes CLI adapter completed the requested production execution test.",
      "",
      "## Actions Taken",
      "- Parsed the ResonantOS task packet.",
      "- Returned a reviewable artifact instead of taking external action.",
      "",
      "## Approval Needs",
      "- Human approval remains required for any external send, submit, wallet action, or trusted memory write.",
      "",
      "## Residual Risks",
      "- This is a fake Hermes executable used only for deterministic adapter validation.",
      "",
      "## Verification",
      "- Local Hermes CLI process was invoked through the host boundary.",
    ].join("\n");
    await mkdir(path.dirname(fakeHermes), { recursive: true });
    await writeFile(fakeHermes, process.platform === "win32"
      ? `@echo off\r\necho ${fakeOutput.replaceAll("\n", "\r\necho ")}\r\n`
      : `#!/bin/sh\ncat <<'EOF'\n${fakeOutput}\nEOF\n`);
    await chmod(fakeHermes, 0o755).catch(() => undefined);
    process.env.HERMES_COMMAND = fakeHermes;
    server = await startBridgeServer({
      port: Number(args.get("bridge-port") ?? 0),
      bridgeToken,
      bridgeCapabilityTokens,
      extensionOrigin: resonantExtensionOrigin,
      routes: bridgeRoutes,
    });
    const actualPort = bridgeServerPort(server, Number(args.get("bridge-port") ?? 0));
    const request = async (route, { method = "POST", body = {}, capabilityToken = "" } = {}) => {
      const response = await fetch(`http://127.0.0.1:${actualPort}${route}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Origin": resonantExtensionOrigin,
          "X-ResonantOS-Bridge-Token": bridgeToken,
          ...(capabilityToken ? { "X-ResonantOS-Bridge-Capability-Token": capabilityToken } : {}),
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`${route} failed: ${payload.error || response.status}`);
      }
      return payload;
    };
    await request("/addons/execution-settings", {
      body: { addon: "hermes", localCliExecution: true },
      capabilityToken: bridgeCapabilityTokens["addon-execution-settings-write"],
    });
    const created = await request("/addons/delegate", {
      body: {
        target: "hermes",
        mission: "Validate that enabled Hermes CLI execution produces a governed artifact.",
        contextMarkdown: "This is deterministic test context only.",
      },
    });
    const started = await request("/hermes/delegation/start", { body: { path: created.path } });
    const artifact = await request("/hermes/delegation/artifact", { body: { path: created.path } });
    const statusAfter = await request("/hermes/delegation/status", { body: { path: created.path } });
    const hermesStatus = await request("/hermes/status", { body: {} });
    const ok = (
      started.status === "completed" &&
      /adapter:\s*hermes-cli/i.test(artifact.content) &&
      statusAfter.status === "completed" &&
      statusAfter.resultArtifactPath &&
      hermesStatus.executionEnabled === true &&
      hermesStatus.mode === "local-hermes-cli" &&
      /Hermes CLI adapter completed/.test(artifact.finalSummary) &&
      /Parsed the ResonantOS task packet/.test(artifact.actionsTaken)
    );
    console.log(JSON.stringify({
      ok,
      adapter: /adapter:\s*hermes-cli/i.test(artifact.content) ? "hermes-cli" : "",
      artifactPath: artifact.path,
      hermesMode: hermesStatus.mode,
      statusAfter: statusAfter.status,
      summary: artifact.finalSummary,
    }, null, 2));
    exitCode = ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (previousUserRoot === undefined) {
      delete process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
    } else {
      process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = previousUserRoot;
    }
    if (previousHermesCommand === undefined) {
      delete process.env.HERMES_COMMAND;
    } else {
      process.env.HERMES_COMMAND = previousHermesCommand;
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(exitCode);
}

if (args.get("opencode-delegation-self-test") === "true") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resonantos-opencode-bridge-"));
  const previousUserRoot = process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
  const previousOpenCodeCommand = process.env.OPENCODE_COMMAND;
  process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = path.join(tempRoot, "ResonantOS_User");
  let server = null;
  let exitCode = 1;
  try {
    const fakeOpenCode = path.join(tempRoot, "bin", process.platform === "win32" ? "opencode.cmd" : "opencode");
    await mkdir(path.dirname(fakeOpenCode), { recursive: true });
    await writeFile(fakeOpenCode, process.platform === "win32" ? "@echo off\r\necho fake opencode\r\n" : "#!/bin/sh\necho fake opencode\n");
    await chmod(fakeOpenCode, 0o755).catch(() => undefined);
    process.env.OPENCODE_COMMAND = fakeOpenCode;
    server = await startBridgeServer({
      port: Number(args.get("bridge-port") ?? 0),
      bridgeToken,
      bridgeCapabilityTokens,
      extensionOrigin: resonantExtensionOrigin,
      routes: bridgeRoutes,
    });
    const actualPort = bridgeServerPort(server, Number(args.get("bridge-port") ?? 0));
    const request = async (route, body = {}) => {
      const response = await fetch(`http://127.0.0.1:${actualPort}${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": resonantExtensionOrigin,
          "X-ResonantOS-Bridge-Token": bridgeToken,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`${route} failed: ${payload.error || response.status}`);
      }
      return payload;
    };
    const created = await request("/addons/delegate", {
      target: "opencode",
      mission: "Inspect the deterministic OpenCode lifecycle test and return verification evidence.",
      contextMarkdown: "This is a bounded coding-task fixture; no real files should be edited.",
    });
    const gated = await request("/addons/delegate", {
      target: "opencode",
      mission: "Check that real OpenCode execution is gated unless explicitly enabled.",
    });
    const gatedStart = await request("/opencode/delegation/start", { path: gated.path });
    const statusBefore = await request("/opencode/delegation/status", { path: created.path });
    const started = await request("/opencode/delegation/start", { path: created.path, adapter: "deterministic" });
    const artifact = await request("/opencode/delegation/artifact", { path: created.path });
    const listed = await request("/addons/delegate/list", { target: "opencode", limit: 5 });
    const statusAfter = await request("/opencode/delegation/status", { path: created.path });
    const ok = (
      created.status === "queued" &&
      gatedStart.status === "blocked" &&
      /execution is disabled/i.test(gatedStart.blockedReason || "") &&
      statusBefore.status === "queued" &&
      started.status === "completed" &&
      /OpenCode coding delegation is ready for review/.test(artifact.finalSummary) &&
      listed.delegations.some((delegation) => delegation.id === created.id && delegation.status === "completed") &&
      Boolean(statusAfter.resultArtifactPath)
    );
    console.log(JSON.stringify({
      ok,
      artifactPath: artifact.path,
      created: created.id,
      gatedStatus: gatedStart.status,
      listed: listed.delegations.length,
      statusAfter: statusAfter.status,
    }, null, 2));
    exitCode = ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (previousUserRoot === undefined) {
      delete process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
    } else {
      process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = previousUserRoot;
    }
    if (previousOpenCodeCommand === undefined) {
      delete process.env.OPENCODE_COMMAND;
    } else {
      process.env.OPENCODE_COMMAND = previousOpenCodeCommand;
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(exitCode);
}

if (args.get("addon-execution-settings-self-test") === "true") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resonantos-addon-execution-bridge-"));
  const previousUserRoot = process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
  const previousHermesCommand = process.env.HERMES_COMMAND;
  const previousOpenCodeCommand = process.env.OPENCODE_COMMAND;
  process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = path.join(tempRoot, "ResonantOS_User");
  let server = null;
  let exitCode = 1;
  try {
    const binRoot = path.join(tempRoot, "bin");
    const fakeHermes = path.join(binRoot, process.platform === "win32" ? "hermes.cmd" : "hermes");
    const fakeOpenCode = path.join(binRoot, process.platform === "win32" ? "opencode.cmd" : "opencode");
    await mkdir(binRoot, { recursive: true });
    await writeFile(fakeHermes, process.platform === "win32" ? "@echo off\r\necho fake hermes\r\n" : "#!/bin/sh\necho fake hermes\n");
    await writeFile(fakeOpenCode, process.platform === "win32" ? "@echo off\r\necho fake opencode\r\n" : "#!/bin/sh\necho fake opencode\n");
    await chmod(fakeHermes, 0o755).catch(() => undefined);
    await chmod(fakeOpenCode, 0o755).catch(() => undefined);
    process.env.HERMES_COMMAND = fakeHermes;
    process.env.OPENCODE_COMMAND = fakeOpenCode;
    server = await startBridgeServer({
      port: Number(args.get("bridge-port") ?? 0),
      bridgeToken,
      bridgeCapabilityTokens,
      extensionOrigin: resonantExtensionOrigin,
      routes: bridgeRoutes,
    });
    const actualPort = bridgeServerPort(server, Number(args.get("bridge-port") ?? 0));
    const request = async (route, { method = "GET", body, capabilityToken } = {}) => {
      const response = await fetch(`http://127.0.0.1:${actualPort}${route}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Origin": resonantExtensionOrigin,
          "X-ResonantOS-Bridge-Token": bridgeToken,
          ...(capabilityToken ? { "X-ResonantOS-Bridge-Capability-Token": capabilityToken } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json();
      return { ok: response.ok, payload, status: response.status };
    };
    const initial = await request("/addons/execution-settings");
    const denied = await request("/addons/execution-settings", {
      method: "POST",
      body: { addon: "hermes", localCliExecution: true },
    });
    const hermesEnabled = await request("/addons/execution-settings", {
      method: "POST",
      capabilityToken: bridgeCapabilityTokens["addon-execution-settings-write"],
      body: { addon: "hermes", localCliExecution: true },
    });
    const opencodeEnabled = await request("/addons/execution-settings", {
      method: "POST",
      capabilityToken: bridgeCapabilityTokens["addon-execution-settings-write"],
      body: { addon: "opencode", localCliExecution: true },
    });
    const after = await request("/addons/execution-settings");
    const hermesStatus = await request("/hermes/status", { method: "POST", body: {} });
    const opencodeStatus = await request("/opencode/status");
    const addons = await request("/addons/status");
    const ok = (
      initial.ok &&
      initial.payload.settings.hermes.localCliExecution === false &&
      initial.payload.settings.opencode.localCliExecution === false &&
      denied.status === 403 &&
      hermesEnabled.payload.status === "enabled" &&
      opencodeEnabled.payload.status === "enabled" &&
      after.payload.settings.hermes.localCliExecution === true &&
      after.payload.settings.opencode.localCliExecution === true &&
      hermesStatus.payload.executionEnabled === true &&
      hermesStatus.payload.mode === "local-hermes-cli" &&
      opencodeStatus.payload.executionEnabled === true &&
      opencodeStatus.payload.mode === "local-opencode-cli" &&
      addons.payload.addons.some((addon) => addon.id === "addon.hermes" && addon.execution?.localCliExecution === true) &&
      addons.payload.addons.some((addon) => addon.id === "addon.opencode" && addon.execution?.localCliExecution === true)
    );
    console.log(JSON.stringify({
      ok,
      deniedStatus: denied.status,
      enabled: after.payload.settings.hermes.localCliExecution === true && after.payload.settings.opencode.localCliExecution === true,
      hermesMode: hermesStatus.payload.mode,
      opencodeMode: opencodeStatus.payload.mode,
      settings: after.payload.settings,
    }, null, 2));
    exitCode = ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (previousUserRoot === undefined) {
      delete process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
    } else {
      process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = previousUserRoot;
    }
    if (previousHermesCommand === undefined) {
      delete process.env.HERMES_COMMAND;
    } else {
      process.env.HERMES_COMMAND = previousHermesCommand;
    }
    if (previousOpenCodeCommand === undefined) {
      delete process.env.OPENCODE_COMMAND;
    } else {
      process.env.OPENCODE_COMMAND = previousOpenCodeCommand;
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(exitCode);
}

if (args.get("memory-source-move-self-test") === "true") {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resonantos-move-bridge-"));
  const previousUserRoot = process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
  process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = path.join(tempRoot, "ResonantOS_User");
  const source = path.join(tempRoot, "Human Vault");
  const bridgeCapabilityToken = bridgeCapabilityTokens["memory-source-move"];
  let server = null;
  let exitCode = 1;
  try {
    await mkdir(path.join(source, ".obsidian"), { recursive: true });
    await writeFile(path.join(source, "note.md"), "# Human note\n");
    await writeFile(path.join(source, ".obsidian", "app.json"), "{}\n");
    server = await startBridgeServer({
      port: Number(args.get("bridge-port") ?? 0),
      bridgeToken,
      bridgeCapabilityTokens,
      extensionOrigin: resonantExtensionOrigin,
      routes: bridgeRoutes,
    });
    const actualPort = bridgeServerPort(server, Number(args.get("bridge-port") ?? 0));
    const urlFor = (route) => `http://127.0.0.1:${actualPort}${route}`;
    const post = (route, body, capabilityToken = bridgeCapabilityToken) => fetch(urlFor(route), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ResonantOS-Bridge-Token": bridgeToken,
        ...(capabilityToken ? { "X-ResonantOS-Bridge-Capability-Token": capabilityToken } : {}),
      },
      body: JSON.stringify(body),
    });

    const unauthorizedCapability = await post("/memory/source/move-preflight", { path: source }, "");
    const preflightResponse = await post("/memory/source/move-preflight", {
      path: source,
      kind: "obsidian-vault",
      ownership: "human-knowledge",
    });
    const preflight = await preflightResponse.json();
    const executeResponse = await post("/memory/source/move-execute", {
      path: source,
      kind: "obsidian-vault",
      ownership: "human-knowledge",
      confirmation: preflight.confirmationPhrase,
    });
    const executed = await executeResponse.json();
    const movedNoteExists = existsSync(path.join(executed.destinationRoot ?? "", "note.md"));
    const sourceRemoved = !existsSync(source);
    const rollbackResponse = await post("/memory/source/move-rollback", {
      ledgerPath: executed.ledgerPath,
      confirmation: "ROLLBACK MOVE",
    });
    const rollback = await rollbackResponse.json();
    const outsideLedger = path.join(tempRoot, "outside-ledger.jsonl");
    await writeFile(outsideLedger, "");
    const outsideRollbackResponse = await post("/memory/source/move-rollback", {
      ledgerPath: outsideLedger,
      confirmation: "ROLLBACK MOVE",
    });
    const restoredNoteExists = existsSync(path.join(source, "note.md"));
    const settings = JSON.parse(await readFile(memorySettingsPath(), "utf8").catch(() => "{\"sources\":[]}"));
    const ok = unauthorizedCapability.status === 403 &&
      preflightResponse.ok &&
      preflight.ok &&
      preflight.okToMove === true &&
      preflight.hiddenFiles === 1 &&
      executeResponse.ok &&
      executed.ok &&
      executed.status === "moved" &&
      movedNoteExists &&
      sourceRemoved &&
      rollbackResponse.ok &&
      rollback.ok &&
      rollback.restoredCount === 2 &&
      outsideRollbackResponse.status === 500 &&
      restoredNoteExists &&
      !settings.sources?.some((sourceEntry) => path.resolve(sourceEntry.ledgerPath ?? "") === path.resolve(executed.ledgerPath));
    console.log(JSON.stringify({
      ok,
      unauthorizedCapabilityStatus: unauthorizedCapability.status,
      preflight: {
        ok: preflight.ok,
        okToMove: preflight.okToMove,
        fileCount: preflight.fileCount,
        hiddenFiles: preflight.hiddenFiles,
      },
      execute: {
        ok: executed.ok,
        status: executed.status,
        movedCount: executed.movedCount,
        sourceRemoved,
        movedNoteExists,
      },
      rollback: {
        ok: rollback.ok,
        restoredCount: rollback.restoredCount,
        restoredNoteExists,
        outsideLedgerStatus: outsideRollbackResponse.status,
      },
    }, null, 2));
    exitCode = ok ? 0 : 1;
  } finally {
    await new Promise((resolve) => server?.close?.(resolve) ?? resolve());
    if (previousUserRoot === undefined) {
      delete process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT;
    } else {
      process.env.RESONANTOS_BROWSER_FIRST_USER_ROOT = previousUserRoot;
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(exitCode);
}

const url = args.get("url") ?? defaultMainWorkspaceUrl;
const profileDir = path.resolve(args.get("profile") ?? process.env.RESONANTOS_BROWSER_FIRST_PROFILE ?? defaultProfile);
const autoOpenSidePanel = args.get("auto-open-side-panel") === "true";
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

const extensionDirs = [resonantExtension];
const phantomExtension = findPhantomExtension();
if (phantomExtension) {
  extensionDirs.push(phantomExtension);
}

await mkdir(profileDir, { recursive: true });
await removeCachedUnpackedExtension(profileDir, resonantExtensionId);
await clearResonantNewTabOverride(profileDir, resonantExtensionId);
await seedPinnedExtensions(profileDir, [resonantExtensionId, phantomExtension ? phantomExtensionId : null]);
const hostArgs = [
  "--resonantos-browser-first",
  `--url=${url}`,
  `--resonantos-user-data-dir=${profileDir}`,
  `--resonantos-extension-dirs=${extensionDirs.join(",")}`,
  ...(remoteDebuggingPort ? [`--resonantos-remote-debugging-port=${remoteDebuggingPort}`] : []),
];

const launchThroughMacAppBundle = process.platform === "darwin" && args.get("launch-mode") !== "direct";
console.log(JSON.stringify({
  event: "browser.first.launch_mode",
  mode: launchThroughMacAppBundle ? "mac-app-bundle" : "direct-native-host",
  appBundle: launchThroughMacAppBundle ? hostAppBundle : null,
  directHost: launchThroughMacAppBundle ? null : hostBinary,
}));

let bridgeInfo;
try {
  bridgeInfo = await startBridgeServerWithFallback({
    port: bridgePort,
    bridgeToken,
    bridgeCapabilityTokens,
    extensionOrigin: resonantExtensionOrigin,
    routes: bridgeRoutes,
  });
} catch (error) {
  console.error(JSON.stringify({
    event: "browser.first.bridge_failed",
    requestedPort: bridgePort,
    code: error?.code ?? "unknown",
    message: error instanceof Error ? error.message : String(error),
  }));
  throw error;
}
const bridgeServer = bridgeInfo.server;
const activeBridgePort = bridgeInfo.actualPort;
const bridgeConfigPath = await writeBridgeConfig({
  extensionRoot: resonantExtension,
  bridgePort: activeBridgePort,
  bridgeToken,
  bridgeCapabilityTokens,
});
console.log(JSON.stringify({
  event: "browser.first.bridge_started",
  requestedPort: bridgeInfo.requestedPort,
  attemptedPort: bridgeInfo.attemptedPort,
  actualPort: activeBridgePort,
  recovered: bridgeInfo.recovered,
}));

console.log("Launching ResonantOS Browser-First host");
console.log(JSON.stringify({ hostBinary, hostAppBundle, url, profileDir, extensionDirs, phantomLoaded: Boolean(phantomExtension), pinnedExtensions: [resonantExtensionId, phantomExtension ? phantomExtensionId : null].filter(Boolean), bridgeUrl: `http://127.0.0.1:${activeBridgePort}`, bridgeConfigPath, remoteDebuggingPort: remoteDebuggingPort ?? "ephemeral" }, null, 2));

function launchNativeHostDirect() {
  return spawn(hostBinary, hostArgs, {
    cwd: repoRoot,
    env: {
      ...process.env,
      RESONANTOS_NATIVE_DISABLE_APPKIT_MENU: "1",
    },
    stdio: "inherit",
  });
}

function launchNativeHostThroughAppBundle() {
  // Launch Services is required for the native AppKit menu bar to belong to
  // the browser app. Direct executable launch remains a fallback for restricted
  // shells where `open` is unavailable or blocked.
  return spawn("open", ["-W", "-n", hostAppBundle, "--args", ...hostArgs], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

let usedLaunchServicesFallback = false;
let child = launchThroughMacAppBundle ? launchNativeHostThroughAppBundle() : launchNativeHostDirect();

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

function attachHostExitHandler(hostProcess) {
  hostProcess.on("exit", (code, signal) => {
    if (launchThroughMacAppBundle && !usedLaunchServicesFallback && code !== 0 && !signal) {
      usedLaunchServicesFallback = true;
      console.warn(
        `Launch Services failed for ResonantOS Browser.app with code ${code}; falling back to direct native host launch.`,
      );
      child = launchNativeHostDirect();
      attachHostExitHandler(child);
      return;
    }

    bridgeServer.close();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

attachHostExitHandler(child);
