// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import type { ComposerAttachment } from "../chat/types";
import { createStrategistThread } from "../../core/chat";
import type { ChannelDefinition, ResonantShellState } from "../../core/contracts";

type RuntimeStateUpdater = (updater: (current: ResonantShellState) => ResonantShellState) => void;

type CreateChatInput = {
  state: ResonantShellState;
  activeChannel: ChannelDefinition | null;
  updateRuntimeState: RuntimeStateUpdater;
  setComposer: (value: string) => void;
  setAttachments: (value: ComposerAttachment[]) => void;
  setChatNotice: (value: string | null) => void;
};

export const renameStrategistIdentity = (
  value: string,
  updateRuntimeState: RuntimeStateUpdater,
): void => {
  updateRuntimeState((draft) => {
    draft.strategistIdentity.customName = value || undefined;
    const strategist = draft.agents.find((agent) => agent.id === "strategist.core");
    if (strategist) {
      strategist.displayName = value || draft.strategistIdentity.defaultName;
    }
    return draft;
  });
};

export const activateChatThread = (
  threadId: string,
  updateRuntimeState: RuntimeStateUpdater,
  setComposer: (value: string) => void,
  setChatNotice: (value: string | null) => void,
  setAttachments: (value: ComposerAttachment[]) => void,
): void => {
  updateRuntimeState((draft) => {
    draft.uiPreferences.activeChatThreadId = threadId;
    return draft;
  });
  setComposer("");
  setChatNotice(null);
  setAttachments([]);
};

export const createNewStrategistChat = ({
  state,
  activeChannel,
  updateRuntimeState,
  setComposer,
  setAttachments,
  setChatNotice,
}: CreateChatInput): void => {
  if (state.recoverySession.active) {
    return;
  }

  const channel = activeChannel ?? state.channels.find((item) => item.id === "desktop-main") ?? state.channels[0] ?? null;
  if (!channel) {
    return;
  }

  updateRuntimeState((draft) =>
    createStrategistThread(draft, {
      channelId: channel.id,
      workspaceId: channel.workspaceId,
    }),
  );
  setComposer("");
  setAttachments([]);
  setChatNotice(null);
};

export const toggleStrategistChannel = (
  channelId: string,
  updateRuntimeState: RuntimeStateUpdater,
): void => {
  updateRuntimeState((draft) => {
    const channel = draft.channels.find((item) => item.id === channelId);
    if (channel) {
      channel.enabled = !channel.enabled;
    }
    return draft;
  });
};
