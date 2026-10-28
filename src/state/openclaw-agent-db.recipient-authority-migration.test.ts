// Agent schema 39 installs session recipient authority as its own versioned step (the
// fleet first received it as an unreleased schema 25 and then 26; see the schema bridge tests).
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import type { EngineConnection } from "../infra/sql-connection.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import { withoutAgentColdArchiveChunks } from "./openclaw-agent-cold-archive-chunks-schema.js";
import { agentEngineSchema } from "./openclaw-agent-db-engine.js";
import { withAgentDatabaseMaintenanceLease } from "./openclaw-agent-db-maintenance-lease.js";
import { migrateSessionRecipientAuthorityInTransaction } from "./openclaw-agent-db-session-migrations.js";
import {
  closeOpenClawAgentDatabasesForTest,
  ensureOpenClawAgentDatabaseSchema,
  OPENCLAW_AGENT_SCHEMA_VERSION,
  openOpenClawAgentDatabase as openOpenClawAgentDatabaseRuntime,
  resolveOpenClawAgentSqlitePath,
} from "./openclaw-agent-db.js";
import {
  AUTHORITY,
  readCapturedAgentSchema,
  requireNativeAgentSqlite,
  stageCapturedAgentDatabase,
} from "./openclaw-agent-db.schema-bridge.test-support.js";
import { removeCanonicalValidationFromHistoricalAgentFixture } from "./openclaw-agent-db.test-support.js";
import {
  sessionRecipientAuthoritySchemaSql,
  withoutSessionRecipientAuthoritySchema,
} from "./openclaw-agent-recipient-authority-schema.js";
import { materializeV21WorkerAgentDatabase } from "./openclaw-agent-schema-v21.test-support.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "./openclaw-state-db.js";
import { resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths.js";

const agentDbTempDirs: string[] = [];
let sharedStateDatabaseTemplatePath: string | undefined;

function createTempStateDir(): string {
  return makeTempDir(agentDbTempDirs, "openclaw-agent-db-");
}

function ensureSharedStateDatabaseTemplate(): string {
  if (sharedStateDatabaseTemplatePath) {
    return sharedStateDatabaseTemplatePath;
  }
  const stateDir = makeTempDir(agentDbTempDirs, "openclaw-agent-db-shared-state-");
  const env = { OPENCLAW_STATE_DIR: stateDir };
  const database = openOpenClawStateDatabase({ env });
  sharedStateDatabaseTemplatePath = database.path;
  closeOpenClawStateDatabaseForTest();
  return sharedStateDatabaseTemplatePath;
}

function materializeSharedStateDatabase(env: NodeJS.ProcessEnv | undefined): void {
  const stateDatabasePath = resolveOpenClawStateSqlitePath(env);
  if (!fs.existsSync(stateDatabasePath)) {
    // Agent schema tests own the per-agent database. Seed the shared registry
    // from one real closed database instead of rebuilding its full schema per case.
    fs.mkdirSync(path.dirname(stateDatabasePath), { recursive: true });
    fs.copyFileSync(ensureSharedStateDatabaseTemplate(), stateDatabasePath);
  }
}

function openOpenClawAgentDatabase(
  options: Parameters<typeof openOpenClawAgentDatabaseRuntime>[0],
) {
  materializeSharedStateDatabase(options.env);
  return openOpenClawAgentDatabaseRuntime(options);
}

async function migrateAndOpenLegacyAgentDatabaseForTest(
  options: Parameters<typeof openOpenClawAgentDatabase>[0],
) {
  // Prepare the unrelated registry before the real maintenance lease's acquisition budget.
  materializeSharedStateDatabase(options.env);
  const pathname = resolveOpenClawAgentSqlitePath(options);
  const { DatabaseSync } = requireNodeSqlite();
  const database = new DatabaseSync(pathname);
  try {
    await withAgentDatabaseMaintenanceLease({ env: options?.env }, async () =>
      ensureOpenClawAgentDatabaseSchema(database, options),
    );
  } finally {
    database.close();
  }
  return openOpenClawAgentDatabase(options);
}

/**
 * Writes a schema-24 file from upstream's captured DDL; `withTable` keeps the table an
 * earlier build created early. Upstream's steps 27–31 rebuild tables, so a current
 * database rolled back to 24 is not a schema 24 ever wrote.
 */
function stageSchema24AgentDatabase(
  env: NodeJS.ProcessEnv,
  options: { withTable: boolean; authority?: { sessionKey: string; epoch: string } },
): string {
  const ddl = readCapturedAgentSchema("openclaw-agent-schema-v24.sql");
  const databasePath = stageCapturedAgentDatabase(env, agentDbTempDirs, {
    ddl: options.withTable
      ? `${ddl}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`
      : ddl,
    version: 24,
    authorityRow: false,
  });
  if (options.authority) {
    const { DatabaseSync } = requireNodeSqlite();
    using database = new DatabaseSync(databasePath);
    database
      .prepare(
        "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, 1, 2)",
      )
      .run(options.authority.sessionKey, options.authority.epoch);
  }
  return databasePath;
}

function readSchemaMarkers(handle: EngineConnection) {
  const database = requireNativeAgentSqlite(handle);
  return {
    userVersion: readSqliteUserVersion(database),
    schemaVersion: database
      .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary'")
      .get()?.schema_version,
  };
}

function hasRecipientAuthorityTable(handle: EngineConnection): boolean {
  return (
    requireNativeAgentSqlite(handle)
      .prepare(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'session_recipient_authority'",
      )
      .get() !== undefined
  );
}

afterAll(() => {
  cleanupTempDirs(agentDbTempDirs);
});

afterEach(() => {
  closeOpenClawAgentDatabasesForTest();
  closeOpenClawStateDatabaseForTest();
});

describe("openclaw agent database", () => {
  it("upgrades v18 embedded recipient authority without parsing Doctor-owned malformed rows", async () => {
    const stateDir = createTempStateDir();
    const env = { OPENCLAW_STATE_DIR: stateDir };
    // The frozen v21 schema carries no session_recipient_authority table.
    const databasePath = materializeV21WorkerAgentDatabase(stateDir);
    const validKey = "agent:worker-1:valid-authority";
    const malformedKey = "agent:worker-1:malformed-authority";
    const epoch = "11111111-1111-4111-8111-111111111111";
    const { DatabaseSync } = requireNodeSqlite();
    const legacy = new DatabaseSync(databasePath);
    removeCanonicalValidationFromHistoricalAgentFixture(legacy);
    legacy.exec(`
      PRAGMA user_version = 18;
      UPDATE schema_meta SET schema_version = 18 WHERE meta_key = 'primary';
    `);
    legacy
      .prepare(
        `INSERT INTO session_nodes (
           session_key, current_session_id, entry_json, entry_valid, updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        validKey,
        "valid-session",
        JSON.stringify({
          sessionId: "valid-session",
          updatedAt: 10,
          recipientAuthorityEpoch: epoch,
        }),
        1,
        10,
      );
    legacy
      .prepare(
        `INSERT INTO session_nodes (
           session_key, current_session_id, entry_json, entry_valid, updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(malformedKey, "malformed-session", "{malformed", -1, 20);
    legacy
      .prepare("UPDATE session_nodes SET entry_valid = ? WHERE session_key = ?")
      .run(1, validKey);
    legacy
      .prepare("UPDATE session_nodes SET entry_valid = ? WHERE session_key = ?")
      .run(-1, malformedKey);
    legacy.close();

    const migrated = await migrateAndOpenLegacyAgentDatabaseForTest({
      agentId: "worker-1",
      env,
    });

    expect(
      migrated.db
        .prepare(
          "SELECT session_key, entry_json, entry_valid FROM session_nodes WHERE session_key IN (?, ?) ORDER BY session_key",
        )
        .all(malformedKey, validKey),
    ).toEqual([
      { session_key: malformedKey, entry_json: "{malformed", entry_valid: -1 },
      {
        session_key: validKey,
        entry_json: JSON.stringify({ sessionId: "valid-session", updatedAt: 10 }),
        entry_valid: 1,
      },
    ]);
    expect(
      migrated.db
        .prepare("SELECT session_key, epoch FROM session_recipient_authority WHERE session_key = ?")
        .get(validKey),
    ).toEqual({ session_key: validKey, epoch });
  });

  // Upstream freezes its historical PostgreSQL schemas byte for byte; the authority statement must
  // leave with its blank-line separator or every predecessor carries a doubled one.
  it("derives every historical PostgreSQL schema without a doubled separator", () => {
    for (const migration of agentEngineSchema.postgresMigrations ?? []) {
      expect(migration.fromSchema.postgres, `schema ${migration.version - 1}`).not.toContain(
        "\n\n\n",
      );
    }
  });

  it("creates a fresh database at schema 39 with recipient authority", () => {
    const env = { OPENCLAW_STATE_DIR: createTempStateDir() };
    const { db } = openOpenClawAgentDatabase({ agentId: "main", env });

    expect(OPENCLAW_AGENT_SCHEMA_VERSION).toBe(39);
    expect(readSchemaMarkers(db)).toEqual({ userVersion: 39, schemaVersion: 39 });
    expect(hasRecipientAuthorityTable(db)).toBe(true);
  });

  it("migrates a schema-24 database that lacks recipient authority", async () => {
    const env = { OPENCLAW_STATE_DIR: createTempStateDir() };
    const databasePath = stageSchema24AgentDatabase(env, { withTable: false });

    // Ordinary runtime opens refuse the older schema; migration is Doctor-owned.
    expect(() => openOpenClawAgentDatabase({ agentId: "main", env })).toThrow(
      /openclaw doctor --fix/u,
    );
    closeOpenClawAgentDatabasesForTest();
    const { DatabaseSync } = requireNodeSqlite();
    const unchanged = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(readSchemaMarkers(unchanged)).toEqual({ userVersion: 24, schemaVersion: 24 });
      expect(hasRecipientAuthorityTable(unchanged)).toBe(false);
    } finally {
      unchanged.close();
    }

    const migrated = await migrateAndOpenLegacyAgentDatabaseForTest({ agentId: "main", env });

    expect(readSchemaMarkers(migrated.db)).toEqual({ userVersion: 39, schemaVersion: 39 });
    expect(
      migrated.db
        .prepare("SELECT name FROM pragma_table_info('session_recipient_authority') ORDER BY cid")
        .all(),
    ).toEqual([
      { name: "session_key" },
      { name: "epoch" },
      { name: "created_at" },
      { name: "updated_at" },
    ]);
    expect(migrated.db.prepare("SELECT * FROM session_recipient_authority").all()).toEqual([]);
    expect(migrated.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  // Upstream's 32-36 and 38 change only PostgreSQL; on SQLite they advance metadata over schema 31
  // (38 over 37). Upstream's 37 adds the cold-archive chunk table, which earlier databases gain on
  // the way. 37 is a U8-era store migrated straight to 39; 38 is upstream's (U9) own 38.
  it.each([32, 33, 34, 35, 36, 37, 38])(
    "adds recipient authority to upstream's schema-%i database",
    async (version) => {
      const env = { OPENCLAW_STATE_DIR: createTempStateDir() };
      const upstreamSchema = withoutSessionRecipientAuthoritySchema(OPENCLAW_AGENT_SCHEMA_SQL);
      stageCapturedAgentDatabase(env, agentDbTempDirs, {
        ddl: version < 37 ? withoutAgentColdArchiveChunks(upstreamSchema) : upstreamSchema,
        version,
        authorityRow: false,
      });

      const migrated = await migrateAndOpenLegacyAgentDatabaseForTest({ agentId: "main", env });

      expect(readSchemaMarkers(migrated.db)).toEqual({ userVersion: 39, schemaVersion: 39 });
      expect(hasRecipientAuthorityTable(migrated.db)).toBe(true);
      expect(migrated.db.prepare("SELECT * FROM session_recipient_authority").all()).toEqual([]);
      expect(migrated.db.prepare("PRAGMA integrity_check").all()).toEqual([
        { integrity_check: "ok" },
      ]);
      expect(migrated.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(
        migrated.db
          .prepare("SELECT count(*) AS n FROM session_transcript_cold_archive_chunks")
          .get(),
      ).toEqual({ n: 0 });
    },
  );

  // Earlier candidates numbered this step 32 (before jump 5), 35 (jump 5, live on four seats), 36
  // (jump 6) and 38 (jumps 7-8); upstream's 32, 35, 36 and 38 now name PostgreSQL-only steps. Such a
  // SQLite database is upstream's same-numbered schema plus the table (below 37 without upstream's
  // cold-archive chunk table, which step 37 adds), so the idempotent step keeps the rows.
  it.each([32, 35, 36, 38])(
    "migrates an earlier candidate's schema-%i database and keeps its authority rows",
    async (version) => {
      const env = { OPENCLAW_STATE_DIR: createTempStateDir() };
      stageCapturedAgentDatabase(env, agentDbTempDirs, {
        ddl:
          version < 37
            ? withoutAgentColdArchiveChunks(OPENCLAW_AGENT_SCHEMA_SQL)
            : OPENCLAW_AGENT_SCHEMA_SQL,
        version,
        authorityRow: true,
      });
      const retained = {
        session_key: AUTHORITY.sessionKey,
        epoch: AUTHORITY.epoch,
        created_at: 1,
        updated_at: 2,
      };

      const migrated = await migrateAndOpenLegacyAgentDatabaseForTest({ agentId: "main", env });

      expect(readSchemaMarkers(migrated.db)).toEqual({ userVersion: 39, schemaVersion: 39 });
      expect(migrated.db.prepare("SELECT * FROM session_recipient_authority").all()).toEqual([
        retained,
      ]);
      expect(migrated.db.prepare("PRAGMA integrity_check").all()).toEqual([
        { integrity_check: "ok" },
      ]);
      closeOpenClawAgentDatabasesForTest();

      const reopened = openOpenClawAgentDatabase({ agentId: "main", env });
      expect(readSchemaMarkers(reopened.db)).toEqual({ userVersion: 39, schemaVersion: 39 });
      expect(reopened.db.prepare("SELECT * FROM session_recipient_authority").all()).toEqual([
        retained,
      ]);
    },
  );

  // Re-run safety: the step keeps rows when its table exists, imports a legacy epoch once, and
  // never lets a legacy epoch replace existing authority.
  it("applies the schema-39 step twice to a migrated jump-8 database with one effect", async () => {
    const env = { OPENCLAW_STATE_DIR: createTempStateDir() };
    const databasePath = stageCapturedAgentDatabase(env, agentDbTempDirs, {
      ddl: OPENCLAW_AGENT_SCHEMA_SQL,
      version: 38,
      authorityRow: true,
    });
    await migrateAndOpenLegacyAgentDatabaseForTest({ agentId: "main", env });
    closeOpenClawAgentDatabasesForTest();
    const { DatabaseSync } = requireNodeSqlite();
    using database = new DatabaseSync(databasePath);
    database
      .prepare(
        "INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at) VALUES (?, ?, ?, 2)",
      )
      .run(
        "agent:main:late-epoch",
        "late",
        JSON.stringify({
          sessionId: "late",
          updatedAt: 2,
          recipientAuthorityEpoch: "77777777-7777-4777-8777-777777777777",
        }),
      );
    // A legacy epoch for a key that already has authority must not replace it.
    database
      .prepare(
        "INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at) VALUES (?, ?, ?, 3)",
      )
      .run(
        AUTHORITY.sessionKey,
        "retained",
        JSON.stringify({
          sessionId: "retained",
          updatedAt: 3,
          recipientAuthorityEpoch: "99999999-9999-4999-8999-999999999999",
        }),
      );
    const read = () => ({
      schema: database
        .prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name")
        .all(),
      authority: database
        .prepare("SELECT * FROM session_recipient_authority ORDER BY session_key")
        .all(),
      sessions: database
        .prepare(
          "SELECT session_key, entry_json, entry_valid FROM session_nodes ORDER BY session_key",
        )
        .all(),
    });
    const apply = () => {
      database.exec("BEGIN IMMEDIATE");
      migrateSessionRecipientAuthorityInTransaction(database);
      database.exec("COMMIT");
    };

    apply();
    const once = read();
    expect(once.authority).toEqual([
      expect.objectContaining({
        session_key: "agent:main:late-epoch",
        epoch: "77777777-7777-4777-8777-777777777777",
      }),
      { session_key: AUTHORITY.sessionKey, epoch: AUTHORITY.epoch, created_at: 1, updated_at: 2 },
    ]);
    expect(
      database
        .prepare("SELECT entry_json FROM session_nodes WHERE session_key = ?")
        .get(AUTHORITY.sessionKey),
    ).toEqual({ entry_json: JSON.stringify({ sessionId: "retained", updatedAt: 3 }) });
    apply();
    expect(read()).toEqual(once);
    expect(database.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
  });

  it("migrates a schema-24 database that already carries recipient authority idempotently", async () => {
    const env = { OPENCLAW_STATE_DIR: createTempStateDir() };
    const authority = {
      sessionKey: "agent:main:retained-authority",
      epoch: "33333333-3333-4333-8333-333333333333",
    };
    stageSchema24AgentDatabase(env, { withTable: true, authority });

    const migrated = await migrateAndOpenLegacyAgentDatabaseForTest({ agentId: "main", env });

    expect(readSchemaMarkers(migrated.db)).toEqual({ userVersion: 39, schemaVersion: 39 });
    expect(migrated.db.prepare("SELECT * FROM session_recipient_authority").all()).toEqual([
      { session_key: authority.sessionKey, epoch: authority.epoch, created_at: 1, updated_at: 2 },
    ]);
    closeOpenClawAgentDatabasesForTest();

    const reopened = openOpenClawAgentDatabase({ agentId: "main", env });
    expect(readSchemaMarkers(reopened.db)).toEqual({ userVersion: 39, schemaVersion: 39 });
    expect(reopened.db.prepare("SELECT * FROM session_recipient_authority").all()).toEqual([
      { session_key: authority.sessionKey, epoch: authority.epoch, created_at: 1, updated_at: 2 },
    ]);
  });
});
