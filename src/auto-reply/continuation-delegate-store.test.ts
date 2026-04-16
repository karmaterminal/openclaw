import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listTaskFlowsForOwnerKey,
  resetTaskFlowRegistryForTests,
} from "../tasks/task-flow-registry.js";
import { configureTaskFlowRegistryRuntime } from "../tasks/task-flow-registry.store.js";
import {
  CONTINUATION_DELEGATE_CONTROLLER_ID,
  CONTINUATION_POST_COMPACTION_CONTROLLER_ID,
  clearPendingDelegates,
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
  enqueuePendingDelegate,
  pendingDelegateCount,
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "./continuation-delegate-store.js";

describe("continuation-delegate-store", () => {
  beforeEach(() => {
    resetTaskFlowRegistryForTests({ persist: false });
    configureTaskFlowRegistryRuntime({
      store: {
        loadSnapshot: () => ({ flows: new Map() }),
        saveSnapshot: () => {},
        upsertFlow: () => {},
        deleteFlow: () => {},
      },
    });
  });

  afterEach(() => {
    clearPendingDelegates("test-session");
    clearPendingDelegates("other-session");
    resetTaskFlowRegistryForTests({ persist: false });
  });

  it("returns empty array when no delegates are pending", () => {
    expect(consumePendingDelegates("test-session")).toEqual([]);
  });

  it("stores pending delegates as managed TaskFlow records", () => {
    enqueuePendingDelegate("test-session", { task: "first", delayMs: 1000 });

    expect(listTaskFlowsForOwnerKey("test-session")).toEqual([
      expect.objectContaining({
        ownerKey: "test-session",
        controllerId: CONTINUATION_DELEGATE_CONTROLLER_ID,
        status: "queued",
        currentStep: "Queued for continuation dispatch",
      }),
    ]);
  });

  it("enqueues and consumes delegates in FIFO order", () => {
    enqueuePendingDelegate("test-session", { task: "first", delayMs: 1000 });
    enqueuePendingDelegate("test-session", { task: "second" });

    expect(consumePendingDelegates("test-session")).toEqual([
      { task: "first", delayMs: 1000 },
      { task: "second" },
    ]);
    expect(listTaskFlowsForOwnerKey("test-session").map((flow) => flow.status)).toEqual([
      "succeeded",
      "succeeded",
    ]);
  });

  it("isolates delegates by session", () => {
    enqueuePendingDelegate("test-session", { task: "A" });
    enqueuePendingDelegate("other-session", { task: "B" });

    expect(consumePendingDelegates("test-session")).toEqual([{ task: "A" }]);
    expect(consumePendingDelegates("other-session")).toEqual([{ task: "B" }]);
  });

  it("tracks queue depth without consuming", () => {
    enqueuePendingDelegate("test-session", { task: "A" });
    enqueuePendingDelegate("test-session", { task: "B" });

    expect(pendingDelegateCount("test-session")).toBe(2);
    expect(pendingDelegateCount("other-session")).toBe(0);
  });

  it("stages and releases post-compaction delegates separately", () => {
    stagePostCompactionDelegate("test-session", { task: "resume after compaction" });

    expect(listTaskFlowsForOwnerKey("test-session")).toEqual([
      expect.objectContaining({
        ownerKey: "test-session",
        controllerId: CONTINUATION_POST_COMPACTION_CONTROLLER_ID,
        status: "queued",
        currentStep: "Staged for release after compaction",
      }),
    ]);
    expect(pendingDelegateCount("test-session")).toBe(0);
    expect(stagedPostCompactionDelegateCount("test-session")).toBe(1);
    expect(consumePendingDelegates("test-session")).toEqual([]);
    expect(consumeStagedPostCompactionDelegates("test-session")).toEqual([
      {
        task: "resume after compaction",
        silent: true,
        silentWake: true,
        postCompaction: true,
      },
    ]);
  });
});
