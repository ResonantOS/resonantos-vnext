// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-010-recovery-ladder.md

import { createEngineerThread } from "../../core/chat";
import type { RecoveryRouteCandidate, ResonantShellState } from "../../core/contracts";

type RuntimeStateUpdater = (updater: (current: ResonantShellState) => ResonantShellState) => void;

export const RECOVERY_RUNBOOK_PROMPT =
  "Start the emergency recovery runbook now. First establish the facts, verify the local recovery floor, then probe internet, provider routes, and configured runtime nodes. Prioritize restoring access to a stronger model, promote onto the best validated route, and keep the recovery log updated with every meaningful action.";

export const setRecoveryMode = (
  enabled: boolean,
  updateRuntimeState: RuntimeStateUpdater,
  setChatNotice: (value: string | null) => void,
  setAgentActivityLabel: (value: string) => void,
  setSelectedChatModel: (value: string) => void,
): void => {
  updateRuntimeState((draft) => {
    const engineerAgent = draft.agents.find((agent) => agent.id === draft.recoverySession.engineerAgentId);
    if (engineerAgent) {
      engineerAgent.providerProfileId = "shared-local";
      engineerAgent.fallbackProviderProfileId = "shared-minimax";
    }
    draft.recoverySession.active = enabled;
    if (enabled) {
      draft.recoverySession.lastNormalThreadId = draft.uiPreferences.activeChatThreadId;
      draft.recoverySession.changeLog = [
        ...draft.recoverySession.changeLog,
        `${new Date().toISOString()}: Entered recovery mode and activated the Resonant Engineer Agent on the recovery console.`,
      ];
      draft.recoverySession.checklist = draft.recoverySession.checklist.map((step, index) => ({
        ...step,
        status: index === 0 ? "active" : "pending",
      }));
      return createEngineerThread(draft);
    }
    draft.recoverySession.changeLog = [
      ...draft.recoverySession.changeLog,
      `${new Date().toISOString()}: Exited recovery mode and returned control to the Strategist.`,
    ];
    draft.recoverySession.checklist = draft.recoverySession.checklist.map((step) => ({
      ...step,
      status: step.id === "report" ? "complete" : "pending",
    }));
    draft.uiPreferences.activeChatThreadId = draft.recoverySession.lastNormalThreadId || "thread-main-desktop";
    return draft;
  });
  setChatNotice(
    enabled
      ? "Recovery mode active. Strategist and archive ingest are offline while the Resonant Engineer Agent handles diagnosis and repair."
      : "Recovery mode closed. Control returned to the Strategist.",
  );
  setAgentActivityLabel(
    enabled
      ? "Awaiting recovery start. Press Start Recovery to begin diagnosis."
      : "Standing by on the primary Strategist route.",
  );
  setSelectedChatModel("");
};

export const promoteRecoveryRoute = (
  candidate: RecoveryRouteCandidate,
  updateRuntimeState: RuntimeStateUpdater,
  setSelectedChatModel: (value: string) => void,
  setChatNotice: (value: string | null) => void,
  setAgentActivityLabel: (value: string) => void,
): void => {
  updateRuntimeState((draft) => {
    const engineer = draft.agents.find((agent) => agent.id === draft.recoverySession.engineerAgentId);
    if (engineer) {
      engineer.providerProfileId = candidate.providerId;
      engineer.fallbackProviderProfileId = candidate.providerId === "shared-local" ? "shared-minimax" : "shared-local";
    }
    draft.recoverySession.changeLog = [
      ...draft.recoverySession.changeLog,
      `${new Date().toISOString()}: [completed] promote_route — Promoted the Resonant Engineer Agent to ${candidate.providerLabel} via ${candidate.runtimeNodeLabel} (${candidate.model}).`,
    ];
    draft.recoverySession.checklist = draft.recoverySession.checklist.map((step) => {
      if (step.id === "better-brain") {
        return { ...step, status: "complete" as const };
      }
      if (step.id === "promote") {
        return { ...step, status: "complete" as const };
      }
      if (step.id === "deep-diagnosis" && step.status === "pending") {
        return { ...step, status: "active" as const };
      }
      return step;
    });
    return draft;
  });
  setSelectedChatModel(candidate.model);
  setChatNotice(`Promoted recovery to ${candidate.providerLabel} on ${candidate.model}.`);
  setAgentActivityLabel(`Promoted onto ${candidate.model} via ${candidate.runtimeNodeLabel}.`);
};
