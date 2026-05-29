import { noteCard, setStatus, settingsHeader } from "./settings-common.js";

const defaults = {
  density: "comfortable",
  fontScale: "standard",
  motion: "full"
};

function option(value, text, selected) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = text;
  node.selected = selected;
  return node;
}

function applyAppearance(preferences = {}) {
  const next = { ...defaults, ...preferences };
  document.body.dataset.density = next.density;
  document.body.dataset.fontScale = next.fontScale;
  document.body.dataset.motion = next.motion;
  return next;
}

async function readPreferences(storage, key) {
  if (!storage || !key) return defaults;
  const result = await storage.get(key).catch(() => ({}));
  return { ...defaults, ...(result?.[key] ?? {}) };
}

export function renderAppearanceSection(container, { storage, storageKeys = {} }) {
  const key = storageKeys.appearance;
  const statusNode = document.createElement("p");
  statusNode.className = "settings-status";
  statusNode.textContent = "Loading appearance settings...";
  const form = document.createElement("form");
  form.className = "settings-routing-form";

  const density = document.createElement("select");
  density.name = "density";
  density.setAttribute("aria-label", "Interface density");
  density.append(
    option("comfortable", "Comfortable", true),
    option("compact", "Compact", false),
    option("touch", "Touch friendly", false)
  );
  const fontScale = document.createElement("select");
  fontScale.name = "fontScale";
  fontScale.setAttribute("aria-label", "Font scale");
  fontScale.append(
    option("small", "Small", false),
    option("standard", "Standard", true),
    option("large", "Large", false)
  );
  const motion = document.createElement("select");
  motion.name = "motion";
  motion.setAttribute("aria-label", "Motion preference");
  motion.append(
    option("full", "Full motion", true),
    option("reduced", "Reduced motion", false)
  );
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save Appearance";
  form.append(density, fontScale, motion, save);

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Appearance and accessibility",
      title: "Interface Preferences",
      body: "Tune the browser workspace for compact desktop use or larger touch-friendly controls without changing the underlying workflows."
    }),
    statusNode,
    noteCard({
      title: "Touch direction",
      body: "Touch-friendly density keeps the interface usable on tablets and touch screens. Compact density keeps the sidebar efficient for desktop power use."
    }),
    form
  );

  const load = async () => {
    const preferences = applyAppearance(await readPreferences(storage, key));
    density.value = preferences.density;
    fontScale.value = preferences.fontScale;
    motion.value = preferences.motion;
    setStatus(statusNode, `Using ${preferences.density} density, ${preferences.fontScale} font scale, ${preferences.motion} motion.`, "success");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    const preferences = applyAppearance({
      density: density.value,
      fontScale: fontScale.value,
      motion: motion.value
    });
    try {
      if (storage && key) {
        await storage.set({ [key]: preferences });
      }
      setStatus(statusNode, "Appearance settings saved.", "success");
    } finally {
      save.disabled = false;
    }
  });

  void load();
}

export const appearanceDefaults = defaults;
export const applyAppearancePreferences = applyAppearance;
