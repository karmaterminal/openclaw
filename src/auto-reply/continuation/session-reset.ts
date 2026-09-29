// Explicit reset is an interruption boundary for continuation custody (RFC
// docs/design/continue-work-signal-v2.md §5.4.4, "Reset at any boundary").
import { listContinuationRecords, updateContinuationRecords } from "./custody/custody-store.js";
import type { ContinuationRecord, ContinuationRecordPatch } from "./custody/custody-store.types.js";

const MAX_SESSION_RESET_CANCELLATION_ATTEMPTS = 8;

export class SessionContinuationResetError extends Error {
  constructor(recordId: string, reason: string) {
    super(`Session reset could not cancel continuation record ${recordId}: ${reason}. Retry.`);
    this.name = "SessionContinuationResetError";
  }
}

/**
 * A post-compaction record handed off to the session queue whose child was
 * not accepted yet. Handoffs are permanent, so reset fences the record; the
 * queue drain refuses to spawn a fenced source.
 */
function isUnacceptedPostCompactionHandoff(record: ContinuationRecord): boolean {
  return (
    record.kind === "post_compaction" &&
    record.status === "succeeded" &&
    record.handoff?.target === "session_delivery_queue" &&
    record.cancelRequestedAt === undefined &&
    !stateHasAcceptedChild(record)
  );
}

function stateHasAcceptedChild(record: ContinuationRecord): boolean {
  try {
    const state: unknown = JSON.parse(record.stateJson);
    return (
      typeof state === "object" &&
      state !== null &&
      typeof (state as { childSessionKey?: unknown }).childSessionKey === "string"
    );
  } catch {
    return false;
  }
}

function resetPatch(record: ContinuationRecord, now: number): ContinuationRecordPatch | undefined {
  if (record.status === "queued" || record.status === "running") {
    // Cancel is terminal: the same commit scrubs the attachment reference and
    // the store releases the payload file right after it (§5.4.9 item 6).
    return { status: "cancelled", phase: "Cancelled by session reset", cancelRequestedAt: now };
  }
  return isUnacceptedPostCompactionHandoff(record) ? { cancelRequestedAt: now } : undefined;
}

/** Terminalize durable continuation work owned by one reset session. */
export async function cancelSessionContinuations(sessionKey: string): Promise<void> {
  const now = Date.now();
  const records = await listContinuationRecords({ ownerSessionKey: sessionKey });
  for (const initial of records) {
    let current: ContinuationRecord | undefined = initial;
    for (let attempt = 0; current; attempt += 1) {
      const patch = resetPatch(current, now);
      if (!patch) {
        break;
      }
      let result: Awaited<ReturnType<typeof updateContinuationRecords>>;
      try {
        result = await updateContinuationRecords(
          [
            {
              recordId: current.recordId,
              ownerSessionKey: sessionKey,
              expectedRevision: current.revision,
              patch,
            },
          ],
          { now },
        );
      } catch (err) {
        // A failed write leaves the record as it was; report it as the
        // retryable reset failure instead of an unclassified handler error.
        throw new SessionContinuationResetError(
          current.recordId,
          err instanceof Error ? err.message : String(err),
        );
      }
      if (result.outcome === "applied" || result.outcome === "not_found") {
        break;
      }
      if (
        result.outcome !== "revision_conflict" ||
        attempt + 1 >= MAX_SESSION_RESET_CANCELLATION_ATTEMPTS
      ) {
        throw new SessionContinuationResetError(current.recordId, result.outcome);
      }
      current = (await listContinuationRecords({ recordIds: [current.recordId] }))[0];
    }
  }
}
