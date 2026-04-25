// Intent citation: docs/architecture/ADR-002-modular-codebase.md
// Intent citation: docs/architecture/ADR-011-living-archive-host-service.md

import type { Dispatch, SetStateAction } from "react";
import type { ArchiveQueuedIngestRequest, ArchiveReviewArtifact, ConversationMessage, ConversationThread } from "../../core/contracts";
import {
  requestArchiveIngestRequest,
  requestArchiveIntakeWrite,
  requestArchiveReviewArtifacts,
  requestArchiveReviewQueue,
} from "../../core/runtime";

type SaveChatMessageToArchiveInput = {
  thread: ConversationThread;
  message: ConversationMessage;
  setChatNotice: Dispatch<SetStateAction<string | null>>;
  setArchiveQueueBusy: Dispatch<SetStateAction<boolean>>;
  setArchiveQueue: Dispatch<SetStateAction<ArchiveQueuedIngestRequest[]>>;
  setArchiveReviewArtifacts: Dispatch<SetStateAction<ArchiveReviewArtifact[]>>;
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
  errorMessageOf,
}: SaveChatMessageToArchiveInput): Promise<void> => {
  if (message.role !== "assistant") {
    setChatNotice("Only assistant messages can be saved to Living Archive intake.");
    return;
  }

  setArchiveQueueBusy(true);
  setChatNotice("Saving chat insight to Living Archive intake...");
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${stamp}-${safeSlug(thread.title)}.md`;
    const intake = await requestArchiveIntakeWrite({
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

    await requestArchiveIngestRequest({
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

    const [queue, artifacts] = await Promise.all([requestArchiveReviewQueue(), requestArchiveReviewArtifacts()]);
    setArchiveQueue(queue);
    setArchiveReviewArtifacts(artifacts);
    setChatNotice("Saved chat insight to Living Archive intake and queued it for review.");
  } catch (error) {
    setChatNotice(errorMessageOf(error, "Failed to save chat insight to Living Archive intake."));
  } finally {
    setArchiveQueueBusy(false);
  }
};
