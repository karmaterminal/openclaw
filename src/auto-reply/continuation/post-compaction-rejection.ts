import { removeUnacceptedDelegateArtifactPolicy } from "../../agents/delegate-artifacts.js";
import {
  getDelegateRecord,
  isDurablyHandedOffPostCompactionFlow,
  updateDelegateRecord,
} from "./delegate-flow-store.js";
import { markPendingDelegateFailed } from "./delegate-store.js";

type RejectablePostCompactionDelegate = {
  flowId?: string;
  expectedRevision?: number;
  task: string;
  returnOptions?: { artifacts?: "forbidden" | "optional" | "required" };
};

/**
 * Record a delivery-time rejection of a released post-compaction delegate.
 *
 * Once released, the record is handed off to its session-queue entry for good
 * (RFC §4.4): the entry, not the record, is what the drain settles, so the
 * handed-off record keeps `succeeded` and only notes the rejection. A record
 * that was never handed off fails at its exact claim revision.
 */
export async function failReleasedPostCompactionDelegate(
  delegate: Pick<RejectablePostCompactionDelegate, "flowId" | "expectedRevision" | "task">,
  failureReason: string,
  phase?: string,
): Promise<boolean> {
  if (!delegate.flowId || delegate.expectedRevision === undefined) {
    return await markPendingDelegateFailed(delegate, failureReason, phase);
  }
  const record = await getDelegateRecord(delegate.flowId);
  if (!isDurablyHandedOffPostCompactionFlow(record) || !record) {
    return await markPendingDelegateFailed(delegate, failureReason, phase);
  }
  const noted = await updateDelegateRecord({
    record,
    patch: {
      phase: `${phase ?? "Post-compaction delegate rejected"}: ${failureReason}`.slice(0, 200),
    },
  });
  return noted.applied;
}

/** Terminalize a claimed post-compaction delegate the release seam refused. */
export async function rejectPostCompactionDelegate(
  delegate: RejectablePostCompactionDelegate,
  summary: string,
): Promise<boolean> {
  const failed = await markPendingDelegateFailed(
    delegate,
    summary,
    "Post-compaction delegate rejected",
  );
  if (
    failed &&
    delegate.flowId &&
    (delegate.returnOptions?.artifacts === "optional" ||
      delegate.returnOptions?.artifacts === "required")
  ) {
    await removeUnacceptedDelegateArtifactPolicy(delegate.flowId);
  }
  return failed;
}
