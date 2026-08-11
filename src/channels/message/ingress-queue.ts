/**
 * Durable channel ingress queue.
 *
 * Stores, claims, completes, and tombstones inbound channel events in OpenClaw state.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Selectable } from "kysely";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "../../infra/kysely-sync.js";
import { ensureChannelIngressEventGenerationsSchema } from "../../state/openclaw-state-db-schema-additive.js";
import type {
  ChannelIngressEvents,
  DB as OpenClawStateKyselyDatabase,
} from "../../state/openclaw-state-db.generated.js";
import {
  openOpenClawStateDatabase,
  runOpenClawStateWriteTransaction,
} from "../../state/openclaw-state-db.js";

/** Pending or retryable inbound channel event stored in the durable ingress queue. */
export type ChannelIngressQueueRecord<TPayload, TMetadata = unknown> = {
  id: string;
  channelId: string;
  accountId: string;
  queueName: string;
  payload: TPayload;
  metadata?: TMetadata;
  receivedAt: number;
  updatedAt: number;
  /**
   * Durable monotonic pending generation. Bumps on enqueue, resubmit, claim
   * release, and stale-claim recovery so complete/fail CAS cannot ABA across
   * recycled timestamps/attempts or claim/recover cycles.
   */
  generation: number;
  laneKey?: string;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
};

/** Pending ingress event currently claimed by a worker. */
export type ChannelIngressQueueClaim<TPayload, TMetadata = unknown> = ChannelIngressQueueRecord<
  TPayload,
  TMetadata
> & {
  claim: {
    token: string;
    ownerId: string;
    claimedAt: number;
  };
};

/** Minimal claim reference used to guard completion/release/failure with a claim token. */
export type ChannelIngressQueueClaimRef = {
  id: string;
  claim: {
    token: string;
  };
};

/**
 * Snapshot fence for pending-id complete/fail CAS. Matches the durable
 * never-reused generation allocator plus the row's receivedAt/updatedAt
 * incarnation so fail+resubmit, delete/prune/re-enqueue, and frozen-base
 * writers that cannot advance the side-table token cannot ABA-settle a
 * replacement even when caller-supplied receivedAt is identical.
 */
export type ChannelIngressPendingGenerationMatch = {
  generation: number;
  receivedAt: number;
  updatedAt: number;
};

/** Claim identity available when a stale row's payload cannot be decoded. */
export type ChannelIngressQueueCorruptClaim = {
  id: string;
  channelId: string;
  accountId: string;
  queueName: string;
  laneKey?: string;
  reason: "corrupt_payload";
  claim: {
    token: string;
    ownerId: string;
    claimedAt: number;
  };
};

/** Completed ingress event tombstone retained for duplicate detection. */
type ChannelIngressQueueCompletedRecord<TCompletedMetadata = unknown> = {
  id: string;
  channelId: string;
  accountId: string;
  queueName: string;
  completedAt: number;
  metadata?: TCompletedMetadata;
};

/** Failed ingress event tombstone retained for duplicate detection. */
type ChannelIngressQueueFailedRecord = {
  id: string;
  channelId: string;
  accountId: string;
  queueName: string;
  failedAt: number;
  reason: string;
  message?: string;
};

/** Rich failed ingress event retained for diagnostics and operator recovery. */
type ChannelIngressQueueDeadLetterRecord<
  TPayload = unknown,
  TMetadata = unknown,
> = ChannelIngressQueueFailedRecord & {
  payload?: TPayload;
  metadata?: TMetadata;
  receivedAt: number;
  updatedAt: number;
  laneKey?: string;
  attempts: number;
  lastAttemptAt?: number;
};

/** Outcome of asking a channel/account queue to re-enqueue one failed event. */
type ChannelIngressQueueResubmitResult<
  TPayload,
  TMetadata = unknown,
  TCompletedMetadata = unknown,
> =
  | {
      kind: "resubmitted";
      record: ChannelIngressQueueRecord<TPayload, TMetadata>;
      previous: ChannelIngressQueueDeadLetterRecord<TPayload, TMetadata>;
    }
  | { kind: "not-found" }
  | {
      kind: "completed";
      record: ChannelIngressQueueCompletedRecord<TCompletedMetadata>;
    }
  | { kind: "active"; status: "pending" | "claimed" }
  | {
      kind: "unrecoverable";
      record: ChannelIngressQueueDeadLetterRecord<TPayload, TMetadata>;
    };

/** Per-channel/account dead-letter count used by health and doctor. */
type ChannelIngressQueueFailedCount = {
  channelId: string;
  accountId: string;
  count: number;
  oldestFailedAt: number | null;
};

/** Retention options for pending, completed, and failed ingress queue rows. */
export type ChannelIngressQueuePruneOptions = {
  pendingTtlMs?: number;
  completedTtlMs?: number;
  failedTtlMs?: number;
  pendingMaxEntries?: number;
  /**
   * Per-class completed retention budget. Delivered replay guards and intentional
   * suppression tombstones are bounded independently to this many newest
   * non-protected rows each, so suppression overflow cannot evict delivered
   * duplicate protection (total completed may approach 2× this value).
   */
  completedMaxEntries?: number;
  failedMaxEntries?: number;
  protectIds?: Iterable<string>;
  now?: number;
};

/** Result of enqueueing a possibly duplicate ingress event id. */
type ChannelIngressQueueEnqueueResult<TPayload, TMetadata, TCompletedMetadata> =
  | {
      kind: "accepted";
      duplicate: false;
      record: ChannelIngressQueueRecord<TPayload, TMetadata>;
    }
  | {
      kind: "pending";
      duplicate: true;
      record: ChannelIngressQueueRecord<TPayload, TMetadata>;
    }
  | {
      kind: "claimed";
      duplicate: true;
      record: ChannelIngressQueueClaim<TPayload, TMetadata>;
    }
  | {
      kind: "completed";
      duplicate: true;
      record: ChannelIngressQueueCompletedRecord<TCompletedMetadata>;
    }
  | {
      kind: "failed";
      duplicate: true;
      record: ChannelIngressQueueFailedRecord;
    };

/** Durable FIFO-ish ingress queue with claims, duplicate detection, and retention pruning. */
export type ChannelIngressQueue<TPayload, TMetadata = unknown, TCompletedMetadata = unknown> = {
  /**
   * Compile-time-only brands. Optional at runtime; present so conditional types
   * can recover payload/metadata/completed-metadata despite method bivariance
   * collapsing bare `extends ChannelIngressQueue<infer P, …>` to `unknown`.
   */
  readonly __payloadBrand?: (value: TPayload) => TPayload;
  readonly __metadataBrand?: (value: TMetadata) => TMetadata;
  readonly __completedMetadataBrand?: (value: TCompletedMetadata) => TCompletedMetadata;
  enqueue(
    id: string,
    payload: TPayload,
    options?: {
      metadata?: TMetadata;
      receivedAt?: number;
      laneKey?: string;
    },
  ): Promise<ChannelIngressQueueEnqueueResult<TPayload, TMetadata, TCompletedMetadata>>;
  listPending(options?: {
    limit?: number | "all";
    orderBy?: "received" | "id";
  }): Promise<Array<ChannelIngressQueueRecord<TPayload, TMetadata>>>;
  listClaims(): Promise<Array<ChannelIngressQueueClaim<TPayload, TMetadata>>>;
  /** Additive SDK seam; optional so existing external queue test doubles remain compatible. */
  listFailed?(options?: {
    limit?: number | "all";
  }): Promise<Array<ChannelIngressQueueDeadLetterRecord<TPayload, TMetadata>>>;
  claimNext(options?: {
    ownerId?: string;
    blockedLaneKeys?: Iterable<string>;
    staleMs?: number;
    orderBy?: "received" | "id";
    scanLimit?: number;
    candidateIds?: Iterable<string>;
    deriveLaneKey?: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string | undefined;
    /** Authorize a changed durable lane before the atomic pending-to-claimed transition. */
    reconcileStoredLaneKey?: (
      record: ChannelIngressQueueRecord<TPayload, TMetadata>,
      storedLaneKey: string,
      derivedLaneKey: string,
    ) => boolean;
  }): Promise<ChannelIngressQueueClaim<TPayload, TMetadata> | null>;
  claim(
    id: string,
    options?: { ownerId?: string },
  ): Promise<ChannelIngressQueueClaim<TPayload, TMetadata> | null>;
  refreshClaim?(
    claim: ChannelIngressQueueClaimRef,
    options?: { refreshedAt?: number },
  ): Promise<boolean>;
  complete(
    idOrClaim: string | ChannelIngressQueueClaimRef,
    options?: {
      metadata?: TCompletedMetadata;
      completedAt?: number;
      /**
       * When completing by id (pending path), require these generation fields so a
       * disposition derived from an older snapshot cannot tombstone a resubmit.
       */
      expectedPending?: ChannelIngressPendingGenerationMatch;
    },
  ): Promise<boolean>;
  release(
    idOrClaim: string | ChannelIngressQueueClaimRef,
    options?: { lastError?: string; releasedAt?: number; recordAttempt?: boolean },
  ): Promise<boolean>;
  fail(
    idOrClaim: string | ChannelIngressQueueClaimRef,
    options: {
      reason: string;
      message?: string;
      failedAt?: number;
      /** Generation fence for pending-id failures (async disposition CAS). */
      expectedPending?: ChannelIngressPendingGenerationMatch;
    },
  ): Promise<boolean>;
  /** Additive SDK seam; actual runtime queues support operator resubmission. */
  resubmit?(
    id: string,
    options?: { resubmittedAt?: number },
  ): Promise<ChannelIngressQueueResubmitResult<TPayload, TMetadata, TCompletedMetadata>>;
  delete(
    idOrClaim:
      | string
      | ChannelIngressQueueRecord<TPayload, TMetadata>
      | ChannelIngressQueueClaimRef,
  ): Promise<boolean>;
  recoverStaleClaims(options?: {
    staleMs?: number;
    now?: number;
    shouldRecover?: (
      claim: ChannelIngressQueueClaim<TPayload, TMetadata>,
    ) => boolean | Promise<boolean>;
    shouldRecoverCorrupt?: (claim: ChannelIngressQueueCorruptClaim) => boolean | Promise<boolean>;
  }): Promise<number>;
  prune(options?: ChannelIngressQueuePruneOptions): Promise<number>;
};

/** Construction options for a channel/account-scoped ingress queue. */
export type CreateChannelIngressQueueOptions = {
  channelId: string;
  accountId?: string;
  stateDir?: string;
  now?: () => number;
};

type ChannelIngressDatabase = Pick<
  OpenClawStateKyselyDatabase,
  | "channel_ingress_events"
  | "channel_ingress_event_generations"
  | "channel_ingress_generation_counters"
>;
type ChannelIngressRow = Selectable<ChannelIngressEvents>;

// Failed rows need to distinguish a retained JSON null payload from the "null"
// scrub marker written by older versions. Invalid JSON cannot collide with enqueue output.
const FAILED_NULL_PAYLOAD_SENTINEL = "OPENCLAW_CHANNEL_INGRESS_FAILED_NULL_V1";

function normalizePart(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

// Keep inherited lookups for HOME/etc. without enumerating large Kubernetes service envs.
function createStateDirEnv(
  stateDir: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = Object.create(baseEnv) as NodeJS.ProcessEnv;
  env.OPENCLAW_STATE_DIR = stateDir;
  return env;
}

function openStateDatabase(stateDir?: string) {
  const database = openOpenClawStateDatabase({
    env: stateDir ? createStateDirEnv(stateDir) : process.env,
  });
  // Writable opens also ensure via ensureAdditiveStateColumns; keep a local
  // guarantee so feature paths remain correct if called against a pre-ensure handle.
  ensureChannelIngressEventGenerationsSchema(database.db);
  return database;
}

function getChannelIngressKysely(db: DatabaseSync) {
  return getNodeSqliteKysely<ChannelIngressDatabase>(db);
}

function affectedRows(result: { numAffectedRows?: bigint }): number {
  return Number(result.numAffectedRows ?? 0n);
}

function readEventGeneration(db: DatabaseSync, queueName: string, eventId: string): number {
  const row = executeSqliteQueryTakeFirstSync(
    db,
    getChannelIngressKysely(db)
      .selectFrom("channel_ingress_event_generations")
      .select("generation")
      .where("queue_name", "=", queueName)
      .where("event_id", "=", eventId),
  );
  return Number(row?.generation ?? 0);
}

function loadEventGenerations(
  db: DatabaseSync,
  queueName: string,
  eventIds: string[],
): Map<string, number> {
  const generations = new Map<string, number>();
  if (eventIds.length === 0) {
    return generations;
  }
  const rows = executeSqliteQuerySync(
    db,
    getChannelIngressKysely(db)
      .selectFrom("channel_ingress_event_generations")
      .select(["event_id", "generation"])
      .where("queue_name", "=", queueName)
      .where("event_id", "in", eventIds),
  ).rows;
  for (const row of rows) {
    generations.set(row.event_id, Number(row.generation ?? 0));
  }
  return generations;
}

function writeEventGeneration(
  db: DatabaseSync,
  queueName: string,
  eventId: string,
  generation: number,
): void {
  executeSqliteQuerySync(
    db,
    getChannelIngressKysely(db)
      .insertInto("channel_ingress_event_generations")
      .values({
        queue_name: queueName,
        event_id: eventId,
        generation,
      })
      .onConflict((conflict) =>
        conflict.columns(["queue_name", "event_id"]).doUpdateSet({ generation }),
      ),
  );
}

/**
 * Singleton allocator key. Queue names historically churn with plugin/account
 * identity; a single never-reuse counter bounds storage while remaining
 * monotonic across every queue scope in the database.
 */
const INGRESS_GENERATION_COUNTER_KEY = "";

/**
 * Fold legacy per-queue counters into the singleton high-water mark and drop
 * the unbounded per-name rows. Safe to call on every allocate/prune.
 */
function compactGenerationCounters(db: DatabaseSync): void {
  // sqlite-allow-raw -- Singleton high-water fold + prune of per-queue counter rows.
  const maxRow = db
    .prepare(
      `SELECT COALESCE(MAX(next_generation), 0) AS n
       FROM channel_ingress_generation_counters`,
    )
    .get() as { n: number } | undefined;
  const highWater = Number(maxRow?.n ?? 0);
  db.prepare(
    `INSERT INTO channel_ingress_generation_counters (queue_name, next_generation)
     VALUES (?, ?)
     ON CONFLICT(queue_name) DO UPDATE SET
       next_generation = MAX(next_generation, excluded.next_generation)`,
  ).run(INGRESS_GENERATION_COUNTER_KEY, highWater);
  db.prepare(
    `DELETE FROM channel_ingress_generation_counters
     WHERE queue_name != ?`,
  ).run(INGRESS_GENERATION_COUNTER_KEY);
}

/**
 * Allocate a DB-global generation that never reuses a prior value, even after
 * the per-event side-table row is cleared by complete/delete/prune and even
 * across historical queue-name churn.
 */
function allocateEventGeneration(db: DatabaseSync, queueName: string, eventId: string): number {
  compactGenerationCounters(db);
  // sqlite-allow-raw -- Atomic singleton monotonic generation allocator + side row.
  const row = db
    .prepare(
      `INSERT INTO channel_ingress_generation_counters (queue_name, next_generation)
       VALUES (?, 1)
       ON CONFLICT(queue_name) DO UPDATE SET next_generation = next_generation + 1
       RETURNING next_generation`,
    )
    .get(INGRESS_GENERATION_COUNTER_KEY) as { next_generation: number } | undefined;
  const generation = Number(row?.next_generation ?? 0);
  if (!Number.isFinite(generation) || generation < 1) {
    throw new Error(`Failed to allocate channel ingress generation for ${queueName}`);
  }
  writeEventGeneration(db, queueName, eventId, generation);
  return generation;
}

function clearEventGeneration(db: DatabaseSync, queueName: string, eventId: string): void {
  executeSqliteQuerySync(
    db,
    getChannelIngressKysely(db)
      .deleteFrom("channel_ingress_event_generations")
      .where("queue_name", "=", queueName)
      .where("event_id", "=", eventId),
  );
}

/** Drop generation side rows whose event rows are gone (bounded by live events). */
function pruneOrphanEventGenerations(db: DatabaseSync, queueName: string): number {
  // sqlite-allow-raw -- Orphan cleanup for generation side table after event deletes.
  const result = db
    .prepare(
      `DELETE FROM channel_ingress_event_generations
       WHERE queue_name = ?
         AND event_id NOT IN (
           SELECT event_id FROM channel_ingress_events WHERE queue_name = ?
         )`,
    )
    .run(queueName, queueName);
  compactGenerationCounters(db);
  return Number(result.changes ?? 0);
}

/**
 * Atomically decide whether a generation-fenced pending settlement may proceed.
 * Revalidates incarnation (generation + receivedAt) and live same-lane claims
 * inside the write transaction so listClaims/listPending TOCTOU cannot suppress
 * a later row while a peer holds the lane head (including corrupt claim rows
 * filtered from listClaims).
 */
function pendingSettlementAllowed(
  db: DatabaseSync,
  queueName: string,
  eventId: string,
  expectedPending: ChannelIngressPendingGenerationMatch,
): boolean {
  const row = selectRow(db, queueName, eventId);
  if (!row || row.status !== "pending") {
    return false;
  }
  if (readEventGeneration(db, queueName, eventId) !== expectedPending.generation) {
    return false;
  }
  if (Number(row.received_at) !== expectedPending.receivedAt) {
    return false;
  }
  // Frozen-base writers cannot advance the side-table generation token. They
  // do rewrite updated_at on delete/re-enqueue, so identical receivedAt alone
  // must not authorize settlement of a replacement incarnation.
  if (Number(row.updated_at) !== expectedPending.updatedAt) {
    return false;
  }
  const laneKey = row.lane_key;
  if (typeof laneKey === "string" && laneKey.length > 0) {
    // sqlite-allow-raw -- Lane-head claim fence must see corrupt rows listClaims drops.
    const claimed = db
      .prepare(
        `SELECT 1 AS ok
         FROM channel_ingress_events
         WHERE queue_name = ?
           AND status = 'claimed'
           AND lane_key = ?
         LIMIT 1`,
      )
      .get(queueName, laneKey) as { ok: number } | undefined;
    if (claimed) {
      return false;
    }
  }
  return true;
}

type ParseJsonResult = { ok: true; value: unknown } | { ok: false };

function parseJson(value: string): ParseJsonResult {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function parseFailedPayload(value: string): ParseJsonResult {
  return value === FAILED_NULL_PAYLOAD_SENTINEL ? { ok: true, value: null } : parseJson(value);
}

function baseRecord<TPayload, TMetadata>(
  row: ChannelIngressRow,
  generation = 0,
): ChannelIngressQueueRecord<TPayload, TMetadata> | null {
  const payloadResult = parseJson(row.payload_json);
  if (!payloadResult.ok) {
    return null;
  }
  const metaResult = row.metadata_json === null ? null : parseJson(row.metadata_json);
  return {
    id: row.event_id,
    channelId: row.channel_id,
    accountId: row.account_id,
    queueName: row.queue_name,
    payload: payloadResult.value as TPayload,
    ...(metaResult === null || !metaResult.ok ? {} : { metadata: metaResult.value as TMetadata }),
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
    generation,
    ...(row.lane_key === null ? {} : { laneKey: row.lane_key }),
    attempts: row.attempts,
    ...(row.last_attempt_at === null ? {} : { lastAttemptAt: row.last_attempt_at }),
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
  };
}

function claimedRecord<TPayload, TMetadata>(
  row: ChannelIngressRow,
  generation = 0,
): ChannelIngressQueueClaim<TPayload, TMetadata> | null {
  const base = baseRecord<TPayload, TMetadata>(row, generation);
  if (base === null) {
    return null;
  }
  return {
    ...base,
    claim: {
      token: row.claim_token ?? "",
      ownerId: row.claim_owner ?? "",
      claimedAt: row.claimed_at ?? 0,
    },
  };
}

function corruptClaimRecord(row: ChannelIngressRow): ChannelIngressQueueCorruptClaim {
  const claimValue = row.claim_token ?? "";
  return {
    id: row.event_id,
    channelId: row.channel_id,
    accountId: row.account_id,
    queueName: row.queue_name,
    ...(row.lane_key === null ? {} : { laneKey: row.lane_key }),
    reason: "corrupt_payload",
    claim: {
      token: claimValue,
      ownerId: row.claim_owner ?? "",
      claimedAt: row.claimed_at ?? 0,
    },
  };
}

function completedRecord<TCompletedMetadata>(
  row: ChannelIngressRow,
): ChannelIngressQueueCompletedRecord<TCompletedMetadata> {
  const metaResult =
    row.completed_metadata_json === null ? null : parseJson(row.completed_metadata_json);
  return {
    id: row.event_id,
    channelId: row.channel_id,
    accountId: row.account_id,
    queueName: row.queue_name,
    completedAt: row.completed_at ?? row.updated_at,
    ...(metaResult === null || !metaResult.ok
      ? {}
      : { metadata: metaResult.value as TCompletedMetadata }),
  };
}

function failedRecord<TPayload, TMetadata>(
  row: ChannelIngressRow,
): ChannelIngressQueueDeadLetterRecord<TPayload, TMetadata> {
  const payloadResult = parseFailedPayload(row.payload_json);
  const metadataResult = row.metadata_json === null ? null : parseJson(row.metadata_json);
  return {
    id: row.event_id,
    channelId: row.channel_id,
    accountId: row.account_id,
    queueName: row.queue_name,
    ...(payloadResult.ok && row.payload_json !== "null"
      ? { payload: payloadResult.value as TPayload }
      : {}),
    ...(metadataResult?.ok ? { metadata: metadataResult.value as TMetadata } : {}),
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
    ...(row.lane_key === null ? {} : { laneKey: row.lane_key }),
    attempts: row.attempts,
    ...(row.last_attempt_at === null ? {} : { lastAttemptAt: row.last_attempt_at }),
    failedAt: row.failed_at ?? row.updated_at,
    reason: row.failed_reason ?? "failed",
    ...(row.last_error === null ? {} : { message: row.last_error }),
  };
}

function selectRow(db: DatabaseSync, queueName: string, id: string) {
  const kysely = getChannelIngressKysely(db);
  return executeSqliteQueryTakeFirstSync(
    db,
    kysely
      .selectFrom("channel_ingress_events")
      .selectAll()
      .where("queue_name", "=", queueName)
      .where("event_id", "=", id),
  );
}

function tombstoneCorruptPayloadRow(params: {
  db: DatabaseSync;
  row: ChannelIngressRow;
  expectedStatus: "pending" | "claimed";
  failedAt: number;
  staleCutoff?: number;
}): boolean {
  const kysely = getChannelIngressKysely(params.db);
  const baseUpdate = kysely
    .updateTable("channel_ingress_events")
    .set({
      status: "failed",
      failed_at: params.failedAt,
      failed_reason: "corrupt_payload",
      last_error: null,
      payload_json: "null",
      metadata_json: null,
      claim_token: null,
      claim_owner: null,
      claimed_at: null,
      updated_at: params.failedAt,
    })
    .where("queue_name", "=", params.row.queue_name)
    .where("event_id", "=", params.row.event_id)
    .where("status", "=", params.expectedStatus);
  if (params.expectedStatus === "pending") {
    return affectedRows(executeSqliteQuerySync(params.db, baseUpdate)) > 0;
  }
  const claimGuardedUpdate =
    params.row.claim_token === null
      ? baseUpdate.where("claim_token", "is", null)
      : baseUpdate.where("claim_token", "=", params.row.claim_token);
  const staleGuardedUpdate =
    params.staleCutoff === undefined
      ? claimGuardedUpdate
      : claimGuardedUpdate.where("claimed_at", "<=", params.staleCutoff);
  return affectedRows(executeSqliteQuerySync(params.db, staleGuardedUpdate)) > 0;
}

function idFrom(idOrRecord: string | { id: string }): string {
  const id = normalizePart(typeof idOrRecord === "string" ? idOrRecord : idOrRecord.id, "");
  if (!id) {
    throw new Error("Channel ingress event id cannot be empty");
  }
  return id;
}

function claimTokenFrom(
  idOrClaim: string | { id: string; claim?: { token: string } },
): string | null {
  return typeof idOrClaim === "string" ? null : (idOrClaim.claim?.token ?? null);
}

function rowToEnqueueResult<TPayload, TMetadata, TCompletedMetadata>(
  row: ChannelIngressRow,
  generation = 0,
): ChannelIngressQueueEnqueueResult<TPayload, TMetadata, TCompletedMetadata> | null {
  if (row.status === "completed") {
    return { kind: "completed", duplicate: true, record: completedRecord(row) };
  }
  if (row.status === "failed") {
    return {
      kind: "failed",
      duplicate: true,
      record: failedRecord<TPayload, TMetadata>(row),
    };
  }
  if (row.status === "claimed") {
    const rec = claimedRecord<TPayload, TMetadata>(row, generation);
    return rec ? { kind: "claimed", duplicate: true, record: rec } : null;
  }
  const rec = baseRecord<TPayload, TMetadata>(row, generation);
  return rec ? { kind: "pending", duplicate: true, record: rec } : null;
}

function normalizeLimit(limit: number | "all" | undefined): number {
  if (limit === "all") {
    return Number.MAX_SAFE_INTEGER;
  }
  if (limit === undefined) {
    return 100;
  }
  // Preserve 0 so callers can request an empty snapshot without a minimum page of 1.
  if (!Number.isFinite(limit)) {
    return 100;
  }
  return Math.max(0, Math.floor(limit));
}

function normalizeScanLimit(limit: number | undefined): number {
  return Math.max(1, Math.floor(limit ?? 100));
}

// Materialize pending rows in bounded chunks because SQLite's json_valid()
// rejects some payloads accepted by the queue's JSON.stringify/JSON.parse contract.
const LIST_PENDING_BATCH_SIZE = 100;
// Keep repair work bounded under one SQLite write lock; later calls continue
// from the durable failed tombstones left by this call.
const MAX_CORRUPT_RECONCILIATIONS_PER_CLAIM = 100;

function normalizeMaxEntries(value: number | undefined): number | null {
  return value === undefined ? null : Math.max(0, Math.floor(value));
}

function normalizedProtectedIds(ids: Iterable<string> | undefined): string[] {
  return [...(ids ?? [])].map((id) => id.trim()).filter(Boolean);
}

function normalizedCandidateIds(ids: Iterable<string> | undefined): string[] | undefined {
  return ids === undefined ? undefined : [...ids].map((id) => id.trim()).filter(Boolean);
}

function queueNameForParts(channelId: string, accountId: string): string {
  // JSON tuple encoding keeps channel/account scopes unambiguous even when ids contain separators.
  return JSON.stringify([channelId, accountId]);
}

/** Count failed channel ingress events per channel account for operator health surfaces. */
export function countFailedChannelIngressQueueEntries(
  stateDir?: string,
): ChannelIngressQueueFailedCount[] {
  const database = openStateDatabase(stateDir);
  const queueDb = getChannelIngressKysely(database.db);
  const rows = executeSqliteQuerySync(
    database.db,
    queueDb
      .selectFrom("channel_ingress_events")
      .select((eb) => [
        "channel_id",
        "account_id",
        eb.fn.countAll().as("failed_count"),
        eb.fn.min("failed_at").as("oldest_failed_at"),
      ])
      .where("status", "=", "failed")
      .groupBy(["channel_id", "account_id"])
      .orderBy("channel_id", "asc")
      .orderBy("account_id", "asc"),
  ).rows as Array<{
    channel_id: string;
    account_id: string;
    failed_count: number | bigint;
    oldest_failed_at: number | bigint | null;
  }>;
  return rows.map((row) => ({
    channelId: row.channel_id,
    accountId: row.account_id,
    count: Number(row.failed_count),
    oldestFailedAt: row.oldest_failed_at == null ? null : Number(row.oldest_failed_at),
  }));
}

/** Creates a durable channel/account-scoped ingress queue backed by the OpenClaw state database. */
export function createChannelIngressQueue<
  TPayload,
  TMetadata = unknown,
  TCompletedMetadata = unknown,
>(
  options: CreateChannelIngressQueueOptions,
): ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata> {
  const channelId = normalizePart(options.channelId, "unknown");
  const accountId = normalizePart(options.accountId, "default");
  const queueName = queueNameForParts(channelId, accountId);
  const now = options.now ?? Date.now;

  const enqueue: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["enqueue"] = async (
    id,
    payload,
    enqueueOptions,
  ) => {
    const eventId = normalizePart(id, "");
    if (!eventId) {
      throw new Error("Channel ingress event id cannot be empty");
    }
    const receivedAt = enqueueOptions?.receivedAt ?? now();
    const updatedAt = now();
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const insert = executeSqliteQuerySync(
          tx.db,
          kysely
            .insertInto("channel_ingress_events")
            .values({
              queue_name: queueName,
              event_id: eventId,
              channel_id: channelId,
              account_id: accountId,
              status: "pending",
              lane_key: enqueueOptions?.laneKey ?? null,
              payload_json: JSON.stringify(payload),
              metadata_json:
                enqueueOptions?.metadata === undefined
                  ? null
                  : JSON.stringify(enqueueOptions.metadata),
              received_at: receivedAt,
              updated_at: updatedAt,
              attempts: 0,
            })
            .onConflict((conflict) => conflict.columns(["queue_name", "event_id"]).doNothing()),
        );
        const row = selectRow(tx.db, queueName, eventId);
        if (!row) {
          throw new Error(`Failed to read channel ingress event ${queueName}/${eventId}`);
        }
        if (affectedRows(insert) > 0) {
          // Never-reuse allocator: delete/prune/re-enqueue and frozen-base writers
          // cannot recreate a prior fence value for this queue.
          const generation = allocateEventGeneration(tx.db, queueName, eventId);
          const fresh = baseRecord<TPayload, TMetadata>(row, generation);
          if (fresh === null) {
            throw new Error(
              `Corrupt payload_json in channel ingress event ${queueName}/${eventId}`,
            );
          }
          return {
            kind: "accepted",
            duplicate: false,
            record: fresh,
          };
        }
        const dup = rowToEnqueueResult<TPayload, TMetadata, TCompletedMetadata>(
          row,
          readEventGeneration(tx.db, queueName, eventId),
        );
        if (dup === null) {
          // A live claimant may already be producing external side effects.
          // Duplicate enqueue cannot prove ownership is stale, so leave claimed
          // corruption for the ownership-aware recovery path.
          if (row.status === "claimed") {
            throw new Error(
              `Corrupt payload_json in claimed channel ingress event ${queueName}/${eventId}`,
            );
          }
          if (
            !tombstoneCorruptPayloadRow({
              db: tx.db,
              row,
              expectedStatus: "pending",
              failedAt: updatedAt,
            })
          ) {
            throw new Error(`Failed to tombstone corrupt ingress event ${queueName}/${eventId}`);
          }
          const failedRow = selectRow(tx.db, queueName, eventId);
          if (!failedRow) {
            throw new Error(`Failed to read corrupt ingress tombstone ${queueName}/${eventId}`);
          }
          return {
            kind: "failed",
            duplicate: true,
            record: failedRecord<TPayload, TMetadata>(failedRow),
          };
        }
        return dup;
      },
      { path: database.path },
    );
  };

  const listPending: ChannelIngressQueue<
    TPayload,
    TMetadata,
    TCompletedMetadata
  >["listPending"] = async (listOptions) => {
    const database = openStateDatabase(options.stateDir);
    const limit = normalizeLimit(listOptions?.limit);
    // Bound SQLite rows selected (valid + corrupt), not only decoded records.
    if (limit === 0) {
      return [];
    }
    // Corrupt prefixes must make durable progress under the same per-pass budget
    // so repeated pumps eventually reach valid work without unbounded scans.
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const records: Array<ChannelIngressQueueRecord<TPayload, TMetadata>> = [];
        let lastRow: ChannelIngressRow | undefined;
        let selectedRows = 0;
        let corruptReconciliations = 0;
        const failedAt = now();
        while (selectedRows < limit) {
          const pageSize = Math.min(LIST_PENDING_BATCH_SIZE, limit - selectedRows);
          let pageQuery = kysely
            .selectFrom("channel_ingress_events")
            .selectAll()
            .where("queue_name", "=", queueName)
            .where("status", "=", "pending");
          if (lastRow) {
            const cursor = lastRow;
            pageQuery =
              listOptions?.orderBy === "id"
                ? pageQuery.where("event_id", ">", cursor.event_id)
                : pageQuery.where((eb) =>
                    eb.or([
                      eb("received_at", ">", cursor.received_at),
                      eb.and([
                        eb("received_at", "=", cursor.received_at),
                        eb("event_id", ">", cursor.event_id),
                      ]),
                    ]),
                  );
          }
          const orderedQuery =
            listOptions?.orderBy === "id"
              ? pageQuery.orderBy("event_id", "asc")
              : pageQuery.orderBy("received_at", "asc").orderBy("event_id", "asc");
          const rows = executeSqliteQuerySync(tx.db, orderedQuery.limit(pageSize)).rows;
          if (rows.length === 0) {
            break;
          }
          const pageGenerations = loadEventGenerations(
            tx.db,
            queueName,
            rows.map((row) => row.event_id),
          );
          let pageAdvancedPastCorrupt = false;
          for (const row of rows) {
            selectedRows += 1;
            const record = baseRecord<TPayload, TMetadata>(
              row,
              pageGenerations.get(row.event_id) ?? 0,
            );
            if (record) {
              records.push(record);
            } else if (corruptReconciliations < limit) {
              // Durable tombstone so the next pump's SQL window slides forward.
              if (
                tombstoneCorruptPayloadRow({
                  db: tx.db,
                  row,
                  expectedStatus: "pending",
                  failedAt,
                })
              ) {
                corruptReconciliations += 1;
                pageAdvancedPastCorrupt = true;
              }
            }
            if (selectedRows >= limit) {
              break;
            }
          }
          if (selectedRows >= limit) {
            break;
          }
          if (rows.length < pageSize) {
            break;
          }
          // When the page was pure corrupt and we reconciled, re-query from the
          // same cursor origin is wrong (rows are gone). Advance cursor to the
          // last visited row identity even if tombstoned so ORDER BY pagination
          // does not re-read earlier keys; tombstoned rows no longer match pending.
          lastRow = rows.at(-1);
          if (!lastRow && !pageAdvancedPastCorrupt) {
            break;
          }
        }
        return records;
      },
      { path: database.path },
    );
  };

  const listClaims: ChannelIngressQueue<
    TPayload,
    TMetadata,
    TCompletedMetadata
  >["listClaims"] = async () => {
    const { db } = openStateDatabase(options.stateDir);
    const kysely = getChannelIngressKysely(db);
    const rows = executeSqliteQuerySync(
      db,
      kysely
        .selectFrom("channel_ingress_events")
        .selectAll()
        .where("queue_name", "=", queueName)
        .where("status", "=", "claimed")
        .orderBy("claimed_at", "asc")
        .orderBy("received_at", "asc")
        .orderBy("event_id", "asc"),
    ).rows;
    const generations = loadEventGenerations(
      db,
      queueName,
      rows.map((row) => row.event_id),
    );
    return rows
      .map((row) => claimedRecord<TPayload, TMetadata>(row, generations.get(row.event_id) ?? 0))
      .filter((rec): rec is ChannelIngressQueueClaim<TPayload, TMetadata> => rec !== null);
  };

  const listFailed: NonNullable<
    ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["listFailed"]
  > = async (listOptions) => {
    const { db } = openStateDatabase(options.stateDir);
    const rows = executeSqliteQuerySync(
      db,
      getChannelIngressKysely(db)
        .selectFrom("channel_ingress_events")
        .selectAll()
        .where("queue_name", "=", queueName)
        .where("status", "=", "failed")
        .orderBy("failed_at", "asc")
        .orderBy("event_id", "asc")
        .limit(normalizeLimit(listOptions?.limit)),
    ).rows;
    return rows.map((row) => failedRecord<TPayload, TMetadata>(row));
  };

  const claimNext: ChannelIngressQueue<
    TPayload,
    TMetadata,
    TCompletedMetadata
  >["claimNext"] = async (claimOptions) => {
    if (claimOptions?.staleMs !== undefined) {
      await recoverStaleClaims({ staleMs: claimOptions.staleMs });
    }
    const blocked = new Set(
      [...(claimOptions?.blockedLaneKeys ?? [])].map((key) => key.trim()).filter(Boolean),
    );
    const candidateIds = normalizedCandidateIds(claimOptions?.candidateIds);
    if (candidateIds?.length === 0) {
      return null;
    }
    const ownerId = normalizePart(claimOptions?.ownerId, `${process.pid}`);
    const resolveClaimLaneKey = (
      record: ChannelIngressQueueRecord<TPayload, TMetadata>,
    ): string | undefined => {
      const storedLaneKey = record.laneKey;
      if (storedLaneKey === undefined) {
        return claimOptions?.deriveLaneKey?.(record);
      }
      if (!claimOptions?.deriveLaneKey || !claimOptions.reconcileStoredLaneKey) {
        return storedLaneKey;
      }
      const derivedLaneKey = claimOptions.deriveLaneKey(record);
      if (!derivedLaneKey || derivedLaneKey === storedLaneKey) {
        return storedLaneKey;
      }
      // Durable identity changes need their channel owner's explicit approval;
      // unrelated derivations can intentionally be ephemeral claim lanes.
      return claimOptions.reconcileStoredLaneKey(record, storedLaneKey, derivedLaneKey)
        ? derivedLaneKey
        : storedLaneKey;
    };
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        // Always re-read raw live *peer* claimed lanes under the claim
        // transaction — including non-candidate and corrupt-payload rows that
        // listClaims filters out — so a concurrent peer claim between the
        // drain's pre-claim listClaims and this CAS cannot leave the lane
        // unfenced (TOCTOU). Candidate membership must never gate fencing.
        // Self-owned claims are intentionally omitted: deferredLaneOccupancy
        // "release" keeps the claim token while freeing the lane, and the
        // drain already decided which self-held rows belong in blockedLaneKeys.
        // sqlite-allow-raw -- Raw peer claimed-lane fence (no payload decode).
        const liveClaimedLanes = tx.db
          .prepare(
            `SELECT DISTINCT lane_key AS laneKey
             FROM channel_ingress_events
             WHERE queue_name = ?
               AND status = 'claimed'
               AND lane_key IS NOT NULL
               AND TRIM(lane_key) != ''
               AND (claim_owner IS NULL OR claim_owner != ?)`,
          )
          .all(queueName, ownerId) as Array<{ laneKey: string }>;
        const effectiveBlocked = new Set(blocked);
        for (const claimed of liveClaimedLanes) {
          if (typeof claimed.laneKey === "string" && claimed.laneKey.length > 0) {
            effectiveBlocked.add(claimed.laneKey);
          }
        }
        // Ephemeral deriveLaneKey paths may fence lanes not stored on the row.
        // Re-resolve those only for currently-claimed candidates under the tx.
        if (claimOptions?.deriveLaneKey && candidateIds && candidateIds.length > 0) {
          const claimedCandidateRows = executeSqliteQuerySync(
            tx.db,
            kysely
              .selectFrom("channel_ingress_events")
              .selectAll()
              .where("queue_name", "=", queueName)
              .where("status", "=", "claimed")
              .where("event_id", "in", candidateIds),
          ).rows;
          const claimedCandidateGenerations = loadEventGenerations(
            tx.db,
            queueName,
            claimedCandidateRows.map((row) => row.event_id),
          );
          for (const row of claimedCandidateRows) {
            const rec = baseRecord<TPayload, TMetadata>(
              row,
              claimedCandidateGenerations.get(row.event_id) ?? 0,
            );
            if (!rec) {
              continue;
            }
            const derived = resolveClaimLaneKey(rec);
            if (derived) {
              effectiveBlocked.add(derived);
            }
          }
        }
        const baseSelect = kysely
          .selectFrom("channel_ingress_events")
          .selectAll()
          .where("queue_name", "=", queueName)
          .where("status", "=", "pending");
        let select = baseSelect;
        if (candidateIds) {
          select = select.where("event_id", "in", candidateIds);
        }
        if (effectiveBlocked.size > 0 && !claimOptions?.deriveLaneKey) {
          select = select.where((eb) =>
            eb.or([eb("lane_key", "is", null), eb("lane_key", "not in", [...effectiveBlocked])]),
          );
        }
        let orderedSelect =
          claimOptions?.orderBy === "id"
            ? select.orderBy("event_id", "asc")
            : select.orderBy("received_at", "asc").orderBy("event_id", "asc");
        orderedSelect = orderedSelect.limit(normalizeScanLimit(claimOptions?.scanLimit));
        const transitionAt = now();
        let corruptReconciliations = 0;
        let selected:
          | { row: ChannelIngressRow; record: ChannelIngressQueueRecord<TPayload, TMetadata> }
          | undefined;
        while (!selected) {
          const rows = executeSqliteQuerySync(tx.db, orderedSelect).rows;
          const rowGenerations = loadEventGenerations(
            tx.db,
            queueName,
            rows.map((row) => row.event_id),
          );
          let tombstonedCorruptRow = false;
          for (const row of rows) {
            const rec = baseRecord<TPayload, TMetadata>(row, rowGenerations.get(row.event_id) ?? 0);
            if (rec === null) {
              if (corruptReconciliations >= MAX_CORRUPT_RECONCILIATIONS_PER_CLAIM) {
                continue;
              }
              const didTombstone = tombstoneCorruptPayloadRow({
                db: tx.db,
                row,
                expectedStatus: "pending",
                failedAt: transitionAt,
              });
              tombstonedCorruptRow = didTombstone || tombstonedCorruptRow;
              if (didTombstone) {
                corruptReconciliations += 1;
              }
              continue;
            }
            const laneKey = resolveClaimLaneKey(rec);
            if (!laneKey || !effectiveBlocked.has(laneKey)) {
              selected = { row, record: rec };
              break;
            }
          }
          if (
            selected ||
            !tombstonedCorruptRow ||
            corruptReconciliations >= MAX_CORRUPT_RECONCILIATIONS_PER_CLAIM
          ) {
            break;
          }
        }
        if (!selected) {
          return null;
        }
        const derivedLaneKey = resolveClaimLaneKey(selected.record);
        const token = randomUUID();
        const result = executeSqliteQuerySync(
          tx.db,
          kysely
            .updateTable("channel_ingress_events")
            .set({
              status: "claimed",
              claim_token: token,
              claim_owner: ownerId,
              claimed_at: transitionAt,
              ...(derivedLaneKey ? { lane_key: derivedLaneKey } : {}),
              updated_at: transitionAt,
            })
            .where("queue_name", "=", queueName)
            .where("event_id", "=", selected.row.event_id)
            .where("status", "=", "pending"),
        );
        if (affectedRows(result) === 0) {
          return null;
        }
        const row = selectRow(tx.db, queueName, selected.row.event_id);
        return row
          ? claimedRecord<TPayload, TMetadata>(
              row,
              readEventGeneration(tx.db, queueName, selected.row.event_id),
            )
          : null;
      },
      { path: database.path },
    );
  };

  const claim: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["claim"] = async (
    id,
    claimOptions,
  ) => {
    const eventId = normalizePart(id, "");
    if (!eventId) {
      throw new Error("Channel ingress event id cannot be empty");
    }
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const transitionAt = now();
        const pendingRow = selectRow(tx.db, queueName, eventId);
        if (!pendingRow || pendingRow.status !== "pending") {
          return null;
        }
        const pendingGeneration = readEventGeneration(tx.db, queueName, eventId);
        if (baseRecord<TPayload, TMetadata>(pendingRow, pendingGeneration) === null) {
          tombstoneCorruptPayloadRow({
            db: tx.db,
            row: pendingRow,
            expectedStatus: "pending",
            failedAt: transitionAt,
          });
          return null;
        }
        const token = randomUUID();
        const ownerId = normalizePart(claimOptions?.ownerId, `${process.pid}`);
        const result = executeSqliteQuerySync(
          tx.db,
          kysely
            .updateTable("channel_ingress_events")
            .set({
              status: "claimed",
              claim_token: token,
              claim_owner: ownerId,
              claimed_at: transitionAt,
              updated_at: transitionAt,
            })
            .where("queue_name", "=", queueName)
            .where("event_id", "=", eventId)
            .where("status", "=", "pending"),
        );
        if (affectedRows(result) === 0) {
          return null;
        }
        const row = selectRow(tx.db, queueName, eventId);
        return row ? claimedRecord<TPayload, TMetadata>(row, pendingGeneration) : null;
      },
      { path: database.path },
    );
  };

  const refreshClaim: NonNullable<
    ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["refreshClaim"]
  > = async (claimRef, refreshOptions) => {
    const eventId = idFrom(claimRef);
    const refreshedAt = refreshOptions?.refreshedAt ?? now();
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const result = executeSqliteQuerySync(
          tx.db,
          kysely
            .updateTable("channel_ingress_events")
            .set({
              claimed_at: refreshedAt,
              updated_at: refreshedAt,
            })
            .where("queue_name", "=", queueName)
            .where("event_id", "=", eventId)
            .where("status", "=", "claimed")
            .where("claim_token", "=", claimRef.claim.token),
        );
        return affectedRows(result) > 0;
      },
      { path: database.path },
    );
  };

  const releaseClaimIfStillStale = async (
    claimRef: ChannelIngressQueueClaimRef,
    releaseOptions: { cutoff: number; releasedAt: number },
  ): Promise<boolean> => {
    const eventId = idFrom(claimRef);
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const result = executeSqliteQuerySync(
          tx.db,
          kysely
            .updateTable("channel_ingress_events")
            .set((eb) => ({
              status: "pending",
              claim_token: null,
              claim_owner: null,
              claimed_at: null,
              attempts: eb("attempts", "+", 1),
              last_attempt_at: releaseOptions.releasedAt,
              updated_at: releaseOptions.releasedAt,
            }))
            .where("queue_name", "=", queueName)
            .where("event_id", "=", eventId)
            .where("status", "=", "claimed")
            .where("claim_token", "=", claimRef.claim.token)
            .where("claimed_at", "<=", releaseOptions.cutoff),
        );
        if (affectedRows(result) === 0) {
          return false;
        }
        // Stale recovery is a pending re-entry: allocate a never-reused
        // generation so an async disposition snapshot taken before recover
        // cannot CAS-settle the recycled row.
        allocateEventGeneration(tx.db, queueName, eventId);
        return true;
      },
      { path: database.path },
    );
  };

  const recoverStaleClaims: ChannelIngressQueue<
    TPayload,
    TMetadata,
    TCompletedMetadata
  >["recoverStaleClaims"] = async (recoverOptions) => {
    const current = recoverOptions?.now ?? now();
    const staleMs = Math.max(0, Math.floor(recoverOptions?.staleMs ?? 0));
    const cutoff = current - staleMs;
    const database = openStateDatabase(options.stateDir);
    const claimedRows = executeSqliteQuerySync(
      database.db,
      getChannelIngressKysely(database.db)
        .selectFrom("channel_ingress_events")
        .selectAll()
        .where("queue_name", "=", queueName)
        .where("status", "=", "claimed")
        .where("claimed_at", "<=", cutoff),
    ).rows;
    let recovered = 0;
    const claimedGenerations = loadEventGenerations(
      database.db,
      queueName,
      claimedRows.map((row) => row.event_id),
    );
    for (const row of claimedRows) {
      const claimRec = claimedRecord<TPayload, TMetadata>(
        row,
        claimedGenerations.get(row.event_id) ?? 0,
      );
      if (claimRec === null) {
        const shouldRecoverCorrupt = recoverOptions?.shouldRecoverCorrupt;
        if (shouldRecoverCorrupt) {
          if (!(await shouldRecoverCorrupt(corruptClaimRecord(row)))) {
            continue;
          }
        } else if (recoverOptions?.shouldRecover) {
          // Existing payload-aware policies cannot safely decide on corrupt
          // data. Preserve ownership unless the caller opts into the raw claim
          // identity contract above.
          continue;
        }
        const tombstoned = runOpenClawStateWriteTransaction(
          (tx) =>
            tombstoneCorruptPayloadRow({
              db: tx.db,
              row,
              expectedStatus: "claimed",
              failedAt: current,
              staleCutoff: cutoff,
            }),
          { path: database.path },
        );
        if (tombstoned) {
          recovered += 1;
        }
        continue;
      }
      if (recoverOptions?.shouldRecover && !(await recoverOptions.shouldRecover(claimRec))) {
        continue;
      }
      if (await releaseClaimIfStillStale(claimRec, { cutoff, releasedAt: current })) {
        recovered += 1;
      }
    }
    return recovered;
  };

  const complete: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["complete"] = async (
    idOrClaim,
    completeOptions,
  ) => {
    const eventId = idFrom(idOrClaim);
    const token = claimTokenFrom(idOrClaim);
    const completedAt = completeOptions?.completedAt ?? now();
    const expectedPending = completeOptions?.expectedPending;
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const baseUpdate = kysely
          .updateTable("channel_ingress_events")
          .set({
            status: "completed",
            completed_at: completedAt,
            completed_metadata_json:
              completeOptions?.metadata === undefined
                ? null
                : JSON.stringify(completeOptions.metadata),
            payload_json: "null",
            metadata_json: null,
            claim_token: null,
            claim_owner: null,
            claimed_at: null,
            last_attempt_at: null,
            last_error: null,
            updated_at: completedAt,
          })
          .where("queue_name", "=", queueName)
          .where("event_id", "=", eventId);
        let update =
          token === null
            ? baseUpdate.where("status", "=", "pending")
            : baseUpdate.where("status", "=", "claimed").where("claim_token", "=", token);
        if (token === null && expectedPending) {
          // Atomic incarnation + same-lane claim revalidation (closes listClaims TOCTOU).
          if (!pendingSettlementAllowed(tx.db, queueName, eventId, expectedPending)) {
            return false;
          }
        }
        const result = executeSqliteQuerySync(tx.db, update);
        if (affectedRows(result) > 0) {
          clearEventGeneration(tx.db, queueName, eventId);
          return true;
        }
        if (token !== null) {
          return false;
        }
        // Generation-fenced pending completes must not insert a fresh tombstone
        // when the snapshot row was already replaced (fail+resubmit race).
        if (expectedPending) {
          return false;
        }
        const insert = executeSqliteQuerySync(
          tx.db,
          kysely
            .insertInto("channel_ingress_events")
            .values({
              queue_name: queueName,
              event_id: eventId,
              channel_id: channelId,
              account_id: accountId,
              status: "completed",
              lane_key: null,
              payload_json: "null",
              metadata_json: null,
              received_at: completedAt,
              updated_at: completedAt,
              attempts: 0,
              completed_at: completedAt,
              completed_metadata_json:
                completeOptions?.metadata === undefined
                  ? null
                  : JSON.stringify(completeOptions.metadata),
            })
            .onConflict((conflict) => conflict.columns(["queue_name", "event_id"]).doNothing()),
        );
        if (affectedRows(insert) > 0) {
          clearEventGeneration(tx.db, queueName, eventId);
          return true;
        }
        return false;
      },
      { path: database.path },
    );
  };

  const release: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["release"] = async (
    idOrClaim,
    releaseOptions,
  ) => {
    const eventId = idFrom(idOrClaim);
    const token = claimTokenFrom(idOrClaim);
    const releasedAt = releaseOptions?.releasedAt ?? now();
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const baseUpdate = kysely
          .updateTable("channel_ingress_events")
          .set((eb) => ({
            status: "pending",
            claim_token: null,
            claim_owner: null,
            claimed_at: null,
            // A claim can lose its owner before processing starts. Returning it
            // must not consume retry budget or erase the previous real failure.
            ...(releaseOptions?.recordAttempt === false
              ? {}
              : {
                  attempts: eb("attempts", "+", 1),
                  last_attempt_at: releasedAt,
                }),
            ...(releaseOptions?.lastError === undefined
              ? {}
              : { last_error: releaseOptions.lastError }),
            updated_at: releasedAt,
          }))
          .where("queue_name", "=", queueName)
          .where("event_id", "=", eventId);
        const update =
          token === null
            ? baseUpdate.where("status", "=", "pending")
            : baseUpdate.where("status", "=", "claimed").where("claim_token", "=", token);
        if (affectedRows(executeSqliteQuerySync(tx.db, update)) === 0) {
          return false;
        }
        // Never-reuse allocation so a stale disposition snapshot cannot ABA-match
        // the recycled pending row (including non-attempting releases).
        allocateEventGeneration(tx.db, queueName, eventId);
        return true;
      },
      { path: database.path },
    );
  };

  const fail: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["fail"] = async (
    idOrClaim,
    failOptions,
  ) => {
    const eventId = idFrom(idOrClaim);
    const token = claimTokenFrom(idOrClaim);
    const failedAt = failOptions.failedAt ?? now();
    const expectedPending = failOptions.expectedPending;
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const baseUpdate = kysely
          .updateTable("channel_ingress_events")
          .set((eb) => ({
            status: "failed",
            failed_at: failedAt,
            failed_reason: failOptions.reason,
            last_error: failOptions.message ?? null,
            payload_json: eb
              .case()
              .when("payload_json", "=", "null")
              .then(FAILED_NULL_PAYLOAD_SENTINEL)
              .else(eb.ref("payload_json"))
              .end(),
            claim_token: null,
            claim_owner: null,
            claimed_at: null,
            updated_at: failedAt,
          }))
          .where("queue_name", "=", queueName)
          .where("event_id", "=", eventId);
        let update =
          token === null
            ? baseUpdate.where("status", "=", "pending")
            : baseUpdate.where("status", "=", "claimed").where("claim_token", "=", token);
        if (token === null && expectedPending) {
          if (!pendingSettlementAllowed(tx.db, queueName, eventId, expectedPending)) {
            return false;
          }
        }
        // Keep the side-table generation on fail so resubmit allocates a new
        // never-reused fence and stale disposition snapshots still lose CAS.
        return affectedRows(executeSqliteQuerySync(tx.db, update)) > 0;
      },
      { path: database.path },
    );
  };

  const resubmit: NonNullable<
    ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["resubmit"]
  > = async (id, resubmitOptions) => {
    const eventId = idFrom(id);
    const resubmittedAt = resubmitOptions?.resubmittedAt ?? now();
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const row = selectRow(tx.db, queueName, eventId);
        if (!row) {
          return { kind: "not-found" };
        }
        if (row.status === "completed") {
          return { kind: "completed", record: completedRecord<TCompletedMetadata>(row) };
        }
        if (row.status !== "failed") {
          return {
            kind: "active",
            status: row.status === "claimed" ? "claimed" : "pending",
          };
        }
        const previous = failedRecord<TPayload, TMetadata>(row);
        // Pre-retention tombstones and corrupt-payload failures stored JSON null.
        // Refuse them rather than enqueueing an event with invented payload data.
        if (row.payload_json === "null" || !parseFailedPayload(row.payload_json).ok) {
          return { kind: "unrecoverable", record: previous };
        }
        const result = executeSqliteQuerySync(
          tx.db,
          getChannelIngressKysely(tx.db)
            .updateTable("channel_ingress_events")
            .set({
              status: "pending",
              payload_json:
                row.payload_json === FAILED_NULL_PAYLOAD_SENTINEL ? "null" : row.payload_json,
              received_at: resubmittedAt,
              updated_at: resubmittedAt,
              attempts: 0,
              last_attempt_at: null,
              last_error: null,
              failed_at: null,
              failed_reason: null,
              claim_token: null,
              claim_owner: null,
              claimed_at: null,
              completed_at: null,
              completed_metadata_json: null,
            })
            .where("queue_name", "=", queueName)
            .where("event_id", "=", eventId)
            .where("status", "=", "failed"),
        );
        if (affectedRows(result) === 0) {
          return { kind: "active", status: "pending" };
        }
        // New never-reused pending generation — stale disposition fences lose CAS.
        const generation = allocateEventGeneration(tx.db, queueName, eventId);
        const updated = selectRow(tx.db, queueName, eventId);
        const record = updated ? baseRecord<TPayload, TMetadata>(updated, generation) : null;
        if (!record) {
          throw new Error(
            `Failed to read resubmitted channel ingress event ${queueName}/${eventId}`,
          );
        }
        return { kind: "resubmitted", record, previous };
      },
      { path: database.path },
    );
  };

  const deleteEntry: ChannelIngressQueue<
    TPayload,
    TMetadata,
    TCompletedMetadata
  >["delete"] = async (idOrRecord) => {
    const eventId = idFrom(idOrRecord);
    const token = claimTokenFrom(idOrRecord);
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        const baseDelete = kysely
          .deleteFrom("channel_ingress_events")
          .where("queue_name", "=", queueName)
          .where("event_id", "=", eventId);
        const deleteQuery =
          token === null
            ? baseDelete.where("status", "=", "pending")
            : baseDelete.where("status", "=", "claimed").where("claim_token", "=", token);
        if (affectedRows(executeSqliteQuerySync(tx.db, deleteQuery)) === 0) {
          return false;
        }
        // Drop the per-event side row; the queue counter keeps fences never-reused.
        clearEventGeneration(tx.db, queueName, eventId);
        return true;
      },
      { path: database.path },
    );
  };

  const prune: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>["prune"] = async (
    pruneOptions,
  ) => {
    const current = pruneOptions?.now ?? now();
    const pendingCutoff =
      pruneOptions?.pendingTtlMs === undefined ? null : current - pruneOptions.pendingTtlMs;
    const completedCutoff =
      pruneOptions?.completedTtlMs === undefined ? null : current - pruneOptions.completedTtlMs;
    const failedCutoff =
      pruneOptions?.failedTtlMs === undefined ? null : current - pruneOptions.failedTtlMs;
    const pendingMaxEntries = normalizeMaxEntries(pruneOptions?.pendingMaxEntries);
    const completedMaxEntries = normalizeMaxEntries(pruneOptions?.completedMaxEntries);
    const failedMaxEntries = normalizeMaxEntries(pruneOptions?.failedMaxEntries);
    const protectIds = normalizedProtectedIds(pruneOptions?.protectIds);
    if (
      pendingCutoff === null &&
      completedCutoff === null &&
      failedCutoff === null &&
      pendingMaxEntries === null &&
      completedMaxEntries === null &&
      failedMaxEntries === null
    ) {
      return 0;
    }
    const database = openStateDatabase(options.stateDir);
    return runOpenClawStateWriteTransaction(
      (tx) => {
        const kysely = getChannelIngressKysely(tx.db);
        let deleted = 0;
        if (pendingCutoff !== null) {
          let deleteQuery = kysely
            .deleteFrom("channel_ingress_events")
            .where("queue_name", "=", queueName)
            .where("status", "=", "pending")
            .where("updated_at", "<", pendingCutoff);
          if (protectIds.length > 0) {
            deleteQuery = deleteQuery.where("event_id", "not in", protectIds);
          }
          deleted += affectedRows(executeSqliteQuerySync(tx.db, deleteQuery));
        }
        if (completedCutoff !== null) {
          let deleteQuery = kysely
            .deleteFrom("channel_ingress_events")
            .where("queue_name", "=", queueName)
            .where("status", "=", "completed")
            .where("completed_at", "<", completedCutoff);
          if (protectIds.length > 0) {
            deleteQuery = deleteQuery.where("event_id", "not in", protectIds);
          }
          deleted += affectedRows(executeSqliteQuerySync(tx.db, deleteQuery));
        }
        if (failedCutoff !== null) {
          let deleteQuery = kysely
            .deleteFrom("channel_ingress_events")
            .where("queue_name", "=", queueName)
            .where("status", "=", "failed")
            .where("failed_at", "<", failedCutoff);
          if (protectIds.length > 0) {
            deleteQuery = deleteQuery.where("event_id", "not in", protectIds);
          }
          deleted += affectedRows(executeSqliteQuerySync(tx.db, deleteQuery));
        }
        const isSuppressedCompletionMetadata = (metadataJson: string | null): boolean => {
          if (!metadataJson) {
            return false;
          }
          try {
            const parsed = JSON.parse(metadataJson) as { ingressDisposition?: unknown };
            return parsed?.ingressDisposition === "suppressed";
          } catch {
            return false;
          }
        };

        const deleteStatusIds = (status: string, ids: string[]) => {
          if (ids.length === 0) {
            return;
          }
          deleted += affectedRows(
            executeSqliteQuerySync(
              tx.db,
              kysely
                .deleteFrom("channel_ingress_events")
                .where("queue_name", "=", queueName)
                .where("status", "=", status)
                .where("event_id", "in", ids),
            ),
          );
        };

        const pruneMaxEntries = (status: string, maxEntries: number | null) => {
          if (maxEntries === null) {
            return;
          }
          const batchSize = 500;
          const protectedSet = new Set(protectIds);
          while (true) {
            // Keep the newest maxEntries; delete the overflow tail.
            const ranked = executeSqliteQuerySync(
              tx.db,
              kysely
                .selectFrom("channel_ingress_events")
                .select(["event_id", "updated_at"])
                .where("queue_name", "=", queueName)
                .where("status", "=", status)
                .orderBy("updated_at", "desc")
                .orderBy("event_id", "desc")
                .limit(maxEntries + batchSize),
            ).rows;
            const ids = ranked
              .slice(maxEntries)
              .map((row) => row.event_id)
              .filter((id) => !protectedSet.has(id));
            if (ids.length === 0) {
              return;
            }
            deleteStatusIds(status, ids);
          }
        };

        // Completed retention contract (independent classes):
        // - Delivered replay guards and intentional-suppression tombstones each
        //   keep up to maxEntries newest non-protected rows of their own class.
        // - Suppression overflow never reduces delivered capacity (and vice versa).
        // - Protected IDs always retain duplicate protection and do not consume
        //   either class budget (total may exceed maxEntries when both classes
        //   and/or protected rows are present).
        const pruneCompletedMaxEntriesPartitioned = (maxEntries: number | null) => {
          if (maxEntries === null) {
            return;
          }
          const batchSize = 500;
          const protectedSet = new Set(protectIds);
          type CompletedPruneRow = {
            event_id: string;
            updated_at: number;
            completed_metadata_json: string | null;
          };
          const delivered: CompletedPruneRow[] = [];
          const suppressed: CompletedPruneRow[] = [];
          const protectedRows: CompletedPruneRow[] = [];
          let cursor: { updated_at: number; event_id: string } | undefined;
          while (true) {
            let select = kysely
              .selectFrom("channel_ingress_events")
              .select(["event_id", "updated_at", "completed_metadata_json"])
              .where("queue_name", "=", queueName)
              .where("status", "=", "completed");
            if (cursor) {
              const cursorUpdatedAt = cursor.updated_at;
              const cursorEventId = cursor.event_id;
              select = select.where((eb) =>
                eb.or([
                  eb("updated_at", "<", cursorUpdatedAt),
                  eb.and([
                    eb("updated_at", "=", cursorUpdatedAt),
                    eb("event_id", "<", cursorEventId),
                  ]),
                ]),
              );
            }
            const batch = executeSqliteQuerySync(
              tx.db,
              select.orderBy("updated_at", "desc").orderBy("event_id", "desc").limit(batchSize),
            ).rows as CompletedPruneRow[];
            if (batch.length === 0) {
              break;
            }
            for (const row of batch) {
              if (protectedSet.has(row.event_id)) {
                protectedRows.push(row);
                continue;
              }
              if (isSuppressedCompletionMetadata(row.completed_metadata_json)) {
                suppressed.push(row);
              } else {
                delivered.push(row);
              }
            }
            const last = batch[batch.length - 1];
            if (last === undefined) {
              break;
            }
            cursor = { updated_at: last.updated_at, event_id: last.event_id };
            if (batch.length < batchSize) {
              break;
            }
          }

          const keepIds = new Set<string>();
          for (const row of protectedRows) {
            keepIds.add(row.event_id);
          }
          // Independent per-class budgets — suppression churn cannot steal
          // delivered replay-guard seats.
          for (const row of delivered.slice(0, maxEntries)) {
            keepIds.add(row.event_id);
          }
          for (const row of suppressed.slice(0, maxEntries)) {
            keepIds.add(row.event_id);
          }

          const toDelete = [...protectedRows, ...delivered, ...suppressed]
            .map((row) => row.event_id)
            .filter((id) => !keepIds.has(id) && !protectedSet.has(id));
          for (let offset = 0; offset < toDelete.length; offset += batchSize) {
            deleteStatusIds("completed", toDelete.slice(offset, offset + batchSize));
          }
        };

        pruneMaxEntries("pending", pendingMaxEntries);
        pruneCompletedMaxEntriesPartitioned(completedMaxEntries);
        pruneMaxEntries("failed", failedMaxEntries);
        // Side-table storage stays bounded by live event rows; the per-queue
        // counter alone preserves never-reuse fences across re-enqueue.
        pruneOrphanEventGenerations(tx.db, queueName);
        return deleted;
      },
      { path: database.path },
    );
  };

  return {
    enqueue,
    listPending,
    listClaims,
    listFailed,
    claimNext,
    claim,
    refreshClaim,
    complete,
    release,
    fail,
    resubmit,
    delete: deleteEntry,
    recoverStaleClaims,
    prune,
  };
}
/* oxlint-disable max-lines -- TODO: split this grandfathered oversized file. */
