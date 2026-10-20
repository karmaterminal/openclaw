// Staging for the agent schema bridge tests. Schemas 25 and 26 each have two histories
// (upstream's, and the fleet's earlier recipient-authority schema); these helpers write
// closed databases at either history and read back the shape the bridge must produce.
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { isPostgresSqlConnection, type EngineConnection } from "../infra/sql-connection.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import { withAgentDatabaseMaintenanceLease } from "./openclaw-agent-db-maintenance-lease.js";
import {
  ensureOpenClawAgentDatabaseSchema,
  openOpenClawAgentDatabase as openOpenClawAgentDatabaseRuntime,
  resolveOpenClawAgentSqlitePath,
} from "./openclaw-agent-db.js";
import { AGENT_JSON_PREDICATE_COLUMNS } from "./openclaw-agent-json-predicate-schema.js";
import { captureOpenClawMigrationWitness } from "./openclaw-migration-witness.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "./openclaw-state-db.js";
import { resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths.js";

const LEGACY_TRIGGER = "session_nodes_entry_valid_after_insert";
const LEGACY_PENDING_TRIGGER = "session_nodes_canonical_pending_after_insert";
const PREDICATE_TABLES = ["session_nodes", "transcript_events"] as const;

export const AUTHORITY = {
  sessionKey: "agent:main:retained-authority",
  epoch: "55555555-5555-4555-8555-555555555555",
};

export const CAPTURED_SESSION = {
  sessionKey: "agent:main:captured",
  entry: {
    sessionId: "captured-session",
    updatedAt: 1,
    sessionStartedAt: 1_700_000_000_000,
    delivery: { kind: "none" },
  },
};

/** Release DDL captured from real files or exact commits; never derived from the current schema. */
export function readCapturedAgentSchema(name: string): string {
  return readFileSync(new URL(`../../test/fixtures/sqlite/${name}`, import.meta.url), "utf8");
}

let stateTemplatePath: string | undefined;

export function materializeSharedStateDatabase(env: NodeJS.ProcessEnv, tempDirs: string[]): void {
  const target = resolveOpenClawStateSqlitePath(env);
  if (fs.existsSync(target)) {
    return;
  }
  if (!stateTemplatePath) {
    const templateEnv = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema-bridge-state-") };
    stateTemplatePath = openOpenClawStateDatabase({ env: templateEnv }).path;
    closeOpenClawStateDatabaseForTest();
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(stateTemplatePath, target);
}

/** Bridge fixtures read and write SQLite directly, so they need the native handle. */
export function requireNativeAgentSqlite(db: EngineConnection): DatabaseSync {
  if (isPostgresSqlConnection(db)) {
    throw new Error("Schema bridge fixtures require a native SQLite agent database");
  }
  return db;
}

export function openAgentDatabase(env: NodeJS.ProcessEnv, tempDirs: string[]) {
  materializeSharedStateDatabase(env, tempDirs);
  const database = openOpenClawAgentDatabaseRuntime({ agentId: "main", env });
  return { ...database, db: requireNativeAgentSqlite(database.db) };
}

export async function migrateAgentDatabase(
  env: NodeJS.ProcessEnv,
  tempDirs: string[],
): Promise<void> {
  materializeSharedStateDatabase(env, tempDirs);
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(resolveOpenClawAgentSqlitePath({ agentId: "main", env }));
  try {
    await withAgentDatabaseMaintenanceLease({ env }, async () =>
      ensureOpenClawAgentDatabaseSchema(database, { agentId: "main", env }),
    );
  } finally {
    database.close();
  }
}

/** Writes a closed agent database from captured DDL plus one settled session row. */
export function stageCapturedAgentDatabase(
  env: NodeJS.ProcessEnv,
  tempDirs: string[],
  params: { ddl: string; version: number; authorityRow: boolean },
): string {
  materializeSharedStateDatabase(env, tempDirs);
  const databasePath = resolveOpenClawAgentSqlitePath({ agentId: "main", env });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(params.ddl);
    // A captured file is schema only; live databases also hold the schema's seed rows.
    database.exec(`PRAGMA user_version = ${params.version};
      INSERT INTO schema_meta (meta_key, role, schema_version, agent_id, created_at, updated_at)
      VALUES ('primary', 'agent', ${params.version}, 'main', 1, 1);
      INSERT OR IGNORE INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', 0);`);
    database
      .prepare(`INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at)
        VALUES (?, ?, ?, 1)`)
      .run(
        CAPTURED_SESSION.sessionKey,
        CAPTURED_SESSION.entry.sessionId,
        JSON.stringify(CAPTURED_SESSION.entry),
      );
    // Live rows are settled: fleet databases hold only 1 (valid) and -1 (invalid).
    database.exec("UPDATE session_nodes SET entry_valid = 1");
    if (params.authorityRow) {
      database
        .prepare(
          "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, 1, 2)",
        )
        .run(AUTHORITY.sessionKey, AUTHORITY.epoch);
    }
  } finally {
    database.close();
  }
  return databasePath;
}

export function readCapturedSession(databasePath: string) {
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare("SELECT current_session_id, entry_json FROM session_nodes WHERE session_key = ?")
      .get(CAPTURED_SESSION.sessionKey);
  } finally {
    database.close();
  }
}

/** Reads the backfilled session-start predicate of the captured session (schema 26+). */
export function readCapturedSessionStartedAt(databasePath: string): unknown {
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database
      .prepare("SELECT session_started_at FROM session_nodes WHERE session_key = ?")
      .get(CAPTURED_SESSION.sessionKey)?.session_started_at;
  } finally {
    database.close();
  }
}

export function readShape(databasePath: string) {
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const has = (type: string, name: string) =>
      database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?")
        .get(type, name) !== undefined;
    const authorityTable = has("table", "session_recipient_authority");
    const predicates = PREDICATE_TABLES.flatMap((table) => {
      const columns = new Set(
        database
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((row) => row.name),
      );
      return AGENT_JSON_PREDICATE_COLUMNS[table].map((column) => columns.has(column));
    });
    return {
      userVersion: readSqliteUserVersion(database),
      schemaVersion: database
        .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary'")
        .get()?.schema_version,
      authorityTable,
      legacyTriggers: has("trigger", LEGACY_TRIGGER) || has("trigger", LEGACY_PENDING_TRIGGER),
      predicateColumns: predicates.every(Boolean)
        ? "all"
        : predicates.some(Boolean)
          ? "some"
          : "none",
      authorityRows: authorityTable
        ? database.prepare("SELECT session_key, epoch FROM session_recipient_authority").all()
        : [],
    };
  } finally {
    database.close();
  }
}

export function captureAgentWitness(databasePath: string) {
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return captureOpenClawMigrationWitness(database, { role: "agent", agentId: "main" });
  } finally {
    database.close();
  }
}
