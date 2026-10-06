// Feature-only sweeper recovery cases (stale-orphan completion, collector-group
// replacement), split from subagent-registry-sweeper-recovery.test.ts under its
// line cap. Mocks and hooks are copied verbatim from that suite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayRecoveryRuntime } from "../../../gateway/server-instance-runtime.types.js";
import { resetGatewayWorkAdmission } from "../../../process/gateway-work-admission.js";
import { prepareSubagentKillSession } from "./subagent-control-session.js";
import {
  createArchivedSubagentSweeperRun as archivedRun,
  createSubagentSweeperHarness as createHarness,
} from "./subagent-registry-sweeper.test-support.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { loadSubagentSessionEntry } from "./subagent-session-reconciliation.js";

const recoverRow = vi.hoisted(() => vi.fn());
const getAgentRunContext = vi.hoisted(() => vi.fn<(_runId: string) => unknown>(() => undefined));
const removeInternalSessionEffectsSession = vi.hoisted(() => vi.fn(async () => {}));
const killRuntime = vi.hoisted(() => ({
  abortEmbeddedAgentRun: vi.fn(() => false),
  isEmbeddedAgentRunActive: vi.fn(() => false),
  clearSessionLifecycleQueues: vi.fn(() => ({ followupCleared: 0, laneCleared: 0, keys: [] })),
}));
const killSessionEntry = vi.hoisted(() => ({
  current: undefined as
    | { sessionId: string; lifecycleRevision?: string; updatedAt: number }
    | undefined,
}));
vi.mock("./subagent-registry-restart-recovery.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./subagent-registry-restart-recovery.js")>();
  return {
    ...actual,
    recoverInterruptedSubagentRow: recoverRow,
  };
});
vi.mock("../../../infra/agent-run-registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../infra/agent-run-registry.js")>()),
  getAgentRunContext,
}));
vi.mock("../../internal-session-effects.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../internal-session-effects.js")>()),
  removeInternalSessionEffectsSession,
}));
vi.mock("./subagent-control.runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./subagent-control.runtime.js")>()),
  ...killRuntime,
}));
vi.mock("./subagent-control-session.js", { spy: true });
vi.mock("./subagent-session-reconciliation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./subagent-session-reconciliation.js")>();
  return {
    ...actual,
    loadSubagentSessionEntry: vi.fn(() => killSessionEntry.current),
  };
});
describe("subagent registry recovery scheduling: orphans and collector groups", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetGatewayWorkAdmission();
    recoverRow.mockReset();
    vi.mocked(loadSubagentSessionEntry)
      .mockReset()
      .mockImplementation(() => killSessionEntry.current);
    vi.mocked(prepareSubagentKillSession).mockImplementation(async (_cfg, _key, assertOwner) => {
      assertOwner();
      return {
        agentId: "main",
        storePath: "/synthetic-kill/sessions.sqlite",
        entry: killSessionEntry.current,
        assertCurrent: assertOwner,
        prepareRead: () => undefined,
        withPublication: async (publish) => await publish(),
        release: () => {},
      };
    });
    getAgentRunContext.mockReset().mockReturnValue(undefined);
    killRuntime.abortEmbeddedAgentRun.mockReset().mockReturnValue(false);
    killRuntime.isEmbeddedAgentRunActive.mockReset().mockReturnValue(false);
    killRuntime.clearSessionLifecycleQueues.mockReset().mockReturnValue({
      followupCleared: 0,
      laneCleared: 0,
      keys: [],
    });
    killSessionEntry.current = {
      sessionId: "session-id",
      lifecycleRevision: "session-revision",
      updatedAt: Date.now(),
    };
    removeInternalSessionEffectsSession.mockReset();
  });

  afterEach(() => {
    resetGatewayWorkAdmission();
    vi.useRealTimers();
  });
  it("canonically completes a stale orphan instead of pruning its task owner", async () => {
    recoverRow.mockResolvedValue({ status: "ignored" });
    const { entry, runs, completeSubagentRunWithRecovery, sweeper } = createHarness({
      current: {} as GatewayRecoveryRuntime,
    });
    entry.childSessionKey = "";
    entry.taskRunId = entry.runId;
    killSessionEntry.current = undefined;

    await sweeper.sweepOnce();

    expect(completeSubagentRunWithRecovery).toHaveBeenCalledWith(
      {
        runId: entry.runId,
        expectedEntry: entry,
        endedAt: expect.any(Number),
        outcome: {
          status: "error",
          error: "subagent run orphaned: missing-session-entry",
        },
        reason: "subagent-error",
        sendFarewell: true,
        accountId: undefined,
        triggerCleanup: true,
      },
      "sweeper-lost-context",
    );
    expect(runs.get(entry.runId)).toBe(entry);
  });

  it("retries stale-orphan completion after task persistence rejects", async () => {
    recoverRow.mockResolvedValue({ status: "ignored" });
    const { entry, runs, completeSubagentRunWithRecovery, sweeper } = createHarness({
      current: {} as GatewayRecoveryRuntime,
    });
    entry.childSessionKey = "";
    entry.taskRunId = entry.runId;
    killSessionEntry.current = undefined;
    completeSubagentRunWithRecovery
      .mockRejectedValueOnce(new Error("task persistence rejected"))
      .mockResolvedValueOnce(undefined);

    await expect(sweeper.sweepOnce()).rejects.toThrow("task persistence rejected");
    expect(runs.get(entry.runId)).toBe(entry);

    await expect(sweeper.sweepOnce()).resolves.toBeUndefined();
    expect(completeSubagentRunWithRecovery).toHaveBeenCalledTimes(2);
    expect(
      completeSubagentRunWithRecovery.mock.calls.every(
        ([params]) => params.expectedEntry === entry,
      ),
    ).toBe(true);
    expect(runs.get(entry.runId)).toBe(entry);
  });

  it("leaves a collector group untouched when a member is replaced during a groupmate's deletion", async () => {
    const { entry, runs, callGateway, sweeper } = createHarness({}, archivedRun());
    const collector = (runId: string, overrides: Partial<SubagentRunRecord> = {}) =>
      archivedRun({
        runId,
        childSessionKey: `agent:main:subagent:${runId}`,
        collect: true,
        groupId: "group",
        collectorCompletion: { status: "done" },
        ...overrides,
      });
    const deleting = collector("deleting", { cleanup: "keep" });
    const stale = collector("stale");
    stale.execution.suppressSessionEffects = true;
    runs.set(deleting.runId, deleting);
    runs.set(stale.runId, stale);
    const replacement = collector(stale.runId);
    callGateway.mockResolvedValueOnce({}).mockImplementationOnce(async () => {
      await Promise.resolve();
      runs.set(replacement.runId, replacement);
      return {};
    });

    await sweeper.sweepOnce();

    expect(callGateway).toHaveBeenCalledTimes(2);
    expect(runs.has(entry.runId)).toBe(false);
    expect(runs.get(deleting.runId)).toBe(deleting);
    expect(runs.get(replacement.runId)).toBe(replacement);
    // Group cleanup stops at the replaced member instead of finishing the
    // remaining phases for a group that the final membership check defers.
    expect(deleting.contextEngineCleanupCompletedAt).toBeUndefined();
  });
});
