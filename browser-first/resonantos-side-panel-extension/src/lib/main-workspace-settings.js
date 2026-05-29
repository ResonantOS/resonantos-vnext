import { renderAddonsSection } from "./settings/addons-section.js";
import { renderAboutSection } from "./settings/about-section.js";
import { renderAppearanceSection } from "./settings/appearance-section.js";
import { renderBrowserControlSection } from "./settings/browser-control-section.js";
import { renderDiagnosticsSection } from "./settings/diagnostics-section.js";
import { renderMemorySection } from "./settings/memory-section.js";
import { renderOverviewSection } from "./settings/overview-section.js";
import { renderPrivacySection } from "./settings/privacy-section.js";
import { renderProvidersSection } from "./settings/providers-section.js";
import { renderRoutingSection } from "./settings/routing-section.js";
import { renderWorkSection } from "./settings/work-section.js";

const sections = [
  {
    id: "overview",
    label: "Overview",
    hint: "System health",
    render: renderOverviewSection
  },
  {
    id: "providers",
    label: "Providers",
    hint: "Models and credentials",
    render: renderProvidersSection
  },
  {
    id: "routing",
    label: "Routing",
    hint: "Cost and fallback",
    render: renderRoutingSection
  },
  {
    id: "work",
    label: "Chats & Projects",
    hint: "Archive and restore",
    render: renderWorkSection
  },
  {
    id: "memory",
    label: "Memory",
    hint: "Sources and sync",
    render: renderMemorySection
  },
  {
    id: "browser-control",
    label: "Browser Control",
    hint: "AI permissions",
    render: renderBrowserControlSection
  },
  {
    id: "addons",
    label: "Add-ons",
    hint: "Permissions",
    render: renderAddonsSection
  },
  {
    id: "privacy",
    label: "Privacy",
    hint: "Trust boundaries",
    render: renderPrivacySection
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    hint: "Logs and reports",
    render: renderDiagnosticsSection
  },
  {
    id: "appearance",
    label: "Appearance",
    hint: "Density and motion",
    render: renderAppearanceSection
  },
  {
    id: "about",
    label: "About",
    hint: "Version and architecture",
    render: renderAboutSection
  }
];

function sectionButton(section, activeId, onSelect) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-nav-item";
  button.dataset.section = section.id;
  button.dataset.active = String(section.id === activeId);
  const label = document.createElement("strong");
  label.textContent = section.label;
  const hint = document.createElement("span");
  hint.textContent = section.hint;
  button.append(label, hint);
  button.addEventListener("click", () => onSelect(section.id));
  return button;
}

export function renderSettingsWorkspace({
  container,
  bridgeRequest,
  chatSessionStore = null,
  onOpenSession = null,
  onRestore = null,
  chromeApi = null,
  sitePermissionStore = null,
  taskConsentStore = null,
  storage = null,
  storageKeys = {},
  initialSection = "overview"
}) {
  let activeId = sections.some((section) => section.id === initialSection) ? initialSection : "overview";
  const shell = document.createElement("section");
  shell.className = "settings-workspace";
  const nav = document.createElement("nav");
  nav.className = "settings-subnav";
  nav.setAttribute("aria-label", "Settings sections");
  const panel = document.createElement("div");
  panel.className = "settings-panel";

  const context = {
    bridgeRequest,
    chromeApi,
    chatSessionStore,
    onSelectSection: (nextId) => {
      if (!sections.some((section) => section.id === nextId) || nextId === activeId) return;
      activeId = nextId;
      renderActive();
    },
    onOpenSession,
    onRestore,
    sitePermissionStore,
    storage,
    storageKeys,
    taskConsentStore
  };

  const renderActive = () => {
    const activeSection = sections.find((section) => section.id === activeId) ?? sections[0];
    nav.replaceChildren(...sections.map((section) => sectionButton(section, activeId, (nextId) => {
      if (nextId === activeId) return;
      activeId = nextId;
      renderActive();
    })));
    activeSection.render(panel, { ...context, sectionId: activeSection.id });
  };

  shell.append(nav, panel);
  container.replaceChildren(shell);
  renderActive();
}
