// Agent schema 26 has two histories. Upstream's schema 26 promotes JSON predicates to
// columns; the fleet's earlier (unreleased) schema 26 instead added session recipient
// authority on top of upstream's schema 25. Schema 35 must tell them apart by shape,
// migrate each to the same schema-35 database, and refuse a mix.
import { constants } from "node:sqlite";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import { withAgentDatabaseMaintenanceLease } from "./openclaw-agent-db-maintenance-lease.js";
import {
  closeOpenClawAgentDatabasesForTest,
  ensureOpenClawAgentDatabaseSchema,
} from "./openclaw-agent-db.js";
import {
  AUTHORITY,
  CAPTURED_SESSION,
  captureAgentWitness,
  materializeSharedStateDatabase,
  migrateAgentDatabase,
  openAgentDatabase,
  readCapturedAgentSchema,
  readCapturedSession,
  readCapturedSessionStartedAt,
  readShape,
  stageCapturedAgentDatabase,
} from "./openclaw-agent-db.schema-bridge.test-support.js";
import { assertOpenClawMigrationWitnessPreserved } from "./openclaw-migration-witness.js";
import { closeOpenClawStateDatabaseForTest } from "./openclaw-state-db.js";

const tempDirs: string[] = [];

/** Release DDL captured from real files or exact commits; never derived from the current schema. */
const CAPTURED_SCHEMA_26 = {
  // The fleet's schema 26 as deployed build 03de0ce5d3 migrated a captured fleet schema 25.
  "fleet-migrated": readCapturedAgentSchema("openclaw-agent-schema-v26-fleet-migrated.sql"),
  // The fleet's schema 26 as deployed build 03de0ce5d3 creates it fresh.
  "fleet-fresh": readCapturedAgentSchema("openclaw-agent-schema-v26-fleet.sql"),
  // Upstream's JSON-predicate schema 26 (84a834e233, #169315).
  upstream: readCapturedAgentSchema("openclaw-agent-schema-v26.sql"),
};
type History = keyof typeof CAPTURED_SCHEMA_26;

function stageSchema26(env: NodeJS.ProcessEnv, history: History, extraDdl = ""): string {
  return stageCapturedAgentDatabase(env, tempDirs, {
    ddl: CAPTURED_SCHEMA_26[history] + extraDdl,
    version: 26,
    authorityRow: history !== "upstream",
  });
}

afterAll(() => {
  cleanupTempDirs(tempDirs);
});

afterEach(() => {
  closeOpenClawAgentDatabasesForTest();
  closeOpenClawStateDatabaseForTest();
});

describe("agent schema 26 → 35 bridge", () => {
  it.each(["fleet-migrated", "fleet-fresh"] as const)(
    "migrates the fleet's %s recipient-authority schema 26 by backfilling JSON predicates, keeping authority and session rows",
    async (history) => {
      const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, `schema26-${history}-`) };
      const databasePath = stageSchema26(env, history);
      expect(readShape(databasePath)).toMatchObject({
        userVersion: 26,
        authorityTable: true,
        legacyTriggers: false,
        predicateColumns: "none",
      });

      await migrateAgentDatabase(env, tempDirs);

      expect(readShape(databasePath)).toEqual({
        userVersion: 35,
        schemaVersion: 35,
        authorityTable: true,
        legacyTriggers: false,
        predicateColumns: "all",
        authorityRows: [{ session_key: AUTHORITY.sessionKey, epoch: AUTHORITY.epoch }],
      });
      expect(readCapturedSession(databasePath)).toEqual({
        current_session_id: CAPTURED_SESSION.entry.sessionId,
        entry_json: JSON.stringify(CAPTURED_SESSION.entry),
      });
      expect(readCapturedSessionStartedAt(databasePath)).toBe(
        CAPTURED_SESSION.entry.sessionStartedAt,
      );
      expect(readSqliteUserVersion(openAgentDatabase(env, tempDirs).db)).toBe(35);
    },
  );

  it("migrates upstream's JSON-predicate schema 26 by adding recipient authority", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema26-upstream-") };
    const databasePath = stageSchema26(env, "upstream");
    expect(readShape(databasePath)).toMatchObject({
      userVersion: 26,
      authorityTable: false,
      predicateColumns: "all",
    });

    await migrateAgentDatabase(env, tempDirs);

    expect(readShape(databasePath)).toEqual({
      userVersion: 35,
      schemaVersion: 35,
      authorityTable: true,
      legacyTriggers: false,
      predicateColumns: "all",
      authorityRows: [],
    });
    expect(readCapturedSession(databasePath)).toEqual({
      current_session_id: CAPTURED_SESSION.entry.sessionId,
      entry_json: JSON.stringify(CAPTURED_SESSION.entry),
    });
    expect(readSqliteUserVersion(openAgentDatabase(env, tempDirs).db)).toBe(35);
  });

  it("reopens a migrated fleet schema 26 database unchanged", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema26-reopen-") };
    const databasePath = stageSchema26(env, "fleet-migrated");
    await migrateAgentDatabase(env, tempDirs);
    const migrated = readShape(databasePath);

    await migrateAgentDatabase(env, tempDirs);
    expect(readSqliteUserVersion(openAgentDatabase(env, tempDirs).db)).toBe(35);
    closeOpenClawAgentDatabasesForTest();

    expect(readShape(databasePath)).toEqual(migrated);
  });

  it.each([
    {
      name: "both authority and predicate columns",
      history: "upstream" as const,
      extraDdl: `CREATE TABLE IF NOT EXISTS session_recipient_authority (
  session_key TEXT NOT NULL PRIMARY KEY,
  epoch TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;`,
    },
    {
      name: "only some predicate columns",
      history: "fleet-fresh" as const,
      extraDdl: "ALTER TABLE session_nodes ADD COLUMN session_started_at INTEGER;",
    },
  ])("refuses a schema 26 database with $name", async ({ history, extraDdl }) => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema26-mixed-") };
    const databasePath = stageSchema26(env, history, extraDdl);
    const before = readShape(databasePath);

    await expect(migrateAgentDatabase(env, tempDirs)).rejects.toThrow(
      /unrecognized schema-26 shape/u,
    );

    expect(readShape(databasePath)).toEqual(before);
  });

  it("rolls a failed fleet schema 26 migration back to its original shape", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema26-rollback-") };
    const databasePath = stageSchema26(env, "fleet-migrated");
    const before = readShape(databasePath);
    materializeSharedStateDatabase(env, tempDirs);
    const { DatabaseSync } = requireNodeSqlite();
    const database = new DatabaseSync(databasePath);
    let reachedPublication = false;
    // Fail at the final marker publication, after the predicate backfill has run.
    database.setAuthorizer((action, name, value) => {
      if (action === constants.SQLITE_PRAGMA && name === "user_version" && value === "35") {
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

  it.each(["fleet-migrated", "upstream"] as const)(
    "witnesses a captured %s schema 26 database as preserved across migration",
    async (history) => {
      const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, `schema26-witness-${history}-`) };
      const databasePath = stageSchema26(env, history);
      const original = captureAgentWitness(databasePath);

      await migrateAgentDatabase(env, tempDirs);

      expect(() =>
        assertOpenClawMigrationWitnessPreserved(original, captureAgentWitness(databasePath)),
      ).not.toThrow();
      if (history === "fleet-migrated") {
        const { DatabaseSync } = requireNodeSqlite();
        const database = new DatabaseSync(databasePath);
        database.exec("DELETE FROM session_recipient_authority");
        database.close();
        expect(() =>
          assertOpenClawMigrationWitnessPreserved(original, captureAgentWitness(databasePath)),
        ).toThrow(/session_recipient_authority/u);
      }
    },
  );
});
