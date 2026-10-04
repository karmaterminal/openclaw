import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  classifyContinuationRecordsV20Shape,
  readCanonicalContinuationRecordsSchema,
  repairContinuationRecordsV20Shape,
  type ContinuationRecordsV20Shape,
} from "./openclaw-state-db-continuation-shape-repair.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
  repairOpenClawStateDatabaseSchema,
} from "./openclaw-state-db.js";
import { OPENCLAW_STATE_SCHEMA_SQL } from "./openclaw-state-schema.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
afterEach(() => closeOpenClawStateDatabaseForTest());

// The two v20 definitions differ only in this CHECK list (#1423); derive both from this build.
const NOTICE_LIST =
  /'retry-exhausted', 'delegate-spawn-interrupted'(?:, 'rollback-election-conflict')?\n/u;
const SCHEMAS: Record<ContinuationRecordsV20Shape, string> = {
  wide: OPENCLAW_STATE_SCHEMA_SQL.replace(
    NOTICE_LIST,
    "'retry-exhausted', 'delegate-spawn-interrupted', 'rollback-election-conflict'\n",
  ),
  narrow: OPENCLAW_STATE_SCHEMA_SQL.replace(
    NOTICE_LIST,
    "'retry-exhausted', 'delegate-spawn-interrupted'\n",
  ),
};
const PATH = "/fixture/openclaw.sqlite";

function createTable(db: DatabaseSync, shape: ContinuationRecordsV20Shape): void {
  const schema = readCanonicalContinuationRecordsSchema(SCHEMAS[shape]);
  db.exec(schema.tableSql);
  for (const indexSql of schema.indexes.values()) {
    db.exec(indexSql);
  }
}

function insertRows(db: DatabaseSync, notices: ReadonlyArray<string | null>): void {
  const insert = db.prepare(`
    INSERT INTO continuation_records (
      record_id, kind, owner_session_key, chain_id, revision, status, created_at, updated_at,
      ended_at, due_at, state_json, handoff_json, attachment_id, terminal_notice_pending
    ) VALUES (?, ?, 'agent:main:main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  notices.forEach((notice, index) => {
    const ended = notice !== null;
    insert.run(
      `record-${index}`,
      index % 2 === 0 ? "work" : "delegate",
      index % 2 === 0 ? `chain-${index}` : null,
      index,
      ended ? "failed" : "queued",
      1_000 + index,
      2_000 + index,
      ended ? 3_000 + index : null,
      ended ? null : 4_000 + index,
      JSON.stringify({ index, text: "é" }),
      index === 1 ? '{"to":"helper"}' : null,
      ended ? null : `attachment-${index}`,
      notice,
    );
  });
}

function snapshot(db: DatabaseSync) {
  return {
    table: db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'continuation_records'").get(),
    indexes: db
      .prepare(
        "SELECT name, sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'continuation_records' ORDER BY name",
      )
      .all(),
    rows: db
      .prepare(
        "SELECT *, typeof(revision) AS revision_type FROM continuation_records ORDER BY record_id",
      )
      .all(),
  };
}

function shapeOf(db: DatabaseSync): ContinuationRecordsV20Shape | undefined {
  const row = db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'continuation_records'").get();
  return classifyContinuationRecordsV20Shape(String(row?.sql));
}

describe("continuation_records v20 shape repair (#1423)", () => {
  it("pins both known definitions and classifies this build's canonical one", () => {
    expect(readCanonicalContinuationRecordsSchema(SCHEMAS.wide).shape).toBe("wide");
    expect(readCanonicalContinuationRecordsSchema(SCHEMAS.narrow).shape).toBe("narrow");
    expect(["wide", "narrow"]).toContain(readCanonicalContinuationRecordsSchema().shape);
    expect(readCanonicalContinuationRecordsSchema().indexes.size).toBe(2);
  });

  it("widens a narrow table, preserving rows, storage classes and indexes", () => {
    const db = new DatabaseSync(":memory:");
    createTable(db, "narrow");
    insertRows(db, [null, "retry-exhausted", "delegate-spawn-interrupted", null]);
    const before = snapshot(db);

    const line = repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.wide);

    expect(line).toMatch(/narrow → wide \(#1423\): 4 row\(s\) preserved/u);
    expect(shapeOf(db)).toBe("wide");
    const after = snapshot(db);
    expect(after.rows).toEqual(before.rows);
    expect(after.indexes).toEqual(before.indexes);
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
    db.exec(
      "UPDATE continuation_records SET terminal_notice_pending = 'rollback-election-conflict' WHERE record_id = 'record-1'",
    );
  });

  it("narrows a wide table without rollback-election-conflict rows", () => {
    const db = new DatabaseSync(":memory:");
    createTable(db, "wide");
    insertRows(db, ["retry-exhausted", null, "delegate-spawn-interrupted"]);
    const before = snapshot(db);

    const line = repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.narrow);

    expect(line).toMatch(/wide → narrow \(#1423\): 3 row\(s\) preserved/u);
    expect(shapeOf(db)).toBe("narrow");
    expect(snapshot(db).rows).toEqual(before.rows);
    expect(snapshot(db).indexes).toEqual(before.indexes);
    expect(() =>
      db.exec(
        "UPDATE continuation_records SET terminal_notice_pending = 'rollback-election-conflict'",
      ),
    ).toThrow(/CHECK constraint failed/u);
  });

  it("refuses to narrow rollback-election-conflict rows and changes nothing", () => {
    const db = new DatabaseSync(":memory:");
    createTable(db, "wide");
    insertRows(db, [
      null,
      "rollback-election-conflict",
      "retry-exhausted",
      "rollback-election-conflict",
    ]);
    const before = snapshot(db);

    expect(() => repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.narrow)).toThrow(
      /refused: 2 row\(s\) hold terminal_notice_pending 'rollback-election-conflict'.*record_id: record-1, record-3\. Nothing was changed\./u,
    );
    expect(snapshot(db)).toEqual(before);
    expect(shapeOf(db)).toBe("wide");
  });

  it("rolls the rebuild back when a copied row violates the canonical table", () => {
    const db = new DatabaseSync(":memory:");
    createTable(db, "wide");
    insertRows(db, [null, "retry-exhausted"]);
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.exec(
      "UPDATE continuation_records SET terminal_notice_pending = 'bogus' WHERE record_id = 'record-0'",
    );
    db.exec("PRAGMA ignore_check_constraints = OFF");
    const before = snapshot(db);

    expect(() => repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.narrow)).toThrow(
      /CHECK constraint failed/u,
    );
    expect(snapshot(db)).toEqual(before);
    expect(
      db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE '%shape_repair_hold%'").all(),
    ).toEqual([]);
  });

  it("is a no-op for the canonical shape, so a second run changes nothing", () => {
    const db = new DatabaseSync(":memory:");
    createTable(db, "narrow");
    insertRows(db, [null, "retry-exhausted"]);
    expect(repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.wide)).toBeDefined();
    const repaired = snapshot(db);
    expect(repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.wide)).toBeUndefined();
    expect(snapshot(db)).toEqual(repaired);
  });

  it("leaves unknown definitions, other versions and absent tables untouched", () => {
    const db = new DatabaseSync(":memory:");
    expect(repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.wide)).toBeUndefined();
    createTable(db, "narrow");
    insertRows(db, [null]);
    expect(repairContinuationRecordsV20Shape(db, PATH, 19, SCHEMAS.wide)).toBeUndefined();
    expect(repairContinuationRecordsV20Shape(db, PATH, 21, SCHEMAS.wide)).toBeUndefined();
    expect(shapeOf(db)).toBe("narrow");

    const unknown = new DatabaseSync(":memory:");
    unknown.exec(
      readCanonicalContinuationRecordsSchema(SCHEMAS.wide).tableSql.replace(
        "'retry-exhausted', ",
        "'retry-exhausted', 'some-other-notice', ",
      ),
    );
    const before = snapshot(unknown);
    expect(classifyContinuationRecordsV20Shape(String(before.table?.sql))).toBeUndefined();
    expect(repairContinuationRecordsV20Shape(unknown, PATH, 20, SCHEMAS.narrow)).toBeUndefined();
    expect(snapshot(unknown)).toEqual(before);
  });

  it("refuses a known shape that carries unexpected attached objects", () => {
    const db = new DatabaseSync(":memory:");
    createTable(db, "narrow");
    db.exec("CREATE INDEX extra_continuation_idx ON continuation_records(updated_at)");
    const before = snapshot(db);
    expect(() => repairContinuationRecordsV20Shape(db, PATH, 20, SCHEMAS.wide)).toThrow(
      /unexpected index extra_continuation_idx/u,
    );
    expect(snapshot(db)).toEqual(before);
  });

  it("Doctor repair rebuilds the other known shape to canonical and keeps schema 20", () => {
    const canonical = readCanonicalContinuationRecordsSchema().shape;
    const other: ContinuationRecordsV20Shape = canonical === "wide" ? "narrow" : "wide";
    const options = { env: { OPENCLAW_STATE_DIR: tempDirs.make("continuation-shape-") } };
    const databasePath = openOpenClawStateDatabase(options).path;
    closeOpenClawStateDatabaseForTest();
    const seeded = new DatabaseSync(databasePath);
    seeded.exec("DROP TABLE IF EXISTS continuation_records");
    createTable(seeded, other);
    insertRows(seeded, [null, "retry-exhausted", "delegate-spawn-interrupted"]);
    const before = snapshot(seeded);
    seeded.close();

    const result = repairOpenClawStateDatabaseSchema(options);

    expect(result.warnings).toEqual([]);
    expect(result.changes).toContainEqual(
      expect.stringMatching(new RegExp(`${other} → ${canonical} \\(#1423\\): 3 row`, "u")),
    );
    const { db } = openOpenClawStateDatabase(options);
    expect(shapeOf(db)).toBe(canonical);
    expect(snapshot(db).rows).toEqual(before.rows);
    expect(snapshot(db).indexes).toEqual(before.indexes);
    expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 20 });
    expect(repairOpenClawStateDatabaseSchema(options).changes.join("\n")).not.toMatch(/#1423/u);
  });
});
