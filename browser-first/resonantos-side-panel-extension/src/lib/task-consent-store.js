const DEFAULT_CONSENT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function taskClassForGoal(goal = "") {
  const text = String(goal ?? "").toLowerCase();
  if (/\b(book|booking|appointment|slot|calendar|reservation)\b/.test(text)) return "booking";
  if (/\b(amazon|cart|shop|shopping|product|price|buy)\b/.test(text)) return "shopping";
  if (/\b(news|research|find|search|look up|web)\b/.test(text)) return "research";
  if (/\b(form|field|fill|write|draft|edit)\b/.test(text)) return "form-edit";
  if (/\b(open|go to|navigate|visit)\b/.test(text)) return "navigation";
  return "general";
}

export function taskConsentKey({ siteKey, taskClass }) {
  return [siteKey, taskClass].filter(Boolean).join("::");
}

export function normalizeTaskConsent(consent, { now = Date.now } = {}) {
  const grantedAt = Number(consent?.grantedAt ?? now());
  const expiresAt = Number(consent?.expiresAt ?? grantedAt + DEFAULT_CONSENT_TTL_MS);
  return {
    siteKey: String(consent?.siteKey ?? ""),
    taskClass: String(consent?.taskClass ?? "general"),
    mode: consent?.mode === "deny" ? "deny" : "allow-safe",
    grantedAt,
    expiresAt,
    source: String(consent?.source ?? "human").slice(0, 80)
  };
}

export function createTaskConsentStore({
  storage,
  taskConsentStorageKey,
  now = Date.now,
  ttlMs = DEFAULT_CONSENT_TTL_MS
}) {
  const taskConsents = async () => {
    const result = await storage?.get?.(taskConsentStorageKey).catch(() => ({}));
    const raw = result?.[taskConsentStorageKey] ?? {};
    return Object.fromEntries(
      Object.entries(raw)
        .map(([key, consent]) => [key, normalizeTaskConsent(consent, { now })])
        .filter(([, consent]) => consent.siteKey && consent.expiresAt > now())
    );
  };

  const consentFor = async ({ siteKey, goal, taskClass = taskClassForGoal(goal) }) => {
    if (!siteKey) return null;
    const consents = await taskConsents();
    return consents[taskConsentKey({ siteKey, taskClass })] ?? null;
  };

  const setTaskConsent = async ({ siteKey, goal, taskClass = taskClassForGoal(goal), mode = "allow-safe", source = "human" }) => {
    if (!siteKey) throw new Error("No site is active.");
    const consents = await taskConsents();
    const grantedAt = now();
    const consent = normalizeTaskConsent({
      siteKey,
      taskClass,
      mode,
      source,
      grantedAt,
      expiresAt: grantedAt + ttlMs
    }, { now });
    consents[taskConsentKey(consent)] = consent;
    await storage?.set?.({ [taskConsentStorageKey]: consents });
    return consent;
  };

  const revokeTaskConsent = async ({ siteKey, goal, taskClass = taskClassForGoal(goal) }) => {
    if (!siteKey) return false;
    const consents = await taskConsents();
    const key = taskConsentKey({ siteKey, taskClass });
    const existed = Boolean(consents[key]);
    delete consents[key];
    await storage?.set?.({ [taskConsentStorageKey]: consents });
    return existed;
  };

  return {
    consentFor,
    revokeTaskConsent,
    setTaskConsent,
    taskClassForGoal,
    taskConsents
  };
}
