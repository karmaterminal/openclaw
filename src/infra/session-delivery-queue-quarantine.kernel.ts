// Reversible operator quarantine for durable session-delivery rows.
//
// `moveSessionDeliveryToFailed` is a terminal transition: it either deletes the row or compacts
// it to a payload-free tombstone, so it cannot be undone. Operator quarantine must be reversible,
// so it parks the exact pending row as `failed` with its payload, routing columns and enqueue
// time intact, and only the matching requeue returns it to `pending`.
import { safeParseJsonRecord } from "@openclaw/normalization-core";
import type { OpenClawStateDatabase } from "../state/openclaw-state-db-contract.js";
import { sha256Hex } from "./crypto-digest.js";
import type { DeliveryQueueDatabase } from "./delivery-queue-sqlite-bound.js";
import {
  isOperatorQuarantineError,
  OPERATOR_QUARANTINE_ERROR_PREFIX,
} from "./delivery-queue-sqlite.types.js";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "./kysely-sync.js";
import { SESSION_DELIVERY_QUEUE_NAME } from "./session-delivery-queue.records.js";
import { normalizeSqliteNumber } from "./sqlite-number.js";
import { runSqliteImmediateTransactionSync } from "./sqlite-transaction.js";

/** Failed-reason prefix owned by operator quarantine; requeue only accepts rows carrying it. */
export const SESSION_DELIVERY_QUARANTINE_REASON_PREFIX = OPERATOR_QUARANTINE_ERROR_PREFIX;

export type SessionDeliveryInspectStatus = "pending" | "failed";

/** Operator-safe row summary: carries text length only, never message text or payload. */
export type SessionDeliverySummary = {
  id: string;
  status: SessionDeliveryInspectStatus;
  entryKind: string | null;
  sessionKey: string | null;
  idempotencyKey: string | null;
  enqueuedAt: number;
  retryCount: number;
  lastAttemptAt: number | null;
  failedAt: number | null;
  textLength: number | null;
  /** Set only for rows parked by operator quarantine. */
  quarantineReason: string | null;
  /** Digest of the stored entry; batch transitions refuse rows changed since selection. */
  entryDigest: string;
  /** Why quarantine would refuse this row (shared predicate), or null when eligible. */
  quarantineBlocker: string | null;
  /** Why requeue would refuse this row (shared predicate), or null when eligible. */
  requeueBlocker: string | null;
};

export type SessionDeliveryBatchAction = "quarantine" | "requeue";

type EligibilityRow = {
  status: string;
  recovery_state: string | null;
  last_error: string | null;
  entry_json: string;
};

/**
 * The single eligibility rule for operator transitions. The CLI applies it to its selection
 * and the batch transaction re-applies it to every row, so a dry run predicts `--apply` exactly.
 */
export function resolveSessionDeliveryIneligibility(
  action: SessionDeliveryBatchAction,
  row: EligibilityRow | undefined,
): string | null {
  if (!row) {
    return "not found in the session delivery queue";
  }
  if (action === "quarantine" && row.status !== "pending") {
    return `not a pending session delivery (status ${row.status})`;
  }
  if (action === "requeue" && (row.status !== "failed" || !isOperatorQuarantine(row.last_error))) {
    return `not quarantined by sessions deliveries quarantine (status ${row.status})`;
  }
  if (row.recovery_state !== null) {
    return `owned by recovery settlement (recovery state ${row.recovery_state})`;
  }
  const entry = safeParseJsonRecord(row.entry_json);
  if (!entry) {
    return "has no decodable retained payload";
  }
  // Settlement-pending rows must be finalized by recovery, never parked or replayed by hand.
  if (entry.settlementOutcome !== undefined || entry.acknowledgedAt !== undefined) {
    return "owned by recovery settlement (settlement or acknowledgement recorded)";
  }
  return null;
}

export type SessionDeliveryBatchRefusal = { id: string; reason: string };

/** Thrown when any row in a batch is ineligible; the whole transaction rolled back. */
export class SessionDeliveryBatchRefusedError extends Error {
  readonly code = "SESSION_DELIVERY_BATCH_REFUSED";
  constructor(
    readonly action: SessionDeliveryBatchAction,
    readonly refusals: readonly SessionDeliveryBatchRefusal[],
  ) {
    super(formatSessionDeliveryBatchRefusal(action, refusals));
    this.name = "SessionDeliveryBatchRefusedError";
  }
}

export function formatSessionDeliveryBatchRefusal(
  action: SessionDeliveryBatchAction,
  refusals: readonly SessionDeliveryBatchRefusal[],
): string {
  return `Refusing sessions deliveries ${action}; nothing was changed. ${refusals
    .map(({ id, reason }) => `${id}: ${reason}`)
    .join("; ")}`;
}

export type SessionDeliveryBatchEntry = { id: string; entryDigest?: string };

/** Test-only seam: runs inside the transaction just before each row's UPDATE. Defaults to no-op. */
export type SessionDeliveryBatchHooks = {
  beforeRowTransition?: (id: string, index: number) => void;
};

function queueDb(database: OpenClawStateDatabase) {
  return getNodeSqliteKysely<DeliveryQueueDatabase>(database.db);
}

function selectRow(database: OpenClawStateDatabase, id: string) {
  return executeSqliteQueryTakeFirstSync(
    database.db,
    queueDb(database)
      .selectFrom("delivery_queue_entries")
      .select(["id", "status", "entry_json", "last_error", "recovery_state"])
      .where("queue_name", "=", SESSION_DELIVERY_QUEUE_NAME)
      .where("id", "=", id),
  );
}

function resolveTextLength(entry: Record<string, unknown> | null): number | null {
  const field =
    entry?.kind === "systemEvent"
      ? entry.text
      : entry?.kind === "agentTurn"
        ? entry.message
        : entry?.kind === "postCompactionDelegate"
          ? entry.task
          : undefined;
  return typeof field === "string" ? field.length : null;
}

function isOperatorQuarantine(lastError: string | null): lastError is string {
  return isOperatorQuarantineError(lastError);
}

/** Summarize session-queue rows in enqueue order without exposing any payload text. */
export function listSessionDeliverySummariesInDatabase(
  database: OpenClawStateDatabase,
  statuses: readonly SessionDeliveryInspectStatus[],
): SessionDeliverySummary[] {
  if (statuses.length === 0) {
    return [];
  }
  const rows = executeSqliteQuerySync(
    database.db,
    queueDb(database)
      .selectFrom("delivery_queue_entries")
      .select([
        "id",
        "status",
        "entry_kind",
        "session_key",
        "entry_json",
        "enqueued_at",
        "retry_count",
        "last_attempt_at",
        "last_error",
        "failed_at",
        "recovery_state",
      ])
      .where("queue_name", "=", SESSION_DELIVERY_QUEUE_NAME)
      .where("status", "in", [...statuses])
      .orderBy("enqueued_at", "asc")
      .orderBy("id", "asc"),
  ).rows;
  return rows.map((row) => {
    const entry = safeParseJsonRecord(row.entry_json) ?? null;
    const idempotencyKey = entry?.idempotencyKey;
    return {
      id: row.id,
      status: row.status as SessionDeliveryInspectStatus,
      entryKind: row.entry_kind ?? null,
      sessionKey: row.session_key ?? null,
      idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : null,
      enqueuedAt: normalizeSqliteNumber(row.enqueued_at) ?? 0,
      retryCount: normalizeSqliteNumber(row.retry_count) ?? 0,
      lastAttemptAt: normalizeSqliteNumber(row.last_attempt_at) ?? null,
      failedAt: normalizeSqliteNumber(row.failed_at) ?? null,
      textLength: resolveTextLength(entry),
      quarantineReason:
        row.status === "failed" && isOperatorQuarantine(row.last_error) ? row.last_error : null,
      entryDigest: sha256Hex(row.entry_json),
      quarantineBlocker: resolveSessionDeliveryIneligibility("quarantine", row),
      requeueBlocker: resolveSessionDeliveryIneligibility("requeue", row),
    };
  });
}

/**
 * Validate every selected row, then transition all of them, inside one IMMEDIATE transaction.
 * Any ineligible or changed row refuses the whole batch and rolls back, so nothing changes.
 */
function transitionSessionDeliveryBatch(
  database: OpenClawStateDatabase,
  action: SessionDeliveryBatchAction,
  entries: readonly SessionDeliveryBatchEntry[],
  transition: (row: EligibilityRow & { id: string }) => boolean,
  hooks: SessionDeliveryBatchHooks,
): void {
  const ids = entries.map((entry) => entry.id);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error(`Session delivery ${action} batch needs distinct ids`);
  }
  runSqliteImmediateTransactionSync(
    database.db,
    () => {
      const rows = entries.map((entry) => ({ entry, row: selectRow(database, entry.id) }));
      const refusals: SessionDeliveryBatchRefusal[] = [];
      for (const { entry, row } of rows) {
        const reason =
          resolveSessionDeliveryIneligibility(action, row) ??
          (entry.entryDigest !== undefined && sha256Hex(row!.entry_json) !== entry.entryDigest
            ? "changed since it was selected"
            : null);
        if (reason) {
          refusals.push({ id: entry.id, reason });
        }
      }
      if (refusals.length > 0) {
        throw new SessionDeliveryBatchRefusedError(action, refusals);
      }
      for (const [index, { entry, row }] of rows.entries()) {
        hooks.beforeRowTransition?.(entry.id, index);
        // Compare-and-set on the validated bytes; a miss aborts and rolls back the batch.
        if (!transition(row!)) {
          throw new SessionDeliveryBatchRefusedError(action, [
            { id: entry.id, reason: "changed during the transition" },
          ]);
        }
      }
    },
    { databaseLabel: "openclaw-state", operationLabel: `${action} session deliveries` },
  );
}

/** Park every selected pending row as failed with its payload intact, or none of them. */
export function quarantineSessionDeliveriesInDatabase(
  database: OpenClawStateDatabase,
  input: { entries: readonly SessionDeliveryBatchEntry[]; reason: string; now: number },
  hooks: SessionDeliveryBatchHooks = {},
): void {
  if (!isOperatorQuarantine(input.reason)) {
    throw new Error(
      `Session delivery quarantine reason must start with ${SESSION_DELIVERY_QUARANTINE_REASON_PREFIX}`,
    );
  }
  transitionSessionDeliveryBatch(
    database,
    "quarantine",
    input.entries,
    (row) => {
      const result = executeSqliteQuerySync(
        database.db,
        queueDb(database)
          .updateTable("delivery_queue_entries")
          .set({
            status: "failed",
            last_error: input.reason,
            failed_at: input.now,
            updated_at: input.now,
          })
          .where("queue_name", "=", SESSION_DELIVERY_QUEUE_NAME)
          .where("id", "=", row.id)
          .where("status", "=", "pending")
          .where("recovery_state", "is", null)
          .where("entry_json", "=", row.entry_json),
      );
      return result.numAffectedRows === 1n;
    },
    hooks,
  );
}

/** Return every selected operator-quarantined row to pending with retry state reset, or none. */
export function requeueQuarantinedSessionDeliveriesInDatabase(
  database: OpenClawStateDatabase,
  input: { entries: readonly SessionDeliveryBatchEntry[]; now: number },
  hooks: SessionDeliveryBatchHooks = {},
): void {
  transitionSessionDeliveryBatch(
    database,
    "requeue",
    input.entries,
    (row) => {
      // Eligibility already proved the payload decodes; keep key order so an uncharged row
      // round-trips byte-for-byte.
      const restored: Record<string, unknown> = {
        ...safeParseJsonRecord(row.entry_json),
        retryCount: 0,
      };
      delete restored.lastError;
      delete restored.lastAttemptAt;
      const result = executeSqliteQuerySync(
        database.db,
        queueDb(database)
          .updateTable("delivery_queue_entries")
          .set({
            status: "pending",
            retry_count: 0,
            last_attempt_at: null,
            last_error: null,
            failed_at: null,
            updated_at: input.now,
            entry_json: JSON.stringify(restored),
          })
          .where("queue_name", "=", SESSION_DELIVERY_QUEUE_NAME)
          .where("id", "=", row.id)
          .where("status", "=", "failed")
          .where("recovery_state", "is", null)
          .where("last_error", "=", row.last_error)
          .where("entry_json", "=", row.entry_json),
      );
      return result.numAffectedRows === 1n;
    },
    hooks,
  );
}
