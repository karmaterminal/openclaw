import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { assertSqliteTableIntegrity } from "../infra/sqlite-integrity.js";
import { SqliteSchemaMismatchError } from "../infra/sqlite-schema-issues.js";
import {
  extractSqliteTableSchema,
  normalizeSchemaSql,
  quoteSqliteIdentifier,
} from "../infra/sqlite-schema-sql.js";
import { OPENCLAW_STATE_SCHEMA_SQL } from "./openclaw-state-schema.js";

/**
 * Fork-only (karmaterminal/openclaw#1423). Two builds wrote different
 * `continuation_records` tables under the same state schema 20:
 *
 * - wide: the L8/composite line (879ff7e1bb, 7b0631086b, f971da97a3) allows
 *   terminal_notice_pending 'rollback-election-conflict';
 * - narrow: the presentation cut (41b8d69b90) dropped that value without a
 *   version bump (65833540cf).
 *
 * Each build's canonical-shape check refuses the other's table. This repair
 * recognizes ONLY those two exact definitions, by the SHA-256 of the
 * normalized `sqlite_schema.sql` each build's first-use DDL produces, and
 * rebuilds the table to this build's canonical shape at the same version.
 * Anything else is left untouched for the canonical-shape check to refuse.
 */
export const CONTINUATION_RECORDS_V20_SHAPE_REPAIR_VERSION = 20;

const TABLE = "continuation_records";
const HOLD_TABLE = "continuation_records_v20_shape_repair_hold";
const ROLLBACK_ELECTION_CONFLICT = "rollback-election-conflict";

/**
 * Pinned from `src/state/openclaw-state-schema.sql` at the named commits:
 * sha256(normalizeSchemaSql(sqlite_schema.sql)) after executing that build's
 * own `continuation_records` DDL. wide: 879ff7e1bb = 7b0631086b = f971da97a3
 * (identical schema files); narrow: 41b8d69b90.
 */
export const KNOWN_CONTINUATION_RECORDS_V20_SHAPES = {
  wide: "4e2606c4b85b75ed96ae2eef48f9d2d1933a15b608a27e03f2a98ca99831d1ae",
  narrow: "1b9348416181135468751acc6e36aadf512bcfd527475eca957d2bb6bd09ecaf",
} as const;

export type ContinuationRecordsV20Shape = keyof typeof KNOWN_CONTINUATION_RECORDS_V20_SHAPES;

export function continuationRecordsShapeDigest(sql: string): string {
  return createHash("sha256")
    .update(normalizeSchemaSql(sql) ?? "")
    .digest("hex");
}

export function classifyContinuationRecordsV20Shape(
  sql: string,
): ContinuationRecordsV20Shape | undefined {
  const digest = continuationRecordsShapeDigest(sql);
  for (const [shape, pinned] of Object.entries(KNOWN_CONTINUATION_RECORDS_V20_SHAPES)) {
    if (pinned === digest) {
      // SAFETY: shape is a key of KNOWN_CONTINUATION_RECORDS_V20_SHAPES, iterated from that object
      return shape as ContinuationRecordsV20Shape;
    }
  }
  return undefined;
}

type CanonicalContinuationSchema = {
  tableSql: string;
  indexes: ReadonlyMap<string, string>;
  shape: ContinuationRecordsV20Shape;
};

let canonicalSchema: CanonicalContinuationSchema | undefined;

/** This build's continuation_records DDL: the exact block its first-use ensurer executes. */
export function readCanonicalContinuationRecordsSchema(
  schemaSql: string = OPENCLAW_STATE_SCHEMA_SQL,
): CanonicalContinuationSchema {
  if (schemaSql === OPENCLAW_STATE_SCHEMA_SQL && canonicalSchema) {
    return canonicalSchema;
  }
  const tableSql = extractSqliteTableSchema(schemaSql, TABLE, {
    errorMessage: "Canonical continuation_records schema block is missing",
  });
  const indexes = new Map<string, string>();
  for (const match of schemaSql.matchAll(
    /CREATE INDEX IF NOT EXISTS ([A-Za-z0-9_]+)\s+ON continuation_records\([^)]*\);/gu,
  )) {
    indexes.set(match[1]!, match[0]);
  }
  const shape = classifyContinuationRecordsV20Shape(tableSql);
  if (!shape) {
    throw new Error(
      "This build's continuation_records definition matches neither known v20 shape; the #1423 shape repair must be re-pinned.",
    );
  }
  const schema = { tableSql, indexes, shape };
  if (schemaSql === OPENCLAW_STATE_SCHEMA_SQL) {
    canonicalSchema = schema;
  }
  return schema;
}

type ContentFacts = { rows: number; digest: string };

function readContentFacts(
  db: DatabaseSync,
  table: string,
  columns: readonly string[],
): ContentFacts {
  // quote() renders each value with its storage class, so type changes alter the digest.
  const projection = columns.map((column) => `quote(${quoteSqliteIdentifier(column)})`).join(", ");
  const hash = createHash("sha256");
  let rows = 0;
  for (const row of db
    .prepare(`SELECT ${projection} FROM ${quoteSqliteIdentifier(table)} ORDER BY record_id`)
    // SAFETY: the SELECT projects only quote()d columns: plain string-keyed rows
    .iterate() as Iterable<Record<string, unknown>>) {
    hash.update(`${JSON.stringify(Object.values(row))}\n`);
    rows += 1;
  }
  return { rows, digest: hash.digest("hex") };
}

function readColumns(db: DatabaseSync, table: string): string[] {
  const statement = db.prepare(`PRAGMA table_xinfo(${quoteSqliteIdentifier(table)})`);
  // SAFETY: PRAGMA table_xinfo rows always carry string name and integer hidden
  const columns = statement.all() as Array<{ name: string; hidden: number }>;
  return columns.filter((column) => column.hidden === 0).map((column) => column.name);
}

function refuse(pathname: string, detail: string): never {
  throw new SqliteSchemaMismatchError(
    `OpenClaw state database ${pathname}: continuation_records v20 shape repair refused: ${detail}`,
  );
}

/**
 * Rebuild a known non-canonical v20 continuation_records table to this build's
 * shape. Runs inside the caller's schema transaction, in its own savepoint;
 * any refusal or verification failure throws so nothing is changed.
 * Returns the Doctor change line, or undefined when nothing applies.
 */
export function repairContinuationRecordsV20Shape(
  db: DatabaseSync,
  pathname: string,
  userVersion: number,
  schemaSql: string = OPENCLAW_STATE_SCHEMA_SQL,
): string | undefined {
  if (userVersion !== CONTINUATION_RECORDS_V20_SHAPE_REPAIR_VERSION) {
    return undefined;
  }
  const current = db
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?")
    // SAFETY: sqlite_schema.sql is TEXT or NULL; callers check typeof
    .get(TABLE) as { sql?: unknown } | undefined;
  if (typeof current?.sql !== "string") {
    return undefined;
  }
  const canonical = readCanonicalContinuationRecordsSchema(schemaSql);
  const found = classifyContinuationRecordsV20Shape(current.sql);
  if (!found || found === canonical.shape) {
    // Canonical already, or an unknown definition the canonical check must refuse.
    return undefined;
  }
  const direction = `${found} → ${canonical.shape}`;

  const attached = db
    .prepare(
      "SELECT type, name, sql FROM sqlite_schema WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name",
    )
    // SAFETY: SELECT names exactly type, name, sql (sql IS NOT NULL)
    .all(TABLE) as Array<{ type: string; name: string; sql: string }>;
  for (const object of attached) {
    const expected = object.type === "index" ? canonical.indexes.get(object.name) : undefined;
    if (!expected || normalizeSchemaSql(expected) !== normalizeSchemaSql(object.sql)) {
      refuse(pathname, `unexpected ${object.type} ${object.name} on the ${found} table`);
    }
  }
  const referencing = db
    .prepare(
      "SELECT m.name AS name FROM sqlite_schema AS m, pragma_foreign_key_list(m.name) AS f WHERE m.type = 'table' AND f.\"table\" = ?",
    )
    // SAFETY: SELECT names exactly m.name from sqlite_schema (TEXT)
    .all(TABLE) as Array<{ name: string }>;
  if (referencing.length > 0) {
    refuse(
      pathname,
      `tables reference continuation_records by foreign key (${referencing.map((row) => row.name).join(", ")})`,
    );
  }
  if (canonical.shape === "narrow") {
    const conflicts = (
      db
        .prepare(
          "SELECT record_id FROM continuation_records WHERE terminal_notice_pending = ? ORDER BY record_id",
        )
        // SAFETY: SELECT names exactly record_id, the TEXT primary key
        .all(ROLLBACK_ELECTION_CONFLICT) as Array<{ record_id: string }>
    ).map((row) => row.record_id);
    if (conflicts.length > 0) {
      refuse(
        pathname,
        `${conflicts.length} row(s) hold terminal_notice_pending '${ROLLBACK_ELECTION_CONFLICT}', which the ${canonical.shape} shape cannot store; record_id: ${conflicts.join(", ")}. Nothing was changed.`,
      );
    }
  }
  if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name = ?").get(HOLD_TABLE) !== undefined) {
    refuse(pathname, `scratch table ${HOLD_TABLE} already exists`);
  }

  const columns = readColumns(db, TABLE);
  const before = readContentFacts(db, TABLE, columns);
  const columnList = columns.map(quoteSqliteIdentifier).join(", ");
  const holdSql = canonical.tableSql.replace(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (`,
    `CREATE TABLE ${HOLD_TABLE} (`,
  );
  db.exec("SAVEPOINT continuation_records_v20_shape_repair;");
  try {
    db.exec(holdSql);
    if (readColumns(db, HOLD_TABLE).join("\0") !== columns.join("\0")) {
      refuse(pathname, `the ${found} and ${canonical.shape} column lists differ`);
    }
    db.exec(`INSERT INTO ${HOLD_TABLE} (${columnList}) SELECT ${columnList} FROM ${TABLE};`);
    const held = readContentFacts(db, HOLD_TABLE, columns);
    if (held.rows !== before.rows || held.digest !== before.digest) {
      refuse(pathname, "row count or content digest changed while copying to the scratch table");
    }
    // Dropping the table drops its indexes; recreate the exact canonical DDL so
    // sqlite_schema holds the same text this build's first-use ensurer writes.
    db.exec(`DROP TABLE ${TABLE};`);
    db.exec(canonical.tableSql);
    for (const indexSql of canonical.indexes.values()) {
      db.exec(indexSql);
    }
    db.exec(`INSERT INTO ${TABLE} (${columnList}) SELECT ${columnList} FROM ${HOLD_TABLE};`);
    db.exec(`DROP TABLE ${HOLD_TABLE};`);

    const after = readContentFacts(db, TABLE, columns);
    if (after.rows !== before.rows || after.digest !== before.digest) {
      refuse(
        pathname,
        `verification failed (${before.rows} → ${after.rows} rows, digest ${before.digest.slice(0, 12)} → ${after.digest.slice(0, 12)})`,
      );
    }
    const rebuilt = db
      .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?")
      // SAFETY: sqlite_schema.sql is TEXT or NULL; callers check typeof
      .get(TABLE) as { sql?: unknown } | undefined;
    if (
      typeof rebuilt?.sql !== "string" ||
      classifyContinuationRecordsV20Shape(rebuilt.sql) !== canonical.shape
    ) {
      refuse(pathname, "the rebuilt table is not this build's canonical definition");
    }
    const violations = db.prepare(`PRAGMA foreign_key_check(${TABLE})`).all();
    if (violations.length > 0) {
      refuse(pathname, `foreign_key_check reported ${violations.length} violation(s)`);
    }
    assertSqliteTableIntegrity(db, pathname, TABLE);
    db.exec("RELEASE continuation_records_v20_shape_repair;");
    return `Rebuilt continuation_records v20 shape ${direction} (#1423): ${after.rows} row(s) preserved, content sha256 ${after.digest.slice(0, 16)} verified, ${canonical.indexes.size} canonical index(es) recreated, user_version ${userVersion} unchanged`;
  } catch (error) {
    db.exec(
      "ROLLBACK TO continuation_records_v20_shape_repair; RELEASE continuation_records_v20_shape_repair;",
    );
    throw error;
  }
}
