import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
// Subagent registry persistence-resume tests cover restoring SQLite-backed child runs.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import { isPathInside } from "../../../infra/path-guards.js";
import {
  bindGatewayContextResolver,
  getGatewayContextResolver,
} from "../../../plugins/runtime/gateway-request-scope.js";
import { listOpenClawAgentDatabasesForTest as listSeedAgentDatabases } from "../../../state/openclaw-agent-db.js";
import { closeOpenClawStateDatabaseForTest as closeSeedStateDatabase } from "../../../state/openclaw-state-db.js";
import "./subagent-registry.mocks.shared.js";
import { createSubagentRunRecord } from "../../subagent-test-fixtures.test-helpers.js";
import {
  getGatewayToolCallerIdentity,
  withGatewayToolCallerIdentity,
} from "../../tools/gateway-caller-context.js";
import type { SubagentRegistryDeps } from "./subagent-registry-deps.js";
import {
  removeSubagentSessionEntry,
  createSubagentRegistryTestDeps,
  gateSubagentRequesterSettlement,
  settleSubagentRegistryPersistenceWork,
  withSubagentRegistryPersistenceState,
  createDeliveredWake,
  createOrphanedRequiredDelivery,
  writeChildSession,
  writeSubagentSessionEntry,
} from "./subagent-registry.persistence.test-support.js";
import {
  loadSubagentRegistryFromSqlite,
  saveSubagentRegistryToSqlite,
} from "./subagent-registry.store.sqlite.js";

type SubagentAnnounceParams = Parameters<
  typeof import("../announce/subagent-announce.js").runSubagentAnnounceFlow
>[0];
type WakeRequester = SubagentRegistryDeps["maybeWakeRequesterAfterAllChildrenSettled"];

const { announceSpy } = vi.hoisted(() => ({
  announceSpy: vi.fn(async (_params: SubagentAnnounceParams) => "delivered" as const),
}));
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
vi.mock("../announce/subagent-announce.js", () => ({
  runSubagentAnnounceFlow: announceSpy,
}));
let mod: typeof import("./subagent-registry.test-helpers.js");
let callGatewayModule: typeof import("../../../gateway/call.js");
let agentEventsModule: typeof import("../../../infra/agent-events.js");
let registryDepsModule: typeof import("./subagent-registry-deps.js");
let registrySessionCleanupModule: typeof import("../../../test-utils/session-state-cleanup.js");
let registryAgentDbModule: typeof import("../../../state/openclaw-agent-db.js");
let registryStateDbModule: typeof import("../../../state/openclaw-state-db.js");

function listFixtureAgentDatabases(listDatabases: typeof listSeedAgentDatabases, stateDir: string) {
  return listDatabases().filter((database) => isPathInside(stateDir, database.path));
}

function setRegistryDeps(extra: Partial<SubagentRegistryDeps> = {}) {
  mod.testing.setDepsForTest(
    createSubagentRegistryTestDeps({
      callGateway: vi.mocked(callGatewayModule.callGateway),
      ...extra,
    }),
  );
}

const readPersistedRun = (runId: string) => loadSubagentRegistryFromSqlite().get(runId);

function activateRegistry() {
  const recoveryRuntime = {
    dispatchAgent: (params: Record<string, unknown>, timeoutMs?: number) =>
      callGatewayModule.callGateway({ method: "agent", params, timeoutMs }),
    waitForAgent: (params: Record<string, unknown>, timeoutMs?: number) =>
      callGatewayModule.callGateway({ method: "agent.wait", params, timeoutMs }),
    sendRecoveryNotice: vi.fn(),
  };
  mod.activateSubagentRegistry(
    () => ({ resolveGatewayContext: () => ({ recoveryRuntime }) }) as never,
  );
}

describe("subagent registry persistence resume", () => {
  beforeAll(async () => {
    vi.resetModules();
    mod = await import("./subagent-registry.test-helpers.js");
    callGatewayModule = await import("../../../gateway/call.js");
    agentEventsModule = await import("../../../infra/agent-events.js");
    registryStateDbModule = await import("../../../state/openclaw-state-db.js");
    registryDepsModule = await import("./subagent-registry-deps.js");
    registryAgentDbModule = await import("../../../state/openclaw-agent-db.js");
    registrySessionCleanupModule = await import("../../../test-utils/session-state-cleanup.js");
  });

  beforeEach(() => {
    announceSpy.mockClear();
    vi.mocked(callGatewayModule.callGateway).mockReset().mockResolvedValue({
      status: "ok",
      startedAt: 111,
      endedAt: 222,
    });
    setRegistryDeps();
    mod.resetSubagentRegistryForTests({ persist: false });
    vi.mocked(agentEventsModule.onAgentEvent)
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  function withRegistryState<T>(run: (stateDir: string) => Promise<T>): Promise<T>;
  function withRegistryState<T>(stateDir: string, run: () => Promise<T>): Promise<T>;
  function withRegistryState<T>(
    stateDirOrRun: string | ((stateDir: string) => Promise<T>),
    explicitRun?: () => Promise<T>,
  ): Promise<T> {
    const stateDir =
      typeof stateDirOrRun === "string" ? stateDirOrRun : tempDirs.make("openclaw-subagent-");
    const run = typeof stateDirOrRun === "string" ? explicitRun : () => stateDirOrRun(stateDir);
    if (!run) {
      throw new Error("Expected a registry persistence test callback.");
    }
    return withSubagentRegistryPersistenceState(
      {
        stateDir,
        resetRegistry: () => mod.resetSubagentRegistryForTests({ persist: false }),
        resetDeps: () => mod.testing.setDepsForTest(),
        closeDatabases: async () => {
          // The resumed registry owns a separate agent-DB cache after resetModules.
          // Agent cleanup releases leases through state DB writes, so close state DBs last.
          await registrySessionCleanupModule.cleanupSessionStateForTest({ stateDir });
          for (const [label, listDatabases] of [
            ["seed", listSeedAgentDatabases],
            ["post-reset", registryAgentDbModule.listOpenClawAgentDatabasesForTest],
          ] as const) {
            expect(
              listFixtureAgentDatabases(listDatabases, stateDir),
              `${label} agent handles closed before fixture removal`,
            ).toEqual([]);
          }
          closeSeedStateDatabase();
          registryStateDbModule.closeOpenClawStateDatabaseForTest();
        },
      },
      run,
    );
  }

  it.each([
    { name: "announcing", expectsCompletionMessage: true },
    { name: "nonannouncing", expectsCompletionMessage: false },
    { name: "unspecified completion" },
    { name: "collector", expectsCompletionMessage: false, collect: true },
  ])("preserves the registered parent turn through SQLite reopen: $name", async (options) => {
    await withRegistryState(async () => {
      vi.mocked(callGatewayModule.callGateway).mockImplementation(() => new Promise(() => {}));
      const { name, ...registration } = options;
      const childSessionKey = "agent:main:subagent:parent-association";
      mod.registerSubagentRun({
        runId: "child-parent-association",
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        requesterTurnRunId: "  parent-turn  ",
        requesterDisplayKey: "main",
        task: name,
        cleanup: "keep",
        ...registration,
      });
      const expected = {
        requesterTurnRunId: "parent-turn",
        completion: { required: registration.expectsCompletionMessage === true },
        delivery: {
          status: registration.expectsCompletionMessage === false ? "not_required" : "pending",
        },
      };
      const registered = mod.getSubagentRunByChildSessionKey(childSessionKey);
      expect(registered).toMatchObject(expected);
      expect(registered?.expectsCompletionMessage).toBe(registration.expectsCompletionMessage);
      registryStateDbModule.closeOpenClawStateDatabaseForTest();
      const restored = readPersistedRun("child-parent-association");
      expect(restored).toMatchObject(expected);
      expect(restored?.expectsCompletionMessage).toBe(registration.expectsCompletionMessage);
    });
  });

  it("resumes a persisted run from canonical SQLite state", async () => {
    await withRegistryState(async (stateDir) => {
      const run = createSubagentRunRecord({
        runId: "run-1",
        childSessionKey: "agent:main:subagent:test",
        requesterOrigin: { channel: "whatsapp", accountId: "acct-main" },
        task: "do the thing",
        execution: { status: "running" },
        completion: { required: false },
        delivery: { status: "not_required" },
      });
      saveSubagentRegistryToSqlite(new Map([[run.runId, run]]));
      await writeChildSession(stateDir, run.childSessionKey, "sess-test");

      mod.initSubagentRegistry();
      activateRegistry();

      await vi.waitFor(() => expect(announceSpy).toHaveBeenCalled(), {
        timeout: 1_000,
        interval: 10,
      });
      const announce = (announceSpy.mock.calls as unknown as Array<[unknown]>).at(-1)?.[0] as
        | {
            childRunId?: string;
            requesterOrigin?: { channel?: string; accountId?: string };
            outcome?: { status?: string };
          }
        | undefined;
      expect(announce).toMatchObject({
        childRunId: "run-1",
        requesterOrigin: { channel: "whatsapp", accountId: "acct-main" },
        outcome: { status: "ok" },
      });
      expect(mod.listSubagentRunsForRequester("agent:main:main")[0]).toMatchObject({
        childSessionKey: run.childSessionKey,
        requesterOrigin: { channel: "whatsapp", accountId: "acct-main" },
      });
      await settleSubagentRegistryPersistenceWork();
      expect(
        listFixtureAgentDatabases(listSeedAgentDatabases, stateDir),
        "seed session write acquired an agent handle",
      ).toHaveLength(1);
      expect(
        listFixtureAgentDatabases(
          registryAgentDbModule.listOpenClawAgentDatabasesForTest,
          stateDir,
        ),
        "resumed completion timing acquired a post-reset agent handle",
      ).toHaveLength(1);
    });
  });

  it("persists completion-time all-recipient authority selection on the authoritative run", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
    await withRegistryState(stateDir, async () => {
      const childSessionKey = "agent:main:subagent:all-authority";
      await writeSubagentSessionEntry({
        stateDir,
        agentId: "main",
        sessionKey: childSessionKey,
        sessionId: "sess-all-authority",
        defaultSessionId: "sess-all-authority",
      });
      mod.registerSubagentRun({
        runId: "run-all-authority",
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "fan out at completion",
        cleanup: "keep",
        silentAnnounce: true,
        continuationFanoutMode: "all",
        continuationRecipientAuthorityBinding: {
          version: 1,
          selection: "pending",
          fanoutMode: "all",
        },
      });

      await vi.waitFor(
        () =>
          expect(
            announceSpy.mock.calls.some(([params]) => params.childRunId === "run-all-authority"),
          ).toBe(true),
        { timeout: 5_000, interval: 10 },
      );
      const announceParams = announceSpy.mock.calls.find(
        ([params]) => params.childRunId === "run-all-authority",
      )?.[0];
      expect(announceParams).toBeDefined();
      const selectedBinding = {
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

      expect(announceParams?.persistContinuationRecipientAuthorityBinding?.(selectedBinding)).toBe(
        true,
      );
      expect(
        loadSubagentRegistryFromSqlite().get("run-all-authority")
          ?.continuationRecipientAuthorityBinding,
      ).toEqual(selectedBinding);
    });
  });

  it("prunes orphan runs before resuming an announce retry", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-subagent-"));
    await withRegistryState(stateDir, async () => {
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
      mod.addSubagentRunForTests({
        runId,
        childSessionKey,
        requesterSessionKey: "agent:main:main",
        requesterDisplayKey: "main",
        task: "resume orphan guard",
        cleanup: "keep",
        createdAt: now - 50,
        startedAt: now - 25,
        endedAt: now,
        suppressAnnounceReason: "steer-restart",
        cleanupHandled: false,
      });
      await removeSubagentSessionEntry({
        stateDir,
        agentId: "main",
        sessionKey: childSessionKey,
      });

      expect(mod.clearSubagentRunSteerRestart(runId)).toBe(true);
      await Promise.all([Promise.resolve(), Promise.resolve()]);

      expect(announceSpy).not.toHaveBeenCalled();
      expect(mod.listSubagentRunsForRequester("agent:main:main")).toHaveLength(0);
      expect(loadSubagentRegistryFromSqlite().has(runId)).toBe(false);
    });
  });

  it.each([
    { label: "successful", status: "ok" as const },
    { label: "timed-out", status: "timeout" as const },
  ])("retries pending $label child delivery after restart", async ({ label, status }) => {
    await withRegistryState(async (stateDir) => {
      const runId = `run-pending-${label}-delivery`;
      const childSessionKey = `agent:main:subagent:pending-${label}-delivery`;
      const run = createSubagentRunRecord({
        runId,
        requesterTurnRunId: "run-requester",
        childSessionKey,
        task: "deliver before waking requester",
        createdAt: 100,
        endedReason: "subagent-complete",
        startedAt: 110,
        endedAt: 200,
        outcome: { status },
        expectsCompletionMessage: true,
        completion: { required: true, resultText: "done", capturedAt: 200 },
        delivery: {
          status: "pending",
          payload: {
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            childSessionKey,
            childRunId: runId,
            task: "deliver before waking requester",
            startedAt: 110,
            endedAt: 200,
            outcome: { status },
            expectsCompletionMessage: true,
          },
        },
        cleanupHandled: false,
      });
      saveSubagentRegistryToSqlite(new Map([[run.runId, run]]));
      await writeChildSession(stateDir, run.childSessionKey, `sess-pending-${label}-delivery`);

      mod.initSubagentRegistry();
      activateRegistry();

      await vi.waitFor(() => expect(announceSpy).toHaveBeenCalled(), {
        timeout: 1_000,
        interval: 10,
      });
      expect(announceSpy).toHaveBeenCalledWith(
        expect.objectContaining({ childRunId: runId, outcome: { status } }),
      );
      expect(mod.getSubagentRunByRunId(runId)?.execution.outcome).toEqual({ status });
    });
  });

  it("replays one required completion after restart without the child session", async () => {
    await withRegistryState(async () => {
      const run = createOrphanedRequiredDelivery("pending");
      saveSubagentRegistryToSqlite(new Map([[run.runId, run]]));
      const settlement = gateSubagentRequesterSettlement(
        registryDepsModule.subagentRegistryDeps.maybeWakeRequesterAfterAllChildrenSettled,
      );
      mod.testing.setDepsForTest({
        ...registryDepsModule.subagentRegistryDeps,
        maybeWakeRequesterAfterAllChildrenSettled: settlement.run,
      });
      try {
        mod.initSubagentRegistry();
        activateRegistry();
        await vi.waitFor(
          () =>
            expect(settlement.run, "replay reached requester settlement").toHaveBeenCalledOnce(),
          {
            timeout: 5_000,
            interval: 10,
          },
        );
        expect(announceSpy, "replayed announcement delivered").toHaveBeenCalledOnce();
        expect(readPersistedRun(run.runId), "delivered row awaits real settlement").toMatchObject({
          delivery: { status: "delivered" },
          requesterSettleWake: { retireAfterSettle: true },
        });
        expect(announceSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            childSessionKey: run.childSessionKey,
            childRunId: run.runId,
            requesterSessionKey: "agent:main:main",
            roundOneReply: "canonical final reply",
            terminalReply: run.completion?.terminalReply,
            outcome: { status: "ok" },
          }),
        );
        await settlement.release();
        expect(settlement.run).toHaveBeenCalledOnce();
        expect(
          loadSubagentRegistryFromSqlite().has(run.runId),
          "settlement retired delivered row",
        ).toBe(false);
        await settleSubagentRegistryPersistenceWork();

        mod.resetSubagentRegistryForTests({ persist: false });
        mod.initSubagentRegistry();
        activateRegistry();
        await settleSubagentRegistryPersistenceWork();
        expect(announceSpy, "retired completion is not replayed again").toHaveBeenCalledOnce();
      } finally {
        await settlement.release();
      }
    });
  });

  it.each([
    "permanent rejection",
    "inactive drain error",
    "restart admission",
    "restart reactivation",
    "restart before deadline",
    "restart before activation",
    "restart throwing source",
  ] as const)("settles or preserves a delivered wake after %s", async (failure) => {
    const admission = await import("../../../process/gateway-work-admission.js");
    const restarting = failure.startsWith("restart");
    const waitingForActivation = failure === "restart before activation";
    let firstGatewayOpen = true;
    const firstGateway = {
      resolveGatewayContext: () => (firstGatewayOpen ? (firstGateway as never) : undefined),
    };
    const replacementGateway = { resolveGatewayContext: () => replacementGateway as never };
    if (restarting) {
      vi.useFakeTimers();
    }
    try {
      await withRegistryState(async () => {
        const endedAt = Date.now();
        const run = createDeliveredWake("run-rejected-requester-wake", {
          status: restarting && !waitingForActivation ? "dispatching" : "pending",
          attemptCount: waitingForActivation ? 2 : restarting ? 1 : 0,
          ...(restarting ? { replayCount: 1, nextAttemptAt: endedAt + 30_000 } : {}),
          batchRunIds: ["run-rejected-requester-wake"],
          requesterYieldBatch: true,
          afterRequesterYield: true,
          rearmGeneration: 1,
        });
        const wakeRequester = vi.fn<WakeRequester>(async (params) => {
          if (!restarting) {
            throw failure === "inactive drain error"
              ? new admission.GatewayDrainingError()
              : new Error("requester wake rejected before attempt admission");
          }
          expect(getGatewayContextResolver(params.settledEntry!)?.()).toBe(replacementGateway);
          params.completeBatch([params.settledEntry], run.requesterSettleWake?.rearmGeneration, {
            delivered: true,
            path: "direct",
          });
          return true;
        });
        setRegistryDeps({ maybeWakeRequesterAfterAllChildrenSettled: wakeRequester });
        saveSubagentRegistryToSqlite(new Map([[run.runId, run]]));

        mod.initSubagentRegistry();
        if (restarting) {
          mod.activateSubagentRegistry(() => firstGateway as never);
        } else {
          activateRegistry();
        }
        if (failure === "restart throwing source") {
          bindGatewayContextResolver(
            mod.getSubagentRunByRunId(run.runId)!,
            await withGatewayToolCallerIdentity(
              {
                agentId: "main",
                sessionKey: run.requesterSessionKey,
                gatewayContextResolver: () => {
                  if (!firstGatewayOpen) {
                    throw new Error("retired source");
                  }
                  return firstGateway as never;
                },
              },
              () => getGatewayToolCallerIdentity()?.gatewayContextResolver,
            ),
          );
        }

        if (restarting) {
          // The earlier delivery released its root; the real deadline timer must
          // cross fresh admission rather than inheriting live requester authority.
          admission.markGatewayRestartDraining();
          if (failure !== "restart before deadline" && !waitingForActivation) {
            await vi.advanceTimersByTimeAsync(30_000);
          }
          expect(wakeRequester).not.toHaveBeenCalled();
          expect(mod.getSubagentRunByRunId(run.runId)?.requesterSettleWake).toEqual(
            run.requesterSettleWake,
          );
          registryStateDbModule.closeOpenClawStateDatabaseForTest();
          closeSeedStateDatabase();
          const persisted = readPersistedRun(run.runId);
          expect(persisted?.requesterSettleWake).toEqual(run.requesterSettleWake);
          expect(persisted?.requesterTurnRunId).toBeUndefined();

          const retiredRun = mod.getSubagentRunByRunId(run.runId)!;
          const retiredResolver = getGatewayContextResolver(retiredRun);
          firstGatewayOpen = false;
          if (failure === "restart admission") {
            mod.resetSubagentRegistryForTests({ persist: false });
          }
          admission.resetGatewayWorkAdmission();
          if (waitingForActivation) {
            await vi.advanceTimersByTimeAsync(30_000);
            expect(wakeRequester).not.toHaveBeenCalled();
            expect(readPersistedRun(run.runId)?.requesterSettleWake).toEqual(
              run.requesterSettleWake,
            );
          }
          mod.initSubagentRegistry();
          mod.activateSubagentRegistry(() => replacementGateway as never);
          const recoveredRun = mod.getSubagentRunByRunId(run.runId);
          expect(recoveredRun).not.toBe(retiredRun);
          mod.activateSubagentRegistry(() => replacementGateway as never);
          expect(mod.getSubagentRunByRunId(run.runId)).toBe(recoveredRun);
          expect(retiredResolver?.()).toBeUndefined();
          await mod.testing.runSweeperTickForTests();
          await vi.advanceTimersByTimeAsync(failure === "restart before deadline" ? 30_000 : 0);
        }
        await vi.waitFor(() => expect(wakeRequester).toHaveBeenCalledOnce());
        await vi.waitFor(() => {
          const restored = readPersistedRun(run.runId);
          expect(restored?.delivery).toMatchObject({ status: "delivered" });
          expect(restored?.requesterSettleWake).toBeUndefined();
        });
        await mod.testing.sweepOnceForTests();
        expect(wakeRequester).toHaveBeenCalledOnce();
      });
    } finally {
      admission.resetGatewayWorkAdmission();
      vi.useRealTimers();
    }
  });
});
