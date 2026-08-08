import type { DatabaseSync } from "node:sqlite";
import { openNodeSqliteDatabase } from "./node-sqlite.js";
import {
  readStableSqliteFileGeneration,
  sameSqliteFileGeneration,
  type SqliteFileGeneration,
} from "./sqlite-file-generation.js";
import { isSqliteCorruptionError } from "./sqlite-transaction.js";

type SqliteIntegrityChecks = {
  integrityCheck: "ok";
};

type UnboundSqliteIntegrityConfirmation =
  | { status: "failed"; error: Error; terminal: boolean }
  | { status: "healthy" };

export type SqliteIntegrityConfirmation =
  | { status: "failed"; error: Error; terminal: false }
  | { status: "failed"; error: Error; generation: SqliteFileGeneration; terminal: true }
  | { status: "healthy"; generation: SqliteFileGeneration };

/** A full integrity proof, split by whether an index rebuild could resolve it. */
export type SqliteIntegrityDiagnosis =
  | { status: "healthy" }
  | { status: "damaged"; error: Error }
  | { status: "index-content-damaged"; error: Error; indexNames: readonly string[] };

type SqliteCheckPragma = "integrity_check";
type SqliteForeignKeyViolation = {
  fkid: bigint;
  parent: string;
  rowid: bigint | null;
  table: string;
};

const MAX_REPORTED_FOREIGN_KEY_VIOLATIONS = 5;
const MAX_CLASSIFIED_INTEGRITY_PROBLEMS = 1000;

/**
 * The only integrity_check findings a canonical index rebuild can resolve, as
 * emitted by every SQLite our supported Node runtimes bundle. `non-unique entry
 * in index` is excluded on purpose: rebuilding cannot delete the duplicate row,
 * so its CREATE UNIQUE INDEX would fail. Anything unrecognized fails closed.
 */
const SQLITE_INDEX_CONTENT_PROBLEM =
  /^(?:row -?\d+ missing from index|wrong # of entries in index) (.+)$/u;

/** Return whether a named integrity failure proves persistent database damage. */
export function isTerminalSqliteIntegrityError(error: Error): boolean {
  if (error.name !== "SqliteIntegrityError") {
    return false;
  }
  if (!error.cause) {
    // No cause means the check pragma itself reported corruption rows: persistent.
    return true;
  }
  // Only proven corruption latches; transient lock/busy pragma failures must not.
  return isSqliteCorruptionError(error.cause);
}

/** Require structural, table/index, and referential consistency before trusting a database. */
export function assertSqliteIntegrity(
  database: DatabaseSync,
  databaseLabel: string,
): SqliteIntegrityChecks {
  const integrityCheck = runSqliteCheck(database, databaseLabel, "integrity_check");
  runSqliteForeignKeyCheck(database, databaseLabel);
  return { integrityCheck };
}

/**
 * Classify one full integrity proof so a caller can route the narrow damage a
 * canonical index rebuild repairs without weakening the proof itself. Only
 * integrity_check is used: quick_check reports `ok` for both index-content
 * drift and UNIQUE violations, so it cannot prove what it skips.
 */
export function diagnoseSqliteIntegrity(
  database: DatabaseSync,
  databaseLabel: string,
): SqliteIntegrityDiagnosis {
  let problems: readonly string[];
  try {
    problems = readSqliteCheckProblems(
      database,
      databaseLabel,
      "integrity_check",
      undefined,
      MAX_CLASSIFIED_INTEGRITY_PROBLEMS,
    );
  } catch (error) {
    return { status: "damaged", error: error instanceof Error ? error : new Error(String(error)) };
  }
  let foreignKeyFailure: Error | undefined;
  try {
    runSqliteForeignKeyCheck(database, databaseLabel);
  } catch (error) {
    foreignKeyFailure = error instanceof Error ? error : new Error(String(error));
  }
  if (problems.length === 0) {
    return foreignKeyFailure
      ? { status: "damaged", error: foreignKeyFailure }
      : { status: "healthy" };
  }
  // Uncaused, so isTerminalSqliteIntegrityError still reads it as proven damage.
  const error = createSqliteCheckError("integrity_check", databaseLabel, problems);
  // SQLite stops after the requested number of findings. A full page of
  // repairable-looking rows may therefore hide a later terminal finding.
  if (problems.length >= MAX_CLASSIFIED_INTEGRITY_PROBLEMS) {
    return { status: "damaged", error };
  }
  const indexNames: string[] = [];
  for (const problem of problems) {
    const indexName = SQLITE_INDEX_CONTENT_PROBLEM.exec(problem)?.[1];
    if (indexName === undefined) {
      return { status: "damaged", error };
    }
    indexNames.push(indexName);
  }
  // Referential damage is never index-repairable, and the integrity_check
  // finding still leads the report exactly as assertSqliteIntegrity orders it.
  return foreignKeyFailure
    ? { status: "damaged", error }
    : { status: "index-content-damaged", error, indexNames };
}

/** Run integrity checks and preserve whether a failure proves persistent damage. */
function confirmSqliteIntegrity(
  database: DatabaseSync,
  databaseLabel: string,
): UnboundSqliteIntegrityConfirmation {
  try {
    assertSqliteIntegrity(database, databaseLabel);
    return { status: "healthy" };
  } catch (error) {
    return failedSqliteIntegrityConfirmation(error);
  }
}

/** Reconfirm an advisory failure against the database currently at a closed path. */
export function confirmSqliteFileIntegrity(
  pathname: string,
  databaseLabel: string,
): SqliteIntegrityConfirmation {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let initial: SqliteFileGeneration;
    try {
      initial = readStableSqliteFileGeneration(pathname);
    } catch (error) {
      return unboundSqliteIntegrityFailure(error);
    }

    let database: DatabaseSync;
    try {
      database = openNodeSqliteDatabase(pathname, { readOnly: true });
    } catch (error) {
      // A failed SQLite open exposes no descriptor identity. Path snapshots
      // cannot bind the error safely across an A -> B -> A file rotation.
      return unboundSqliteIntegrityFailure(error);
    }

    let opened: SqliteFileGeneration;
    try {
      opened = readStableSqliteFileGeneration(pathname);
    } catch {
      const closeError = closeSqliteDatabase(database);
      if (closeError) {
        return unboundSqliteIntegrityFailure(closeError);
      }
      continue;
    }
    if (!sameSqliteFileGeneration(initial, opened)) {
      const closeError = closeSqliteDatabase(database);
      if (closeError) {
        return unboundSqliteIntegrityFailure(closeError);
      }
      continue;
    }

    let confirmation = confirmSqliteIntegrity(database, databaseLabel);
    const closeError = closeSqliteDatabase(database);
    if (closeError && confirmation.status === "healthy") {
      confirmation = failedSqliteIntegrityConfirmation(closeError);
    }

    let final: SqliteFileGeneration;
    try {
      final = readStableSqliteFileGeneration(pathname);
    } catch {
      continue;
    }
    if (!sameSqliteFileGeneration(opened, final)) {
      continue;
    }
    return bindSqliteIntegrityConfirmation(confirmation, final);
  }
  return unboundSqliteIntegrityFailure(
    new Error(`SQLite file generation did not stabilize during confirmation: ${pathname}`),
  );
}

function bindSqliteIntegrityConfirmation(
  confirmation: UnboundSqliteIntegrityConfirmation,
  generation: SqliteFileGeneration,
): SqliteIntegrityConfirmation {
  if (confirmation.status === "healthy") {
    return { status: "healthy", generation };
  }
  if (confirmation.terminal) {
    return { ...confirmation, generation, terminal: true };
  }
  return { ...confirmation, terminal: false };
}

function failedSqliteIntegrityConfirmation(error: unknown): UnboundSqliteIntegrityConfirmation {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return {
    status: "failed",
    error: normalized,
    terminal: isTerminalSqliteIntegrityError(normalized),
  };
}

function unboundSqliteIntegrityFailure(error: unknown): SqliteIntegrityConfirmation {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return { status: "failed", error: normalized, terminal: false };
}

function closeSqliteDatabase(database: DatabaseSync): Error | undefined {
  try {
    database.close();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** Require table and associated index consistency before trusting indexed reads. */
export function assertSqliteTableIntegrity(
  database: DatabaseSync,
  databaseLabel: string,
  tableName: string,
): void {
  runSqliteCheck(database, `${databaseLabel} table ${tableName}`, "integrity_check", tableName);
}

function runSqliteCheck(
  database: DatabaseSync,
  databaseLabel: string,
  pragma: SqliteCheckPragma,
  tableName?: string,
): "ok" {
  const maxProblems = tableName ? undefined : MAX_CLASSIFIED_INTEGRITY_PROBLEMS;
  const problems = readSqliteCheckProblems(database, databaseLabel, pragma, tableName, maxProblems);
  if (problems.length === 0) {
    return "ok";
  }
  throw createSqliteCheckError(pragma, databaseLabel, problems);
}

/** Read one check pragma verbatim, returning every reported problem row. */
function readSqliteCheckProblems(
  database: DatabaseSync,
  databaseLabel: string,
  pragma: SqliteCheckPragma,
  tableName?: string,
  maxProblems?: number,
): readonly string[] {
  const argument = tableName
    ? `('${tableName.replaceAll("'", "''")}')`
    : maxProblems
      ? `(${maxProblems})`
      : "";
  let rows: Array<Record<string, unknown>>;
  try {
    rows = database.prepare(`PRAGMA ${pragma}${argument};`).all() as Array<Record<string, unknown>>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createSqliteIntegrityError(
      `SQLite ${pragma} failed for ${databaseLabel}: ${message}`,
      error,
    );
  }
  if (rows.length === 0) {
    return ["no result"];
  }
  const results = rows.map((row) => String(row[pragma] ?? Object.values(row)[0]));
  return results.length === 1 && results[0] === "ok" ? [] : results;
}

function createSqliteCheckError(
  pragma: SqliteCheckPragma,
  databaseLabel: string,
  problems: readonly string[],
): Error {
  return createSqliteIntegrityError(
    `SQLite ${pragma} failed for ${databaseLabel}: ${problems.join("; ")}`,
  );
}

function runSqliteForeignKeyCheck(database: DatabaseSync, databaseLabel: string): void {
  let violationCount = 0;
  const violations: SqliteForeignKeyViolation[] = [];
  try {
    // Use direct PRAGMA syntax because a real schema object can shadow the
    // table-valued pragma name and make a corrupt database appear clean.
    const statement = database.prepare("PRAGMA foreign_key_check;");
    statement.setReadBigInts(true);
    // OpenClaw's Node >=22.22.3 floor includes iterate(), added in Node 22.13.
    for (const violation of statement.iterate() as Iterable<SqliteForeignKeyViolation>) {
      violationCount += 1;
      retainSortedForeignKeyViolation(violations, violation);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createSqliteIntegrityError(
      `SQLite foreign_key_check failed for ${databaseLabel}: ${message}`,
      error,
    );
  }
  if (violations.length === 0) {
    return;
  }

  const details = violations.map(formatSqliteForeignKeyViolation);
  if (violationCount > MAX_REPORTED_FOREIGN_KEY_VIOLATIONS) {
    details.push("additional violations omitted");
  }
  throw createSqliteIntegrityError(
    `SQLite foreign_key_check failed for ${databaseLabel}: ${details.join("; ")}`,
  );
}

function createSqliteIntegrityError(message: string, cause?: unknown): Error {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause });
  error.name = "SqliteIntegrityError";
  return error;
}

function retainSortedForeignKeyViolation(
  retained: SqliteForeignKeyViolation[],
  violation: SqliteForeignKeyViolation,
): void {
  retained.push(violation);
  retained.sort(compareSqliteForeignKeyViolations);
  if (retained.length > MAX_REPORTED_FOREIGN_KEY_VIOLATIONS) {
    retained.pop();
  }
}

function compareSqliteForeignKeyViolations(
  left: SqliteForeignKeyViolation,
  right: SqliteForeignKeyViolation,
): number {
  const tableOrder = Buffer.compare(Buffer.from(left.table), Buffer.from(right.table));
  if (tableOrder !== 0) {
    return tableOrder;
  }
  if (left.rowid === null || right.rowid === null) {
    if (left.rowid !== right.rowid) {
      return left.rowid === null ? -1 : 1;
    }
  } else if (left.rowid !== right.rowid) {
    return left.rowid < right.rowid ? -1 : 1;
  }
  const parentOrder = Buffer.compare(Buffer.from(left.parent), Buffer.from(right.parent));
  if (parentOrder !== 0) {
    return parentOrder;
  }
  if (left.fkid === right.fkid) {
    return 0;
  }
  return left.fkid < right.fkid ? -1 : 1;
}

function formatSqliteForeignKeyViolation(violation: SqliteForeignKeyViolation): string {
  const row = violation.rowid === null ? "row without rowid" : `row ${violation.rowid.toString()}`;
  return `${violation.table} ${row} references ${violation.parent} (foreign key ${violation.fkid.toString()})`;
}
