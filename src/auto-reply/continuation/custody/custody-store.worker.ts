// Continuation custody store: the only SQL owner of `continuation_records`
// (RFC docs/design/continue-work-signal-v2.md §5.4.2-§5.4.3, Q1 = E). Every
// write runs inside one synchronous state write transaction in the shared
// state worker. Each operation validates every precondition before its first
// write, so a refusal commits nothing and a thrown write rolls the whole
// transaction back.
import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "../../../infra/kysely-sync.js";
import type { SqliteWorkerCommand } from "../../../infra/sqlite-worker-contract.js";
import { requestSqliteWorkerOperationAdmission } from "../../../infra/sqlite-worker-operation-admission.js";
import {
  formatContinuationChildRunId,
  type ContinuationSpawnAttempt,
} from "../../../shared/continuation-run-key.js";
import { tableExists } from "../../../state/openclaw-state-db-schema-helpers.js";
import type { DB as OpenClawStateKyselyDatabase } from "../../../state/openclaw-state-db.generated.js";
import {
  runOpenClawStateWriteTransaction,
  type OpenClawStateDatabaseOptions,
} from "../../../state/openclaw-state-db.js";
import { createOpenClawStateSchemaEnsurer } from "../../../state/openclaw-state-feature-schema.js";
import {
  CONTINUATION_SPAWN_FAILURE_PHASES,
  decodeContinuationRecordRow,
  encodeContinuationRecordRow,
  isTerminalContinuationStatus,
} from "./custody-record-codec.js";
import type {
  ContinuationAttemptFailureInput,
  ContinuationCasFailure,
  ContinuationClaimResult,
  ContinuationCommitFacts,
  ContinuationCreateResult,
  ContinuationDeleteResult,
  ContinuationElection,
  ContinuationElectionResult,
  ContinuationLiveRecordFact,
  ContinuationLiveStatus,
  ContinuationOwnerLiveSet,
  ContinuationPruneResult,
  ContinuationRecord,
  ContinuationRecordPatch,
  ContinuationRecordQuery,
  ContinuationRecordUpdate,
  ContinuationUpdateResult,
  NewContinuationRecord,
} from "./custody-store.types.js";
import type { ContinuationCustodyWorkerOperations } from "./custody-store.worker-contract.js";

export const CONTINUATION_RECORDS_TABLE = "continuation_records" as const;

type CustodyDatabase = Pick<OpenClawStateKyselyDatabase, typeof CONTINUATION_RECORDS_TABLE>;

const LIVE_STATUSES = ["queued", "running"] as const satisfies readonly ContinuationLiveStatus[];

function custodyDb(db: DatabaseSync) {
  return getNodeSqliteKysely<CustodyDatabase>(db);
}

/**
 * Creates the canonical first-use table and indexes once per database handle,
 * before the first custody write transaction. Reads never create it.
 */
export const ensureContinuationCustodySchema = createOpenClawStateSchemaEnsurer({
  table: CONTINUATION_RECORDS_TABLE,
  endMarker: "  ON continuation_records(status, kind, due_at);\n",
  operationLabel: "continuation.custody.schema.ensure",
});

function readRecord(db: DatabaseSync, recordId: string): ContinuationRecord | undefined {
  const row = executeSqliteQueryTakeFirstSync(
    db,
    custodyDb(db)
      .selectFrom(CONTINUATION_RECORDS_TABLE)
      .selectAll()
      .where("record_id", "=", recordId),
  );
  return row ? decodeContinuationRecordRow(row) : undefined;
}

/**
 * FIFO list in `(created_at, record_id)` order. The first-use table may be
 * absent on reads; presence comes from the handle's admitted schema facts.
 */
export function listContinuationRecordsInDatabase(
  db: DatabaseSync,
  query: ContinuationRecordQuery,
): ContinuationRecord[] {
  return tableExists(db, CONTINUATION_RECORDS_TABLE) ? selectRecords(db, query) : [];
}

/** Write paths run after the schema ensure, so they select without a presence check. */
function selectRecords(db: DatabaseSync, query: ContinuationRecordQuery): ContinuationRecord[] {
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

function readOwnerLiveSet(db: DatabaseSync, ownerSessionKey: string): ContinuationOwnerLiveSet {
  const records: ContinuationLiveRecordFact[] = selectRecords(db, {
    ownerSessionKey,
    statuses: LIVE_STATUSES,
  }).map((record) => ({
    recordId: record.recordId,
    kind: record.kind,
    // SAFETY: the query selected only live statuses.
    status: record.status as ContinuationLiveStatus,
    revision: record.revision,
    cancelRequested: record.cancelRequestedAt !== undefined,
  }));
  return { ownerSessionKey, records };
}

/** Post-commit facts for the owners a write touched, read inside the same transaction. */
function commitFacts(
  db: DatabaseSync,
  owners: Iterable<string>,
  releasedAttachments: ContinuationCommitFacts["releasedAttachments"],
): ContinuationCommitFacts {
  return {
    owners: [...new Set(owners)].map((owner) => readOwnerLiveSet(db, owner)),
    releasedAttachments,
  };
}

function insertRecord(db: DatabaseSync, record: ContinuationRecord): void {
  executeSqliteQuerySync(
    db,
    custodyDb(db)
      .insertInto(CONTINUATION_RECORDS_TABLE)
      .values(encodeContinuationRecordRow(record)),
  );
}

function writeRecord(db: DatabaseSync, record: ContinuationRecord, expectedRevision: number): void {
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

function newRecord(input: NewContinuationRecord): ContinuationRecord {
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

function casCheck(
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

type Planned = { next: ContinuationRecord; expectedRevision: number; released?: string };

/**
 * Apply a patch in memory. Terminal statuses stamp `endedAt` and scrub the
 * attachment reference. A handoff is permanent: once custody moved to another
 * owner the record stays `succeeded` with that exact handoff, so it can never
 * be reopened and driven a second time.
 */
function planPatch(
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
  return {
    next,
    expectedRevision: current.revision,
    ...(scrub && current.attachmentId !== undefined ? { released: current.attachmentId } : {}),
  };
}

function writePlanned(db: DatabaseSync, planned: readonly Planned[]): ContinuationCommitFacts {
  for (const { next, expectedRevision } of planned) {
    writeRecord(db, next, expectedRevision);
  }
  return commitFacts(
    db,
    planned.map(({ next }) => next.ownerSessionKey),
    planned.flatMap(({ next, released }) =>
      released ? [{ recordId: next.recordId, attachmentId: released }] : [],
    ),
  );
}

function validateNewRecord(input: NewContinuationRecord): string | undefined {
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

/** Durable create keyed by owner and kind; an existing record ID is never overwritten. */
export function createContinuationRecordInDatabase(
  db: DatabaseSync,
  input: NewContinuationRecord,
): ContinuationCreateResult {
  const invalid = validateNewRecord(input);
  if (invalid) {
    throw new Error(`invalid continuation record ${input.recordId}: ${invalid}`);
  }
  const existing = readRecord(db, input.recordId);
  if (existing) {
    return {
      outcome: "exists",
      recordId: input.recordId,
      ...(existing.attachmentId !== undefined ? { attachmentId: existing.attachmentId } : {}),
    };
  }
  const record = newRecord(input);
  insertRecord(db, record);
  return { outcome: "created", record, ...commitFacts(db, [record.ownerSessionKey], []) };
}

/**
 * Insert-if-absent of a complete record carried over from a legacy source
 * (RFC §5.4.5). Unlike a create, the caller supplies status, revision and
 * clocks exactly, so the Doctor import can keep `created_at` (the delegate
 * due-time base) and the source revision. It runs inside the importer's owner
 * transaction; an existing record ID is never overwritten.
 */
export function importContinuationRecordInDatabase(
  db: DatabaseSync,
  record: ContinuationRecord,
): "inserted" | "exists" {
  const invalid =
    validateNewRecord({ ...record, status: "queued" }) ??
    (isTerminalContinuationStatus(record.status) === (record.endedAt === undefined)
      ? "terminal records carry ended_at and live records do not"
      : undefined);
  if (invalid) {
    throw new Error(`invalid imported continuation record ${record.recordId}: ${invalid}`);
  }
  if (readRecord(db, record.recordId)) {
    return "exists";
  }
  insertRecord(db, record);
  return "inserted";
}

/**
 * Revision CAS over one or more records, all or nothing. With several updates
 * this is the rollback write: no owner condition, only exact revisions.
 */
export function updateContinuationRecordsInDatabase(
  db: DatabaseSync,
  updates: readonly ContinuationRecordUpdate[],
  now: number,
): ContinuationUpdateResult {
  const planned: Planned[] = [];
  const seen = new Set<string>();
  for (const update of updates) {
    if (seen.has(update.recordId)) {
      return {
        outcome: "invalid_transition",
        recordId: update.recordId,
        reason: "a record may appear once per write",
      };
    }
    seen.add(update.recordId);
    const current = readRecord(db, update.recordId);
    const failure = casCheck(current, update.recordId, update.expectedRevision);
    if (failure || !current) {
      return failure ?? { outcome: "not_found", recordId: update.recordId };
    }
    if (current.ownerSessionKey !== update.ownerSessionKey) {
      return {
        outcome: "invalid_transition",
        recordId: update.recordId,
        reason: "record belongs to another owner",
      };
    }
    const plan = planPatch(current, update.patch, now);
    if ("invalid" in plan) {
      return { outcome: "invalid_transition", recordId: update.recordId, reason: plan.invalid };
    }
    planned.push(plan);
  }
  const facts = writePlanned(db, planned);
  return { outcome: "applied", records: planned.map(({ next }) => next), ...facts };
}

/**
 * Owner-conditioned election replacement (RFC §5.4.3), as at C: reread the
 * owner's live work records, require the caller's snapshot exactly, CAS every
 * superseded parked record, require the new record to be new, then write all
 * of it. Chain identity is not part of the condition (Q5).
 */
export function electContinuationWorkInDatabase(
  db: DatabaseSync,
  election: ContinuationElection,
): ContinuationElectionResult {
  const { create, ownerSessionKey } = election;
  if (create.kind !== "work" || create.ownerSessionKey !== ownerSessionKey) {
    throw new Error("continuation election must create a work record for its owner");
  }
  const invalid = validateNewRecord(create);
  if (invalid) {
    throw new Error(`invalid continuation record ${create.recordId}: ${invalid}`);
  }
  const live = new Map(
    selectRecords(db, {
      ownerSessionKey,
      kinds: ["work"],
      statuses: LIVE_STATUSES,
    })
      .filter((record) => record.cancelRequestedAt === undefined)
      .map((record) => [record.recordId, record]),
  );
  const expected = new Map(election.expectedLive.map((entry) => [entry.recordId, entry]));
  if (
    expected.size !== election.expectedLive.length ||
    expected.size !== live.size ||
    [...expected.values()].some((entry) => {
      const current = live.get(entry.recordId);
      return current?.revision !== entry.revision || current.status !== entry.status;
    })
  ) {
    return { outcome: "owner_changed", ownerSessionKey };
  }
  const planned: Planned[] = [];
  for (const prior of election.supersede) {
    const current = live.get(prior.recordId);
    if (
      !current ||
      current.status !== "queued" ||
      planned.some(({ next }) => next.recordId === prior.recordId)
    ) {
      return { outcome: "invalid_prior", recordId: prior.recordId };
    }
    const failure = casCheck(current, prior.recordId, prior.expectedRevision);
    if (failure) {
      return failure;
    }
    const plan = planPatch(
      current,
      {
        status: "succeeded",
        phase: prior.phase,
        failureReason: null,
        stateJson: prior.stateJson,
        updatedAt: election.now,
      },
      election.now,
    );
    if ("invalid" in plan) {
      return { outcome: "invalid_prior", recordId: prior.recordId };
    }
    planned.push(plan);
  }
  if (readRecord(db, create.recordId)) {
    return { outcome: "exists", recordId: create.recordId };
  }
  // Supersede first, then insert: a fault between them must roll both back.
  for (const { next, expectedRevision } of planned) {
    writeRecord(db, next, expectedRevision);
  }
  const created = newRecord(create);
  insertRecord(db, created);
  return {
    outcome: "elected",
    created,
    superseded: planned.map(({ next }) => next),
    ...commitFacts(db, [ownerSessionKey], []),
  };
}

/**
 * Claim a queued delegate for a spawn attempt. The attempt ID is the next
 * integer after every recorded attempt, so IDs are strictly increasing and
 * never reused, and the child run ID comes only from the L0 formatter.
 */
export function claimContinuationSpawnAttemptInDatabase(
  db: DatabaseSync,
  input: { recordId: string; expectedRevision: number; now: number },
): ContinuationClaimResult {
  const current = readRecord(db, input.recordId);
  const failure = casCheck(current, input.recordId, input.expectedRevision);
  if (failure || !current) {
    return failure ?? { outcome: "not_found", recordId: input.recordId };
  }
  const refuse = (reason: string): ContinuationClaimResult => ({
    outcome: "not_claimable",
    recordId: input.recordId,
    reason,
  });
  if (current.kind !== "delegate") {
    return refuse("only delegate records carry spawn attempts");
  }
  if (current.status !== "queued") {
    return refuse(`status is ${current.status}`);
  }
  if (current.cancelRequestedAt !== undefined) {
    return refuse("cancel requested");
  }
  if (current.handoff) {
    return refuse("already handed off");
  }
  const attemptId =
    current.spawnAttempts.reduce((highest, attempt) => Math.max(highest, attempt.attemptId), 0) + 1;
  const childRunId = formatContinuationChildRunId(current.recordId, attemptId);
  if (current.spawnAttempts.some((attempt) => attempt.childRunId === childRunId)) {
    return refuse("child run id already recorded");
  }
  const attempt: ContinuationSpawnAttempt = { attemptId, childRunId, claimedAt: input.now };
  const plan = planPatch(current, { status: "running" }, input.now);
  if ("invalid" in plan) {
    return refuse(plan.invalid);
  }
  const record = { ...plan.next, spawnAttempts: [...current.spawnAttempts, attempt] };
  const facts = writePlanned(db, [{ ...plan, next: record }]);
  return { outcome: "claimed", record, attempt, ...facts };
}

/** Record the phase in which the latest spawn attempt failed, with an optional CAS patch. */
export function recordContinuationSpawnAttemptFailureInDatabase(
  db: DatabaseSync,
  input: ContinuationAttemptFailureInput,
  now: number,
): ContinuationUpdateResult {
  const current = readRecord(db, input.recordId);
  const failure = casCheck(current, input.recordId, input.expectedRevision);
  if (failure || !current) {
    return failure ?? { outcome: "not_found", recordId: input.recordId };
  }
  const latest = current.spawnAttempts.at(-1);
  const invalid = (reason: string): ContinuationUpdateResult => ({
    outcome: "invalid_transition",
    recordId: input.recordId,
    reason,
  });
  if (!CONTINUATION_SPAWN_FAILURE_PHASES.has(input.failurePhase)) {
    return invalid("unknown spawn failure phase");
  }
  if (current.status !== "running" || latest?.attemptId !== input.attemptId) {
    return invalid("only the running record's latest attempt can fail");
  }
  if (latest.failurePhase !== undefined) {
    return invalid("attempt failure already recorded");
  }
  const plan = planPatch(current, input.patch ?? {}, now);
  if ("invalid" in plan) {
    return invalid(plan.invalid);
  }
  const record = {
    ...plan.next,
    spawnAttempts: [
      ...current.spawnAttempts.slice(0, -1),
      { ...latest, failurePhase: input.failurePhase },
    ],
  };
  const facts = writePlanned(db, [{ ...plan, next: record }]);
  return { outcome: "applied", records: [record], ...facts };
}

/**
 * Remove one record at an exact revision (an unaccepted delegate, RFC §5.4.8
 * item 4). A handed-off record was accepted; deleting it would free its ID
 * for a create that reopens the custody the handoff moved away.
 */
export function deleteContinuationRecordInDatabase(
  db: DatabaseSync,
  input: { recordId: string; expectedRevision: number },
): ContinuationDeleteResult {
  const current = readRecord(db, input.recordId);
  const failure = casCheck(current, input.recordId, input.expectedRevision);
  if (failure || !current) {
    return failure ?? { outcome: "not_found", recordId: input.recordId };
  }
  if (current.handoff) {
    return {
      outcome: "invalid_transition",
      recordId: input.recordId,
      reason: "a handed-off record cannot be deleted",
    };
  }
  executeSqliteQuerySync(
    db,
    custodyDb(db)
      .deleteFrom(CONTINUATION_RECORDS_TABLE)
      .where("record_id", "=", input.recordId)
      .where("revision", "=", input.expectedRevision),
  );
  return {
    outcome: "deleted",
    recordId: input.recordId,
    ...commitFacts(
      db,
      [current.ownerSessionKey],
      current.attachmentId
        ? [{ recordId: current.recordId, attachmentId: current.attachmentId }]
        : [],
    ),
  };
}

/** Retention: terminal records end after the cutoff unless a notice obligation is pending. */
export function pruneContinuationRecordsInDatabase(
  db: DatabaseSync,
  input: { endedBefore: number },
): ContinuationPruneResult {
  if (!tableExists(db, CONTINUATION_RECORDS_TABLE)) {
    return { deletedRecordIds: [] };
  }
  const deleted = executeSqliteQuerySync(
    db,
    custodyDb(db)
      .deleteFrom(CONTINUATION_RECORDS_TABLE)
      .where("status", "in", ["succeeded", "failed", "cancelled"])
      .where("ended_at", "<", input.endedBefore)
      .where("terminal_notice_pending", "is", null)
      .returning("record_id"),
  ).rows;
  return { deletedRecordIds: deleted.map((row) => row.record_id).toSorted() };
}

export function isContinuationCustodyCommand(command: {
  type: string;
}): command is SqliteWorkerCommand<ContinuationCustodyWorkerOperations> {
  return command.type.startsWith("continuationCustody.");
}

/** One custody command is one state write transaction in the shared state worker. */
export function executeContinuationCustodyCommand(
  command: SqliteWorkerCommand<ContinuationCustodyWorkerOperations>,
  databaseOptions: OpenClawStateDatabaseOptions,
): ContinuationCustodyWorkerOperations[keyof ContinuationCustodyWorkerOperations]["output"] {
  if (command.type !== "continuationCustody.list" && command.type !== "continuationCustody.prune") {
    ensureContinuationCustodySchema(databaseOptions);
  }
  return runOpenClawStateWriteTransaction(({ db }) => {
    requestSqliteWorkerOperationAdmission({ stage: "transaction", facts: undefined });
    const result = executeInTransaction(db, command);
    requestSqliteWorkerOperationAdmission({ stage: "commit", facts: undefined });
    return result;
  }, databaseOptions);
}

function executeInTransaction(
  db: DatabaseSync,
  command: SqliteWorkerCommand<ContinuationCustodyWorkerOperations>,
): ContinuationCustodyWorkerOperations[keyof ContinuationCustodyWorkerOperations]["output"] {
  switch (command.type) {
    case "continuationCustody.create":
      return createContinuationRecordInDatabase(db, command.input.record);
    case "continuationCustody.update":
      return updateContinuationRecordsInDatabase(db, command.input.updates, command.input.now);
    case "continuationCustody.elect":
      return electContinuationWorkInDatabase(db, command.input);
    case "continuationCustody.claimSpawnAttempt":
      return claimContinuationSpawnAttemptInDatabase(db, command.input);
    case "continuationCustody.recordSpawnAttemptFailure":
      return recordContinuationSpawnAttemptFailureInDatabase(db, command.input, command.input.now);
    case "continuationCustody.delete":
      return deleteContinuationRecordInDatabase(db, command.input);
    case "continuationCustody.prune":
      return pruneContinuationRecordsInDatabase(db, command.input);
    case "continuationCustody.list":
      // Recovery and projection hydration read inside the write FIFO so they
      // observe every earlier committed custody write.
      return listContinuationRecordsInDatabase(db, command.input);
  }
  throw new Error("Unknown continuation custody command");
}
