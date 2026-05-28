export const browserIntentVerbs = /\b(open|go\s+to|go\s+on|navi\w*(?:\s+to)?|visit|load|browse(?:\s+to)?|take\s+me\s+to|show\s+me|bring\s+up|pull\s+up)\b/i;
export const browserTargetPattern = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>)]*)?)/i;
export const searchIntentVerbs = /\b(search|find|look\s+up|research|news|latest|internet|web)\b/i;

export function normalizeBrowserUrl(target) {
  const trimmed = String(target ?? "").trim().replace(/[.,;:!?]+$/, "");
  if (!trimmed) {
    throw new Error("Browser navigation requires a URL or domain.");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error("Only http and https browser navigation is supported.");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https browser navigation is supported.");
  }
  return url.toString();
}

export function parseNaturalBrowserIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !browserIntentVerbs.test(normalized)) {
    return null;
  }
  const target = browserTargetPattern.exec(normalized)?.[1];
  if (!target) {
    return null;
  }
  return { action: "open", target };
}

const quotedTextPattern = /["“”'‘’]([^"“”'‘’]{1,280})["“”'‘’]/;

export const parseQuotedText = (message) => quotedTextPattern.exec(String(message ?? ""))?.[1]?.trim() ?? "";

export const parseQuotedTexts = (message) =>
  Array.from(String(message ?? "").matchAll(/["“”'‘’]([^"“”'‘’]{1,280})["“”'‘’]/g))
    .map((match) => match[1]?.trim())
    .filter(Boolean);

export function parseTypeIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(type|write|enter|put|insert)\b/i.test(normalized)) {
    return null;
  }
  const quotedTexts = parseQuotedTexts(normalized);
  const text = quotedTexts.at(-1) ?? "";
  if (!text) {
    return null;
  }
  const submit = /\b(search bar|google|search field|address bar|submit|press enter|hit enter)\b/i.test(normalized);
  return { text, submit };
}

export function parseClickIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(click|press|tap|select|open)\b/i.test(normalized)) {
    return null;
  }
  const quotedTexts = parseQuotedTexts(normalized);
  const text = quotedTexts[0] ?? "";
  if (!text) {
    return null;
  }
  return { text };
}

export function parseReadPageIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  return (
    /\b(read|scan|summari[sz]e|inspect|look at|check|analyse|analyze|understand|see|view|access)\b/i.test(normalized) ||
    /\b(can you|do you)\s+(see|view|access)\b/i.test(normalized)
  ) &&
    /\b(this|current|active|the|open|loaded)\s+(page|website|webpage|site|tab|browser|window)\b/i.test(normalized)
    ? { action: "read_page" }
    : null;
}

export function parseStructuredPageEditIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(add|edit|update|write|insert|change|replace)\b/i.test(normalized)) {
    return null;
  }
  if (!/\b(doc|document|sheet|spreadsheet|page|row|line|cell|google\s+(sheet|doc|docs|sheets))\b/i.test(normalized)) {
    return null;
  }
  return { action: "structured_page_edit", instruction: normalized };
}

export function parseScrollIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !/\b(scroll|move)\b/i.test(normalized)) {
    return null;
  }
  const direction = /\b(up|top)\b/i.test(normalized)
    ? /\btop\b/i.test(normalized) ? "top" : "up"
    : /\b(bottom|end)\b/i.test(normalized) ? "bottom" : "down";
  return { direction };
}

export function parseFormsIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  return /\b(form|forms|field|fields|input|inputs)\b/i.test(normalized) &&
    /\b(detect|inspect|find|show|list|what)\b/i.test(normalized)
    ? { action: "detect_forms" }
    : null;
}

export function parseControlIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  const match = /\b(take control|control the browser|use the browser|operate the browser|do this in the browser)\b[:\s-]*([\s\S]*)/i.exec(normalized);
  if (!match) {
    return null;
  }
  return { goal: (match[2] || normalized).trim() };
}

export function parseAutonomousBrowserActionIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized)) {
    return null;
  }
  const hasPlainBrowserTarget = browserTargetPattern.test(normalized) && browserIntentVerbs.test(normalized);
  const hasWorkAfterNavigation = /\b(find|search|look\s+for|add|put|select|choose|click|compare|buy|shop|book|fill|complete|submit|scroll|read|inspect|check|analyse|analyze|summari[sz]e|extract)\b/i.test(normalized);
  if (hasPlainBrowserTarget && !hasWorkAfterNavigation) {
    return null;
  }
  const shoppingIntent = /\b(amazon|amazon\.it|cart|chart|basket|carrello|buy|shop|shopping|product|pringles|nvidia|rtx|5090)\b/i.test(normalized) &&
    /\b(go\s+to|open|find|search|look\s+for|add|put|select|choose|click)\b/i.test(normalized);
  const browserTaskVerbs = /\b(book|schedule|arrange|reserve|fill|complete|submit|click|press|tap|select|choose|pick|open|find|search|scroll|read|inspect|check|analyse|analyze|summari[sz]e|extract|look at|navigate|go to|visit|add|put)\b/i;
  const browserObjectHints = /\b(call|meeting|appointment|booking|calendar|form|page|site|website|webpage|tab|browser|window|button|field|slot|time|date|news|internet|web|amazon|shop|shopping|product|cart|chart|basket|carrello)\b/i;
  if (shoppingIntent) {
    return { goal: normalized };
  }
  if (!browserTaskVerbs.test(normalized) || !browserObjectHints.test(normalized)) {
    return null;
  }
  return { goal: normalized };
}

export function normalizeSearchQuery(message) {
  const cleaned = String(message ?? "")
    .replace(/\b(can you|please|could you|would you)\b/gi, " ")
    .replace(/\b(search|find|look\s+up|research|on the internet|on internet|online|web|the web|some)\b/gi, " ")
    .replace(/[?.!]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^news$/i.test(cleaned) || /^latest news$/i.test(cleaned)) {
    return "top stories";
  }
  return cleaned;
}

export function parseNaturalSearchIntent(message) {
  const normalized = String(message ?? "").trim();
  if (/^\//.test(normalized) || !searchIntentVerbs.test(normalized)) {
    return null;
  }
  if (/\b(amazon|cart|chart|basket|carrello|shop|shopping|product)\b/i.test(normalized)) {
    return null;
  }
  if (browserTargetPattern.test(normalized) && browserIntentVerbs.test(normalized)) {
    return null;
  }
  const wantsNews = /\b(news|latest)\b/i.test(normalized);
  return {
    action: wantsNews ? "news" : "search",
    query: normalizeSearchQuery(normalized)
  };
}

export function parseAmazonShoppingTask(message) {
  const normalized = String(message ?? "").trim();
  if (!/\b(amazon|amazon\.it|cart|chart|basket|carrello)\b/i.test(normalized)) {
    return null;
  }
  let query = normalized
    .replace(/\b(can you|please|could you|would you|ok now|now)\b/gi, " ")
    .replace(/\b(go\s+to|open|visit|navigate\s+to|find|search|look\s+for|me|on|in|amazon(?:\.it)?|some|then|and|add|put|it|them|to|the|cart|chart|basket|carrello)\b/gi, " ")
    .replace(/[?.!]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query && /\b(nvidia|5090|rtx)\b/i.test(normalized)) {
    query = "nvidia 5090";
  }
  if (!query && /\bpringles\b/i.test(normalized)) {
    query = "pringles";
  }
  const base = "https://www.amazon.it";
  return {
    query,
    wantsCart: /\b(add|put).{0,30}\b(cart|chart|basket|carrello)\b/i.test(normalized),
    url: query ? `${base}/s?k=${encodeURIComponent(query)}` : base
  };
}
