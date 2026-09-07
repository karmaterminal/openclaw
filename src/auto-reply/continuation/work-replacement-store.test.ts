import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listTaskFlowsForOwnerKey,
  updateFlowRecordByIdExpectedRevision,
} from "../../tasks/task-flow-registry.js";
import { resetTaskFlowRegistryForTests } from "../../tasks/task-runtime.test-helpers.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { decodeWorkState, type PendingContinuationWork } from "./work-flow-state.js";
import { enqueuePendingWork } from "./work-store.js";

const runtimeState = vi.hoisted(() => ({
  beforeAtomicCreate: undefined as (() => void) | undefined,
}));

vi.mock("../../tasks/task-flow-runtime-internal.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../tasks/task-flow-runtime-internal.js")>();
  return {
    ...actual,
    createManagedTaskFlowWithAtomicUpdates: (
      params: Parameters<typeof actual.createManagedTaskFlowWithAtomicUpdates>[0],
    ) => {
      runtimeState.beforeAtomicCreate?.();
      return actual.createManagedTaskFlowWithAtomicUpdates(params);
    },
  };
});

const originalStateDir = process.env.OPENCLAW_STATE_DIR;

function restoreStateDir(): void {
  if (originalStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  }
}

function createWork(params: {
  sessionKey: string;
  reason: string;
  electedAt: number;
  parked: boolean;
}): PendingContinuationWork {
  return {
    sessionKey: params.sessionKey,
    hop: 1,
    delayMs: 30_000,
    electedAt: params.electedAt,
    dueAt: params.electedAt + 60_000,
    maxChainLength: 200,
    chainStartedAt: params.electedAt,
    accumulatedChainTokens: 0,
    reason: params.reason,
    ...(params.parked
      ? {
          anchorPending: true,
          idleRetry: {
            trigger: "reply-run-ended" as const,
            reasonCategory: "follow-up-work" as const,
            armedAt: params.electedAt,
          },
        }
      : { anchorFinalizedAt: params.electedAt }),
  };
}

function findFlow(sessionKey: string, reason: string) {
  return listTaskFlowsForOwnerKey(sessionKey).find(
    (flow) => decodeWorkState(flow)?.reason === reason,
  );
}

describe("continuation work replacement store", () => {
  beforeEach(() => {
    runtimeState.beforeAtomicCreate = undefined;
    resetTaskFlowRegistryForTests({ persist: false });
  });

  afterEach(() => {
    runtimeState.beforeAtomicCreate = undefined;
    resetTaskFlowRegistryForTests({ persist: false });
    restoreStateDir();
  });

  it("serializes two parked replacements that begin with no queued owner", async () => {
    await withOpenClawTestState({ label: "work-replacement-empty-owner" }, async (state) => {
      process.env.OPENCLAW_STATE_DIR = state.stateDir;
      const sessionKey = "agent:main:empty-owner";
      runtimeState.beforeAtomicCreate = () => {
        runtimeState.beforeAtomicCreate = undefined;
        expect(
          enqueuePendingWork(
            createWork({
              sessionKey,
              reason: "concurrent empty-owner parked work",
              electedAt: Date.now(),
              parked: true,
            }),
          ),
        ).not.toBeNull();
      };
      const { enqueuePendingWorkReplacing } = await import("./work-replacement-store.js");

      const result = enqueuePendingWorkReplacing({
        work: createWork({
          sessionKey,
          reason: "newest empty-owner parked work",
          electedAt: Date.now() + 1,
          parked: true,
        }),
        summary: "superseded by concurrent empty-owner replacement",
        maxPendingWork: 8,
        replaceParkedWork: true,
        expectedPriorFlowIds: [],
        expectedRunningFlowIds: [],
      });

      expect(result.applied).toBe(true);
      resetTaskFlowRegistryForTests({ persist: false });
      expect(findFlow(sessionKey, "concurrent empty-owner parked work")).toMatchObject({
        status: "succeeded",
      });
      expect(
        listTaskFlowsForOwnerKey(sessionKey).filter((flow) => flow.status === "queued"),
      ).toEqual([
        expect.objectContaining({
          stateJson: expect.objectContaining({ reason: "newest empty-owner parked work" }),
        }),
      ]);
    });
  });

  it("rejects a newly running owner discovered from an empty snapshot", async () => {
    await withOpenClawTestState({ label: "work-replacement-running-owner" }, async (state) => {
      process.env.OPENCLAW_STATE_DIR = state.stateDir;
      const sessionKey = "agent:main:running-owner";
      runtimeState.beforeAtomicCreate = () => {
        runtimeState.beforeAtomicCreate = undefined;
        const concurrent = enqueuePendingWork(
          createWork({
            sessionKey,
            reason: "concurrent running work",
            electedAt: Date.now(),
            parked: true,
          }),
        );
        if (!concurrent?.flowId || concurrent.expectedRevision === undefined) {
          throw new Error("expected concurrent parked flow");
        }
        expect(
          updateFlowRecordByIdExpectedRevision({
            flowId: concurrent.flowId,
            expectedRevision: concurrent.expectedRevision,
            patch: { status: "running" },
          }).applied,
        ).toBe(true);
      };
      const { enqueuePendingWorkReplacing } = await import("./work-replacement-store.js");

      const result = enqueuePendingWorkReplacing({
        work: createWork({
          sessionKey,
          reason: "rejected newest work",
          electedAt: Date.now() + 1,
          parked: true,
        }),
        summary: "superseded by empty-owner replacement",
        maxPendingWork: 8,
        replaceParkedWork: true,
        expectedPriorFlowIds: [],
        expectedRunningFlowIds: [],
      });

      expect(result).toMatchObject({ applied: false, reason: "running_owner" });
      expect(findFlow(sessionKey, "concurrent running work")).toMatchObject({ status: "running" });
      expect(findFlow(sessionKey, "rejected newest work")).toBeUndefined();
    });
  });

  it("enforces maxPendingWork transactionally for ordinary enqueues", async () => {
    await withOpenClawTestState({ label: "work-replacement-cap" }, async (state) => {
      process.env.OPENCLAW_STATE_DIR = state.stateDir;
      const sessionKey = "agent:main:ordinary-cap";
      runtimeState.beforeAtomicCreate = () => {
        runtimeState.beforeAtomicCreate = undefined;
        expect(
          enqueuePendingWork(
            createWork({
              sessionKey,
              reason: "concurrent ordinary work",
              electedAt: Date.now(),
              parked: false,
            }),
          ),
        ).not.toBeNull();
      };
      const { enqueuePendingWorkReplacing } = await import("./work-replacement-store.js");

      const result = enqueuePendingWorkReplacing({
        work: createWork({
          sessionKey,
          reason: "capped ordinary work",
          electedAt: Date.now() + 1,
          parked: false,
        }),
        summary: "ordinary enqueue",
        maxPendingWork: 1,
        replaceParkedWork: false,
        expectedPriorFlowIds: [],
        expectedRunningFlowIds: [],
      });

      expect(result).toEqual({ applied: false, capped: true });
      expect(listTaskFlowsForOwnerKey(sessionKey)).toEqual([
        expect.objectContaining({
          stateJson: expect.objectContaining({ reason: "concurrent ordinary work" }),
        }),
      ]);
    });
  });
});
