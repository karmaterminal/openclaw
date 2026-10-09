// Generic terminal, overwrite and prune paths over delivery_queue_entries must leave
// operator-quarantined rows intact while behaving as before for every other row.
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "../state/openclaw-state-db.js";
import {
  pruneDeliveryQueueTombstoneAges,
  pruneDeliveryQueueTombstones,
  upsertBoundDeliveryQueueEntryInDatabase,
} from "./delivery-queue-sqlite-bound.js";
import {
  completeDeliveryQueueEntryInDatabase,
  prepareDeliveryQueueTerminalEntry,
  terminalizePendingDeliveryQueueEntryInDatabase,
  upsertDeliveryQueueEntryInDatabase,
} from "./delivery-queue-sqlite.kernel.js";
import {
  OPERATOR_QUARANTINE_ERROR_PREFIX,
  type DeliveryQueueEntryState,
} from "./delivery-queue-sqlite.types.js";
import { quarantineSessionDeliveriesInDatabase } from "./session-delivery-queue-quarantine.kernel.js";
import { prepareSessionDeliveryEnqueue } from "./session-delivery-queue-storage.js";

const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
    cleanup();
  });
});
const REASON = `${OPERATOR_QUARANTINE_ERROR_PREFIX} held`;

type Row = Record<string, unknown> & { entry_json: string };

function setup() {
  const stateDir = tempDirs.make("openclaw-quarantine-exemptions-");
  const database = openOpenClawStateDatabase({ env: { OPENCLAW_STATE_DIR: stateDir } });
  const read = (id: string) =>
    database.db.prepare("SELECT * FROM delivery_queue_entries WHERE id = ?").get(id) as
      | Row
      | undefined;
  const enqueue = (run: string) => {
    const { id, bound } = prepareSessionDeliveryEnqueue({
      kind: "systemEvent",
      sessionKey: "agent:main:main",
      text: `result ${run}`,
      idempotencyKey: `continuation-return:${run}`,
    });
    upsertBoundDeliveryQueueEntryInDatabase(bound, database);
    return id;
  };
  const quarantined = enqueue("held");
  quarantineSessionDeliveriesInDatabase(database, {
    entries: [{ id: quarantined }],
    reason: REASON,
    now: Date.now(),
  });
  /** An ordinary failed row (not quarantined) as an older failure path left it. */
  const ordinaryFailed = enqueue("ordinary");
  database.db
    .prepare(
      "UPDATE delivery_queue_entries SET status = 'failed', last_error = 'boom', failed_at = ? WHERE id = ?",
    )
    .run(Date.now(), ordinaryFailed);
  const entryOf = (id: string) => JSON.parse(read(id)!.entry_json) as DeliveryQueueEntryState;
  return { database, read, enqueue, quarantined, ordinaryFailed, entryOf };
}

describe("operator quarantine exemptions", () => {
  it("failed-row terminalization skips quarantined rows and still compacts others", () => {
    const { database, read, quarantined, ordinaryFailed, entryOf } = setup();
    const before = read(quarantined);
    // Same CAS input shape the outbound finalizeFailure path uses, built from the stored bytes.
    const exact = (id: string) =>
      terminalizePendingDeliveryQueueEntryInDatabase(database, {
        ...prepareDeliveryQueueTerminalEntry({
          queueName: "session",
          id,
          entry: { ...entryOf(id), retainOnFailure: true },
          expectedStatus: "failed",
        }),
        expectedJson: read(id)!.entry_json,
      });
    expect(exact(quarantined)).toStrictEqual({ status: "not_pending" });
    expect(read(quarantined)).toStrictEqual(before);
    expect(exact(ordinaryFailed)).toMatchObject({ status: "terminalized" });
    expect(read(ordinaryFailed)).toMatchObject({ status: "failed", entry_kind: null });
  });

  it("failed-row deletion (no retention) skips quarantined rows and still deletes others", () => {
    const { database, read, quarantined, ordinaryFailed } = setup();
    const before = read(quarantined);
    const remove = (id: string) =>
      terminalizePendingDeliveryQueueEntryInDatabase(database, {
        queueName: "session",
        id,
        expectedJson: read(id)!.entry_json,
        expectedStatus: "failed",
        now: Date.now(),
        retention: undefined,
        failedEntry: undefined,
      });
    expect(remove(quarantined)).toStrictEqual({ status: "not_pending" });
    expect(read(quarantined)).toStrictEqual(before);
    expect(remove(ordinaryFailed)).toMatchObject({ status: "terminalized" });
    expect(read(ordinaryFailed)).toBeUndefined();
  });

  it("completion never overwrites a quarantined row and still completes others", () => {
    const { database, read, enqueue, quarantined } = setup();
    const before = read(quarantined);
    expect(() => completeDeliveryQueueEntryInDatabase(database, "session", quarantined)).toThrow(
      `No pending session delivery queue entry ${quarantined}`,
    );
    expect(read(quarantined)).toStrictEqual(before);
    const pending = enqueue("pending");
    completeDeliveryQueueEntryInDatabase(database, "session", pending);
    expect(read(pending)).toMatchObject({ status: "completed" });
  });

  it("replacement upserts never overwrite a quarantined row and still replace others", () => {
    const { database, read, quarantined, ordinaryFailed, entryOf } = setup();
    const before = read(quarantined);
    expect(
      upsertDeliveryQueueEntryInDatabase(
        { queueName: "session", entry: { ...entryOf(quarantined), retryCount: 9 } },
        database,
      ),
    ).toBe(false);
    expect(read(quarantined)).toStrictEqual(before);
    expect(
      upsertDeliveryQueueEntryInDatabase(
        { queueName: "session", entry: { ...entryOf(ordinaryFailed), retryCount: 9 } },
        database,
      ),
    ).toBe(true);
    expect(read(ordinaryFailed)).toMatchObject({ status: "pending", retry_count: 9 });
  });

  it("bounded receipt pruning skips quarantined rows and still prunes others", () => {
    const { database, read, quarantined, ordinaryFailed } = setup();
    // Synthetic: give both rows an expired bounded-retention shape the prune SQL selects.
    const makeBounded = (id: string) =>
      database.db
        .prepare(
          `UPDATE delivery_queue_entries
              SET recovery_state = 'completed_bounded', enqueued_at = 1,
                  entry_json = json_set(entry_json, '$.completionRetention',
                    json_object('idPrefix', substr(id, 1, 4), 'maxAgeMs', 1, 'maxEntries', 1))
            WHERE id = ?`,
        )
        .run(id);
    makeBounded(quarantined);
    makeBounded(ordinaryFailed);
    const before = read(quarantined);
    pruneDeliveryQueueTombstones(database.db, Date.now());
    pruneDeliveryQueueTombstoneAges(database.db, Date.now());
    expect(read(quarantined)).toStrictEqual(before);
    expect(read(ordinaryFailed)).toBeUndefined();
  });
});
