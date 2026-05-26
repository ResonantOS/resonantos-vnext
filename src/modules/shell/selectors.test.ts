import { describe, expect, it } from "vitest";
import type { ConversationThread } from "../../core/contracts";
import { buildDefaultState } from "../../core/defaults";
import { buildShellViewModel, resolveSelectableChatModelsForSelection } from "./selectors";

describe("Hermes chat model selection", () => {
  it("uses Hermes' configured local model instead of the generic agent route", () => {
    const state = buildDefaultState([]);
    state.installations["addon.hermes"] = {
      ...state.installations["addon.hermes"],
      installed: true,
      enabled: true,
      status: "enabled",
      config: {
        ...(state.installations["addon.hermes"]?.config ?? {}),
        hermesModel: "gemma-4-26b-a4b-q4_k_m.gguf",
        hermesAvailableModels: ["gemma-4-26b-a4b-q4_k_m.gguf"],
      },
    };
    const hermesThread =
      state.conversationThreads.find((thread) => thread.owningAgentId === "hermes.agent") ??
      ({
        id: "thread-hermes-selector-test",
        title: "Hermes selector test",
        owningAgentId: "hermes.agent",
        workspaceId: "workspace-hermes",
        channelId: "desktop-hermes",
        summary: "",
        messages: [],
      } satisfies ConversationThread);
    state.conversationThreads = [hermesThread, ...state.conversationThreads.filter((thread) => thread.id !== hermesThread.id)];
    state.uiPreferences.activeChatThreadId = hermesThread.id;

    const selectable = resolveSelectableChatModelsForSelection(state, hermesThread.id);
    const viewModel = buildShellViewModel({
      state,
      bundled: [],
      sideloaded: [],
      deferredSearch: "",
      selectedAddonId: "",
      composer: "",
      attachments: [],
      selectedChatModel: "",
    });

    expect(selectable).toEqual(["gemma-4-26b-a4b-q4_k_m.gguf"]);
    expect(viewModel.activeChatModel).toBe("gemma-4-26b-a4b-q4_k_m.gguf");
  });
});
