// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import type {
  AddOnInstallation,
  AddOnManifest,
  ChannelDefinition,
  ConversationThread,
  ProviderProfile,
  ProviderRuntimeNode,
  ResonantShellState,
} from "../../core/contracts";
import { resolveProviderPath, strategistDisplayName } from "../../core/policies";
import {
  resolveAgentChatRoute,
  resolveStrategistChatRoute,
  type ProviderRouteResolution,
} from "../../core/provider-service";
import {
  CONTEXT_WARNING_CHARS,
  estimateContextCharacters,
  formatCompactCount,
} from "../chat/utils";
import type { ComposerAttachment } from "../chat/types";

type ViewModelInput = {
  state: ResonantShellState;
  bundled: AddOnManifest[];
  sideloaded: AddOnManifest[];
  deferredSearch: string;
  selectedAddonId: string;
  composer: string;
  attachments: ComposerAttachment[];
  selectedChatModel: string;
};

export type ShellViewModel = {
  allManifests: AddOnManifest[];
  filteredManifests: AddOnManifest[];
  currentSection: ResonantShellState["uiPreferences"]["activeSection"];
  displayedStrategistName: string;
  selectedManifest: AddOnManifest | null;
  selectedInstallation: AddOnInstallation | null;
  recoveryModeActive: boolean;
  visibleThreads: ConversationThread[];
  activeThread: ConversationThread | null;
  activeThreadChannel: ChannelDefinition | null;
  strategist: ResonantShellState["agents"][number] | undefined;
  engineerAgent: ResonantShellState["agents"][number] | undefined;
  strategistRoute: ProviderRouteResolution;
  activeRoute: ProviderRouteResolution;
  activeProvider: ProviderProfile | undefined;
  activeRuntimeNode: ProviderRuntimeNode | undefined;
  activeChatModel: string;
  strategistRecoveryActive: boolean;
  contextUsageRatio: number;
  contextUsageLabel: string;
  contextUsageTitle: string;
  dictationAvailable: boolean;
};

export const resolveActiveProviderForSelection = (
  state: ResonantShellState | null,
  selectedChatModel: string,
): ProviderProfile | undefined => {
  if (!state) {
    return undefined;
  }

  const activeAgentId = state.recoverySession.active ? state.recoverySession.engineerAgentId : "strategist.core";
  return (
    resolveAgentChatRoute(state, activeAgentId, selectedChatModel).provider ??
    resolveProviderPath(
      state.providers.find(
        (profile) =>
          profile.id === state.agents.find((agent) => agent.id === activeAgentId)?.providerProfileId,
      ),
      state.providers.find(
        (profile) =>
          profile.id === state.agents.find((agent) => agent.id === activeAgentId)?.fallbackProviderProfileId,
      ),
    ).active
  );
};

export const buildShellViewModel = ({
  state,
  bundled,
  sideloaded,
  deferredSearch,
  selectedAddonId,
  composer,
  attachments,
  selectedChatModel,
}: ViewModelInput): ShellViewModel => {
  const allManifests = [...bundled, ...sideloaded];
  const needle = deferredSearch.trim().toLowerCase();
  const filteredManifests = !needle
    ? allManifests
    : allManifests.filter((manifest) => {
        const haystack = `${manifest.name} ${manifest.category} ${manifest.description}`.toLowerCase();
        return haystack.includes(needle);
      });
  const manifestMap = new Map(allManifests.map((manifest) => [manifest.id, manifest]));
  const displayedStrategistName = strategistDisplayName(state);
  const selectedManifest =
    manifestMap.get(selectedAddonId) ?? filteredManifests[0] ?? bundled[0] ?? sideloaded[0] ?? null;
  const selectedInstallation = selectedManifest ? state.installations[selectedManifest.id] ?? null : null;
  const recoveryModeActive = state.recoverySession.active;
  const strategistThreads = state.conversationThreads.filter((thread) => thread.owningAgentId === "strategist.core");
  const engineerThreads = state.conversationThreads.filter(
    (thread) => thread.owningAgentId === state.recoverySession.engineerAgentId,
  );
  const visibleThreads = recoveryModeActive ? engineerThreads : strategistThreads;
  const activeThread =
    visibleThreads.find((thread) => thread.id === state.uiPreferences.activeChatThreadId) ??
    visibleThreads[0] ??
    null;
  const activeThreadChannel = activeThread
    ? state.channels.find((channel) => channel.id === activeThread.channelId) ?? null
    : null;
  const strategist = state.agents.find((agent) => agent.id === "strategist.core");
  const engineerAgent = state.agents.find((agent) => agent.id === state.recoverySession.engineerAgentId);
  const providerResolution = resolveProviderPath(
    state.providers.find((profile) => profile.id === strategist?.providerProfileId),
    state.providers.find((profile) => profile.id === strategist?.fallbackProviderProfileId),
  );
  const activeAgentId = recoveryModeActive ? state.recoverySession.engineerAgentId : "strategist.core";
  const activeRoute = resolveAgentChatRoute(state, activeAgentId, selectedChatModel);
  const strategistRoute = resolveStrategistChatRoute(state, selectedChatModel);
  const activeProvider = activeRoute.provider ?? providerResolution.active;
  const activeRuntimeNode = activeRoute.runtimeNode;
  const activeChatModel =
    selectedChatModel && activeProvider?.allowedModels.includes(selectedChatModel)
      ? selectedChatModel
      : activeRoute.model || activeProvider?.primaryModel || "";
  const strategistRecoveryActive =
    recoveryModeActive || strategist?.providerProfileId === "shared-local" || activeRuntimeNode?.kind === "local";
  const contextChars = estimateContextCharacters(activeThread, composer, attachments);
  const contextUsageRatio = Math.min(contextChars / CONTEXT_WARNING_CHARS, 1);
  const contextUsageLabel = `${Math.round(contextUsageRatio * 100)}%`;
  const contextUsageTitle =
    `Estimated session context: ${formatCompactCount(contextChars)} chars of ~${formatCompactCount(
      CONTEXT_WARNING_CHARS,
    )} before compaction pressure should start to matter. ` +
    "This is currently a shell-side estimate, not a tokenizer-accurate counter or a live compaction system yet.";

  return {
    allManifests,
    filteredManifests,
    currentSection: state.uiPreferences.activeSection,
    displayedStrategistName,
    selectedManifest,
    selectedInstallation,
    recoveryModeActive,
    visibleThreads,
    activeThread,
    activeThreadChannel,
    strategist,
    engineerAgent,
    strategistRoute,
    activeRoute,
    activeProvider,
    activeRuntimeNode,
    activeChatModel,
    strategistRecoveryActive,
    contextUsageRatio,
    contextUsageLabel,
    contextUsageTitle,
    dictationAvailable: typeof window !== "undefined",
  };
};
