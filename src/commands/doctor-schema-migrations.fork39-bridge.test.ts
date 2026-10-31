// Frond (karmaterminal): fork-39 bridge. Fork-only: Doctor's version phase takes the fleet's 39
// (upstream's 38 plus recipient authority) and upstream's 39 to 40 inside their declared backup
// scopes, keeps authority rows, restores the exact predecessor, refuses an ambiguous 39 before any
// write, and leaves a bridged store to the same cold-navigation backfill as any other.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { zstdCompressSync } from "node:zlib";
import { expect, it } from "vitest";
import { inspectScopedMigrationSnapshot } from "../infra/sqlite-migration-scoped-snapshot.js";
import { migrateSessionColdNavigation } from "../infra/state-migrations.cold-navigation.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION } from "../state/openclaw-agent-db-contract.js";
import { closeOpenClawAgentDatabasesAsync } from "../state/openclaw-agent-db.js";
import { readCapturedAgentSchema } from "../state/openclaw-agent-db.schema-bridge.test-support.js";
import { withAgentFork39BackupCrossing } from "../state/openclaw-agent-fork39-bridge.js";
import {
  sessionRecipientAuthoritySchemaSql,
  withoutSessionRecipientAuthoritySchema,
} from "../state/openclaw-agent-recipient-authority-schema.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "../state/openclaw-agent-schema.js";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import { resolveSchemaMigrationBackupTables } from "../state/schema-migration-backup-scope.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { restoreDoctorMigrationBackup } from "./doctor-migration-backup-restore.js";
import { prepareDoctorDatabaseMigrations } from "./doctor-schema-migrations.js";
import { withMaintenance } from "./doctor-schema-migrations.test-support.js";

const FLEET = readCapturedAgentSchema("openclaw-agent-schema-v39-fleet.sql");
const UPSTREAM = readCapturedAgentSchema("openclaw-agent-schema-v39.sql");
const AUTHORITY_ROW = {
  session_key: "agent:main:fleet-authority",
  epoch: "88888888-8888-4888-8888-888888888888",
  created_at: 5,
  updated_at: 6,
};

/** One complete archive whose transcript has no retained navigation yet. */
function seedArchive(database: DatabaseSync, sessionId: string): void {
  const event = JSON.stringify({
    type: "message",
    id: "message",
    parentId: null,
    message: { role: "assistant", content: [{ type: "text", text: "retained payload" }] },
  });
  const bytes = zstdCompressSync(
    Buffer.from(
      [
        { kind: "header", version: 1, sessionId, generation: "retained" },
        { kind: "event", row: { seq: 0, event_json: event, created_at: 7 } },
        {
          kind: "identity",
          row: {
            event_id: "message",
            seq: 0,
            event_type: "message",
            parent_id: null,
            message_idempotency_key: "persisted-fact",
            created_at: 8,
          },
        },
      ]
        .map((record) => JSON.stringify(record))
        .join("\n"),
    ),
  );
  database
    .prepare(`INSERT INTO session_windows (session_id, session_key, created_at, updated_at)
      VALUES (?, 'agent:main:main', 1, 1)`)
    .run(sessionId);
  database
    .prepare(`INSERT INTO session_transcript_cold_archives
      (session_id, generation, archive_name, archive_sha256, event_count, raw_bytes,
       archive_bytes, last_seq, archived_at, storage, archive_blob)
      VALUES (?, 'retained', ?, ?, 1, ?, ?, 0, 1, 'sqlite', ?)`)
    .run(
      sessionId,
      `${sessionId}.zst`,
      createHash("sha256").update(bytes).digest("hex"),
      Buffer.byteLength(event),
      bytes.length,
      bytes,
    );
}

function stage39(pathname: string, ddl: string, authority: boolean): DatabaseSync {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  const database = new DatabaseSync(pathname);
  database.exec(`${ddl}
    PRAGMA user_version = 39;
    INSERT INTO schema_meta (meta_key, role, schema_version, agent_id, created_at, updated_at)
      VALUES ('primary', 'agent', 39, 'main', 1, 1);
    INSERT OR IGNORE INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', 0);
    INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at)
      VALUES ('agent:main:main', 'kept', '{"sessionId":"kept","updatedAt":1}', 1);
    UPDATE session_nodes SET entry_valid = 1;`);
  seedArchive(database, "archived");
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
  const authority =
    database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get("session_recipient_authority") !== undefined;
  return {
    userVersion: database.prepare("PRAGMA user_version").get()?.user_version,
    schemaVersion: database
      .prepare("SELECT schema_version FROM schema_meta WHERE meta_key = 'primary'")
      .get()?.schema_version,
    authority: authority
      ? database.prepare("SELECT * FROM session_recipient_authority").all()
      : undefined,
    sessions: database.prepare("SELECT session_key, entry_json FROM session_nodes").all(),
    schema: database
      .prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name")
      .all(),
  };
}

const SHAPES = [
  {
    shape: "fleet 39",
    ddl: FLEET,
    authority: true,
    scope: ["schema_meta", "session_recipient_authority", "transcript_events"],
  },
  {
    shape: "upstream 39",
    ddl: UPSTREAM,
    authority: false,
    scope: ["schema_meta", "session_recipient_authority"],
  },
] as const;

async function runDoctor(env: NodeJS.ProcessEnv, pathname: string) {
  const migration = {
    kind: "agent" as const,
    agentId: "main",
    path: pathname,
    foundVersion: 39,
    supportedVersion: OPENCLAW_AGENT_SCHEMA_VERSION,
  };
  const tables = resolveSchemaMigrationBackupTables(withAgentFork39BackupCrossing(migration));
  await withMaintenance(() =>
    prepareDoctorDatabaseMigrations({
      env,
      pendingMigrations: [migration],
      pendingDatabasePaths: [pathname],
      databasePaths: [pathname],
      agentDatabaseTargets: [
        { agentId: "main", path: pathname, realPath: pathname, source: "disk" },
      ],
    }),
  );
  return tables;
}

it.each(SHAPES)(
  "takes the $shape store to 40 through Doctor and restores it from its declared backup",
  async ({ ddl, authority, scope }) => {
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      openOpenClawStateDatabase({ env: state.env });
      const pathname = state.statePath("agents", "main", "agent", "openclaw-agent.sqlite");
      using database = stage39(pathname, ddl, authority);
      const original = readStore(database);

      expect(await runDoctor(state.env, pathname)).toEqual(scope);
      await closeOpenClawAgentDatabasesAsync();

      expect(readStore(database)).toMatchObject({
        userVersion: OPENCLAW_AGENT_SCHEMA_VERSION,
        schemaVersion: OPENCLAW_AGENT_SCHEMA_VERSION,
        authority: authority ? [AUTHORITY_ROW] : [],
        sessions: original.sessions,
      });
      expect(database.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);

      // A bridged store reaches the same Doctor backfill as any other 40.
      const backfill = await migrateSessionColdNavigation({ env: state.env });
      expect(backfill.warnings).toEqual([]);
      expect(database.prepare("SELECT session_id, seq FROM transcript_events").all()).toEqual([
        { session_id: "archived", seq: 0 },
      ]);

      const archive = fs
        .readdirSync(path.dirname(pathname))
        .find((name) => name.endsWith(".scoped.bak"));
      const backupPath = path.join(path.dirname(pathname), archive!);
      expect(inspectScopedMigrationSnapshot(backupPath).tables.map((table) => table.name)).toEqual(
        scope,
      );
      await restoreDoctorMigrationBackup({ sourcePath: pathname, backupPath, env: state.env });
      using restored = new DatabaseSync(pathname, { readOnly: true });
      expect(readStore(restored)).toEqual(original);
    });
  },
);

it.each([
  ["both markers", `${UPSTREAM}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`],
  ["neither marker", withoutSessionRecipientAuthoritySchema(FLEET)],
])("refuses an ambiguous 39 store with %s before any write", async (_shape, ddl) => {
  await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    openOpenClawStateDatabase({ env: state.env });
    const pathname = state.statePath("agents", "main", "agent", "openclaw-agent.sqlite");
    using database = stage39(pathname, ddl, false);
    const original = readStore(database);
    await expect(runDoctor(state.env, pathname)).rejects.toThrow(/unrecognized schema-39 shape/u);
    await closeOpenClawAgentDatabasesAsync();
    expect(readStore(database)).toEqual(original);
  });
});
