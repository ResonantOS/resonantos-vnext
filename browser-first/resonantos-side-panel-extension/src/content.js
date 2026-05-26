const controlRefAttribute = "data-resonantos-control-ref";
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

const clickElement = (element, { userApproved = false, fallbackText = "" } = {}) => {
  if (isSubmitLikeElement(element) && !userApproved) {
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
  element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  element.focus();
  setNativeValue(element, value);
  if (submit) {
    if (!isSearchLikeEditable(element) && !userApproved) {
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
  const normalized = String(direction || "down").toLowerCase();
  const viewport = Math.max(320, window.innerHeight || 720);
  const magnitude = Math.max(120, Math.min(4000, Number(amount) || viewport));
  let deltaY = magnitude;
  if (normalized === "up") deltaY = -magnitude;
  if (normalized === "top") deltaY = -document.documentElement.scrollHeight;
  if (normalized === "bottom") deltaY = document.documentElement.scrollHeight;
  window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
  return {
    ok: true,
    direction: normalized,
    scrollY: Math.round(window.scrollY),
    maxScrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.channel !== "resonantos.browser_first.content") {
    return false;
  }

  if (message.type === "read_page") {
    sendResponse({ ok: true, snapshot: pageSnapshot() });
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
