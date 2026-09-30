// Doctor state migrations that move continuation custody off the retired
// TaskFlow `flow_runs` rows (RFC docs/design/continue-work-signal-v2.md
// §5.4.5; decision record Decisions 3 and 4). Continuation owns them; the
// Doctor state-migration owner runs them, in Doctor and at startup.
//
// Each owner session commits in one state transaction: its imported records,
// their source receipts, the Q6 scrub of inline bytes, the Q7 fence on every
// imported non-terminal source row, and the settlement of its pre-cutover
// post-compaction queue entries with at most one interrupted notice each.
// Attachment payloads move copy-first: the new-root file is written before the
// commit and the legacy file is deleted after it, so a crash at any point
// leaves either the untouched source or a complete import.
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
import type { MigrationMessages } from "../../../infra/state-migrations.types.js";
import type { OpenClawStateDatabase } from "../../../state/openclaw-state-db-contract.js";
import { withExistingOpenClawStateDatabaseReadOnly } from "../../../state/openclaw-state-db-readonly.js";
import type { DB as OpenClawStateKyselyDatabase } from "../../../state/openclaw-state-db.generated.js";
import { runOpenClawStateWriteTransaction } from "../../../state/openclaw-state-db.js";
import { ContinuationCustodyLifetimeEndedError } from "./custody-lifetime.js";
import {
  ensureContinuationCustodySchema,
  importContinuationRecordInDatabase,
  listContinuationRecordsInDatabase,
} from "./custody-store.worker.js";
import {
  describeInlineScrub,
  planLegacyRow,
  type ReceiptReport,
  type RowPlan,
} from "./legacy-taskflow-import-plan.js";
import { preparePayloads, releaseLegacyPayload } from "./legacy-taskflow-payloads.js";
import {
  CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID,
  RETIREABLE_DISPOSITIONS,
  flowReceiptKey,
  listContinuationOwnersAwaitingImport,
  queueEntryReceiptKey,
  readImportDispositions,
  readLegacyContinuationFlowRows,
  readPendingLegacyReleases,
  readPendingPostCompactionEntries,
  readSubagentRunsForChild,
  type LegacyContinuationFlowRow,
  type PendingPostCompactionEntry,
} from "./legacy-taskflow-source.js";
import { buildContinuationSpawnInterruptedNotice } from "./spawn-interrupted-notice.js";

export const CONTINUATION_TASKFLOW_SOURCE_RETIREMENT_STEP_ID =
  "continuation-taskflow-source-retirement";

type MigrationOptions = {
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /**
   * Gateway phase A binds the import to one database lifetime: this throws
   * `ContinuationCustodyLifetimeEndedError` once that lifetime has ended, and
   * the import then stops before its next write rather than writing old-lifetime
   * facts into a replacement database. Doctor runs without it.
   */
  assertCurrent?: () => void;
};

type OwnerSnapshot = {
  ownerSessionKey: string;
  rows: LegacyContinuationFlowRow[];
  entries: PendingPostCompactionEntry[];
};

type OwnerResult = {
  imported: number;
  retired: number;
  settledEntries: number;
  notices: number;
  warnings: string[];
  releaseLegacyAttachments: { attachmentId: string; flowId: string }[];
};

class OwnerSourceChangedError extends Error {
  constructor() {
    super("legacy continuation rows changed during the import; the owner is retried next run");
    this.name = "OwnerSourceChangedError";
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function stateOptions(env: NodeJS.ProcessEnv) {
  return { env };
}

type ImportDatabase = Pick<OpenClawStateKyselyDatabase, "flow_runs">;

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
  const contents = attachments.flatMap((item: unknown) =>
    typeof item === "object" &&
    item !== null &&
    typeof (item as { content?: unknown }).content === "string"
      ? [(item as { content: string }).content]
      : [],
  );
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

/** One owner session, one transaction (RFC §5.4.5, "Idempotency"). */
function importOwnerInTransaction(
  database: OpenClawStateDatabase,
  snapshot: OwnerSnapshot,
  payloads: ReadonlyMap<string, "copied" | "missing">,
  now: number,
): OwnerResult {
  const { db } = database;
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
  const ownerHasLiveCustodyWork = listContinuationRecordsInDatabase(db, {
    ownerSessionKey: owner,
    kinds: ["work"],
    statuses: ["queued", "running"],
  }).some((record) => record.cancelRequestedAt === undefined);
  const runId = `${CONTINUATION_TASKFLOW_CUSTODY_IMPORT_STEP_ID}:${sha256(owner).slice(0, 16)}:${now}`;
  const result: OwnerResult = {
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
      ...(payloads.has(row.flow_id) ? { payload: payloads.get(row.flow_id) } : {}),
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
function readOwnerSnapshots(env: NodeJS.ProcessEnv): {
  owners: OwnerSnapshot[];
  anomalies: number;
} {
  return (
    withExistingOpenClawStateDatabaseReadOnly(({ db }) => {
      const rows = readLegacyContinuationFlowRows(db);
      const entries = readPendingPostCompactionEntries(db).filter((entry) => entry.covered);
      const receipts = readImportDispositions(db, [
        ...rows.map((row) => flowReceiptKey(row.flow_id)),
        ...entries.map((entry) => queueEntryReceiptKey(entry.id)),
      ]);
      const owners = new Map<string, OwnerSnapshot>();
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
    }, stateOptions(env)) ?? { owners: [], anomalies: 0 }
  );
}

/** Our errors and SQLite's are structural; neither echoes stored content. */
function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * `continuation-taskflow-custody-import`: import live and obligation-bearing
 * continuation rows, retire-receipt terminal ones, and settle pre-cutover
 * post-compaction queue entries. A failed owner is a recorded warning; its
 * rows and legacy files stay for the next run, and the runtime keeps refusing
 * its custody writes until an import commits.
 */
export async function migrateContinuationTaskFlowCustody(
  options: MigrationOptions,
): Promise<MigrationMessages> {
  const { env } = options;
  const now = options.now ?? Date.now;
  const assertCurrent = options.assertCurrent ?? (() => {});
  const { owners, anomalies } = readOwnerSnapshots(env);
  const totals = { imported: 0, retired: 0, settledEntries: 0, notices: 0, failed: 0 };
  const warnings: string[] = [];
  if (owners.length > 0) {
    assertCurrent();
    ensureContinuationCustodySchema(stateOptions(env));
  }
  for (const snapshot of owners) {
    assertCurrent();
    let result: OwnerResult;
    try {
      const payloads = await preparePayloads(env, snapshot.rows, assertCurrent);
      const at = now();
      // Checked synchronously right before the synchronous owner transaction,
      // so no close can fall between the check and the write.
      assertCurrent();
      result = runOpenClawStateWriteTransaction(
        (database) => importOwnerInTransaction(database, snapshot, payloads, at),
        stateOptions(env),
        { operationLabel: "continuation.custody.legacy-import" },
      );
    } catch (error) {
      // An ended lifetime aborts the whole import; it is not an owner failure.
      if (error instanceof ContinuationCustodyLifetimeEndedError) {
        throw error;
      }
      totals.failed += 1;
      warnings.push(
        `Continuation custody import failed for one session and will be retried: ${describeFailure(error)}`,
      );
      continue;
    }
    for (const release of result.releaseLegacyAttachments) {
      try {
        await releaseLegacyPayload(env, release, assertCurrent);
      } catch (error) {
        if (error instanceof ContinuationCustodyLifetimeEndedError) {
          throw error;
        }
        // The receipt records the owed delete; the next import pass retries it.
      }
    }
    totals.imported += result.imported;
    totals.retired += result.retired;
    totals.settledEntries += result.settledEntries;
    totals.notices += result.notices;
    warnings.push(...result.warnings);
  }
  // Retry legacy deletes that an earlier commit owed but a crash or failure left behind.
  assertCurrent();
  const owedReleases =
    withExistingOpenClawStateDatabaseReadOnly(
      ({ db }) => readPendingLegacyReleases(db, env),
      stateOptions(env),
    ) ?? [];
  for (const release of owedReleases) {
    try {
      await releaseLegacyPayload(env, release, assertCurrent);
    } catch (error) {
      if (error instanceof ContinuationCustodyLifetimeEndedError) {
        throw error;
      }
      warnings.push(
        `A legacy continuation payload could not be deleted: ${describeFailure(error)}`,
      );
    }
  }
  if (anomalies > 0) {
    warnings.push(
      `${plural(anomalies, "continuation TaskFlow row")} had scrubbed attachment bytes but no import receipt; left untouched.`,
    );
  }
  const awaiting =
    withExistingOpenClawStateDatabaseReadOnly(
      ({ db }) => listContinuationOwnersAwaitingImport(db).length,
      stateOptions(env),
    ) ?? 0;
  if (awaiting > 0) {
    warnings.push(
      `Continuation custody for ${plural(awaiting, "session")} is waiting on legacy import; run \`openclaw doctor --fix\`.`,
    );
  }
  const changes: string[] = [];
  if (totals.imported > 0) {
    changes.push(
      `Imported ${plural(totals.imported, "continuation custody record")} from TaskFlow rows.`,
    );
  }
  if (totals.retired > 0) {
    changes.push(
      `Recorded ${plural(totals.retired, "terminal continuation TaskFlow row")} as retired.`,
    );
  }
  if (totals.settledEntries > 0) {
    changes.push(
      `Settled ${plural(totals.settledEntries, "pre-cutover post-compaction delegate entry")} without spawning.`,
    );
  }
  if (totals.notices > 0) {
    changes.push(`Queued ${plural(totals.notices, "delegate-spawn-interrupted notice")}.`);
  }
  return { changes, warnings };
}

type RetirementDatabase = Pick<OpenClawStateKyselyDatabase, "flow_runs">;

/**
 * `continuation-taskflow-source-retirement` (Decision 4, option a). Registered
 * only in the release where the importer retires (the downgrade-support
 * horizon); before that the fenced source rows are what a rollback reads.
 * It runs a final import pass, then deletes exactly the continuation rows a
 * committed `imported` or `retired-terminal` receipt names. Receipt-less rows
 * and every non-continuation row stay byte-identical.
 */
export async function retireContinuationTaskFlowSourceRows(
  options: MigrationOptions,
): Promise<MigrationMessages> {
  const { env } = options;
  const now = options.now ?? Date.now;
  const imported = await migrateContinuationTaskFlowCustody(options);
  const owners =
    withExistingOpenClawStateDatabaseReadOnly(
      ({ db }) =>
        [...new Set(readLegacyContinuationFlowRows(db).map((row) => row.owner_key))].toSorted(),
      stateOptions(env),
    ) ?? [];
  let deleted = 0;
  let residue = 0;
  const residueOwners = new Set<string>();
  const warnings = [...imported.warnings];
  const releases: { attachmentId: string; flowId: string }[] = [];
  for (const owner of owners) {
    const at = now();
    try {
      const outcome = runOpenClawStateWriteTransaction(
        ({ db }) => {
          const rows = readLegacyContinuationFlowRows(db, { ownerSessionKey: owner });
          const receipts = readImportDispositions(
            db,
            rows.map((row) => flowReceiptKey(row.flow_id)),
          );
          const retire = rows.filter((row) => {
            const disposition = receipts.get(flowReceiptKey(row.flow_id));
            return disposition !== undefined && RETIREABLE_DISPOSITIONS.has(disposition);
          });
          if (retire.length > 0) {
            executeSqliteQuerySync(
              db,
              getNodeSqliteKysely<RetirementDatabase>(db)
                .deleteFrom("flow_runs")
                .where(
                  "flow_id",
                  "in",
                  retire.map((row) => row.flow_id),
                ),
            );
            const runId = `${CONTINUATION_TASKFLOW_SOURCE_RETIREMENT_STEP_ID}:${sha256(owner).slice(0, 16)}:${at}`;
            const sourceKeys = retire.map((row) => flowReceiptKey(row.flow_id));
            const report = JSON.stringify({ deleted: retire.length, sourceKeys });
            recordLegacyMigrationRun(db, {
              runId,
              startedAt: at,
              finishedAt: at,
              status: "completed",
              reportJson: report,
              upsert: true,
            });
            recordLegacyMigrationSource(db, {
              sourceKey: `${CONTINUATION_TASKFLOW_SOURCE_RETIREMENT_STEP_ID}:${runId}`,
              migrationKind: CONTINUATION_TASKFLOW_SOURCE_RETIREMENT_STEP_ID,
              sourcePath: "flow_runs",
              targetTable: "flow_runs",
              sourceSha256: sha256(sourceKeys.join("\n")),
              sourceSizeBytes: null,
              sourceRecordCount: retire.length,
              runId,
              status: "completed",
              importedAt: at,
              reportJson: report,
            });
          }
          return {
            deleted: retire.length,
            residue: rows.length - retire.length,
            releases: retire.flatMap((row) => {
              const attachmentId =
                row.state_json === null
                  ? undefined
                  : safeParseJsonRecord(row.state_json)?.attachmentId;
              return typeof attachmentId === "string"
                ? [{ attachmentId, flowId: row.flow_id }]
                : [];
            }),
          };
        },
        stateOptions(env),
        { operationLabel: "continuation.custody.legacy-retirement" },
      );
      deleted += outcome.deleted;
      residue += outcome.residue;
      releases.push(...outcome.releases);
      if (outcome.residue > 0) {
        residueOwners.add(owner);
      }
    } catch (error) {
      warnings.push(
        `Continuation TaskFlow source retirement failed for one session and will be retried: ${describeFailure(error)}`,
      );
    }
  }
  for (const release of releases) {
    try {
      await releaseLegacyPayload(env, release);
    } catch {
      // A leftover legacy file is unreferenced; nothing reads the legacy root.
    }
  }
  if (residue > 0) {
    warnings.push(
      `${plural(residue, "continuation TaskFlow row")} in ${plural(residueOwners.size, "session")} ${residue === 1 ? "has" : "have"} no import receipt and ${residue === 1 ? "was" : "were"} left in place.`,
    );
  }
  return {
    changes: [
      ...imported.changes,
      ...(deleted > 0
        ? [`Deleted ${plural(deleted, "receipt-proven continuation TaskFlow row")}.`]
        : []),
    ],
    warnings,
  };
}
