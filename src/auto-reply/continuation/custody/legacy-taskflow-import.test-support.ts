// Fixtures for the continuation TaskFlow custody import: C-era `flow_runs`
// rows, legacy payload files, C-era session-queue entries and registry rows,
// written straight into a real temporary state database. All content is
// synthetic, with sentinels a receipt byte-search can look for.
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { upsertBoundDeliveryQueueEntryInDatabase } from "../../../infra/delivery-queue-sqlite-bound.js";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../../../infra/kysely-sync.js";
import {
  buildPostCompactionDelegateDeliveryPayload,
  prepareSessionDeliveryEnqueue,
} from "../../../infra/session-delivery-queue-storage.js";
import { tableExists } from "../../../state/openclaw-state-db-schema-helpers.js";
import type { DB } from "../../../state/openclaw-state-db.generated.js";
import { runOpenClawStateWriteTransaction } from "../../../state/openclaw-state-db.js";

export const OWNER_A = "agent:main:telegram:direct:owner-a";
export const OWNER_B = "agent:main:telegram:direct:owner-b";
/** Sentinels that must never appear in a receipt. */
export const SECRET_TASK = "SENTINEL-TASK-TEXT-7f3a";
export const SECRET_BYTES = "SENTINEL-ATTACHMENT-BYTES-91c2";
export const SECRET_REASON = "SENTINEL-REASON-0d44";

export type Options = { env: NodeJS.ProcessEnv };

export function stateDirOf(options: Options): string {
  return options.env.OPENCLAW_STATE_DIR as string;
}

type Db = Pick<
  DB,
  | "flow_runs"
  | "subagent_runs"
  | "delivery_queue_entries"
  | "migration_sources"
  | "migration_runs"
  | "continuation_records"
>;

export function kysely(db: DatabaseSync) {
  return getNodeSqliteKysely<Db>(db);
}

export function write<T>(options: Options, operation: (db: DatabaseSync) => T): T {
  return runOpenClawStateWriteTransaction(({ db }) => operation(db), options);
}

export type FlowSeed = {
  flowId: string;
  owner?: string;
  controller?: "work" | "delegate" | "post-compaction" | "other";
  status: string;
  state: unknown;
  revision?: number;
  createdAt?: number;
  updatedAt?: number;
  endedAt?: number | null;
  cancelRequestedAt?: number | null;
  currentStep?: string;
  blockedSummary?: string;
  chainId?: string;
};

const CONTROLLERS = {
  work: "core/continuation-work",
  delegate: "core/continuation-delegate",
  "post-compaction": "core/continuation-post-compaction",
  other: "core/some-other-controller",
} as const;

export function seedFlow(options: Options, seed: FlowSeed): void {
  write(options, (db) =>
    executeSqliteQuerySync(
      db,
      kysely(db)
        .insertInto("flow_runs")
        .values({
          flow_id: seed.flowId,
          sync_mode: "managed",
          owner_key: seed.owner ?? OWNER_A,
          chain_id: seed.chainId ?? null,
          controller_id: CONTROLLERS[seed.controller ?? "work"],
          revision: seed.revision ?? 3,
          status: seed.status,
          notify_policy: "silent",
          goal: "Continuation",
          current_step: seed.currentStep ?? null,
          blocked_summary: seed.blockedSummary ?? null,
          state_json: JSON.stringify(seed.state),
          cancel_requested_at: seed.cancelRequestedAt ?? null,
          created_at: seed.createdAt ?? 1_000,
          updated_at: seed.updatedAt ?? 2_000,
          ended_at: seed.endedAt ?? null,
        }),
    ),
  );
}

export function workState(extra: Record<string, unknown> = {}) {
  return {
    kind: "continuation_work",
    sessionKey: OWNER_A,
    hop: 1,
    delayMs: 500,
    electedAt: 1_000,
    dueAt: 1_500,
    maxChainLength: 10,
    reason: SECRET_REASON,
    ...extra,
  };
}

export function delegateState(extra: Record<string, unknown> = {}) {
  return { kind: "continuation_delegate", task: SECRET_TASK, delayMs: 250, ...extra };
}

export function postCompactionState(extra: Record<string, unknown> = {}) {
  return {
    kind: "continuation_delegate",
    task: SECRET_TASK,
    postCompaction: true,
    firstArmedAt: 1_000,
    ...extra,
  };
}

export function inlineAttachments() {
  return [{ name: "notes.txt", content: SECRET_BYTES, encoding: "utf8" as const }];
}

export function writeLegacyPayload(
  options: Options,
  params: {
    attachmentId: string;
    flowId: string;
    owner?: string;
    attachAs?: { mountPath: string };
  },
): string {
  const dir = path.join(stateDirOf(options), "attachments", "continuation", params.attachmentId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "payload.json");
  fs.writeFileSync(
    file,
    `${JSON.stringify({
      version: 1,
      flowId: params.flowId,
      ownerKey: params.owner ?? OWNER_A,
      attachments: inlineAttachments(),
      ...(params.attachAs ? { attachAs: params.attachAs } : {}),
    })}\n`,
    { mode: 0o600 },
  );
  return file;
}

export function newRootPayloadPath(options: Options, attachmentId: string): string {
  return path.join(
    stateDirOf(options),
    "attachments",
    "continuation-custody",
    attachmentId,
    "payload.json",
  );
}

/** A C-era `postCompactionDelegate` queue entry: no `childRunId` exists in C's payload. */
export function seedPreCutoverEntry(
  options: Options,
  params: {
    owner?: string;
    sourceFlowId?: string;
    sequence?: number;
    extra?: Record<string, unknown>;
  } = {},
): string {
  const payload = buildPostCompactionDelegateDeliveryPayload({
    sessionKey: params.owner ?? OWNER_A,
    delegate: {
      task: SECRET_TASK,
      createdAt: 1_000,
      attachments: inlineAttachments(),
      ...(params.sourceFlowId ? { flowId: params.sourceFlowId, expectedRevision: 4 } : {}),
    },
    sequence: params.sequence ?? 0,
  });
  const { id, bound } = prepareSessionDeliveryEnqueue(payload, 1_100);
  if (params.extra) {
    bound.row.entry_json = JSON.stringify({ ...JSON.parse(bound.row.entry_json), ...params.extra });
  }
  runOpenClawStateWriteTransaction((database) => {
    upsertBoundDeliveryQueueEntryInDatabase(bound, database);
  }, options);
  return id;
}

export function seedSubagentRun(
  options: Options,
  params: { runId: string; childSessionKey: string; requester: string },
): void {
  write(options, (db) =>
    executeSqliteQuerySync(
      db,
      kysely(db).insertInto("subagent_runs").values({
        run_id: params.runId,
        child_session_key: params.childSessionKey,
        requester_session_key: params.requester,
        created_at: 1_500,
        payload_json: "{}",
      }),
    ),
  );
}

export function readFlow(options: Options, flowId: string) {
  return write(options, (db) =>
    executeSqliteQuerySync(
      db,
      kysely(db).selectFrom("flow_runs").selectAll().where("flow_id", "=", flowId),
    ).rows.at(0),
  );
}

export function readQueue(options: Options) {
  return write(
    options,
    (db) =>
      executeSqliteQuerySync(
        db,
        kysely(db).selectFrom("delivery_queue_entries").selectAll().orderBy("id"),
      ).rows,
  );
}

export function spawnInterruptedNotices(options: Options) {
  return readQueue(options).filter(
    (row) =>
      row.status === "pending" &&
      row.entry_kind === "systemEvent" &&
      row.entry_json.includes("[continuation:delegate-spawn-interrupted]"),
  );
}

export function readReceipts(options: Options) {
  return write(
    options,
    (db) =>
      executeSqliteQuerySync(
        db,
        kysely(db).selectFrom("migration_sources").selectAll().orderBy("source_key"),
      ).rows,
  );
}

/** Row-level dump of every table the import writes, for idempotency and rollback proofs. */
export function dumpState(options: Options) {
  return write(options, (db) => {
    const q = kysely(db);
    return {
      flowRuns: executeSqliteQuerySync(db, q.selectFrom("flow_runs").selectAll().orderBy("flow_id"))
        .rows,
      records: tableExists(db, "continuation_records")
        ? executeSqliteQuerySync(
            db,
            q.selectFrom("continuation_records").selectAll().orderBy("record_id"),
          ).rows
        : [],
      queue: executeSqliteQuerySync(
        db,
        q.selectFrom("delivery_queue_entries").selectAll().orderBy("id"),
      ).rows,
      sources: executeSqliteQuerySync(
        db,
        q.selectFrom("migration_sources").selectAll().orderBy("source_key"),
      ).rows,
      runs: executeSqliteQuerySync(db, q.selectFrom("migration_runs").selectAll().orderBy("id"))
        .rows,
    };
  });
}
