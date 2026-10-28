// Continuation (karmaterminal): agent schema 39 is recipient authority on top of upstream's 38.
// Version 38 has two SQLite histories: upstream's (a metadata-only advance over 37) and the
// jump-8 candidate's (upstream's 37 plus the authority table and its rows). Doctor's version
// phase must take both, and an upstream 37 store, to 39 inside the declared backup scope, keep
// authority rows, re-run as a no-op, and restore the exact predecessor from its backup.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { inspectScopedMigrationSnapshot } from "../infra/sqlite-migration-scoped-snapshot.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION } from "../state/openclaw-agent-db-contract.js";
import { withAgentDatabaseMaintenanceLease } from "../state/openclaw-agent-db-maintenance-lease.js";
import { ensureOpenClawAgentDatabaseSchema } from "../state/openclaw-agent-db-schema.js";
import { closeOpenClawAgentDatabasesAsync } from "../state/openclaw-agent-db.js";
import { withoutSessionRecipientAuthoritySchema } from "../state/openclaw-agent-recipient-authority-schema.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "../state/openclaw-agent-schema.js";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { resolveSchemaMigrationBackupTables } from "../state/schema-migration-backup-scope.js";
import { assertSqliteMigrationScopePreserved } from "../state/sqlite-migration-scope.test-support.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { restoreDoctorMigrationBackup } from "./doctor-migration-backup-restore.js";
import { prepareDoctorDatabaseMigrations } from "./doctor-schema-migrations.js";
import { withMaintenance } from "./doctor-schema-migrations.test-support.js";

const AUTHORITY_ROW = {
  session_key: "agent:main:jump8-authority",
  epoch: "66666666-6666-4666-8666-666666666666",
  created_at: 5,
  updated_at: 6,
};
const SHAPES = [
  { shape: "jump-8 candidate 38", version: 38, authority: true },
  { shape: "upstream 38", version: 38, authority: false },
  { shape: "upstream 37", version: 37, authority: false },
] as const;

function stageAgentDatabase(pathname: string, version: number, authority: boolean) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  const database = new DatabaseSync(pathname);
  database.exec(
    authority
      ? OPENCLAW_AGENT_SCHEMA_SQL
      : withoutSessionRecipientAuthoritySchema(OPENCLAW_AGENT_SCHEMA_SQL),
  );
  database.exec(`
    PRAGMA user_version = ${version};
    INSERT INTO schema_meta (meta_key, role, schema_version, agent_id, created_at, updated_at)
      VALUES ('primary', 'agent', ${version}, 'main', 1, 1);
    INSERT OR IGNORE INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', 0);
    INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at)
      VALUES ('agent:main:main', 'kept', '{"sessionId":"kept","updatedAt":1}', 1);
    UPDATE session_nodes SET entry_valid = 1;
  `);
  if (authority) {
    database
      .prepare(
        "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        AUTHORITY_ROW.session_key,
        AUTHORITY_ROW.epoch,
        AUTHORITY_ROW.created_at,
        AUTHORITY_ROW.updated_at,
      );
  }
  return database;
}

function readStore(database: DatabaseSync) {
  const hasAuthority =
    database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get("session_recipient_authority") !== undefined;
  return {
    userVersion: database.prepare("PRAGMA user_version").get()?.user_version,
    schemaVersion: database
      .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary'")
      .get()?.schema_version,
    authority: hasAuthority
      ? database.prepare("SELECT * FROM session_recipient_authority ORDER BY session_key").all()
      : undefined,
    sessions: database.prepare("SELECT session_key, entry_json FROM session_nodes").all(),
    schema: database
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name")
      .all(),
  };
}

it.each(SHAPES)(
  "takes the $shape agent store to 39 through Doctor, re-runs as a no-op, and restores it",
  async ({ version, authority }) => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const stateDatabase = openOpenClawStateDatabase({ env: state.env });
      expect(stateDatabase.db.prepare("PRAGMA user_version").get()?.user_version).toBe(35);
      const pathname = state.statePath("agents", "main", "agent", "openclaw-agent.sqlite");
      using database = stageAgentDatabase(pathname, version, authority);
      const original = readStore(database);
      const migration = {
        kind: "agent" as const,
        agentId: "main",
        path: pathname,
        foundVersion: version,
        supportedVersion: OPENCLAW_AGENT_SCHEMA_VERSION,
      };
      const tables = resolveSchemaMigrationBackupTables(migration)!;
      expect(tables).toContain("session_recipient_authority");

      await withMaintenance(async () => {
        await assertSqliteMigrationScopePreserved(database, tables, async () => {
          const result = await prepareDoctorDatabaseMigrations({
            env: state.env,
            pendingMigrations: [migration],
            pendingDatabasePaths: [pathname],
            databasePaths: [pathname],
            agentDatabaseTargets: [
              { agentId: "main", path: pathname, realPath: pathname, source: "disk" },
            ],
          });
          expect(result.warnings).toEqual([]);
        });
      });
      await closeOpenClawAgentDatabasesAsync();

      const migrated = readStore(database);
      expect(migrated).toMatchObject({
        userVersion: 39,
        schemaVersion: 39,
        authority: authority ? [AUTHORITY_ROW] : [],
        sessions: original.sessions,
      });
      expect(database.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
      expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(stateDatabase.db.prepare("PRAGMA user_version").get()?.user_version).toBe(35);

      // Re-running the schema owner on the migrated store changes nothing.
      await withAgentDatabaseMaintenanceLease({ env: state.env }, async () => {
        ensureOpenClawAgentDatabaseSchema(database, {
          agentId: "main",
          path: pathname,
          env: state.env,
        });
        ensureOpenClawAgentDatabaseSchema(database, {
          agentId: "main",
          path: pathname,
          env: state.env,
        });
      });
      expect(readStore(database)).toEqual(migrated);

      // The declared-scope backup holds the predecessor's authority rows and restores it exactly.
      const archive = fs
        .readdirSync(path.dirname(pathname))
        .find((name) => name.endsWith(".scoped.bak"));
      expect(archive).toBeDefined();
      const backupPath = path.join(path.dirname(pathname), archive!);
      expect(inspectScopedMigrationSnapshot(backupPath).tables.map((table) => table.name)).toEqual(
        tables,
      );
      await restoreDoctorMigrationBackup({ sourcePath: pathname, backupPath, env: state.env });
      using restored = new DatabaseSync(pathname, { readOnly: true });
      expect(readStore(restored)).toEqual(original);
    });
  },
);
