// "RFC §" references herein cite docs/design/continue-work-signal-v2.md (Agent Self-Elected Turn Continuation / CONTINUE_WORK).
/**
 * Real-store proof for delivery-time rejection of a released post-compaction
 * delegate.
 *
 * The release commits the session-delivery queue entry and the record's
 * handoff together (RFC §4.4), so by the time the queue drains, the record is
 * `succeeded` one revision past the claim the queue entry carries, and that
 * handoff is permanent. Every delivery-time rejection — stale TTL, chain cap,
 * cost cap, cross-session policy, spawn-forbidden — has to be recordable
 * against that state without failing its revision fence or undoing the
 * handoff.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setRuntimeConfigSnapshot } from "../../config/config.js";
import { updateContinuationRecords } from "./custody/custody-store.js";
import {
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "./custody/custody.test-support.js";
import {
  claimStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  stagePostCompactionCustodyDelegate,
  toSessionPostCompactionDelegate,
} from "./delegate-store-post-compaction.js";
import { markPendingDelegateFailed } from "./delegate-store.js";
import { failReleasedPostCompactionDelegate } from "./post-compaction-rejection.js";

const SESSION_KEY = "channel:session-1198";
const STALE_SUMMARY = "Post-compaction delegate rejected as stale after 604800001ms.";

useContinuationCustodyTestState();

/**
 * Reproduce the exact durable state a queued `postCompactionDelegate` entry sees:
 * staged, claimed (the revision the entry records), then released into the
 * queue with the permanent handoff.
 */
async function releaseOneDelegateThroughDurableHandoff() {
  await stagePostCompactionCustodyDelegate(SESSION_KEY, {
    task: "carry working state",
    stagedAt: Date.now(),
    firstArmedAt: Date.now(),
  });
  const claimed = (await claimStagedPostCompactionDelegates(SESSION_KEY))[0];
  if (!claimed?.flowId || claimed.expectedRevision === undefined) {
    throw new Error("expected a claimed post-compaction delegate");
  }
  const queuedEntrySource = {
    flowId: claimed.flowId,
    expectedRevision: claimed.expectedRevision,
    task: claimed.task,
  };
  expect(
    await releaseStagedPostCompactionDelegateToQueue({
      sessionKey: SESSION_KEY,
      delegate: toSessionPostCompactionDelegate(claimed),
      sequence: 0,
    }),
  ).toMatchObject({ released: true });
  return queuedEntrySource;
}

async function readRecord(recordId: string) {
  const record = await readCustodyRecordForTest(recordId);
  if (!record) {
    throw new Error(`expected custody record ${recordId}`);
  }
  return record;
}

beforeEach(() => {
  setRuntimeConfigSnapshot({
    tools: { sessions_spawn: { attachments: { enabled: true } } },
  });
});

describe("failReleasedPostCompactionDelegate", () => {
  it("records the rejection on work already handed off to the queue without undoing the handoff", async () => {
    const source = await releaseOneDelegateThroughDurableHandoff();
    const handedOff = await readRecord(source.flowId);
    expect(handedOff).toMatchObject({
      status: "succeeded",
      revision: source.expectedRevision + 1,
      handoff: { target: "session_delivery_queue" },
    });

    expect(
      await failReleasedPostCompactionDelegate(
        source,
        STALE_SUMMARY,
        "Post-compaction delegate rejected",
      ),
    ).toBe(true);
    expect(await readRecord(source.flowId)).toMatchObject({
      status: "succeeded",
      revision: source.expectedRevision + 2,
      handoff: handedOff.handoff,
      phase: `Post-compaction delegate rejected: ${STALE_SUMMARY}`,
    });
  });

  it("is the reason the plain revision-fenced transition is not enough", async () => {
    const source = await releaseOneDelegateThroughDurableHandoff();

    // Pinning the defect this helper exists for: the queue entry's claim
    // revision is one behind the durably handed-off record, so the strict fence
    // can never commit and the caller would throw instead of recording it.
    expect(await markPendingDelegateFailed(source, STALE_SUMMARY)).toBe(false);
    expect(await readRecord(source.flowId)).toMatchObject({ status: "succeeded" });
  });

  it("never terminalizes a handed-off record that moved past the handoff revision", async () => {
    const source = await releaseOneDelegateThroughDurableHandoff();
    const handedOff = await readRecord(source.flowId);
    // A later writer (e.g. the accepted chain-hop marker) advances the record.
    const moved = await updateContinuationRecords(
      [
        {
          recordId: handedOff.recordId,
          ownerSessionKey: handedOff.ownerSessionKey,
          expectedRevision: handedOff.revision,
          patch: { phase: "Concurrent writer" },
        },
      ],
      { now: Date.now() },
    );
    expect(moved.outcome).toBe("applied");

    // Handoffs are permanent (RFC §5.4.4): the rejection is noted, the record
    // stays `succeeded` with its queue handoff.
    expect(await failReleasedPostCompactionDelegate(source, STALE_SUMMARY)).toBe(true);
    expect(await readRecord(source.flowId)).toMatchObject({
      status: "succeeded",
      revision: source.expectedRevision + 3,
      handoff: handedOff.handoff,
    });
  });

  it("passes a source-less delegate straight through", async () => {
    expect(await failReleasedPostCompactionDelegate({ task: "no source row" }, STALE_SUMMARY)).toBe(
      false,
    );
  });
});
