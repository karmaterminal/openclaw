import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import type { FollowupRun } from "./queue.js";

const state = vi.hoisted(() => ({
  incrementRunCompactionCountMock: vi.fn(),
  dispatchPostCompactionDelegatesMock: vi.fn(),
  emitContinuationCompactionReleasedSpanMock: vi.fn(),
  logVerboseMock: vi.fn(),
}));

vi.mock("../../globals.js", () => ({
  logVerbose: (message: string) => state.logVerboseMock(message),
}));

vi.mock("../../config/sessions.js", () => ({
  resolveSessionStoreEntry: ({
    store,
    sessionKey,
  }: {
    store: Record<string, SessionEntry>;
    sessionKey: string;
  }) => ({
    existing: store[sessionKey],
    legacyKeys: [],
    normalizedKey: sessionKey,
  }),
}));

vi.mock("./session-run-accounting.js", () => ({
  incrementRunCompactionCount: (params: unknown) => state.incrementRunCompactionCountMock(params),
}));

vi.mock("./post-compaction-delegate-dispatch.js", () => ({
  dispatchPostCompactionDelegates: (params: unknown) =>
    state.dispatchPostCompactionDelegatesMock(params),
}));

vi.mock("../../infra/continuation-tracer.js", () => ({
  emitContinuationCompactionReleasedSpan: (params: unknown) =>
    state.emitContinuationCompactionReleasedSpanMock(params),
}));

async function getReleaseQueuedCompactionCompletion() {
  return (await import("./agent-runner-execution.js")).releaseQueuedCompactionCompletion;
}

function createFollowupRun(): FollowupRun {
  return {
    prompt: "hello",
    enqueuedAt: 1,
    run: {
      agentId: "agent",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp/workspace",
      config: {},
      provider: "anthropic",
      model: "claude",
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  };
}

const VALID_TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

beforeEach(() => {
  state.incrementRunCompactionCountMock.mockReset();
  state.dispatchPostCompactionDelegatesMock.mockReset();
  state.emitContinuationCompactionReleasedSpanMock.mockReset();
  state.logVerboseMock.mockReset();
});

describe("releaseQueuedCompactionCompletion", () => {
  it("returns early when compactionResult.ok=false (no counter increment, no dispatch, no span)", async () => {
    const releaseQueuedCompactionCompletion = await getReleaseQueuedCompactionCompletion();
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const activeSessionStore: Record<string, SessionEntry> = { main: sessionEntry };

    await releaseQueuedCompactionCompletion({
      activeSessionStore,
      compactionResult: { ok: false, compacted: false, reason: "boom" },
      followupRun: createFollowupRun(),
      getActiveSessionEntry: () => sessionEntry,
      sessionKey: "main",
    });

    expect(state.incrementRunCompactionCountMock).not.toHaveBeenCalled();
    expect(state.dispatchPostCompactionDelegatesMock).not.toHaveBeenCalled();
    expect(state.emitContinuationCompactionReleasedSpanMock).not.toHaveBeenCalled();
    expect(state.logVerboseMock).not.toHaveBeenCalled();
  });

  it("returns early with logVerbose when sessionKey is missing (session-store-unavailable)", async () => {
    const releaseQueuedCompactionCompletion = await getReleaseQueuedCompactionCompletion();
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const activeSessionStore: Record<string, SessionEntry> = { main: sessionEntry };

    await releaseQueuedCompactionCompletion({
      activeSessionStore,
      compactionResult: {
        ok: true,
        compacted: true,
        result: { summary: "s", firstKeptEntryId: "e", tokensBefore: 10 },
      },
      followupRun: createFollowupRun(),
      getActiveSessionEntry: () => sessionEntry,
      sessionKey: undefined,
    });

    expect(state.incrementRunCompactionCountMock).not.toHaveBeenCalled();
    expect(state.dispatchPostCompactionDelegatesMock).not.toHaveBeenCalled();
    expect(state.emitContinuationCompactionReleasedSpanMock).not.toHaveBeenCalled();
    expect(state.logVerboseMock).toHaveBeenCalledWith(
      "[request_compaction:post-compaction-release-skipped] session=none reason=session-store-unavailable",
    );
  });

  it("returns early with logVerbose when activeSessionStore is missing (session-store-unavailable)", async () => {
    const releaseQueuedCompactionCompletion = await getReleaseQueuedCompactionCompletion();
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };

    await releaseQueuedCompactionCompletion({
      activeSessionStore: undefined,
      compactionResult: {
        ok: true,
        compacted: true,
        result: { summary: "s", firstKeptEntryId: "e", tokensBefore: 10 },
      },
      followupRun: createFollowupRun(),
      getActiveSessionEntry: () => sessionEntry,
      sessionKey: "main",
    });

    expect(state.incrementRunCompactionCountMock).not.toHaveBeenCalled();
    expect(state.dispatchPostCompactionDelegatesMock).not.toHaveBeenCalled();
    expect(state.emitContinuationCompactionReleasedSpanMock).not.toHaveBeenCalled();
    expect(state.logVerboseMock).toHaveBeenCalledWith(
      "[request_compaction:post-compaction-release-skipped] session=main reason=session-store-unavailable",
    );
  });

  it("returns early with logVerbose when sessionEntry resolves to undefined (session-entry-unavailable)", async () => {
    const releaseQueuedCompactionCompletion = await getReleaseQueuedCompactionCompletion();
    const activeSessionStore: Record<string, SessionEntry> = {};

    await releaseQueuedCompactionCompletion({
      activeSessionStore,
      compactionResult: {
        ok: true,
        compacted: true,
        result: { summary: "s", firstKeptEntryId: "e", tokensBefore: 10 },
      },
      followupRun: createFollowupRun(),
      getActiveSessionEntry: () => undefined,
      sessionKey: "main",
    });

    expect(state.incrementRunCompactionCountMock).not.toHaveBeenCalled();
    expect(state.dispatchPostCompactionDelegatesMock).not.toHaveBeenCalled();
    expect(state.emitContinuationCompactionReleasedSpanMock).not.toHaveBeenCalled();
    expect(state.logVerboseMock).toHaveBeenCalledWith(
      "[request_compaction:post-compaction-release-skipped] session=main reason=session-entry-unavailable",
    );
  });

  it("on ok=true,compacted=true: increments compaction count AND dispatches post-compaction delegates AND emits released span", async () => {
    const releaseQueuedCompactionCompletion = await getReleaseQueuedCompactionCompletion();
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const activeSessionStore: Record<string, SessionEntry> = { main: sessionEntry };
    const followupRun = createFollowupRun();

    state.incrementRunCompactionCountMock.mockResolvedValueOnce(7);
    state.dispatchPostCompactionDelegatesMock.mockResolvedValueOnce({
      queuedDelegates: 2,
      droppedDelegates: 0,
    });

    await releaseQueuedCompactionCompletion({
      activeSessionStore,
      compactionResult: {
        ok: true,
        compacted: true,
        result: {
          summary: "s",
          firstKeptEntryId: "e",
          tokensBefore: 1000,
          tokensAfter: 400,
          sessionId: "new-session",
          sessionFile: "/tmp/new-session.jsonl",
        },
      },
      followupRun,
      getActiveSessionEntry: () => sessionEntry,
      sessionKey: "main",
      storePath: "/tmp/store.json",
      traceparent: VALID_TRACEPARENT,
    });

    expect(state.incrementRunCompactionCountMock).toHaveBeenCalledTimes(1);
    expect(state.incrementRunCompactionCountMock).toHaveBeenCalledWith({
      cfg: followupRun.run.config,
      sessionEntry,
      sessionStore: activeSessionStore,
      sessionKey: "main",
      storePath: "/tmp/store.json",
      amount: 1,
      compactionTokensAfter: 400,
      newSessionId: "new-session",
      newSessionFile: "/tmp/new-session.jsonl",
    });

    expect(state.dispatchPostCompactionDelegatesMock).toHaveBeenCalledTimes(1);
    expect(state.dispatchPostCompactionDelegatesMock).toHaveBeenCalledWith({
      cfg: followupRun.run.config,
      compactionCount: 7,
      followupRun,
      postCompactionDelegatesToPreserve: [],
      releaseTraceparent: VALID_TRACEPARENT,
      sessionEntry,
      sessionKey: "main",
      sessionStore: activeSessionStore,
      storePath: "/tmp/store.json",
    });

    expect(state.emitContinuationCompactionReleasedSpanMock).toHaveBeenCalledTimes(1);
    const spanArgs = state.emitContinuationCompactionReleasedSpanMock.mock.calls[0]?.[0] as {
      releasedCount: number;
      compactionId: number;
      traceparent?: string;
      log: (message: string) => void;
    };
    expect(spanArgs.releasedCount).toBe(2);
    expect(spanArgs.compactionId).toBe(7);
    expect(spanArgs.traceparent).toBe(VALID_TRACEPARENT);
    expect(typeof spanArgs.log).toBe("function");

    spanArgs.log("[trace] released");
    expect(state.logVerboseMock).toHaveBeenCalledWith("[trace] released");
  });
});
