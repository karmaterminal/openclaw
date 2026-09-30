// Doctor recovery preserves orphan task delivery payload bytes from a 2026.7.1-2 state database.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import {
  closeOpenClawStateDatabaseAsync,
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
  repairOpenClawStateDatabaseSchema,
  withOpenClawStateStartupMigrationCheckpointDatabase,
} from "./openclaw-state-db.js";
import { resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths.js";

const stateDbTempDirs: string[] = [];

const V2026_7_1_2_STATE_FIXTURE_URL = new URL(
  "../../test/fixtures/sqlite/openclaw-state-v2026.7.1-2.sqlite.gz",
  import.meta.url,
);

function createTempStateDir(): string {
  return makeTempDir(stateDbTempDirs, "openclaw-state-db-");
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function materializeV2026_7_1_2StateDatabase(stateDir: string): {
  compressedSha256: string;
  databasePath: string;
  rawSha256: string;
} {
  const compressed = fs.readFileSync(V2026_7_1_2_STATE_FIXTURE_URL);
  const raw = gunzipSync(compressed);
  const databasePath = resolveOpenClawStateSqlitePath({ OPENCLAW_STATE_DIR: stateDir });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.writeFileSync(databasePath, raw);
  return {
    compressedSha256: sha256(compressed),
    databasePath,
    rawSha256: sha256(raw),
  };
}

afterAll(async () => {
  await closeOpenClawStateDatabaseAsync();
  cleanupTempDirs(stateDbTempDirs);
});

afterEach(async () => {
  await closeOpenClawStateDatabaseAsync();
  closeOpenClawStateDatabaseForTest();
  vi.restoreAllMocks();
});

describe("openclaw state database", () => {
  it("preserves orphan delivery payload before Doctor recovery from 2026.7.1-2", () => {
    const stateDir = createTempStateDir();
    const databasePath = materializeV2026_7_1_2StateDatabase(stateDir).databasePath;
    const options = { env: { OPENCLAW_STATE_DIR: stateDir } };
    const { DatabaseSync } = requireNodeSqlite();
    const corrupted = new DatabaseSync(databasePath);
    const payload = '  {"channel":"synthetic","to":"recover-me"}\n\u0000';
    const timestamp = 9007199254740993n;
    try {
      corrupted.exec(
        "PRAGMA foreign_keys = OFF; PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;",
      );
      corrupted.exec(`INSERT INTO task_runs
          (task_id,runtime,owner_key,scope_kind,task,status,delivery_status,notify_policy,created_at)
          VALUES ('healthy-task','subagent','synthetic-owner','session','keep me','completed','delivered','silent',1);
          INSERT INTO task_delivery_state(task_id) VALUES ('healthy-task');`);
      const insert = corrupted.prepare(`INSERT INTO task_delivery_state
          (task_id,requester_origin_json,last_notified_event_at) VALUES (?,?,?)`);
      for (let index = 0; index < 18; index += 1) {
        insert.run(`missing-task-${index}`, payload, timestamp);
      }
      expect(corrupted.prepare("PRAGMA integrity_check").get()).toEqual({
        integrity_check: "ok",
      });
      expect(corrupted.prepare("PRAGMA foreign_key_check").all()).toHaveLength(18);
      expect(fs.statSync(`${databasePath}-wal`).size).toBeGreaterThan(0);
      const failure = /foreign_key_check failed.*task_delivery_state.*references task_runs/iu;
      expect(() => openOpenClawStateDatabase(options)).toThrow(failure);
      const checkpointCallback = vi.fn();
      expect(() =>
        withOpenClawStateStartupMigrationCheckpointDatabase(checkpointCallback, options),
      ).toThrow(failure);
      expect(checkpointCallback).not.toHaveBeenCalled();

      const result = repairOpenClawStateDatabaseSchema(options);
      expect(result.warnings).toEqual([]);
      expect(result.changes).toContainEqual(
        expect.stringContaining("Preserved and recovered 18 orphan task delivery rows"),
      );
      const recoveryDirs = fs
        .readdirSync(path.dirname(databasePath))
        .filter((name) => name.startsWith("openclaw-task-delivery-recovery-"));
      expect(recoveryDirs).toHaveLength(1);
      const recoveryDir = path.join(path.dirname(databasePath), recoveryDirs[0]!);
      const backup = new DatabaseSync(path.join(recoveryDir, "database.sqlite"), {
        readOnly: true,
      });
      try {
        expect(backup.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
        expect(backup.prepare("PRAGMA foreign_key_check").all()).toHaveLength(18);
        const row = backup.prepare(
          "SELECT hex(requester_origin_json) AS requester_origin_hex,last_notified_event_at FROM task_delivery_state WHERE task_id = ?",
        );
        row.setReadBigInts(true);
        expect(row.get("missing-task-0")).toEqual({
          requester_origin_hex: Buffer.from(payload).toString("hex").toUpperCase(),
          last_notified_event_at: timestamp,
        });
      } finally {
        backup.close();
      }
      const exported = fs
        .readFileSync(path.join(recoveryDir, "orphan-rows.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(exported).toHaveLength(18);
      expect(exported[0]).toMatchObject({
        requester_origin_json: payload,
        requester_origin_json_base64: Buffer.from(payload).toString("base64"),
        last_notified_event_at: timestamp.toString(),
      });
      const repaired = openOpenClawStateDatabase(options);
      expect(repaired.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(repaired.db.prepare("PRAGMA integrity_check").get()).toEqual({
        integrity_check: "ok",
      });
      expect(repaired.db.prepare("SELECT task_id FROM task_delivery_state").all()).toContainEqual({
        task_id: "healthy-task",
      });
      expect(
        repaired.db
          .prepare("SELECT 1 FROM task_delivery_state WHERE task_id LIKE 'missing-task-%'")
          .all(),
      ).toEqual([]);
      expect(repairOpenClawStateDatabaseSchema(options).warnings).toEqual([]);
      expect(
        fs
          .readdirSync(path.dirname(databasePath))
          .filter((name) => name.startsWith("openclaw-task-delivery-recovery-")),
      ).toEqual(recoveryDirs);
    } finally {
      corrupted.close();
    }
  });
});
