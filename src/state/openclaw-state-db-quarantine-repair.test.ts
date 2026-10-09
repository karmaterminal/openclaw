// Doctor state repair must keep operator-quarantined delivery rows. Incident: on one seat,
// `doctor --fix` deleted 23 quarantined continuation returns through the legacy failure
// compaction that the repair-scope additive backfill runs.
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  bindDeliveryQueueEntry,
  upsertBoundDeliveryQueueEntryInDatabase,
} from "../infra/delivery-queue-sqlite-bound.js";
import { OPERATOR_QUARANTINE_ERROR_PREFIX } from "../infra/delivery-queue-sqlite.types.js";
import {
  quarantineSessionDeliveriesInDatabase,
  requeueQuarantinedSessionDeliveriesInDatabase,
} from "../infra/session-delivery-queue-quarantine.kernel.js";
import { prepareSessionDeliveryEnqueue } from "../infra/session-delivery-queue-storage.js";
import type { QueuedSessionDelivery } from "../infra/session-delivery-queue.records.js";
import { ensureAdditiveStateColumns } from "./openclaw-state-db-schema-additive.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
  repairOpenClawStateDatabaseSchema,
} from "./openclaw-state-db.js";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
    cleanup();
  });
});
const REASON = `${OPERATOR_QUARANTINE_ERROR_PREFIX} stale continuation returns`;

type Row = Record<string, unknown> & { entry_json: string };

function options(stateDir: string) {
  return { env: { OPENCLAW_STATE_DIR: stateDir } };
}

function database(stateDir: string) {
  return openOpenClawStateDatabase(options(stateDir));
}

function readRow(stateDir: string, id: string): Row | undefined {
  return database(stateDir)
    .db.prepare("SELECT * FROM delivery_queue_entries WHERE id = ?")
    .get(id) as Row | undefined;
}

/** Enqueue through the product's own enqueue binding, as the gateway does. */
function enqueueContinuationReturn(stateDir: string, run: string): string {
  const { id, bound } = prepareSessionDeliveryEnqueue({
    kind: "systemEvent",
    sessionKey: "agent:main:discord:channel:1",
    text: `day-old continuation result ${run}`,
    idempotencyKey: `continuation-return:${run}`,
  });
  upsertBoundDeliveryQueueEntryInDatabase(bound, database(stateDir));
  return id;
}

function quarantine(stateDir: string, id: string): void {
  quarantineSessionDeliveriesInDatabase(database(stateDir), {
    entries: [{ id }],
    reason: REASON,
    now: Date.now(),
  });
}

/** A failed row written by an older runtime, optionally with authored retention. */
function seedLegacyFailedRow(stateDir: string, id: string, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  database(stateDir)
    .db.prepare(
      `INSERT INTO delivery_queue_entries
         (queue_name, id, status, entry_kind, session_key, entry_json, enqueued_at, updated_at,
          failed_at, retry_count, last_error)
       VALUES ('session', ?, 'failed', 'systemEvent', 'agent:main:main', ?, ?, ?, ?, 2, 'boom')`,
    )
    .run(
      id,
      JSON.stringify({ id, enqueuedAt: now, retryCount: 2, kind: "systemEvent", ...extra }),
      now,
      now,
      now,
    );
}

function runDoctorRepair(stateDir: string): void {
  closeOpenClawStateDatabaseForTest();
  repairOpenClawStateDatabaseSchema(options(stateDir));
  closeOpenClawStateDatabaseForTest();
}

describe("doctor state repair and operator quarantine", () => {
  it("keeps a quarantined row byte-equal through two doctor repairs and it still requeues", () => {
    const stateDir = tempDirs.make("openclaw-quarantine-repair-");
    const quarantined = enqueueContinuationReturn(stateDir, "run-1");
    quarantine(stateDir, quarantined);
    seedLegacyFailedRow(stateDir, "legacy-ordinary");
    seedLegacyFailedRow(stateDir, "legacy-retained", { retainOnFailure: true });
    const before = readRow(stateDir, quarantined);
    expect(before).toMatchObject({ status: "failed", last_error: REASON });

    for (const run of [1, 2]) {
      runDoctorRepair(stateDir);
      expect(readRow(stateDir, quarantined), `repair run ${run}`).toStrictEqual(before);
    }
    // Rows that are not quarantined keep the existing behaviour: no retention -> deleted,
    // authored retention -> compacted to a payload-free stub.
    expect(readRow(stateDir, "legacy-ordinary")).toBeUndefined();
    const retained = readRow(stateDir, "legacy-retained");
    expect(retained).toMatchObject({
      status: "failed",
      entry_kind: null,
      session_key: null,
      last_error: null,
      recovery_state: "completed_permanent",
    });
    expect(JSON.parse(retained!.entry_json)).not.toHaveProperty("kind");

    requeueQuarantinedSessionDeliveriesInDatabase(database(stateDir), {
      entries: [{ id: quarantined }],
      now: Date.now(),
    });
    expect(readRow(stateDir, quarantined)).toMatchObject({
      status: "pending",
      retry_count: 0,
      last_error: null,
      failed_at: null,
      entry_json: before!.entry_json,
    });
  });

  it("exempts quarantined rows from the repair-scope additive backfill itself", () => {
    const stateDir = tempDirs.make("openclaw-quarantine-additive-");
    const quarantined = enqueueContinuationReturn(stateDir, "run-1");
    quarantine(stateDir, quarantined);
    seedLegacyFailedRow(stateDir, "legacy-ordinary");
    const before = readRow(stateDir, quarantined);

    ensureAdditiveStateColumns(database(stateDir).db, "repair");
    ensureAdditiveStateColumns(database(stateDir).db, "repair");

    expect(readRow(stateDir, quarantined)).toStrictEqual(before);
    expect(readRow(stateDir, "legacy-ordinary")).toBeUndefined();
  });

  it("documents what doctor repair does to pending continuation-return rows", () => {
    const stateDir = tempDirs.make("openclaw-quarantine-pending-");
    // A plainly enqueued continuation return carries no retention evidence: repair leaves it
    // byte-equal, so running doctor before quarantine does not change its payload.
    const plain = enqueueContinuationReturn(stateDir, "plain");
    const plainBefore = readRow(stateDir, plain);
    // A pending row with ambiguous send evidence (an attempt was started) is marked
    // retainOnFailure by repair; only that flag is added, the payload text is unchanged.
    const { bound } = prepareSessionDeliveryEnqueue({
      kind: "systemEvent",
      sessionKey: "agent:main:discord:channel:1",
      text: "attempted continuation result",
      idempotencyKey: "continuation-return:attempted",
    });
    const attemptedEntry = {
      ...(JSON.parse(bound.row.entry_json) as QueuedSessionDelivery),
      deliveryStartedAt: Date.now(),
    };
    upsertBoundDeliveryQueueEntryInDatabase(
      bindDeliveryQueueEntry({ queueName: "session", entry: attemptedEntry, insertOnly: true }),
      database(stateDir),
    );
    const attemptedBefore = JSON.parse(readRow(stateDir, attemptedEntry.id)!.entry_json);

    runDoctorRepair(stateDir);

    expect(readRow(stateDir, plain)).toStrictEqual(plainBefore);
    const attemptedAfter = readRow(stateDir, attemptedEntry.id);
    expect(attemptedAfter).toMatchObject({ status: "pending" });
    expect(JSON.parse(attemptedAfter!.entry_json)).toStrictEqual({
      ...attemptedBefore,
      retainOnFailure: true,
    });
  });
});
