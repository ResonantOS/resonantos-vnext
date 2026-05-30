const DEFAULT_MODEL_LABELS = {
  "__auto__": "Auto route",
  "MiniMax-M2.7": "MiniMax 2.7",
  "MiniMax-M2.7-highspeed": "MiniMax 2.7 High Speed",
  "gpt-5.5": "GPT 5.5",
  "gpt-5.4-mini": "GPT 5.4 Mini",
  "batiai/gemma4-e2b:q4": "Gemma 4 2B"
};

const MODEL_CONTEXT_WINDOWS = {
  "MiniMax-M2.7": 64_000,
  "MiniMax-M2.7-highspeed": 64_000,
  "gpt-5.5": 128_000,
  "gpt-5.4-mini": 128_000,
  "batiai/gemma4-e2b:q4": 8_000,
  "Qwen3.6-35B-A3B-Q4_K_M.gguf": 128_000
};

export function modelLabel(model, labels = DEFAULT_MODEL_LABELS) {
  return labels[model] ?? model;
}

export function supportsThinkingDepth(model) {
  return String(model ?? "").startsWith("gpt-5.");
}

function providerModelEntries(providerStatus) {
  return (providerStatus?.providers ?? [])
    .flatMap((provider) => (provider.models ?? [])
      .filter((model) => model.allowed !== false)
      .map((model) => ({
        model: String(model.model ?? "").trim(),
        label: String(model.label ?? model.model ?? "").trim(),
        providerId: provider.id,
        providerLabel: provider.label,
        configured: Boolean(provider.configured),
        runtime: model.runtime,
        costTier: model.costTier,
        qualityTier: model.qualityTier
      })))
    .filter((entry) => entry.model);
}

export async function hydrateProviderModelOptions({ bridgeRequest, modelSelect, getPreferredModel = () => "__auto__", setStatus = () => undefined }) {
  const preferred = getPreferredModel() || modelSelect.value || "__auto__";
  const fallbackOptions = [...modelSelect.options].map((option) => ({
    model: option.value,
    label: option.textContent || option.value
  }));
  try {
    const status = await bridgeRequest("/providers/status", { method: "GET" });
    const entries = providerModelEntries(status);
    const byModel = new Map();
    for (const entry of entries) {
      if (!byModel.has(entry.model) || (!byModel.get(entry.model).configured && entry.configured)) {
        byModel.set(entry.model, entry);
      }
    }
    const options = [
      { model: "__auto__", label: "Auto route", configured: true },
      ...[...byModel.values()]
    ];
    modelSelect.replaceChildren();
    for (const optionEntry of options) {
      const option = document.createElement("option");
      option.value = optionEntry.model;
      option.textContent = optionEntry.model === "__auto__"
        ? optionEntry.label
        : `${optionEntry.label || optionEntry.model}${optionEntry.providerLabel ? ` · ${optionEntry.providerLabel}` : ""}${optionEntry.configured ? "" : " · missing credential"}`;
      option.dataset.providerId = optionEntry.providerId ?? "";
      option.dataset.configured = optionEntry.configured ? "true" : "false";
      modelSelect.append(option);
    }
    modelSelect.value = [...modelSelect.options].some((option) => option.value === preferred) ? preferred : "__auto__";
    setStatus(`Loaded ${Math.max(0, options.length - 1)} provider model route${options.length === 2 ? "" : "s"}`);
    return { ok: true, options };
  } catch (error) {
    modelSelect.replaceChildren();
    for (const optionEntry of fallbackOptions) {
      const option = document.createElement("option");
      option.value = optionEntry.model;
      option.textContent = optionEntry.label;
      modelSelect.append(option);
    }
    modelSelect.value = [...modelSelect.options].some((option) => option.value === preferred) ? preferred : "__auto__";
    setStatus(`Provider model list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, error };
  }
}

function estimateTextTokens(value) {
  const text = String(value ?? "");
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function contextUsageSnapshot({ attachments = [], messages = [], model = "__auto__", pageSnapshot = null } = {}) {
  const messageTokens = messages.reduce((total, message) => total + estimateTextTokens(message.content) + 8, 0);
  const attachmentTokens = attachments.reduce((total, attachment) =>
    total + estimateTextTokens(attachment.content ?? attachment.summary ?? attachment.name) + 8, 0);
  const pageTokens = estimateTextTokens(pageSnapshot?.text) + estimateTextTokens(pageSnapshot?.title) + estimateTextTokens(pageSnapshot?.url);
  const usedTokens = messageTokens + attachmentTokens + pageTokens;
  const contextWindow = MODEL_CONTEXT_WINDOWS[model] ?? 64_000;
  const ratio = Math.min(0.99, usedTokens / contextWindow);
  const percent = Math.round(ratio * 100);
  return {
    attachmentTokens,
    contextWindow,
    messageTokens,
    pageTokens,
    percent,
    ratio,
    title: [
      `Estimated context usage: ${percent}%`,
      `Model route: ${model === "__auto__" ? "Auto route" : model}`,
      `Estimated tokens: ${usedTokens.toLocaleString()} / ${contextWindow.toLocaleString()}`,
      "This is a deterministic estimate for conversation, attachments, and captured page context. It is used to decide when compaction or a larger-context model is needed."
    ].join("\n"),
    usedTokens
  };
}

export function updateContextMeterElement(contextMeter, snapshot) {
  if (!contextMeter || !snapshot) return;
  contextMeter.style.setProperty("--context-used", `${snapshot.percent}%`);
  contextMeter.querySelector(".context-meter-label").textContent = `${snapshot.percent}%`;
  contextMeter.title = snapshot.title;
  contextMeter.setAttribute("aria-label", `Context usage ${snapshot.percent} percent`);
}

function speechRecognitionConstructor(win = globalThis.window) {
  if (!win) return null;
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function createDictationController({
  button,
  commandInput,
  setStatus = () => undefined,
  addMessage = async () => undefined,
  onTranscript = () => undefined,
  navigatorRef = globalThis.navigator,
  windowRef = globalThis.window
}) {
  let recognition = null;
  let dictating = false;

  function setDictating(next) {
    dictating = Boolean(next);
    button.classList.toggle("is-live", dictating);
    button.classList.toggle("muted", !canUseDictation());
    button.title = dictating
      ? "Stop dictation"
      : canUseDictation()
        ? "Start voice dictation"
        : "Voice dictation is not available in this browser runtime.";
    button.setAttribute("aria-label", dictating ? "Stop dictation" : "Start voice dictation");
    button.setAttribute("aria-pressed", dictating ? "true" : "false");
  }

  function canUseDictation() {
    return Boolean(speechRecognitionConstructor(windowRef));
  }

  async function requestMicrophone() {
    if (!navigatorRef.mediaDevices?.getUserMedia) return null;
    const stream = await navigatorRef.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return true;
  }

  function appendTranscript(text) {
    const value = String(text ?? "").trim();
    if (!value) return;
    const prefix = commandInput.value.trim() ? " " : "";
    commandInput.value = `${commandInput.value}${prefix}${value}`.trim();
    commandInput.dispatchEvent(new Event("input", { bubbles: true }));
    onTranscript(value);
  }

  async function start() {
    const Recognition = speechRecognitionConstructor(windowRef);
    if (!Recognition) {
      await addMessage("system", "Voice dictation is not available in this browser runtime.");
      setStatus("Dictation unavailable");
      setDictating(false);
      return;
    }
    try {
      await requestMicrophone();
      recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results ?? [])
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
          .trim();
        appendTranscript(transcript);
      };
      recognition.onerror = async (event) => {
        setStatus("Dictation failed");
        await addMessage("system", `Voice dictation failed: ${event.error || "unknown error"}`);
        setDictating(false);
      };
      recognition.onend = () => {
        setDictating(false);
        setStatus("Ready");
      };
      setDictating(true);
      setStatus("Listening");
      recognition.start();
    } catch (error) {
      setStatus("Dictation failed");
      await addMessage("system", `Voice dictation failed: ${error instanceof Error ? error.message : String(error)}`);
      setDictating(false);
    }
  }

  function stop() {
    recognition?.stop?.();
    setDictating(false);
    setStatus("Ready");
  }

  function toggle() {
    if (dictating) {
      stop();
      return;
    }
    void start();
  }

  setDictating(false);

  return {
    canUseDictation,
    start,
    stop,
    toggle
  };
}
