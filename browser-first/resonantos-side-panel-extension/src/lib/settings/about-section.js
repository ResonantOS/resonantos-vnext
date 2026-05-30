import { metricCard, noteCard, settingsHeader } from "./settings-common.js";

function manifestValue(chromeApi, key, fallback) {
  try {
    const manifest = chromeApi?.runtime?.getManifest?.();
    return manifest?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function openBrowserTab(chromeApi, url) {
  return chromeApi?.tabs?.create?.({ url, active: true }).catch(() => undefined);
}

function browserToolsCard({ chromeApi }) {
  const card = noteCard({
    title: "Browser tools",
    body: "The Chromium attribution links are kept here so the main workspace stays clean. Use these only when you need extension details or Chromium appearance controls."
  });
  card.classList.add("settings-browser-tools");

  const actions = document.createElement("div");
  actions.className = "settings-inline-actions";

  const extensionDetails = document.createElement("button");
  extensionDetails.type = "button";
  extensionDetails.textContent = "ResonantOS Browser Layer";
  extensionDetails.addEventListener("click", () => {
    const extensionId = chromeApi?.runtime?.id;
    void openBrowserTab(chromeApi, extensionId ? `chrome://extensions/?id=${extensionId}` : "chrome://extensions");
  });

  const customizeChromium = document.createElement("button");
  customizeChromium.type = "button";
  customizeChromium.textContent = "Customize Chromium";
  customizeChromium.addEventListener("click", () => {
    void openBrowserTab(chromeApi, "chrome://settings/appearance");
  });

  actions.append(extensionDetails, customizeChromium);
  card.append(actions);
  return card;
}

export function renderAboutSection(container, { chromeApi } = {}) {
  const name = manifestValue(chromeApi, "name", "ResonantOS Browser Layer");
  const version = manifestValue(chromeApi, "version", "development");
  const grid = document.createElement("div");
  grid.className = "settings-health-grid";
  grid.append(
    metricCard({ label: "App", value: name, detail: "browser-first ResonantOS host surface" }),
    metricCard({ label: "Version", value: version, detail: "extension/package manifest version" }),
    metricCard({ label: "Architecture", value: "Browser-first", detail: "Chromium-family shell with ResonantOS side panel and main workspace" })
  );

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Version and architecture",
      title: "About ResonantOS",
      body: "This build treats the browser as the main operating surface and keeps ResonantOS capabilities inside governed workspaces, host routes, and extension UI."
    }),
    grid,
    browserToolsCard({ chromeApi }),
    noteCard({
      title: "Release discipline",
      body: "Core features should pass deterministic tests before release. Optional add-ons remain replaceable and should not become hidden dependencies of the base system."
    })
  );
}
