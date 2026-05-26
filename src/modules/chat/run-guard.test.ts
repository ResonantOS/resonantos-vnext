import { describe, expect, it, vi } from "vitest";
import { claimChatRun, createChatRunToken, releaseChatRun } from "./run-guard";

describe("chat run guard", () => {
  it("claims synchronously so a second Enter cannot create a duplicate run", () => {
    vi.spyOn(Date, "now").mockReturnValue(1777463000000);
    const ref = { current: null as string | null };

    const first = claimChatRun(ref, "thread-hermes-agent");
    const second = claimChatRun(ref, "thread-hermes-agent");

    expect(first).toBe("chat-run-thread-hermes-agent-1777463000000");
    expect(second).toBeNull();
    expect(ref.current).toBe(first);
    vi.restoreAllMocks();
  });

  it("only releases the active run token", () => {
    const ref = { current: createChatRunToken("thread-hermes-agent", 1) };

    expect(releaseChatRun(ref, createChatRunToken("thread-hermes-agent", 2))).toBe(false);
    expect(ref.current).toBe("chat-run-thread-hermes-agent-1");
    expect(releaseChatRun(ref, "chat-run-thread-hermes-agent-1")).toBe(true);
    expect(ref.current).toBeNull();
  });
});
