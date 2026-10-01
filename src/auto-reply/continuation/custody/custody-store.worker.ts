// Continuation custody store: the only SQL owner of `continuation_records`
// (RFC docs/design/continue-work-signal-v2.md §5.4.2-§5.4.3, Q1 = E). Every
// write runs inside one synchronous state write transaction in the shared
// state worker. Each operation validates every precondition before its first
// write, so a refusal commits nothing and a thrown write rolls the whole
// transaction back.
import type { DatabaseSync } from "node:sqlite";
import { executeSqliteQuerySync } from "../../../infra/kysely-sync.js";
import type { SqliteWorkerCommand } from "../../../infra/sqlite-worker-contract.js";
import { requestSqliteWorkerOperationAdmission } from "../../../infra/sqlite-worker-operation-admission.js";
import {
  formatContinuationChildRunId,
  type ContinuationSpawnAttempt,
} from "../../../shared/continuation-run-key.js";
import { createLazyRuntimeModule } from "../../../shared/lazy-runtime.js";
import type { OpenClawStateDatabase } from "../../../state/openclaw-state-db-contract.js";
import { tableExists } from "../../../state/openclaw-state-db-schema-helpers.js";
import {
  runOpenClawStateWriteTransaction,
  type OpenClawStateDatabaseOptions,
} from "../../../state/openclaw-state-db.js";
import { createOpenClawStateSchemaEnsurer } from "../../../state/openclaw-state-feature-schema.js";
import { CONTINUATION_SPAWN_FAILURE_PHASES } from "./custody-record-codec.js";
import {
  CONTINUATION_RECORDS_TABLE,
  casCheck,
  commitFacts,
  custodyDb,
  insertRecord,
  LIVE_STATUSES,
  newRecord,
  planPatch,
  readRecord,
  selectRecords,
  validateNewRecord,
  writePlanned,
  writeRecord,
  type Planned,
} from "./custody-store.kernel.js";
import type {
  ContinuationAttemptFailureInput,
  ContinuationClaimResult,
  ContinuationCreateResult,
  ContinuationDeleteResult,
  ContinuationElection,
  ContinuationElectionResult,
  ContinuationPruneResult,
  ContinuationRecord,
  ContinuationRecordQuery,
  ContinuationRecordUpdate,
  ContinuationUpdateResult,
  NewContinuationRecord,
} from "./custody-store.types.js";
import type { ContinuationCustodyWorkerOperations } from "./custody-store.worker-contract.js";
import {
  releaseContinuationPostCompactionInDatabase,
  settleContinuationNoticeInDatabase,
} from "./custody-store.worker-handoffs.js";
import {
  listContinuationOwnersAwaitingImport,
  readOwedLegacyReleases,
} from "./legacy-taskflow-migration-source.js";
/**
 * Creates the canonical first-use table and indexes once per database handle,
 * before the first custody write transaction. Reads never create it.
 */
export const ensureContinuationCustodySchema = createOpenClawStateSchemaEnsurer({
  table: CONTINUATION_RECORDS_TABLE,
  endMarker: "  ON continuation_records(status, kind, due_at);\n",
  operationLabel: "continuation.custody.schema.ensure",
});

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
    ...commitFacts(
      db,
      [ownerSessionKey],
      [],
      planned.flatMap(({ ended }) => (ended ? [ended] : [])),
    ),
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

// The legacy import pulls in delivery-queue and TaskFlow decoding modules; it
// loads only when its own commands are prepared, never at worker start.
const loadLegacyImport = createLazyRuntimeModule(
  () => import("./legacy-taskflow-import.worker.js"),
);
let legacyImport: typeof import("./legacy-taskflow-import.worker.js") | undefined;

/** Load what a custody command needs before its synchronous execution. */
export function prepareContinuationCustodyCommand(type: PropertyKey): Promise<void> | undefined {
  if (
    (type === "continuationCustody.readLegacySnapshot" ||
      type === "continuationCustody.importLegacyOwner") &&
    !legacyImport
  ) {
    return loadLegacyImport().then((loaded) => {
      legacyImport = loaded;
    });
  }
  return undefined;
}

function preparedLegacyImport(): typeof import("./legacy-taskflow-import.worker.js") {
  if (!legacyImport) {
    throw new Error("Continuation legacy import command was not prepared");
  }
  return legacyImport;
}

/** Commands that read or delete only, so they never create the first-use table. */
const SCHEMALESS_COMMANDS: ReadonlySet<keyof ContinuationCustodyWorkerOperations> = new Set<
  keyof ContinuationCustodyWorkerOperations
>([
  "continuationCustody.list",
  "continuationCustody.prune",
  "continuationCustody.listAwaitingImportOwners",
  "continuationCustody.readBootFacts",
  "continuationCustody.readLegacySnapshot",
  "continuationCustody.readOwedLegacyReleases",
]);

/** One custody command is one state write transaction in the shared state worker. */
export function executeContinuationCustodyCommand(
  command: SqliteWorkerCommand<ContinuationCustodyWorkerOperations>,
  databaseOptions: OpenClawStateDatabaseOptions,
): ContinuationCustodyWorkerOperations[keyof ContinuationCustodyWorkerOperations]["output"] {
  if (!SCHEMALESS_COMMANDS.has(command.type)) {
    ensureContinuationCustodySchema(databaseOptions);
  }
  return runOpenClawStateWriteTransaction((database) => {
    requestSqliteWorkerOperationAdmission({ stage: "transaction", facts: undefined });
    const result = executeInTransaction(database, command);
    requestSqliteWorkerOperationAdmission({ stage: "commit", facts: undefined });
    return result;
  }, databaseOptions);
}

function executeInTransaction(
  database: OpenClawStateDatabase,
  command: SqliteWorkerCommand<ContinuationCustodyWorkerOperations>,
): ContinuationCustodyWorkerOperations[keyof ContinuationCustodyWorkerOperations]["output"] {
  const { db } = database;
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
    case "continuationCustody.settleNotice":
      return settleContinuationNoticeInDatabase(database, command.input);
    case "continuationCustody.releasePostCompaction":
      return releaseContinuationPostCompactionInDatabase(database, command.input);
    case "continuationCustody.list":
      // Recovery and projection hydration read inside the write FIFO so they
      // observe every earlier committed custody write.
      return listContinuationRecordsInDatabase(db, command.input);
    case "continuationCustody.listAwaitingImportOwners":
      return listContinuationOwnersAwaitingImport(db);
    case "continuationCustody.readBootFacts":
      return {
        live: listContinuationRecordsInDatabase(db, { statuses: ["queued", "running"] }),
        awaitingImportOwners: listContinuationOwnersAwaitingImport(db),
      };
    case "continuationCustody.readLegacySnapshot":
      return preparedLegacyImport().readLegacyImportSnapshotInDatabase(db);
    case "continuationCustody.importLegacyOwner":
      return preparedLegacyImport().importLegacyOwnerInDatabase(database, command.input);
    case "continuationCustody.readOwedLegacyReleases":
      return readOwedLegacyReleases(db);
  }
  throw new Error("Unknown continuation custody command");
}
