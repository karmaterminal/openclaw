// H1 §3.4 (absorb 14fe10d0): a collector launch writes a durable `launchDispatch`
// marker before dispatch, and its start transition clears it. A dispatched launch is
// never relaunched after restart; a never-dispatched one keeps upstream's replay.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
// Shared mocks must load before the registry modules below.
// oxfmt-ignore
import { sharedRegistryMocks } from "./subagent-registry.mocks.shared.js";
import "./subagent-registry.persistence.mocks.test-support.js";
import { closeOpenClawStateDatabaseForTest } from "../../../state/openclaw-state-db.js";
import { captureEnv, setTestEnvValue } from "../../../test-utils/env.js";
import { createCollectorLaunchCallbacks } from "../spawn/subagent-spawn-collector.js";
import { closeSwarmScheduler } from "../swarm/swarm-scheduler.js";
import { subagentRuns, waitForSubagentRetirementPublication } from "./subagent-registry-memory.js";
import { restoreSubagentRunsFromDisk } from "./subagent-registry-persistence.js";
import {
  loadSubagentRegistryFromSqlite,
  saveSubagentRegistryToSqlite,
} from "./subagent-registry-state.fixture.test-support.js";
import {
  activateSubagentRegistry,
  addSubagentRunForTests,
  initSubagentRegistry,
  resetSubagentRegistryForTests,
  settleFailedQueuedSubagentLaunch,
  testing,
} from "./subagent-registry.test-helpers.js";
import type { SubagentRegistrationScope, SubagentRunRecord } from "./subagent-registry.types.js";
import {
  faultWrites,
  interceptRegistryWrites,
  liftFaults,
  type WriteRule,
} from "./subagent-registry.write-faults.test-support.js";

const runId = "run-launch-dispatch";
const childSessionKey = "agent:main:subagent:launch-dispatch";
const gatewayRunId = "gateway-run-launch-dispatch";

const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
let stateDir: string | undefined;
const abortCalls: string[] = [];
const successfulAborts: string[] = [];
let abortSucceeds = true;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-launch-dispatch-"));
  setTestEnvValue("OPENCLAW_STATE_DIR", stateDir);
  abortCalls.length = 0;
  successfulAborts.length = 0;
  abortSucceeds = true;
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
  // A relaunched collector from a restart keeps scheduler work; settle it per test.
  await closeSwarmScheduler();
  closeOpenClawStateDatabaseForTest();
  await resetSubagentRegistryForTests({ persist: false });
  vi.restoreAllMocks();
  if (stateDir) {
    await fs.rm(stateDir, { recursive: true, force: true });
    stateDir = undefined;
  }
  envSnapshot.restore();
});

async function seedQueuedCollector(): Promise<SubagentRunRecord> {
  await addSubagentRunForTests({
    runId,
    childSessionKey,
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "collector launch dispatch",
    cleanup: "keep",
    generation: 1,
    createdAt: 10,
    collect: true,
    swarmRunId: runId,
    schedulerSlotId: runId,
    execution: { status: "queued" },
    completion: { required: false, resultText: null },
    delivery: { status: "not_required" },
    queuedLaunch: {
      request: { sessionKey: childSessionKey, idempotencyKey: runId },
      timeoutMs: 1_000,
      schedulerGroupKey: JSON.stringify(["agent:main:main", ""]),
      maxConcurrent: 1,
    },
  });
  return subagentRuns.get(runId)!;
}

function collectorCallbacks(entry: SubagentRunRecord) {
  const scope: SubagentRegistrationScope = {
    canLaunch: () => true,
    canAcceptLaunch: () => true,
    canAbortAcceptedRun: () => true,
    canCleanupSession: () => true,
    canRetireReservation: () => true,
    settleFailedLaunch: async (error: string) => {
      await settleFailedQueuedSubagentLaunch(runId, error);
    },
    waitForClaim: () => undefined,
    waitForRetirementPublication: () => waitForSubagentRetirementPublication(entry),
  };
  return createCollectorLaunchCallbacks({
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
}

const startWrite: WriteRule["match"] = (rows) =>
  rows.some(
    (row) =>
      row.swarmRunId === runId && row.runId === gatewayRunId && row.execution.status === "running",
  );
const custodyWrite: WriteRule["match"] = (rows) =>
  rows.some((row) => row.acceptedSpawnRollback !== undefined);
const durable = () => loadSubagentRegistryFromSqlite();

async function restartFrom(image: Map<string, SubagentRunRecord>) {
  closeOpenClawStateDatabaseForTest();
  await resetSubagentRegistryForTests({ persist: false });
  saveSubagentRegistryToSqlite(image);
  // A new process holds no in-memory write fences: resolve them the way upstream
  // does, by one canonical (non-merge) restore from the durable rows.
  await restoreSubagentRunsFromDisk({ runs: new Map() });
  await initSubagentRegistry();
  const dispatchAgent = vi.fn(async () => ({ runId: "relaunched", status: "accepted" }));
  const gatewayContext = {
    recoveryRuntime: { dispatchAgent },
    resolveGatewayContext: () => gatewayContext as never,
  };
  await activateSubagentRegistry(gatewayContext.resolveGatewayContext);
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  return dispatchAgent;
}

it("T11: a dispatched launch whose start, custody and abort all fail is never relaunched", async () => {
  const entry = await seedQueuedCollector();
  faultWrites("refuse", startWrite);
  faultWrites("refuse", custodyWrite);
  abortSucceeds = false;
  const callbacks = collectorCallbacks(entry);
  const failure: unknown = await callbacks.start().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  // The process dies before the launch owner settles: the row is still queued.
  const crashImage = durable();
  expect(crashImage.get(runId)?.execution.status).toBe("queued");
  expect(crashImage.get(runId)?.queuedLaunch).toBeDefined();

  liftFaults();
  abortSucceeds = true;
  abortCalls.length = 0;
  const dispatchAgent = await restartFrom(crashImage);
  expect(dispatchAgent).not.toHaveBeenCalled();
  await testing.sweepOnceForTests();
  await testing.sweepOnceForTests();
  expect(dispatchAgent).not.toHaveBeenCalled();
  // The idempotency key is the Gateway run id of the dispatched launch.
  expect(successfulAborts).toEqual([runId]);
  expect(durable().get(runId)).toMatchObject({ collectorCompletion: { status: "failed" } });
  expect(durable().get(runId)?.launchDispatch).toBeUndefined();
});

it("T12 (guard): a never-dispatched queued collector keeps upstream's restart replay", async () => {
  await seedQueuedCollector();
  // Crash before launchChildRun: no dispatch marker was ever written.
  expect(durable().get(runId)?.launchDispatch).toBeUndefined();
  const dispatchAgent = await restartFrom(durable());
  await testing.sweepOnceForTests();
  expect(dispatchAgent).toHaveBeenCalled();
  expect(abortCalls).toEqual([]);
});

it.each(["landed", "not-landed"] as const)(
  "T14: an unknown-outcome collector start converges forward; restart decides (%s)",
  async (twin) => {
    const entry = await seedQueuedCollector();
    // The start write's receipt is lost. "not-landed" restarts from the durable
    // image taken just before that write committed.
    let preWrite: Map<string, SubagentRunRecord> | undefined;
    faultWrites(
      "lose-receipt",
      (rows, write) => {
        if (!startWrite(rows, write)) {
          return false;
        }
        preWrite = durable();
        return true;
      },
      1,
    );
    const custody = faultWrites("refuse", custodyWrite, 0);
    const callbacks = collectorCallbacks(entry);
    // In-process: no rollback owner, no termination, no failed settlement.
    await expect(callbacks.start()).resolves.toBeUndefined();
    await testing.sweepOnceForTests();
    expect(custody.hits).toBe(0);
    expect(abortCalls).toEqual([]);

    const image = twin === "landed" ? durable() : preWrite!;
    if (twin === "landed") {
      expect(image.get(gatewayRunId)?.execution.status).toBe("running");
      expect(image.get(gatewayRunId)?.launchDispatch).toBeUndefined();
    } else {
      expect(image.get(runId)?.launchDispatch).toMatchObject({ idempotencyKey: runId });
    }
    const dispatchAgent = await restartFrom(image);
    await testing.sweepOnceForTests();
    await testing.sweepOnceForTests();
    expect(dispatchAgent).not.toHaveBeenCalled();
    if (twin === "landed") {
      // The start landed: an accepted running collector, never aborted.
      expect(abortCalls).toEqual([]);
      // Restored as an ordinary accepted (running) collector: the generic resume path
      // owns it (here: its child session is absent, so it settles as orphaned), not
      // the failed-launch settlement and not a relaunch.
      const resumed = durable().get(gatewayRunId);
      expect(resumed?.launchDispatch).toBeUndefined();
      expect(resumed?.execution.outcome).toMatchObject({
        status: "error",
        error: expect.stringContaining("orphaned"),
      });
      expect(resumed?.collectorLaunchCleanupPending).toBeUndefined();
    } else {
      // Not landed: the dispatched marker fails closed instead of relaunching.
      expect(successfulAborts).toEqual([runId]);
      expect(durable().get(runId)).toMatchObject({ collectorCompletion: { status: "failed" } });
    }
  },
);
