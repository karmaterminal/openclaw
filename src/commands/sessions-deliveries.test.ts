// Covers the offline operator commands for durable session deliveries.
import fs from "node:fs";
import fsPromises, { type FileHandle } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { resetConfigRuntimeState } from "../config/config.js";
import { seedDeliveryQueueEntry } from "../infra/delivery-queue-sqlite.test-support.js";
import {
  enqueueSessionDelivery,
  loadPendingSessionDeliveries,
} from "../infra/session-delivery-queue-storage.js";
import type { RuntimeEnv } from "../runtime.js";
import { getFileLockProcessStartTime } from "../shared/pid-alive.js";
import {
  closeOpenClawStateDatabaseAsync,
  openOpenClawStateDatabase,
  withOpenClawStateStartupMigrationCheckpointDatabase,
} from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import {
  sessionsDeliveriesListCommand,
  sessionsDeliveriesQuarantineCommand,
  sessionsDeliveriesRequeueCommand,
} from "./sessions-deliveries.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const SECRET = "secret-continuation-body";
const HOUR = 60 * 60_000;

function createRuntime() {
  const logs: string[] = [];
  const json: unknown[] = [];
  const runtime: RuntimeEnv & { writeJson: (value: unknown) => void } = {
    log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    error: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    exit: (code: number) => {
      throw new Error(`exit ${code}`);
    },
    writeStdout: (value: string) => logs.push(value),
    writeJson: (value: unknown) => json.push(value),
  } as RuntimeEnv & { writeJson: (value: unknown) => void };
  return { runtime, logs, json };
}

let stateDir: string;

function env() {
  return { ...process.env, OPENCLAW_STATE_DIR: stateDir };
}

function readRows(): Array<Record<string, unknown>> {
  const { db } = openOpenClawStateDatabase({ env: env() });
  return db
    .prepare("SELECT * FROM delivery_queue_entries WHERE queue_name = 'session' ORDER BY id")
    .all() as Array<Record<string, unknown>>;
}

function rowById(id: string) {
  return readRows().find((row) => row.id === id);
}

async function seed(params: { key: string; ageMs: number; text?: string }): Promise<string> {
  const queueContext = captureOpenClawStateWorkerContext({ env: env() });
  const id = await enqueueSessionDelivery(
    {
      kind: "systemEvent",
      sessionKey: "agent:main:discord:channel:1",
      text: params.text ?? SECRET,
      idempotencyKey: params.key,
    },
    queueContext,
  );
  const entry = (await loadPendingSessionDeliveries(queueContext)).find((e) => e.id === id)!;
  seedDeliveryQueueEntry({
    queueName: "session",
    entry: { ...entry, enqueuedAt: Date.now() - params.ageMs },
    stateDir,
  });
  return id;
}

function seedLiveGatewayOwnerLease() {
  withOpenClawStateStartupMigrationCheckpointDatabase(
    (db) => {
      db.prepare(
        `INSERT INTO state_leases
         (scope, lease_key, owner, expires_at, heartbeat_at, payload_json, created_at, updated_at)
         VALUES ('gateway-owner', 'global', 'running-gateway', ?, ?, ?, ?, ?)`,
      ).run(
        Date.now() + 300_000,
        Date.now(),
        JSON.stringify({
          owner: {
            pid: process.pid,
            host: hostname(),
            startedAt: getFileLockProcessStartTime(process.pid),
          },
          port: 19483,
          mode: "foreground",
          supervisor: null,
        }),
        Date.now(),
        Date.now(),
      );
    },
    { env: env() },
  );
}

beforeEach(() => {
  stateDir = tempDirs.make("openclaw-session-deliveries-cli-");
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), "{}\n");
  resetConfigRuntimeState();
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  vi.stubEnv("OPENCLAW_CONFIG_PATH", path.join(stateDir, "openclaw.json"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeOpenClawStateDatabaseAsync();
  resetConfigRuntimeState();
  vi.unstubAllEnvs();
});

describe("sessions deliveries", () => {
  it("lists text length and never the text", async () => {
    const id = await seed({ key: "continuation-return:run-1:abc", ageMs: 2 * HOUR });
    const human = createRuntime();
    await sessionsDeliveriesListCommand({}, human.runtime);
    const output = human.logs.join("\n");
    expect(output).toContain(id);
    expect(output).toContain(`textLength=${SECRET.length}`);
    expect(output).toContain("key=continuation-return ");
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain("run-1");

    const machine = createRuntime();
    await sessionsDeliveriesListCommand({ json: true }, machine.runtime);
    expect(machine.json).toMatchObject([
      {
        status: "pending",
        deliveries: [
          {
            id,
            sessionKey: "agent:main:discord:channel:1",
            entryKind: "systemEvent",
            idempotencyPrefix: "continuation-return",
            retryCount: 0,
            status: "pending",
            textLength: SECRET.length,
          },
        ],
      },
    ]);
    expect(JSON.stringify(machine.json)).not.toContain(SECRET);
  });

  it("refuses without a selector and refuses a prefix without --older-than", async () => {
    const { runtime } = createRuntime();
    await expect(sessionsDeliveriesQuarantineCommand({}, runtime)).rejects.toThrow(
      "Refusing to select rows implicitly",
    );
    await expect(sessionsDeliveriesRequeueCommand({ id: [] }, runtime)).rejects.toThrow(
      "Refusing to select rows implicitly",
    );
    await expect(
      sessionsDeliveriesQuarantineCommand(
        { idempotencyPrefix: "continuation-return:", apply: true },
        runtime,
      ),
    ).rejects.toThrow("--idempotency-prefix requires --older-than");
    await expect(
      sessionsDeliveriesQuarantineCommand(
        { idempotencyPrefix: "continuation-return:", olderThan: "24", apply: true },
        runtime,
      ),
    ).rejects.toThrow("--older-than needs a unit");
  });

  it("dry-run changes nothing; --apply moves exactly the selected rows", async () => {
    const oldA = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    const oldB = await seed({ key: "continuation-return:b", ageMs: 26 * HOUR });
    const fresh = await seed({ key: "continuation-return:c", ageMs: HOUR });
    const otherPrefix = await seed({ key: "post-compaction-delegate:d", ageMs: 30 * HOUR });
    const before = readRows();

    const dry = createRuntime();
    const preview = await sessionsDeliveriesQuarantineCommand(
      { idempotencyPrefix: "continuation-return:", olderThan: "24h" },
      dry.runtime,
    );
    expect(preview.dryRun).toBe(true);
    expect(preview.rows.map((row) => row.id).toSorted()).toStrictEqual([oldA, oldB].toSorted());
    expect(dry.logs.join("\n")).toContain("Dry run: would quarantine 2");
    expect(readRows()).toStrictEqual(before);

    const receiptPath = path.join(stateDir, "quarantine-receipt.json");
    const applied = await sessionsDeliveriesQuarantineCommand(
      {
        idempotencyPrefix: "continuation-return:",
        olderThan: "24h",
        reason: "fleet backlog",
        apply: true,
        receipt: receiptPath,
      },
      createRuntime().runtime,
    );
    expect(applied.rows).toHaveLength(2);
    for (const id of [oldA, oldB]) {
      expect(rowById(id)).toMatchObject({
        status: "failed",
        last_error: "operator-quarantine: fleet backlog",
      });
    }
    for (const id of [fresh, otherPrefix]) {
      expect(rowById(id)).toStrictEqual(before.find((row) => row.id === id));
    }
    const receiptText = fs.readFileSync(receiptPath, "utf8");
    expect(receiptText).not.toContain(SECRET);
    expect(JSON.parse(receiptText)).toMatchObject({
      command: "sessions deliveries quarantine",
      dryRun: false,
      reason: "operator-quarantine: fleet backlog",
      version: expect.any(String),
      rows: [
        {
          sessionKey: "agent:main:discord:channel:1",
          textLength: SECRET.length,
          statusBefore: "pending",
          statusAfter: "failed",
          applied: true,
        },
        { statusBefore: "pending", statusAfter: "failed", applied: true },
      ],
    });
  });

  it("quarantines by explicit id and requeues back to an equal pending row", async () => {
    const id = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    const other = await seed({ key: "continuation-return:b", ageMs: 30 * HOUR });
    const original = rowById(id)!;
    const otherBefore = rowById(other);

    await sessionsDeliveriesQuarantineCommand({ id: [id], apply: true }, createRuntime().runtime);
    expect(rowById(id)).toMatchObject({ status: "failed" });
    expect(rowById(other)).toStrictEqual(otherBefore);

    const dry = await sessionsDeliveriesRequeueCommand({ id: [id] }, createRuntime().runtime);
    expect(dry.rows).toMatchObject([{ id, statusBefore: "failed", statusAfter: "pending" }]);
    expect(rowById(id)).toMatchObject({ status: "failed" });

    await sessionsDeliveriesRequeueCommand({ id: [id], apply: true }, createRuntime().runtime);
    const { updated_at: _a, ...requeued } = rowById(id)!;
    const { updated_at: _b, ...expected } = original;
    expect(requeued).toStrictEqual(expected);
  });

  it("does not requeue rows that this command did not quarantine", async () => {
    const pending = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    const foreign = await seed({ key: "continuation-return:b", ageMs: 30 * HOUR });
    const { db } = openOpenClawStateDatabase({ env: env() });
    db.prepare(
      "UPDATE delivery_queue_entries SET status = 'failed', last_error = 'delivery exhausted' WHERE queue_name = 'session' AND id = ?",
    ).run(foreign);
    const before = readRows();

    for (const id of [pending, foreign]) {
      await expect(
        sessionsDeliveriesRequeueCommand({ id: [id], apply: true }, createRuntime().runtime),
      ).rejects.toThrow(`${id}: not quarantined by sessions deliveries quarantine`);
    }
    const byPrefix = await sessionsDeliveriesRequeueCommand(
      { idempotencyPrefix: "continuation-return:", olderThan: "1h", apply: true },
      createRuntime().runtime,
    );
    expect(byPrefix.rows).toStrictEqual([]);
    expect(byPrefix.applied).toBe(false);
    expect(byPrefix.skipped).toStrictEqual([
      {
        id: foreign,
        reason: "not quarantined by sessions deliveries quarantine (status failed)",
      },
    ]);
    expect(readRows()).toStrictEqual(before);
  });

  it("refuses while a Gateway owner lease is active for the state directory", async () => {
    const id = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    seedLiveGatewayOwnerLease();
    await closeOpenClawStateDatabaseAsync();
    const before = readRows();

    await expect(
      sessionsDeliveriesQuarantineCommand({ id: [id], apply: true }, createRuntime().runtime),
    ).rejects.toThrow("Another Gateway owner lease is still active for this state directory");
    await expect(
      sessionsDeliveriesQuarantineCommand({ id: [id] }, createRuntime().runtime),
    ).rejects.toThrow("No local mutation was attempted");
    await expect(sessionsDeliveriesListCommand({}, createRuntime().runtime)).rejects.toThrow(
      "Another Gateway owner lease is still active",
    );
    expect(readRows()).toStrictEqual(before);
  });

  it("refuses the whole quarantine when the second selected row is recovery-owned", async () => {
    const first = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    const second = await seed({ key: "continuation-return:b", ageMs: 30 * HOUR });
    const queueContext = captureOpenClawStateWorkerContext({ env: env() });
    const entry = (await loadPendingSessionDeliveries(queueContext)).find((e) => e.id === second);
    seedDeliveryQueueEntry({
      queueName: "session",
      entry: { ...entry!, settlementOutcome: "recovered" },
      stateDir,
    });
    const before = readRows();
    const receiptPath = path.join(stateDir, "refused-receipt.json");

    const { runtime } = createRuntime();
    await expect(
      sessionsDeliveriesQuarantineCommand(
        { id: [first, second], apply: true, receipt: receiptPath },
        runtime,
      ),
    ).rejects.toThrow(
      `Refusing sessions deliveries quarantine; nothing was changed. ${second}: owned by recovery settlement`,
    );
    expect(readRows()).toStrictEqual(before);
    expect(rowById(first)).toMatchObject({ status: "pending" });
    expect(JSON.parse(fs.readFileSync(receiptPath, "utf8"))).toMatchObject({
      applied: false,
      rows: [
        { id: first, applied: false },
        { id: second, applied: false },
      ],
      refused: [{ id: second, reason: expect.stringContaining("owned by recovery settlement") }],
    });
  });

  it("refuses the whole requeue when the second selected row was not quarantined here", async () => {
    const first = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    const second = await seed({ key: "continuation-return:b", ageMs: 30 * HOUR });
    await sessionsDeliveriesQuarantineCommand(
      { id: [first], apply: true },
      createRuntime().runtime,
    );
    const { db } = openOpenClawStateDatabase({ env: env() });
    db.prepare(
      "UPDATE delivery_queue_entries SET status = 'failed', last_error = 'delivery exhausted' WHERE queue_name = 'session' AND id = ?",
    ).run(second);
    const before = readRows();
    const receiptPath = path.join(stateDir, "refused-requeue.json");

    await expect(
      sessionsDeliveriesRequeueCommand(
        { id: [first, second], apply: true, receipt: receiptPath },
        createRuntime().runtime,
      ),
    ).rejects.toThrow(
      `Refusing sessions deliveries requeue; nothing was changed. ${second}: not quarantined by sessions deliveries quarantine`,
    );
    expect(readRows()).toStrictEqual(before);
    expect(rowById(first)).toMatchObject({ status: "failed" });
    expect(JSON.parse(fs.readFileSync(receiptPath, "utf8"))).toMatchObject({
      applied: false,
      rows: [
        { id: first, applied: false },
        { id: second, applied: false },
      ],
    });
  });

  it("refuses an existing or unwritable receipt path before any row changes", async () => {
    const id = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    const existing = path.join(stateDir, "existing.json");
    fs.writeFileSync(existing, "keep me\n");
    const before = readRows();

    for (const receipt of [existing, path.join(stateDir, "missing-dir", "receipt.json")]) {
      await expect(
        sessionsDeliveriesQuarantineCommand(
          { id: [id], apply: true, receipt },
          createRuntime().runtime,
        ),
      ).rejects.toThrow(`Cannot create receipt file ${receipt}`);
    }
    expect(readRows()).toStrictEqual(before);
    expect(fs.readFileSync(existing, "utf8")).toBe("keep me\n");
  });

  it("prints the full receipt and exits non-zero when the receipt file write fails after apply", async () => {
    const id = await seed({ key: "continuation-return:a", ageMs: 30 * HOUR });
    const receiptPath = path.join(stateDir, "receipt.json");
    const realOpen = fsPromises.open.bind(fsPromises);
    vi.spyOn(fsPromises, "open").mockImplementationOnce(async (...args) => {
      const handle = await realOpen(...args);
      return {
        writeFile: async () => {
          throw new Error("simulated disk full");
        },
        sync: () => handle.sync(),
        close: () => handle.close(),
      } as unknown as FileHandle;
    });
    const { runtime, logs } = createRuntime();

    await expect(
      sessionsDeliveriesQuarantineCommand({ id: [id], apply: true, receipt: receiptPath }, runtime),
    ).rejects.toThrow(
      `sessions deliveries quarantine WAS APPLIED to 1 rows and the receipt was printed above, but writing the receipt file ${receiptPath} failed: simulated disk full`,
    );
    expect(rowById(id)).toMatchObject({ status: "failed" });
    const printed = logs.join("\n");
    expect(printed).toContain("Quarantined 1 session deliveries");
    expect(printed).toContain(`- ${id} session=agent:main:discord:channel:1`);
    expect(printed).toContain(`textLength=${SECRET.length} pending -> failed`);
    expect(printed).toContain("applied=true dryRun=false");
    expect(printed).not.toContain(SECRET);
    // The pre-created file exists with owner-only permissions; the stdout receipt is the record.
    expect(fs.statSync(receiptPath).mode & 0o777).toBe(0o600);
  });
});
