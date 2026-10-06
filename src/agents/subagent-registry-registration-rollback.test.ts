import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./subagents/registry/subagent-registry.mocks.shared.js";
import "./subagents/registry/subagent-registry.persistence.mocks.test-support.js";
import type { SqliteWorkerCommand } from "../infra/sqlite-worker-contract.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import type { OpenClawStateWorkerOperations } from "../state/openclaw-state-worker-contract.js";
import * as stateWorker from "../state/openclaw-state-worker-store.js";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import { runSpawnPipeline } from "./spawn-pipeline.js";
import type {
  RegisterSubagentRunParams,
  SubagentRegistrationIdentity,
} from "./subagents/registry/subagent-registry-run-launch.js";
import {
  loadSubagentRegistryFromSqlite,
  saveSubagentRegistryToSqlite,
} from "./subagents/registry/subagent-registry-state.fixture.test-support.js";
import {
  markSubagentRunTerminated,
  recordAcceptedSubagentSpawnRollback,
  rollbackSubagentRunRegistration,
} from "./subagents/registry/subagent-registry.js";
import { canonicalSubagentRunFixtures } from "./subagents/registry/subagent-registry.persistence.test-support.js";
import {
  addSubagentRunForTests,
  getSubagentRunByChildSessionKey,
  listSubagentRunsForRequester,
  registerSubagentRun,
  resetSubagentRegistryForTests,
  testing,
} from "./subagents/registry/subagent-registry.test-helpers.js";
import type { SubagentRunRecord } from "./subagents/registry/subagent-registry.types.js";

type RegistryWrite = Extract<
  SqliteWorkerCommand<OpenClawStateWorkerOperations>,
  { type: "subagents.persistChanges" }
>;

// Upstream (14fe10d01c) deleted the synchronous persistSubagentRunsToDisk* writers:
// every registry write is now one `subagents.persistChanges` command through the
// async FIFO writer. The old or-throw override is re-homed onto that command. The
// old persistDiskOverride (redirecting the best-effort writer to sqlite) has no
// new-world equivalent: every write already lands in the real sqlite store.
let persistOrThrowOverride: ((write: RegistryWrite["input"]) => void) | undefined;

function interceptRegistryWrites() {
  const runWorkerOperation = stateWorker.runOpenClawStateWorkerOperation;
  return vi
    .spyOn(stateWorker, "runOpenClawStateWorkerOperation")
    .mockImplementation((workerContext, operation, workerOptions) =>
      runWorkerOperation(
        workerContext,
        (scope) =>
          operation({
            ...scope,
            execute: async (
              command: SqliteWorkerCommand<OpenClawStateWorkerOperations>,
              ...rest: unknown[]
            ) => {
              if (persistOrThrowOverride && command.type === "subagents.persistChanges") {
                persistOrThrowOverride(command.input);
              }
              // SAFETY: forwards the original execute arguments unchanged.
              return (scope.execute as (...args: unknown[]) => unknown)(command, ...rest);
            },
          } as typeof scope),
        workerOptions,
      ),
    );
}

describe("subagent registration rollback", () => {
  const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
  let tempStateDir: string | undefined;

  beforeEach(async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-rollback-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);
    interceptRegistryWrites();
  });

  afterEach(async () => {
    persistOrThrowOverride = undefined;
    vi.restoreAllMocks();
    await resetSubagentRegistryForTests({ persist: false });
    closeOpenClawStateDatabaseForTest();
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true });
      tempStateDir = undefined;
    }
    envSnapshot.restore();
  });

  const createOlderKilledRun = (childSessionKey: string): SubagentRunRecord => ({
    runId: "run-task-registration-older",
    childSessionKey,
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "older killed generation",
    cleanup: "keep",
    generation: 1,
    createdAt: 1,
    execution: {
      status: "terminal",
      startedAt: 1,
      endedAt: 2,
      outcome: { status: "error", error: "killed" },
    },
    completion: { required: false, resultText: null, capturedAt: 2 },
    delivery: { status: "not_required" },
    endedReason: "subagent-killed",
    suppressAnnounceReason: "killed",
    killReconciliation: { killedAt: 2 },
    cleanupHandled: true,
    cleanupCompletedAt: 2,
  });

  const createPriorSameIdRun = (runId: string, childSessionKey: string): SubagentRunRecord => ({
    runId,
    taskRunId: runId,
    childSessionKey,
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "prior same-id run",
    cleanup: "keep",
    generation: 2,
    createdAt: 3,
    execution: {
      status: "terminal",
      startedAt: 3,
      endedAt: 4,
      outcome: { status: "ok" },
    },
    completion: { required: false, resultText: "prior result", capturedAt: 4 },
    delivery: { status: "not_required" },
    endedReason: "subagent-complete",
    cleanupHandled: true,
    cleanupCompletedAt: 4,
  });

  function createRegistration(runId: string, childSessionKey: string) {
    return {
      runId,
      childSessionKey,
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "registration ownership integration",
      cleanup: "keep" as const,
    };
  }

  function createPipelineAdapter(cleanupOnFailure: (params: { error: unknown }) => Promise<void>) {
    return {
      initialize: async () => ({}),
      dispatchTurn: async () => ({ runId: "run-pipeline-registration" }),
      cleanupOnFailure,
    };
  }

  function recordAcceptedRollback(
    registration: RegisterSubagentRunParams & {
      expectedRegistration: SubagentRegistrationIdentity;
    },
    error: unknown,
  ) {
    return recordAcceptedSubagentSpawnRollback({
      runId: registration.runId,
      childSessionKey: registration.childSessionKey,
      gatewayRunId: registration.runId,
      reason: error instanceof Error ? error.message : String(error),
      expectedRegistration: registration.expectedRegistration,
    });
  }

  function rollbackRegistration(
    registration: RegisterSubagentRunParams & {
      expectedRegistration: SubagentRegistrationIdentity;
    },
  ) {
    return rollbackSubagentRunRegistration({
      runId: registration.runId,
      childSessionKey: registration.childSessionKey,
      expectedRegistration: registration.expectedRegistration,
    });
  }

  const createAcceptedLiveRun = (runId: string, childSessionKey: string): SubagentRunRecord => ({
    runId,
    taskRunId: runId,
    childSessionKey,
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "accepted live child",
    cleanup: "keep",
    generation: 1,
    createdAt: 10,
    execution: { status: "running", startedAt: 10 },
    completion: { required: false, resultText: null },
    delivery: { status: "not_required" },
  });

  // Durable custody is recorded ownership-BLIND. If the recorder refused to write
  // the marker whenever live cleanup authority had been revoked, an accepted child
  // would be orphaned with nothing for the sweeper to reconcile. The durable row is fenced by expectedRegistration plus frozen session
  // identity and run id; the live predicate belongs only on termination.
  it("persists exact-registration rollback custody even after cleanup ownership flips", async () => {
    const childSessionKey = "agent:main:subagent:rollback-custody-survives-revocation";
    const runId = "run-rollback-custody-survives-revocation";
    await addSubagentRunForTests(createAcceptedLiveRun(runId, childSessionKey));
    saveSubagentRegistryToSqlite(
      canonicalSubagentRunFixtures(
        new Map([[runId, createAcceptedLiveRun(runId, childSessionKey)]]),
      ),
    );

    // Ownership is already gone by the time the rollback is recorded.
    const result = await recordAcceptedSubagentSpawnRollback({
      runId,
      childSessionKey,
      gatewayRunId: runId,
      reason: "registration changed during launch after operator revocation",
      expectedRegistration: { runId, childSessionKey, generation: 1, createdAt: 10 },
    });

    expect(result).toEqual({ status: "persisted" });
    expect(await getSubagentRunByChildSessionKey(childSessionKey)).toMatchObject({
      acceptedSpawnRollback: { gatewayRunId: runId },
      suppressCompletionDelivery: true,
      execution: { suppressSessionEffects: true },
    });
    // Durable, so a restart-time sweeper can still reconcile the accepted child.
    expect(loadSubagentRegistryFromSqlite().get(runId)).toMatchObject({
      acceptedSpawnRollback: { gatewayRunId: runId },
      suppressCompletionDelivery: true,
      execution: { suppressSessionEffects: true },
    });
  });

  it("preserves kill-owned terminal execution while recording accepted rollback custody", async () => {
    const childSessionKey = "agent:main:subagent:rollback-after-kill";
    const runId = "run-rollback-after-kill";
    const liveRun = createAcceptedLiveRun(runId, childSessionKey);
    await addSubagentRunForTests(liveRun);
    saveSubagentRegistryToSqlite(
      canonicalSubagentRunFixtures(new Map([[runId, structuredClone(liveRun)]])),
    );

    await expect(markSubagentRunTerminated({ runId, reason: "manual kill" })).resolves.toBe(1);
    const killed = await getSubagentRunByChildSessionKey(childSessionKey);
    expect(killed).not.toBeNull();
    const killedExecution = structuredClone(killed!.execution);
    const killedReconciliation = structuredClone(killed!.killReconciliation);

    const result = await recordAcceptedSubagentSpawnRollback({
      runId,
      childSessionKey,
      gatewayRunId: runId,
      reason: "accepted launch completed after manual kill",
      expectedRegistration: { runId, childSessionKey, generation: 1, createdAt: 10 },
    });

    expect(result).toEqual({ status: "persisted" });
    expect(await getSubagentRunByChildSessionKey(childSessionKey)).toMatchObject({
      acceptedSpawnRollback: { gatewayRunId: runId },
      suppressCompletionDelivery: true,
      killReconciliation: killedReconciliation,
    });
    expect((await getSubagentRunByChildSessionKey(childSessionKey))?.execution).toEqual(
      killedExecution,
    );
    const persisted = loadSubagentRegistryFromSqlite().get(runId);
    expect(persisted).toMatchObject({
      acceptedSpawnRollback: { gatewayRunId: runId },
      suppressCompletionDelivery: true,
      killReconciliation: killedReconciliation,
    });
    expect(persisted?.execution).toEqual(killedExecution);
  });

  it("rejects rollback custody when the registration identity no longer matches", async () => {
    const childSessionKey = "agent:main:subagent:rollback-custody-stale-identity";
    const runId = "run-rollback-custody-stale-identity";
    await addSubagentRunForTests(createAcceptedLiveRun(runId, childSessionKey));

    // expectedRegistration is the CAS axis that still guards the recorder.
    const result = await recordAcceptedSubagentSpawnRollback({
      runId,
      childSessionKey,
      gatewayRunId: runId,
      reason: "successor generation owns this child now",
      expectedRegistration: { runId, childSessionKey, generation: 99, createdAt: 10 },
    });

    expect(result).toEqual({ status: "rejected" });
    expect(
      (await getSubagentRunByChildSessionKey(childSessionKey))?.acceptedSpawnRollback,
    ).toBeUndefined();
  });

  // Upstream removed the Tasks runtime (6652f7eac8), so the post-persist task-row
  // failure that used to drive this case no longer exists. The same rollback now
  // runs when the registration's own persistence fails, and must still restore
  // both the same-id row and the older generation's kill reconciliation.
  it("restores same-id and older kill state after registration persistence throws", async () => {
    const childSessionKey = "agent:main:subagent:task-registration-fails";
    const runId = "run-task-registration-fails";
    const priorSameIdRun = createPriorSameIdRun(runId, childSessionKey);
    const olderRun = createOlderKilledRun(childSessionKey);
    await addSubagentRunForTests(priorSameIdRun);
    await addSubagentRunForTests(olderRun);
    saveSubagentRegistryToSqlite(
      canonicalSubagentRunFixtures(
        new Map([
          [priorSameIdRun.runId, priorSameIdRun],
          [olderRun.runId, olderRun],
        ]),
      ),
    );
    const expectedKillReconciliation = structuredClone(olderRun.killReconciliation);
    const persistenceScopes: string[][] = [];
    const persistError = new Error("registration sqlite busy");
    persistOrThrowOverride = (write) => {
      // The FIFO writer admits every selected run id as a version fence (sorted).
      persistenceScopes.push(write.versions.map(({ runId: id }) => id).toSorted());
      throw persistError;
    };

    // HIGH (absorb 14fe10d0): contract changed by upstream; needs frond decision:
    // the failure now surfaces from the async FIFO writer (SubagentRegistryWriteError /
    // SubagentRegistrationError wrapping). The `cause: persistError` matcher is kept as-is.
    await expect(
      registerSubagentRun({
        runId,
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "task registration failure",
        cleanup: "keep",
      }),
    ).rejects.toThrow(expect.objectContaining({ cause: persistError }));
    expect(
      listSubagentRunsForRequester("agent:main:main").find((entry) => entry.runId === runId),
    ).toMatchObject({
      task: priorSameIdRun.task,
      generation: priorSameIdRun.generation,
    });
    expect(
      listSubagentRunsForRequester("agent:main:main").find(
        (entry) => entry.runId === olderRun.runId,
      )?.killReconciliation,
    ).toEqual(expectedKillReconciliation);
    const persisted = loadSubagentRegistryFromSqlite();
    expect(persisted.get(runId)).toMatchObject({
      task: priorSameIdRun.task,
      generation: priorSameIdRun.generation,
    });
    expect(persisted.get(olderRun.runId)?.killReconciliation).toEqual(expectedKillReconciliation);
    // HIGH (absorb 14fe10d0): contract changed by upstream; needs frond decision:
    // this asserts that registration admits the older generation's run id in the
    // same (single) write as the new row; upstream's one-transaction registration
    // must still select it for the kill-reconciliation restore to hold.
    expect(persistenceScopes).toEqual([[runId, olderRun.runId]]);
  });

  it("restores a same-id run when initial registration persistence fails", async () => {
    const runId = "run-initial-persist-same-id";
    const childSessionKey = "agent:main:subagent:initial-persist-same-id";
    const priorSameIdRun = createPriorSameIdRun(runId, childSessionKey);
    await addSubagentRunForTests(priorSameIdRun);
    saveSubagentRegistryToSqlite(
      canonicalSubagentRunFixtures(new Map([[priorSameIdRun.runId, priorSameIdRun]])),
    );
    const persistError = new Error("initial sqlite busy");
    // persistDiskOverride (best-effort writer -> sqlite) is gone: all writes use sqlite.
    persistOrThrowOverride = () => {
      throw persistError;
    };

    await expect(
      registerSubagentRun({
        runId,
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "replacement that must roll back",
        cleanup: "keep",
      }),
    ).rejects.toThrow(expect.objectContaining({ cause: persistError }));
    expect(
      listSubagentRunsForRequester("agent:main:main").find((entry) => entry.runId === runId),
    ).toMatchObject({
      task: priorSameIdRun.task,
      generation: priorSameIdRun.generation,
    });
    expect(loadSubagentRegistryFromSqlite().get(runId)).toMatchObject({
      task: priorSameIdRun.task,
      generation: priorSameIdRun.generation,
    });
  });

  // Upstream's Tasks removal (6652f7eac8) deleted the post-persist task-row step
  // that used to leave a surviving row. A committed registration still fails
  // after persistence when its publication throws; the pipeline must then keep
  // exact rollback authority on the durable row while termination is incomplete.
  it("retains exact rollback authority when registration survives and termination is incomplete", async () => {
    const publishError = new Error("registration publication failed");
    const terminationError = new Error("gateway termination unavailable");
    const cleanupOnFailure = vi.fn(async () => {
      throw terminationError;
    });
    const childSessionKey = "agent:main:subagent:pipeline-registration";
    const registration = createRegistration("run-pipeline-registration", childSessionKey);

    let thrown: unknown;
    try {
      await runSpawnPipeline({
        adapter: createPipelineAdapter(cleanupOnFailure),
        progressSessionKey: "agent:main:main",
        buildRegistration: () => registration,
        publishRegistration: () => {
          throw publishError;
        },
        recordAcceptedRollback,
        rollbackRegistration,
      });
    } catch (error) {
      thrown = error;
    }

    expect(cleanupOnFailure).toHaveBeenCalledOnce();
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors[0]).toBe(publishError);
    expect((thrown as AggregateError).cause).toBe(publishError);
    const retained = await getSubagentRunByChildSessionKey(childSessionKey);
    expect(retained).toMatchObject({
      runId: registration.runId,
      acceptedSpawnRollback: {
        gatewayRunId: registration.runId,
        reason: expect.stringContaining("registration publication failed"),
      },
      suppressCompletionDelivery: true,
      execution: { suppressSessionEffects: true },
    });
    expect(retained?.execution.restartRecovery).toBeUndefined();
    expect(loadSubagentRegistryFromSqlite().get(registration.runId)).toMatchObject({
      acceptedSpawnRollback: { gatewayRunId: registration.runId },
      suppressCompletionDelivery: true,
      execution: { suppressSessionEffects: true },
    });
    await testing.sweepOnceForTests();
    expect(await getSubagentRunByChildSessionKey(childSessionKey)).toMatchObject({
      runId: registration.runId,
      acceptedSpawnRollback: { gatewayRunId: registration.runId },
      suppressCompletionDelivery: true,
      execution: { suppressSessionEffects: true },
    });
  });

  it("preserves a restored same-id predecessor after failed replacement registration", async () => {
    const runId = "run-pipeline-registration";
    const childSessionKey = "agent:main:subagent:pipeline-predecessor";
    const predecessor = createPriorSameIdRun(runId, childSessionKey);
    await addSubagentRunForTests(predecessor);
    saveSubagentRegistryToSqlite(canonicalSubagentRunFixtures(new Map([[runId, predecessor]])));
    // The Tasks runtime is gone upstream (6652f7eac8); fail the replacement at
    // its own persistence instead of at the removed task-row step.
    const persistError = new Error("replacement sqlite busy");
    persistOrThrowOverride = () => {
      throw persistError;
    };
    const cleanupOnFailure = vi.fn(async () => {});

    const result = await runSpawnPipeline({
      adapter: createPipelineAdapter(cleanupOnFailure),
      progressSessionKey: "agent:main:main",
      buildRegistration: () => createRegistration(runId, childSessionKey),
      recordAcceptedRollback,
      rollbackRegistration,
    });

    expect(result).toMatchObject({ ok: false, phase: "register" });
    if (result.ok) {
      throw new Error("expected replacement registration failure");
    }
    expect(
      (
        result.error as Error & {
          registrationOwnership: { status: string; predecessor: { createdAt: number } };
        }
      ).registrationOwnership,
    ).toEqual(
      expect.objectContaining({
        status: "predecessor-restored",
        predecessor: expect.objectContaining({ createdAt: predecessor.createdAt }),
      }),
    );
    expect(cleanupOnFailure).toHaveBeenCalledOnce();
    const restored = await getSubagentRunByChildSessionKey(childSessionKey);
    expect(restored).toMatchObject({
      runId,
      task: predecessor.task,
      generation: predecessor.generation,
    });
    expect(restored?.acceptedSpawnRollback).toBeUndefined();
    expect(restored?.execution).toEqual(predecessor.execution);
  });

  it("attempts external cleanup without a rollback marker when no durable row survives", async () => {
    const persistError = new Error("initial sqlite busy");
    persistOrThrowOverride = () => {
      throw persistError;
    };
    const cleanupOnFailure = vi.fn(async () => {});
    const childSessionKey = "agent:main:subagent:pipeline-no-row";

    const result = await runSpawnPipeline({
      adapter: createPipelineAdapter(cleanupOnFailure),
      progressSessionKey: "agent:main:main",
      buildRegistration: () => createRegistration("run-pipeline-registration", childSessionKey),
      recordAcceptedRollback,
      rollbackRegistration,
    });

    expect(result).toMatchObject({ ok: false, phase: "register" });
    if (result.ok) {
      throw new Error("expected registration persistence failure");
    }
    expect(
      (result.error as Error & { registrationOwnership: { status: string } }).registrationOwnership
        .status,
    ).toBe("no-new-row");
    expect(cleanupOnFailure).toHaveBeenCalledOnce();
    expect(await getSubagentRunByChildSessionKey(childSessionKey)).toBeNull();
    expect(loadSubagentRegistryFromSqlite().has("run-pipeline-registration")).toBe(false);
  });

  it("fails closed when registration ownership is unknown at the pipeline boundary", async () => {
    const runId = "run-pipeline-registration";
    const terminationAttempts: string[] = [];
    const recordRollback = vi.fn(recordAcceptedRollback);
    const cleanupOnFailure = vi.fn(async ({ error }: { error: unknown }) => {
      terminationAttempts.push(runId);
      expect(error).toMatchObject({
        registrationOwnership: {
          status: "unknown",
          attempted: { runId, childSessionKey: "" },
        },
      });
    });

    const result = await runSpawnPipeline({
      adapter: createPipelineAdapter(cleanupOnFailure),
      progressSessionKey: "agent:main:main",
      buildRegistration: () => createRegistration(runId, ""),
      recordAcceptedRollback: recordRollback,
      rollbackRegistration,
    });

    expect(result).toMatchObject({
      ok: false,
      phase: "register",
      error: {
        registrationOwnership: {
          status: "unknown",
          attempted: { runId, childSessionKey: "" },
        },
      },
    });
    expect(recordRollback).not.toHaveBeenCalled();
    expect(terminationAttempts).toEqual([runId]);
    expect(loadSubagentRegistryFromSqlite().has(runId)).toBe(false);
    await resetSubagentRegistryForTests({ persist: false });
    await testing.sweepOnceForTests();
    expect(await getSubagentRunByChildSessionKey("agent:main:subagent:any")).toBeNull();
  });

  it("keeps normal registration and rollback exactly once", async () => {
    const cleanupOnFailure = vi.fn(async () => {});
    const childSessionKey = "agent:main:subagent:pipeline-success";
    const result = await runSpawnPipeline({
      adapter: createPipelineAdapter(cleanupOnFailure),
      progressSessionKey: "agent:main:main",
      buildRegistration: () => createRegistration("run-pipeline-registration", childSessionKey),
      recordAcceptedRollback,
      rollbackRegistration,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const registered = await getSubagentRunByChildSessionKey(childSessionKey);
    expect(registered?.runId).toBe(result.runId);
    if (!registered || registered.generation === undefined) {
      throw new Error("expected exact registered row identity");
    }
    await expect(
      rollbackSubagentRunRegistration({
        runId: registered.runId,
        childSessionKey,
        expectedRegistration: {
          runId: "different-run",
          childSessionKey,
          generation: registered.generation,
          createdAt: registered.createdAt,
        },
      }),
    ).resolves.toBe(false);
    await result.rollbackAccepted();
    expect(await getSubagentRunByChildSessionKey(childSessionKey)).toBeNull();
    expect(cleanupOnFailure).toHaveBeenCalledOnce();
  });
});
