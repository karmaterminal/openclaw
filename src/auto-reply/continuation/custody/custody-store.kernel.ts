// Record primitives of the continuation custody store (RFC
// docs/design/continue-work-signal-v2.md §5.4.2): row reads, the in-memory
// patch planner, and exact-revision writes. Every caller runs inside one
// custody write transaction in the shared state worker; nothing here opens a
// transaction or touches another table.
import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "../../../infra/kysely-sync.js";
import type { DB as OpenClawStateKyselyDatabase } from "../../../state/openclaw-state-db.generated.js";
import {
  decodeContinuationRecordRow,
  encodeContinuationRecordRow,
  isTerminalContinuationStatus,
} from "./custody-record-codec.js";
import type {
  ContinuationCasFailure,
  ContinuationCommitFacts,
  ContinuationEndedRecordFact,
  ContinuationLiveRecordFact,
  ContinuationLiveStatus,
  ContinuationOwnerLiveSet,
  ContinuationRecord,
  ContinuationRecordPatch,
  ContinuationRecordQuery,
  NewContinuationRecord,
} from "./custody-store.types.js";

export const CONTINUATION_RECORDS_TABLE = "continuation_records" as const;

type CustodyDatabase = Pick<OpenClawStateKyselyDatabase, typeof CONTINUATION_RECORDS_TABLE>;

export const LIVE_STATUSES = [
  "queued",
  "running",
] as const satisfies readonly ContinuationLiveStatus[];

export function custodyDb(db: DatabaseSync) {
  return getNodeSqliteKysely<CustodyDatabase>(db);
}

export function readRecord(db: DatabaseSync, recordId: string): ContinuationRecord | undefined {
  const row = executeSqliteQueryTakeFirstSync(
    db,
    custodyDb(db)
      .selectFrom(CONTINUATION_RECORDS_TABLE)
      .selectAll()
      .where("record_id", "=", recordId),
  );
  return row ? decodeContinuationRecordRow(row) : undefined;
}

/** Write paths run after the schema ensure, so they select without a presence check. */
export function selectRecords(
  db: DatabaseSync,
  query: ContinuationRecordQuery,
): ContinuationRecord[] {
  let select = custodyDb(db).selectFrom(CONTINUATION_RECORDS_TABLE).selectAll();
  if (query.ownerSessionKey !== undefined) {
    select = select.where("owner_session_key", "=", query.ownerSessionKey);
  }
  if (query.kinds !== undefined) {
    if (query.kinds.length === 0) {
      return [];
    }
    select = select.where("kind", "in", query.kinds);
  }
  if (query.statuses !== undefined) {
    if (query.statuses.length === 0) {
      return [];
    }
    select = select.where("status", "in", query.statuses);
  }
  if (query.recordIds !== undefined) {
    if (query.recordIds.length === 0) {
      return [];
    }
    select = select.where("record_id", "in", query.recordIds);
  }
  return executeSqliteQuerySync(db, select.orderBy("created_at").orderBy("record_id")).rows.map(
    decodeContinuationRecordRow,
  );
}

export function readOwnerLiveSet(
  db: DatabaseSync,
  ownerSessionKey: string,
): ContinuationOwnerLiveSet {
  const records: ContinuationLiveRecordFact[] = selectRecords(db, {
    ownerSessionKey,
    statuses: LIVE_STATUSES,
  }).map((record) => {
    const fact: ContinuationLiveRecordFact = {
      recordId: record.recordId,
      kind: record.kind,
      // SAFETY: the query selected only live statuses.
      status: record.status as ContinuationLiveStatus,
      revision: record.revision,
      cancelRequested: record.cancelRequestedAt !== undefined,
      createdAt: record.createdAt,
    };
    if (record.dueAt !== undefined) {
      fact.dueAt = record.dueAt;
    }
    return fact;
  });
  return { ownerSessionKey, records };
}

/** Post-commit facts for the owners a write touched, read inside the same transaction. */
export function commitFacts(
  db: DatabaseSync,
  owners: Iterable<string>,
  releasedAttachments: ContinuationCommitFacts["releasedAttachments"],
  ended: readonly ContinuationEndedRecordFact[] = [],
): ContinuationCommitFacts {
  return {
    owners: [...new Set(owners)].map((owner) => readOwnerLiveSet(db, owner)),
    releasedAttachments,
    ended,
  };
}

export function insertRecord(db: DatabaseSync, record: ContinuationRecord): void {
  executeSqliteQuerySync(
    db,
    custodyDb(db)
      .insertInto(CONTINUATION_RECORDS_TABLE)
      .values(encodeContinuationRecordRow(record)),
  );
}

export function writeRecord(
  db: DatabaseSync,
  record: ContinuationRecord,
  expectedRevision: number,
): void {
  const { record_id: _recordId, ...values } = encodeContinuationRecordRow(record);
  const result = executeSqliteQuerySync(
    db,
    custodyDb(db)
      .updateTable(CONTINUATION_RECORDS_TABLE)
      .set(values)
      .where("record_id", "=", record.recordId)
      .where("revision", "=", expectedRevision),
  );
  // Preconditions were checked in this transaction; a miss means the invariant broke.
  if (Number(result.numAffectedRows ?? 0n) !== 1) {
    throw new Error(`continuation record ${record.recordId} changed inside its write transaction`);
  }
}

export function newRecord(input: NewContinuationRecord): ContinuationRecord {
  return {
    recordId: input.recordId,
    kind: input.kind,
    ownerSessionKey: input.ownerSessionKey,
    ...(input.chainId !== undefined ? { chainId: input.chainId } : {}),
    revision: 0,
    status: input.status,
    ...(input.phase !== undefined ? { phase: input.phase } : {}),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    stateJson: input.stateJson,
    spawnAttempts: [],
    ...(input.attachmentId !== undefined ? { attachmentId: input.attachmentId } : {}),
  };
}

export function casCheck(
  current: ContinuationRecord | undefined,
  recordId: string,
  expectedRevision: number,
): ContinuationCasFailure | undefined {
  if (!current) {
    return { outcome: "not_found", recordId };
  }
  if (current.revision !== expectedRevision) {
    return { outcome: "revision_conflict", recordId, revision: current.revision };
  }
  return undefined;
}

export type Planned = {
  next: ContinuationRecord;
  expectedRevision: number;
  released?: string;
  ended?: ContinuationEndedRecordFact;
};

/**
 * Apply a patch in memory. Terminal statuses stamp `endedAt` and scrub the
 * attachment reference. A handoff is permanent: once custody moved to another
 * owner the record stays `succeeded` with that exact handoff, so it can never
 * be reopened and driven a second time.
 */
export function planPatch(
  current: ContinuationRecord,
  patch: ContinuationRecordPatch,
  now: number,
): Planned | { invalid: string } {
  const status = patch.status ?? current.status;
  if (
    current.handoff &&
    patch.handoff !== undefined &&
    !isDeepStrictEqual(patch.handoff, current.handoff)
  ) {
    return { invalid: "a handoff cannot be cleared or replaced" };
  }
  const handoff = current.handoff ?? patch.handoff ?? undefined;
  if (handoff && status !== "succeeded") {
    return { invalid: "handed-off records stay succeeded" };
  }
  if (patch.stateJson !== undefined) {
    try {
      JSON.parse(patch.stateJson);
    } catch {
      return { invalid: "state_json must be JSON" };
    }
  }
  const terminal = isTerminalContinuationStatus(status);
  const scrub = terminal || patch.scrubAttachment === true;
  const pick = <T>(value: T | null | undefined, fallback: T | undefined): T | undefined =>
    value === null ? undefined : value === undefined ? fallback : value;
  const next: ContinuationRecord = {
    recordId: current.recordId,
    kind: current.kind,
    ownerSessionKey: current.ownerSessionKey,
    ...(current.chainId !== undefined ? { chainId: current.chainId } : {}),
    revision: current.revision + 1,
    status,
    createdAt: current.createdAt,
    updatedAt: patch.updatedAt ?? now,
    stateJson: patch.stateJson ?? current.stateJson,
    spawnAttempts: current.spawnAttempts,
  };
  const optional = {
    phase: pick(patch.phase, current.phase),
    failureReason: pick(patch.failureReason, current.failureReason),
    cancelRequestedAt: pick(patch.cancelRequestedAt, current.cancelRequestedAt),
    endedAt: terminal
      ? isTerminalContinuationStatus(current.status)
        ? current.endedAt
        : now
      : undefined,
    dueAt: pick(patch.dueAt, current.dueAt),
    handoff,
    rollbackOf: pick(patch.rollbackOf, current.rollbackOf),
    attachmentId: scrub ? undefined : current.attachmentId,
    terminalNoticePending: pick(patch.terminalNoticePending, current.terminalNoticePending),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) {
      Object.assign(next, { [key]: value });
    }
  }
  const ended =
    terminal && !isTerminalContinuationStatus(current.status) && next.endedAt !== undefined
      ? {
          recordId: next.recordId,
          ownerSessionKey: next.ownerSessionKey,
          kind: next.kind,
          // SAFETY: `terminal` holds, so the status is one of the terminal statuses.
          status: next.status as ContinuationEndedRecordFact["status"],
          createdAt: next.createdAt,
          endedAt: next.endedAt,
        }
      : undefined;
  return {
    next,
    expectedRevision: current.revision,
    ...(scrub && current.attachmentId !== undefined ? { released: current.attachmentId } : {}),
    ...(ended ? { ended } : {}),
  };
}

export function writePlanned(
  db: DatabaseSync,
  planned: readonly Planned[],
): ContinuationCommitFacts {
  for (const { next, expectedRevision } of planned) {
    writeRecord(db, next, expectedRevision);
  }
  return commitFacts(
    db,
    planned.map(({ next }) => next.ownerSessionKey),
    planned.flatMap(({ next, released }) =>
      released ? [{ recordId: next.recordId, attachmentId: released }] : [],
    ),
    planned.flatMap(({ ended }) => (ended ? [ended] : [])),
  );
}

export function validateNewRecord(input: NewContinuationRecord): string | undefined {
  if (input.chainId !== undefined && input.kind !== "work") {
    return "only work records carry a chain id";
  }
  if (input.attachmentId !== undefined && input.kind === "work") {
    return "work records carry no attachments";
  }
  try {
    JSON.parse(input.stateJson);
  } catch {
    return "state_json must be JSON";
  }
  return undefined;
}
