/**
 * update-check.mjs — Auto-update mechanism for ResonantOS Browser-First.
 * Compares the installed extension version against the published GitHub manifest.
 * ESM module, no external dependencies.
 */

const MANIFEST_URL =
  "https://raw.githubusercontent.com/ResonantOS/resonantos-vnext/browser-first-preview/browser-first/resonantos-side-panel-extension/manifest.json";

const DOWNLOAD_URL =
  "https://github.com/ResonantOS/resonantos-vnext/tree/browser-first-preview/browser-first/resonantos-side-panel-extension";

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * compareVersions(a, b) → negative if a < b, 0 if equal, positive if a > b.
 * Handles semver-style "MAJOR.MINOR.PATCH" strings.
 */
function compareVersions(a, b) {
  const parts = (v) =>
    String(v ?? "0")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [ap, bp] = [parts(a), parts(b)];
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const diff = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ── Public: checkForUpdate ────────────────────────────────────────────────────

/**
 * checkForUpdate(currentVersion)
 * → { updateAvailable: boolean, currentVersion, latestVersion, downloadUrl }
 *
 * Fetches the manifest.json from the canonical GitHub branch and compares the
 * `version` field against `currentVersion`. Throws on network/parse failure.
 *
 * @param {string} currentVersion — semver string of the installed extension
 */
export async function checkForUpdate(currentVersion) {
  const response = await fetch(MANIFEST_URL, {
    headers: {
      "User-Agent": "ResonantOS-BrowserFirst-UpdateCheck/1.0",
      Accept: "application/json",
    },
    // 8-second hard timeout so the bridge route never hangs.
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Update check failed with HTTP ${response.status}.`);
  }

  const manifest = await response.json().catch(() => ({}));
  const latestVersion = String(manifest?.version ?? "").trim();
  if (!latestVersion) {
    throw new Error("Could not read version from remote manifest.");
  }

  const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

  return {
    updateAvailable,
    currentVersion: String(currentVersion ?? ""),
    latestVersion,
    downloadUrl: DOWNLOAD_URL,
  };
}
