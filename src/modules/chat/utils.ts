// Intent citation: docs/architecture/ADR-004-chat-rail.md

import type { ConversationThread } from "../../core/contracts";
import type { ComposerAttachment } from "./types";

export const CONTEXT_WARNING_CHARS = 24000;

export const isTextLikeFile = (file: File): boolean =>
  file.type.startsWith("text/") ||
  ["application/json", "application/xml", "application/javascript"].includes(file.type) ||
  /\.(md|txt|json|csv|tsv|js|ts|py|html|css|xml)$/i.test(file.name);

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const estimateContextCharacters = (
  thread: ConversationThread | null,
  composer: string,
  attachments: ComposerAttachment[],
): number => {
  const threadChars = thread?.messages.reduce((total, message) => total + message.content.length, 0) ?? 0;
  const attachmentChars = attachments.reduce(
    (total, attachment) => total + (attachment.content?.length ?? attachment.name.length),
    0,
  );
  return threadChars + composer.length + attachmentChars;
};

export const formatCompactCount = (value: number): string => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
};

export const attachmentPromptBlock = (attachments: ComposerAttachment[]): string =>
  attachments
    .map((attachment) => {
      if (attachment.content) {
        return [
          `Attached file: ${attachment.name} (${attachment.type || "unknown"}, ${formatBytes(attachment.size)})`,
          "```text",
          attachment.content,
          "```",
        ].join("\n");
      }
      return `Attached file: ${attachment.name} (${attachment.type || "unknown"}, ${formatBytes(
        attachment.size,
      )}). Binary preview is not yet parsed by the shell.`;
    })
    .join("\n\n");
