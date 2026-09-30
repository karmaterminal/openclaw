// Custody operations that also write the session delivery queue (RFC
// docs/design/continue-work-signal-v2.md §5.4.2): both tables live in the
// shared state database, so a notice's queue insert commits with its
// obligation clear, and a post-compaction release commits with its handoff.
import { upsertBoundDeliveryQueueEntryInDatabase } from "../../../infra/delivery-queue-sqlite-bound.js";
import { getDeliveryQueueEntryOwnersInDatabase } from "../../../infra/delivery-queue-sqlite.kernel.js";
import { SESSION_DELIVERY_QUEUE_NAME } from "../../../infra/session-delivery-queue.records.js";
import type { OpenClawStateDatabase } from "../../../state/openclaw-state-db-contract.js";
import { casCheck, planPatch, readRecord, writePlanned } from "./custody-store.kernel.js";
import type {
  ContinuationNoticeSettlementInput,
  ContinuationNoticeSettlementResult,
  ContinuationPostCompactionReleaseInput,
  ContinuationPostCompactionReleaseResult,
  ContinuationQueueEntryStatus,
} from "./custody-store.types.js";

function readQueueEntryStatus(
  database: OpenClawStateDatabase,
  entryId: string,
): ContinuationQueueEntryStatus {
  const status = getDeliveryQueueEntryOwnersInDatabase(
    database,
    [SESSION_DELIVERY_QUEUE_NAME],
    entryId,
  ).get(SESSION_DELIVERY_QUEUE_NAME)?.status;
  return status === "pending" || status === "completed" || status === "failed" ? status : "unknown";
}

function assertSessionQueueEntry(entry: ContinuationNoticeSettlementInput["notice"]): void {
  if (entry.row.queue_name !== SESSION_DELIVERY_QUEUE_NAME || entry.mode !== "insert") {
    throw new Error("continuation custody inserts only new session-delivery rows");
  }
}

/**
 * Deliver a terminal notice obligation (RFC §5.4.2): insert the notice row
 * (insert-if-absent under its record-derived key) and clear the obligation in
 * this one transaction, so the notice is neither lost nor enqueued twice.
 */
export function settleContinuationNoticeInDatabase(
  database: OpenClawStateDatabase,
  input: ContinuationNoticeSettlementInput,
): ContinuationNoticeSettlementResult {
  assertSessionQueueEntry(input.notice);
  const current = readRecord(database.db, input.recordId);
  const failure = casCheck(current, input.recordId, input.expectedRevision);
  if (failure || !current) {
    return failure ?? { outcome: "not_found", recordId: input.recordId };
  }
  if (
    current.ownerSessionKey !== input.ownerSessionKey ||
    current.terminalNoticePending === undefined
  ) {
    return { outcome: "not_owed", recordId: input.recordId };
  }
  const plan = planPatch(current, { terminalNoticePending: null }, input.now);
  if ("invalid" in plan) {
    return { outcome: "not_owed", recordId: input.recordId };
  }
  upsertBoundDeliveryQueueEntryInDatabase(input.notice, database);
  const entryId = input.notice.row.id;
  const facts = writePlanned(database.db, [plan]);
  return {
    outcome: "settled",
    record: plan.next,
    entryId,
    entryStatus: readQueueEntryStatus(database, entryId),
    ...facts,
  };
}

/**
 * Hand a claimed post-compaction record to the session delivery queue (RFC
 * §4.4, §5.4.4). The queue insert and the permanent handoff commit together;
 * a retry after an unseen commit finds the same deterministic entry ID.
 */
export function releaseContinuationPostCompactionInDatabase(
  database: OpenClawStateDatabase,
  input: ContinuationPostCompactionReleaseInput,
): ContinuationPostCompactionReleaseResult {
  assertSessionQueueEntry(input.entry);
  const current = readRecord(database.db, input.recordId);
  const failure = casCheck(current, input.recordId, input.expectedRevision);
  if (failure || !current) {
    return failure ?? { outcome: "not_found", recordId: input.recordId };
  }
  const invalid = (reason: string): ContinuationPostCompactionReleaseResult => ({
    outcome: "invalid_transition",
    recordId: input.recordId,
    reason,
  });
  if (current.ownerSessionKey !== input.ownerSessionKey) {
    return invalid("record belongs to another owner");
  }
  if (current.kind !== "post_compaction" || current.status !== "running") {
    return invalid("only a claimed post-compaction record can be released");
  }
  if (current.cancelRequestedAt !== undefined) {
    return invalid("cancel requested");
  }
  const entryId = input.entry.row.id;
  const plan = planPatch(
    current,
    {
      status: "succeeded",
      phase: input.phase,
      failureReason: null,
      stateJson: input.stateJson,
      handoff: { target: "session_delivery_queue", queueEntryId: entryId, handedOffAt: input.now },
    },
    input.now,
  );
  if ("invalid" in plan) {
    return invalid(plan.invalid);
  }
  upsertBoundDeliveryQueueEntryInDatabase(input.entry, database);
  return { outcome: "released", record: plan.next, entryId, ...writePlanned(database.db, [plan]) };
}
