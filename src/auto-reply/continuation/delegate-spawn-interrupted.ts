// Q3 settlement for delegate claims whose admission cannot be proven (RFC
// docs/design/continue-work-signal-v2.md §5.4.4): the record fails with its
// attempts kept and owes exactly one `[continuation:delegate-spawn-interrupted]`
// notice, whose queue insert and obligation clear commit together (§5.4.2).
import { prepareSessionDeliveryEnqueue } from "../../infra/session-delivery-queue-storage.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { surfaceDurableContinuationNotice } from "./continuation-notice-surface.js";
import { settleContinuationNotice } from "./custody/custody-store.js";
import {
  buildContinuationSpawnInterruptedNotice,
  type ContinuationSpawnInterruptedSource,
} from "./custody/spawn-interrupted-notice.js";
import {
  decodeDelegateState,
  getDelegateRecord,
  listDelegateRecords,
  updateDelegateRecord,
  type DelegateCustodyRecord,
} from "./delegate-flow-store.js";
import type { PendingContinuationDelegate } from "./types.js";

const log = createSubsystemLogger("continuation/delegate-store");

/**
 * Terminalize a claim whose child admission cannot be proven (RFC §5.4.4, Q3):
 * the record fails with its attempts kept, owes exactly one
 * `[continuation:delegate-spawn-interrupted]` notice, and is never spawned
 * again. The obligation and its delivery are separate commits, as for the work
 * notice; a crash between them leaves the obligation for recovery.
 */
export async function terminalizeInterruptedDelegateClaim(
  delegate: Pick<PendingContinuationDelegate, "flowId" | "expectedRevision">,
  options: { collision?: boolean } = {},
): Promise<boolean> {
  const current = delegate.flowId ? await getDelegateRecord(delegate.flowId) : undefined;
  if (!current || current.revision !== delegate.expectedRevision) {
    return false;
  }
  if (options.collision) {
    log.warn(
      `[continuation:delegate-run-id-collision] flowId=${current.recordId} a subagent run under a recorded child run id belongs to another requester; not adopted`,
    );
  }
  const failed = await updateDelegateRecord({
    record: current,
    patch: {
      status: "failed",
      phase: "Delegate spawn interrupted before admission could be proven",
      failureReason: "spawn-interrupted",
      terminalNoticePending: "delegate-spawn-interrupted",
    },
  });
  if (!failed.applied) {
    return false;
  }
  await deliverOwedDelegateNotice(failed.record);
  return true;
}

function interruptedNoticeSource(
  record: DelegateCustodyRecord,
): ContinuationSpawnInterruptedSource {
  return {
    kind: "record",
    recordId: record.recordId,
    childRunIds: record.spawnAttempts.map((attempt) => attempt.childRunId),
  };
}

/**
 * Deliver an owed interrupted-spawn notice: the notice row insert and the
 * obligation clear commit together (RFC §5.4.2). Returns the queue entry ID
 * the notice lives in, or undefined when nothing was owed.
 */
export async function deliverOwedDelegateNotice(
  record: DelegateCustodyRecord,
): Promise<{ entryId: string; entryStatus: string } | undefined> {
  if (record.terminalNoticePending !== "delegate-spawn-interrupted") {
    return undefined;
  }
  const task = decodeDelegateState(record)?.task ?? "";
  const now = Date.now();
  const notice = buildContinuationSpawnInterruptedNotice({
    sessionKey: record.ownerSessionKey,
    source: interruptedNoticeSource(record),
    task,
  });
  const { bound } = prepareSessionDeliveryEnqueue(notice, now);
  const settled = await settleContinuationNotice({
    recordId: record.recordId,
    ownerSessionKey: record.ownerSessionKey,
    expectedRevision: record.revision,
    notice: bound,
    now,
  });
  if (settled.outcome !== "settled") {
    return undefined;
  }
  log.info(
    `[continuation:delegate-spawn-interrupted-notice] flowId=${record.recordId} session=${record.ownerSessionKey} deliveryId=${settled.entryId}`,
  );
  if (notice.kind === "systemEvent") {
    await surfaceDurableContinuationNotice({
      entryId: settled.entryId,
      entryStatus: settled.entryStatus,
      sessionKey: record.ownerSessionKey,
      text: notice.text,
      reason: "continuation-delegate-spawn-interrupted",
    });
  }
  return { entryId: settled.entryId, entryStatus: settled.entryStatus };
}

/** Every delegate record that still owes its interrupted-spawn notice. */
export async function listOwedDelegateNotices(): Promise<DelegateCustodyRecord[]> {
  return (await listDelegateRecords({ kinds: ["delegate"], statuses: ["failed"] })).filter(
    (record) => record.terminalNoticePending === "delegate-spawn-interrupted",
  );
}
