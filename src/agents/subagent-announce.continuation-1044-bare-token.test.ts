// karmaterminal/openclaw#1044 — TOKEN-FORM (leg A) regression repro.
//
// When a delegate-child emits a bare `CONTINUE_WORK[:N]` at the end of its
// reply, the parser (`src/auto-reply/tokens.ts:539`) returns
// `{kind:"work"}`. `subagent-announce.ts:~977` historically DROPPED that
// signal with the log "CONTINUE_WORK not supported in sub-agent chain …
// ignoring" — so HOP2 never schedules and the child's intent to self-continue
// is silently void.
//
// figs's settled intent (#sprites-of-thornfield 1516841690): "a
// continue_delegate child is a session like any other and should
// self-continue." His fix-direction (1517356069): "wire the token to the
// tool path" — the kind:"work" signal from a delegate-child must drive a
// hop-2 turn of the child's OWN session, exactly the way the
// `continue_work()` tool form does.
//
// This file asserts the wire-through happens (no chain-spawn, no drop) for
// the bare-token surface. A1 (`[[CONTINUE_WORK]]` bracket) has NO parser by
// design (per BRIEF-AGENT.md + `tokens.ts:490` only matches CONTINUE_DELEGATE
// brackets) and is OUT OF SCOPE for this fix.
//
// The matching tool-surface repro lives in
// `src/auto-reply/continuation/issue-1044-tool-form-self-continue.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  spawnSubagentDirectMock: vi.fn(),
  requestHeartbeatNowMock: vi.fn(),
  readLatestAssistantReplyMock: vi.fn(
    async (_sessionKey?: string): Promise<string | undefined> => "raw subagent reply",
  ),
  registerContinuationTimerHandleMock: vi.fn(),
  retainContinuationTimerRefMock: vi.fn(),
  releaseContinuationTimerRefMock: vi.fn(),
  unregisterContinuationTimerHandleMock: vi.fn(),
  countActiveDescendantRunsMock: vi.fn((_key?: string) => 0),
  countPendingDescendantRunsMock: vi.fn((_key?: string) => 0),
  isSubagentSessionRunActiveMock: vi.fn((_key?: string) => true),
  resolveRequesterForChildSessionMock: vi.fn(
    (_key?: string) =>
      null as {
        requesterSessionKey: string;
        requesterOrigin: { channel: string; to: string };
      } | null,
  ),
  scheduleContinuationWorkMock: vi.fn(async () => ({
    scheduled: true,
    capped: false,
    chainState: {
      currentChainCount: 1,
      chainStartedAt: 0,
      accumulatedChainTokens: 0,
    },
  })),
  scheduleContinuationWorkBatchMock: vi.fn(async () => ({
    scheduledCount: 1,
    cappedCount: 0,
    capped: false,
    chainState: {
      currentChainCount: 1,
      chainStartedAt: 0,
      accumulatedChainTokens: 0,
    },
  })),
}));

vi.mock("./tools/agent-step.js", () => ({
  readLatestAssistantReply: mocked.readLatestAssistantReplyMock,
}));

vi.mock("../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow: (...args: unknown[]) => mocked.requestHeartbeatNowMock(...args),
}));

vi.mock("../auto-reply/continuation/state.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auto-reply/continuation/state.js")>()),
  registerContinuationTimerHandle: (...args: unknown[]) =>
    mocked.registerContinuationTimerHandleMock(...args),
  retainContinuationTimerRef: (...args: unknown[]) =>
    mocked.retainContinuationTimerRefMock(...args),
  releaseContinuationTimerRef: (...args: unknown[]) =>
    mocked.releaseContinuationTimerRefMock(...args),
  unregisterContinuationTimerHandle: (...args: unknown[]) =>
    mocked.unregisterContinuationTimerHandleMock(...args),
}));

vi.mock("./subagent-depth.js", () => ({
  getSubagentDepthFromSessionStore: (sessionKey: string) =>
    sessionKey.includes(":subagent:") ? 1 : 0,
}));

vi.mock("./embedded-agent.js", () => ({
  isEmbeddedAgentRunActive: () => false,
  isEmbeddedAgentRunStreaming: () => false,
  queueEmbeddedAgentMessage: () => false,
  waitForEmbeddedAgentRunEnd: async () => true,
}));

vi.mock("./subagent-announce.registry.runtime.js", () => ({
  countActiveDescendantRuns: (key: string) => mocked.countActiveDescendantRunsMock(key),
  countPendingDescendantRuns: (key: string) => mocked.countPendingDescendantRunsMock(key),
  countPendingDescendantRunsExcludingRun: () => 0,
  isSubagentSessionRunActive: (key: string) => mocked.isSubagentSessionRunActiveMock(key),
  listSubagentRunsForRequester: () => [],
  replaceSubagentRunAfterSteer: () => true,
  resolveRequesterForChildSession: (key: string) => mocked.resolveRequesterForChildSessionMock(key),
  shouldIgnorePostCompletionAnnounceForSession: () => false,
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: () => false,
    runSubagentDeliveryTarget: async () => undefined,
  }),
}));

// Spy on the lazy continuation runtime: when subagent-announce wires the
// bare-WORK signal through, it must reach scheduleContinuationWork /
// scheduleContinuationWorkBatch — the same path the tool surface uses.
vi.mock("../auto-reply/continuation/lazy.runtime.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../auto-reply/continuation/lazy.runtime.js")>();
  return {
    ...actual,
    scheduleContinuationWork: mocked.scheduleContinuationWorkMock,
    scheduleContinuationWorkBatch: mocked.scheduleContinuationWorkBatchMock,
  };
});

import {
  clearRuntimeConfigSnapshot,
  type OpenClawConfig,
  setRuntimeConfigSnapshot,
} from "../config/config.js";
import {
  clearSessionStoreCacheForTest,
  loadSessionStore,
  resolveStorePath,
  saveSessionStore,
} from "../config/sessions.js";
import { runSubagentAnnounceFlow } from "./subagent-announce.js";
import * as subagentSpawn from "./subagent-spawn.js";

async function writeSessionStore(data: Record<string, unknown>): Promise<void> {
  const storePath = resolveStorePath(undefined, { agentId: "main" });
  await saveSessionStore(storePath, data as Parameters<typeof saveSessionStore>[1], {
    skipMaintenance: true,
  });
  clearSessionStoreCacheForTest();
}

function makeBaseConfig(): OpenClawConfig {
  return {
    session: { mainKey: "main", scope: "per-sender" as const },
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 10,
          minDelayMs: 0,
          maxDelayMs: 10_000,
        },
      },
    },
  };
}

describe("#1044 delegate-child self-continue via bare CONTINUE_WORK TOKEN form", () => {
  let spawnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useRealTimers();
    spawnSpy = vi
      .spyOn(subagentSpawn, "spawnSubagentDirect")
      .mockImplementation((...args: unknown[]) => mocked.spawnSubagentDirectMock(...args));
    mocked.spawnSubagentDirectMock.mockReset().mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:main:subagent:should-never-spawn",
      runId: "should-never-run",
    });
    mocked.requestHeartbeatNowMock.mockReset();
    mocked.readLatestAssistantReplyMock.mockReset().mockResolvedValue("raw subagent reply");
    mocked.registerContinuationTimerHandleMock.mockReset();
    mocked.retainContinuationTimerRefMock.mockReset();
    mocked.releaseContinuationTimerRefMock.mockReset();
    mocked.unregisterContinuationTimerHandleMock.mockReset();
    mocked.countActiveDescendantRunsMock.mockReset().mockReturnValue(0);
    mocked.countPendingDescendantRunsMock.mockReset().mockReturnValue(0);
    mocked.isSubagentSessionRunActiveMock.mockReset().mockReturnValue(true);
    mocked.resolveRequesterForChildSessionMock.mockReset().mockReturnValue(null);
    mocked.scheduleContinuationWorkMock.mockReset().mockResolvedValue({
      scheduled: true,
      capped: false,
      chainState: { currentChainCount: 1, chainStartedAt: 0, accumulatedChainTokens: 0 },
    });
    mocked.scheduleContinuationWorkBatchMock.mockReset().mockResolvedValue({
      scheduledCount: 1,
      cappedCount: 0,
      capped: false,
      chainState: { currentChainCount: 1, chainStartedAt: 0, accumulatedChainTokens: 0 },
    });
    await writeSessionStore({
      "agent:main:main": {
        sessionId: "parent-session",
        continuationChainTokens: 0,
      },
    });
    setRuntimeConfigSnapshot(makeBaseConfig());
  });

  afterEach(() => {
    spawnSpy.mockRestore();
    clearRuntimeConfigSnapshot();
    clearSessionStoreCacheForTest();
  });

  // Mirror the helper from subagent-announce.continuation.test.ts so the child
  // session entry is seeded before the announce flow runs.
  async function runContinuationAnnounce(params: {
    childSessionKey: string;
    childRunId: string;
    childTaskPrefix: string;
    reply: string;
  }): Promise<unknown> {
    const storePath = resolveStorePath(undefined, { agentId: "main" });
    const currentStore = loadSessionStore(storePath, { skipCache: true });
    currentStore[params.childSessionKey] = {
      sessionId: `${params.childSessionKey}-session`,
      updatedAt: Date.now(),
      inputTokens: 0,
      outputTokens: 0,
    };
    await saveSessionStore(storePath, currentStore, { skipMaintenance: true });
    clearSessionStoreCacheForTest();

    return await runSubagentAnnounceFlow({
      childSessionKey: params.childSessionKey,
      childRunId: params.childRunId,
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      requesterOrigin: { channel: "discord", to: "channel:123" },
      task: `${params.childTaskPrefix} delegated task`,
      roundOneReply: params.reply,
      timeoutMs: 10,
      cleanup: "keep",
      waitForCompletion: false,
      startedAt: 10,
      endedAt: 20,
      outcome: { status: "ok" },
      silentAnnounce: true,
    });
  }

  it("wires bare CONTINUE_WORK from a delegate-child to scheduleContinuationWork on the child's OWN session (#1044)", async () => {
    const childSessionKey = "agent:main:subagent:1044-token-child";
    const childRunId = "child-token-hop1-run";

    await runContinuationAnnounce({
      childSessionKey,
      childRunId,
      childTaskPrefix: "[continuation:chain-hop:1]",
      reply: "did the thing\nCONTINUE_WORK",
    });
    await new Promise((r) => {
      setTimeout(r, 50);
    });

    // CRITICAL: the WORK-kind bracket from a delegate-child must NOT route to
    // spawnSubagentDirect — that is the DELEGATE semantic (spawn a child).
    // continue_work is "same session, next turn" → drive HOP2 in the child's
    // own session.
    expect(mocked.spawnSubagentDirectMock).not.toHaveBeenCalled();

    // The wire-through must reach the continuation work scheduler — either the
    // single-request `scheduleContinuationWork` or the batch entrypoint. Both
    // forms end the same way (work-dispatch armed for the child session).
    const singleCalls = mocked.scheduleContinuationWorkMock.mock.calls as unknown[][];
    const batchCalls = mocked.scheduleContinuationWorkBatchMock.mock.calls as unknown[][];
    const calls: unknown[][] = [...singleCalls, ...batchCalls];
    expect(calls.length).toBeGreaterThan(0);

    // The wake's owner MUST be the child's own session (the `:977` ignore was
    // the bug; the fix-direction is the child drives its OWN next turn).
    const firstCall = calls[0] ?? [];
    const params = (firstCall[0] ?? {}) as {
      sessionKey?: unknown;
      parentRunId?: unknown;
    };
    expect(params.sessionKey).toBe(childSessionKey);
    // The parentRunId on the wake should be the child's runId (the run that
    // emitted CONTINUE_WORK), matching the tool surface path
    // (attempt-execution.ts:scheduleSpawnInitContinueWorkWake).
    expect(params.parentRunId).toBe(childRunId);
  });
});
