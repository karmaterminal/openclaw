import { afterEach, describe, expect, it, vi } from "vitest";
import { closeOpenClawStateDatabaseAsync } from "../../state/openclaw-state-db.js";
import { resetContinuationCustodyProjection } from "./custody/custody-projection.js";
import { hydrateContinuationCustody } from "./custody/custody-store.js";
import {
  listCustodyRecordsForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import { decodeDelegateState } from "./delegate-flow-store.js";
import { enqueuePendingDelegate, failQueuedDelegatesOwnedByRun } from "./delegate-store.js";

useContinuationCustodyTestState();

describe("delegate cancellation ownership", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels only the originating run and unambiguous legacy rows across reload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const runStartedAt = Date.parse("2026-09-07T13:00:00.000Z");
    vi.setSystemTime(runStartedAt);
    const sessionKey = "agent:main:delegate-ownership";
    await enqueuePendingDelegate(sessionKey, {
      task: "owned delegate",
      originRunId: "cancelled-run",
    });
    await enqueuePendingDelegate(sessionKey, {
      task: "other attempt delegate",
      originRunId: "other-run",
    });
    await enqueuePendingDelegate(sessionKey, { task: "ambiguous same-timestamp legacy delegate" });
    vi.setSystemTime(runStartedAt + 1);
    await enqueuePendingDelegate(sessionKey, { task: "newer legacy delegate" });

    expect(
      await failQueuedDelegatesOwnedByRun(
        sessionKey,
        { originRunId: "cancelled-run", legacyCreatedAfter: runStartedAt },
        "cancelled attempt",
      ),
    ).toBe(2);

    const assertOwnership = async () => {
      const byTask = new Map(
        (await listCustodyRecordsForTest({ ownerSessionKey: sessionKey })).map((record) => [
          decodeDelegateState(record)?.task,
          record,
        ]),
      );
      expect(byTask.get("owned delegate")).toMatchObject({ status: "failed" });
      expect(byTask.get("other attempt delegate")).toMatchObject({ status: "queued" });
      expect(byTask.get("ambiguous same-timestamp legacy delegate")).toMatchObject({
        status: "queued",
      });
      expect(byTask.get("newer legacy delegate")).toMatchObject({ status: "failed" });
    };
    await assertOwnership();

    // Reload: drop process state and read back committed custody.
    resetContinuationCustodyProjection();
    await closeOpenClawStateDatabaseAsync();
    await hydrateContinuationCustody();
    await assertOwnership();
  });
});
