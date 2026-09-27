import { expect, it, vi } from "vitest";
import { isPathInside } from "../../../infra/path-guards.js";
import { createSubagentRunRecord } from "../../subagent-test-fixtures.test-helpers.js";
import { createSubagentPersistenceRuntime } from "./subagent-registry.persistence-fixture.test-support.js";
import {
  createCanonicalSubagentRunFixture,
  createDeliveredWake,
  removeSubagentSessionEntry,
  settleSubagentRegistryPersistenceWork,
  withSubagentRegistryPersistenceState,
  writeChildSession,
  writeSubagentSessionEntry,
} from "./subagent-registry.persistence.test-support.js";
import {
  loadSubagentRegistryFromSqlite,
  saveSubagentRegistryToSqlite,
} from "./subagent-registry.store.sqlite.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

type RegistryModule = typeof import("./subagent-registry.test-helpers.js");
type GatewayCall = typeof import("../../../gateway/call.js").callGateway;
type WakeRequester =
  typeof import("../announce/subagent-announce.requester-settle-wake.js").maybeWakeRequesterAfterAllChildrenSettled;

export const FORCED_RESTART_WAKE_CASES = [
  { order: "replacement-first", runCount: 1 },
  { order: "old-finally-first", runCount: 1 },
  { order: "before-activation", runCount: 1 },
  { order: "replacement-first", runCount: 3 },
] as const;

function listFixtureAgentDatabases(listDatabases: () => Array<{ path: string }>, stateDir: string) {
  return listDatabases().filter((database) => isPathInside(stateDir, database.path));
}

export function expectFixtureAgentDatabaseCount(
  listDatabases: () => Array<{ path: string }>,
  stateDir: string,
  message: string,
  count: number,
) {
  expect(listFixtureAgentDatabases(listDatabases, stateDir), message).toHaveLength(count);
}

async function closePersistenceResumeFixtureDatabases(params: {
  stateDir: string;
  cleanupSessionState: (params: { stateDir: string }) => Promise<void>;
  databaseLists: ReadonlyArray<{ label: string; list: () => Array<{ path: string }> }>;
  closeStateDatabases: () => void;
}) {
  await params.cleanupSessionState({ stateDir: params.stateDir });
  for (const databaseList of params.databaseLists) {
    expect(
      listFixtureAgentDatabases(databaseList.list, params.stateDir),
      `${databaseList.label} agent handles closed before fixture removal`,
    ).toEqual([]);
  }
  params.closeStateDatabases();
}

export function withPersistenceResumeRegistryState<T>(params: {
  stateDir: string;
  run: () => Promise<T>;
  mod: RegistryModule;
  cleanupSessionState: (params: { stateDir: string }) => Promise<void>;
  databaseLists: ReadonlyArray<{ label: string; list: () => Array<{ path: string }> }>;
  closeStateDatabases: () => void;
}): Promise<T> {
  return withSubagentRegistryPersistenceState(
    {
      stateDir: params.stateDir,
      resetRegistry: () => params.mod.resetSubagentRegistryForTests({ persist: false }),
      closeDatabases: () =>
        closePersistenceResumeFixtureDatabases({
          stateDir: params.stateDir,
          cleanupSessionState: params.cleanupSessionState,
          databaseLists: params.databaseLists,
          closeStateDatabases: params.closeStateDatabases,
        }),
    },
    params.run,
  );
}

export function readPersistedRun(runId: string) {
  return loadSubagentRegistryFromSqlite().get(runId);
}

export function activatePersistenceResumeRegistry(mod: RegistryModule, callGateway: GatewayCall) {
  // Build the real recovery-runtime shape (incl. dispatchSessionMethod) that production uses.
  const recoveryRuntime = createSubagentPersistenceRuntime(callGateway);
  const gateway = { recoveryRuntime, resolveGatewayContext: () => gateway as never };
  mod.activateSubagentRegistry(() => gateway as never);
}

export function registerSteerRestartOrphanPersistenceCases(params: {
  getRegistry: () => RegistryModule;
  getCallGateway: () => GatewayCall;
  getStateDatabase: () => typeof import("../../../state/openclaw-state-db.js");
  withRegistryState: (run: (stateDir: string) => Promise<void>) => Promise<void>;
  activateRegistry: () => void;
  announceSpy: unknown;
}) {
  it("settles a steer-restart orphan without entering a retry-resume loop", async () => {
    await params.withRegistryState(async (stateDir) => {
      const mod = params.getRegistry();
      const runId = "run-orphan-resume-guard";
      const childSessionKey = "agent:main:subagent:ghost-resume";
      const now = Date.now();

      await writeSubagentSessionEntry({
        stateDir,
        agentId: "main",
        sessionKey: childSessionKey,
        sessionId: "sess-resume-guard",
        updatedAt: now,
        defaultSessionId: "sess-resume-guard",
      });
      const run = createCanonicalSubagentRunFixture(
        createSubagentRunRecord({
          runId,
          childSessionKey,
          requesterSessionKey: "agent:main:main",
          requesterDisplayKey: "main",
          task: "resume orphan guard",
          cleanup: "keep",
          createdAt: now - 50,
          startedAt: now - 25,
          endedAt: now,
          expectsCompletionMessage: false,
          suppressAnnounceReason: "steer-restart",
          cleanupHandled: false,
        }),
      );
      saveSubagentRegistryToSqlite(new Map([[runId, run]]));
      await removeSubagentSessionEntry({
        stateDir,
        agentId: "main",
        sessionKey: childSessionKey,
      });

      mod.initSubagentRegistry();
      expect(mod.getSubagentRunByRunId(runId)).toMatchObject({
        suppressAnnounceReason: "steer-restart",
        completion: { required: false },
        delivery: { status: "not_required" },
      });
      params.activateRegistry();
      expect(mod.clearSubagentRunSteerRestart(runId)).toBe(true);
      await settleSubagentRegistryPersistenceWork();
      await vi.waitFor(() =>
        expect(mod.getSubagentRunByRunId(runId)).toMatchObject({
          execution: {
            status: "terminal",
            outcome: { status: "error", error: "subagent run orphaned: missing-session-entry" },
          },
          endedReason: "subagent-error",
          completion: { required: false, resultText: null, capturedAt: expect.any(Number) },
          delivery: { status: "not_required" },
          cleanupCompletedAt: expect.any(Number),
        }),
      );

      expect(params.announceSpy).not.toHaveBeenCalled();
      expect(vi.mocked(params.getCallGateway())).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: "agent.wait" }),
      );
      expect(loadSubagentRegistryFromSqlite().get(runId)).toMatchObject({
        execution: { status: "terminal", outcome: { status: "error" } },
        completion: { resultText: null, capturedAt: expect.any(Number) },
        delivery: { status: "not_required" },
      });
    });
  });

  it("rejects a non-canonical persisted steer-restart row before resume", async () => {
    await params.withRegistryState(async () => {
      const mod = params.getRegistry();
      const runId = "run-noncanonical-steer-restart";
      const run = createCanonicalSubagentRunFixture(
        createSubagentRunRecord({
          runId,
          childSessionKey: "agent:main:subagent:noncanonical-steer-restart",
          task: "reject before retry",
          endedAt: Date.now(),
          expectsCompletionMessage: false,
          suppressAnnounceReason: "steer-restart",
        }),
      );
      saveSubagentRegistryToSqlite(new Map([[runId, run]]));

      const db = params.getStateDatabase().openOpenClawStateDatabase().db;
      const stored = db
        .prepare("SELECT payload_json FROM subagent_runs WHERE run_id = ?")
        .get(runId) as { payload_json: string };
      const nonCanonical = JSON.parse(stored.payload_json) as Record<string, unknown>;
      nonCanonical.completion = undefined;
      nonCanonical.delivery = undefined;
      db.prepare("UPDATE subagent_runs SET payload_json = ? WHERE run_id = ?").run(
        JSON.stringify(nonCanonical),
        runId,
      );

      expect(loadSubagentRegistryFromSqlite().has(runId)).toBe(false);
      mod.initSubagentRegistry();
      params.activateRegistry();
      await settleSubagentRegistryPersistenceWork();

      expect(mod.getSubagentRunByRunId(runId)).toBeUndefined();
      expect(vi.mocked(params.getCallGateway())).not.toHaveBeenCalled();
      expect(params.announceSpy).not.toHaveBeenCalled();
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM subagent_runs WHERE run_id = ?").get(runId),
      ).toEqual({ count: 1 });
    });
  });
}

export function createHydratedRegistryRuns(endedAt: number) {
  const yieldedRun = createDeliveredWake("run-hydrated-yield", undefined, {
    taskRunId: "run-hydrated-yield",
    requesterTurnRunId: "run-requester",
    requesterTurnYielded: true,
    childSessionKey: "agent:main:subagent:hydrated-yield",
    task: "wake only after lifecycle activation",
    createdAt: endedAt - 1_000,
    endedReason: "subagent-complete",
    startedAt: endedAt - 500,
    endedAt,
    cleanupCompletedAt: endedAt,
  });
  const queuedCollector = createSubagentRunRecord({
    runId: "run-hydrated-collector",
    childSessionKey: "agent:main:subagent:hydrated-collector",
    task: "clean only after lifecycle activation",
    createdAt: endedAt - 500,
    collect: true,
    swarmRequesterSessionKey: "agent:main:main",
    groupId: "hydrated-group",
    archiveAtMs: endedAt - 1,
    startedAt: endedAt - 400,
    endedAt,
    outcome: { status: "error", error: "launch failed" },
    completion: { required: true },
    delivery: { status: "pending" },
    collectorCompletion: { status: "failed" },
    collectorLaunchCleanupPending: true,
  });
  const runningRun = createSubagentRunRecord({
    runId: "run-hydrated-running",
    childSessionKey: "agent:main:subagent:hydrated-running",
    task: "wait through the activated instance",
    createdAt: endedAt,
    execution: { status: "running", startedAt: endedAt },
    completion: { required: false },
    delivery: { status: "not_required" },
  });
  return { queuedCollector, runningRun, yieldedRun };
}

export function createRejectedRequesterWake(params: {
  restarting: boolean;
  waitingForActivation: boolean;
  endedAt: number;
}) {
  return createDeliveredWake("run-rejected-requester-wake", {
    status: params.restarting && !params.waitingForActivation ? "dispatching" : "pending",
    attemptCount: params.waitingForActivation ? 2 : params.restarting ? 1 : 0,
    ...(params.restarting ? { replayCount: 1, nextAttemptAt: params.endedAt + 30_000 } : {}),
    batchRunIds: ["run-rejected-requester-wake"],
    requesterYieldBatch: true,
    afterRequesterYield: true,
    rearmGeneration: 1,
  });
}

export function createOutstandingWakeRuns(runCount: number) {
  return Array.from({ length: runCount }, (_, index) => {
    const runId = `run-outstanding-wake-${index}`;
    return {
      ...createDeliveredWake(runId, {
        status: "pending",
        attemptCount: 2,
        batchRunIds: [runId],
        requesterYieldBatch: true,
        afterRequesterYield: true,
        rearmGeneration: 1,
      }),
      requesterSessionKey: `agent:main:requester-${index}`,
    };
  });
}

export function createRestoredWakeRuns(params: {
  endedAt: number;
  activationSettlement: boolean;
  requesterYielded?: boolean;
}): SubagentRunRecord[] {
  return Array.from({ length: 3 }, (_, index): SubagentRunRecord => {
    const runId = `run-restored-wake-${index}`;
    return createDeliveredWake(
      runId,
      params.requesterYielded ? undefined : { status: "pending", attemptCount: 0 },
      {
        childSessionKey: `agent:main:subagent:restored-wake-${index}`,
        requesterSessionKey: `agent:main:requester-${index}`,
        requesterDisplayKey: `requester-${index}`,
        task: "resume a durable requester wake",
        createdAt: params.endedAt - 1_000,
        endedReason: "subagent-complete",
        startedAt: params.endedAt - 500,
        endedAt: params.endedAt,
        ...(params.activationSettlement
          ? {
              requesterTurnRunId: `requester-turn-${index}`,
              ...(params.requesterYielded ? { requesterTurnYielded: true as const } : {}),
              taskRunId: runId,
            }
          : {}),
      },
    );
  });
}

export function createSteeredRestoreRuns(endedAt: number, requesterYielded: boolean) {
  const run = createDeliveredWake("run-steered", undefined, {
    taskRunId: "run-original",
    requesterTurnRunId: "run-requester",
    ...(requesterYielded ? { requesterTurnYielded: true } : {}),
    childSessionKey: "agent:main:subagent:steered",
    task: "deliver the steered result",
    createdAt: endedAt - 1_000,
    endedReason: "subagent-complete",
    startedAt: endedAt - 500,
    endedAt,
    cleanupCompletedAt: endedAt,
  });
  const nonannouncing: SubagentRunRecord[] = [];
  for (const collect of [false, true]) {
    nonannouncing.push({
      ...run,
      runId: `run-nonannouncing-${collect}`,
      taskRunId: `run-nonannouncing-${collect}`,
      childSessionKey: `agent:main:subagent:nonannouncing-${collect}`,
      expectsCompletionMessage: false,
      requesterTurnYielded: undefined,
      collect,
      completion: { required: false, resultText: "quiet result", capturedAt: endedAt },
      delivery: { status: "not_required" },
      ...(collect ? { collectorCompletion: { status: "done" } } : {}),
    });
  }
  return { nonannouncing, run };
}

export async function writeRunChildSessions(
  stateDir: string,
  runs: ReadonlyArray<{ runId: string; childSessionKey: string }>,
) {
  await Promise.all(
    runs.map((run) => writeChildSession(stateDir, run.childSessionKey, `session-${run.runId}`)),
  );
}

export function createSelectedAllRecipientAuthorityBinding() {
  return {
    version: 1 as const,
    selection: "selected" as const,
    recipients: [
      {
        sessionKey: "agent:main:main",
        authority: {
          state: "bound" as const,
          epoch: "11111111-1111-4111-8111-111111111111",
        },
      },
    ],
  };
}

// Settle like the real waker so a later restore replay sees no pending wake.
export function createSettlingRequesterWake() {
  return vi.fn<WakeRequester>(async (params) => {
    const wake = params.settledEntry!.requesterSettleWake!;
    params.completeBatch([params.settledEntry!], wake.rearmGeneration!, {
      delivered: true,
      path: "direct",
    });
    return true;
  });
}
