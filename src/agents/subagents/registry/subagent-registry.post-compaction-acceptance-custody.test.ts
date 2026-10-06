// H1 T8 (absorb 14fe10d0): a post-ok rollback by a deferred final acceptance owner.
// The real post-compaction delivery accepts a child through the real spawn pipeline
// and registry (wired exactly as spawnSubagentDirect wires a continuation delegate),
// then loses its source acceptance, so its `finally` rolls the child back. The custody
// write is refused and the abort fails; after a restart the child must be aborted and
// its row removed, never resumed, delivered or respawned.
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Shared registry mocks must load before the registry modules below.
// oxfmt-ignore
import { sharedRegistryMocks } from "./subagent-registry.mocks.shared.js";
import "./subagent-registry.persistence.mocks.test-support.js";
import { useContinuationCustodyTestState } from "../../../auto-reply/continuation/custody/custody.test-support.js";
import type {
  ChainState,
  ContinuationRuntimeConfig,
} from "../../../auto-reply/continuation/types.js";
import {
  deliverQueuedPostCompactionDelegate,
  type PostCompactionDelegateDeliveryDeps,
  type PostCompactionDelegateSpawn,
  type QueuedPostCompactionDelegateDelivery,
} from "../../../auto-reply/reply/post-compaction-delegate-delivery.js";
import * as sessionAccessorModule from "../../../config/sessions/session-accessor.js";
import { formatContinuationChildRunId } from "../../../shared/continuation-run-key.js";
import { closeOpenClawStateDatabaseForTest } from "../../../state/openclaw-state-db.js";
import { runSpawnPipeline } from "../../spawn-pipeline.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { restoreSubagentRunsFromDisk } from "./subagent-registry-persistence.js";
import type { RegisterSubagentRunParams } from "./subagent-registry-run-launch.js";
import {
  loadSubagentRegistryFromSqlite,
  saveSubagentRegistryToSqlite,
} from "./subagent-registry-state.fixture.test-support.js";
import * as registry from "./subagent-registry.js";
import {
  activateSubagentRegistry,
  initSubagentRegistry,
  resetSubagentRegistryForTests,
  testing,
} from "./subagent-registry.test-helpers.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import {
  faultWrites,
  interceptRegistryWrites,
  liftFaults,
} from "./subagent-registry.write-faults.test-support.js";

const announceMocks = vi.hoisted(() => ({
  runSubagentAnnounceFlow: vi.fn(async () => true),
}));
vi.mock("../announce/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: announceMocks.runSubagentAnnounceFlow,
  captureSubagentCompletionReply: vi.fn(async () => undefined),
}));

const NOW = 1_700_000_000_000;
const flowId = "pc-flow-acceptance-custody";
const childRunId = formatContinuationChildRunId(flowId, 1);
const runtimeConfig: ContinuationRuntimeConfig = {
  enabled: true,
  defaultDelayMs: 0,
  minDelayMs: 0,
  maxDelayMs: 1_000,
  maxChainLength: 4,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
  maxPendingWork: 32,
  crossSessionTargeting: "disabled",
};

const custodyState = useContinuationCustodyTestState();
const abortCalls: string[] = [];
const successfulAborts: string[] = [];
let abortSucceeds = true;

beforeEach(() => {
  abortCalls.length = 0;
  successfulAborts.length = 0;
  abortSucceeds = true;
  announceMocks.runSubagentAnnounceFlow.mockClear();
  interceptRegistryWrites();
  sharedRegistryMocks.callGateway.mockImplementation((async (request: {
    method?: string;
    params?: { runId?: string };
  }) => {
    if (request.method === "agent.wait") {
      return await new Promise(() => {});
    }
    if (request.method !== "chat.abort") {
      return { status: "ok" };
    }
    abortCalls.push(String(request.params?.runId));
    if (!abortSucceeds) {
      throw new Error("gateway unavailable");
    }
    successfulAborts.push(String(request.params?.runId));
    return { aborted: true, runIds: [request.params?.runId] };
  }) as unknown as typeof sharedRegistryMocks.callGateway);
});

afterEach(async () => {
  liftFaults();
  // Unknown-outcome writes fence their runs in process memory; resolve them as a
  // new process would (one canonical restore) so no fence leaks into the next test.
  await restoreSubagentRunsFromDisk({ runs: new Map() }).catch(() => undefined);
  await resetSubagentRegistryForTests({ persist: false });
  vi.restoreAllMocks();
});

/** The continuation-delegate spawn, wired as spawnSubagentDirect wires it, minus the Gateway. */
const nativeDelegateSpawn: PostCompactionDelegateSpawn = async (_params, ctx) => {
  const childSessionKey = "agent:main:subagent:post-compaction-acceptance";
  const result = await runSpawnPipeline({
    adapter: {
      initialize: async () => ({}),
      dispatchTurn: async () => ({ runId: childRunId }),
      cleanupOnFailure: async () => {
        throw new Error("accepted child termination unconfirmed");
      },
    },
    progressSessionKey: "agent:main:main",
    buildRegistration: (_state, runId) =>
      ({
        runId,
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "post-compaction delegate",
        cleanup: "keep",
        expectsCompletionMessage: true,
        acceptanceCustody: { gatewayRunId: runId },
      }) as RegisterSubagentRunParams,
    recordAcceptedRollback: (registration, error) =>
      registry.recordAcceptedSubagentSpawnRollback({
        runId: registration.runId,
        childSessionKey: registration.childSessionKey,
        gatewayRunId: registration.runId,
        reason: error instanceof Error ? error.message : String(error),
        expectedRegistration: registration.expectedRegistration,
      }),
    rollbackRegistration: (registration) =>
      registry.rollbackSubagentRunRegistration({
        runId: registration.runId,
        childSessionKey: registration.childSessionKey,
        expectedRegistration: registration.expectedRegistration,
      }),
    confirmAcceptance: (registration) =>
      registry.confirmSubagentSpawnAcceptance({
        runId: registration.runId,
        childSessionKey: registration.childSessionKey,
        expectedRegistration: registration.expectedRegistration,
      }),
    deferAcceptanceConfirmation: ctx.continuationDelegateAdmission !== undefined,
    releaseAcceptanceHold: (registration) =>
      registry.releaseSubagentSpawnAcceptanceHoldForRun(registration.runId),
  } as Parameters<typeof runSpawnPipeline>[0]);
  if (!result.ok) {
    return { status: "error", error: String(result.error), failurePhase: result.phase };
  }
  return {
    status: "accepted",
    context: "isolated",
    runId: result.runId,
    childSessionKey,
    rollbackAccepted: result.rollbackAccepted,
    ...(result.confirmAccepted
      ? {
          confirmAccepted: result.confirmAccepted,
          releaseAcceptanceHold: result.releaseAcceptanceHold,
        }
      : {}),
  } as Awaited<ReturnType<PostCompactionDelegateSpawn>>;
};

function createDeps(storePath: string, spawn: PostCompactionDelegateSpawn) {
  const markPendingDelegateSpawnAccepted = vi.fn(async () => false);
  const deps: PostCompactionDelegateDeliveryDeps = {
    enqueueSystemEvent: vi.fn(),
    getRuntimeConfig: vi.fn(() => ({})),
    loadSessionEntry: ({ storePath: target, sessionKey }) =>
      sessionAccessorModule.loadSessionEntry({ storePath: target, sessionKey }),
    log: vi.fn(),
    now: vi.fn(() => NOW),
    patchSessionEntryCore: sessionAccessorModule.patchSessionEntryCore,
    resolveContinuationRuntimeConfig: vi.fn(() => runtimeConfig),
    resolveSessionAgentId: vi.fn(() => "main"),
    resolveSessionStorePathCore: vi.fn(() => storePath),
    spawnSubagentDirect: vi.fn(spawn),
    revalidatePendingDelegateForSpawn: vi.fn(async () => ({ allowed: true }) as const),
    // Final acceptance fails after the child was accepted: the delegate source
    // acceptance did not commit.
    markPendingDelegateSpawnAccepted,
    failReleasedPostCompactionDelegate: vi.fn(async () => true),
    reserveAcceptedPostCompactionChainHop: vi.fn(
      async (flowRef: { expectedRevision?: number }, plannedChainState: ChainState) => ({
        chainState: plannedChainState,
        expectedRevision:
          flowRef.expectedRevision === undefined ? undefined : flowRef.expectedRevision + 1,
      }),
    ),
    readAdmissionEvidence: vi.fn(async () => ({ kind: "none" }) as const),
    markAttemptStarted: vi.fn(async () => undefined),
    enqueueInterruptedNotice: vi.fn(async () => undefined),
  };
  return { deps, markPendingDelegateSpawnAccepted };
}

function queuedEntry(): QueuedPostCompactionDelegateDelivery {
  return {
    id: "queue-acceptance-custody",
    kind: "postCompactionDelegate",
    sessionKey: "main",
    sourceSessionId: "session",
    sourceLifecycleRevision: "lifecycle",
    sourceFlowId: flowId,
    sourceExpectedRevision: 1,
    task: "carry state",
    createdAt: NOW,
    firstArmedAt: NOW,
    enqueuedAt: NOW,
    retryCount: 0,
    childRunId,
  } as QueuedPostCompactionDelegateDelivery;
}

async function restartFrom(image: Map<string, SubagentRunRecord>) {
  closeOpenClawStateDatabaseForTest();
  await resetSubagentRegistryForTests({ persist: false });
  saveSubagentRegistryToSqlite(image);
  // A new process holds no in-memory write fences.
  await restoreSubagentRunsFromDisk({ runs: new Map() });
  await initSubagentRegistry();
  const dispatchAgent = vi.fn(async () => ({ runId: "relaunched", status: "accepted" }));
  const gatewayContext = {
    recoveryRuntime: { dispatchAgent },
    resolveGatewayContext: () => gatewayContext as never,
  };
  await activateSubagentRegistry(gatewayContext.resolveGatewayContext);
  return dispatchAgent;
}

describe("post-compaction delegate final acceptance (H1 T8)", () => {
  it("T8: a post-ok rollback whose custody write and abort fail is aborted after restart", async () => {
    const storePath = path.join(custodyState.stateDir(), "sessions.json");
    await sessionAccessorModule.upsertSessionEntryCore(
      { storePath, sessionKey: "main" },
      { sessionId: "session", lifecycleRevision: "lifecycle", updatedAt: 1 },
    );
    const { deps, markPendingDelegateSpawnAccepted } = createDeps(storePath, nativeDelegateSpawn);
    faultWrites("refuse", (rows) =>
      rows.some((row) => row.runId === childRunId && row.acceptedSpawnRollback !== undefined),
    );
    abortSucceeds = false;

    await expect(
      deliverQueuedPostCompactionDelegate({ entry: queuedEntry() }, deps),
    ).rejects.toThrow();
    expect(deps.spawnSubagentDirect).toHaveBeenCalledOnce();
    expect(markPendingDelegateSpawnAccepted).toHaveBeenCalledOnce();
    // The child stayed registered: its custody write and termination both failed.
    const crashImage = loadSubagentRegistryFromSqlite();
    expect(crashImage.get(childRunId)).toBeDefined();

    liftFaults();
    abortSucceeds = true;
    abortCalls.length = 0;
    const dispatchAgent = await restartFrom(crashImage);
    await testing.sweepOnceForTests();
    await testing.sweepOnceForTests();
    expect(successfulAborts).toEqual([childRunId]);
    expect(subagentRuns.get(childRunId)).toBeUndefined();
    expect(loadSubagentRegistryFromSqlite().get(childRunId)).toBeUndefined();
    expect(dispatchAgent).not.toHaveBeenCalled();
    expect(announceMocks.runSubagentAnnounceFlow).not.toHaveBeenCalled();
    // The delegate was never respawned.
    expect(deps.spawnSubagentDirect).toHaveBeenCalledOnce();
  });
});
