/**
 * audit-trail.mjs — Wallet approval audit trail for ResonantOS Browser-First.
 * Appends JSONL entries to ~/ResonantOS_User/Logs/wallet-audit.jsonl.
 * ESM module, no external dependencies.
 */

import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";

// ── Path helpers ──────────────────────────────────────────────────────────────

function logsDir() {
  return path.join(os.homedir(), "ResonantOS_User", "Logs");
}

function auditLogPath() {
  return path.join(logsDir(), "wallet-audit.jsonl");
}

// ── Public: logWalletAction ───────────────────────────────────────────────────

/**
 * logWalletAction({ action, pageUrl, walletAddress, approved, timestamp, details })
 * Appends one JSON line to the audit log. Creates the file/directory if needed.
 *
 * @param {object} opts
 * @param {string}  opts.action        — e.g. "wallet_connect", "wallet_sign"
 * @param {string}  [opts.pageUrl]     — originating page URL
 * @param {string}  [opts.walletAddress] — wallet public key / address
 * @param {boolean} [opts.approved]    — whether the action was approved or denied
 * @param {string}  [opts.timestamp]   — ISO-8601; defaults to now
 * @param {object}  [opts.details]     — any additional metadata
 */
export async function logWalletAction({
  action,
  pageUrl,
  walletAddress,
  approved,
  timestamp,
  details,
} = {}) {
  const entry = {
    action: String(action ?? "unknown"),
    pageUrl: pageUrl ?? null,
    walletAddress: walletAddress ?? null,
    approved: Boolean(approved),
    timestamp: timestamp ?? new Date().toISOString(),
    details: details && typeof details === "object" ? details : {},
  };

  await mkdir(logsDir(), { recursive: true });
  await appendFile(auditLogPath(), `${JSON.stringify(entry)}\n`);
  return entry;
}

// ── Public: getRecentActions ──────────────────────────────────────────────────

/**
 * getRecentActions(limit) → Array of the most recent audit entries, newest first.
 */
export async function getRecentActions(limit = 20) {
  const logPath = auditLogPath();
  if (!existsSync(logPath)) return [];

  const content = await readFile(logPath, "utf8").catch(() => "");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines
    .slice(-Number(limit))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse(); // newest first
}
