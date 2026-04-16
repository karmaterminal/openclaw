import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingDelegates,
  consumeStagedPostCompactionDelegates,
} from "../continuation-delegate-store.js";
import type { ContinuationRuntimeConfig } from "./continuation-runtime.js";
import { scheduleContinuation } from "./continuation-scheduler.js";
import type { FollowupRun, QueueSettings } from "./queue.js";

function createFollowupRun(): FollowupRun {
  return {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    originatingChannel: "discord",
    originatingAccountId: "primary",
    originatingTo: "channel:C1",
    originatingThreadId: "thread-1",
    run: {
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "discord",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
}

function createConfig(
  overrides: Partial<ContinuationRuntimeConfig> = {},
): ContinuationRuntimeConfig {
  return {
    enabled: true,
    defaultDelayMs: 0,
    minDelayMs: 0,
    maxDelayMs: 0,
    maxChainLength: 5,
    costCapTokens: 1_000,
    maxDelegatesPerTurn: 3,
    ...overrides,
  };
}

describe("scheduleContinuation", () => {
  afterEach(() => {
    clearPendingDelegates("main");
  });

  it("queues continue_work through the followup runner seam", async () => {
    const enqueueFollowupRun = vi.fn();
    const onChainStateAccepted = vi.fn();
    const runFollowupTurn = vi.fn();

    const result = await scheduleContinuation(
      {
        sessionKey: "main",
        queueKey: "main",
        queueSettings: { mode: "interrupt" } as QueueSettings,
        runFollowupTurn,
        followupRun: createFollowupRun(),
        sessionEntry: {
          continuationChainCount: 1,
          continuationChainStartedAt: 100,
          continuationChainTokens: 10,
        },
        config: createConfig(),
        turnTokens: 42,
        signal: { kind: "work", delayMs: 0 },
        workReason: "finish the audit",
        delegates: [],
        onChainStateAccepted,
      },
      {
        enqueueFollowupRun,
        setTimeout,
        spawnSubagentDirect: vi.fn(),
      },
    );

    expect(result).toEqual({
      acceptedWork: true,
      acceptedDelegates: 0,
      nextChainState: {
        count: 2,
        startedAt: 100,
        tokens: 52,
      },
    });
    expect(onChainStateAccepted).toHaveBeenCalledWith({
      count: 2,
      startedAt: 100,
      tokens: 52,
    });
    expect(enqueueFollowupRun).toHaveBeenCalledWith(
      "main",
      expect.objectContaining({
        summaryLine: "Continue: finish the audit",
        prompt: expect.stringContaining("Prior continuation reason: finish the audit"),
      }),
      expect.objectContaining({ mode: "interrupt" }),
      "none",
      runFollowupTurn,
    );
  });

  it("treats bracket delegates as delegate work instead of queueing a followup turn", async () => {
    const spawnSubagentDirect = vi.fn().mockResolvedValue({ status: "accepted" });
    const enqueueFollowupRun = vi.fn();

    const result = await scheduleContinuation(
      {
        sessionKey: "main",
        queueKey: "main",
        queueSettings: { mode: "interrupt" } as QueueSettings,
        runFollowupTurn: vi.fn(),
        followupRun: createFollowupRun(),
        sessionEntry: {
          continuationChainCount: 1,
          continuationChainStartedAt: 100,
          continuationChainTokens: 10,
        },
        config: createConfig(),
        turnTokens: 20,
        signal: { kind: "delegate", task: "inspect shard health", delayMs: 0 },
        delegates: [],
      },
      {
        enqueueFollowupRun,
        setTimeout,
        spawnSubagentDirect,
      },
    );

    expect(result).toEqual({
      acceptedWork: false,
      acceptedDelegates: 1,
      nextChainState: {
        count: 2,
        startedAt: 100,
        tokens: 30,
      },
    });
    expect(enqueueFollowupRun).not.toHaveBeenCalled();
    expect(spawnSubagentDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining("[continuation:chain-hop:2]"),
      }),
      expect.objectContaining({
        agentSessionKey: "main",
        agentChannel: "discord",
        agentAccountId: "primary",
        agentTo: "channel:C1",
        agentThreadId: "thread-1",
      }),
    );
  });

  it("counts a bracket delegate against the per-turn delegate budget", async () => {
    const spawnSubagentDirect = vi.fn().mockResolvedValue({ status: "accepted" });

    const result = await scheduleContinuation(
      {
        sessionKey: "main",
        queueKey: "main",
        queueSettings: { mode: "interrupt" } as QueueSettings,
        runFollowupTurn: vi.fn(),
        followupRun: createFollowupRun(),
        sessionEntry: {
          continuationChainCount: 0,
          continuationChainStartedAt: 100,
          continuationChainTokens: 0,
        },
        config: createConfig({ maxDelegatesPerTurn: 1 }),
        turnTokens: 5,
        signal: { kind: "delegate", task: "first delegate", delayMs: 0 },
        delegates: [{ task: "tool delegate", delayMs: 0 }],
      },
      {
        enqueueFollowupRun: vi.fn(),
        setTimeout,
        spawnSubagentDirect,
      },
    );

    expect(result.acceptedDelegates).toBe(1);
    expect(spawnSubagentDirect).toHaveBeenCalledTimes(1);
    expect(spawnSubagentDirect.mock.calls[0]?.[0]).toMatchObject({
      task: expect.stringContaining("first delegate"),
    });
  });

  it("suppresses the direct completion echo for silent delegates", async () => {
    const spawnSubagentDirect = vi.fn().mockResolvedValue({ status: "accepted" });

    await scheduleContinuation(
      {
        sessionKey: "main",
        queueKey: "main",
        queueSettings: { mode: "interrupt" } as QueueSettings,
        runFollowupTurn: vi.fn(),
        followupRun: createFollowupRun(),
        sessionEntry: {
          continuationChainCount: 0,
          continuationChainStartedAt: 100,
          continuationChainTokens: 0,
        },
        config: createConfig(),
        turnTokens: 5,
        signal: { kind: "delegate", task: "quiet enrichment", silentWake: true },
        delegates: [],
      },
      {
        enqueueFollowupRun: vi.fn(),
        setTimeout,
        spawnSubagentDirect,
      },
    );

    expect(spawnSubagentDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        expectsCompletionMessage: false,
        silentAnnounce: true,
        wakeOnReturn: true,
        drainsContinuationDelegateQueue: true,
      }),
      expect.anything(),
    );
  });

  it("stages post-compaction delegates instead of spawning them immediately", async () => {
    const spawnSubagentDirect = vi.fn().mockResolvedValue({ status: "accepted" });

    const result = await scheduleContinuation(
      {
        sessionKey: "main",
        queueKey: "main",
        queueSettings: { mode: "interrupt" } as QueueSettings,
        runFollowupTurn: vi.fn(),
        followupRun: createFollowupRun(),
        sessionEntry: {
          continuationChainCount: 0,
          continuationChainStartedAt: 100,
          continuationChainTokens: 0,
        },
        config: createConfig(),
        turnTokens: 5,
        signal: { kind: "delegate", task: "resume after compaction", postCompaction: true },
        delegates: [],
      },
      {
        enqueueFollowupRun: vi.fn(),
        setTimeout,
        spawnSubagentDirect,
      },
    );

    expect(result.acceptedDelegates).toBe(1);
    expect(spawnSubagentDirect).not.toHaveBeenCalled();
    expect(consumeStagedPostCompactionDelegates("main")).toEqual([
      {
        task: "resume after compaction",
        silent: true,
        silentWake: true,
        postCompaction: true,
      },
    ]);
  });
});
