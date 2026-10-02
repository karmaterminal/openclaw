/**
 * Regression tests for surfacing `spawnResult.error` across the
 * subagent-announce rejection paths.
 *
 * Pins observability contracts at the canonical tool-delegate rejection path:
 *      - log line includes `reason=<text>` with `spawnResult.error` when present
 *      - `markPendingDelegateFailed` summary surfaces real reason text
 *      - Both fall back to `delegation was not accepted.` when error absent
 *
 * Without these contracts pinned, a regression that reverts the rejection-
 * obs cure would re-introduce opaque `Spawn rejected (forbidden)` /
 * `Tool delegate spawn rejected (forbidden)` log lines + the hard-coded
 * `delegation was not accepted.` system-event text — leaving observers
 * unable to disambiguate which forbidden-shape fired (cap, depth, agent-id
 * policy, sandbox policy, allowAgents target-policy, cwd policy, capability
 * gate, etc).
 */
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { dispatchToolDelegates } from "../auto-reply/continuation/delegate-dispatch.js";

type DispatchToolDelegatesParams = Parameters<typeof dispatchToolDelegates>[0];
type DispatchToolDelegatesResult = Awaited<ReturnType<typeof dispatchToolDelegates>>;

// --- Mocks that DO intercept the SUT (non-barrel modules) ---

vi.mock("./subagents/announce/subagent-announce.runtime.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readSessionMessagesAsync: vi.fn(async () => []),
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(async (request: Record<string, unknown>) => {
    if (request.method === "chat.history") {
      return { messages: [] };
    }
    return {};
  }),
}));

vi.mock("./subagents/spawn/subagent-depth.js", () => ({
  getSubagentDepthFromSessionStore: () => 1,
}));

vi.mock("./embedded-agent.js", () => ({
  isEmbeddedAgentRunActive: () => false,
  queueEmbeddedAgentMessage: () => false,
  waitForEmbeddedAgentRunEnd: async () => true,
}));

vi.mock("./subagents/registry/subagent-registry-read.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  countActiveDescendantRuns: () => 0,
  countPendingDescendantRuns: () => 0,
  countPendingDescendantRunsExcludingRun: () => 0,
  isSubagentSessionRunActive: () => true,
  listSubagentRunsForRequester: () => [],
  replaceSubagentRunAfterSteer: () => true,
  resolveRequesterForChildSession: () => null,
  shouldIgnorePostCompletionAnnounceForSession: () => false,
}));
// The descendant wake loads the registry module directly (the runtime barrel is
// gone); only the steer replacement this suite stubbed there is intercepted.
vi.mock("./subagents/registry/subagent-registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./subagents/registry/subagent-registry.js")>()),
  replaceSubagentRunAfterSteerCore: () => true,
}));

vi.mock("../auto-reply/continuation/state.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auto-reply/continuation/state.js")>()),
  registerContinuationTimerHandle: vi.fn(),
  retainContinuationTimerRef: vi.fn(),
  releaseContinuationTimerRef: vi.fn(),
  unregisterContinuationTimerHandle: vi.fn(),
}));

vi.mock("../auto-reply/continuation/delegate-store.js", async (importOriginal) => ({
  annotateQueuedDelegatesChainTokensFold: vi.fn(async () => 0),
  clearQueuedDelegatesChainTokensFold: vi.fn(async () => 0),
  consumePendingDelegates: vi.fn(async () => []),
  enqueuePendingDelegate: vi.fn(),
  markPendingDelegateFailed: vi.fn(),
  markPendingDelegateSpawnAccepted: vi.fn(),
  peekEarliestQueuedDelegateDueAt: vi.fn(async () => undefined),
  requeuePendingDelegate: vi.fn(),
  revalidatePendingDelegateForSpawn: vi.fn(async () => ({ allowed: true })),
  // The phase classifier is pure; keep the owner's rule.
  spawnResultNeverDispatched: (
    await importOriginal<typeof import("../auto-reply/continuation/delegate-store.js")>()
  ).spawnResultNeverDispatched,
}));

vi.mock("../auto-reply/continuation/delegate-spawn-interrupted.js", () => ({
  terminalizeInterruptedDelegateClaim: vi.fn(async () => undefined),
}));

vi.mock("../auto-reply/continuation/delegate-store-post-compaction.js", () => ({
  failStagedPostCompactionDelegatesForCleanup: vi.fn(() => 0),
  stagePostCompactionDelegate: vi.fn(),
}));

const { dispatchToolDelegatesMock } = vi.hoisted(() => ({
  dispatchToolDelegatesMock: vi.fn(
    async (params: DispatchToolDelegatesParams): Promise<DispatchToolDelegatesResult> => ({
      dispatched: 0,
      rejected: 0,
      chainState: params.chainState,
    }),
  ),
}));

vi.mock("../auto-reply/continuation/delegate-dispatch.js", () => ({
  dispatchToolDelegates: (params: DispatchToolDelegatesParams) => dispatchToolDelegatesMock(params),
}));

function failSharedDelegateDispatchOnce(): void {
  dispatchToolDelegatesMock.mockRejectedValueOnce(new Error("shared delegate dispatch failed"));
}

import { terminalizeInterruptedDelegateClaim } from "../auto-reply/continuation/delegate-spawn-interrupted.js";
import {
  consumePendingDelegates,
  markPendingDelegateFailed,
} from "../auto-reply/continuation/delegate-store.js";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
  type OpenClawConfig,
} from "../config/config.js";
import { resolveSessionStorePathCore } from "../config/sessions.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import { defaultRuntime } from "../runtime.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../test-utils/openclaw-test-state.js";
import { runSubagentAnnounceFlow } from "./subagents/announce/subagent-announce.js";
import * as subagentSpawn from "./subagents/spawn/subagent-spawn.js";

type AnnounceFlowParams = Parameters<typeof runSubagentAnnounceFlow>[0];

function makeConfig(): OpenClawConfig {
  return {
    session: { mainKey: "main", scope: "per-sender" as const },
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 10,
          costCapTokens: 500_000,
          minDelayMs: 0,
          maxDelayMs: 0,
          crossSessionTargeting: "disabled" as const,
        },
      },
    },
  };
}

async function writeChildSessionOwner(): Promise<void> {
  const storePath = resolveSessionStorePathCore(undefined, { agentId: "main" });
  await replaceSessionEntry(
    {
      agentId: "main",
      sessionKey: "agent:main:subagent:shard-reject-tool",
      storePath,
    },
    {
      sessionId: "session-shard-reject-tool",
      updatedAt: Date.now(),
    },
  );
}

function buildToolDelegateParams(): AnnounceFlowParams {
  return {
    childSessionKey: "agent:main:subagent:shard-reject-tool",
    childRunId: "run-reject-tool",
    requesterSessionKey: "agent:main:discord:dm:test-reject-tool",
    task: "[continuation:chain-hop:1] Tool-delegated from sub-agent (depth 1): do research",
    roundOneReply: "Research complete.",
    timeoutMs: 30_000,
    cleanup: "delete",
    outcome: { status: "ok" as const },
    silentAnnounce: true,
    wakeOnReturn: true,
  };
}

const mockedConsumePendingDelegates = vi.mocked(consumePendingDelegates);
const mockedMarkPendingDelegateFailed = vi.mocked(markPendingDelegateFailed);
const mockedTerminalizeInterruptedDelegateClaim = vi.mocked(terminalizeInterruptedDelegateClaim);

describe("subagent-announce tool-delegate rejection observability", () => {
  let spawnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let testState: OpenClawTestState;

  beforeEach(async () => {
    testState = await createOpenClawTestState({
      layout: "state-only",
      prefix: "openclaw-continuation-reject-observation-",
    });
    await writeChildSessionOwner();
    setRuntimeConfigSnapshot(makeConfig());
    spawnSpy = vi.spyOn(subagentSpawn, "spawnSubagentDirect");
    logSpy = vi.spyOn(defaultRuntime, "log").mockImplementation(() => {});
    mockedConsumePendingDelegates.mockReset().mockResolvedValue([]);
    dispatchToolDelegatesMock.mockReset().mockImplementation(async (params) => ({
      dispatched: 0,
      rejected: 0,
      chainState: params.chainState,
    }));
    mockedMarkPendingDelegateFailed.mockClear();
    mockedTerminalizeInterruptedDelegateClaim.mockClear();
  });

  afterEach(async () => {
    spawnSpy.mockRestore();
    logSpy.mockRestore();
    mockedConsumePendingDelegates.mockResolvedValue([]);
    dispatchToolDelegatesMock.mockReset().mockImplementation(async (params) => ({
      dispatched: 0,
      rejected: 0,
      chainState: params.chainState,
    }));
    mockedMarkPendingDelegateFailed.mockClear();
    clearRuntimeConfigSnapshot();
    await testState.cleanup();
  });

  it("surfaces spawnResult.error in `reason=...` log + markPendingDelegateFailed summary when present", async () => {
    const REASON = "tool-delegate depth cap exceeded";
    mockedConsumePendingDelegates.mockResolvedValueOnce([{ task: "tool task to reject" }]);
    failSharedDelegateDispatchOnce();
    spawnSpy.mockResolvedValue({ status: "forbidden", error: REASON });

    await runSubagentAnnounceFlow(buildToolDelegateParams());
    await new Promise((r) => {
      setTimeout(r, 50);
    });

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(dispatchToolDelegatesMock).toHaveBeenCalledTimes(1);

    const rejectionLogs = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((m: string) => m.includes("[subagent-chain-hop] Tool delegate spawn rejected"));
    expect(rejectionLogs).toHaveLength(1);
    expect(rejectionLogs[0]).toContain("reason=" + REASON);
    expect(rejectionLogs[0]).toContain("(forbidden)");

    expect(mockedMarkPendingDelegateFailed).toHaveBeenCalledTimes(1);
    const summaryArg = expectDefined(
      mockedMarkPendingDelegateFailed.mock.calls.at(0)?.at(1),
      "delegate failure summary",
    );
    expect(summaryArg).toContain(REASON);
    expect(summaryArg).toContain("forbidden");
    // Reason text must replace the canned "delegation was not accepted." string
    expect(summaryArg).not.toContain("delegation was not accepted.");
    expect(
      expectDefined(
        mockedMarkPendingDelegateFailed.mock.calls.at(0)?.at(2),
        "delegate failure title",
      ),
    ).toBe("Delegate rejected");
  });

  it("falls back to `delegation was not accepted.` when spawnResult.error is absent", async () => {
    mockedConsumePendingDelegates.mockResolvedValueOnce([{ task: "tool task no reason" }]);
    failSharedDelegateDispatchOnce();
    spawnSpy.mockResolvedValue({ status: "forbidden" });

    await runSubagentAnnounceFlow(buildToolDelegateParams());
    await new Promise((r) => {
      setTimeout(r, 50);
    });

    expect(spawnSpy).toHaveBeenCalledTimes(1);

    const rejectionLogs = logSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((m: string) => m.includes("[subagent-chain-hop] Tool delegate spawn rejected"));
    expect(rejectionLogs).toHaveLength(1);
    expect(rejectionLogs[0]).toContain("reason=delegation was not accepted.");

    expect(mockedMarkPendingDelegateFailed).toHaveBeenCalledTimes(1);
    const summaryArg = expectDefined(
      mockedMarkPendingDelegateFailed.mock.calls.at(0)?.at(1),
      "delegate failure summary",
    );
    expect(summaryArg).toContain("delegation was not accepted.");
    expect(
      expectDefined(
        mockedMarkPendingDelegateFailed.mock.calls.at(0)?.at(2),
        "delegate failure title",
      ),
    ).toBe("Delegate rejected");
  });

  it("terminalizes an unproven spawn outcome with one interrupted notice instead of a rejection", async () => {
    // RFC §5.4.4 (Q3): a spawn that may have dispatched is never replayed or
    // reported as a rejection; the claim ends with one interrupted notice.
    const delegate = { task: "tool task with unproven admission" };
    mockedConsumePendingDelegates.mockResolvedValueOnce([delegate]);
    failSharedDelegateDispatchOnce();
    spawnSpy.mockResolvedValue({
      status: "error",
      error: "gateway dropped the connection",
      runId: "run-maybe-dispatched",
      failurePhase: "dispatch",
    });

    await runSubagentAnnounceFlow(buildToolDelegateParams());
    await new Promise((r) => {
      setTimeout(r, 50);
    });

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(mockedTerminalizeInterruptedDelegateClaim).toHaveBeenCalledTimes(1);
    expect(mockedTerminalizeInterruptedDelegateClaim).toHaveBeenCalledWith(delegate);
    expect(mockedMarkPendingDelegateFailed).not.toHaveBeenCalled();
    const logs = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(
      logs.filter((m: string) => m.includes("[subagent-chain-hop] Tool delegate spawn rejected")),
    ).toEqual([]);
    expect(logs).toContainEqual(
      expect.stringContaining("Tool delegate spawn outcome unproven (error:dispatch)"),
    );
  });
});
