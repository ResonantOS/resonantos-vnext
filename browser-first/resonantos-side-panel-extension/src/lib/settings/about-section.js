import { metricCard, noteCard, settingsHeader } from "./settings-common.js";

function manifestValue(chromeApi, key, fallback) {
  try {
    const manifest = chromeApi?.runtime?.getManifest?.();
    return manifest?.[key] ?? fallback;
  } catch {
    return fallback;
  }
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
    noteCard({
      title: "Release discipline",
      body: "Core features should pass deterministic tests before release. Optional add-ons remain replaceable and should not become hidden dependencies of the base system."
    })
  );
}
