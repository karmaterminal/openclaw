import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionPostCompactionDelegate } from "../../config/sessions.js";
import {
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import {
  consumeStagedPostCompactionDelegates,
  listRecoverableStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  requeueReleasedPostCompactionDelegate,
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "./delegate-store-post-compaction.js";

// Staged post-compaction delegates stay non-terminal until the durable
// handoff (RFC §4.4): consumeStagedPostCompactionDelegates claims the custody
// record to `running`; releaseStagedPostCompactionDelegateToQueue inserts the
// session-delivery queue entry and hands the record off in one commit, and
// listRecoverableStagedPostCompactionDelegates surfaces crash-orphaned
// `running` records so startup recovery releases them into the queue.

const sessionKey = "post-compaction-durable-handoff-test";

useContinuationCustodyTestState();

async function releaseAll(delegates: readonly SessionPostCompactionDelegate[]): Promise<number> {
  let released = 0;
  for (const [sequence, delegate] of delegates.entries()) {
    const result = await releaseStagedPostCompactionDelegateToQueue({
      sessionKey,
      delegate,
      sequence,
    });
    if (result.released) {
      released += 1;
    }
  }
  return released;
}

describe("post-compaction durable handoff", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function stage(task: string): Promise<void> {
    await stagePostCompactionDelegate(sessionKey, {
      task,
      createdAt: 1_700_000_000_000,
      silent: true,
      silentWake: true,
    });
  }

  it("consume claims the record without terminalizing it (recoverable on crash before handoff)", async () => {
    await stage("evacuate context");
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);

    // Release (claim -> running). The record leaves the queued lane but is NOT
    // handed off yet.
    const released = await consumeStagedPostCompactionDelegates(sessionKey);
    expect(released).toHaveLength(1);
    expect(released[0]).toMatchObject({ task: "evacuate context" });
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);

    // Simulate a crash between claim and handoff: startup recovery must
    // surface the claimed `running` record (never terminalized, never requeued
    // behind an awaiting-seam record) so it is released without a new compaction.
    const recoverable = await listRecoverableStagedPostCompactionDelegates();
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]?.sessionKey).toBe(sessionKey);
    expect(recoverable[0]?.delegate).toMatchObject({ task: "evacuate context" });
    expect(recoverable[0]?.delegate.flowId).toBeDefined();
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);
  });

  it("the release hands the record off so recovery cannot replay it", async () => {
    await stage("evacuate context");
    const released = await consumeStagedPostCompactionDelegates(sessionKey);
    expect(released).toHaveLength(1);

    expect(await releaseAll(released)).toBe(1);
    expect(
      await readCustodyRecordForTest(expectDefined(released[0]?.flowId, "flow id")),
    ).toMatchObject({
      status: "succeeded",
      handoff: { target: "session_delivery_queue" },
    });

    // No running records remain, so recovery surfaces nothing to release.
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);
    expect(await consumeStagedPostCompactionDelegates(sessionKey)).toHaveLength(0);
  });

  it("releases only the records this caller claimed, leaving others recoverable", async () => {
    await stage("first");
    const firstRelease = await consumeStagedPostCompactionDelegates(sessionKey);
    expect(firstRelease).toHaveLength(1);

    // A second delegate is staged and claimed by an independent consume; its
    // record must survive the first caller's release.
    await stage("second");
    const secondRelease = await consumeStagedPostCompactionDelegates(sessionKey);
    expect(secondRelease).toHaveLength(1);

    expect(await releaseAll(firstRelease)).toBe(1);

    const recoverable = await listRecoverableStagedPostCompactionDelegates();
    expect(recoverable.map((r) => r.delegate.task)).toContain("second");
    expect(recoverable.map((r) => r.delegate.task)).not.toContain("first");
  });

  it("a failed durable persist requeues the claimed record instead of duplicating it", async () => {
    // Models the persist-failure path (post-compaction-delegate-dispatch):
    // after claiming the record to `running`, a failed handoff puts the same
    // record back to staged, so a crash can neither drop nor duplicate it.
    await stage("evacuate context");
    const released = await consumeStagedPostCompactionDelegates(sessionKey);
    expect(released).toHaveLength(1);
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);

    expect(
      await requeueReleasedPostCompactionDelegate(
        expectDefined(released.at(0), "released post-compaction delegate"),
      ),
    ).toBe("requeued");

    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(1);
    expect(await listRecoverableStagedPostCompactionDelegates()).toHaveLength(0);
    const rereleased = await consumeStagedPostCompactionDelegates(sessionKey);
    expect(rereleased.map((d) => d.task)).toEqual(["evacuate context"]);
    expect(rereleased[0]?.flowId).toBe(released[0]?.flowId);
  });

  it("preserves managed artifact return metadata when staging a session delegate", async () => {
    await stagePostCompactionDelegate(sessionKey, {
      task: "produce a managed report",
      createdAt: 1_700_000_000_000,
      returnOptions: { artifacts: "required" },
      recipientContext: { purpose: "Use the report after compaction." },
    });

    expect(await consumeStagedPostCompactionDelegates(sessionKey)).toEqual([
      expect.objectContaining({
        task: "produce a managed report",
        returnOptions: { artifacts: "required" },
        recipientContext: { purpose: "Use the report after compaction." },
      }),
    ]);
  });

  it("startup recovery boot cutoff skips records claimed by live traffic after process start", async () => {
    // A record claimed to `running` AFTER the boot cutoff is a live release,
    // not a crash orphan. Startup recovery must not surface it (which would
    // race the live release and hand the delegate off twice).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_100_000);
    await stage("evacuate context");
    const bootCutoff = Date.now();
    vi.setSystemTime(1_700_000_200_000);
    const released = await consumeStagedPostCompactionDelegates(sessionKey);
    expect(released).toHaveLength(1);
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);

    expect(
      await listRecoverableStagedPostCompactionDelegates({ runningUpdatedAtOrBefore: bootCutoff }),
    ).toHaveLength(0);

    // Without a cutoff the claimed record is still surfaced; it stays
    // `running` until released.
    const recoverable = await listRecoverableStagedPostCompactionDelegates();
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]?.delegate).toMatchObject({ task: "evacuate context" });
    expect(stagedPostCompactionDelegateCount(sessionKey)).toBe(0);
  });
});
