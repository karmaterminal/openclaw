// Agent schema 25 has two histories. Upstream's schema 25 retired the canonical
// validation triggers; the fleet's earlier (unreleased) schema 25 instead added
// session recipient authority and kept those triggers. Schema 26 must tell them
// apart by shape, migrate each to the same schema-26 database, and refuse a mix.
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { constants, type DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { retireSqliteDatabaseAdmissionForPath } from "../infra/sqlite-database-admission.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import { withLegacyCanonicalSessionValidationTriggers } from "./openclaw-agent-canonical-validation-migration.js";
import { withAgentDatabaseMaintenanceLease } from "./openclaw-agent-db-maintenance-lease.js";
import {
  closeOpenClawAgentDatabasesForTest,
  ensureOpenClawAgentDatabaseSchema,
  OPENCLAW_AGENT_SCHEMA_VERSION,
  openOpenClawAgentDatabase as openOpenClawAgentDatabaseRuntime,
  resolveOpenClawAgentSqlitePath,
} from "./openclaw-agent-db.js";
import {
  assertOpenClawMigrationWitnessPreserved,
  captureOpenClawMigrationWitness,
} from "./openclaw-migration-witness.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "./openclaw-state-db.js";
import { resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths.js";

const tempDirs: string[] = [];
let stateTemplatePath: string | undefined;
const LEGACY_TRIGGER = "session_nodes_entry_valid_after_insert";
const LEGACY_PENDING_TRIGGER = "session_nodes_canonical_pending_after_insert";
const AUTHORITY = {
  sessionKey: "agent:main:retained-authority",
  epoch: "55555555-5555-4555-8555-555555555555",
};

function materializeSharedStateDatabase(env: NodeJS.ProcessEnv): void {
  const target = resolveOpenClawStateSqlitePath(env);
  if (fs.existsSync(target)) {
    return;
  }
  if (!stateTemplatePath) {
    const templateEnv = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-state-") };
    stateTemplatePath = openOpenClawStateDatabase({ env: templateEnv }).path;
    closeOpenClawStateDatabaseForTest();
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(stateTemplatePath, target);
}

function openAgentDatabase(env: NodeJS.ProcessEnv) {
  materializeSharedStateDatabase(env);
  return openOpenClawAgentDatabaseRuntime({ agentId: "main", env });
}

async function migrateAgentDatabase(env: NodeJS.ProcessEnv): Promise<void> {
  materializeSharedStateDatabase(env);
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

/** The legacy trigger groups exactly as schemas 21–24 (and the fleet's 25) wrote them. */
function restoreLegacyValidationTriggers(database: DatabaseSync): void {
  const anchors =
    "CREATE TABLE IF NOT EXISTS session_windows (\nCREATE TABLE IF NOT EXISTS conversations (";
  database.exec(
    withLegacyCanonicalSessionValidationTriggers(anchors)
      .replace("CREATE TABLE IF NOT EXISTS session_windows (", "")
      .replace("CREATE TABLE IF NOT EXISTS conversations (", ""),
  );
}

/** Release DDL captured from real files; never derived from the current schema. */
const CAPTURED_SCHEMA_25 = {
  // A fleet agent database at recipient-authority schema 25, as written by build 7d8a1a91c6.
  fleet: readFileSync(
    new URL(
      "../../test/fixtures/sqlite/openclaw-agent-schema-v25-fleet-captured.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  // Upstream's canonical-writer schema 25 (6a8b0dceaf).
  upstream: readFileSync(
    new URL("../../test/fixtures/sqlite/openclaw-agent-schema-v25.sql", import.meta.url),
    "utf8",
  ),
};
const CAPTURED_SESSION = {
  sessionKey: "agent:main:captured",
  entry: { sessionId: "captured-session", updatedAt: 1, delivery: { kind: "none" } },
};

/** Writes a closed schema-25 agent database from captured DDL plus synthetic rows. */
function stageCapturedAgentDatabase(
  env: NodeJS.ProcessEnv,
  history: keyof typeof CAPTURED_SCHEMA_25,
): string {
  materializeSharedStateDatabase(env);
  const databasePath = resolveOpenClawAgentSqlitePath({ agentId: "main", env });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(CAPTURED_SCHEMA_25[history]);
    // A captured file is schema only; live databases also hold the schema's seed row
    // (ronan's fleet 25 has it).
    database.exec(`PRAGMA user_version = 25;
      INSERT INTO schema_meta (meta_key, role, schema_version, agent_id, created_at, updated_at)
      VALUES ('primary', 'agent', 25, 'main', 1, 1);
      INSERT OR IGNORE INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', 0);`);
    database
      .prepare(`INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at)
        VALUES (?, ?, ?, 1)`)
      .run(
        CAPTURED_SESSION.sessionKey,
        CAPTURED_SESSION.entry.sessionId,
        JSON.stringify(CAPTURED_SESSION.entry),
      );
    // Live rows are settled: ronan's fleet 25 holds only 1 (valid) and -1 (invalid).
    database.exec("UPDATE session_nodes SET entry_valid = 1");
    if (history === "fleet") {
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

function readCapturedSession(databasePath: string) {
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

type Shape = "fleet-25" | "upstream-25" | "schema-24" | "mixed-25";

/** Writes a closed agent database at one historical shape and returns its path. */
function stageAgentDatabase(env: NodeJS.ProcessEnv, shape: Shape): string {
  const initial = openAgentDatabase(env);
  const databasePath = initial.path;
  const { db } = initial;
  db.prepare(
    "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, 1, 2)",
  ).run(AUTHORITY.sessionKey, AUTHORITY.epoch);
  const version = shape === "schema-24" ? 24 : 25;
  if (shape === "fleet-25" || shape === "schema-24") {
    restoreLegacyValidationTriggers(db);
  }
  if (shape === "upstream-25" || shape === "schema-24") {
    db.exec("DROP TABLE session_recipient_authority;");
  }
  // mixed-25: authority table present, legacy triggers retired.
  db.exec(`
    PRAGMA user_version = ${version};
    UPDATE schema_meta SET schema_version = ${version} WHERE meta_key = 'primary';
  `);
  closeOpenClawAgentDatabasesForTest();
  // The staged file now holds an older schema than this process admitted; physical
  // admission outlives the close (#167739), so retire it as any out-of-band rewrite must.
  retireSqliteDatabaseAdmissionForPath(databasePath);
  return databasePath;
}

function readShape(databasePath: string) {
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const has = (type: string, name: string) =>
      database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?")
        .get(type, name) !== undefined;
    const authorityTable = has("table", "session_recipient_authority");
    return {
      userVersion: readSqliteUserVersion(database),
      schemaVersion: database
        .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary'")
        .get()?.schema_version,
      authorityTable,
      legacyTriggers: has("trigger", LEGACY_TRIGGER) || has("trigger", LEGACY_PENDING_TRIGGER),
      authorityRows: authorityTable
        ? database.prepare("SELECT session_key, epoch FROM session_recipient_authority").all()
        : [],
    };
  } finally {
    database.close();
  }
}

afterAll(() => {
  cleanupTempDirs(tempDirs);
});

afterEach(() => {
  closeOpenClawAgentDatabasesForTest();
  closeOpenClawStateDatabaseForTest();
});

describe("agent schema 25 → 26 bridge", () => {
  it("is schema 26", () => {
    expect(OPENCLAW_AGENT_SCHEMA_VERSION).toBe(26);
  });

  it("migrates the fleet's recipient-authority schema 25, retiring the legacy triggers and keeping authority rows", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-fleet-") };
    const databasePath = stageAgentDatabase(env, "fleet-25");
    expect(readShape(databasePath)).toMatchObject({
      userVersion: 25,
      authorityTable: true,
      legacyTriggers: true,
    });

    await migrateAgentDatabase(env);

    expect(readShape(databasePath)).toEqual({
      userVersion: 26,
      schemaVersion: 26,
      authorityTable: true,
      legacyTriggers: false,
      authorityRows: [{ session_key: AUTHORITY.sessionKey, epoch: AUTHORITY.epoch }],
    });
    // Ordinary opens accept the migrated file.
    expect(readSqliteUserVersion(openAgentDatabase(env).db)).toBe(26);
  });

  it("migrates upstream's canonical-writer schema 25 by adding recipient authority", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-upstream-") };
    const databasePath = stageAgentDatabase(env, "upstream-25");
    expect(readShape(databasePath)).toMatchObject({
      userVersion: 25,
      authorityTable: false,
      legacyTriggers: false,
    });

    await migrateAgentDatabase(env);

    expect(readShape(databasePath)).toEqual({
      userVersion: 26,
      schemaVersion: 26,
      authorityTable: true,
      legacyTriggers: false,
      authorityRows: [],
    });
  });

  it("migrates schema 24 through both steps to schema 26", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema24-") };
    const databasePath = stageAgentDatabase(env, "schema-24");
    expect(readShape(databasePath)).toMatchObject({
      userVersion: 24,
      authorityTable: false,
      legacyTriggers: true,
    });

    await migrateAgentDatabase(env);

    expect(readShape(databasePath)).toEqual({
      userVersion: 26,
      schemaVersion: 26,
      authorityTable: true,
      legacyTriggers: false,
      authorityRows: [],
    });
  });

  it("reopens a migrated schema 26 database unchanged", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-reopen-") };
    const databasePath = stageAgentDatabase(env, "fleet-25");
    await migrateAgentDatabase(env);
    const migrated = readShape(databasePath);

    await migrateAgentDatabase(env);
    expect(readSqliteUserVersion(openAgentDatabase(env).db)).toBe(26);
    closeOpenClawAgentDatabasesForTest();

    expect(readShape(databasePath)).toEqual(migrated);
  });

  it("refuses a schema 25 database whose shape matches neither history", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-mixed-") };
    const databasePath = stageAgentDatabase(env, "mixed-25");
    const before = readShape(databasePath);

    await expect(migrateAgentDatabase(env)).rejects.toThrow(/unrecognized schema-25 shape/u);

    expect(readShape(databasePath)).toEqual(before);
  });

  it("rolls a failed fleet schema 25 migration back to its original shape", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-rollback-") };
    const databasePath = stageAgentDatabase(env, "fleet-25");
    const before = readShape(databasePath);
    materializeSharedStateDatabase(env);
    const { DatabaseSync } = requireNodeSqlite();
    const database = new DatabaseSync(databasePath);
    let reachedPublication = false;
    // Fail at the final marker publication, after both migration steps have run.
    database.setAuthorizer((action, name, value) => {
      if (action === constants.SQLITE_PRAGMA && name === "user_version" && value === "26") {
        reachedPublication = true;
        return constants.SQLITE_DENY;
      }
      return constants.SQLITE_OK;
    });
    try {
      await expect(
        withAgentDatabaseMaintenanceLease({ env }, async () =>
          ensureOpenClawAgentDatabaseSchema(database, { agentId: "main", env }),
        ),
      ).rejects.toThrow();
    } finally {
      database.setAuthorizer(null);
      database.close();
    }

    expect(reachedPublication).toBe(true);
    expect(readShape(databasePath)).toEqual(before);
  });

  describe("captured schema 25 files", () => {
    it("migrates a captured fleet schema 25 database, keeping its authority and session rows", async () => {
      const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-captured-fleet-") };
      const databasePath = stageCapturedAgentDatabase(env, "fleet");
      expect(readShape(databasePath)).toMatchObject({
        userVersion: 25,
        authorityTable: true,
        legacyTriggers: true,
      });

      await migrateAgentDatabase(env);

      expect(readShape(databasePath)).toEqual({
        userVersion: 26,
        schemaVersion: 26,
        authorityTable: true,
        legacyTriggers: false,
        authorityRows: [{ session_key: AUTHORITY.sessionKey, epoch: AUTHORITY.epoch }],
      });
      expect(readCapturedSession(databasePath)).toEqual({
        current_session_id: CAPTURED_SESSION.entry.sessionId,
        entry_json: JSON.stringify(CAPTURED_SESSION.entry),
      });
      expect(readSqliteUserVersion(openAgentDatabase(env).db)).toBe(26);
    });

    it("migrates a captured upstream schema 25 database by adding recipient authority", async () => {
      const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-captured-upstream-") };
      const databasePath = stageCapturedAgentDatabase(env, "upstream");
      expect(readShape(databasePath)).toMatchObject({
        userVersion: 25,
        authorityTable: false,
        legacyTriggers: false,
      });

      await migrateAgentDatabase(env);

      expect(readShape(databasePath)).toEqual({
        userVersion: 26,
        schemaVersion: 26,
        authorityTable: true,
        legacyTriggers: false,
        authorityRows: [],
      });
      expect(readCapturedSession(databasePath)).toEqual({
        current_session_id: CAPTURED_SESSION.entry.sessionId,
        entry_json: JSON.stringify(CAPTURED_SESSION.entry),
      });
      expect(readSqliteUserVersion(openAgentDatabase(env).db)).toBe(26);
    });

    it.each(["fleet", "upstream"] as const)(
      "witnesses a captured %s schema 25 database as preserved across migration",
      async (origin) => {
        const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, `schema25-witness-${origin}-`) };
        const databasePath = stageCapturedAgentDatabase(env, origin);
        const witness = () => {
          const { DatabaseSync } = requireNodeSqlite();
          const database = new DatabaseSync(databasePath, { readOnly: true });
          try {
            return captureOpenClawMigrationWitness(database, { role: "agent", agentId: "main" });
          } finally {
            database.close();
          }
        };
        const original = witness();

        await migrateAgentDatabase(env);

        expect(() => assertOpenClawMigrationWitnessPreserved(original, witness())).not.toThrow();
        if (origin === "fleet") {
          const { DatabaseSync } = requireNodeSqlite();
          const database = new DatabaseSync(databasePath);
          database.exec("DELETE FROM session_recipient_authority");
          database.close();
          expect(() => assertOpenClawMigrationWitnessPreserved(original, witness())).toThrow(
            /session_recipient_authority/u,
          );
        }
      },
    );
  });
});
