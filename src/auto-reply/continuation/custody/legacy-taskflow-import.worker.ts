// Shared-state worker side of the continuation TaskFlow custody import (RFC
// docs/design/continue-work-signal-v2.md §5.4.5; decision record Decisions 3
// and 4). The custody dispatcher (custody-store.worker.ts) runs each operation
// here as one state write transaction under the host's BEGIN and COMMIT
// admission; legacy-taskflow-import.ts orchestrates them and owns the payload
// files.
//
// Each owner session commits in one state transaction: its imported records,
// their source receipts, the Q6 scrub of inline bytes, the Q7 fence on every
// imported non-terminal source row, and the settlement of its pre-cutover
// post-compaction queue entries with at most one interrupted notice each.
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { safeParseJsonRecord } from "@openclaw/normalization-core";
import { deriveContinuationDelegateChildSessionKeyFromParent } from "../../../agents/subagent-continuation-ids.js";
import {
  terminalizeBoundDeliveryQueueEntry,
  upsertBoundDeliveryQueueEntryInDatabase,
} from "../../../infra/delivery-queue-sqlite-bound.js";
import { completeLoadedDeliveryQueueEntryInDatabase } from "../../../infra/delivery-queue-sqlite.kernel.js";
import {
  projectDeliveryQueueTerminalEntry,
  type DeliveryQueueEntryState,
} from "../../../infra/delivery-queue-sqlite.types.js";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../../../infra/kysely-sync.js";
import { prepareSessionDeliveryEnqueue } from "../../../infra/session-delivery-queue-storage.js";
import { SESSION_DELIVERY_QUEUE_NAME } from "../../../infra/session-delivery-queue.records.js";
import {
  recordLegacyMigrationRun,
  recordLegacyMigrationSource,
} from "../../../infra/state-migrations.receipts.js";
import type { OpenClawStateDatabase } from "../../../state/openclaw-state-db-contract.js";
import type { DB as OpenClawStateKyselyDatabase } from "../../../state/openclaw-state-db.generated.js";
import { isTerminalContinuationStatus } from "./custody-record-codec.js";
import {
  insertRecord,
  readRecord,
  selectRecords,
  validateNewRecord,
} from "./custody-store.kernel.js";
import type { ContinuationRecord } from "./custody-store.types.js";
import {
  describeInlineScrub,
  planLegacyRow,
  type ReceiptReport,
  type RowPlan,
} from "./legacy-taskflow-import-plan.js";
import type {
  LegacyImportOwnerResult,
  LegacyImportOwnerSnapshot,
  LegacyImportPayloadOutcomes,
} from "./legacy-taskflow-import.worker-contract.js";
import {
  CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID,
  flowReceiptKey,
  queueEntryReceiptKey,
  readImportDispositions,
  readLegacyContinuationFlowRows,
  readPendingPostCompactionEntries,
  readSubagentRunsForChild,
  type LegacyContinuationFlowRow,
  type PendingPostCompactionEntry,
} from "./legacy-taskflow-migration-source.js";
import { buildContinuationSpawnInterruptedNotice } from "./spawn-interrupted-notice.js";

class OwnerSourceChangedError extends Error {
  constructor() {
    super("legacy continuation rows changed during the import; the owner is retried next run");
    this.name = "OwnerSourceChangedError";
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

type ImportDatabase = Pick<OpenClawStateKyselyDatabase, "flow_runs">;

/**
 * Insert-if-absent of a complete record carried over from a legacy source.
 * Unlike a create, the import supplies status, revision and clocks exactly, so
 * it keeps `created_at` (the delegate due-time base) and the source revision.
 * An existing record ID is never overwritten.
 */
function importContinuationRecordInDatabase(
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

/** Q6 scrub and Q7 fence are one CAS write against the exact row the plan was made from. */
function writeSourceRow(
  db: DatabaseSync,
  row: LegacyContinuationFlowRow,
  plan: RowPlan,
  now: number,
) {
  if (plan.scrubbedStateJson === undefined && !plan.fence) {
    return;
  }
  const result = executeSqliteQuerySync(
    db,
    getNodeSqliteKysely<ImportDatabase>(db)
      .updateTable("flow_runs")
      .set({
        ...(plan.scrubbedStateJson !== undefined ? { state_json: plan.scrubbedStateJson } : {}),
        ...(plan.fence ? { cancel_requested_at: now } : {}),
      })
      .where("flow_id", "=", row.flow_id)
      .where("revision", "=", row.revision)
      .where("updated_at", "=", row.updated_at)
      .where((eb) =>
        eb.and([
          row.state_json === null
            ? eb("state_json", "is", null)
            : eb("state_json", "=", row.state_json),
          row.cancel_requested_at === null
            ? eb("cancel_requested_at", "is", null)
            : eb("cancel_requested_at", "=", row.cancel_requested_at),
        ]),
      ),
  );
  if (Number(result.numAffectedRows ?? 0n) !== 1) {
    throw new OwnerSourceChangedError();
  }
}

function enqueueNotice(
  database: OpenClawStateDatabase,
  notice: Parameters<typeof buildContinuationSpawnInterruptedNotice>[0],
  now: number,
): void {
  const { bound } = prepareSessionDeliveryEnqueue(
    buildContinuationSpawnInterruptedNotice(notice),
    now,
  );
  // Insert-if-absent under the source-derived key: a replay or the drain
  // backstop collapses onto this one row, so the notice stays single.
  upsertBoundDeliveryQueueEntryInDatabase(bound, database);
}

/**
 * Settle one covered pre-cutover entry without spawning (Q3, terminalize-all).
 * An admitted child owned by the entry's session settles it as delivered; any
 * other outcome is one notice and a failed entry that keeps its identity.
 */
function settleCoveredEntry(
  database: OpenClawStateDatabase,
  entry: PendingPostCompactionEntry,
  now: number,
): { report: ReceiptReport; notice: boolean } {
  const sourceFlowId =
    typeof entry.entry.sourceFlowId === "string" ? entry.entry.sourceFlowId : undefined;
  const registry = readSubagentRunsForChild(
    database.db,
    deriveContinuationDelegateChildSessionKeyFromParent(entry.sessionKey, sourceFlowId ?? entry.id),
  );
  const attachments = Array.isArray(entry.entry.attachments) ? entry.entry.attachments : [];
  const contents = attachments.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    // SAFETY: item is a non-null object; only its `content` property is read.
    const content = (item as { content?: unknown }).content;
    return typeof content === "string" ? [content] : [];
  });
  const structure = {
    kind: "postCompactionDelegate",
    attachmentCount: attachments.length,
    attachmentSha256: contents.map(sha256),
    entryBytes: Buffer.byteLength(entry.entryJson),
  };
  if (registry.some((row) => row.requesterSessionKey === entry.sessionKey)) {
    completeLoadedDeliveryQueueEntryInDatabase(
      database,
      SESSION_DELIVERY_QUEUE_NAME,
      entry.id,
      // SAFETY: the stored entry JSON is the delivery-queue entry state.
      entry.entry as DeliveryQueueEntryState,
      now,
    );
    return { report: { disposition: "delivered-pre-cutover-entry", ...structure }, notice: false };
  }
  enqueueNotice(
    database,
    {
      sessionKey: entry.sessionKey,
      source: { kind: "queue-entry", entryId: entry.id },
      task: typeof entry.entry.task === "string" ? entry.entry.task : "",
    },
    now,
  );
  const pick = (key: string) => (entry.entry[key] !== undefined ? { [key]: entry.entry[key] } : {});
  const failedEntry: DeliveryQueueEntryState = {
    ...projectDeliveryQueueTerminalEntry(
      { id: entry.id, retryCount: Number(entry.entry.retryCount ?? 0) },
      now,
      "failed",
      "permanent",
    ),
    // Evidence without content: identity and retry metadata, no task or attachment bytes.
    ...pick("idempotencyKey"),
    ...pick("sourceFlowId"),
    ...pick("sourceExpectedRevision"),
    ...pick("lastAttemptAt"),
    ...pick("lastError"),
    enqueuedAt: Number(entry.entry.enqueuedAt ?? now),
  };
  if (
    !terminalizeBoundDeliveryQueueEntry(
      database.db,
      SESSION_DELIVERY_QUEUE_NAME,
      entry.id,
      entry.entryJson,
      failedEntry,
      now,
    )
  ) {
    throw new OwnerSourceChangedError();
  }
  return {
    report: {
      disposition: "interrupted-pre-cutover-entry",
      ...structure,
      ...(registry.length > 0 ? { registryCollision: true } : {}),
    },
    notice: true,
  };
}

function recordSource(
  db: DatabaseSync,
  params: {
    runId: string;
    sourceKey: string;
    sourcePath: string;
    targetTable: string;
    sourceBytes: string;
    report: ReceiptReport;
    now: number;
  },
): void {
  recordLegacyMigrationSource(db, {
    sourceKey: params.sourceKey,
    migrationKind: CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID,
    sourcePath: params.sourcePath,
    targetTable: params.targetTable,
    sourceSha256: sha256(params.sourceBytes),
    sourceSizeBytes: Buffer.byteLength(params.sourceBytes),
    sourceRecordCount: 1,
    runId: params.runId,
    status: "completed",
    importedAt: params.now,
    reportJson: JSON.stringify(params.report),
  });
}

/**
 * One owner session, one transaction (RFC §5.4.5, "Idempotency"). The custody
 * dispatcher ensured the custody table before this transaction began.
 */
export function importLegacyOwnerInDatabase(
  database: OpenClawStateDatabase,
  input: {
    snapshot: LegacyImportOwnerSnapshot;
    payloads: LegacyImportPayloadOutcomes;
    now: number;
  },
): LegacyImportOwnerResult {
  const { db } = database;
  const { snapshot, payloads, now } = input;
  const owner = snapshot.ownerSessionKey;
  // Reread the authoritative rows: anything that moved since planning is retried next run.
  const current = new Map(
    readLegacyContinuationFlowRows(db, { ownerSessionKey: owner }).map((row) => [row.flow_id, row]),
  );
  const receipts = readImportDispositions(db, [
    ...snapshot.rows.map((row) => flowReceiptKey(row.flow_id)),
    ...snapshot.entries.map((entry) => queueEntryReceiptKey(entry.id)),
  ]);
  if (
    receipts.size > 0 ||
    snapshot.rows.some((row) => !isDeepStrictEqual(current.get(row.flow_id), row))
  ) {
    throw new OwnerSourceChangedError();
  }
  const pending = readPendingPostCompactionEntries(db, { sessionKey: owner });
  if (
    !isDeepStrictEqual(
      pending.filter((entry) => entry.covered),
      snapshot.entries,
    )
  ) {
    throw new OwnerSourceChangedError();
  }
  const ownerHasLiveCustodyWork = selectRecords(db, {
    ownerSessionKey: owner,
    kinds: ["work"],
    statuses: ["queued", "running"],
  }).some((record) => record.cancelRequestedAt === undefined);
  const runId = `${CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID}:${sha256(owner).slice(0, 16)}:${now}`;
  const result: LegacyImportOwnerResult = {
    imported: 0,
    retired: 0,
    settledEntries: 0,
    notices: 0,
    warnings: [],
    releaseLegacyAttachments: [],
  };
  recordLegacyMigrationRun(db, {
    runId,
    startedAt: now,
    finishedAt: now,
    status: "completed",
    reportJson: JSON.stringify({ rows: snapshot.rows.length, entries: snapshot.entries.length }),
    upsert: true,
  });
  const sourcePath = `${database.path}#flow_runs`;
  for (const row of snapshot.rows) {
    const queueEntry = pending.find(
      (entry) => entry.entry.sourceFlowId === row.flow_id && entry.sessionKey === owner,
    );
    const payload = payloads[row.flow_id];
    const plan = planLegacyRow(row, {
      ...(queueEntry ? { queueEntryId: queueEntry.id } : {}),
      // C spawned every delegate kind under this derived child key, so a
      // claimed ordinary or post-compaction row is adopted from the same proof.
      registry:
        row.kind === "work"
          ? []
          : readSubagentRunsForChild(
              db,
              deriveContinuationDelegateChildSessionKeyFromParent(owner, row.flow_id),
            ),
      ownerHasLiveCustodyWork,
      ...(payload ? { payload } : {}),
      now,
    });
    if (plan.record && importContinuationRecordInDatabase(db, plan.record) === "exists") {
      plan.report = { ...plan.report, recordExisted: true };
    }
    writeSourceRow(db, row, plan, now);
    if (plan.interruptedNotice) {
      enqueueNotice(
        database,
        {
          sessionKey: owner,
          source: { kind: "record", recordId: row.flow_id, childRunIds: [] },
          task: plan.interruptedNotice.task,
        },
        now,
      );
      result.notices += 1;
    }
    if (plan.report.rollbackElectionConflict === true) {
      result.warnings.push(
        "A continuation work row created during a rollback conflicted with a live election; it was imported as failed with a notice.",
      );
    }
    recordSource(db, {
      runId,
      sourceKey: flowReceiptKey(row.flow_id),
      sourcePath,
      targetTable: "continuation_records",
      sourceBytes: row.state_json ?? "",
      report: plan.report,
      now,
    });
    if (plan.releaseLegacyAttachmentId) {
      result.releaseLegacyAttachments.push({
        attachmentId: plan.releaseLegacyAttachmentId,
        flowId: row.flow_id,
      });
    }
    if (plan.disposition === "imported") {
      result.imported += 1;
    } else {
      result.retired += 1;
    }
  }
  for (const entry of snapshot.entries) {
    const settled = settleCoveredEntry(database, entry, now);
    recordSource(db, {
      runId,
      sourceKey: queueEntryReceiptKey(entry.id),
      sourcePath: `${database.path}#delivery_queue_entries`,
      targetTable: "delivery_queue_entries",
      sourceBytes: entry.entryJson,
      report: settled.report,
      now,
    });
    result.settledEntries += 1;
    result.notices += settled.notice ? 1 : 0;
  }
  return result;
}

/** Receipt-less work for every owner, read before any copy or write. */
export function readLegacyImportSnapshotInDatabase(db: DatabaseSync): {
  owners: LegacyImportOwnerSnapshot[];
  anomalies: number;
} {
  const rows = readLegacyContinuationFlowRows(db);
  const entries = readPendingPostCompactionEntries(db).filter((entry) => entry.covered);
  const receipts = readImportDispositions(db, [
    ...rows.map((row) => flowReceiptKey(row.flow_id)),
    ...entries.map((entry) => queueEntryReceiptKey(entry.id)),
  ]);
  const owners = new Map<string, LegacyImportOwnerSnapshot>();
  const ownerOf = (key: string) => {
    let owner = owners.get(key);
    if (!owner) {
      owner = { ownerSessionKey: key, rows: [], entries: [] };
      owners.set(key, owner);
    }
    return owner;
  };
  let anomalies = 0;
  for (const row of rows) {
    if (receipts.has(flowReceiptKey(row.flow_id))) {
      continue;
    }
    // Scrub and receipt share one commit, so a scrubbed row without a
    // receipt is a structural anomaly: report it and never touch it.
    const parsed = row.state_json === null ? undefined : safeParseJsonRecord(row.state_json);
    if (describeInlineScrub(parsed)?.alreadyScrubbed === true) {
      anomalies += 1;
      continue;
    }
    ownerOf(row.owner_key).rows.push(row);
  }
  for (const entry of entries) {
    if (!receipts.has(queueEntryReceiptKey(entry.id))) {
      ownerOf(entry.sessionKey).entries.push(entry);
    }
  }
  return {
    owners: [...owners.values()].toSorted((a, b) =>
      a.ownerSessionKey.localeCompare(b.ownerSessionKey),
    ),
    anomalies,
  };
}
