import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { ensureMemoryIndexSchema } from "../../packages/memory-host-sdk/src/host/memory-schema.js";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { compactDoctorSessionSqliteTarget } from "../commands/doctor-session-sqlite-compact.js";
import {
  assertOpenClawAgentDatabaseForMaintenance,
  ensureOpenClawAgentDatabaseSchema,
  OPENCLAW_AGENT_SCHEMA_VERSION,
  resolveOpenClawAgentSqlitePath,
} from "./openclaw-agent-db.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.generated.js";
import {
  assertOpenClawStateDatabaseForMaintenance,
  OPENCLAW_STATE_SCHEMA_VERSION,
} from "./openclaw-state-db.js";
import { OPENCLAW_STATE_SCHEMA_SQL } from "./openclaw-state-schema.generated.js";

const maintenanceTempDirs: string[] = [];

afterAll(() => {
  cleanupTempDirs(maintenanceTempDirs);
});

describe("OpenClaw database maintenance schema validation", () => {
  it("accepts the current global and agent schemas", () => {
    const globalDatabase = createGlobalDatabase();
    const agentDatabase = createAgentDatabase();
    try {
      expect(() =>
        assertOpenClawStateDatabaseForMaintenance(globalDatabase, {
          pathname: "global.sqlite",
        }),
      ).not.toThrow();
      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(agentDatabase, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).not.toThrow();
    } finally {
      agentDatabase.close();
      globalDatabase.close();
    }
  });

  it("accepts a global schema produced by an additive column migration", () => {
    const schemaWithoutMigratedColumn = OPENCLAW_STATE_SCHEMA_SQL.replace(
      "  delivery_thread_id_type TEXT,\n",
      "",
    );
    const database = createGlobalDatabase(schemaWithoutMigratedColumn);
    try {
      database.exec("ALTER TABLE cron_jobs ADD COLUMN delivery_thread_id_type TEXT;");

      expect(() =>
        assertOpenClawStateDatabaseForMaintenance(database, {
          pathname: "global.sqlite",
        }),
      ).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("accepts a migrated required column with its temporary default", () => {
    const schemaWithoutMigratedColumn = OPENCLAW_STATE_SCHEMA_SQL.replace(
      "  owner_session_key TEXT,\n  name TEXT NOT NULL,\n  description TEXT,\n",
      "  owner_session_key TEXT,\n  description TEXT,\n",
    );
    const database = createGlobalDatabase(schemaWithoutMigratedColumn);
    try {
      database.exec("ALTER TABLE cron_jobs ADD COLUMN name TEXT NOT NULL DEFAULT '';");

      expect(() =>
        assertOpenClawStateDatabaseForMaintenance(database, {
          pathname: "global.sqlite",
        }),
      ).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("accepts the migrated conversation kind with its temporary default", () => {
    const schemaWithoutMigratedColumn = OPENCLAW_STATE_SCHEMA_SQL.replace(
      "  conversation_kind TEXT NOT NULL,\n",
      "",
    ).replace(
      `CREATE INDEX IF NOT EXISTS idx_current_conversation_bindings_conversation
  ON current_conversation_bindings(channel, account_id, conversation_kind, conversation_id);
`,
      "",
    );
    const database = createGlobalDatabase(schemaWithoutMigratedColumn);
    try {
      database.exec(`
        ALTER TABLE current_conversation_bindings
          ADD COLUMN conversation_kind TEXT NOT NULL DEFAULT 'channel';
        CREATE INDEX idx_current_conversation_bindings_conversation
          ON current_conversation_bindings(channel, account_id, conversation_kind, conversation_id);
      `);

      expect(() =>
        assertOpenClawStateDatabaseForMaintenance(database, {
          pathname: "global.sqlite",
        }),
      ).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("rejects a current global database with a missing canonical table", () => {
    const database = createGlobalDatabase();
    try {
      database.exec("DROP TABLE delivery_queue_entries;");

      expect(() =>
        assertOpenClawStateDatabaseForMaintenance(database, {
          pathname: "global.sqlite",
        }),
      ).toThrow("missing table delivery_queue_entries");
    } finally {
      database.close();
    }
  });

  it("rejects a current global database with a drifted canonical index", () => {
    const database = createGlobalDatabase();
    try {
      database.exec(`
        DROP INDEX idx_task_runs_status;
        CREATE INDEX idx_task_runs_status ON task_runs(task_id);
      `);

      expect(() =>
        assertOpenClawStateDatabaseForMaintenance(database, {
          pathname: "global.sqlite",
        }),
      ).toThrow("missing or drifted index idx_task_runs_status");
    } finally {
      database.close();
    }
  });

  it("rejects a current global database with an unexpected unique index", () => {
    const database = createGlobalDatabase();
    try {
      database.exec("CREATE UNIQUE INDEX idx_task_runs_unexpected_owner ON task_runs(owner_key);");

      expect(() =>
        assertOpenClawStateDatabaseForMaintenance(database, {
          pathname: "global.sqlite",
        }),
      ).toThrow("unexpected unique index idx_task_runs_unexpected_owner");
    } finally {
      database.close();
    }
  });

  it("rejects a current agent database with a missing canonical table", () => {
    const database = createAgentDatabase();
    try {
      database.exec("DROP TABLE auth_profile_store;");

      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).toThrow("missing table auth_profile_store");
    } finally {
      database.close();
    }
  });

  it("accepts only canonical memory path FTS triggers", () => {
    const database = createAgentDatabase();
    try {
      ensureMemoryIndexSchema({
        db: database,
        cacheEnabled: true,
        ftsEnabled: true,
      });

      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).not.toThrow();

      database.exec("DROP TRIGGER memory_index_paths_fts_after_delete;");
      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).toThrow("missing or drifted trigger memory_index_paths_fts_after_delete");
      ensureMemoryIndexSchema({
        db: database,
        cacheEnabled: true,
        ftsEnabled: true,
      });

      database.exec(`
        CREATE TRIGGER memory_index_sources_unexpected_after_insert
        AFTER INSERT ON memory_index_sources
        BEGIN
          UPDATE memory_index_state SET revision = revision + 100 WHERE id = 1;
        END;
      `);

      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).toThrow("unexpected trigger memory_index_sources_unexpected_after_insert");
    } finally {
      database.close();
    }
  });

  it("rejects a drifted canonical memory path FTS trigger", () => {
    const database = createAgentDatabase();
    try {
      ensureMemoryIndexSchema({
        db: database,
        cacheEnabled: true,
        ftsEnabled: true,
      });
      database.exec(`
        DROP TRIGGER memory_index_paths_fts_after_insert;
        CREATE TRIGGER memory_index_paths_fts_after_insert
        AFTER INSERT ON memory_index_sources
        BEGIN
          INSERT INTO memory_index_paths_fts (rowid, path, source)
          VALUES (NEW.id, NEW.path || '-drifted', NEW.source);
        END;
      `);

      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).toThrow("missing or drifted trigger memory_index_paths_fts_after_insert");
    } finally {
      database.close();
    }
  });

  it("rejects a current agent database with a drifted canonical trigger", () => {
    const database = createAgentDatabase();
    try {
      database.exec(`
        DROP TRIGGER memory_index_sources_revision_after_insert;
        CREATE TRIGGER memory_index_sources_revision_after_insert
        AFTER INSERT ON memory_index_sources
        BEGIN
          UPDATE memory_index_state SET revision = 0 WHERE id = 1;
        END;
      `);

      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).toThrow("missing or drifted trigger memory_index_sources_revision_after_insert");
    } finally {
      database.close();
    }
  });

  it("rejects a current agent database with a missing canonical check constraint", () => {
    const database = createAgentDatabase();
    try {
      database.exec(`
        DROP TABLE memory_index_state;
        CREATE TABLE memory_index_state (
          id INTEGER PRIMARY KEY,
          revision INTEGER NOT NULL
        );
        INSERT INTO memory_index_state (id, revision) VALUES (1, 0);
      `);

      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId: "worker-1",
          pathname: "agent.sqlite",
        }),
      ).toThrow("column definitions differ for memory_index_state");
    } finally {
      database.close();
    }
  });

  it("repairs unreleased v13 drift before compacting without losing rows", () => {
    const stateDir = makeTempDir(maintenanceTempDirs, "openclaw-agent-maintenance-");
    const agentId = "worker-1";
    const env = { OPENCLAW_STATE_DIR: stateDir };
    const storePath = path.join(stateDir, "agents", agentId, "sessions", "sessions.json");
    const sqlitePath = resolveOpenClawAgentSqlitePath({ agentId, env });
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

    const database = new DatabaseSync(sqlitePath);
    try {
      ensureOpenClawAgentDatabaseSchema(database, { agentId, path: sqlitePath });
      database
        .prepare(
          `INSERT INTO sessions (
             session_id, session_key, session_scope, created_at, updated_at, status
           ) VALUES (?, ?, 'conversation', ?, ?, 'done')`,
        )
        .run("session-1", "agent:worker-1:main", 1, 1);
      database
        .prepare(
          `INSERT INTO session_entries (
             session_key, session_id, entry_json, updated_at, status, created_by_json
           ) VALUES (?, ?, ?, ?, 'done', ?)`,
        )
        .run(
          "agent:worker-1:main",
          "session-1",
          JSON.stringify({ sessionId: "session-1", updatedAt: 1 }),
          1,
          JSON.stringify({ kind: "agent", id: "worker-1" }),
        );
      database
        .prepare(
          `INSERT INTO board_tabs (
             session_key, tab_id, title, position, chat_dock, created_by, revision
           ) VALUES (?, 'main', 'Main', 0, 'right', 'agent', 1)`,
        )
        .run("agent:worker-1:main");
      database
        .prepare(
          `INSERT INTO board_widgets (
             session_key, name, tab_id, content_kind, html, sha256, view_generation,
             revision, size_w, size_h, position, manifest, grant_state, created_by,
             created_at, updated_at
           ) VALUES (?, 'status', 'main', 'html', ?, 'sha', 'view', 1, 6, 4, 0,
             '{}', 'none', 'agent', 1, 1)`,
        )
        .run("agent:worker-1:main", Buffer.from("preserved"));

      const schema = database
        .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'board_widgets'")
        .get() as { sql: string };
      const legacySchema = schema.sql
        .replace(
          "content_kind IN ('html', 'mcp-app', 'plugin')",
          "content_kind IN ('html', 'mcp-app')",
        )
        .replace(
          /\s+OR\s+\(content_kind = 'plugin' AND html IS NULL AND descriptor_json IS NOT NULL AND view_generation IS NULL\)/u,
          "",
        )
        .replace(/^CREATE TABLE board_widgets/u, "CREATE TABLE board_widgets_legacy");
      database.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN IMMEDIATE;
        ALTER TABLE session_entries DROP COLUMN created_by_json;
        ${legacySchema};
        INSERT INTO board_widgets_legacy SELECT * FROM board_widgets;
        DROP TABLE board_widgets;
        ALTER TABLE board_widgets_legacy RENAME TO board_widgets;
        CREATE INDEX idx_agent_board_widgets_tab_position
          ON board_widgets(session_key, tab_id, position);
        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
    } finally {
      database.close();
    }

    const compact = compactDoctorSessionSqliteTarget(
      { agentId, storePath },
      { env, migrateOlderSchema: true },
    );
    expect(compact.skipped).toBe(false);

    const repaired = new DatabaseSync(sqlitePath);
    try {
      expect(() =>
        assertOpenClawAgentDatabaseForMaintenance(repaired, {
          agentId,
          pathname: sqlitePath,
        }),
      ).not.toThrow();
      expect(
        repaired
          .prepare("SELECT name FROM pragma_table_info('session_entries') ORDER BY cid")
          .all(),
      ).toContainEqual({ name: "created_by_json" });
      expect(
        repaired
          .prepare(
            "SELECT entry_json, status, created_by_json FROM session_entries WHERE session_key = ?",
          )
          .get("agent:worker-1:main"),
      ).toEqual({
        created_by_json: null,
        entry_json: JSON.stringify({ sessionId: "session-1", updatedAt: 1 }),
        status: "done",
      });
      expect(
        repaired
          .prepare(
            "SELECT content_kind, CAST(html AS TEXT) AS html FROM board_widgets WHERE session_key = ? AND name = 'status'",
          )
          .get("agent:worker-1:main"),
      ).toEqual({ content_kind: "html", html: "preserved" });
      expect(
        (
          repaired
            .prepare(
              "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'board_widgets'",
            )
            .get() as { sql: string }
        ).sql,
      ).toContain("content_kind IN ('html', 'mcp-app', 'plugin')");
      expect(repaired.prepare("PRAGMA user_version").get()).toEqual({
        user_version: OPENCLAW_AGENT_SCHEMA_VERSION,
      });
    } finally {
      repaired.close();
    }
  });
});

function createGlobalDatabase(schemaSql = OPENCLAW_STATE_SCHEMA_SQL): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(schemaSql);
  database.exec(`PRAGMA user_version = ${OPENCLAW_STATE_SCHEMA_VERSION};`);
  database
    .prepare(
      `
        INSERT INTO schema_meta (
          meta_key,
          role,
          schema_version,
          agent_id,
          app_version,
          created_at,
          updated_at
        ) VALUES ('primary', 'global', ?, NULL, NULL, 1, 1)
      `,
    )
    .run(OPENCLAW_STATE_SCHEMA_VERSION);
  return database;
}

function createAgentDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(OPENCLAW_AGENT_SCHEMA_SQL);
  database.exec(`PRAGMA user_version = ${OPENCLAW_AGENT_SCHEMA_VERSION};`);
  database
    .prepare(
      `
        INSERT INTO schema_meta (
          meta_key,
          role,
          schema_version,
          agent_id,
          app_version,
          created_at,
          updated_at
        ) VALUES ('primary', 'agent', ?, 'worker-1', NULL, 1, 1)
      `,
    )
    .run(OPENCLAW_AGENT_SCHEMA_VERSION);
  return database;
}
