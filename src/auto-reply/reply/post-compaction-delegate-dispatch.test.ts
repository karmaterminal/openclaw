import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpawnSubagentResult } from "../../agents/subagent-spawn.js";
import type { SessionEntry, SessionPostCompactionDelegate } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { withTempDir } from "../../test-helpers/temp-dir.js";
import type { ContinuationRuntimeConfig } from "./continuation-runtime.js";
import {
  buildPostCompactionLifecycleEvent,
  dispatchPostCompactionDelegates,
  normalizePostCompactionDelegate,
  persistPendingPostCompactionDelegates,
  takePendingPostCompactionDelegates,
  type PostCompactionDelegateDispatchDeps,
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

function createDeps(options?: {
  staged?: SessionPostCompactionDelegate[];
  runtimeConfig?: Partial<ContinuationRuntimeConfig>;
  spawnResults?: SpawnSubagentResult[];
  spawnError?: Error;
  context?: string | null;
  now?: number;
}): {
  deps: PostCompactionDelegateDispatchDeps;
  enqueueSystemEvent: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  readPostCompactionContext: ReturnType<typeof vi.fn>;
  resolveAgentWorkspaceDir: ReturnType<typeof vi.fn>;
  spawnSubagentDirect: ReturnType<typeof vi.fn>;
} {
  const spawnResults = [...(options?.spawnResults ?? [])];
  const enqueueSystemEvent = vi.fn();
  const log = vi.fn();
  const readPostCompactionContext = vi.fn(async () => options?.context ?? null);
  const resolveAgentWorkspaceDir = vi.fn(() => "/fallback-workspace");
  const spawnSubagentDirect = vi.fn(async () => {
    if (options?.spawnError) {
      throw options.spawnError;
    }
    return (
      spawnResults.shift() ?? {
        status: "accepted",
        childSessionKey: "agent:main:subagent:child",
        runId: "run-child",
      }
    );
  });

  return {
    deps: {
      consumeStagedPostCompactionDelegates: vi.fn(() => options?.staged ?? []),
      enqueueSystemEvent,
      log,
      now: vi.fn(() => options?.now ?? 1_700_000_000_000),
      readPostCompactionContext,
      resolveAgentWorkspaceDir,
      resolveContinuationRuntimeConfig: vi.fn(() => ({
        ...defaultRuntimeConfig,
        ...options?.runtimeConfig,
      })),
      resolveSessionAgentId: vi.fn(() => "main"),
      spawnSubagentDirect,
    },
    enqueueSystemEvent,
    log,
    readPostCompactionContext,
    resolveAgentWorkspaceDir,
    spawnSubagentDirect,
  };
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

  it("returns normalized existing delegates when asked to persist an empty list", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: 1,
      pendingPostCompactionDelegates: [delegate("legacy")],
    };

    await expect(
      persistPendingPostCompactionDelegates({
        sessionEntry,
        sessionKey: "main",
        delegates: [],
      }),
    ).resolves.toEqual([normalizePostCompactionDelegate(delegate("legacy"))]);
  });

  it("takes and clears local pending delegates", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: 1,
      pendingPostCompactionDelegates: [delegate("carry")],
    };
    const sessionStore = { main: sessionEntry };

    const taken = await takePendingPostCompactionDelegates({
      sessionEntry,
      sessionStore,
      sessionKey: "main",
    });

    expect(taken).toEqual([normalizePostCompactionDelegate(delegate("carry"))]);
    expect(sessionEntry.pendingPostCompactionDelegates).toBeUndefined();
    expect(sessionStore.main.pendingPostCompactionDelegates).toBeUndefined();
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

  it("dispatches persisted delegates before staged delegates and persists chain state", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: 1,
      pendingPostCompactionDelegates: [delegate("persisted")],
    };
    const sessionStore = { main: sessionEntry };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, enqueueSystemEvent, spawnSubagentDirect } = createDeps({
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
        sessionStore,
      },
      deps,
    );
    await flushMicrotasks();

    expect(result).toEqual({
      dispatchedDelegates: 2,
      droppedDelegates: 0,
      currentChainCount: 2,
    });
    expect(spawnSubagentDirect).toHaveBeenCalledTimes(2);
    expect(spawnSubagentDirect.mock.calls.map((call) => call[0].task)).toEqual([
      "[continuation:post-compaction] [continuation:chain-hop:1] Compaction just completed. Carry this working state to the post-compaction session: persisted",
      "[continuation:post-compaction] [continuation:chain-hop:2] Compaction just completed. Carry this working state to the post-compaction session: staged",
    ]);
    expect(spawnSubagentDirect.mock.calls[0][1]).toEqual({
      agentSessionKey: "main",
      agentChannel: "discord",
      agentAccountId: "account",
      agentTo: "channel",
      agentThreadId: "thread",
    });
    expect(sessionEntry.continuationChainCount).toBe(2);
    expect(sessionEntry.continuationChainTokens).toBe(0);
    expect(sessionEntry.pendingPostCompactionDelegates).toBeUndefined();
    expect(preserve).toEqual([]);
    expect(enqueueSystemEvent).toHaveBeenCalledWith("[context] refreshed", {
      sessionKey: "main",
    });
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      "[continuation:compaction-delegate-spawned] Post-compaction shard dispatched: persisted",
      { sessionKey: "main" },
    );
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      expect.stringContaining("Released 2 post-compaction delegate(s) into the fresh session."),
      { sessionKey: "main" },
    );
  });

  it("accounts for a bracket delegate when applying maxDelegatesPerTurn", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const { deps, enqueueSystemEvent, spawnSubagentDirect } = createDeps({
      staged: [delegate("first"), delegate("second")],
      runtimeConfig: { maxDelegatesPerTurn: 2 },
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        continuationSignalKind: "delegate",
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: [],
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(result.dispatchedDelegates).toBe(1);
    expect(result.droppedDelegates).toBe(1);
    expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      expect.stringContaining("1 delegate(s) were not released into the fresh session."),
      { sessionKey: "main" },
    );
  });

  it("rejects delegates when the compaction chain length is already capped", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: 1,
      continuationChainCount: 2,
    };
    const { deps, enqueueSystemEvent, log, spawnSubagentDirect } = createDeps({
      staged: [delegate("too deep")],
      runtimeConfig: { maxChainLength: 2 },
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: [],
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(result).toMatchObject({ dispatchedDelegates: 0, droppedDelegates: 1 });
    expect(spawnSubagentDirect).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Post-compaction delegate rejected: chain length 2 >= 2 for session main",
    );
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      "[continuation] Post-compaction delegate rejected: chain length 2 reached. Task: too deep",
      { sessionKey: "main" },
    );
  });

  it("rejects delegates when continuation tokens exceed the cost cap", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: 1,
      continuationChainTokens: 11,
    };
    const { deps, enqueueSystemEvent, log, spawnSubagentDirect } = createDeps({
      staged: [delegate("too expensive")],
      runtimeConfig: { costCapTokens: 10 },
    });

    const result = await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: [],
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(result).toMatchObject({ dispatchedDelegates: 0, droppedDelegates: 1 });
    expect(spawnSubagentDirect).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Post-compaction delegate rejected: cost cap exceeded (11 > 10) for session main",
    );
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      "[continuation] Post-compaction delegate rejected: cost cap exceeded (11 > 10). Task: too expensive",
      { sessionKey: "main" },
    );
  });

  it("re-stages delegates rejected by spawn", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const preserve: SessionPostCompactionDelegate[] = [];
    const { deps, log } = createDeps({
      staged: [delegate("rejected")],
      spawnResults: [{ status: "forbidden" }],
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

    expect(result).toMatchObject({ dispatchedDelegates: 0, droppedDelegates: 1 });
    expect(sessionEntry.pendingPostCompactionDelegates).toEqual([
      normalizePostCompactionDelegate(delegate("rejected")),
    ]);
    expect(preserve).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      "Post-compaction delegate rejected (forbidden) for session main (re-staged)",
    );
  });

  it("re-stages delegates when spawn throws", async () => {
    const sessionEntry: SessionEntry = { sessionId: "session", updatedAt: 1 };
    const { deps, log } = createDeps({
      staged: [delegate("throws")],
      spawnError: new Error("boom"),
    });

    await dispatchPostCompactionDelegates(
      {
        cfg,
        compactionCount: 1,
        followupRun: createFollowupRun(),
        postCompactionDelegatesToPreserve: [],
        sessionEntry,
        sessionKey: "main",
      },
      deps,
    );

    expect(sessionEntry.pendingPostCompactionDelegates).toEqual([
      normalizePostCompactionDelegate(delegate("throws")),
    ]);
    expect(log).toHaveBeenCalledWith(
      "Post-compaction delegate failed for session main (re-staged): Error: boom",
    );
  });

  it("uses the fallback workspace resolver only when the run workspace is blank", async () => {
    const { deps, readPostCompactionContext, resolveAgentWorkspaceDir } = createDeps({
      staged: [],
    });

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
});
