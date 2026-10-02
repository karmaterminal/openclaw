// Accepted-spawn rollback custody across an overlapping Stop: custody must be
// durable before the collector waits on the Stop's publication, survive a
// process restart from that durable image, and be reconciled exactly once.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "./subagent-registry.mocks.shared.js";
import "./subagent-registry.persistence.mocks.test-support.js";
import { closeOpenClawStateDatabaseForTest } from "../../../state/openclaw-state-db.js";
import { captureEnv, setTestEnvValue } from "../../../test-utils/env.js";
import { createCollectorLaunchCallbacks } from "../spawn/subagent-spawn-collector.js";
import { subagentRuns, waitForSubagentRetirementPublication } from "./subagent-registry-memory.js";
import { sharedRegistryMocks } from "./subagent-registry.mocks.shared.js";
import { loadSubagentRegistryFromSqlite } from "./subagent-registry.store.sqlite.js";
import { saveSubagentRegistryToSqlite } from "./subagent-registry.store.test-support.js";
import {
  activateSubagentRegistry,
  addSubagentRunForTests,
  claimSubagentRunKill,
  getSubagentRunByRunId,
  initSubagentRegistry,
  markSubagentRunTerminated,
  releaseSubagentRunKillClaim,
  resetSubagentRegistryForTests,
  settleFailedQueuedSubagentLaunch,
  testing,
} from "./subagent-registry.test-helpers.js";
import type { SubagentRegistrationScope, SubagentRunRecord } from "./subagent-registry.types.js";

const runId = "run-rollback-custody";
const childSessionKey = "agent:main:subagent:rollback-custody";
const gatewayRunId = "gateway-run-rollback-custody";

const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
let stateDir: string | undefined;
const abortCalls: string[] = [];
let abortSucceeds = true;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-rollback-custody-"));
  setTestEnvValue("OPENCLAW_STATE_DIR", stateDir);
  abortCalls.length = 0;
  abortSucceeds = true;
  sharedRegistryMocks.callGateway.mockImplementation((async (request: {
    method?: string;
    params?: { runId?: string };
  }) => {
    if (request.method !== "chat.abort") {
      return { status: "ok" };
    }
    abortCalls.push(String(request.params?.runId));
    if (!abortSucceeds) {
      throw new Error("gateway unavailable");
    }
    return { aborted: true, runIds: [request.params?.runId] };
  }) as unknown as typeof sharedRegistryMocks.callGateway);
});

afterEach(async () => {
  closeOpenClawStateDatabaseForTest();
  resetSubagentRegistryForTests({ persist: false });
  if (stateDir) {
    await fs.rm(stateDir, { recursive: true, force: true });
    stateDir = undefined;
  }
  envSnapshot.restore();
});

function seedQueuedCollector(): SubagentRunRecord {
  const entry: SubagentRunRecord = {
    runId,
    childSessionKey,
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "accepted child behind an overlapping Stop",
    cleanup: "keep",
    generation: 1,
    createdAt: 10,
    collect: true,
    swarmRunId: runId,
    schedulerSlotId: runId,
    execution: { status: "queued" },
    completion: { required: false, resultText: null },
    delivery: { status: "not_required" },
    // Restart can replay this descriptor, so a rolled-back launch must never reach it.
    queuedLaunch: {
      request: { sessionKey: childSessionKey, idempotencyKey: runId },
      timeoutMs: 1_000,
      schedulerGroupKey: JSON.stringify(["agent:main:main", ""]),
      maxConcurrent: 1,
    },
  };
  addSubagentRunForTests(entry);
  saveSubagentRegistryToSqlite(new Map([[runId, structuredClone(entry)]]));
  return subagentRuns.get(runId)!;
}

/** Real Stop retirement barrier, plus the collector callbacks that lose to it. */
async function startCollectorBehindStop(entry: SubagentRunRecord) {
  const retirement = subagentRuns.captureRetirement(
    entry,
    (candidate) => subagentRuns.get(candidate.runId) === candidate,
  );
  // The Stop claims the row first, so the accepted start transition must fail.
  const claim = await claimSubagentRunKill({ runId, expected: entry });
  expect(claim).toBeDefined();
  const settled = vi.fn(async (error: string) => {
    settleFailedQueuedSubagentLaunch(runId, error);
  });
  const scope: SubagentRegistrationScope = {
    canLaunch: () => true,
    canAcceptLaunch: () => true,
    canCleanupSession: () => true,
    canRetireReservation: () => true,
    settleFailedLaunch: settled,
    waitForClaim: () => undefined,
    waitForRetirementPublication: () => waitForSubagentRetirementPublication(entry),
  };
  const callbacks = createCollectorLaunchCallbacks({
    childRunId: runId,
    childSessionKey,
    requesterSessionKey: "agent:main:main",
    registrationScope: scope,
    provisionalSessionIdentity: {},
    launchChildRun: async () => ({ response: { runId: gatewayRunId, status: "accepted" } }),
    recordParticipant: () => {},
    emitSpawnLifecycleHooks: async () => {},
    cleanupFailedSpawn: async () => ({ attachmentsRemoved: true, sessionDeleted: true }),
  });
  const failure: unknown = await callbacks.start().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  const settling = callbacks.onStartFailure(failure);
  return { retirement, claim: claim!, settling, settled };
}

const durableRow = () => loadSubagentRegistryFromSqlite().get(runId);

/** Restarts from a durable image; returns the restored Gateway's agent dispatch. */
async function restartFrom(image: Map<string, SubagentRunRecord>) {
  closeOpenClawStateDatabaseForTest();
  resetSubagentRegistryForTests({ persist: false });
  saveSubagentRegistryToSqlite(image);
  await initSubagentRegistry();
  const dispatchAgent = vi.fn(async () => ({ runId: "relaunched", status: "accepted" }));
  const gatewayContext = {
    recoveryRuntime: { dispatchAgent },
    resolveGatewayContext: () => gatewayContext as never,
  };
  await activateSubagentRegistry(gatewayContext.resolveGatewayContext);
  return dispatchAgent;
}

it("keeps durable custody through a crash during the Stop publication wait", async () => {
  const entry = seedQueuedCollector();
  const { retirement, settling } = await startCollectorBehindStop(entry);

  // Custody is durable before the collector waits on the Stop's publication.
  expect(durableRow()).toMatchObject({
    acceptedSpawnRollback: { gatewayRunId },
    killIntent: { reason: "killed" },
  });
  // The publishing Stop still owns the row, so the in-process sweep must not
  // terminate or settle it out from under that Stop.
  await testing.sweepOnceForTests();
  expect(abortCalls).toEqual([]);
  expect(getSubagentRunByRunId(runId)?.execution.status).toBe("queued");
  const crashImage = loadSubagentRegistryFromSqlite();

  retirement.release();
  await expect(settling).resolves.toBe(true);
  expect(abortCalls).toEqual([gatewayRunId]);
  expect(durableRow()?.acceptedSpawnRollback).toBeUndefined();

  // The process died at the captured point instead; restart from that image.
  abortCalls.length = 0;
  const dispatchAgent = await restartFrom(crashImage);
  expect(getSubagentRunByRunId(runId)?.acceptedSpawnRollback).toMatchObject({ gatewayRunId });
  await testing.sweepOnceForTests();
  expect(abortCalls).toEqual([gatewayRunId]);
  expect(durableRow()?.acceptedSpawnRollback).toBeUndefined();
  // The next sweep has no custody left, so the accepted child is not terminated again.
  await testing.sweepOnceForTests();
  expect(abortCalls).toEqual([gatewayRunId]);
  expect(dispatchAgent).not.toHaveBeenCalled();
});

it("reconciles once after a restart that follows the Stop's committed kill", async () => {
  const entry = seedQueuedCollector();
  const { retirement, settling } = await startCollectorBehindStop(entry);
  // The Stop commits its kill while the collector still waits on publication.
  await expect(markSubagentRunTerminated({ runId, reason: "killed" })).resolves.toBe(1);
  expect(durableRow()).toMatchObject({
    acceptedSpawnRollback: { gatewayRunId },
    endedReason: "subagent-killed",
    collectorCompletion: { status: "killed" },
  });
  const crashImage = loadSubagentRegistryFromSqlite();

  retirement.release();
  await expect(settling).resolves.toBe(true);
  expect(getSubagentRunByRunId(runId)?.collectorCompletion?.status).toBe("killed");

  abortCalls.length = 0;
  const dispatchAgent = await restartFrom(crashImage);
  await testing.sweepOnceForTests();
  await testing.sweepOnceForTests();
  expect(abortCalls).toEqual([gatewayRunId]);
  expect(dispatchAgent).not.toHaveBeenCalled();
  expect(durableRow()).toMatchObject({ collectorCompletion: { status: "killed" } });
  expect(durableRow()?.acceptedSpawnRollback).toBeUndefined();
});

it.each([true, false])(
  "keeps rollback custody as the cleanup owner when the Stop rolls back (terminated=%s)",
  async (terminated) => {
    const entry = seedQueuedCollector();
    const { retirement, claim, settling, settled } = await startCollectorBehindStop(entry);
    abortSucceeds = terminated;
    // The Stop withdraws its kill; the custody recorded before it stays.
    await expect(releaseSubagentRunKillClaim({ runId, expected: entry, claim })).resolves.toBe(
      true,
    );
    expect(durableRow()).toMatchObject({ acceptedSpawnRollback: { gatewayRunId } });
    expect(durableRow()?.killIntent).toBeUndefined();
    const crashImage = loadSubagentRegistryFromSqlite();

    retirement.release();
    await expect(settling).resolves.toBe(true);
    expect(settled).toHaveBeenCalledOnce();
    expect(abortCalls).toEqual([gatewayRunId]);
    if (terminated) {
      expect(durableRow()?.acceptedSpawnRollback).toBeUndefined();
    } else {
      // Unconfirmed termination leaves custody with the sweeper.
      expect(durableRow()).toMatchObject({ acceptedSpawnRollback: { gatewayRunId } });
      abortSucceeds = true;
      await testing.sweepOnceForTests();
      expect(abortCalls).toEqual([gatewayRunId, gatewayRunId]);
      expect(durableRow()?.acceptedSpawnRollback).toBeUndefined();
    }

    // A crash after the Stop withdrew leaves a queued row whose only owner is the
    // custody: restart must terminate the accepted child, never relaunch it.
    abortCalls.length = 0;
    const dispatchAgent = await restartFrom(crashImage);
    await testing.sweepOnceForTests();
    await testing.sweepOnceForTests();
    expect(dispatchAgent).not.toHaveBeenCalled();
    expect(abortCalls).toEqual([gatewayRunId]);
    expect(durableRow()).toMatchObject({ collectorCompletion: { status: "failed" } });
    expect(durableRow()?.acceptedSpawnRollback).toBeUndefined();
  },
);
