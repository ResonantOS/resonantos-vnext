import { parseNaturalDelegationIntent } from "./app-command-handlers.js";
import {
  parseAutonomousBrowserActionIntent,
  parseNaturalBrowserIntent
} from "./browser-command-parser.js";

export const parseHermesSlashCommand = (value) => {
  const match = /^\/\s*hermes(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? (match[1] ?? "").trim() : null;
};

export const parseMemorySlashCommand = (value) => {
  const match = /^\/\s*(?:memory|archive)(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? (match[1] ?? "").trim() : null;
};

export const parseOpenCodeSlashCommand = (value) => {
  const match = /^\/\s*(?:opencode|open\s+code)(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? (match[1] ?? "").trim() : null;
};

export const parseDraftSlashCommand = (value) => {
  const match = /^\/\s*(email|calendar)(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  return match ? { target: match[1].toLowerCase(), body: (match[2] ?? "").trim() } : null;
};

export const parseWalletSlashCommand = (value) => {
  const match = /^\/\s*wallet(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  if (!match) return null;
  const body = (match[1] ?? "status").trim() || "status";
  return /^status$/i.test(body)
    ? { action: "status", goal: "" }
    : /^audit\b/i.test(body)
      ? { action: "audit", goal: body.replace(/^audit\b/i, "").trim() }
      : null;
};

export const parseDaoSlashCommand = (value) => {
  const match = /^\/\s*dao(?:\s+([\s\S]*))?$/i.exec(String(value ?? "").trim());
  if (!match) return null;
  const body = (match[1] ?? "").trim();
  return /^audit\b/i.test(body)
    ? { action: "audit", goal: body.replace(/^audit\b/i, "").trim() }
    : { action: "guide", goal: body };
};

export function planMainWorkspacePrompt(value) {
  const prompt = String(value ?? "").trim();
  if (!prompt) return { action: "empty" };
  const memoryQuery = parseMemorySlashCommand(prompt);
  if (memoryQuery !== null) return { action: "memory", query: memoryQuery };
  const openCodeMission = parseOpenCodeSlashCommand(prompt);
  if (openCodeMission !== null) return { action: "opencode", mission: openCodeMission };
  const hermesMission = parseHermesSlashCommand(prompt);
  if (hermesMission !== null) return { action: "hermes", mission: hermesMission };
  const naturalDelegation = parseNaturalDelegationIntent(prompt);
  if (naturalDelegation) return { action: "delegate", intent: naturalDelegation };
  const walletCommand = parseWalletSlashCommand(prompt);
  if (walletCommand) return { action: "wallet", command: walletCommand };
  const daoCommand = parseDaoSlashCommand(prompt);
  if (daoCommand) return { action: "dao", command: daoCommand };
  const draftCommand = parseDraftSlashCommand(prompt);
  if (draftCommand) return { action: "draft", command: draftCommand };
  if (parseAutonomousBrowserActionIntent(prompt) || parseNaturalBrowserIntent(prompt)) {
    return { action: "control" };
  }
  return { action: "chat" };
}
