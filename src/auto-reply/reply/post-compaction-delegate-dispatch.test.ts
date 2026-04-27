import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  enqueuePostCompactionDelegateDelivery as enqueueQueuedPostCompactionDelegateDelivery,
  loadPendingSessionDeliveries,
} from "../../infra/session-delivery-queue.js";
import { withTempDir } from "../../test-helpers/temp-dir.js";
import type { ContinuationRuntimeConfig } from "./continuation-runtime.js";
import {
  buildPostCompactionLifecycleEvent,
  deliverQueuedPostCompactionDelegate,
  drainPostCompactionDelegateDeliveries,
  dispatchPostCompactionDelegates,
  normalizePostCompactionDelegate,
  persistPendingPostCompactionDelegates,
  takePendingPostCompactionDelegates,
  type PostCompactionDelegateDeliveryDeps,
  type PostCompactionDelegateDispatchDeps,
  type QueuedPostCompactionDelegateDelivery,
} from "./post-compaction-delegate-dispatch.js";
import type { FollowupRun } from "./queue/types.js";

const cfg: OpenClawConfig = {};

const defaultRuntimeConfig: ContinuationRuntimeConfig = {
  enabled: true,
  taskFlowDelegates: false,
  defaultDelayMs: 0,
  minDelayMs: 0,
  maxDelayMs: 1_000,
  maxChainLength: 4,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
};

function delegate(
  task: string,
  overrides?: Partial<SessionPostCompactionDelegate>,
): SessionPostCompactionDelegate {
  return {
    task,
    createdAt: overrides?.createdAt ?? 1,
    ...(overrides?.silent != null ? { silent: overrides.silent } : {}),
    ...(overrides?.silentWake != null ? { silentWake: overrides.silentWake } : {}),
  };
}

function createFollowupRun(overrides?: {
  workspaceDir?: string;
  originatingChannel?: FollowupRun["originatingChannel"];
  originatingAccountId?: string;
  originatingTo?: string;
  originatingThreadId?: string | number;
}): FollowupRun {
  return {
    prompt: "hello",
    enqueuedAt: 1,
    originatingChannel: overrides?.originatingChannel,
    originatingAccountId: overrides?.originatingAccountId,
    originatingTo: overrides?.originatingTo,
    originatingThreadId: overrides?.originatingThreadId,
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: overrides?.workspaceDir ?? "/tmp/workspace",
      config: cfg,
      provider: "anthropic",
      model: "claude",
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  };
}

function createDispatchDeps(options?: {
  staged?: SessionPostCompactionDelegate[];
  context?: string | null;
  rejectEnqueueAt?: number;
  runtimeConfig?: ContinuationRuntimeConfig;
}) {
  const enqueueSystemEvent = vi.fn();
  const log = vi.fn();
  const readPostCompactionContext = vi.fn(async () => options?.context ?? null);
  const resolveAgentWorkspaceDir = vi.fn(() => "/fallback-workspace");
  const resolveContinuationRuntimeConfig = vi.fn(
    () => options?.runtimeConfig ?? defaultRuntimeConfig,
  );
  const enqueuePostCompactionDelegateDelivery = vi.fn(async ({ sequence }) => {
    if (options?.rejectEnqueueAt === sequence) {
      throw new Error("queue write failed");
    }
    return `queue-${sequence}`;
  });
  const drainPostCompactionDelegateDeliveries = vi.fn(async () => undefined);
  const deps: PostCompactionDelegateDispatchDeps = {
    consumeStagedPostCompactionDelegates: vi.fn(() => options?.staged ?? []),
    drainPostCompactionDelegateDeliveries,
    enqueuePostCompactionDelegateDelivery,
    enqueueSystemEvent,
    log,
    readPostCompactionContext,
    resolveAgentWorkspaceDir,
    resolveContinuationRuntimeConfig,
    resolveSessionAgentId: vi.fn(() => "main"),
  };
  return {
    deps,
    drainPostCompactionDelegateDeliveries,
    enqueuePostCompactionDelegateDelivery,
    enqueueSystemEvent,
    log,
    readPostCompactionContext,
    resolveAgentWorkspaceDir,
    resolveContinuationRuntimeConfig,
  };
}

function createQueuedEntry(
  overrides?: Partial<QueuedPostCompactionDelegateDelivery>,
): QueuedPostCompactionDelegateDelivery {
  return {
    id: "queue-1",
    kind: "postCompactionDelegate",
    sessionKey: "main",
    task: "queued delegate",
    createdAt: 1,
    enqueuedAt: 1,
    retryCount: 0,
    ...overrides,
  };
}

function createDeliveryDeps(params: {
  storePath: string;
  runtimeConfig?: Partial<ContinuationRuntimeConfig>;
  spawnStatus?: "accepted" | "forbidden" | "error";
  spawnError?: Error;
  spawnSubagentDirect?: PostCompactionDelegateDeliveryDeps["spawnSubagentDirect"];
}) {
  const enqueueSystemEvent = vi.fn();
  const log = vi.fn();
  const spawnSubagentDirect = vi.fn(
    params.spawnSubagentDirect ??
      (async () => {
        if (params.spawnError) {
          throw params.spawnError;
        }
        return { status: params.spawnStatus ?? "accepted" };
      }),
  );
  const deps: PostCompactionDelegateDeliveryDeps = {
    enqueueSystemEvent,
    loadConfig: vi.fn(() => cfg),
    loadSessionStore: vi.fn(
      (storePath) =>
        JSON.parse(fsSync.readFileSync(storePath, "utf-8")) as Record<string, SessionEntry>,
    ),
    log,
    now: vi.fn(() => 1_700_000_000_000),
    resolveContinuationRuntimeConfig: vi.fn(() => ({
      ...defaultRuntimeConfig,
      ...params.runtimeConfig,
    })),
    resolveSessionAgentId: vi.fn(() => "main"),
    resolveStorePath: vi.fn(() => params.storePath),
    spawnSubagentDirect,
  };
  return { deps, enqueueSystemEvent, log, spawnSubagentDirect };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("post-compaction delegate dispatch extraction", () => {
  it("normalizes legacy delegates as silent-wake", () => {
    expect(normalizePostCompactionDelegate(delegate("legacy"))).toEqual({
      task: "legacy",
      createdAt: 1,
      silent: true,
      silentWake: true,
    });
  });

  it("preserves explicit silent=false without adding silentWake", () => {
    expect(normalizePostCompactionDelegate(delegate("visible", { silent: false }))).toEqual({
      task: "visible",
      createdAt: 1,
      silent: false,
    });
  });

  it("preserves explicit silentWake=true without adding silent", () => {
    expect(normalizePostCompactionDelegate(delegate("wake", { silentWake: true }))).toEqual({
      task: "wake",
      createdAt: 1,
      silentWake: true,
    });
  });

  it("builds the same lifecycle event text as the runner block", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T22:00:00.000Z"));

    expect(
      buildPostCompactionLifecycleEvent({
        compactionCount: 3,
        releasedDelegates: 2,
        droppedDelegates: 1,
      }),
    ).toBe(
      "[system:post-compaction] Session compacted at 2026-04-26T22:00:00.000Z. Compaction count: 3. Released 2 post-compaction delegate(s) into the fresh session. 1 delegate(s) were not released into the fresh session.",
    );
  });

  it("persists new pending delegates locally after existing delegates", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: 1,
      pendingPostCompactionDelegates: [delegate("existing")],
    };
    const sessionStore = { main: sessionEntry };

    const persisted = await persistPendingPostCompactionDelegates({
      sessionEntry,
      sessionStore,
      sessionKey: "main",
      delegates: [delegate("new", { silent: false })],
    });

    expect(persisted.map((item) => item.task)).toEqual(["existing", "new"]);
    expect(sessionEntry.pendingPostCompactionDelegates).toEqual(persisted);
    expect(sessionStore.main.pendingPostCompactionDelegates).toEqual(persisted);
  });

  it("takes and clears pending delegates from the session store path", async () => {
    await withTempDir({ prefix: "openclaw-post-compaction-dispatch-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            main: {
              sessionId: "session",
              updatedAt: 1,
              pendingPostCompactionDelegates: [delegate("persisted")],
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const taken = await takePendingPostCompactionDelegates({
        sessionKey: "main",
        storePath,
      });

      expect(taken).toEqual([normalizePostCompactionDelegate(delegate("persisted"))]);
      const stored = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<
        string,
        SessionEntry
      >;
      expect(stored.main?.pendingPostCompactionDelegates).toBeUndefined();
    });
  });

  it("queues persisted delegates before staged delegates and starts a drain", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: 1,
      continuationChainCount: 3,
      pendingPostCompactionDelegates: [delegate("persisted")],
    };
    const preserve: SessionPostCompactionDelegate[] = [];
    const {
      deps,
      drainPostCompactionDelegateDeliveries,
      enqueuePostCompactionDelegateDelivery,
      enqueueSystemEvent,
    } = createDispatchDeps({
      staged: [delegate("staged")],
      context: "[context] refreshed",
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 7,
        followupRun: createFollowupRun({
          originatingChannel: "discord",
          originatingAccountId: "account",
          originatingTo: "channel",
          originatingThreadId: "thread",
        }),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );
    await flushMicrotasks();

    expect(result).toEqual({ queuedDelegates: 2, droppedDelegates: 0 });
    expect(sessionEntry.continuationChainCount).toBe(3);
    expect(enqueuePostCompactionDelegateDelivery).toHaveBeenCalledTimes(2);
    expect(enqueuePostCompactionDelegateDelivery.mock.calls.map((call) => call[0])).toEqual([
      {
        sessionKey: "main",
        delegate: normalizePostCompactionDelegate(delegate("persisted")),
        sequence: 0,
        compactionCount: 7,
        deliveryContext: {
          channel: "discord",
          to: "channel",
          accountId: "account",
          threadId: "thread",
        },
      },
      {
        sessionKey: "main",
        delegate: normalizePostCompactionDelegate(delegate("staged")),
        sequence: 1,
        compactionCount: 7,
        deliveryContext: {
          channel: "discord",
          to: "channel",
          accountId: "account",
          threadId: "thread",
        },
      },
    ]);
    expect(drainPostCompactionDelegateDeliveries).toHaveBeenCalledTimes(2);
    expect(drainPostCompactionDelegateDeliveries).toHaveBeenNthCalledWith(1, {
      entryIds: ["queue-0", "queue-1"],
      log: expect.any(Object),
      sessionKey: "main",
    });
    expect(drainPostCompactionDelegateDeliveries).toHaveBeenNthCalledWith(2, {
      log: expect.any(Object),
      sessionKey: "main",
    });
    expect(enqueueSystemEvent).toHaveBeenCalledWith("[context] refreshed", {
      sessionKey: "main",
    });
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      expect.stringContaining("Released 2 post-compaction delegate(s) into the fresh session."),
      { sessionKey: "main" },
    );
    expect(preserve).toEqual([]);
  });

  it("caps queued delegates at maxDelegatesPerTurn and drops the overflow", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, enqueuePostCompactionDelegateDelivery, log } = createDispatchDeps({
      staged: [
        delegate("a"),
        delegate("b"),
        delegate("c"),
        delegate("d"),
        delegate("e"),
        delegate("f"),
        delegate("g"),
      ],
      runtimeConfig: { ...defaultRuntimeConfig, maxDelegatesPerTurn: 5 },
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(result).toEqual({ queuedDelegates: 5, droppedDelegates: 2 });
    expect(enqueuePostCompactionDelegateDelivery).toHaveBeenCalledTimes(5);
    expect(
      enqueuePostCompactionDelegateDelivery.mock.calls.map((call) => call[0].delegate.task),
    ).toEqual(["a", "b", "c", "d", "e"]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("2 over maxDelegatesPerTurn budget (5, bracketOffset=0)"),
    );
    expect(preserve).toEqual([]);
  });

  it("reduces compaction budget by one when a bracket delegate was already spawned this turn", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, enqueuePostCompactionDelegateDelivery } = createDispatchDeps({
      staged: [delegate("a"), delegate("b"), delegate("c"), delegate("d"), delegate("e")],
      runtimeConfig: { ...defaultRuntimeConfig, maxDelegatesPerTurn: 5 },
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        continuationSignalKind: "delegate",
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(result).toEqual({ queuedDelegates: 4, droppedDelegates: 1 });
    expect(enqueuePostCompactionDelegateDelivery).toHaveBeenCalledTimes(4);
  });

  it("does not enqueue any delegate when the bracket offset zeros the budget", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, enqueuePostCompactionDelegateDelivery } = createDispatchDeps({
      staged: [delegate("a"), delegate("b")],
      runtimeConfig: { ...defaultRuntimeConfig, maxDelegatesPerTurn: 1 },
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        continuationSignalKind: "delegate",
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(result).toEqual({ queuedDelegates: 0, droppedDelegates: 2 });
    expect(enqueuePostCompactionDelegateDelivery).not.toHaveBeenCalled();
  });

  it("re-stages delegates when queue enqueue fails", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, log } = createDispatchDeps({
      staged: [delegate("first"), delegate("second")],
      rejectEnqueueAt: 1,
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: preserve,
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(result).toEqual({ queuedDelegates: 1, droppedDelegates: 1 });
    expect(sessionEntry.pendingPostCompactionDelegates).toEqual([
      normalizePostCompactionDelegate(delegate("second")),
    ]);
    expect(preserve).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      "Failed to enqueue post-compaction delegate for main (re-staged): Error: queue write failed",
    );
  });

  it("uses the fallback workspace resolver only when the run workspace is blank", async () => {
    const { deps, readPostCompactionContext, resolveAgentWorkspaceDir } = createDispatchDeps();

    await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun({ workspaceDir: "   " }),
        postCompactionDelegatesToPreserve: [],
        sessionEntry: { sessionId: "session", updatedAt: 1 },
        sessionKey: "main",
      },
      deps,
    );

    expect(resolveAgentWorkspaceDir).toHaveBeenCalledWith(cfg, "main");
    expect(readPostCompactionContext).toHaveBeenCalledWith("/fallback-workspace", {
      cfg,
      agentId: "main",
    });
  });

  it("retries prior failed post-compaction delegates during later unfiltered drain cycles", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T23:00:00.000Z"));

    await withTempDir({ prefix: "openclaw-post-compaction-drain-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({ main: { sessionId: "session", updatedAt: Date.now() } }, null, 2),
        "utf-8",
      );
      const spawnSubagentDirect = vi
        .fn()
        .mockRejectedValueOnce(new Error("transient spawn failure"))
        .mockResolvedValue({ status: "accepted" });
      const { deps } = createDeliveryDeps({ storePath, spawnSubagentDirect });
      const log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const entryId = await enqueueQueuedPostCompactionDelegateDelivery(
        {
          sessionKey: "main",
          delegate: delegate("retry me"),
          sequence: 0,
          compactionCount: 1,
        },
        tempDir,
      );

      await drainPostCompactionDelegateDeliveries({
        entryIds: [entryId],
        stateDir: tempDir,
        deliveryDeps: deps,
        log,
        sessionKey: "main",
      });

      const [failedEntry] = await loadPendingSessionDeliveries(tempDir);
      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(failedEntry?.retryCount).toBe(1);
      expect(failedEntry?.lastError).toBe("transient spawn failure");

      vi.setSystemTime(new Date("2026-04-26T23:00:04.999Z"));
      await drainPostCompactionDelegateDeliveries({
        stateDir: tempDir,
        deliveryDeps: deps,
        log,
        sessionKey: "main",
      });
      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(await loadPendingSessionDeliveries(tempDir)).toHaveLength(1);

      vi.setSystemTime(new Date("2026-04-26T23:00:05.000Z"));
      await drainPostCompactionDelegateDeliveries({
        stateDir: tempDir,
        deliveryDeps: deps,
        log,
        sessionKey: "main",
      });

      expect(spawnSubagentDirect).toHaveBeenCalledTimes(2);
      expect(await loadPendingSessionDeliveries(tempDir)).toEqual([]);
    });
  });

  it("charges chain count only after queued delivery spawns successfully", async () => {
    await withTempDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({ main: { sessionId: "session", updatedAt: Date.now() } }, null, 2),
        "utf-8",
      );
      const { deps, enqueueSystemEvent, spawnSubagentDirect } = createDeliveryDeps({ storePath });

      await deliverQueuedPostCompactionDelegate(
        {
          entry: createQueuedEntry({
            deliveryContext: {
              channel: "discord",
              to: "channel",
              accountId: "account",
              threadId: "thread",
            },
          }),
        },
        deps,
      );

      const stored = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<
        string,
        SessionEntry
      >;
      expect(Object.values(stored).some((entry) => entry.continuationChainCount === 1)).toBe(true);
      expect(spawnSubagentDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          task: "[continuation:post-compaction] [continuation:chain-hop:1] Compaction just completed. Carry this working state to the post-compaction session: queued delegate",
          silentAnnounce: true,
          wakeOnReturn: true,
          drainsContinuationDelegateQueue: true,
        }),
        {
          agentSessionKey: "main",
          agentChannel: "discord",
          agentAccountId: "account",
          agentTo: "channel",
          agentThreadId: "thread",
        },
      );
      expect(enqueueSystemEvent).toHaveBeenCalledWith(
        "[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: queued delegate",
        { sessionKey: "main" },
      );
    });
  });

  it("does not charge chain count when queued spawn fails", async () => {
    await withTempDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({ main: { sessionId: "session", updatedAt: Date.now() } }, null, 2),
        "utf-8",
      );
      const { deps } = createDeliveryDeps({
        storePath,
        spawnError: new Error("spawn unavailable"),
      });

      await expect(
        deliverQueuedPostCompactionDelegate({ entry: createQueuedEntry() }, deps),
      ).rejects.toThrow("spawn unavailable");

      const stored = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<
        string,
        SessionEntry
      >;
      expect(Object.values(stored).some((entry) => entry.continuationChainCount != null)).toBe(
        false,
      );
    });
  });

  it("keeps queued delivery for retry when chain-state persistence fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T23:10:00.000Z"));

    await withTempDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify({ main: { sessionId: "session", updatedAt: Date.now() } }, null, 2),
        "utf-8",
      );
      const spawnSubagentDirect = vi.fn(async () => ({ status: "accepted" as const }));
      const { deps, log } = createDeliveryDeps({ storePath, spawnSubagentDirect });
      const recoveryLog = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const entryId = await enqueueQueuedPostCompactionDelegateDelivery(
        {
          sessionKey: "main",
          delegate: delegate("persist retry"),
          sequence: 0,
          compactionCount: 1,
        },
        tempDir,
      );
      const mkdirSpy = vi.spyOn(fsSync.promises, "mkdir").mockImplementationOnce(async () => {
        throw new Error("session store unwritable");
      });

      try {
        await drainPostCompactionDelegateDeliveries({
          entryIds: [entryId],
          stateDir: tempDir,
          deliveryDeps: deps,
          log: recoveryLog,
          sessionKey: "main",
        });
      } finally {
        mkdirSpy.mockRestore();
      }

      const [failedEntry] = await loadPendingSessionDeliveries(tempDir);
      expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
      expect(failedEntry?.retryCount).toBe(1);
      expect(failedEntry?.lastError).toBe("session store unwritable");
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to persist post-compaction delegate chain state for main: Error: session store unwritable",
        ),
      );

      vi.setSystemTime(new Date("2026-04-26T23:10:05.000Z"));
      await drainPostCompactionDelegateDeliveries({
        stateDir: tempDir,
        deliveryDeps: deps,
        log: recoveryLog,
        sessionKey: "main",
      });

      expect(spawnSubagentDirect).toHaveBeenCalledTimes(2);
      expect(await loadPendingSessionDeliveries(tempDir)).toEqual([]);
      const stored = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<
        string,
        SessionEntry
      >;
      expect(stored.main?.continuationChainCount).toBe(1);
    });
  });

  it("rejects queued delivery when the compaction chain length is already capped", async () => {
    await withTempDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify(
          { main: { sessionId: "session", updatedAt: 1, continuationChainCount: 2 } },
          null,
          2,
        ),
        "utf-8",
      );
      const { deps, enqueueSystemEvent, log, spawnSubagentDirect } = createDeliveryDeps({
        storePath,
        runtimeConfig: { maxChainLength: 2 },
      });

      await deliverQueuedPostCompactionDelegate({ entry: createQueuedEntry() }, deps);

      expect(spawnSubagentDirect).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "Post-compaction delegate rejected: chain length 2 >= 2 for session main",
      );
      expect(enqueueSystemEvent).toHaveBeenCalledWith(
        "[continuation] Post-compaction delegate rejected: chain length 2 reached. Task: queued delegate",
        { sessionKey: "main" },
      );
    });
  });

  it("rejects queued delivery when continuation tokens exceed the cost cap", async () => {
    await withTempDir({ prefix: "openclaw-post-compaction-delivery-" }, async (tempDir) => {
      const storePath = path.join(tempDir, "sessions.json");
      await fs.writeFile(
        storePath,
        JSON.stringify(
          { main: { sessionId: "session", updatedAt: 1, continuationChainTokens: 11 } },
          null,
          2,
        ),
        "utf-8",
      );
      const { deps, enqueueSystemEvent, log, spawnSubagentDirect } = createDeliveryDeps({
        storePath,
        runtimeConfig: { costCapTokens: 10 },
      });

      await deliverQueuedPostCompactionDelegate({ entry: createQueuedEntry() }, deps);

      expect(spawnSubagentDirect).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "Post-compaction delegate rejected: cost cap exceeded (11 > 10) for session main",
      );
      expect(enqueueSystemEvent).toHaveBeenCalledWith(
        "[continuation] Post-compaction delegate rejected: cost cap exceeded (11 > 10). Task: queued delegate",
        { sessionKey: "main" },
      );
    });
  });
});
