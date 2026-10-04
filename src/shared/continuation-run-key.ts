/**
 * Shared contract for continuation delegate spawn keys (RFC
 * docs/design/continue-work-signal-v2.md §5.4.4, decision Q2).
 *
 * Continuation records a precomputed child run ID in a custody record's
 * `spawnAttempts` before it calls the spawn owner. The spawn owner uses that ID
 * verbatim as the Gateway run ID, so after admission the `subagent_runs` row's
 * `run_id` equals it. This module is the single formatter and parser for that
 * ID; custody, the spawn owner and the Gateway reservation all import
 * it rather than deriving their own.
 */

/** Run IDs with this prefix are reserved for backend continuation callers. */
export const CONTINUATION_CHILD_RUN_ID_PREFIX = "continuation:";

/** Phase in which an in-process continuation spawn failed (RFC §5.4.4). */
export type ContinuationSpawnFailurePhase = "initialize" | "dispatch" | "register";

/**
 * One spawn attempt recorded on a custody record before dispatch. Attempt IDs
 * are positive integers, strictly increasing within a record and never reused,
 * so two attempts never share a `childRunId`.
 */
export type ContinuationSpawnAttempt = {
  attemptId: number;
  childRunId: string;
  claimedAt: number;
  failurePhase?: ContinuationSpawnFailurePhase;
};

function assertRecordId(recordId: string): void {
  if (!recordId || recordId.trim() !== recordId || /\s/.test(recordId)) {
    throw new Error("continuation record id must be a non-empty token without whitespace");
  }
}

function assertAttemptId(attemptId: number): void {
  if (!Number.isSafeInteger(attemptId) || attemptId < 1) {
    throw new Error("continuation attempt id must be a positive safe integer");
  }
}

/** Format the deterministic child run ID for `(recordId, attemptId)`. */
export function formatContinuationChildRunId(recordId: string, attemptId: number): string {
  assertRecordId(recordId);
  assertAttemptId(attemptId);
  return `${CONTINUATION_CHILD_RUN_ID_PREFIX}${recordId}:${attemptId}`;
}

/**
 * Parse a continuation child run ID. The attempt ID is the segment after the
 * last `:`, so record IDs that themselves contain `:` still round-trip.
 */
export function parseContinuationChildRunId(
  runId: string,
): { recordId: string; attemptId: number } | undefined {
  if (!runId.startsWith(CONTINUATION_CHILD_RUN_ID_PREFIX)) {
    return undefined;
  }
  const body = runId.slice(CONTINUATION_CHILD_RUN_ID_PREFIX.length);
  const separator = body.lastIndexOf(":");
  if (separator <= 0) {
    return undefined;
  }
  const recordId = body.slice(0, separator);
  const attemptText = body.slice(separator + 1);
  if (!/^[1-9][0-9]*$/.test(attemptText)) {
    return undefined;
  }
  const attemptId = Number(attemptText);
  if (!Number.isSafeInteger(attemptId) || recordId.trim() !== recordId || /\s/.test(recordId)) {
    return undefined;
  }
  return { recordId, attemptId };
}

/** True when a run or idempotency key is in the reserved continuation namespace. */
export function isContinuationReservedRunId(key: string): boolean {
  return key.startsWith(CONTINUATION_CHILD_RUN_ID_PREFIX);
}
