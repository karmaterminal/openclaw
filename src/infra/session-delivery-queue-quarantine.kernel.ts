// Reversible operator quarantine for durable session-delivery rows.
//
// `moveSessionDeliveryToFailed` is a terminal transition: it either deletes the row or compacts
// it to a payload-free tombstone, so it cannot be undone. Operator quarantine must be reversible,
// so it parks the exact pending row as `failed` with its payload, routing columns and enqueue
// time intact, and only the matching requeue returns it to `pending`.
import { safeParseJsonRecord } from "@openclaw/normalization-core";
import type { OpenClawStateDatabase } from "../state/openclaw-state-db-contract.js";
import type { DeliveryQueueDatabase } from "./delivery-queue-sqlite-bound.js";
import { deliveryQueueEntryNotFoundError } from "./delivery-queue-sqlite.kernel.js";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "./kysely-sync.js";
import { SESSION_DELIVERY_QUEUE_NAME } from "./session-delivery-queue.records.js";
import { normalizeSqliteNumber } from "./sqlite-number.js";
import { runSqliteImmediateTransactionSync } from "./sqlite-transaction.js";

/** Failed-reason prefix owned by operator quarantine; requeue only accepts rows carrying it. */
export const SESSION_DELIVERY_QUARANTINE_REASON_PREFIX = "operator-quarantine:";

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
  return lastError?.startsWith(SESSION_DELIVERY_QUARANTINE_REASON_PREFIX) === true;
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
    };
  });
}

/** Park one exact pending row as failed, preserving its payload so requeue can restore it. */
export function quarantinePendingSessionDeliveryInDatabase(
  database: OpenClawStateDatabase,
  input: { id: string; reason: string; now: number },
): void {
  if (!isOperatorQuarantine(input.reason)) {
    throw new Error(
      `Session delivery quarantine reason must start with ${SESSION_DELIVERY_QUARANTINE_REASON_PREFIX}`,
    );
  }
  runSqliteImmediateTransactionSync(
    database.db,
    () => {
      const row = selectRow(database, input.id);
      if (row?.status === "failed" && row.last_error === input.reason) {
        // A replayed request after its own commit settles as the same quarantine.
        return;
      }
      if (row?.status !== "pending") {
        throw deliveryQueueEntryNotFoundError(SESSION_DELIVERY_QUEUE_NAME, input.id);
      }
      // Recovery-owned states (settlement, send custody) must finish through recovery itself.
      const entry = safeParseJsonRecord(row.entry_json);
      if (
        row.recovery_state !== null ||
        entry?.settlementOutcome !== undefined ||
        entry?.acknowledgedAt !== undefined
      ) {
        throw new Error(
          `Session delivery ${input.id} is owned by recovery settlement and cannot be quarantined`,
        );
      }
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
          .where("id", "=", input.id)
          .where("status", "=", "pending")
          .where("recovery_state", "is", null)
          .where("entry_json", "=", row.entry_json),
      );
      if (result.numAffectedRows !== 1n) {
        throw deliveryQueueEntryNotFoundError(SESSION_DELIVERY_QUEUE_NAME, input.id);
      }
    },
    { databaseLabel: "openclaw-state", operationLabel: "quarantine session delivery" },
  );
}

/** Return one operator-quarantined row to pending with its retry and failure state cleared. */
export function requeueQuarantinedSessionDeliveryInDatabase(
  database: OpenClawStateDatabase,
  input: { id: string; now: number },
): void {
  runSqliteImmediateTransactionSync(
    database.db,
    () => {
      const row = selectRow(database, input.id);
      if (
        row?.status !== "failed" ||
        row.recovery_state !== null ||
        !isOperatorQuarantine(row.last_error)
      ) {
        throw Object.assign(
          new Error(`No operator-quarantined session delivery queue entry ${input.id}`),
          { code: "ENOENT" },
        );
      }
      const entry = safeParseJsonRecord(row.entry_json);
      if (!entry) {
        throw new Error(`Session delivery ${input.id} has no retained payload to requeue`);
      }
      // Keep key order so a row that was never charged round-trips byte-for-byte.
      const restored: Record<string, unknown> = { ...entry, retryCount: 0 };
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
          .where("id", "=", input.id)
          .where("status", "=", "failed")
          .where("recovery_state", "is", null)
          .where("last_error", "=", row.last_error)
          .where("entry_json", "=", row.entry_json),
      );
      if (result.numAffectedRows !== 1n) {
        throw deliveryQueueEntryNotFoundError(SESSION_DELIVERY_QUEUE_NAME, input.id);
      }
    },
    { databaseLabel: "openclaw-state", operationLabel: "requeue quarantined session delivery" },
  );
}
