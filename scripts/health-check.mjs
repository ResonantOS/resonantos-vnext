#!/usr/bin/env node
/**
 * Health-check: validate local model/provider configuration in defaults.ts
 * without exposing secrets.
 *
 * Exports pure helpers for testing; when run directly it performs the full
 * check and prints a concise report to stdout.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DEFAULTS_PATH = join(REPO_ROOT, "src", "core", "defaults.ts");

// ---------------------------------------------------------------------------
// Known model identifiers already present in defaults.ts
// ---------------------------------------------------------------------------

const KNOWN_MODELS = [
  "MiniMax-M2.7",
  "MiniMax-M2.7-highspeed",
  "gpt-5.5",
  "gpt-5.4-mini",
  "batiai/gemma4-e2b:q4",
  "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
  "Qwen3.6-27B-Q4_K_M.gguf",
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Redact secret-like values.
 * If the key/name (lowercased) contains any of the listed substrings,
 * return a redacted form: first4chars...last4chars (or *** if too short).
 */
export function redactSecretValue(value, keyName) {
  if (typeof value !== "string" || !value) return value;
  const normalizedKey = String(keyName ?? "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const segments = normalizedKey.split(/[^a-z0-9]+/).filter(Boolean);
  const compact = segments.join("");
  const isSecret =
    compact.includes("apikey") ||
    segments.includes("password") ||
    segments.includes("secret") ||
    segments.includes("bearer") ||
    normalizedKey === "token" ||
    normalizedKey.endsWith("_token") ||
    normalizedKey === "credential" ||
    normalizedKey === "credentials";
  if (!isSecret) return value;
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

/**
 * Extract all URL-like strings from raw text that start with http:// or https://.
 */
export function extractProviderUrls(rawText) {
  const urlRegex = /https?:\/\/[^\s"'`,;)}\]]+/gi;
  const providerLineRegex = /\b(apiBaseUrl|endpoint|modelEndpoints)\b/;
  const matches = rawText
    .split("\n")
    .filter((line) => providerLineRegex.test(line))
    .flatMap((line) => line.match(urlRegex) || []);
  // Deduplicate while preserving order
  const seen = new Set();
  const unique = [];
  for (const url of matches) {
    if (!seen.has(url)) {
      seen.add(url);
      unique.push(url);
    }
  }
  return unique;
}

/**
 * Extract model identifiers from raw text by matching against known models.
 */
export function extractModelIdentifiers(rawText) {
  const found = new Set();
  for (const model of KNOWN_MODELS) {
    // Use word-boundary-like matching: the model string appears as a token
    // surrounded by non-alphanumeric chars or at string boundaries.
    const escaped = model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![a-zA-Z0-9_-])${escaped}(?![a-zA-Z0-9_-])`);
    if (re.test(rawText)) {
      found.add(model);
    }
  }
  return Array.from(found).sort();
}

/**
 * Parse the defaults.ts file and return a structured report object.
 * Throws on missing/unreadable file.
 */
export function parseDefaults(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  const rawText = readFileSync(filePath, "utf-8");
  const providerUrls = extractProviderUrls(rawText);
  const modelIdentifiers = extractModelIdentifiers(rawText);
  return {
    configPath: filePath,
    providerUrls,
    modelIdentifiers,
  };
}

// ---------------------------------------------------------------------------
// Main health-check logic
// ---------------------------------------------------------------------------

/**
 * Run the health check and print a human-readable report to stdout.
 * Exits 0 on success, 1 on failure.
 */
function runHealthCheck() {
  let report;
  try {
    report = parseDefaults(DEFAULTS_PATH);
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
  }

  const { configPath, providerUrls, modelIdentifiers } = report;

  // Validate: at least one valid provider URL must exist
  if (providerUrls.length === 0) {
    console.error("FAILED: No valid provider URLs found in defaults.ts");
    process.exit(1);
  }

  // Print concise report
  console.log("=== Health Check Report ===");
  console.log(`Config file : ${configPath}`);
  console.log(`Provider URLs found: ${providerUrls.length}`);
  for (const url of providerUrls) {
    console.log(`  - ${url}`);
  }
  console.log(`Model identifiers found: ${modelIdentifiers.length}`);
  for (const model of modelIdentifiers) {
    console.log(`  - ${model}`);
  }

  // Check for any secret-like values in the file and redact them in output
  const secretKeys = [
    "api_key",
    "apikey",
    "token",
    "password",
    "secret",
    "bearer",
    "credential",
  ];
  const lines = readFileSync(DEFAULTS_PATH, "utf-8").split("\n");
  let hasSecrets = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (secretKeys.some((k) => lower.includes(k))) {
      // Extract key-value pairs from the line
      const kvMatch = line.match(/(["']?)(\w+)\1\s*[:=]\s*["']?([^"'\s,}\]]+)/);
      if (kvMatch) {
        const keyName = kvMatch[2];
        const value = kvMatch[3];
        const redacted = redactSecretValue(value, keyName);
        if (redacted !== value) {
          hasSecrets = true;
          console.log(`  [redacted] ${keyName}: ${redacted}`);
        }
      }
    }
  }

  if (hasSecrets) {
    console.log("\nNote: Secret-like values above are redacted.");
  }

  console.log("\nStatus: OK");
  process.exit(0);
}

/**
 * Run the health check and output a single JSON object to stdout.
 * On success: status "ok", providerUrls, modelIds, counts.
 * On failure: status "error", message with error description.
 * Exits 0 on success, 1 on failure.
 */
function runHealthCheckJson() {
  let report;
  try {
    report = parseDefaults(DEFAULTS_PATH);
  } catch (err) {
    const errorJson = JSON.stringify({
      status: "error",
      message: err.message,
    });
    console.log(errorJson);
    process.exit(1);
  }

  const { providerUrls, modelIdentifiers } = report;

  // Validate: at least one valid provider URL must exist
  if (providerUrls.length === 0) {
    const errorJson = JSON.stringify({
      status: "error",
      message: "No valid provider URLs found in defaults.ts",
    });
    console.log(errorJson);
    process.exit(1);
  }

  const result = JSON.stringify({
    status: "ok",
    providerUrls,
    modelIds: modelIdentifiers,
    counts: {
      providerUrls: providerUrls.length,
      modelIds: modelIdentifiers.length,
    },
  });
  console.log(result);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const jsonFlag = process.argv.includes("--json");
  if (jsonFlag) {
    runHealthCheckJson();
  } else {
    runHealthCheck();
  }
}
