// Row codec for `continuation_records`. Decoding is structural and fails
// closed; errors name the record and column, never stored content, which may
// hold task text.
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import type { Insertable, Selectable } from "kysely";
import type {
  ContinuationSpawnAttempt,
  ContinuationSpawnFailurePhase,
} from "../../../shared/continuation-run-key.js";
import type { ContinuationRecords } from "../../../state/openclaw-state-db.generated.js";
import type {
  ContinuationHandoff,
  ContinuationRecord,
  ContinuationRecordKind,
  ContinuationRecordStatus,
  ContinuationTerminalNotice,
} from "./custody-store.types.js";

const KINDS: ReadonlySet<string> = new Set<ContinuationRecordKind>([
  "work",
  "delegate",
  "post_compaction",
]);
const STATUSES: ReadonlySet<string> = new Set<ContinuationRecordStatus>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
function isTerminalNotice(value: string | null): value is ContinuationTerminalNotice {
  return value !== null && NOTICES.has(value);
}

const NOTICES: ReadonlySet<string> = new Set<ContinuationTerminalNotice>([
  "retry-exhausted",
  "delegate-spawn-interrupted",
  "rollback-election-conflict",
]);
export const CONTINUATION_SPAWN_FAILURE_PHASES: ReadonlySet<string> =
  new Set<ContinuationSpawnFailurePhase>(["initialize", "dispatch", "register"]);
export function isTerminalContinuationStatus(status: ContinuationRecordStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

class ContinuationRecordDecodeError extends Error {
  constructor(recordId: string, field: string) {
    // Structural only: never echo stored content, which may hold task text.
    super(`continuation record ${recordId} has an invalid ${field}`);
    this.name = "ContinuationRecordDecodeError";
  }
}

function decodeSpawnAttempts(recordId: string, raw: string): ContinuationSpawnAttempt[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ContinuationRecordDecodeError(recordId, "spawn_attempts_json");
  }
  if (!Array.isArray(parsed)) {
    throw new ContinuationRecordDecodeError(recordId, "spawn_attempts_json");
  }
  return parsed.map((value: unknown) => {
    if (!isRecord(value)) {
      throw new ContinuationRecordDecodeError(recordId, "spawn_attempts_json");
    }
    const { attemptId, childRunId, claimedAt, failurePhase } = value;
    if (
      typeof attemptId !== "number" ||
      !Number.isSafeInteger(attemptId) ||
      attemptId < 1 ||
      typeof childRunId !== "string" ||
      childRunId.length === 0 ||
      typeof claimedAt !== "number" ||
      (failurePhase !== undefined &&
        (typeof failurePhase !== "string" || !CONTINUATION_SPAWN_FAILURE_PHASES.has(failurePhase)))
    ) {
      throw new ContinuationRecordDecodeError(recordId, "spawn_attempts_json");
    }
    // Opaque persisted evidence: the child run ID is never re-derived on read.
    const attempt: ContinuationSpawnAttempt = { attemptId, childRunId, claimedAt };
    if (failurePhase !== undefined) {
      // SAFETY: membership in CONTINUATION_SPAWN_FAILURE_PHASES was checked above.
      attempt.failurePhase = failurePhase as ContinuationSpawnFailurePhase;
    }
    return attempt;
  });
}

function decodeHandoff(recordId: string, raw: string | null): ContinuationHandoff | undefined {
  if (raw === null) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ContinuationRecordDecodeError(recordId, "handoff_json");
  }
  if (isRecord(parsed)) {
    const value = parsed;
    if (
      value.target === "subagent_runs" &&
      typeof value.childRunId === "string" &&
      typeof value.childSessionKey === "string" &&
      typeof value.handedOffAt === "number"
    ) {
      return {
        target: "subagent_runs",
        childRunId: value.childRunId,
        childSessionKey: value.childSessionKey,
        handedOffAt: value.handedOffAt,
      };
    }
    if (
      value.target === "session_delivery_queue" &&
      typeof value.queueEntryId === "string" &&
      typeof value.handedOffAt === "number"
    ) {
      return {
        target: "session_delivery_queue",
        queueEntryId: value.queueEntryId,
        handedOffAt: value.handedOffAt,
      };
    }
  }
  throw new ContinuationRecordDecodeError(recordId, "handoff_json");
}

export function decodeContinuationRecordRow(
  row: Selectable<ContinuationRecords>,
): ContinuationRecord {
  if (!KINDS.has(row.kind)) {
    throw new ContinuationRecordDecodeError(row.record_id, "kind");
  }
  if (!STATUSES.has(row.status)) {
    throw new ContinuationRecordDecodeError(row.record_id, "status");
  }
  if (row.terminal_notice_pending !== null && !NOTICES.has(row.terminal_notice_pending)) {
    throw new ContinuationRecordDecodeError(row.record_id, "terminal_notice_pending");
  }
  const handoff = decodeHandoff(row.record_id, row.handoff_json);
  return {
    recordId: row.record_id,
    // SAFETY: the three enumerations were checked against their CHECK-constraint sets above.
    kind: row.kind as ContinuationRecordKind,
    ownerSessionKey: row.owner_session_key,
    ...(row.chain_id !== null ? { chainId: row.chain_id } : {}),
    revision: row.revision,
    // SAFETY: status was checked against its CHECK-constraint set above.
    status: row.status as ContinuationRecordStatus,
    ...(row.phase !== null ? { phase: row.phase } : {}),
    ...(row.failure_reason !== null ? { failureReason: row.failure_reason } : {}),
    ...(row.cancel_requested_at !== null ? { cancelRequestedAt: row.cancel_requested_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.ended_at !== null ? { endedAt: row.ended_at } : {}),
    ...(row.due_at !== null ? { dueAt: row.due_at } : {}),
    stateJson: row.state_json,
    spawnAttempts: decodeSpawnAttempts(row.record_id, row.spawn_attempts_json),
    ...(handoff ? { handoff } : {}),
    ...(row.rollback_of !== null ? { rollbackOf: row.rollback_of } : {}),
    ...(row.attachment_id !== null ? { attachmentId: row.attachment_id } : {}),
    ...(isTerminalNotice(row.terminal_notice_pending)
      ? { terminalNoticePending: row.terminal_notice_pending }
      : {}),
  };
}

export function encodeContinuationRecordRow(
  record: ContinuationRecord,
): Insertable<ContinuationRecords> {
  return {
    record_id: record.recordId,
    kind: record.kind,
    owner_session_key: record.ownerSessionKey,
    chain_id: record.chainId ?? null,
    revision: record.revision,
    status: record.status,
    phase: record.phase ?? null,
    failure_reason: record.failureReason ?? null,
    cancel_requested_at: record.cancelRequestedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    ended_at: record.endedAt ?? null,
    due_at: record.dueAt ?? null,
    state_json: record.stateJson,
    spawn_attempts_json: JSON.stringify(record.spawnAttempts),
    handoff_json: record.handoff ? JSON.stringify(record.handoff) : null,
    rollback_of: record.rollbackOf ?? null,
    attachment_id: record.attachmentId ?? null,
    terminal_notice_pending: record.terminalNoticePending ?? null,
  };
}
