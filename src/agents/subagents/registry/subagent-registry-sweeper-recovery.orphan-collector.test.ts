// Feature-only sweeper recovery cases (stale-orphan completion, collector-group
// replacement, a reset sibling's staged post-compaction delegate), split from
// subagent-registry-sweeper-recovery.test.ts under its line cap. Mocks and hooks are
// copied verbatim from that suite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetContinuationCustodyProjection } from "../../../auto-reply/continuation/custody/custody-projection.js";
import { hydrateContinuationCustody } from "../../../auto-reply/continuation/custody/custody-store.js";
import {
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "../../../auto-reply/continuation/delegate-store-post-compaction.js";
import { cancelPendingDelegates } from "../../../auto-reply/continuation/delegate-store.js";
import { resolveSessionStorePathCore } from "../../../config/sessions.js";
import {
  deleteSessionEntryLifecycle,
  loadSessionEntryReadOnly,
  replaceSessionEntrySync,
  resetSessionEntryLifecycle,
} from "../../../config/sessions/session-accessor.js";
import { createMockGatewayRecoveryRuntime } from "../../../gateway/server-recovery-runtime.test-support.js";
import { resetGatewayWorkAdmission } from "../../../process/gateway-work-admission.js";
import { withOpenClawTestState } from "../../../test-utils/openclaw-test-state.js";
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
    loadSubagentSessionEntry: vi.fn(async () => killSessionEntry.current),
  };
});
describe("subagent registry recovery scheduling: orphans and collector groups", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetGatewayWorkAdmission();
    recoverRow.mockReset();
    vi.mocked(loadSubagentSessionEntry)
      .mockReset()
      .mockImplementation(async () => killSessionEntry.current);
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
      current: createMockGatewayRecoveryRuntime(),
    });
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
        recoveryCurrent: {
          isHostCurrent: expect.any(Function),
          prepare: expect.any(Function),
        },
      },
      "sweeper-lost-context",
    );
    expect(runs.get(entry.runId)).toBe(entry);
  });

  it("retries stale-orphan completion after task persistence rejects", async () => {
    recoverRow.mockResolvedValue({ status: "ignored" });
    const { entry, runs, completeSubagentRunWithRecovery, sweeper } = createHarness({
      current: createMockGatewayRecoveryRuntime(),
    });
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

  it.each(["ordinary", "collector group", "collector launch"])(
    "keeps a reset sibling's staged post-compaction delegate during an earlier await in %s cleanup",
    async (kind) => {
      const actual = await vi.importActual<typeof import("./subagent-session-reconciliation.js")>(
        "./subagent-session-reconciliation.js",
      );
      await vi
        .mocked(loadSubagentSessionEntry)
        .withImplementation(actual.loadSubagentSessionEntry, async () => {
          await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
            // The fixture moved the state directory; hydrate its custody projection.
            await hydrateContinuationCustody();
            const { entry, runs, callGateway, sweeper } = createHarness({}, archivedRun());
            const sibling = archivedRun({
              runId: "sibling-run",
              childSessionKey: "agent:main:subagent:sibling",
              ...(kind !== "ordinary"
                ? { collect: true, groupId: "group", collectorCompletion: { status: "done" } }
                : {}),
              collectorLaunchCleanupPending: kind === "collector launch",
            });
            runs.set(sibling.runId, sibling);
            const storePath = resolveSessionStorePathCore(undefined, { agentId: "main" });
            for (const child of [entry, sibling]) {
              child.childSessionIdentity = {
                sessionId: child.runId,
                lifecycleRevision: "original-revision",
              };
              replaceSessionEntrySync(
                { sessionKey: child.childSessionKey, env: state.env },
                {
                  sessionId: child.runId,
                  lifecycleRevision: "original-revision",
                  updatedAt: Date.now(),
                },
              );
            }
            callGateway.mockImplementation(async ({ params: request }) => {
              if (request.key === entry.childSessionKey) {
                await resetSessionEntryLifecycle({
                  agentId: "main",
                  storePath,
                  target: {
                    canonicalKey: sibling.childSessionKey,
                    storeKeys: [sibling.childSessionKey],
                  },
                  buildNextEntry: ({ currentEntry }) => ({
                    ...currentEntry,
                    sessionId: sibling.runId,
                    lifecycleRevision: "reset-revision",
                    updatedAt: Date.now(),
                  }),
                });
              }
              const deleted = await deleteSessionEntryLifecycle({
                agentId: "main",
                storePath,
                target: { canonicalKey: request.key, storeKeys: [request.key] },
                expectedSessionId: request.expectedSessionId,
                expectedLifecycleRevision: request.expectedLifecycleRevision,
                archiveTranscript: false,
                deleteTranscriptWithoutArchive: true,
              });
              if (deleted.expectedEntryMismatch) {
                throw Object.assign(new Error("session changed"), {
                  name: "GatewayClientRequestError",
                  gatewayCode: "INVALID_REQUEST",
                  details: { reason: "session-changed" },
                });
              }
              return deleted;
            });
            await stagePostCompactionDelegate(sibling.childSessionKey, {
              task: "successor-owned work",
              createdAt: Date.now(),
              silent: true,
            });
            try {
              await sweeper.sweepOnce();
              expect(
                loadSessionEntryReadOnly({ sessionKey: entry.childSessionKey }),
              ).toBeUndefined();
              expect(
                loadSessionEntryReadOnly({ sessionKey: sibling.childSessionKey }),
              ).toMatchObject({
                sessionId: sibling.runId,
                lifecycleRevision: "reset-revision",
              });
              expect(stagedPostCompactionDelegateCount(sibling.childSessionKey)).toBe(1);
            } finally {
              await cancelPendingDelegates(sibling.childSessionKey);
              await sweeper.reset();
              resetContinuationCustodyProjection();
            }
          });
        });
    },
  );
});
