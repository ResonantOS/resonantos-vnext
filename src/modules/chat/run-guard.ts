// Intent citation: docs/architecture/ADR-004-chat-rail.md

import type { MutableRefObject } from "react";

export const createChatRunToken = (threadId: string, now = Date.now()): string =>
  `chat-run-${threadId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${now}`;

export const claimChatRun = (
  activeChatRunTokenRef: MutableRefObject<string | null>,
  threadId: string,
): string | null => {
  if (activeChatRunTokenRef.current) {
    return null;
  }
  const token = createChatRunToken(threadId);
  activeChatRunTokenRef.current = token;
  return token;
};

export const releaseChatRun = (
  activeChatRunTokenRef: MutableRefObject<string | null>,
  token: string,
): boolean => {
  if (activeChatRunTokenRef.current !== token) {
    return false;
  }
  activeChatRunTokenRef.current = null;
  return true;
};
