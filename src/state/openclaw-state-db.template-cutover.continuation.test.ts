// Continuation (karmaterminal): a jump-9 shared store is upstream's schema 35 plus the first-use
// continuation_records custody table. Upstream's schema-36 Template cutover runs at startup and
// must carry that table and its rows unchanged; reopening the migrated store changes nothing.
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import type { EngineConnection } from "../infra/sql-connection.js";
import { closeOpenClawStateDatabaseAsync, openOpenClawStateDatabase } from "./openclaw-state-db.js";
import { resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths.js";
import { getOpenClawStateFeatureSchemaSql } from "./openclaw-state-feature-schema.js";
import { OPENCLAW_STATE_SCHEMA_SQL } from "./openclaw-state-schema.js";

// Upstream's exact schema-35 source (the Template cutover suite pins its digest).
const legacySchema = readFileSync(
  new URL("../../test/fixtures/sqlite/openclaw-state-schema-v35.sql", import.meta.url),
  "utf8",
);

const dirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    await closeOpenClawStateDatabaseAsync();
    cleanup();
  }),
);

function custody(db: EngineConnection | DatabaseSync) {
  return {
    rows: db.prepare("SELECT * FROM continuation_records ORDER BY record_id").all(),
    schema: db
      .prepare("SELECT type, name, sql FROM sqlite_schema WHERE tbl_name = ? ORDER BY type, name")
      .all("continuation_records"),
  };
}

it("carries the continuation custody table through the schema-36 Template cutover", async () => {
  const root = dirs.make("state-template-cutover-continuation-");
  const env = {
    ...process.env,
    OPENCLAW_HOME: path.join(root, "home"),
    OPENCLAW_STATE_DIR: path.join(root, "state"),
    OPENCLAW_CONFIG_PATH: path.join(root, "openclaw.json"),
  };
  const pathname = resolveOpenClawStateSqlitePath(env);
  mkdirSync(path.dirname(pathname), { recursive: true });
  const before = (() => {
    using db = new DatabaseSync(pathname);
    db.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");
    db.exec(legacySchema);
    // The first-use ensure creates the table with both of its indexes.
    db.exec(getOpenClawStateFeatureSchemaSql("continuation_records"));
    for (const index of OPENCLAW_STATE_SCHEMA_SQL.match(
      /CREATE INDEX IF NOT EXISTS idx_continuation_records_\w+\s+ON continuation_records\([^)]*\);/gu,
    ) ?? []) {
      db.exec(index);
    }
    db.exec(`PRAGMA user_version = 35;
      INSERT INTO schema_meta VALUES ('primary', 'global', 35, NULL, 'jump-9-store', 100, 100);
      INSERT INTO config_machine_state VALUES ('state.schema.contentVersion', '35', 100);
      INSERT INTO continuation_records
        (record_id, kind, owner_session_key, status, revision, created_at, updated_at, due_at, state_json)
        VALUES ('jump-9-work', 'work', 'agent:main:main', 'queued', 0, 7, 7, 4102444800000,
          '{"reason":"carried across the cutover"}');`);
    db.exec("COMMIT; PRAGMA foreign_keys = ON;");
    return custody(db);
  })();
  expect(before.rows).toHaveLength(1);
  expect(before.schema.map((row) => row.name)).toEqual(
    expect.arrayContaining(["idx_continuation_records_due", "idx_continuation_records_owner"]),
  );

  const opened = openOpenClawStateDatabase({ path: pathname, env });
  expect(opened.db.prepare("PRAGMA user_version").get()?.user_version).toBe(36);
  expect(custody(opened.db)).toEqual(before);
  expect(opened.db.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
  await closeOpenClawStateDatabaseAsync();

  const reopened = openOpenClawStateDatabase({ path: pathname, env });
  expect(reopened.db.prepare("PRAGMA user_version").get()?.user_version).toBe(36);
  expect(custody(reopened.db)).toEqual(before);
});
