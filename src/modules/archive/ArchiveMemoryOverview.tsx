// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-022-portable-user-state-secure-vault.md

import { useState } from "react";
import type {
  ArchiveAiMemoryBuildJobSummary,
  ArchiveAiMemoryBuildResult,
  ArchiveImportedLibrarySummary,
  ArchiveQueuedIngestRequest,
  ArchiveReviewArtifact,
  ChatRunPhase,
  ConversationThread,
} from "../../core/contracts";
import { Panel } from "../../components/Panel";
import { selectArchiveRecommendedAction, selectLatestArchiveBuild } from "./archive-action-center";

type ArchiveMemoryOverviewProps = {
  archiveImportedLibraries: ArchiveImportedLibrarySummary[];
  archiveAiMemoryBuildResult: ArchiveAiMemoryBuildResult | null;
  archiveAiMemoryBuildJobs: ArchiveAiMemoryBuildJobSummary[];
  archiveQueue: ArchiveQueuedIngestRequest[];
  archiveReviewArtifacts: ArchiveReviewArtifact[];
  needsWork: number;
  onOpenSources: () => void;
  onOpenReview: () => void;
  onImportAnother: () => void;
  onBuildAiMemory: (manifestPath: string) => Promise<void>;
  onRunArchiveMaintenance: () => Promise<void>;
  onPromoteApprovedArtifacts: () => Promise<void>;
  onAskAugmentor: (message: string) => Promise<void>;
  archiveAgentThread: ConversationThread | null;
  archiveAgentBusy: boolean;
  archiveAgentRunPhase: ChatRunPhase;
  archiveAgentActivityLabel: string;
};

export function ArchiveMemoryOverview({
  archiveImportedLibraries,
  archiveAiMemoryBuildResult,
  archiveAiMemoryBuildJobs,
  archiveQueue,
  archiveReviewArtifacts,
  needsWork,
  onOpenSources,
  onOpenReview,
  onImportAnother,
  onBuildAiMemory,
  onRunArchiveMaintenance,
  onPromoteApprovedArtifacts,
  onAskAugmentor,
  archiveAgentThread,
  archiveAgentBusy,
  archiveAgentRunPhase,
  archiveAgentActivityLabel,
}: ArchiveMemoryOverviewProps) {
  const [agentPrompt, setAgentPrompt] = useState("Set up my Living Archive. Ask me only what you need, then handle the rest.");
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentActionBusy, setAgentActionBusy] = useState(false);
  const latestLibrary = archiveImportedLibraries[0];
  const latestBuild = selectLatestArchiveBuild(latestLibrary, archiveAiMemoryBuildResult, archiveAiMemoryBuildJobs);
  const recommendedAction = selectArchiveRecommendedAction({
    latestLibrary,
    latestBuild,
    archiveQueue,
    archiveReviewArtifacts,
  });
  const filesImported = archiveImportedLibraries.reduce((total, library) => total + library.filesImported, 0);
  const runRecommendedAction = async ({ keepStatus = false }: { keepStatus?: boolean } = {}): Promise<string> => {
    setAgentActionBusy(true);
    setAgentStatus(`${recommendedAction.buttonLabel} is running...`);
    try {
      switch (recommendedAction.kind) {
        case "import":
          onImportAnother();
          return "I opened the folder import flow.";
        case "build":
        case "continue":
        case "repair":
          if (recommendedAction.manifestPath) {
            await onBuildAiMemory(recommendedAction.manifestPath);
            return `I ran ${recommendedAction.buttonLabel}.`;
          }
          return "I could not run the AI Memory action because no import manifest is available.";
        case "promote":
          await onPromoteApprovedArtifacts();
          return "I promoted the approved archive artifacts.";
        case "maintenance":
          await onRunArchiveMaintenance();
          return "I ran Living Archive maintenance.";
        case "review-exceptions":
          onOpenReview();
          return "I opened the exceptions that need human judgment.";
        case "complete":
          onOpenSources();
          return "I opened the current archive structure.";
      }
    } finally {
      setAgentActionBusy(false);
      if (!keepStatus) {
        setAgentStatus(`${recommendedAction.buttonLabel} finished.`);
      }
    }
  };
  const askAugmentor = async () => {
    const message = agentPrompt.trim();
    if (!message) {
      return;
    }
    setAgentStatus("Running archive tools...");
    const toolResult =
      recommendedAction.kind === "build" ||
      recommendedAction.kind === "continue" ||
      recommendedAction.kind === "repair" ||
      recommendedAction.kind === "maintenance" ||
      recommendedAction.kind === "promote"
        ? await runRecommendedAction({ keepStatus: true })
        : "No archive tool was required before this reply.";
    setAgentStatus("Asking Augmentor inside this workspace...");
    await onAskAugmentor(
      [
        "You are helping me configure the Living Archive in ResonantOS.",
        "Do the work for me where possible. Ask only one necessary question at a time.",
        "This conversation is happening inside the Living Archive workspace. Do not tell the user to move to the right chat rail.",
        `Archive tool result before this reply: ${toolResult}`,
        latestLibrary
          ? `Current imported library: ${latestLibrary.libraryName} at ${latestLibrary.canonicalRoot}.`
          : "No library is imported yet.",
        `Recommended next action from the archive system: ${recommendedAction.title}. ${recommendedAction.description}`,
        `My request: ${message}`,
      ].join("\n"),
    );
    setAgentStatus(null);
  };
  const working = archiveAgentBusy || agentActionBusy;
  const idleStatus = latestLibrary
    ? `Ready. Next: ${recommendedAction.buttonLabel}.`
    : "Ready. Add a folder to start building your memory.";
  const visibleStatus =
    agentStatus ??
    (archiveAgentBusy
      ? archiveAgentActivityLabel || (archiveAgentRunPhase === "idle" ? "Augmentor is working..." : archiveAgentRunPhase)
      : idleStatus);

  return (
    <Panel className="archive-memory-overview-panel">
      <form
        className="archive-agent-console"
        onSubmit={(event) => {
          event.preventDefault();
          void askAugmentor();
        }}
      >
        <div className="archive-agent-console-head">
          <span className="archive-agent-orb" aria-hidden="true" />
          <div>
            <span className="eyebrow">Living Archive Agent</span>
            <h3>Tell Augmentor what to do with your memory.</h3>
          </div>
        </div>
        <textarea
          aria-label="Ask Augmentor to configure the Living Archive"
          value={agentPrompt}
          onChange={(event) => setAgentPrompt(event.target.value)}
          rows={3}
        />
        <div className="archive-agent-console-actions">
          <button type="button" className="button-secondary touch-action" onClick={onImportAnother}>
            Add Folder
          </button>
          <button type="button" className="button-secondary touch-action" onClick={() => void runRecommendedAction()} disabled={working}>
            {agentActionBusy ? "Working..." : recommendedAction.buttonLabel}
          </button>
          <button type="submit" className="button-primary touch-action" aria-label="Ask Augmentor from Living Archive Agent" disabled={working}>
            {working ? "Working..." : "Ask Augmentor"}
          </button>
        </div>
        <div className={`archive-agent-live-status ${working ? "active" : ""}`} role="status" aria-live="polite">
          <span className="archive-agent-pulse" aria-hidden="true" />
          <p>{visibleStatus}</p>
        </div>
        {archiveAgentThread?.messages.length ? (
          <div className="archive-agent-dialogue" aria-label="Living Archive Agent conversation">
            {archiveAgentThread.messages.slice(-6).map((message) => (
              <article key={message.id} className={`archive-agent-message ${message.role}`}>
                <strong>{message.role === "user" ? "You" : message.author}</strong>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        ) : null}
        <div className="archive-agent-console-foot" aria-label="Living Archive status">
          <span>{latestLibrary ? "Memory connected" : "No folder yet"}</span>
          {latestLibrary ? <span>{filesImported.toLocaleString()} managed file(s)</span> : null}
          <span>{needsWork ? "AI has work queued" : "No visible queue"}</span>
        </div>
        {latestLibrary ? (
          <details className="archive-agent-memory-details">
            <summary>{latestLibrary.libraryName}</summary>
            <p>{latestLibrary.canonicalRoot}</p>
          </details>
        ) : null}
      </form>
    </Panel>
  );
}
