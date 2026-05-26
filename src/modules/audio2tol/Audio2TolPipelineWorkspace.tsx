import { Component, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProviderProfile, ProviderRuntimeNode } from "../../core/contracts";
import "./audio2tol-workspace.css";

type Format = "md" | "txt";
type AnalysisMode = "local" | "api" | "off";

export type Settings = {
  recorderDevice: string;
  recorderMountPath: string;
  recorderAudioFolder: string;
  detectedAudioFiles: string;
  supportedFormats: string;
  recursiveScan: boolean;
  audioFolder: string;
  backupFolders: string;
  preserveOriginalFilename: boolean;
  duplicateMode: string;
  whisperPath: string;
  whisperModel: string;
  transcriptFolder: string;
  transcriptFormat: Format;
  language: string;
  includeTimestamps: boolean;
  analysisMode: AnalysisMode;
  mainProviderProfileId: string;
  mainRuntimeNodeId: string;
  llmProvider: string;
  llmModel: string;
  localEndpoint: string;
  apiKeyReference: string;
  fallbackProviderProfileId: string;
  fallbackRuntimeNodeId: string;
  fallbackProvider: string;
  fallbackModel: string;
  fallbackEndpoint: string;
  protocolPath: string;
  templatePath: string;
  finalOutputFolder: string;
  finalOutputFormat: Format;
};

type ValidationResult = {
  ready: boolean;
  missing: string[];
};

type PipelineStep = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  tone: "sage" | "clay" | "mineral" | "moss" | "straw" | "stone";
  status: string;
  badgeTone: "ready" | "missing" | "active" | "done";
  validation: ValidationResult;
  body: ReactNode;
};

type AudioScanResult = {
  count: number;
  files: string[];
};

type ImportPlanResult = {
  total_count: number;
  new_count: number;
  existing_count: number;
  new_files: string[];
  existing_files: string[];
};

type ScanOutcome = {
  scannedFiles: string[];
  newFiles: string[];
  existingFiles: string[];
};

type WhisperDetectionResult = {
  found: boolean;
  path: string | null;
  version: string | null;
  message: string;
};

type ImportResult = {
  source: string;
  destination: string | null;
  status: "copied" | "skipped" | "failed";
  message: string;
  backups: {
    folder: string;
    destination: string | null;
    status: "copied" | "skipped" | "failed";
    message: string;
  }[];
};

type TranscriptionResult = {
  source: string;
  imported_path: string;
  transcript_path: string;
  status: string;
  message: string;
};

type AnalysisResult = {
  source: string;
  imported_path: string;
  transcript_path: string;
  analysis_path: string | null;
  status: string;
  message: string;
};

type BatchProcessingResult = {
  completed_count: number;
  failed_count: number;
};

type ProgressEvent = {
  stage: string;
  status: string;
  source: string | null;
  detail: string;
  elapsed_seconds: number | null;
};

type QueueState =
  | "waiting"
  | "copying"
  | "copied"
  | "skipped"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed"
  | "ready_for_transcription";

type RunPhase = "idle" | "scanning" | "importing" | "transcribing" | "analyzing" | "rendering" | "completed" | "failed";

type ProviderRoute = {
  id: string;
  providerProfileId: string;
  runtimeNodeId: string;
  label: string;
  providerLabel: string;
  providerType: ProviderProfile["providerType"];
  mode: AnalysisMode;
  endpoint: string;
  model: string;
  runtimeLabel: string;
  credentialConfigured: boolean;
  note: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
  stack: string;
};

const STORAGE_KEY = "audio2tol.settings.v1";
const DEV_AUTOSTART = import.meta.env.DEV && import.meta.env.VITE_AUDIO2TOL_AUTOSTART === "1";

const offRoute: ProviderRoute = {
  id: "off",
  providerProfileId: "",
  runtimeNodeId: "",
  label: "Analysis off",
  providerLabel: "Analysis off",
  providerType: "custom",
  mode: "off",
  endpoint: "",
  model: "",
  runtimeLabel: "No model",
  credentialConfigured: true,
  note: "Transcribe only. No AI analysis will run."
};

const defaultSettings: Settings = {
  recorderDevice: "Sony IC Recorder",
  recorderMountPath: "/Volumes/IC RECORDER",
  recorderAudioFolder: "/Volumes/IC RECORDER/REC_FILE/FOLDER01",
  detectedAudioFiles: "34",
  supportedFormats: ".wav, .mp3, .m4a, .aac, .flac",
  recursiveScan: true,
  audioFolder: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/RAW Audio",
  backupFolders: "",
  preserveOriginalFilename: true,
  duplicateMode: "Filename + size + modified date",
  whisperPath: "/opt/homebrew/Cellar/whisper-cpp/1.8.4/bin/whisper-cli",
  whisperModel: "large-v3",
  transcriptFolder: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Transcripts",
  transcriptFormat: "md",
  language: "English",
  includeTimestamps: false,
  analysisMode: "api",
  mainProviderProfileId: "shared-minimax",
  mainRuntimeNodeId: "node-minimax-cloud",
  llmProvider: "MiniMax",
  llmModel: "MiniMax-M2.7",
  localEndpoint: "https://api.minimax.io/v1",
  apiKeyReference: "",
  fallbackProviderProfileId: "gx10-local-llama",
  fallbackRuntimeNodeId: "node-gx10-qwen",
  fallbackProvider: "GX10 Qwen 35B",
  fallbackModel: "Qwen3.6-35B-A3B-Q4_K_M.gguf",
  fallbackEndpoint: "http://192.168.1.77:30004/v1",
  protocolPath: "TOL - SYSTEM INJECTION.rtf",
  templatePath: "TOL_Analysis_Template.md",
  finalOutputFolder: "/Users/augmentor/Documents/RESONANT_OS_BASE/03_TOL/TOL Analysis",
  finalOutputFormat: "md"
};

type Audio2TolPipelineWorkspaceProps = {
  persistedSettings?: Partial<Settings>;
  providerProfiles?: ProviderProfile[];
  runtimeNodes?: ProviderRuntimeNode[];
  onSettingsChange?: (settings: Settings) => void;
};

function mergeSettingsWithDefaults(settings: Partial<Settings>): Settings {
  const merged = { ...defaultSettings } as Settings;

  (Object.keys(defaultSettings) as Array<keyof Settings>).forEach((key) => {
    const value = settings[key];
    if (value === undefined || value === null) {
      return;
    }
    if (typeof value === "string" && value.trim() === "" && typeof defaultSettings[key] === "string" && defaultSettings[key].trim() !== "") {
      return;
    }
    merged[key] = value as never;
  });

  const normalized = normalizeSettings(merged);
  const withRouteDefaults = {
    ...normalized,
    mainProviderProfileId: normalized.mainProviderProfileId || defaultSettings.mainProviderProfileId,
    mainRuntimeNodeId: normalized.mainRuntimeNodeId || defaultSettings.mainRuntimeNodeId,
    fallbackProviderProfileId: normalized.fallbackProviderProfileId || defaultSettings.fallbackProviderProfileId,
    fallbackRuntimeNodeId: normalized.fallbackRuntimeNodeId || defaultSettings.fallbackRuntimeNodeId,
  };

  if (
    withRouteDefaults.llmProvider === "Ollama" ||
    withRouteDefaults.llmProvider === "LM Studio" ||
    withRouteDefaults.llmProvider === "Custom local endpoint" ||
    withRouteDefaults.llmProvider === "GX10 Qwen 35B"
  ) {
    return {
      ...withRouteDefaults,
      analysisMode: "api",
      mainProviderProfileId: "shared-minimax",
      mainRuntimeNodeId: "node-minimax-cloud",
      llmProvider: "MiniMax",
      llmModel: "MiniMax-M2.7",
      localEndpoint: "https://api.minimax.io/v1",
      fallbackProviderProfileId: "gx10-local-llama",
      fallbackRuntimeNodeId: "node-gx10-qwen",
      fallbackProvider: withRouteDefaults.llmProvider === "GX10 Qwen 35B" ? withRouteDefaults.llmProvider : defaultSettings.fallbackProvider,
      fallbackModel:
        withRouteDefaults.llmProvider === "GX10 Qwen 35B" && withRouteDefaults.llmModel.trim()
          ? withRouteDefaults.llmModel
          : defaultSettings.fallbackModel,
      fallbackEndpoint:
        withRouteDefaults.llmProvider === "GX10 Qwen 35B" && withRouteDefaults.localEndpoint.trim()
          ? withRouteDefaults.localEndpoint
          : defaultSettings.fallbackEndpoint,
    };
  }

  return withRouteDefaults;
}

function getStoredSettings(persistedSettings?: Partial<Settings>): Settings {
  if (persistedSettings) {
    return mergeSettingsWithDefaults(persistedSettings);
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return defaultSettings;
    }

    return mergeSettingsWithDefaults(JSON.parse(stored) as Partial<Settings>);
  } catch {
    return defaultSettings;
  }
}

function normalizeSettings(settings: Settings): Settings {
  if (settings.llmProvider !== "MiniMax") {
    return settings;
  }

  return {
    ...settings,
    localEndpoint:
      settings.localEndpoint.trim().replace(/\/$/, "") === "https://api.minimax.io"
        ? "https://api.minimax.io/v1"
        : settings.localEndpoint,
    llmModel: settings.llmModel === "provider-default" ? "MiniMax-M2.7" : settings.llmModel
  };
}

function hasValue(value: string): boolean {
  return value.trim().length > 0;
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function providerRouteId(providerProfileId: string, runtimeNodeId: string, model: string): string {
  return `${providerProfileId}::${runtimeNodeId}::${model}`;
}

function routeMode(profile: ProviderProfile, runtimeNode: ProviderRuntimeNode): AnalysisMode {
  if (profile.providerType === "local" || runtimeNode.kind !== "cloud") {
    return "local";
  }

  return "api";
}

function buildProviderRoutes(providerProfiles: ProviderProfile[] = [], runtimeNodes: ProviderRuntimeNode[] = []): ProviderRoute[] {
  const routes = runtimeNodes.flatMap((runtimeNode) => {
    const profile = providerProfiles.find((candidate) => candidate.id === runtimeNode.providerProfileId);
    if (!profile) {
      return [];
    }

    const supportedModels = Array.from(
      new Set([
        ...runtimeNode.supportedModels,
        ...profile.allowedModels,
        profile.primaryModel,
        profile.fallbackModel ?? "",
      ].filter(Boolean)),
    );

    return supportedModels.map((model) => ({
      id: providerRouteId(profile.id, runtimeNode.id, model),
      providerProfileId: profile.id,
      runtimeNodeId: runtimeNode.id,
      label: `${profile.label} · ${model}`,
      providerLabel: profile.label,
      providerType: profile.providerType,
      mode: routeMode(profile, runtimeNode),
      endpoint: runtimeNode.endpoint ?? profile.apiBaseUrl ?? "",
      model,
      runtimeLabel: runtimeNode.label,
      credentialConfigured: profile.credentialStatus === "configured" || runtimeNode.kind !== "cloud",
      note:
        runtimeNode.kind === "cloud"
          ? `${runtimeNode.label}. Credentials are resolved from ResonantOS providers.`
          : `${runtimeNode.label}. User-owned runtime on ${runtimeNode.locality}.`,
    }));
  });

  return routes.sort((left, right) => {
    const preferred = ["shared-minimax", "gx10-local-llama"];
    const leftRank = preferred.indexOf(left.providerProfileId);
    const rightRank = preferred.indexOf(right.providerProfileId);
    if (leftRank !== rightRank) {
      return (leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank) - (rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank);
    }
    return left.label.localeCompare(right.label);
  });
}

function findRoute(
  routes: ProviderRoute[],
  providerProfileId: string,
  runtimeNodeId: string,
  model: string,
): ProviderRoute | undefined {
  return routes.find(
    (route) =>
      route.providerProfileId === providerProfileId &&
      route.runtimeNodeId === runtimeNodeId &&
      route.model === model,
  );
}

function validateRecorder(settings: Settings): ValidationResult {
  const missing = [];

  if (!hasValue(settings.recorderDevice)) {
    missing.push("Select USB recorder device");
  }

  if (!hasValue(settings.recorderMountPath)) {
    missing.push("Select recorder device root");
  }

  if (!hasValue(settings.recorderAudioFolder)) {
    missing.push("Select recorder audio folder");
  }

  return { ready: missing.length === 0, missing };
}

function validateImport(settings: Settings): ValidationResult {
  const missing = [];

  if (!hasValue(settings.audioFolder)) {
    missing.push("Select primary audio destination folder");
  }

  if (!hasValue(settings.duplicateMode)) {
    missing.push("Select duplicate detection mode");
  }

  return { ready: missing.length === 0, missing };
}

function validateWhisper(settings: Settings): ValidationResult {
  const missing = [];

  if (!hasValue(settings.whisperPath)) {
    missing.push("Install or choose whisper.cpp");
  }

  if (!hasValue(settings.whisperModel)) {
    missing.push("Select Whisper model");
  }

  if (!hasValue(settings.transcriptFolder)) {
    missing.push("Select transcript folder");
  }

  if (!hasValue(settings.language)) {
    missing.push("Select language or Auto Detect");
  }

  return { ready: missing.length === 0, missing };
}

function validateAnalysis(settings: Settings): ValidationResult {
  const missing: string[] = [];

  if (settings.analysisMode === "off" || settings.llmProvider === "Analysis off") {
    return { ready: true, missing };
  }

  if (!hasValue(settings.mainProviderProfileId) || !hasValue(settings.mainRuntimeNodeId)) {
    missing.push("Select main ResonantOS provider");
  }

  if (!hasValue(settings.llmModel)) {
    missing.push("Select main model");
  }

  if (!hasValue(settings.protocolPath)) {
    missing.push("Select TOL protocol");
  }

  return { ready: missing.length === 0, missing };
}

function validateTemplate(settings: Settings): ValidationResult {
  const missing = [];

  if (!hasValue(settings.templatePath)) {
    missing.push("Select analysis template");
  }

  if (!hasValue(settings.finalOutputFolder)) {
    missing.push("Select final output folder");
  }

  return { ready: missing.length === 0, missing };
}

function StatusPill({ tone, label }: { tone: "ready" | "missing" | "active" | "done"; label: string }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

function PathSelector({
  label,
  value,
  placeholder,
  selectLabel = "Select",
  hint,
  onSelect,
  kind,
  filters
}: {
  label: string;
  value: string;
  placeholder: string;
  selectLabel?: string;
  hint?: string;
  onSelect: (value: string) => void;
  kind: "folder" | "file";
  filters?: { name: string; extensions: string[] }[];
}) {
  async function selectPath() {
    const selected = await open({
      directory: kind === "folder",
      multiple: false,
      title: label,
      filters
    });

    if (typeof selected === "string") {
      onSelect(selected);
    }
  }

  async function openSelectedPath() {
    if (!value) {
      return;
    }

    await invoke("audio2tol_open_path", { path: value });
  }

  return (
    <div className="field path-field">
      <span className="field-label">{label}</span>
      <div className="path-control">
        <button className="select-button" type="button" onClick={selectPath}>
          {value ? "Change" : selectLabel}
        </button>
        <span className={`selected-path ${value ? "has-value" : ""}`}>{value || placeholder}</span>
        {value ? (
          <button className="open-button" type="button" onClick={openSelectedPath}>
            Open
          </button>
        ) : null}
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

function MissingList({ validation }: { validation: ValidationResult }) {
  if (validation.ready) {
    return <p className="ready-note">Configured and ready.</p>;
  }

  return (
    <div className="missing-list">
      <span>Missing</span>
      {validation.missing.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

function PipelineBlock({ step }: { step: PipelineStep }) {
  return (
    <section className={`pipeline-block ${step.tone}`}>
      <div className="step-number" aria-hidden="true">
        {step.number}
      </div>
      <div className="block-content">
        <div className="block-heading">
          <div>
            <p className="eyebrow">Step {step.number}</p>
            <h2>{step.title}</h2>
            <p>{step.subtitle}</p>
          </div>
          <StatusPill tone={step.badgeTone} label={step.status} />
        </div>
        <div className="block-grid">{step.body}</div>
        <MissingList validation={step.validation} />
      </div>
    </section>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    stack: ""
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      error,
      stack: ""
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({
      error,
      stack: info.componentStack || ""
    });
    console.error("Audio2TOL frontend crash", error, info);
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main
        style={{
          minHeight: "100vh",
          padding: "32px",
          background: "#f4efe2",
          color: "#1f2a1f",
          fontFamily: "\"Avenir Next\", sans-serif"
        }}
      >
        <div
          style={{
            maxWidth: "920px",
            margin: "0 auto",
            border: "1px solid rgba(31, 42, 31, 0.16)",
            borderRadius: "24px",
            padding: "24px",
            background: "rgba(255, 252, 245, 0.96)"
          }}
        >
          <p style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Frontend Error
          </p>
          <h1 style={{ margin: "10px 0 12px", fontSize: "2rem" }}>Audio2TOL UI crashed</h1>
          <p style={{ margin: "0 0 16px" }}>{this.state.error.message}</p>
          <pre
            style={{
              margin: 0,
              padding: "16px",
              borderRadius: "16px",
              overflowX: "auto",
              background: "#f0ead9",
              whiteSpace: "pre-wrap"
            }}
          >
            {this.state.error.stack}
            {this.state.stack ? `\n\nComponent stack:${this.state.stack}` : ""}
          </pre>
        </div>
      </main>
    );
  }
}

function AppShell({ persistedSettings, providerProfiles = [], runtimeNodes = [], onSettingsChange }: Audio2TolPipelineWorkspaceProps) {
  const heroPanelRef = useRef<HTMLElement | null>(null);
  const settingsShellRef = useRef<HTMLElement | null>(null);
  const devAutostartTriggeredRef = useRef(false);
  const lastProgressLogRef = useRef("");
  const scanTimerRef = useRef<number | null>(null);
  const onSettingsChangeRef = useRef(onSettingsChange);
  const [settings, setSettings] = useState<Settings>(() => getStoredSettings(persistedSettings));
  const [runState, setRunState] = useState<"idle" | "running" | "paused">("idle");
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [currentFile, setCurrentFile] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [progressDetail, setProgressDetail] = useState("Waiting for Start Processing.");
  const [stageElapsedSeconds, setStageElapsedSeconds] = useState<number | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "complete" | "failed">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [whisperStatus, setWhisperStatus] = useState<"checking" | "found" | "missing" | "installing" | "failed">("checking");
  const [whisperMessage, setWhisperMessage] = useState("Checking for local whisper.cpp...");
  const [queueState, setQueueState] = useState<Record<string, QueueState>>({});
  const [activityLog, setActivityLog] = useState<string[]>(["Waiting for configuration."]);
  const providerRoutes = buildProviderRoutes(providerProfiles, runtimeNodes);
  const allProviderRoutes = [offRoute, ...providerRoutes];

  useEffect(() => {
    onSettingsChangeRef.current = onSettingsChange;
  }, [onSettingsChange]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    onSettingsChangeRef.current?.(settings);
  }, [settings]);

  useEffect(() => {
    void detectWhisper();
  }, []);

  useEffect(() => {
    if (runState !== "running" || runStartedAt === null) {
      return;
    }

    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [runStartedAt, runState]);

  useEffect(() => {
    const target = settingsOpen ? settingsShellRef.current : heroPanelRef.current;

    if (!target) {
      return;
    }

    const timer = window.setTimeout(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 60);

    return () => window.clearTimeout(timer);
  }, [settingsOpen]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    function applyProgressPayload(payload: ProgressEvent) {
      if (
        payload.stage === "scanning" ||
        payload.stage === "importing" ||
        payload.stage === "transcribing" ||
        payload.stage === "analyzing"
      ) {
        setRunPhase(payload.stage);
      } else if (payload.stage === "completed" || payload.stage === "failed") {
        setRunPhase(payload.stage);
      }

      if (payload.source) {
        const source = payload.source;
        setCurrentFile(basename(source));

        setQueueState((current) => {
          const existing = current[source];
          if (!existing) {
            return current;
          }

          const next =
            payload.stage === "importing"
              ? payload.detail.includes("skipped")
                ? "skipped"
                : payload.detail.includes("failed")
                  ? "failed"
                  : "copied"
              : payload.stage === "transcribing"
                ? payload.status === "completed"
                  ? "ready_for_transcription"
                  : "transcribing"
                : payload.stage === "analyzing"
                  ? payload.status === "completed"
                    ? payload.detail.toLowerCase().includes("failed")
                      ? "failed"
                      : "completed"
                    : "analyzing"
                  : existing;

          if (next === existing) {
            return current;
          }

          return { ...current, [source]: next };
        });
      }

      setProgressDetail(payload.detail);
      setStageElapsedSeconds(payload.elapsed_seconds ?? null);

      if (payload.status === "started" || payload.status === "completed") {
        const progressKey = `${payload.stage}:${payload.status}:${payload.source ?? ""}:${payload.detail}`;
        if (lastProgressLogRef.current !== progressKey) {
          lastProgressLogRef.current = progressKey;
          logActivity(payload.detail);
        }
      }
    }

    void listen<ProgressEvent>("audio2tol-pipeline-progress", (event) => {
      if (!mounted) {
        return;
      }

      applyProgressPayload(event.payload);
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    const pollTimer = window.setInterval(() => {
      if (!mounted || runState !== "running") {
        return;
      }

      void invoke<ProgressEvent | null>("audio2tol_get_pipeline_progress")
        .then((payload) => {
          if (mounted && payload) {
            applyProgressPayload(payload);
          }
        })
        .catch(() => {
          // Event push remains the primary channel; polling is a silent fallback.
        });
    }, 1000);

    return () => {
      mounted = false;
      unlisten?.();
      window.clearInterval(pollTimer);
    };
  }, [runState]);

  useEffect(() => {
    if (!hasValue(settings.recorderAudioFolder) || runState === "running") {
      return;
    }

    const timer = window.setTimeout(() => {
      scanTimerRef.current = null;
      void scanAudioFiles();
    }, 250);
    scanTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (scanTimerRef.current === timer) {
        scanTimerRef.current = null;
      }
    };
  }, [
    settings.recorderAudioFolder,
    settings.audioFolder,
    settings.transcriptFolder,
    settings.transcriptFormat,
    settings.finalOutputFolder,
    settings.finalOutputFormat,
    settings.analysisMode,
    settings.recursiveScan,
    settings.supportedFormats,
    runState
  ]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function resetSettings() {
    setSettings(defaultSettings);
    setAudioFiles([]);
    setPendingFiles([]);
    setExistingFiles([]);
    setScanStatus("idle");
    setScanMessage("");
    setWhisperStatus("checking");
    setWhisperMessage("Checking for local whisper.cpp...");
    setQueueState({});
    setActivityLog(["Waiting for configuration."]);
    setProgressDetail("Waiting for Start Processing.");
    setStageElapsedSeconds(null);
    void detectWhisper();
    setRunState("idle");
    setRunPhase("idle");
    setCurrentFile("");
    setRunStartedAt(null);
    setElapsedSeconds(0);
  }

  function logActivity(message: string) {
    setActivityLog((current) => [message, ...current].slice(0, 12));
  }

  async function detectWhisper() {
    setWhisperStatus("checking");
    setWhisperMessage("Checking for local whisper.cpp...");

    try {
      const result = await invoke<WhisperDetectionResult>("audio2tol_detect_whisper_cpp");

      if (result.found && result.path) {
        update("whisperPath", result.path);
        setWhisperStatus("found");
        setWhisperMessage(result.version ? `${result.message} ${result.version}` : result.message);
        return;
      }

      update("whisperPath", "");
      setWhisperStatus("missing");
      setWhisperMessage(result.message);
    } catch (error) {
      setWhisperStatus("failed");
      setWhisperMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function installWhisper() {
    setWhisperStatus("installing");
    setWhisperMessage("Installing whisper.cpp with Homebrew...");

    try {
      const result = await invoke<WhisperDetectionResult>("audio2tol_install_whisper_cpp");

      if (result.found && result.path) {
        update("whisperPath", result.path);
        setWhisperStatus("found");
        setWhisperMessage(result.version ? `${result.message} ${result.version}` : result.message);
        return;
      }

      setWhisperStatus("missing");
      setWhisperMessage(result.message);
    } catch (error) {
      setWhisperStatus("failed");
      setWhisperMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function selectProvider(routeId: string) {
    const provider = allProviderRoutes.find((route) => route.id === routeId) ?? offRoute;

    setSettings((current) => ({
      ...current,
      mainProviderProfileId: provider.providerProfileId,
      mainRuntimeNodeId: provider.runtimeNodeId,
      llmProvider: provider.providerLabel,
      analysisMode: provider.mode,
      localEndpoint: provider.endpoint,
      llmModel: provider.model,
      apiKeyReference: "",
    }));
  }

  function selectFallbackProvider(routeId: string) {
    const provider = providerRoutes.find((route) => route.id === routeId) ?? providerRoutes[0];
    if (!provider) {
      return;
    }

    setSettings((current) => ({
      ...current,
      fallbackProviderProfileId: provider.providerProfileId,
      fallbackRuntimeNodeId: provider.runtimeNodeId,
      fallbackProvider: provider.providerLabel,
      fallbackEndpoint: provider.endpoint,
      fallbackModel: provider.model
    }));
  }

  async function scanAudioFiles(options?: {
    showPhase?: boolean;
    resetPhaseOnComplete?: boolean;
  }): Promise<ScanOutcome> {
    const showPhase = options?.showPhase ?? true;
    const resetPhaseOnComplete = options?.resetPhaseOnComplete ?? true;

    if (!hasValue(settings.recorderAudioFolder)) {
      setScanStatus("failed");
      setScanMessage("Select the recorder audio source folder first.");
      if (showPhase) {
        setRunPhase("failed");
      }
      return { scannedFiles: [], newFiles: [], existingFiles: [] };
    }

    logActivity("Scanning selected audio source folder.");
    if (showPhase) {
      setRunPhase("scanning");
    }
    setCurrentFile("");
    setStageElapsedSeconds(null);
    setProgressDetail("Scanning selected audio source folder...");
    setScanStatus("scanning");
    setScanMessage("Scanning selected audio source folder...");

    try {
      const result = await invoke<AudioScanResult>("audio2tol_scan_audio_files", {
        folder: settings.recorderAudioFolder,
        supportedFormats: settings.supportedFormats,
        recursive: settings.recursiveScan
      });
      let newFiles = result.files;
      let existing = [] as string[];

      if (hasValue(settings.audioFolder)) {
        const plan = await invoke<ImportPlanResult>("audio2tol_plan_import_audio_files", {
          files: result.files,
          destinationFolder: settings.audioFolder,
          transcriptFolder: settings.transcriptFolder,
          transcriptFormat: settings.transcriptFormat,
          finalOutputFolder: settings.finalOutputFolder,
          finalOutputFormat: settings.finalOutputFormat,
          analysisMode: settings.analysisMode
        });
        newFiles = plan.new_files;
        existing = plan.existing_files;
      }

      setAudioFiles(result.files);
      setPendingFiles(newFiles);
      setExistingFiles(existing);
      setQueueState(
        Object.fromEntries(newFiles.map((file) => [file, "waiting" satisfies QueueState]))
      );
      update("detectedAudioFiles", String(newFiles.length));
      setScanStatus("complete");
      if (showPhase && resetPhaseOnComplete) {
        setRunPhase("idle");
      }
      const completedMessage = `Found ${result.count} supported audio file${result.count === 1 ? "" : "s"}. ${newFiles.length} pending, ${existing.length} complete.`;
      const detailMessage = `${newFiles.length} pending file${newFiles.length === 1 ? "" : "s"} ready. ${existing.length} complete.`;
      setScanMessage(completedMessage);
      setProgressDetail(detailMessage);
      logActivity(completedMessage);
      return { scannedFiles: result.files, newFiles, existingFiles: existing };
    } catch (error) {
      setAudioFiles([]);
      setPendingFiles([]);
      setExistingFiles([]);
      setQueueState({});
      update("detectedAudioFiles", "0");
      setScanStatus("failed");
      if (showPhase) {
        setRunPhase("failed");
      }
      const message = error instanceof Error ? error.message : String(error);
      setScanMessage(message);
      setProgressDetail(message);
      return { scannedFiles: [], newFiles: [], existingFiles: [] };
    }
  }

  async function addBackupFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Backup folder"
    });

    if (typeof selected !== "string") {
      return;
    }

    setSettings((current) => {
      const existing = current.backupFolders
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      if (existing.includes(selected)) {
        return current;
      }

      return { ...current, backupFolders: [...existing, selected].join("\n") };
    });
  }

  function removeBackupFolder(path: string) {
    setSettings((current) => ({
      ...current,
      backupFolders: current.backupFolders
        .split("\n")
        .map((item) => item.trim())
        .filter((item) => item && item !== path)
        .join("\n")
    }));
  }

  async function startProcessing() {
    if (!configurationReady) {
      logActivity("Start blocked. Complete the missing configuration first.");
      setSettingsOpen(true);
      return;
    }

    flushSync(() => {
      setRunState("running");
      setRunStartedAt(Date.now());
      setElapsedSeconds(0);
      setRunPhase("scanning");
      setCurrentFile("");
      setStageElapsedSeconds(null);
    });
    logActivity("Scanning audio source before processing.");
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    await waitForPaint();
    const scanOutcome = await scanAudioFiles({ showPhase: true, resetPhaseOnComplete: false });
    const filesToProcess = scanOutcome.newFiles;

    if (filesToProcess.length === 0) {
      flushSync(() => {
        setRunState("idle");
        setRunPhase("completed");
        setRunStartedAt(null);
      });
      setProgressDetail("No new audio files detected.");
      logActivity("No pending audio files were found. Existing recorder files are already complete.");
      return;
    }

    flushSync(() => {
      setRunPhase("importing");
      setCurrentFile("");
      setProgressDetail(`Importing ${filesToProcess.length} new audio file${filesToProcess.length === 1 ? "" : "s"}.`);
      setQueueState(Object.fromEntries(filesToProcess.map((file) => [file, "copying" satisfies QueueState])));
    });
    logActivity(`Starting import for ${filesToProcess.length} new audio file${filesToProcess.length === 1 ? "" : "s"}.`);
    logActivity(`RAW audio destination: ${settings.audioFolder}`);
    logActivity(`Transcript destination: ${settings.transcriptFolder}`);
    logActivity(`Analysis destination: ${settings.finalOutputFolder}`);
    logActivity("If the selected Whisper model is missing, it will download before transcription.");
    await waitForPaint();

    try {
      const backupFolders = settings.backupFolders
        .split("\n")
        .map((folder) => folder.trim())
        .filter(Boolean);
      const results = await invoke<ImportResult[]>("audio2tol_import_audio_files", {
        files: filesToProcess,
        destinationFolder: settings.audioFolder,
        backupFolders
      });

      const nextState = Object.fromEntries(
        filesToProcess.map((file) => [file, "copying" satisfies QueueState])
      ) as Record<string, QueueState>;

      for (const result of results) {
        nextState[result.source] =
          result.status === "failed" ? "failed" : (result.status as QueueState);
      }

      flushSync(() => {
        setQueueState({ ...nextState });
      });
      const copiedResults = results.filter((result) => result.status === "copied");
      const skippedResults = results.filter((result) => result.status === "skipped");
      const failedImports = results.filter((result) => result.status === "failed");
      const resumableResults = results.filter(
        (result) => (result.status === "copied" || result.status === "skipped") && !!result.destination
      );

      setProgressDetail(
        `Import check complete: ${copiedResults.length} copied, ${skippedResults.length} already in RAW, ${failedImports.length} failed.`
      );
      logActivity(
        `Import check complete: ${copiedResults.length} copied, ${skippedResults.length} already in RAW, ${failedImports.length} failed.`
      );

      if (resumableResults.length === 0) {
        flushSync(() => {
          setRunPhase("completed");
          setCurrentFile("");
          setRunState("idle");
          setRunStartedAt(null);
        });
        setProgressDetail("No new audio files detected. Nothing was reprocessed.");
        logActivity("No new audio files detected. Nothing was reprocessed.");
        return;
      }

      for (const result of results) {
        flushSync(() => {
          setCurrentFile(basename(result.source));
        });

        if (result.status === "failed") {
          nextState[result.source] = "failed";
          setQueueState({ ...nextState });
          logActivity(`${basename(result.source)} failed during import: ${result.message}`);
          continue;
        }

        if (result.status === "skipped") {
          nextState[result.source] = "transcribing";
          setQueueState({ ...nextState });
          logActivity(`${basename(result.source)} already in RAW Audio. Resuming transcription and analysis.`);
        }

        logActivity(`${basename(result.source)} ${result.status}: ${result.message}`);

        for (const backup of result.backups) {
          logActivity(`${basename(result.source)} backup ${backup.status}: ${backup.folder}`);
        }

        if (!result.destination) {
          nextState[result.source] = "failed";
          setQueueState({ ...nextState });
          logActivity(`${basename(result.source)} has no imported destination path.`);
          continue;
        }

        try {
          nextState[result.source] = "transcribing";
          flushSync(() => {
            setRunPhase("transcribing");
            setQueueState({ ...nextState });
          });
          logActivity(`${basename(result.source)} transcribing with local whisper.cpp.`);
          await waitForPaint();
          const transcribed = await invoke<TranscriptionResult>("audio2tol_transcribe_audio_file", {
            source: result.source,
            importedPath: result.destination,
            whisperPath: settings.whisperPath,
            whisperModel: settings.whisperModel,
            transcriptFolder: settings.transcriptFolder,
            transcriptFormat: settings.transcriptFormat,
            language: settings.language
          });

          logActivity(`${basename(result.source)} ${transcribed.status}: ${transcribed.message}`);
          logActivity(`Transcript: ${transcribed.transcript_path}`);

          if (settings.llmProvider === "Analysis off") {
            nextState[result.source] = "completed";
            setQueueState({ ...nextState });
            continue;
          }

          nextState[result.source] = "analyzing";
          flushSync(() => {
            setRunPhase("analyzing");
            setQueueState({ ...nextState });
          });
          logActivity(`${basename(result.source)} running TOL protocol analysis.`);
          await waitForPaint();
          const analyzed = await invoke<AnalysisResult>("audio2tol_analyze_tol_transcript", {
            source: result.source,
            importedPath: transcribed.imported_path,
            transcriptPath: transcribed.transcript_path,
            llmProvider: settings.llmProvider,
            providerProfileId: settings.mainProviderProfileId,
            runtimeNodeId: settings.mainRuntimeNodeId,
            llmModel: settings.llmModel,
            apiEndpoint: settings.localEndpoint,
            fallbackProvider: settings.fallbackProvider,
            fallbackProviderProfileId: settings.fallbackProviderProfileId,
            fallbackRuntimeNodeId: settings.fallbackRuntimeNodeId,
            fallbackModel: settings.fallbackModel,
            fallbackEndpoint: settings.fallbackEndpoint,
            protocolPath: settings.protocolPath,
            templatePath: settings.templatePath,
            finalOutputFolder: settings.finalOutputFolder,
            finalOutputFormat: settings.finalOutputFormat
          });

          nextState[result.source] = analyzed.analysis_path ? "completed" : "ready_for_transcription";
          flushSync(() => {
            setQueueState({ ...nextState });
          });
          logActivity(`${basename(result.source)} ${analyzed.status}: ${analyzed.message}`);

          if (analyzed.analysis_path) {
            logActivity(`Analysis: ${analyzed.analysis_path}`);
          }
        } catch (error) {
          nextState[result.source] = "failed";
          setQueueState({ ...nextState });
          logActivity(`${basename(result.source)} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      flushSync(() => {
        setQueueState(nextState);
        setRunPhase("completed");
        setCurrentFile("");
        setStageElapsedSeconds(null);
      });
      const completedCount = Object.values(nextState).filter((state) => state === "completed").length;
      const failedCount = Object.values(nextState).filter((state) => state === "failed").length;
      setProgressDetail(`Processing finished. ${completedCount} completed, ${failedCount} failed, ${existingFiles.length} already complete.`);
      logActivity("Processing finished.");
      flushSync(() => {
        setRunState("idle");
        setRunStartedAt(null);
      });
    } catch (error) {
      flushSync(() => {
        setRunState("idle");
        setRunPhase("failed");
        setCurrentFile("");
        setRunStartedAt(null);
        setStageElapsedSeconds(null);
        setQueueState(Object.fromEntries(filesToProcess.map((file) => [file, "failed" satisfies QueueState])));
      });
      const message = error instanceof Error ? error.message : String(error);
      setProgressDetail(message);
      logActivity(`Processing failed: ${message}`);
    }
  }

  const recorderValidation = validateRecorder(settings);
  const importValidation = validateImport(settings);
  const whisperValidation = validateWhisper(settings);
  const analysisValidation = validateAnalysis(settings);
  const templateValidation = validateTemplate(settings);
  const queueValidation = {
    ready: pendingFiles.length > 0,
    missing:
      audioFiles.length === 0
        ? ["Start Processing will scan the selected audio folder first"]
        : pendingFiles.length === 0
          ? ["No pending files. Recorder files are already complete."]
          : []
  };

  const configurationValidations = [
    recorderValidation,
    importValidation,
    whisperValidation,
    analysisValidation,
    templateValidation
  ];
  const validations = [...configurationValidations, queueValidation];
  const missingItems = validations.flatMap((validation) => validation.missing);
  const configurationReady = configurationValidations.every((validation) => validation.ready);
  const canStart = configurationReady;
  const backupFolderList = settings.backupFolders
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedProvider =
    settings.analysisMode === "off" || settings.llmProvider === "Analysis off"
      ? offRoute
      : findRoute(providerRoutes, settings.mainProviderProfileId, settings.mainRuntimeNodeId, settings.llmModel) ??
        providerRoutes.find((route) => route.providerProfileId === settings.mainProviderProfileId && route.model === settings.llmModel) ??
        {
          id: providerRouteId(settings.mainProviderProfileId, settings.mainRuntimeNodeId, settings.llmModel),
          providerProfileId: settings.mainProviderProfileId,
          runtimeNodeId: settings.mainRuntimeNodeId,
          label: `${settings.llmProvider} · ${settings.llmModel}`,
          providerLabel: settings.llmProvider,
          providerType: "custom",
          mode: settings.analysisMode,
          endpoint: settings.localEndpoint,
          model: settings.llmModel,
          runtimeLabel: settings.mainRuntimeNodeId || "Configured runtime",
          credentialConfigured: true,
          note: "Configured route from saved Audio2TOL settings."
        };
  const selectedFallbackProvider =
    findRoute(providerRoutes, settings.fallbackProviderProfileId, settings.fallbackRuntimeNodeId, settings.fallbackModel) ??
    providerRoutes.find((route) => route.providerProfileId === settings.fallbackProviderProfileId && route.model === settings.fallbackModel);
  const queueItems =
    pendingFiles.length > 0
      ? pendingFiles.map((file) => ({
          path: file,
          file: file.split("/").pop() || file,
          state: queueState[file] ?? "waiting",
          step: "USB Recorder"
        }))
      : [];
  const queueStates = Object.values(queueState);
  const scannedFilesCount = audioFiles.length;
  const totalFiles = pendingFiles.length;
  const existingCount = existingFiles.length;
  const importedCount = queueStates.filter((state) =>
    ["copied", "skipped", "transcribing", "analyzing", "completed", "ready_for_transcription"].includes(state)
  ).length;
  const transcribedCount = queueStates.filter((state) =>
    ["analyzing", "completed", "ready_for_transcription"].includes(state)
  ).length;
  const processedCount = queueStates.filter((state) => state === "completed").length;
  const failedCount = queueStates.filter((state) => state === "failed").length;
  const queueCount = totalFiles - processedCount - failedCount;
  const scanProgress = totalFiles > 0 ? 1 : runPhase === "scanning" ? 0.45 : 0;
  const importProgress = totalFiles > 0 ? importedCount / totalFiles : 0;
  const transcriptionProgress = totalFiles > 0 ? transcribedCount / totalFiles : 0;
  const analysisProgress = totalFiles > 0 ? processedCount / totalFiles : 0;
  const liveProgress = Math.min(
    100,
    Math.round(((scanProgress + importProgress + transcriptionProgress + analysisProgress) / 4) * 100)
  );
  const overallProgress = runState === "running" || runPhase === "completed" ? liveProgress : 0;
  const statusStages = [
    {
      id: "scan",
      label: "Scan",
      count: totalFiles,
      active: runPhase === "scanning",
      done: totalFiles > 0 && runPhase !== "scanning"
    },
    {
      id: "import",
      label: "Import",
      count: importedCount,
      active: runPhase === "importing",
      done: totalFiles > 0 && importedCount + failedCount >= totalFiles
    },
    {
      id: "transcribe",
      label: "Transcribe",
      count: transcribedCount,
      active: runPhase === "transcribing",
      done: totalFiles > 0 && transcribedCount + failedCount >= totalFiles
    },
    {
      id: "analysis",
      label: "Analyze + Render",
      count: processedCount,
      active: runPhase === "analyzing" || runPhase === "rendering",
      done: totalFiles > 0 && processedCount + failedCount >= totalFiles
    }
  ];
  const phaseLabel =
    runPhase === "idle"
      ? "Waiting for Start Processing."
      : runPhase === "completed"
        ? progressDetail || "Processing complete."
        : runPhase === "failed"
          ? progressDetail || "Processing failed. Check the activity log."
          : `${progressDetail}${stageElapsedSeconds !== null ? ` · ${formatElapsed(stageElapsedSeconds)}` : currentFile ? ` · ${currentFile}` : ""}`;
  const systemStatus =
    runState === "running"
      ? `Processing: ${runPhase}`
      : canStart
        ? "Ready"
        : "Configuration required";
  const progressHeadline =
    runState === "running"
      ? phaseLabel
      : runPhase === "completed"
        ? progressDetail || `Completed ${processedCount} TOL file${processedCount === 1 ? "" : "s"}.`
        : progressDetail || scanMessage || "Ready for a new run.";
  const topStatusCards = [
    {
      id: "recorder",
      number: "01",
      label: "Recorder",
      status:
        runPhase === "scanning"
          ? "Scanning source"
          : scannedFilesCount > 0
            ? `${totalFiles} pending · ${existingCount} complete`
            : recorderValidation.ready
              ? "Source ready"
              : "Needs setup",
      tone: "sage",
      active: runPhase === "scanning",
      done: scannedFilesCount > 0
    },
    {
      id: "import",
      number: "02",
      label: "Import",
      status:
        runPhase === "importing"
          ? `Importing ${importedCount}/${totalFiles || 0}`
          : importedCount > 0
            ? `${importedCount}/${totalFiles || 0} imported`
            : importValidation.ready
              ? "Waiting"
              : "Needs folder",
      tone: "clay",
      active: runPhase === "importing",
      done: totalFiles > 0 && importedCount + failedCount >= totalFiles
    },
    {
      id: "whisper",
      number: "03",
      label: "Whisper",
      status:
        runPhase === "transcribing"
          ? currentFile
            ? `Transcribing ${basename(currentFile)}`
            : "Transcribing"
          : transcribedCount > 0
            ? `${transcribedCount}/${totalFiles || 0} transcribed`
            : whisperValidation.ready
              ? "Waiting"
              : "Needs setup",
      tone: "mineral",
      active: runPhase === "transcribing",
      done: totalFiles > 0 && transcribedCount + failedCount >= totalFiles
    },
    {
      id: "analysis",
      number: "04",
      label: "Analysis",
      status:
        runPhase === "analyzing"
          ? currentFile
            ? `Analyzing ${basename(currentFile)}`
            : "Analyzing"
          : selectedProvider.mode === "off"
            ? "Off"
            : processedCount > 0
              ? `${processedCount}/${totalFiles || 0} analyzed`
              : analysisValidation.ready
                ? "Waiting"
                : "Needs model",
      tone: "moss",
      active: runPhase === "analyzing",
      done: totalFiles > 0 && processedCount + failedCount >= totalFiles
    },
    {
      id: "render",
      number: "05",
      label: "Output",
      status:
        processedCount > 0
          ? `${processedCount} note${processedCount === 1 ? "" : "s"} written`
          : templateValidation.ready
            ? "Waiting"
            : "Needs output",
      tone: "straw",
      active: runPhase === "completed" && processedCount > 0,
      done: totalFiles > 0 && processedCount + failedCount >= totalFiles
    },
    {
      id: "queue",
      number: "06",
      label: "Queue",
      status:
        runState === "running"
          ? `${queueCount} left · ${failedCount} failed`
          : scannedFilesCount > 0
            ? `${totalFiles} pending · ${existingCount} complete`
            : "Waiting for scan",
      tone: "stone",
      active: runState === "running",
      done: totalFiles > 0 && processedCount + failedCount >= totalFiles
    }
  ];

  useEffect(() => {
    if (
      !DEV_AUTOSTART ||
      devAutostartTriggeredRef.current ||
      !configurationReady ||
      runState !== "idle" ||
      scanStatus !== "complete" ||
      audioFiles.length === 0
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      devAutostartTriggeredRef.current = true;
      logActivity("Developer autostart enabled. Launching processing run.");
      void startProcessing();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [audioFiles.length, configurationReady, runState, scanStatus]);

  function badgeToneFor(card: { active: boolean; done: boolean }, validation: ValidationResult) {
    if (card.active) {
      return "active" as const;
    }

    if (card.done) {
      return "done" as const;
    }

    return validation.ready ? "ready" : "missing";
  }

  const steps: PipelineStep[] = [
    {
      id: "recorder",
      number: "01",
      title: "USB Recorder",
      subtitle: "Select the recorder root, then select the subfolder that contains the audio.",
      tone: "sage",
      status: topStatusCards[0].status,
      badgeTone: badgeToneFor(topStatusCards[0], recorderValidation),
      validation: recorderValidation,
      body: (
        <>
          <Field label="Recorder device">
            <input
              value={settings.recorderDevice}
              onChange={(event) => update("recorderDevice", event.target.value)}
              placeholder="Example: Zoom H1n"
            />
          </Field>
          <PathSelector
            label="Recorder root"
            kind="folder"
            value={settings.recorderMountPath}
            placeholder="No recorder root selected"
            onSelect={(value) => update("recorderMountPath", value)}
          />
          <PathSelector
            label="Audio source folder"
            kind="folder"
            value={settings.recorderAudioFolder}
            placeholder="No audio source folder selected"
            hint="Use this when files are inside a recorder subfolder instead of the device root."
            onSelect={(value) => {
              update("recorderAudioFolder", value);
              update("detectedAudioFiles", "0");
              setAudioFiles([]);
              setPendingFiles([]);
              setExistingFiles([]);
              setQueueState({});
              setRunPhase("idle");
              setCurrentFile("");
              setProgressDetail("Audio folder selected. Run scan to detect new files.");
              setStageElapsedSeconds(null);
              setScanStatus("idle");
              setScanMessage("Audio folder selected. Run scan to detect new files.");
            }}
          />
          <div className="detected-card">
            <span className="field-label">New audio files</span>
            <strong>{settings.detectedAudioFiles}</strong>
            <p>{scanMessage || "Run scan after selecting the audio source folder."}</p>
          </div>
          <Field label="Supported formats">
            <input
              value={settings.supportedFormats}
              onChange={(event) => update("supportedFormats", event.target.value)}
            />
          </Field>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.recursiveScan}
              onChange={(event) => update("recursiveScan", event.target.checked)}
            />
            <span>Recursive scan enabled</span>
          </label>
          <button
            className="panel-button"
            type="button"
            onClick={() => {
              void scanAudioFiles();
            }}
            disabled={scanStatus === "scanning"}
          >
            {scanStatus === "scanning" ? "Scanning..." : "Scan audio folder"}
          </button>
          <p className="fixed-rule">Scan target: {settings.recorderAudioFolder || "select the folder that contains audio"}</p>
          {audioFiles.length > 0 ? (
            <div className="audio-preview">
              <span className="field-label">New files queued</span>
              {pendingFiles.slice(0, 5).map((file) => (
                <p key={file}>{file.split("/").pop()}</p>
              ))}
              {pendingFiles.length > 5 ? <p>+ {pendingFiles.length - 5} more</p> : null}
              {existingCount > 0 ? <p>{existingCount} complete</p> : null}
            </div>
          ) : null}
        </>
      )
    },
    {
      id: "import",
      number: "02",
      title: "Audio Import",
      subtitle: "Copy new audio safely while preserving original recorder filenames.",
      tone: "clay",
      status: topStatusCards[1].status,
      badgeTone: badgeToneFor(topStatusCards[1], importValidation),
      validation: importValidation,
      body: (
        <>
          <PathSelector
            label="Primary audio folder"
            kind="folder"
            value={settings.audioFolder}
            placeholder="No audio destination selected"
            onSelect={(value) => update("audioFolder", value)}
          />
          <div className="field backup-field">
            <span className="field-label">Backup folders</span>
            <button className="select-button" type="button" onClick={addBackupFolder}>
              Add backup folder
            </button>
            <div className="backup-list">
              {backupFolderList.length === 0 ? (
                <span className="selected-path">No backup folder selected</span>
              ) : (
                backupFolderList.map((folder) => (
                  <div className="backup-item" key={folder}>
                    <span>{folder}</span>
                    <button type="button" onClick={() => removeBackupFolder(folder)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
            <span className="field-hint">Optional. Local synced folders such as Google Drive are allowed.</span>
          </div>
          <Field label="Duplicate detection">
            <select
              value={settings.duplicateMode}
              onChange={(event) => update("duplicateMode", event.target.value)}
            >
              <option>Filename + size + modified date</option>
              <option>Filename + size + checksum</option>
              <option>Checksum only</option>
            </select>
          </Field>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.preserveOriginalFilename}
              onChange={(event) => update("preserveOriginalFilename", event.target.checked)}
            />
            <span>Preserve original filename</span>
          </label>
          <p className="fixed-rule">Copy only. Never delete files from recorder.</p>
        </>
      )
    },
    {
      id: "whisper",
      number: "03",
      title: "Whisper Transcription",
      subtitle: "Quality-first local transcription for long TOL recordings.",
      tone: "mineral",
      status: topStatusCards[2].status,
      badgeTone: badgeToneFor(topStatusCards[2], whisperValidation),
      validation: whisperValidation,
      body: (
        <>
          <div className={`detected-card ${whisperStatus}`}>
            <span className="field-label">Local Whisper</span>
            <strong>{whisperStatus === "found" ? "Detected" : "Missing"}</strong>
            <p>{whisperMessage}</p>
            {settings.whisperPath ? <p>{settings.whisperPath}</p> : null}
            <div className="inline-actions">
              <button type="button" onClick={detectWhisper} disabled={whisperStatus === "checking" || whisperStatus === "installing"}>
                Detect again
              </button>
              {whisperStatus !== "found" ? (
                <button type="button" onClick={installWhisper} disabled={whisperStatus === "installing"}>
                  Install local Whisper
                </button>
              ) : null}
            </div>
          </div>
          <Field label="Whisper model">
            <select
              value={settings.whisperModel}
              onChange={(event) => update("whisperModel", event.target.value)}
            >
              <option value="large-v3">large-v3</option>
              <option value="large-v2">large-v2</option>
              <option value="medium">medium</option>
              <option value="small">small</option>
              <option value="custom">custom local model path</option>
            </select>
          </Field>
          <PathSelector
            label="Transcript folder"
            kind="folder"
            value={settings.transcriptFolder}
            placeholder="No transcript folder selected"
            onSelect={(value) => update("transcriptFolder", value)}
          />
          <Field label="Transcript format">
            <select
              value={settings.transcriptFormat}
              onChange={(event) => update("transcriptFormat", event.target.value as Format)}
            >
              <option value="md">.md</option>
              <option value="txt">.txt</option>
            </select>
          </Field>
          <Field label="Language">
            <select value={settings.language} onChange={(event) => update("language", event.target.value)}>
              <option>Auto Detect</option>
              <option>English</option>
              <option>Italian</option>
              <option>French</option>
              <option>Spanish</option>
              <option>German</option>
            </select>
          </Field>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.includeTimestamps}
              onChange={(event) => update("includeTimestamps", event.target.checked)}
            />
            <span>Include timestamps in transcript</span>
          </label>
          <p className="fixed-rule">Long-audio mode: chunk, transcribe, stitch, retry failed chunks.</p>
        </>
      )
    },
    {
      id: "analysis",
      number: "04",
      title: "TOL Protocol Analysis",
      subtitle: "Run the Resonant Augmentor protocol with a local or API model.",
      tone: "moss",
      status: topStatusCards[3].status,
      badgeTone: badgeToneFor(topStatusCards[3], analysisValidation),
      validation: analysisValidation,
      body: (
        <>
          <Field label="Main provider">
            <select value={selectedProvider.id} onChange={(event) => selectProvider(event.target.value)}>
              {allProviderRoutes.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="provider-card">
            <span className="field-label">ResonantOS route</span>
            <strong>{selectedProvider.mode === "local" ? "Local" : selectedProvider.mode === "api" ? "Cloud API" : "Off"}</strong>
            <p>{selectedProvider.note}</p>
          </div>
          <Field label="Model">
            <select
              value={settings.llmModel}
              onChange={(event) => {
                const route = providerRoutes.find(
                  (candidate) =>
                    candidate.providerProfileId === settings.mainProviderProfileId &&
                    candidate.runtimeNodeId === settings.mainRuntimeNodeId &&
                    candidate.model === event.target.value,
                );
                if (route) {
                  selectProvider(route.id);
                  return;
                }
                update("llmModel", event.target.value);
              }}
              disabled={selectedProvider.mode === "off"}
            >
              {providerRoutes
                .filter(
                  (route) =>
                    route.providerProfileId === settings.mainProviderProfileId &&
                    route.runtimeNodeId === settings.mainRuntimeNodeId,
                )
                .map((route) => (
                  <option key={route.id} value={route.model}>
                    {route.model}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Fallback provider" hint="Used only if the primary analysis request fails.">
            <select
              value={selectedFallbackProvider?.id ?? ""}
              onChange={(event) => selectFallbackProvider(event.target.value)}
              disabled={providerRoutes.length === 0}
            >
              {providerRoutes.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fallback model">
            <select
              value={settings.fallbackModel}
              onChange={(event) => {
                const route = providerRoutes.find(
                  (candidate) =>
                    candidate.providerProfileId === settings.fallbackProviderProfileId &&
                    candidate.runtimeNodeId === settings.fallbackRuntimeNodeId &&
                    candidate.model === event.target.value,
                );
                if (route) {
                  selectFallbackProvider(route.id);
                  return;
                }
                update("fallbackModel", event.target.value);
              }}
              disabled={providerRoutes.length === 0}
            >
              {providerRoutes
                .filter(
                  (route) =>
                    route.providerProfileId === settings.fallbackProviderProfileId &&
                    route.runtimeNodeId === settings.fallbackRuntimeNodeId,
                )
                .map((route) => (
                  <option key={route.id} value={route.model}>
                    {route.model}
                  </option>
                ))}
            </select>
          </Field>
          <p className="fixed-rule">
            Provider credentials are resolved from ResonantOS. Audio2TOL stores only the selected routes and models.
          </p>
          <PathSelector
            label="TOL protocol"
            kind="file"
            value={settings.protocolPath}
            placeholder="No protocol file selected"
            onSelect={(value) => update("protocolPath", value)}
            filters={[
              { name: "Protocol", extensions: ["md", "txt", "rtf"] }
            ]}
          />
          {selectedProvider.mode === "api" ? (
            <p className="privacy-warning">Cloud mode may send transcript content outside this computer.</p>
          ) : selectedProvider.mode === "local" ? (
            <p className="fixed-rule">Local-first analysis. Current provider target: {settings.llmProvider}.</p>
          ) : (
            <p className="fixed-rule">Analysis is off. The app will only transcribe audio.</p>
          )}
        </>
      )
    },
    {
      id: "render",
      number: "05",
      title: "Obsidian Template Rendering",
      subtitle: "Create final TOL analysis files from your markdown template.",
      tone: "straw",
      status: topStatusCards[4].status,
      badgeTone: badgeToneFor(topStatusCards[4], templateValidation),
      validation: templateValidation,
      body: (
        <>
          <PathSelector
            label="Template file"
            kind="file"
            value={settings.templatePath}
            placeholder="No template file selected"
            onSelect={(value) => update("templatePath", value)}
            filters={[
              { name: "Template", extensions: ["md", "txt"] }
            ]}
          />
          <PathSelector
            label="Final output folder"
            kind="folder"
            value={settings.finalOutputFolder}
            placeholder="No final output folder selected"
            onSelect={(value) => update("finalOutputFolder", value)}
          />
          <Field label="Final output format">
            <select
              value={settings.finalOutputFormat}
              onChange={(event) => update("finalOutputFormat", event.target.value as Format)}
            >
              <option value="md">.md</option>
              <option value="txt">.txt</option>
            </select>
          </Field>
          <div className="filename-preview">
            <span>Filename pattern</span>
            <strong>YYYY-MM-DD-HHmm_TOL_Analysis.{settings.finalOutputFormat}</strong>
          </div>
          <p className="fixed-rule">
            Transcript links adapt to the selected transcript format: .{settings.transcriptFormat}
          </p>
        </>
      )
    },
    {
      id: "queue",
      number: "06",
      title: "Queue And Activity Log",
      subtitle: "A visible file-by-file ledger of what the system is doing.",
      tone: "stone",
      status: topStatusCards[5].status,
      badgeTone: badgeToneFor(topStatusCards[5], queueValidation),
      validation: queueValidation,
      body: (
        <>
          <div className="queue-list">
            {queueItems.length === 0 ? (
              <div className="queue-item empty">
                <strong>{audioFiles.length > 0 ? "No new audio files pending" : "No audio files detected"}</strong>
                <span>
                  {audioFiles.length > 0
                    ? "Recorder files are already complete."
                    : "Select the source folder and run Scan audio folder."}
                </span>
                <em>USB Recorder</em>
              </div>
            ) : null}
            {queueItems.map((item) => (
              <div className="queue-item" key={item.path}>
                <strong>{item.file}</strong>
                <span>{item.state.replaceAll("_", " ")}</span>
                <em>{canStart ? "Import stage ready" : item.step}</em>
              </div>
            ))}
          </div>
          <div className="activity-panel">
            <span>Live activity</span>
            {activityLog.map((item, index) => (
              <p key={`${index}-${item}`}>{item}</p>
            ))}
          </div>
        </>
      )
    }
  ];

  return (
    <main className="app-shell">
      <header className="hero-panel" ref={heroPanelRef}>
        <div className="hero-copy">
          <p className="eyebrow">Think Out Loud Signal Processor</p>
          <h1>Audio2TOL</h1>
          <p>
            A local-first vertical pipeline from USB recorder to Obsidian-ready TOL analysis.
          </p>
          <div className="hero-dashboard">
            <div className="hero-metric">
              <span>Run Progress</span>
              <strong>{overallProgress}%</strong>
            </div>
            <div className="hero-metric">
              <span>Elapsed</span>
              <strong>{formatElapsed(elapsedSeconds)}</strong>
            </div>
            <div className="hero-metric">
              <span>Current File</span>
              <strong>{currentFile || "Waiting"}</strong>
            </div>
          </div>
          <div className="progress-meter" aria-label="Overall pipeline progress">
            <div className="progress-meter-fill" style={{ width: `${overallProgress}%` }} />
          </div>
          <p className="hero-status-line">{progressHeadline}</p>
        </div>
        <div className="run-console">
          <div className="system-status">
            <span>System status</span>
            <strong>{systemStatus}</strong>
          </div>
          <div className="run-actions">
            <button
              className="start-button"
              type="button"
              disabled={!canStart || runState === "running"}
              onClick={startProcessing}
            >
              {runState === "running" ? "Processing..." : "Start Processing"}
            </button>
            <button type="button" onClick={() => setRunState("paused")} disabled={runState !== "running"}>
              Pause
            </button>
            <button type="button" onClick={() => setRunState("idle")}>
              Stop
            </button>
            <button type="button" onClick={resetSettings}>
              Reset
            </button>
            <button type="button" className="settings-toggle" onClick={() => setSettingsOpen((current) => !current)}>
              {settingsOpen ? "Close Settings" : "Settings"}
            </button>
          </div>
          <div className="readiness-card">
            <span>Guided readiness</span>
            {missingItems.length === 0 ? (
              <p>All required blocks are configured.</p>
            ) : (
              missingItems.slice(0, 5).map((item) => <p key={item}>{item}</p>)
            )}
          </div>
        </div>
        <div className={`process-strip phase-${runPhase}`}>
          <div className="process-summary">
            <span>Audio to ingest</span>
            <strong>{totalFiles}</strong>
          </div>
          <div className="stage-track" aria-label="Processing stages">
            {statusStages.map((stage) => (
              <div
                className={`stage-node ${stage.active ? "active" : ""} ${stage.done ? "done" : ""}`}
                key={stage.id}
              >
                <span>{stage.label}</span>
                <strong>
                  {stage.count}/{totalFiles || 0}
                </strong>
              </div>
            ))}
          </div>
          <div className="process-summary end">
            <span>TOL processed</span>
            <strong>{processedCount}</strong>
          </div>
          <p className="current-phase">{phaseLabel}</p>
        </div>
        <div className="top-status-grid" aria-label="Pipeline block status">
          {topStatusCards.map((card) => (
            <article
              className={`top-status-card ${card.tone} ${card.active ? "active" : ""} ${card.done ? "done" : ""}`}
              key={card.id}
            >
              <span className="top-status-number">{card.number}</span>
              <strong>{card.label}</strong>
              <p>{card.status}</p>
            </article>
          ))}
        </div>
        <div className="live-feed">
          <div className="live-feed-panel">
            <span>Live activity</span>
            {activityLog.slice(0, 5).map((item, index) => (
              <p key={`${index}-${item}`}>{item}</p>
            ))}
          </div>
          <div className="live-feed-panel">
            <span>Batch status</span>
            <p>{processedCount} processed</p>
            <p>{queueCount} still in queue</p>
            <p>{failedCount} failed</p>
            <p>{existingCount} complete</p>
            <p>{scannedFilesCount} scanned this run</p>
          </div>
        </div>
      </header>

      <section className={`settings-shell ${settingsOpen ? "open" : "closed"}`} ref={settingsShellRef}>
        {settingsOpen ? <div className="signal-path" aria-hidden="true" /> : null}
        {settingsOpen ? (
          <section className="pipeline">
            {steps.map((step, index) => (
              <div className="step-wrapper" key={step.id}>
                <PipelineBlock step={step} />
                {index < steps.length - 1 ? <div className="flow-connector" aria-hidden="true" /> : null}
              </div>
            ))}
          </section>
        ) : (
          <div className="settings-collapsed">
            <p>Settings are hidden. Open them to change folders, Whisper, providers, protocol, and template.</p>
          </div>
        )}
      </section>
    </main>
  );
}

export function Audio2TolPipelineWorkspace(props: Audio2TolPipelineWorkspaceProps) {
  return (
    <div className="audio2tol-embedded">
      <AppErrorBoundary>
        <AppShell {...props} />
      </AppErrorBoundary>
    </div>
  );
}
