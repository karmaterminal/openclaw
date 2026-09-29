// Read side of the continuation TaskFlow custody import (RFC
// docs/design/continue-work-signal-v2.md §5.4.5). After the TaskFlow removal
// nothing in the runtime reads `flow_runs`; the Doctor import and, at the
// downgrade-support horizon, the source-retirement step are its only readers.
// Receipts, not imported records, are the authority for what was examined:
// retention may prune an imported record, never its receipt.
import type { DatabaseSync } from "node:sqlite";
import { safeParseJsonRecord } from "@openclaw/normalization-core";
import type { Selectable } from "kysely";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../../../infra/kysely-sync.js";
import { SESSION_DELIVERY_QUEUE_NAME } from "../../../infra/session-delivery-queue.records.js";
import {
  withExistingOpenClawStateDatabaseArtifactPreservingReadOnly,
  withExistingOpenClawStateDatabaseReadOnly,
} from "../../../state/openclaw-state-db-readonly.js";
import { tableExists } from "../../../state/openclaw-state-db-schema-helpers.js";
import type {
  DB as OpenClawStateKyselyDatabase,
  FlowRuns,
} from "../../../state/openclaw-state-db.generated.js";
import type { ContinuationRecordKind } from "./custody-store.types.js";

export const CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID = "continuation-taskflow-custody-import";

/** Detection predicate: managed rows under the three continuation controllers. */
const LEGACY_CONTROLLER_KINDS: Readonly<Record<string, ContinuationRecordKind>> = {
  "core/continuation-work": "work",
  "core/continuation-delegate": "delegate",
  "core/continuation-post-compaction": "post_compaction",
};

export type LegacyImportDisposition =
  | "imported"
  | "retired-terminal"
  | "interrupted-pre-cutover-entry"
  | "delivered-pre-cutover-entry";

const DISPOSITIONS: ReadonlySet<string> = new Set<LegacyImportDisposition>([
  "imported",
  "retired-terminal",
  "interrupted-pre-cutover-entry",
  "delivered-pre-cutover-entry",
]);

/** A committed receipt whose disposition cannot be read still proves examination, never retirement. */
export type ReceiptDisposition = LegacyImportDisposition | "unreadable";

/** Dispositions that prove a `flow_runs` row was examined and may be retired. */
export const RETIREABLE_DISPOSITIONS: ReadonlySet<ReceiptDisposition> = new Set([
  "imported",
  "retired-terminal",
]);

export type LegacyContinuationFlowRow = Selectable<FlowRuns> & { kind: ContinuationRecordKind };

/** A pending `postCompactionDelegate` session-queue entry, as stored. */
export type PendingPostCompactionEntry = {
  id: string;
  sessionKey: string;
  /** Exact stored JSON: the settlement write is a CAS against it. */
  entryJson: string;
  entry: Record<string, unknown>;
  /**
   * C-era entry that no custody record owns: no `childRunId`, and no recorded
   * settlement for the queue's own recovery to finalize without delivering.
   */
  covered: boolean;
};

type SourceDatabase = Pick<
  OpenClawStateKyselyDatabase,
  "flow_runs" | "migration_sources" | "delivery_queue_entries" | "subagent_runs"
>;

function sourceDb(db: DatabaseSync) {
  return getNodeSqliteKysely<SourceDatabase>(db);
}

export function flowReceiptKey(flowId: string): string {
  return `${CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID}:flow:${flowId}`;
}

export function queueEntryReceiptKey(entryId: string): string {
  return `${CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID}:queue-entry:${entryId}`;
}

export function isTerminalLegacyStatus(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/** Candidate rows, FIFO by creation, optionally for one owner. */
export function readLegacyContinuationFlowRows(
  db: DatabaseSync,
  query: { ownerSessionKey?: string } = {},
): LegacyContinuationFlowRow[] {
  if (!tableExists(db, "flow_runs")) {
    return [];
  }
  let select = sourceDb(db)
    .selectFrom("flow_runs")
    .selectAll()
    .where("sync_mode", "=", "managed")
    .where("controller_id", "in", Object.keys(LEGACY_CONTROLLER_KINDS));
  if (query.ownerSessionKey !== undefined) {
    select = select.where("owner_key", "=", query.ownerSessionKey);
  }
  return executeSqliteQuerySync(db, select.orderBy("created_at").orderBy("flow_id")).rows.map(
    (row) =>
      Object.assign(row, {
        // SAFETY: the query selected only the three continuation controller IDs.
        kind: LEGACY_CONTROLLER_KINDS[row.controller_id as string]!,
      }),
  );
}

/** Committed dispositions for the given receipt keys; a key without a receipt is absent. */
export function readImportDispositions(
  db: DatabaseSync,
  sourceKeys: readonly string[],
): Map<string, ReceiptDisposition> {
  const dispositions = new Map<string, ReceiptDisposition>();
  if (sourceKeys.length === 0 || !tableExists(db, "migration_sources")) {
    return dispositions;
  }
  for (let offset = 0; offset < sourceKeys.length; offset += 500) {
    const rows = executeSqliteQuerySync(
      db,
      sourceDb(db)
        .selectFrom("migration_sources")
        .select(["source_key", "report_json"])
        .where("migration_kind", "=", CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID)
        .where("source_key", "in", sourceKeys.slice(offset, offset + 500)),
    ).rows;
    for (const row of rows) {
      const disposition = safeParseJsonRecord(row.report_json)?.disposition;
      dispositions.set(
        row.source_key,
        typeof disposition === "string" && DISPOSITIONS.has(disposition)
          ? // SAFETY: membership in DISPOSITIONS was checked above.
            (disposition as LegacyImportDisposition)
          : "unreadable",
      );
    }
  }
  return dispositions;
}

/**
 * Pending `postCompactionDelegate` entries (RFC §5.4.5, "Pre-cutover queue
 * entries"). An entry with no `childRunId` was enqueued by a C-era build and
 * is `covered` unless it already records a settlement, which the queue's own
 * recovery finalizes without delivering. Unparseable entries stay with the
 * queue's invalid-entry handling.
 */
export function readPendingPostCompactionEntries(
  db: DatabaseSync,
  query: { sessionKey?: string } = {},
): PendingPostCompactionEntry[] {
  if (!tableExists(db, "delivery_queue_entries")) {
    return [];
  }
  let select = sourceDb(db)
    .selectFrom("delivery_queue_entries")
    .select(["id", "entry_json"])
    .where("queue_name", "=", SESSION_DELIVERY_QUEUE_NAME)
    .where("status", "=", "pending")
    .where("entry_kind", "=", "postCompactionDelegate");
  if (query.sessionKey !== undefined) {
    select = select.where("session_key", "=", query.sessionKey);
  }
  const entries: PendingPostCompactionEntry[] = [];
  for (const row of executeSqliteQuerySync(db, select.orderBy("enqueued_at").orderBy("id")).rows) {
    const entry = safeParseJsonRecord(row.entry_json);
    if (
      entry?.kind !== "postCompactionDelegate" ||
      typeof entry.sessionKey !== "string" ||
      entry.sessionKey.length === 0
    ) {
      continue;
    }
    entries.push({
      id: row.id,
      sessionKey: entry.sessionKey,
      entryJson: row.entry_json,
      entry,
      covered:
        !("childRunId" in entry) &&
        entry.settlementOutcome === undefined &&
        entry.acknowledgedAt === undefined,
    });
  }
  return entries;
}

/** `subagent_runs` rows under one child session key (C's derived continuation key). */
export function readSubagentRunsForChild(
  db: DatabaseSync,
  childSessionKey: string,
): { runId: string; childSessionKey: string; requesterSessionKey: string }[] {
  if (!tableExists(db, "subagent_runs")) {
    return [];
  }
  return executeSqliteQuerySync(
    db,
    sourceDb(db)
      .selectFrom("subagent_runs")
      .select(["run_id", "child_session_key", "requester_session_key"])
      .where("child_session_key", "=", childSessionKey)
      .orderBy("run_id"),
  ).rows.map((row) => ({
    runId: row.run_id,
    childSessionKey: row.child_session_key,
    requesterSessionKey: row.requester_session_key,
  }));
}

/** A receipt-less row is owed an import pass if it is live or still owes a notice. */
function owesImport(row: LegacyContinuationFlowRow): boolean {
  if (!isTerminalLegacyStatus(row.status)) {
    return true;
  }
  if (row.kind !== "work" || row.status !== "failed" || row.state_json === null) {
    return false;
  }
  return safeParseJsonRecord(row.state_json)?.terminalNoticePending !== undefined;
}

/**
 * Owners whose live or obligation-bearing rows have no committed receipt. The
 * runtime refuses custody writes for these owners until an import commits,
 * so an election can never bypass the owner condition over un-imported rows.
 */
export function listContinuationOwnersAwaitingImport(db: DatabaseSync): string[] {
  const rows = readLegacyContinuationFlowRows(db);
  const receipts = readImportDispositions(
    db,
    rows.map((row) => flowReceiptKey(row.flow_id)),
  );
  const owners = new Set<string>();
  for (const row of rows) {
    if (!receipts.has(flowReceiptKey(row.flow_id)) && owesImport(row)) {
      owners.add(row.owner_key);
    }
  }
  return [...owners].toSorted();
}

export type ContinuationTaskFlowImportDetection = {
  hasLegacy: boolean;
  /** Receipt-less candidate rows plus covered pre-cutover queue entries. */
  pendingSources: number;
};

/** Read-only Doctor detection; an absent state database has nothing to import. */
export function detectContinuationTaskFlowCustodyImport(params: {
  env: NodeJS.ProcessEnv;
  artifactPreservingReadOnly?: boolean;
}): ContinuationTaskFlowImportDetection {
  const read = params.artifactPreservingReadOnly
    ? withExistingOpenClawStateDatabaseArtifactPreservingReadOnly
    : withExistingOpenClawStateDatabaseReadOnly;
  const pendingSources =
    read(
      ({ db }) => {
        const rows = readLegacyContinuationFlowRows(db);
        const receipts = readImportDispositions(
          db,
          rows.map((row) => flowReceiptKey(row.flow_id)),
        );
        const unexamined = rows.filter((row) => !receipts.has(flowReceiptKey(row.flow_id)));
        return (
          unexamined.length +
          readPendingPostCompactionEntries(db).filter((entry) => entry.covered).length
        );
      },
      { env: params.env },
    ) ?? 0;
  return { hasLegacy: pendingSources > 0, pendingSources };
}
