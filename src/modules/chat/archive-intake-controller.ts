// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import type { Dispatch, SetStateAction } from "react";
import type { ArchiveQueuedIngestRequest, ArchiveReviewArtifact, ConversationMessage, ConversationThread } from "../../core/contracts";
import type { MemoryProviderBroker } from "../../core/memory-provider";
import { livingArchiveMemoryProvider } from "../../core/memory-provider";

type SaveChatMessageToArchiveInput = {
  thread: ConversationThread;
  message: ConversationMessage;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveQueue: Dispatch<SetStateAction<ArchiveQueuedIngestRequest[]>>;
  setArchiveReviewArtifacts: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
  memoryProvider?: MemoryProviderBroker;
  errorMessageOf: (error: unknown, fallback: string) => string;
};

const safeSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52) || "chat-insight";

const previousUserMessageFor = (thread: ConversationThread, message: ConversationMessage): ConversationMessage | null => {
  const messageIndex = thread.messages.findIndex((item) => item.id === message.id);
  if (messageIndex <= 0) {
    return null;
  }
  return [...thread.messages.slice(0, messageIndex)].reverse().find((item) => item.role === "user") ?? null;
};

const chatInsightMarkdown = (thread: ConversationThread, message: ConversationMessage): string => {
  const previousUserMessage = previousUserMessageFor(thread, message);

  return [
    "---",
    "source_type: chat_insight",
    `thread_id: ${thread.id}`,
    `message_id: ${message.id}`,
    `channel_id: ${message.channelId}`,
    `captured_at: ${new Date().toISOString()}`,
    "---",
    "",
    `# Chat Insight: ${thread.title}`,
    "",
    `Author: ${message.author}`,
    `Created: ${message.createdAt}`,
    "",
    previousUserMessage ? "## User Prompt Context" : "",
    previousUserMessage?.content ?? "",
    previousUserMessage ? "" : "",
    "## Assistant Message",
    "",
    message.content,
    "",
    message.archiveCitations?.length ? "## Archive Citations Used" : "",
    ...(message.archiveCitations?.map((citation) => `- ${citation.title} (${citation.pageType}) — ${citation.path}`) ?? []),
  ]
    .filter((line) => line !== "")
    .join("\n");
};

export const saveChatMessageToArchiveIntake = async ({
  thread,
  message,
  setChatNotice,
  setArchiveQueueBusy,
  setArchiveQueue,
  setArchiveReviewArtifacts,
  memoryProvider = livingArchiveMemoryProvider(),
  errorMessageOf,
}: SaveChatMessageToArchiveInput): Promise<void> => {
  if (message.role !== "assistant") {
    setChatNotice("Only assistant messages can be saved to Living Archive intake.");
    return;
  }

  setArchiveQueueBusy(true);
  setChatNotice("Saving chat insight to Living Archive intake...");
  try {
    if (!memoryProvider.supports.intakeWrite || !memoryProvider.supports.ingestRequest || !memoryProvider.supports.review) {
      throw new Error(`${memoryProvider.label} does not support chat insight intake yet.`);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${stamp}-${safeSlug(thread.title)}.md`;
    const intake = await memoryProvider.intakeWrite({
      actorId: "strategist.core",
      bucket: "chat-insights",
      fileName,
      content: chatInsightMarkdown(thread, message),
      metadata: {
        origin: "strategist-chat",
        threadId: thread.id,
        messageId: message.id,
        channelId: message.channelId,
        author: message.author,
        createdAt: message.createdAt,
        archiveCitations: message.archiveCitations ?? [],
      },
    });

    await memoryProvider.ingestRequest({
      actorId: "strategist.core",
      sourcePath: intake.artifactPath,
      sourceType: "chat_insight",
      sourceRole: "strategist-chat",
      intent: "review-and-ingest",
      provenance: {
        origin: "strategist-chat",
        bucket: intake.bucket,
        metadataPath: intake.metadataPath,
        threadId: thread.id,
        messageId: message.id,
      },
    });

    const [queue, artifacts] = await Promise.all([memoryProvider.reviewQueue(), memoryProvider.reviewArtifacts()]);
    setArchiveQueue(queue);
    setArchiveReviewArtifacts(artifacts);
    setChatNotice("Saved chat insight to Living Archive intake and queued it for review.");
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to save chat insight to Living Archive intake."));
  } finally {
    setArchiveQueueBusy(false);
  }
};
