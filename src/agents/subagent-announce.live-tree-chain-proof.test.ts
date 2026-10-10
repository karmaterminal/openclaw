// Spawn admission verifies model account facts. Provision them through the
// shared spawn-model fixture so the chain never depends on an ambient account.
import "./subagents/spawn/subagent-spawn-model.mocks.shared.js";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferred, withinTest } from "../../test/helpers/promise.js";

type GatewayRequest = {
  method?: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
  expectFinal?: boolean;
};

const gatewayState = vi.hoisted(() => ({
  runCounter: 0,
  waitResults: new Map<string, { status: string; startedAt?: number; endedAt?: number }>(),
  chatHistoryBySessionKey: new Map<string, Array<Record<string, unknown>>>(),
}));

const callGatewayMock = vi.hoisted(() =>
  vi.fn(async (request: GatewayRequest) => {
    if (request.method === "sessions.patch" || request.method === "sessions.delete") {
      return { ok: true };
    }
    if (request.method === "agent") {
      gatewayState.runCounter += 1;
      return {
        runId: `run-${gatewayState.runCounter}`,
        status: "accepted",
        acceptedAt: Date.now(),
      };
    }
    if (request.method === "agent.wait") {
      const runId =
        typeof request.params?.runId === "string" ? request.params.runId.trim() : undefined;
      if (runId) {
        const planned = gatewayState.waitResults.get(runId);
        if (planned) {
          return planned;
        }
      }
      return { status: "pending" };
    }
    if (request.method === "chat.history") {
      const sessionKey =
        typeof request.params?.sessionKey === "string"
          ? request.params.sessionKey.trim()
          : undefined;
      return {
        messages: sessionKey ? (gatewayState.chatHistoryBySessionKey.get(sessionKey) ?? []) : [],
      };
    }
    return {};
  }),
);
const inProcessDispatchMock = vi.hoisted(() =>
  vi.fn(
    async (
      _method: string,
      params: Record<string, unknown>,
      _options?: Record<string, unknown>,
    ) => ({
      runId: typeof params.idempotencyKey === "string" ? params.idempotencyKey : "return-run",
      status: "accepted",
    }),
  ),
);

vi.mock("../gateway/call.js", () => ({
  callGateway: (...args: [GatewayRequest]) => callGatewayMock(...args),
}));
vi.mock("../gateway/server-plugin-in-process-dispatch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../gateway/server-plugin-in-process-dispatch.js")>()),
  dispatchGatewayMethodInProcess: (
    method: string,
    params: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => inProcessDispatchMock(method, params, options),
}));

import { resetContinuationCustodyProjection } from "../auto-reply/continuation/custody/custody-projection.js";
import { hydrateContinuationCustody } from "../auto-reply/continuation/custody/custody-store.js";
import {
  custodyStateForTest,
  listCustodyRecordsForTest,
} from "../auto-reply/continuation/custody/custody.test-support.js";
import {
  pendingDelegateCount,
  resetDelegateStoreForTests,
} from "../auto-reply/continuation/delegate-store.js";
import { resetContinueDelegateTurnAdmissionForTests } from "../auto-reply/continuation/delegate-turn-admission.js";
import {
  clearRuntimeConfigSnapshot,
  getRuntimeConfig,
  setRuntimeConfigSnapshot,
} from "../config/config.js";
import { resolveSessionStorePathCore } from "../config/sessions.js";
import { upsertSessionEntryCore } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { emitAgentEvent, resetAgentEventsForTest } from "../infra/agent-events.js";
import {
  resetContinuationTracer,
  setContinuationTracer,
  type SpanAttributes,
} from "../infra/continuation-tracer.js";
import {
  parseDiagnosticTraceparent,
  resetDiagnosticTraceContextForTest,
} from "../infra/diagnostic-trace-context.js";
import { peekSystemEventEntries, resetSystemEventsForTest } from "../infra/system-events.js";
import {
  getActiveGatewayRootWorkCount,
  getActiveGatewayRootWorkHolders,
} from "../process/gateway-work-admission.js";
import { defaultRuntime } from "../runtime.js";
import { closeOpenClawAgentDatabasesForTestAsync } from "../state/openclaw-agent-db-lifecycle.js";
import { closeOpenClawStateDatabaseAsync } from "../state/openclaw-state-db.js";
import { createOpenClawContinuationTools } from "./openclaw-tools.continuation.js";
import { loadSessionEntryByKey } from "./subagents/announce/subagent-announce-delivery.js";
import { subscribeSubagentRunChanges } from "./subagents/registry/subagent-registry-publication.js";
import {
  countPendingDescendantRuns,
  getSubagentRunByChildSessionKey,
  listSubagentRunsForRequester,
} from "./subagents/registry/subagent-registry-read.js";
import { getSubagentRunByRunId } from "./subagents/registry/subagent-registry.js";
import {
  releaseSubagentRun,
  resetSubagentRegistryForTests,
} from "./subagents/registry/subagent-registry.test-helpers.js";
import { getSubagentDepthFromSessionStore } from "./subagents/spawn/subagent-depth.js";
import { spawnSubagentDirect } from "./subagents/spawn/subagent-spawn.js";

const rootSessionKey = "agent:main:root";
const originTraceId = "11111111111111111111111111111111";
const originSpanId = "2222222222222222";
const originTraceparent = `00-${originTraceId}-${originSpanId}-01`;
let stateDir: string;

function makeConfig(): OpenClawConfig {
  return {
    session: { mainKey: "main", scope: "per-sender" as const },
    agents: {
      entries: { main: {} },
      defaults: {
        workspace: process.cwd(),
        // Pin the model so spawns never inherit the moving product default.
        model: { primary: "openai/gpt-5.5" },
        subagents: {
          maxSpawnDepth: 10,
          maxChildrenPerAgent: 10,
        },
        continuation: {
          enabled: true,
          maxChainLength: 10,
          costCapTokens: 500_000,
          minDelayMs: 25,
          maxDelayMs: 25,
          maxDelegatesPerTurn: 5,
          crossSessionTargeting: "disabled" as const,
        },
      },
    },
  };
}

async function upsertMainSessionEntry(sessionKey: string, sessionId: string, updatedAt: number) {
  await upsertSessionEntryCore(
    {
      sessionKey,
      agentId: "main",
      storePath: resolveSessionStorePathCore(undefined, { agentId: "main" }),
    },
    { sessionId, updatedAt },
  );
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise<void>((resolveTurn) => {
      setTimeout(resolveTurn, 20);
    });
  }
  throw new Error("timed out waiting for condition");
}

// Continuation delegates live in continuation custody, read from the durable
// store on every call.
async function continuationDelegateFlows(ownerKey: string) {
  return (await listCustodyRecordsForTest({ ownerSessionKey: ownerKey, kinds: ["delegate"] })).map(
    (record) => Object.assign(record, { state: custodyStateForTest(record) }),
  );
}

// Upstream removed the Tasks/TaskFlow runtime (6652f7eac8), so the spawned run's
// ownership is proven on the subagent registry record itself.
function expectSubagentRunOwnedBy(ownerKey: string, runId: string) {
  expect(getSubagentRunByRunId(runId)).toMatchObject({
    runId,
    requesterSessionKey: ownerKey,
  });
}

type RecordedContinuationSpan = {
  name: string;
  traceId: string;
  spanId: string;
  inputTraceparent?: string;
  attributes?: SpanAttributes;
};

function installRecordingContinuationTracer(): RecordedContinuationSpan[] {
  const spans: RecordedContinuationSpan[] = [];
  let sequence = 0;
  setContinuationTracer({
    startSpan(name, options) {
      sequence += 1;
      const parent = parseDiagnosticTraceparent(options?.traceparent);
      const traceId = parent?.traceId ?? sequence.toString(16).padStart(32, "0");
      const spanId = sequence.toString(16).padStart(16, "0");
      const recorded: RecordedContinuationSpan = {
        name,
        traceId,
        spanId,
        ...(options?.traceparent ? { inputTraceparent: options.traceparent } : {}),
        ...(options?.attributes ? { attributes: { ...options.attributes } } : {}),
      };
      spans.push(recorded);
      return {
        setAttributes(attributes) {
          recorded.attributes = { ...recorded.attributes, ...attributes };
        },
        setStatus() {},
        recordException() {},
        traceparent() {
          return `00-${traceId}-${spanId}-01`;
        },
        end() {},
      };
    },
  });
  return spans;
}

// This fixture opens no browser tabs. Keep unrelated plugin activation out of the
// bounded continuation handoff; browser cleanup has owner tests. The registry
// reaches this through loadSubagentBrowserCleanupModule(), so the mock has to sit
// at the module boundary rather than on an injected dependency.
vi.mock("../browser-lifecycle-cleanup.js", () => ({
  cleanupBrowserSessionsForLifecycleEnd: vi.fn(async () => {}),
}));
// Context-engine end-of-run notification activates the whole agent plugin
// runtime (every bundled provider). Plugin activation has its own owner tests
// and is not part of the continuation chain under proof.
vi.mock("./runtime-plugins.js", () => ({
  loadAgentRuntimePluginRegistryHandle: vi.fn(),
}));

describe("continuation chain production composition proof (tree hop-1 + hop-2)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    gatewayState.runCounter = 0;
    gatewayState.waitResults.clear();
    gatewayState.chatHistoryBySessionKey.clear();
    callGatewayMock.mockClear();
    inProcessDispatchMock.mockClear();

    stateDir = mkdtempSync(join(tmpdir(), "openclaw-proof-state-live-tree-chain-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    // Gateway boot hydrates the continuation custody projection before any turn.
    await hydrateContinuationCustody();

    resetAgentEventsForTest();
    await resetSubagentRegistryForTests();
    resetDelegateStoreForTests();
    resetContinueDelegateTurnAdmissionForTests();
    resetSystemEventsForTest();
    resetContinuationTracer();
    resetDiagnosticTraceContextForTest();
    setRuntimeConfigSnapshot(makeConfig());
    expect(getRuntimeConfig().agents?.defaults?.continuation?.enabled).toBe(true);

    await upsertMainSessionEntry(rootSessionKey, "sess-root", Date.now());

    logSpy = vi.spyOn(defaultRuntime, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(defaultRuntime, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    // Completion bookkeeping runs as detached Gateway
    // root work after the observable return. Drain it the way a Gateway restart
    // does before closing the SQLite handles it still reads.
    try {
      await waitFor(() => getActiveGatewayRootWorkCount() === 0, 4_000);
    } catch {
      throw new Error(
        `Gateway root work still active at teardown: ${getActiveGatewayRootWorkHolders().join(", ")}`,
      );
    }
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
    clearRuntimeConfigSnapshot();
    resetSystemEventsForTest();
    resetDelegateStoreForTests();
    resetContinueDelegateTurnAdmissionForTests();
    await resetSubagentRegistryForTests();
    resetAgentEventsForTest();
    resetContinuationTracer();
    resetDiagnosticTraceContextForTest();
    resetContinuationCustodyProjection();
    vi.unstubAllEnvs();
    // Both session access and shared state cache SQLite handles. Close them
    // before deleting this test's state directory so no handle/cache crosses
    // test boundaries (notably on Windows). Recipient authority capture uses the
    // agent database writer worker, so its retirement must settle first.
    await closeOpenClawAgentDatabasesForTestAsync();
    await closeOpenClawStateDatabaseAsync();
    rmSync(stateDir, { recursive: true, force: true });
    expect(existsSync(stateDir)).toBe(false);
    stateDir = "";
  });

  it("recovers a depth-1 orchestrator after its depth-2 delegate settles exactly once", async ({
    signal,
  }) => {
    const nonce = "CHAINED-DEPTH-2-RECOVERY";
    const childWaiting = `CHILD-WAITING ${nonce}`;
    const grandchildDone = `GRANDCHILD-DONE ${nonce}`;
    const childDone = `CHILD-DONE ${nonce}`;
    const hop1Spawn = await spawnSubagentDirect(
      {
        task: `[continuation:chain-hop:1] emit ${childWaiting}, then recover and emit ${childDone}`,
        silentAnnounce: true,
        wakeOnReturn: true,
        continuationFanoutMode: "tree",
        drainsContinuationDelegateQueue: true,
        continuationChainState: {
          count: 1,
          startedAt: Date.now(),
          tokens: 0,
          chainId: "proof-chain",
        },
      },
      {
        agentSessionKey: rootSessionKey,
        agentChannel: "discord",
        agentTo: "chan-root",
        agentAccountId: "acct-root",
      },
    );

    if (hop1Spawn.status !== "accepted") {
      throw new Error(`hop1 spawn failed: ${JSON.stringify(hop1Spawn)}`);
    }
    expect(hop1Spawn.status).toBe("accepted");
    expect(hop1Spawn.childSessionKey).toBeTruthy();
    expect(hop1Spawn.runId).toBeTruthy();

    const hop1ChildSessionKey = hop1Spawn.childSessionKey as string;
    const hop1RunId = hop1Spawn.runId as string;
    const hop1StartedAt = Date.now() - 1_000;
    const hop1EndedAt = Date.now();
    gatewayState.waitResults.set(hop1RunId, {
      status: "ok",
      startedAt: hop1StartedAt,
      endedAt: hop1EndedAt,
    });

    const delegateTool = createOpenClawContinuationTools({
      config: makeConfig(),
      runSessionKey: hop1ChildSessionKey,
      runId: hop1RunId,
      drainsContinuationDelegateQueue: true,
    }).find((tool) => tool.name === "continue_delegate");
    if (!delegateTool) {
      throw new Error("continue_delegate was not registered");
    }
    const scheduledDelegate = await delegateTool.execute("depth-2-delegate", {
      task: `reply exactly ${grandchildDone}`,
      mode: "silent-wake",
      fanoutMode: "tree",
    });
    expect(scheduledDelegate?.details).toMatchObject({
      status: "scheduled",
      mode: "silent-wake",
      fanoutMode: "tree",
    });
    expect(pendingDelegateCount(hop1ChildSessionKey)).toBe(1);
    expect(await listCustodyRecordsForTest({ ownerSessionKey: hop1ChildSessionKey })).toHaveLength(
      1,
    );
    expect(await continuationDelegateFlows(hop1ChildSessionKey)).toEqual([
      expect.objectContaining({
        status: "queued",
        state: expect.objectContaining({
          originRunId: hop1RunId,
          recipientAuthorityBinding: {
            version: 1,
            selection: "pending",
            fanoutMode: "tree",
          },
        }),
      }),
    ]);

    gatewayState.chatHistoryBySessionKey.set(hop1ChildSessionKey, [
      {
        role: "assistant",
        content: childWaiting,
      },
    ]);
    emitAgentEvent({
      runId: hop1RunId,
      stream: "lifecycle",
      sessionKey: hop1ChildSessionKey,
      data: {
        phase: "end",
        startedAt: hop1StartedAt,
        endedAt: hop1EndedAt,
        terminalReply: { disposition: "visible", text: childWaiting },
      },
    });

    // This completion is the file's first to run the announce and delegate-dispatch
    // path; cold, it took 4.3-4.9 s to register the delegate on a 4-CPU runner.
    await waitFor(
      () =>
        listSubagentRunsForRequester(hop1ChildSessionKey).some((entry) =>
          entry.task.includes("[continuation:chain-hop:2]"),
        ),
      15_000,
    );
    const requesterRuns = listSubagentRunsForRequester(hop1ChildSessionKey);
    const hop2Runs = requesterRuns.filter((entry) =>
      entry.task.includes("[continuation:chain-hop:2]"),
    );
    expect(hop2Runs).toHaveLength(1);
    const [hop2Run] = hop2Runs;

    if (!hop2Run) {
      throw new Error("expected one registered depth-2 delegate");
    }
    expect(hop2Run.requesterSessionKey).toBe(hop1ChildSessionKey);
    expect(hop2Run.controllerSessionKey).toBe(hop1ChildSessionKey);
    expect(hop2Run.cleanup).toBe("keep");
    expect(hop2Run.continuationTargetSessionKey).toBeUndefined();
    expect(hop2Run.continuationTargetSessionKeys).toEqual([hop1ChildSessionKey, rootSessionKey]);
    expect(hop2Run.continuationFanoutMode).toBe("tree");
    expect(hop2Run.continuationRecipientAuthorityBinding).toEqual({
      version: 1,
      selection: "selected",
      recipients: [
        {
          sessionKey: hop1ChildSessionKey,
          authority: { state: "bound", epoch: expect.any(String) },
        },
        {
          sessionKey: rootSessionKey,
          authority: { state: "bound", epoch: expect.any(String) },
        },
      ],
    });

    await waitFor(async () => {
      const intermediate = await getSubagentRunByChildSessionKey(hop1ChildSessionKey);
      return (
        intermediate?.wakeOnDescendantSettle === true ||
        typeof intermediate?.cleanupCompletedAt === "number"
      );
    }, 4_000);
    const waitingIntermediate = await getSubagentRunByChildSessionKey(hop1ChildSessionKey);
    await expect(countPendingDescendantRuns(hop1ChildSessionKey, () => {})).resolves.toBe(1);
    expect(waitingIntermediate?.runId).toBe(hop1RunId);
    expect(waitingIntermediate?.wakeOnDescendantSettle).toBe(true);
    expect(waitingIntermediate?.cleanupCompletedAt).toBeUndefined();

    const hop2SessionKey = hop2Run.childSessionKey;
    const hop2RunId = hop2Run.runId;
    const hop2StartedAt = Date.now() - 500;
    const hop2EndedAt = Date.now();
    gatewayState.waitResults.set(hop2RunId, {
      status: "ok",
      startedAt: hop2StartedAt,
      endedAt: hop2EndedAt,
    });

    expect(getSubagentDepthFromSessionStore(hop2Run.requesterSessionKey)).toBe(1);
    expect((await getSubagentRunByChildSessionKey(hop2SessionKey))?.runId).toBe(hop2RunId);
    expect((await loadSessionEntryByKey(rootSessionKey))?.sessionId).toBe("sess-root");
    expect((await loadSessionEntryByKey(hop1ChildSessionKey))?.sessionId).toBeTruthy();
    expect((await loadSessionEntryByKey(hop2SessionKey))?.sessionId).toBeTruthy();

    gatewayState.chatHistoryBySessionKey.set(hop2SessionKey, [
      {
        role: "assistant",
        content: grandchildDone,
      },
    ]);
    const countReturns = (sessionKey: string, marker: string) =>
      peekSystemEventEntries(sessionKey).filter((entry) => entry.text.includes(marker)).length;
    const rootGrandchildReturnsBefore = countReturns(rootSessionKey, grandchildDone);
    const hop1GrandchildReturnsBefore = countReturns(hop1ChildSessionKey, grandchildDone);

    const emitHop2Completion = () =>
      emitAgentEvent({
        runId: hop2RunId,
        stream: "lifecycle",
        sessionKey: hop2SessionKey,
        data: {
          phase: "end",
          startedAt: hop2StartedAt,
          endedAt: hop2EndedAt,
          terminalReply: { disposition: "visible", text: grandchildDone },
        },
      });
    // The wake dispatch is recorded before the registry swaps in the wake run:
    // the swap waits for the dispatch result and a fresh ownership check. Observe
    // the publication that retires the depth-1 run and registers its replacement.
    const intermediateReplaced = createDeferred();
    const stopObserving = subscribeSubagentRunChanges("projection", ({ runIds }) => {
      if (
        runIds?.includes(hop1RunId) &&
        !getSubagentRunByRunId(hop1RunId) &&
        runIds.some(
          (runId) => getSubagentRunByRunId(runId)?.childSessionKey === hop1ChildSessionKey,
        )
      ) {
        intermediateReplaced.resolve();
      }
    });
    try {
      emitHop2Completion();

      await waitFor(
        () =>
          countReturns(rootSessionKey, grandchildDone) === rootGrandchildReturnsBefore + 1 &&
          countReturns(hop1ChildSessionKey, grandchildDone) === hop1GrandchildReturnsBefore + 1 &&
          inProcessDispatchMock.mock.calls.some(
            ([method, params]) =>
              method === "agent" &&
              params.sessionKey === hop1ChildSessionKey &&
              typeof params.message === "string" &&
              params.message.includes(grandchildDone),
          ),
        4_000,
      );
      await withinTest(intermediateReplaced.promise, signal);
    } finally {
      stopObserving();
    }
    const recoveredIntermediate = await getSubagentRunByChildSessionKey(hop1ChildSessionKey);
    if (!recoveredIntermediate || recoveredIntermediate.runId === hop1RunId) {
      throw new Error("expected descendant completion to replace the intermediate run");
    }
    const recoveryRunId = recoveredIntermediate.runId;
    expect(getSubagentRunByRunId(hop1RunId)).toBeUndefined();
    expect(recoveredIntermediate.task).toContain(grandchildDone);
    expect(recoveredIntermediate.requesterSessionKey).toBe(rootSessionKey);
    expect(recoveredIntermediate.controllerSessionKey).toBe(rootSessionKey);
    expect(recoveredIntermediate.continuationTargetSessionKeys).toEqual([rootSessionKey]);
    expect(recoveredIntermediate.continuationFanoutMode).toBe("tree");
    expect(
      listSubagentRunsForRequester(rootSessionKey).filter(
        (entry) => entry.childSessionKey === hop1ChildSessionKey,
      ),
    ).toEqual([recoveredIntermediate]);

    const recoveryStartedAt = Date.now() - 250;
    const recoveryEndedAt = Date.now();
    gatewayState.waitResults.set(recoveryRunId, {
      status: "ok",
      startedAt: recoveryStartedAt,
      endedAt: recoveryEndedAt,
    });
    gatewayState.chatHistoryBySessionKey.set(hop1ChildSessionKey, [
      { role: "assistant", content: childWaiting },
      { role: "assistant", content: childDone },
    ]);
    const rootChildDoneBefore = countReturns(rootSessionKey, childDone);
    const emitRecoveryCompletion = () =>
      emitAgentEvent({
        runId: recoveryRunId,
        stream: "lifecycle",
        sessionKey: hop1ChildSessionKey,
        data: {
          phase: "end",
          startedAt: recoveryStartedAt,
          endedAt: recoveryEndedAt,
          terminalReply: { disposition: "visible", text: childDone },
        },
      });
    emitRecoveryCompletion();
    await waitFor(() => countReturns(rootSessionKey, childDone) === rootChildDoneBefore + 1, 4_000);

    const rootGrandchildReturnsAfterRecovery = countReturns(rootSessionKey, grandchildDone);
    const hop1GrandchildReturnsAfterRecovery = countReturns(hop1ChildSessionKey, grandchildDone);
    const rootChildDoneAfterRecovery = countReturns(rootSessionKey, childDone);
    emitHop2Completion();
    emitRecoveryCompletion();
    await new Promise<void>((resolveTurn) => {
      setTimeout(resolveTurn, 50);
    });

    expect(countReturns(rootSessionKey, grandchildDone)).toBe(rootGrandchildReturnsAfterRecovery);
    expect(countReturns(hop1ChildSessionKey, grandchildDone)).toBe(
      hop1GrandchildReturnsAfterRecovery,
    );
    expect(countReturns(rootSessionKey, childDone)).toBe(rootChildDoneAfterRecovery);
    expect(
      inProcessDispatchMock.mock.calls.filter(
        ([method, params]) =>
          method === "agent" &&
          params.sessionKey === hop1ChildSessionKey &&
          typeof params.message === "string" &&
          params.message.includes(grandchildDone),
      ),
    ).toHaveLength(1);
    expect(
      listSubagentRunsForRequester(hop1ChildSessionKey).filter((entry) =>
        entry.task.includes("[continuation:chain-hop:2]"),
      ),
    ).toHaveLength(1);
    expect(
      listSubagentRunsForRequester(rootSessionKey).filter(
        (entry) => entry.childSessionKey === hop1ChildSessionKey,
      ),
    ).toHaveLength(1);
    expect(
      callGatewayMock.mock.calls.filter(([request]) => request.method === "agent"),
    ).toHaveLength(2);
    expect(await continuationDelegateFlows(hop1ChildSessionKey)).toEqual([
      expect.objectContaining({
        status: "succeeded",
        handoff: expect.objectContaining({
          target: "subagent_runs",
          childRunId: hop2RunId,
          childSessionKey: hop2SessionKey,
        }),
      }),
    ]);
    expect(await listCustodyRecordsForTest({ ownerSessionKey: hop1ChildSessionKey })).toHaveLength(
      1,
    );
    expectSubagentRunOwnedBy(hop1ChildSessionKey, hop2RunId);
  });

  it("keeps a raw-final token delegate owned by its registered disposable origin", async () => {
    const spans = installRecordingContinuationTracer();
    const delegateSentinel = "RAW-TOKEN-DELEGATE-DONE";
    const delegateTask = `reply exactly ${delegateSentinel}`;
    const originSpawn = await spawnSubagentDirect(
      {
        task: "emit one raw-final delegate token",
        label: "raw-token-origin",
        cleanup: "delete",
        traceparent: originTraceparent,
      },
      {
        agentSessionKey: rootSessionKey,
        agentChannel: "discord",
        agentTo: "chan-root",
        agentAccountId: "acct-root",
      },
    );
    if (originSpawn.status !== "accepted" || !originSpawn.childSessionKey || !originSpawn.runId) {
      throw new Error(`origin spawn failed: ${JSON.stringify(originSpawn)}`);
    }
    const originChildSessionKey = originSpawn.childSessionKey;
    const originChildRunId = originSpawn.runId;
    gatewayState.waitResults.set(originChildRunId, {
      status: "ok",
      startedAt: 10,
      endedAt: 20,
    });
    const originFinalText = `Origin complete.\n[[CONTINUE_DELEGATE: ${delegateTask} +1s]]`;
    gatewayState.chatHistoryBySessionKey.set(originChildSessionKey, [
      {
        role: "assistant",
        content: originFinalText,
      },
    ]);

    const emitOriginCompletion = () => {
      emitAgentEvent({
        runId: originChildRunId,
        stream: "lifecycle",
        sessionKey: originChildSessionKey,
        data: {
          phase: "end",
          startedAt: 10,
          endedAt: 20,
          terminalReply: { disposition: "visible", text: originFinalText },
        },
      });
    };
    emitOriginCompletion();

    const listDelegateRuns = () =>
      [
        ...listSubagentRunsForRequester(rootSessionKey),
        ...listSubagentRunsForRequester(originChildSessionKey),
      ]
        .filter((entry) => entry.task.includes(delegateSentinel))
        .filter(
          (entry, index, entries) =>
            entries.findIndex((candidate) => candidate.runId === entry.runId) === index,
        );
    let observedFlows: Awaited<ReturnType<typeof continuationDelegateFlows>> = [];
    await waitFor(async () => {
      observedFlows = await continuationDelegateFlows(originChildSessionKey);
      const flow = observedFlows[0];
      return (
        flow?.status === "succeeded" &&
        listDelegateRuns().length === 1 &&
        spans.some((span) => span.name === "continuation.delegate.dispatch") &&
        spans.some((span) => span.name === "continuation.delegate.fire")
      );
    }, 4_000);

    const flows = await continuationDelegateFlows(originChildSessionKey);
    const flow = flows[0];
    const [delegateRun] = listDelegateRuns();
    if (!flow || !delegateRun) {
      throw new Error("expected one accepted raw-token delegate flow and run");
    }
    expect(flow).toMatchObject({
      ownerSessionKey: originChildSessionKey,
      status: "succeeded",
      phase: "Accepted by continuation subagent",
      handoff: {
        target: "subagent_runs",
        childRunId: delegateRun.runId,
        childSessionKey: delegateRun.childSessionKey,
      },
    });
    expect(flow.state).toMatchObject({
      childSessionKey: delegateRun.childSessionKey,
    });
    expect.soft(flow.state).toMatchObject({ originRunId: originChildRunId });
    expect.soft(delegateRun.requesterSessionKey).toBe(originChildSessionKey);
    expect.soft(delegateRun.controllerSessionKey).toBe(originChildSessionKey);
    expect
      .soft(await listCustodyRecordsForTest({ ownerSessionKey: rootSessionKey }))
      .toHaveLength(0);
    expect.soft(await continuationDelegateFlows(originChildSessionKey)).toEqual([
      expect.objectContaining({
        recordId: flow.recordId,
        ownerSessionKey: originChildSessionKey,
        state: expect.objectContaining({
          childSessionKey: delegateRun.childSessionKey,
          originRunId: originChildRunId,
        }),
      }),
    ]);

    const dispatchSpan = spans.find((span) => span.name === "continuation.delegate.dispatch");
    const fireSpan = spans.find((span) => span.name === "continuation.delegate.fire");
    expect(dispatchSpan).toBeDefined();
    expect(fireSpan).toBeDefined();
    expect.soft(dispatchSpan?.traceId).toBe(originTraceId);
    expect.soft(fireSpan?.traceId).toBe(originTraceId);
    expect.soft(dispatchSpan?.traceId).toBe(fireSpan?.traceId);

    emitOriginCompletion();
    await new Promise<void>((resolveTurn) => {
      setTimeout(resolveTurn, 50);
    });
    expect(await continuationDelegateFlows(originChildSessionKey)).toHaveLength(1);
    expect(
      await listCustodyRecordsForTest({ ownerSessionKey: originChildSessionKey }),
    ).toHaveLength(1);
    expectSubagentRunOwnedBy(originChildSessionKey, delegateRun.runId);
    expect(listDelegateRuns()).toHaveLength(1);
    await releaseSubagentRun(originChildRunId);
    expect(await getSubagentRunByChildSessionKey(originChildSessionKey)).toBeNull();

    const delegateChildSessionKey = delegateRun.childSessionKey;
    const delegateChildRunId = delegateRun.runId;
    gatewayState.waitResults.set(delegateChildRunId, {
      status: "ok",
      startedAt: 30,
      endedAt: 40,
    });
    gatewayState.chatHistoryBySessionKey.set(delegateChildSessionKey, [
      {
        role: "assistant",
        content: delegateSentinel,
      },
    ]);
    const countReturns = (sessionKey: string) => {
      const durableMailboxReturns = peekSystemEventEntries(sessionKey).filter((entry) =>
        entry.text.includes(delegateSentinel),
      ).length;
      const gatewayReturns = callGatewayMock.mock.calls.filter(
        ([request]) =>
          request.method === "agent" &&
          request.params?.sessionKey === sessionKey &&
          typeof request.params.message === "string" &&
          request.params.message.includes(delegateSentinel),
      ).length;
      const inProcessReturns = inProcessDispatchMock.mock.calls.filter(
        ([method, params]) =>
          method === "agent" &&
          params.sessionKey === sessionKey &&
          typeof params.message === "string" &&
          params.message.includes(delegateSentinel),
      ).length;
      return durableMailboxReturns + gatewayReturns + inProcessReturns;
    };
    const originReturnsBefore = countReturns(originChildSessionKey);
    const rootReturnsBefore = countReturns(rootSessionKey);
    const emitDelegateCompletion = () =>
      emitAgentEvent({
        runId: delegateChildRunId,
        stream: "lifecycle",
        sessionKey: delegateChildSessionKey,
        data: {
          phase: "end",
          startedAt: 30,
          endedAt: 40,
          terminalReply: { disposition: "visible", text: delegateSentinel },
        },
      });

    emitDelegateCompletion();
    try {
      await waitFor(
        () =>
          countReturns(originChildSessionKey) + countReturns(rootSessionKey) ===
          originReturnsBefore + rootReturnsBefore + 1,
        4_000,
      );
    } catch {
      throw new Error(
        JSON.stringify({
          originRun: await getSubagentRunByChildSessionKey(originChildSessionKey),
          delegateRun: await getSubagentRunByChildSessionKey(delegateChildSessionKey),
          originEvents: peekSystemEventEntries(originChildSessionKey).map((entry) => entry.text),
          rootEvents: peekSystemEventEntries(rootSessionKey).map((entry) => entry.text),
          gatewayCalls: callGatewayMock.mock.calls,
          inProcessDispatches: inProcessDispatchMock.mock.calls,
          logs: logSpy.mock.calls.map(([message]: [unknown]) => String(message)),
          errors: errorSpy.mock.calls.map(([message]: [unknown]) => String(message)),
        }),
      );
    }
    expect.soft(countReturns(originChildSessionKey)).toBe(originReturnsBefore + 1);
    expect.soft(countReturns(rootSessionKey)).toBe(rootReturnsBefore);

    emitDelegateCompletion();
    await new Promise<void>((resolveTurn) => {
      setTimeout(resolveTurn, 50);
    });
    expect(countReturns(originChildSessionKey)).toBe(originReturnsBefore + 1);
    expect(countReturns(rootSessionKey)).toBe(rootReturnsBefore);
  });
});
