const controlRefAttribute = "data-resonantos-control-ref";
const inlineAssistantId = "resonantos-inline-assistant";
const inlineButtonId = "resonantos-inline-button";
const controlOverlayId = "resonantos-control-overlay";
const controlToastId = "resonantos-control-toast";
let nextControlRef = 1;

const ensureControlRef = (element) => {
  if (!element?.getAttribute) return "";
  const existing = element.getAttribute(controlRefAttribute);
  if (existing) return existing;
  const ref = `r${nextControlRef}`;
  nextControlRef += 1;
  element.setAttribute(controlRefAttribute, ref);
  return ref;
};

const elementByControlRef = (ref) => {
  const normalized = String(ref ?? "").trim();
  if (!normalized) return null;
  return document.querySelector(`[${controlRefAttribute}="${CSS.escape(normalized)}"]`);
};

const pageSnapshot = () => ({
  title: document.title,
  url: location.href,
  frame: {
    isTop: window.top === window,
    referrer: document.referrer || ""
  },
  text: document.body?.innerText?.slice(0, 12000) ?? "",
  iframes: Array.from(document.querySelectorAll("iframe"))
    .slice(0, 20)
    .map((frame) => ({
      title: frame.getAttribute("title") || frame.getAttribute("aria-label") || "",
      src: frame.src || "",
      width: frame.width || frame.getBoundingClientRect().width,
      height: frame.height || frame.getBoundingClientRect().height
    })),
  viewport: {
    scrollY: Math.round(window.scrollY),
    innerHeight: Math.round(window.innerHeight),
    maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  },
  links: Array.from(document.querySelectorAll("a[href]"))
    .slice(0, 80)
    .map((link) => ({
      text: link.textContent?.trim().slice(0, 160) ?? "",
      href: link.href
    })),
  controls: candidateClickElements()
    .slice(0, 80)
    .map((element) => ({
      ref: ensureControlRef(element),
      text: visibleText(element).slice(0, 160),
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      approvalRequired: isSubmitLikeElement(element)
    })),
  fields: Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"))
    .slice(0, 80)
    .map((element) => describeEditable(element)),
  walletProviders: {
    phantomSolana: Boolean(globalThis.phantom?.solana?.isPhantom || globalThis.solana?.isPhantom)
  }
});

const ensureControlOverlay = () => {
  if (!document.getElementById("resonantos-control-overlay-styles")) {
    const style = document.createElement("style");
    style.id = "resonantos-control-overlay-styles";
    style.textContent = `
      #${controlOverlayId}, #${controlToastId} { all: initial; color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; z-index: 2147483646; pointer-events: none; }
      #${controlOverlayId} { position: fixed; inset: 0; display: none; border: 4px solid rgba(36,209,143,.98); box-shadow: inset 0 0 118px rgba(36,209,143,.38), inset 0 0 220px rgba(36,209,143,.22), 0 0 86px rgba(36,209,143,.42); background:
        radial-gradient(circle at 12% 18%, rgba(36,209,143,.25), transparent 30%),
        radial-gradient(circle at 88% 82%, rgba(36,209,143,.22), transparent 32%),
        linear-gradient(90deg, rgba(36,209,143,.38), transparent 18%, transparent 82%, rgba(36,209,143,.38)),
        linear-gradient(0deg, rgba(36,209,143,.34), transparent 20%, transparent 80%, rgba(36,209,143,.34)),
        repeating-linear-gradient(90deg, rgba(36,209,143,.16) 0 3px, transparent 3px 13px),
        repeating-linear-gradient(0deg, rgba(36,209,143,.12) 0 2px, transparent 2px 15px); opacity: .98; }
      #${controlOverlayId}[data-state="active"], #${controlOverlayId}[data-session="active"] { display:block; animation: ros-control-wave 1.7s steps(18) infinite, ros-control-pixel 3.4s linear infinite; }
      #${controlOverlayId}[data-state="done"] { display:block; border-color: rgba(117,255,187,.72); animation: ros-control-fade .8s ease-out forwards; }
      #${controlOverlayId}[data-state="blocked"] { display:block; border-color: rgba(255,121,91,.9); box-shadow: inset 0 0 46px rgba(255,121,91,.16), 0 0 40px rgba(255,121,91,.2); animation: ros-control-fade 1.1s ease-out forwards; }
      #${controlOverlayId}::before, #${controlOverlayId}::after { content:""; position:absolute; left:-35%; right:-35%; height:76px; background: linear-gradient(90deg, transparent, rgba(36,209,143,.22), rgba(36,209,143,.88), rgba(36,209,143,.22), transparent); filter: blur(1.2px); }
      #${controlOverlayId}::before { top:0; box-shadow: 0 42px 90px rgba(36,209,143,.22); }
      #${controlOverlayId}::after { bottom:0; box-shadow: 0 -42px 90px rgba(36,209,143,.22); }
      #${controlOverlayId} .ros-control-left, #${controlOverlayId} .ros-control-right { position:absolute; top:-25%; bottom:-25%; width:92px; background: linear-gradient(180deg, transparent, rgba(36,209,143,.78), transparent); filter: blur(1.4px); opacity:.9; }
      #${controlOverlayId} .ros-control-left { left:0; }
      #${controlOverlayId} .ros-control-right { right:0; }
      #${controlOverlayId}[data-session="active"] .ros-control-left { animation: ros-control-side 1.9s linear infinite; }
      #${controlOverlayId}[data-session="active"] .ros-control-right { animation: ros-control-side 1.9s linear infinite reverse; }
      #${controlOverlayId}[data-session="active"]::before { animation: ros-control-edge 1.6s linear infinite; }
      #${controlOverlayId}[data-session="active"]::after { animation: ros-control-edge 1.6s linear infinite reverse; }
      #${controlToastId} { position: fixed; left: 50%; bottom: 18px; display:none; max-width: min(520px, calc(100vw - 28px)); transform: translateX(-50%); border: 1px solid rgba(36,209,143,.38); border-radius: 999px; background: rgba(4,12,8,.92); color:#dfffea; box-shadow: 0 18px 58px rgba(0,0,0,.38); font: 800 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 10px 14px; text-align:center; }
      #${controlToastId}[data-state="active"], #${controlToastId}[data-state="done"], #${controlToastId}[data-state="blocked"] { display:block; }
      #${controlToastId}[data-state="blocked"] { border-color: rgba(255,121,91,.5); color:#ffd9d1; }
      .resonantos-control-target { outline: 2px solid rgba(36,209,143,.9) !important; outline-offset: 4px !important; box-shadow: 0 0 0 6px rgba(36,209,143,.16), 0 0 34px rgba(36,209,143,.38) !important; }
      @keyframes ros-control-wave { 0% { clip-path: polygon(0 0,100% 0,100% 100%,0 100%); filter: brightness(1); } 50% { filter: brightness(1.48) saturate(1.24); } 100% { filter: brightness(1); } }
      @keyframes ros-control-pixel { 0% { background-position: 0 0, 0 0; } 100% { background-position: 44px 0, 0 52px; } }
      @keyframes ros-control-edge { 0% { transform: translateX(-18%); opacity:.28; } 45% { opacity:1; } 100% { transform: translateX(18%); opacity:.28; } }
      @keyframes ros-control-side { 0% { transform: translateY(-18%); opacity:.32; } 45% { opacity:1; } 100% { transform: translateY(18%); opacity:.32; } }
      @keyframes ros-control-fade { 0% { opacity:.9; } 100% { opacity:0; } }
    `;
    document.documentElement.append(style);
  }
  let overlay = document.getElementById(controlOverlayId);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = controlOverlayId;
    overlay.innerHTML = `<span class="ros-control-left"></span><span class="ros-control-right"></span>`;
    document.documentElement.append(overlay);
  }
  let toast = document.getElementById(controlToastId);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = controlToastId;
    document.documentElement.append(toast);
  }
  return { overlay, toast };
};

const pulseControlOverlay = ({ state = "active", label = "Augmentor is operating this page", target = null } = {}) => {
  const { overlay, toast } = ensureControlOverlay();
  const now = Date.now();
  if (!target && state === "active" && Number(toast.dataset.lockedUntil || 0) > now) {
    return;
  }
  const sessionActive = overlay.dataset.session === "active";
  overlay.dataset.state = sessionActive && state !== "blocked" ? "active" : state;
  toast.dataset.state = state;
  toast.textContent = label;
  document.querySelectorAll(".resonantos-control-target").forEach((element) => element.classList.remove("resonantos-control-target"));
  if (target?.classList) {
    target.classList.add("resonantos-control-target");
    toast.dataset.lockedUntil = String(now + 1800);
    window.setTimeout(() => target.classList.remove("resonantos-control-target"), 1500);
  }
  if (state !== "active") {
    window.setTimeout(() => {
      if (overlay.dataset.state === state || overlay.dataset.session === "active") overlay.dataset.state = overlay.dataset.session === "active" ? "active" : "";
      if (toast.dataset.state === state) {
        if (toast.dataset.session === "active") {
          toast.dataset.state = "active";
          toast.textContent = toast.dataset.sessionLabel || "Augmentor is operating this page";
        } else {
          toast.dataset.state = "";
        }
      }
    }, 1300);
  }
};

const setControlSessionOverlay = ({ active = false, label = "Augmentor is operating this page" } = {}) => {
  const { overlay, toast } = ensureControlOverlay();
  window.clearTimeout(globalThis.__resonantosControlStopTimer);
  if (active) {
    overlay.dataset.session = "active";
    overlay.dataset.state = "active";
    toast.dataset.session = "active";
    toast.dataset.sessionLabel = label;
    toast.dataset.state = "active";
    toast.textContent = label;
    return { ok: true, active };
  }
  toast.textContent = "Returning control to human...";
  toast.dataset.state = "active";
  globalThis.__resonantosControlStopTimer = window.setTimeout(() => {
    overlay.dataset.session = "";
    overlay.dataset.state = "";
    toast.dataset.session = "";
    toast.dataset.sessionLabel = "";
    toast.dataset.state = "";
    toast.textContent = "";
    toast.dataset.lockedUntil = "0";
    document.querySelectorAll(".resonantos-control-target").forEach((element) => element.classList.remove("resonantos-control-target"));
  }, 6500);
  return { ok: true, active };
};

const describeForms = () => ({
  forms: Array.from(document.querySelectorAll("form"))
    .slice(0, 20)
    .map((form, index) => ({
      index,
      id: form.id || "",
      name: form.getAttribute("name") || "",
      action: form.action || "",
      method: form.method || "get",
      fields: Array.from(form.querySelectorAll("input, textarea, select, [contenteditable='true']"))
        .slice(0, 40)
        .map((field) => describeEditable(field))
    })),
  looseFields: Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"))
    .filter((field) => !field.closest("form"))
    .slice(0, 40)
    .map((field) => describeEditable(field))
});

const visibleText = (element) => (element.innerText || element.textContent || element.getAttribute("aria-label") || element.value || "").trim();

const candidateClickElements = () => [
  ...document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit'], summary, [onclick]")
];

const isSubmitLikeElement = (element) => {
  const type = String(element.getAttribute("type") || "").toLowerCase();
  const role = String(element.getAttribute("role") || "").toLowerCase();
  const text = visibleText(element).toLowerCase();
  return type === "submit" ||
    (element instanceof HTMLButtonElement && (!type || type === "submit") && Boolean(element.closest("form"))) ||
    (role === "button" && Boolean(element.closest("form")) && /\b(submit|send|post|publish|save|share|buy|pay|confirm|connect|sign)\b/i.test(text));
};

const isHardRestrictedElement = (element, fallbackText = "") => {
  const text = [
    visibleText(element),
    element?.getAttribute?.("aria-label"),
    element?.id,
    element?.className,
    fallbackText
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(wallet|phantom|sign|signature|approve|connect wallet|buy|sell|swap|stake|unstake|bridge|mint|claim|pay|payment|checkout|login|credential|password|transfer)\b/i.test(text);
};

const clickElement = (element, { userApproved = false, fallbackText = "" } = {}) => {
  pulseControlOverlay({ state: "active", label: `Clicking ${visibleText(element) || fallbackText}`, target: element });
  if (isHardRestrictedElement(element, fallbackText)) {
    pulseControlOverlay({ state: "blocked", label: "Blocked: human-only action", target: element });
    return {
      ok: false,
      approvalRequired: true,
      deniedToAutomation: true,
      error: `Clicking "${visibleText(element) || fallbackText}" crosses a wallet/payment/login/credential boundary and must be completed by the human.`
    };
  }
  if (isSubmitLikeElement(element) && !userApproved) {
    pulseControlOverlay({ state: "blocked", label: "Approval required for public action", target: element });
    return {
      ok: false,
      approvalRequired: true,
      deniedToAutomation: true,
      error: `Clicking "${visibleText(element) || fallbackText}" looks like a submit/public action and requires human approval.`
    };
  }
  element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  const rect = element.getBoundingClientRect();
  const eventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2)
  };
  for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const EventConstructor = eventName.startsWith("pointer") ? PointerEvent : MouseEvent;
    element.dispatchEvent(new EventConstructor(eventName, eventOptions));
  }
  element.click();
  pulseControlOverlay({ state: "done", label: `Clicked ${visibleText(element).slice(0, 80) || fallbackText}`, target: element });
  return {
    ok: true,
    ref: ensureControlRef(element),
    clickedText: visibleText(element).slice(0, 180),
    tagName: element.tagName.toLowerCase()
  };
};

const clickVisibleText = (targetText, { userApproved = false } = {}) => {
  const needle = String(targetText ?? "").trim().toLowerCase();
  if (!needle) {
    return { ok: false, error: "No click target text was provided." };
  }
  const element = candidateClickElements().find((candidate) => visibleText(candidate).toLowerCase().includes(needle));
  if (!element) {
    return { ok: false, error: `No visible clickable element matched "${targetText}".` };
  }
  return clickElement(element, { userApproved, fallbackText: targetText });
};

const clickControlRef = (ref, { userApproved = false } = {}) => {
  const element = elementByControlRef(ref);
  if (!element) {
    return { ok: false, error: `No clickable element matched ref "${ref}".` };
  }
  return clickElement(element, { userApproved, fallbackText: ref });
};

const editableCandidates = () => [
  document.activeElement,
  document.querySelector("textarea[name='q']"),
  document.querySelector("input[name='q']"),
  document.querySelector("input[type='search']"),
  document.querySelector("textarea"),
  document.querySelector("input[type='text']"),
  document.querySelector("input:not([type]), input[type='email'], input[type='url'], input[type='tel'], input[type='number']"),
  document.querySelector("[contenteditable='true']")
].filter(Boolean);

const isEditable = (element) =>
  ((element instanceof HTMLInputElement && !["button", "checkbox", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(element.type)) ||
    element instanceof HTMLTextAreaElement ||
    element?.isContentEditable) &&
  !element.disabled &&
  !element.readOnly;

const describeEditable = (element) => ({
  ref: ensureControlRef(element),
  tagName: element.tagName.toLowerCase(),
  type: element.getAttribute("type") || "",
  name: element.getAttribute("name") || "",
  id: element.id || "",
  role: element.getAttribute("role") || "",
  label: element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.getAttribute("title") || "",
  valuePreview: "value" in element ? String(element.value || "").slice(0, 120) : String(element.textContent || "").slice(0, 120)
});

const editableLabel = (element) => [
  element.getAttribute("aria-label"),
  element.getAttribute("placeholder"),
  element.getAttribute("title"),
  element.getAttribute("name"),
  element.id,
  element.textContent
].filter(Boolean).join(" ").toLowerCase();

const findEditableTarget = (field, ref = "") => {
  const refTarget = elementByControlRef(ref);
  if (refTarget && isEditable(refTarget)) {
    return refTarget;
  }
  const candidates = editableCandidates().filter(isEditable);
  const needle = String(field ?? "").trim().toLowerCase();
  if (!needle) {
    return candidates[0] ?? null;
  }
  return candidates.find((element) => editableLabel(element).includes(needle)) ?? null;
};

const isSearchLikeEditable = (element) => {
  const haystack = [
    element.getAttribute("type"),
    element.getAttribute("name"),
    element.getAttribute("role"),
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.id
  ].join(" ").toLowerCase();
  return /\b(search|query|q|find)\b/.test(haystack);
};

const setNativeValue = (element, value) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(element, value);
  } else if (element?.isContentEditable) {
    element.textContent = value;
  }
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const typeIntoPage = ({ text, field = "", ref = "", submit = false, userApproved = false } = {}) => {
  const value = String(text ?? "").trim();
  if (!value) {
    return { ok: false, error: "No text was provided for typing." };
  }
  const element = findEditableTarget(field, ref);
  if (!element) {
    return { ok: false, error: "No editable field was found on this page." };
  }
  pulseControlOverlay({ state: "active", label: `Typing into ${field || visibleText(element) || element.getAttribute("aria-label") || "field"}`, target: element });
  element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  element.focus();
  setNativeValue(element, value);
  if (submit) {
    if (!isSearchLikeEditable(element) && !userApproved) {
      pulseControlOverlay({ state: "blocked", label: "Approval required to submit this field", target: element });
      return {
        ok: false,
        approvalRequired: true,
        deniedToAutomation: true,
        error: "Submitting a non-search field requires human approval."
      };
    }
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    element.form?.requestSubmit?.();
  }
  pulseControlOverlay({ state: "done", label: `Typed ${value.slice(0, 80)}`, target: element });
  return {
    ok: true,
    ref: ensureControlRef(element),
    typedText: value,
    submitted: Boolean(submit),
    tagName: element.tagName.toLowerCase(),
    fieldName: element.getAttribute("name") || element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.id || ""
  };
};

const scrollPage = ({ direction = "down", amount = 720 } = {}) => {
  pulseControlOverlay({ state: "active", label: `Scrolling ${direction}` });
  const normalized = String(direction || "down").toLowerCase();
  const viewport = Math.max(320, window.innerHeight || 720);
  const magnitude = Math.max(120, Math.min(4000, Number(amount) || viewport));
  let deltaY = magnitude;
  if (normalized === "up") deltaY = -magnitude;
  if (normalized === "top") deltaY = -document.documentElement.scrollHeight;
  if (normalized === "bottom") deltaY = document.documentElement.scrollHeight;
  window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
  pulseControlOverlay({ state: "done", label: `Scrolled ${normalized}` });
  return {
    ok: true,
    direction: normalized,
    scrollY: Math.round(window.scrollY),
    maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  };
};

const inlineStyles = `
  #${inlineButtonId}, #${inlineAssistantId} { all: initial; color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; z-index: 2147483647; }
  #${inlineButtonId} { position: fixed; display: none; border: 1px solid rgba(36,209,143,.42); border-radius: 999px; background: rgba(5, 12, 9, .94); color: #eafff4; box-shadow: 0 16px 44px rgba(0,0,0,.32); padding: 8px 10px; font: 700 12px/1 ui-sans-serif, system-ui; cursor: pointer; }
  #${inlineAssistantId} { position: fixed; display: none; width: min(390px, calc(100vw - 24px)); max-height: min(460px, calc(100vh - 24px)); overflow: auto; border: 1px solid rgba(36,209,143,.28); border-radius: 18px; background: linear-gradient(145deg, rgba(8,20,14,.98), rgba(4,8,7,.98)); color: #effaf2; box-shadow: 0 28px 90px rgba(0,0,0,.42); padding: 12px; }
  #${inlineAssistantId} .ros-inline-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
  #${inlineAssistantId} strong { font: 800 13px/1.2 ui-sans-serif, system-ui; color:#effaf2; }
  #${inlineAssistantId} textarea { all: unset; display:block; box-sizing:border-box; width:100%; min-height:54px; margin: 0 0 9px; border:1px solid rgba(255,255,255,.09); border-radius:12px; background: rgba(255,255,255,.045); color:#effaf2; font: 12px/1.38 ui-sans-serif, system-ui; padding:9px; white-space:pre-wrap; }
  #${inlineAssistantId} button { all: unset; border-radius: 999px; color: #b9cbc0; cursor: pointer; font: 800 11px/1 ui-sans-serif, system-ui; padding: 7px 9px; }
  #${inlineAssistantId} button:hover { background: rgba(255,255,255,.08); color:#fff; }
  #${inlineAssistantId} .ros-inline-actions { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
  #${inlineAssistantId} .ros-inline-result { white-space: pre-wrap; color:#dce9df; font: 12px/1.45 ui-sans-serif, system-ui; background: rgba(255,255,255,.045); border-radius: 12px; padding: 10px; }
`;

const ensureInlineAssistantUi = () => {
  if (!document.getElementById("resonantos-inline-styles")) {
    const style = document.createElement("style");
    style.id = "resonantos-inline-styles";
    style.textContent = inlineStyles;
    document.documentElement.append(style);
  }
  let button = document.getElementById(inlineButtonId);
  if (!button) {
    button = document.createElement("button");
    button.id = inlineButtonId;
    button.type = "button";
    button.textContent = "Augmentor";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => showInlinePanel("summarize"));
    document.documentElement.append(button);
  }
  let panel = document.getElementById(inlineAssistantId);
  if (!panel) {
    panel = document.createElement("section");
    panel.id = inlineAssistantId;
    panel.innerHTML = `
      <div class="ros-inline-head">
        <strong>Augmentor Inline</strong>
        <button type="button" data-action="close">Close</button>
      </div>
      <textarea class="ros-inline-prompt" placeholder="Optional custom instruction for the selected text"></textarea>
      <div class="ros-inline-actions">
        <button type="button" data-action="custom">Ask</button>
        <button type="button" data-action="summarize">Summarize</button>
        <button type="button" data-action="explain">Explain</button>
        <button type="button" data-action="fact-check">Fact-check</button>
        <button type="button" data-action="translate">Translate</button>
        <button type="button" data-action="rewrite">Rewrite</button>
        <button type="button" data-action="send">Send to side panel</button>
        <button type="button" data-action="insert">Insert</button>
      </div>
      <div class="ros-inline-result">Select text, then choose an action.</div>
    `;
    panel.addEventListener("mousedown", (event) => event.preventDefault());
    panel.addEventListener("click", (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === "close") {
        panel.style.display = "none";
        return;
      }
      void runInlineAction(action);
    });
    document.documentElement.append(panel);
  }
  return { button, panel };
};

const currentSelectionDetails = () => {
  const selection = window.getSelection();
  const text = selection?.toString?.().trim() ?? "";
  if (!text) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const active = document.activeElement;
  return {
    text,
    rect,
    editable: Boolean(active && isEditable(active)),
    activeRef: active && isEditable(active) ? ensureControlRef(active) : ""
  };
};

const currentSitePermission = async () => {
  const key = location.hostname.replace(/^www\./, "");
  const stored = await chrome.storage?.local?.get?.("augmentorSitePermissions").catch(() => ({}));
  return stored?.augmentorSitePermissions?.[key] ?? "ask-before-action";
};

const positionInlineButton = () => {
  void currentSitePermission().then((mode) => {
    if (mode === "blocked") {
      const { button, panel } = ensureInlineAssistantUi();
      button.style.display = "none";
      panel.style.display = "none";
      return;
    }
    const details = currentSelectionDetails();
    const { button } = ensureInlineAssistantUi();
    if (!details || details.text.length < 2 || details.rect.width === 0) {
      button.style.display = "none";
      return;
    }
    button.style.left = `${Math.min(window.innerWidth - 112, Math.max(8, details.rect.left))}px`;
    button.style.top = `${Math.min(window.innerHeight - 42, Math.max(8, details.rect.bottom + 8))}px`;
    button.style.display = "block";
  });
};

const positionInlineButtonSync = () => {
  const details = currentSelectionDetails();
  const { button } = ensureInlineAssistantUi();
  if (!details || details.text.length < 2 || details.rect.width === 0) {
    button.style.display = "none";
    return;
  }
  button.style.left = `${Math.min(window.innerWidth - 112, Math.max(8, details.rect.left))}px`;
  button.style.top = `${Math.min(window.innerHeight - 42, Math.max(8, details.rect.bottom + 8))}px`;
  button.style.display = "block";
};

const showInlinePanel = (initialAction = "summarize") => {
  const details = currentSelectionDetails();
  const { panel, button } = ensureInlineAssistantUi();
  if (!details) return;
  panel.dataset.selection = details.text;
  panel.dataset.activeRef = details.activeRef;
  panel.style.left = button.style.left || "12px";
  panel.style.top = `${Math.min(window.innerHeight - 220, Math.max(8, details.rect.bottom + 12))}px`;
  panel.style.display = "block";
  void runInlineAction(initialAction);
};

const localInlineResult = (action, text) => {
  const clipped = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 800);
  if (action === "custom") return `Apply the custom instruction to this selected text:\n${clipped}`;
  if (action === "rewrite") return clipped.replace(/\bteh\b/gi, "the").replace(/\bi\b/g, "I");
  if (action === "fact-check") return `Fact-check this claim with primary sources before relying on it:\n${clipped}`;
  if (action === "translate") return `Translation requires the configured model. Selected text:\n${clipped}`;
  if (action === "explain") return `Explanation:\n${clipped}`;
  return `Summary:\n${clipped}`;
};

const runInlineAction = async (action) => {
  const { panel } = ensureInlineAssistantUi();
  const result = panel.querySelector(".ros-inline-result");
  const selection = panel.dataset.selection || currentSelectionDetails()?.text || "";
  if (!selection) {
    result.textContent = "No selected text is available.";
    return;
  }
  if (action === "send") {
    await chrome.storage?.local?.set?.({
      augmentorInlineDraft: {
        selection,
        url: location.href,
        title: document.title,
        createdAt: new Date().toISOString()
      }
    }).catch(() => undefined);
    result.textContent = "Sent selected context to the Augmentor side panel.";
    return;
  }
  if (action === "insert") {
    const active = elementByControlRef(panel.dataset.activeRef);
    if (!active || !isEditable(active)) {
      result.textContent = "Insertion is only available when the selection came from an editable field.";
      return;
    }
    setNativeValue(active, result.textContent || selection);
    result.textContent = "Inserted into the active field.";
    return;
  }
  result.textContent = "Thinking...";
  try {
    const prompt = panel.querySelector(".ros-inline-prompt")?.value?.trim() ?? "";
    const response = await fetch("http://127.0.0.1:47773/augmentor/inline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        prompt,
        selection,
        pageContext: `${document.title}\n${location.href}\n${document.body?.innerText?.slice(0, 3000) ?? ""}`
      })
    });
    const payload = await response.json();
    result.textContent = payload?.reply || localInlineResult(action, selection);
  } catch {
    result.textContent = localInlineResult(action, selection);
  }
};

document.addEventListener("selectionchange", () => {
  window.clearTimeout(globalThis.__resonantosInlineSelectionTimer);
  globalThis.__resonantosInlineSelectionTimer = window.setTimeout(positionInlineButton, 120);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const { button, panel } = ensureInlineAssistantUi();
    button.style.display = "none";
    panel.style.display = "none";
  }
});

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local" || !changes.augmentorSitePermissions) return;
  void currentSitePermission().then((mode) => {
    if (mode === "blocked") {
      const { button, panel } = ensureInlineAssistantUi();
      button.style.display = "none";
      panel.style.display = "none";
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.channel !== "resonantos.browser_first.content") {
    return false;
  }

  if (message.type === "read_page") {
    if (document.getElementById(controlOverlayId)?.dataset.session !== "active") {
      pulseControlOverlay({ state: "active", label: "Reading page context" });
    }
    window.setTimeout(() => pulseControlOverlay({ state: "done", label: "Page context captured" }), 300);
    sendResponse({ ok: true, snapshot: pageSnapshot() });
    return true;
  }

  if (message.type === "control_overlay") {
    sendResponse(setControlSessionOverlay({ active: Boolean(message.active), label: message.label }));
    return true;
  }

  if (message.type === "click_text") {
    sendResponse(message.ref
      ? clickControlRef(message.ref, { userApproved: Boolean(message.userApproved) })
      : clickVisibleText(message.text, { userApproved: Boolean(message.userApproved) }));
    return true;
  }

  if (message.type === "type_text") {
    sendResponse(typeIntoPage({ text: message.text, field: message.field, ref: message.ref, submit: message.submit, userApproved: Boolean(message.userApproved) }));
    return true;
  }

  if (message.type === "scroll_page") {
    sendResponse(scrollPage({ direction: message.direction, amount: message.amount }));
    return true;
  }

  if (message.type === "detect_forms") {
    sendResponse({ ok: true, ...describeForms() });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown ResonantOS content command." });
  return true;
});
