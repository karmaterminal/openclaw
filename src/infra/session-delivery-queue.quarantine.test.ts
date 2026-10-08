// Covers reversible operator quarantine and requeue of durable session deliveries.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInfoWarnErrorLogger } from "../../test/helpers/mock-logger.js";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { seedDeliveryQueueEntry } from "./delivery-queue-sqlite.test-support.js";

const sleepMock = vi.hoisted(() => vi.fn<(ms: number) => Promise<void>>());
vi.mock("../utils/sleep.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/sleep.js")>()),
  sleep: sleepMock,
}));

import { recoverPendingSessionDeliveries } from "./session-delivery-queue-recovery.js";
import {
  enqueueSessionDelivery,
  failSessionDelivery,
  listSessionDeliverySummaries,
  loadPendingSessionDeliveries,
  quarantineSessionDelivery,
  requeueQuarantinedSessionDelivery,
  SESSION_DELIVERY_QUARANTINE_REASON_PREFIX,
} from "./session-delivery-queue-storage.js";
import { withSessionDeliveryQueue } from "./session-delivery-queue.test-helpers.js";

const REASON = `${SESSION_DELIVERY_QUARANTINE_REASON_PREFIX} test`;

type RawRow = Record<string, unknown> & { entry_json: string };

function readRawRow(stateDir: string, id: string): RawRow | undefined {
  const { db } = openOpenClawStateDatabase({
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
  });
  return db
    .prepare("SELECT * FROM delivery_queue_entries WHERE queue_name = 'session' AND id = ?")
    .get(id) as RawRow | undefined;
}

function markFailedForeign(stateDir: string, id: string, lastError: string): void {
  const { db } = openOpenClawStateDatabase({
    env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
  });
  db.prepare(
    "UPDATE delivery_queue_entries SET status = 'failed', last_error = ?, failed_at = ? WHERE queue_name = 'session' AND id = ?",
  ).run(lastError, Date.now(), id);
}

describe("session delivery operator quarantine", () => {
  beforeEach(() => {
    sleepMock.mockReset();
    sleepMock.mockResolvedValue(undefined);
  });

  it("round-trips a row: quarantine parks it intact, requeue restores it, recovery delivers it", async () => {
    await withSessionDeliveryQueue(async (stateDir, queueContext) => {
      const id = await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "day-old continuation result",
          idempotencyKey: "continuation-return:run-1",
        },
        queueContext,
      );
      const otherId = await enqueueSessionDelivery(
        { kind: "systemEvent", sessionKey: "agent:main:other", text: "unrelated" },
        queueContext,
      );
      await failSessionDelivery(id, "transient channel error", queueContext);
      const original = readRawRow(stateDir, id)!;
      const other = readRawRow(stateDir, otherId);
      expect(original).toMatchObject({ status: "pending", retry_count: 1 });

      await quarantineSessionDelivery(id, REASON, queueContext);
      const quarantined = readRawRow(stateDir, id)!;
      expect(quarantined).toMatchObject({ status: "failed", last_error: REASON });
      expect(quarantined.entry_json).toBe(original.entry_json);
      expect(readRawRow(stateDir, otherId)).toStrictEqual(other);
      expect((await loadPendingSessionDeliveries(queueContext)).map((e) => e.id)).toStrictEqual([
        otherId,
      ]);

      await requeueQuarantinedSessionDelivery(id, queueContext);
      const requeued = readRawRow(stateDir, id)!;
      const changed = new Set([
        "status",
        "retry_count",
        "last_attempt_at",
        "last_error",
        "failed_at",
        "updated_at",
        "entry_json",
      ]);
      const stable = (row: RawRow) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => !changed.has(key)));
      expect(stable(requeued)).toStrictEqual(stable(original));
      expect(requeued).toMatchObject({
        status: "pending",
        retry_count: 0,
        last_attempt_at: null,
        last_error: null,
        failed_at: null,
      });
      const {
        retryCount: _originalRetry,
        lastError: _originalError,
        lastAttemptAt: _originalAttempt,
        ...originalPayload
      } = JSON.parse(original.entry_json) as Record<string, unknown>;
      expect(JSON.parse(requeued.entry_json)).toStrictEqual({ ...originalPayload, retryCount: 0 });

      const deliver = vi.fn(async () => undefined);
      const summary = await recoverPendingSessionDeliveries({
        deliver,
        queueContext,
        log: createInfoWarnErrorLogger(),
      });
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({ id, text: "day-old continuation result", retryCount: 0 }),
        { queueContext },
      );
      expect(deliver).toHaveBeenCalledTimes(2);
      expect(summary.recovered).toBe(2);
      expect(readRawRow(stateDir, id)).toMatchObject({ status: "completed" });
    });
  });

  it("keeps quarantined rows out of boot recovery", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      const id = await enqueueSessionDelivery(
        { kind: "systemEvent", sessionKey: "agent:main:main", text: "stale" },
        queueContext,
      );
      await quarantineSessionDelivery(id, REASON, queueContext);
      const deliver = vi.fn(async () => undefined);
      await recoverPendingSessionDeliveries({
        deliver,
        queueContext,
        log: createInfoWarnErrorLogger(),
      });
      expect(deliver).not.toHaveBeenCalled();
      expect(await listSessionDeliverySummaries(["failed"], queueContext)).toMatchObject([
        { id, status: "failed", quarantineReason: REASON, textLength: "stale".length },
      ]);
    });
  });

  it("summaries expose text length but never text", async () => {
    await withSessionDeliveryQueue(async (_stateDir, queueContext) => {
      await enqueueSessionDelivery(
        {
          kind: "systemEvent",
          sessionKey: "agent:main:main",
          text: "secret-body-text",
          idempotencyKey: "continuation-return:abc",
        },
        queueContext,
      );
      const summaries = await listSessionDeliverySummaries(["pending"], queueContext);
      expect(summaries).toMatchObject([
        {
          entryKind: "systemEvent",
          sessionKey: "agent:main:main",
          idempotencyKey: "continuation-return:abc",
          textLength: "secret-body-text".length,
          quarantineReason: null,
        },
      ]);
      expect(JSON.stringify(summaries)).not.toContain("secret-body-text");
    });
  });

  it("does not requeue failed rows that operator quarantine did not park", async () => {
    await withSessionDeliveryQueue(async (stateDir, queueContext) => {
      const foreign = await enqueueSessionDelivery(
        { kind: "systemEvent", sessionKey: "agent:main:main", text: "a" },
        queueContext,
      );
      const pending = await enqueueSessionDelivery(
        { kind: "systemEvent", sessionKey: "agent:main:main", text: "b" },
        queueContext,
      );
      markFailedForeign(stateDir, foreign, "delivery exhausted");
      const before = readRawRow(stateDir, foreign);

      await expect(requeueQuarantinedSessionDelivery(foreign, queueContext)).rejects.toThrow(
        "No operator-quarantined session delivery",
      );
      await expect(requeueQuarantinedSessionDelivery(pending, queueContext)).rejects.toThrow(
        "No operator-quarantined session delivery",
      );
      expect(readRawRow(stateDir, foreign)).toStrictEqual(before);
      expect(readRawRow(stateDir, pending)).toMatchObject({ status: "pending" });
    });
  });

  it("refuses reasons without the operator prefix and rows that are not pending", async () => {
    await withSessionDeliveryQueue(async (stateDir, queueContext) => {
      const id = await enqueueSessionDelivery(
        { kind: "systemEvent", sessionKey: "agent:main:main", text: "a" },
        queueContext,
      );
      await expect(quarantineSessionDelivery(id, "manual", queueContext)).rejects.toThrow(
        SESSION_DELIVERY_QUARANTINE_REASON_PREFIX,
      );
      await expect(quarantineSessionDelivery("missing", REASON, queueContext)).rejects.toThrow(
        "No pending session delivery queue entry missing",
      );
      expect(readRawRow(stateDir, id)).toMatchObject({ status: "pending", last_error: null });
      // Replaying the same quarantine after it committed settles idempotently.
      await quarantineSessionDelivery(id, REASON, queueContext);
      await quarantineSessionDelivery(id, REASON, queueContext);
      expect(readRawRow(stateDir, id)).toMatchObject({ status: "failed", last_error: REASON });
    });
  });

  it("refuses rows that recovery still owns for settlement", async () => {
    await withSessionDeliveryQueue(async (stateDir, queueContext) => {
      const id = await enqueueSessionDelivery(
        { kind: "systemEvent", sessionKey: "agent:main:main", text: "a" },
        queueContext,
      );
      const [entry] = await loadPendingSessionDeliveries(queueContext);
      seedDeliveryQueueEntry({
        queueName: "session",
        entry: { ...entry!, acknowledgedAt: Date.now() },
        stateDir,
      });
      await expect(quarantineSessionDelivery(id, REASON, queueContext)).rejects.toThrow(
        "owned by recovery settlement",
      );
      expect(readRawRow(stateDir, id)).toMatchObject({ status: "pending" });
    });
  });
});
