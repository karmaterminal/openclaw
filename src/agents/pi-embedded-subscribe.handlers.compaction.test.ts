import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  drainSessionStoreLockQueuesForTest,
  resetSessionStoreLockRuntimeForTests,
  setSessionWriteLockAcquirerForTests,
} from "../config/sessions.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import {
  readCompactionCount,
  seedSessionStore,
  waitForCompactionCount,
} from "./pi-embedded-subscribe.compaction-test-helpers.js";
import {
  handleCompactionEnd,
  reconcileSessionStoreCompactionCountAfterSuccess,
} from "./pi-embedded-subscribe.handlers.compaction.js";
import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";

vi.mock("../infra/agent-events.js", () => ({
  emitAgentEvent: vi.fn(),
}));

function createCompactionContext(params: {
  storePath: string;
  sessionKey: string;
  agentId?: string;
  initialCount: number;
  onAgentEvent?: EmbeddedPiSubscribeContext["params"]["onAgentEvent"];
}): EmbeddedPiSubscribeContext {
  let compactionCount = params.initialCount;
  return {
    params: {
      runId: "run-test",
      session: { messages: [] } as never,
      config: { session: { store: params.storePath } } as never,
      sessionKey: params.sessionKey,
      sessionId: "session-1",
      agentId: params.agentId ?? "test-agent",
      onAgentEvent: params.onAgentEvent,
    },
    state: {
      compactionInFlight: true,
      pendingCompactionRetry: 0,
    } as never,
    log: {
      debug: vi.fn(),
      warn: vi.fn(),
    },
    ensureCompactionPromise: vi.fn(),
    noteCompactionRetry: vi.fn(),
    maybeResolveCompactionWait: vi.fn(),
    resolveCompactionRetry: vi.fn(),
    resetForCompactionRetry: vi.fn(),
    incrementCompactionCount: () => {
      compactionCount += 1;
    },
    getCompactionCount: () => compactionCount,
  } as unknown as EmbeddedPiSubscribeContext;
}

beforeEach(() => {
  setSessionWriteLockAcquirerForTests(async () => ({
    release: async () => {},
  }));
});

afterEach(async () => {
  resetSessionStoreLockRuntimeForTests();
  await drainSessionStoreLockQueuesForTest();
});

describe("reconcileSessionStoreCompactionCountAfterSuccess", () => {
  it("raises the stored compaction count to the observed value", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-compaction-reconcile-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    await seedSessionStore({
      storePath,
      sessionKey,
      compactionCount: 1,
    });

    const nextCount = await reconcileSessionStoreCompactionCountAfterSuccess({
      sessionKey,
      agentId: "test-agent",
      configStore: storePath,
      observedCompactionCount: 2,
      now: 2_000,
    });

    expect(nextCount).toBe(2);
    expect(await readCompactionCount(storePath, sessionKey)).toBe(2);
  });

  it("does not double count when the store is already at or above the observed value", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-compaction-idempotent-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    await seedSessionStore({
      storePath,
      sessionKey,
      compactionCount: 3,
    });

    const nextCount = await reconcileSessionStoreCompactionCountAfterSuccess({
      sessionKey,
      agentId: "test-agent",
      configStore: storePath,
      observedCompactionCount: 2,
      now: 2_000,
    });

    expect(nextCount).toBe(3);
    expect(await readCompactionCount(storePath, sessionKey)).toBe(3);
  });
});

describe("handleCompactionEnd", () => {
  it("reconciles the session store after a successful compaction end event", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-compaction-handler-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionKey = "main";
    await seedSessionStore({
      storePath,
      sessionKey,
      compactionCount: 1,
    });

    const ctx = createCompactionContext({
      storePath,
      sessionKey,
      initialCount: 1,
    });

    handleCompactionEnd(ctx, {
      type: "compaction_end",
      reason: "threshold",
      result: { kept: 12 },
      willRetry: false,
      aborted: false,
    } as never);

    await waitForCompactionCount({
      storePath,
      sessionKey,
      expected: 2,
    });

    expect(await readCompactionCount(storePath, sessionKey)).toBe(2);
    expect(ctx.log.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        "[compaction-attribution] end runId=run-test sessionKey=main trigger=budget outcome=compacted willRetry=false compactionCount.before=1 compactionCount.after=2 compactionCount.delta=1",
      ),
    );
  });

  it("emits terminal compaction attribution data for count deltas", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-compaction-attribution-"));
    const storePath = path.join(tmp, "sessions.json");
    await seedSessionStore({
      storePath,
      sessionKey: "main",
      compactionCount: 4,
    });
    const events: Array<{ stream: string; data: Record<string, unknown> }> = [];
    const ctx = createCompactionContext({
      storePath,
      sessionKey: "main",
      initialCount: 4,
      onAgentEvent: (event) => {
        events.push(event as { stream: string; data: Record<string, unknown> });
      },
    });

    handleCompactionEnd(ctx, {
      type: "compaction_end",
      reason: "overflow",
      result: { kept: 12 },
      willRetry: true,
      aborted: false,
    } as never);

    await waitForCompactionCount({
      storePath,
      sessionKey: "main",
      expected: 5,
    });

    expect(events).toContainEqual({
      stream: "compaction",
      data: {
        phase: "end",
        willRetry: true,
        completed: true,
        trigger: "overflow",
        sessionKey: "main",
        compactionCountBefore: 4,
        compactionCountAfter: 5,
        compactionCountDelta: 1,
      },
    });
  });

  it("surfaces durable compaction-count reconcile failures", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-compaction-reconcile-fail-"));
    const storePath = path.join(tmp, "sessions.json");
    await seedSessionStore({
      storePath,
      sessionKey: "main",
      compactionCount: 1,
    });
    setSessionWriteLockAcquirerForTests(async () => {
      throw new Error("session store locked");
    });
    const events: Array<{ stream: string; data: Record<string, unknown> }> = [];
    const ctx = createCompactionContext({
      storePath,
      sessionKey: "main",
      initialCount: 1,
      onAgentEvent: (event) => {
        events.push(event as { stream: string; data: Record<string, unknown> });
      },
    });

    handleCompactionEnd(ctx, {
      type: "compaction_end",
      reason: "threshold",
      result: { kept: 12 },
      willRetry: false,
      aborted: false,
    } as never);

    await vi.waitFor(() => {
      expect(events).toContainEqual({
        stream: "compaction",
        data: {
          phase: "warning",
          warning: "compaction_count_reconcile_failed",
          sessionKey: "main",
          trigger: "budget",
          outcome: "compacted",
          error: "session store locked",
          compactionCountBefore: 1,
          compactionCountAfter: 2,
          compactionCountDelta: 1,
        },
      });
    });
    expect(ctx.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("[compaction-counter:reconcile-failed]"),
    );
    expect(ctx.getCompactionCount()).toBe(2);
    expect(await readCompactionCount(storePath, "main")).toBe(1);
  });

  it("emits reconcile-failure observability on all three surfaces (H10 throw-shape trap)", async () => {
    vi.mocked(emitAgentEvent).mockClear();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-h10-observability-"));
    const storePath = path.join(tmp, "sessions.json");
    await seedSessionStore({ storePath, sessionKey: "main", compactionCount: 2 });
    setSessionWriteLockAcquirerForTests(async () => {
      throw new Error("lock contention");
    });
    const events: Array<{ stream: string; data: Record<string, unknown> }> = [];
    const ctx = createCompactionContext({
      storePath,
      sessionKey: "main",
      initialCount: 2,
      onAgentEvent: (event) => {
        events.push(event as { stream: string; data: Record<string, unknown> });
      },
    });

    handleCompactionEnd(ctx, {
      type: "compaction_end",
      reason: "threshold",
      result: { kept: 10 },
      willRetry: false,
      aborted: false,
    } as never);

    const expectedWarningData = {
      phase: "warning",
      warning: "compaction_count_reconcile_failed",
      sessionKey: "main",
      trigger: "budget",
      outcome: "compacted",
      error: "lock contention",
      compactionCountBefore: 2,
      compactionCountAfter: 3,
      compactionCountDelta: 1,
    };

    await vi.waitFor(() => {
      expect(ctx.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("[compaction-counter:reconcile-failed]"),
      );
    });

    expect(vi.mocked(emitAgentEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-test",
        stream: "compaction",
        data: expectedWarningData,
      }),
    );

    expect(events).toContainEqual({
      stream: "compaction",
      data: expectedWarningData,
    });
  });

  it("returns completed=true in end event even when reconcile rejects (H10 behavior contract)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-h10-behavior-"));
    const storePath = path.join(tmp, "sessions.json");
    await seedSessionStore({ storePath, sessionKey: "main", compactionCount: 0 });
    setSessionWriteLockAcquirerForTests(async () => {
      throw new Error("store unavailable");
    });
    const events: Array<{ stream: string; data: Record<string, unknown> }> = [];
    const ctx = createCompactionContext({
      storePath,
      sessionKey: "main",
      initialCount: 0,
      onAgentEvent: (event) => {
        events.push(event as { stream: string; data: Record<string, unknown> });
      },
    });

    handleCompactionEnd(ctx, {
      type: "compaction_end",
      reason: "threshold",
      result: { kept: 8 },
      willRetry: false,
      aborted: false,
    } as never);

    expect(events).toContainEqual(
      expect.objectContaining({
        stream: "compaction",
        data: expect.objectContaining({
          phase: "end",
          completed: true,
        }),
      }),
    );

    await vi.waitFor(() => {
      expect(ctx.log.warn).toHaveBeenCalledWith(
        expect.stringContaining("[compaction-counter:reconcile-failed]"),
      );
    });

    const endEvents = events.filter((e) => e.data?.phase === "end");
    expect(endEvents).toHaveLength(1);
    expect(endEvents[0]!.data.completed).toBe(true);
  });

  it.todo(
    "propagates reconcile failure to caller — currently swallowed in .catch fire-and-forget; see audit gap #1 / wave-D bbcf2f3ad8",
  );
});
