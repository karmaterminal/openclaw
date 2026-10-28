// Agent schema 25 has two histories. Upstream's schema 25 retired the canonical
// validation triggers; the fleet's earlier (unreleased) schema 25 instead added
// session recipient authority and kept those triggers. Schema 39 must tell them
// apart by shape, migrate each to the same schema-39 database, and refuse a mix.
import { constants } from "node:sqlite";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { readSqliteUserVersion } from "../infra/sqlite-user-version.js";
import { withAgentDatabaseMaintenanceLease } from "./openclaw-agent-db-maintenance-lease.js";
import {
  closeOpenClawAgentDatabasesForTest,
  ensureOpenClawAgentDatabaseSchema,
  OPENCLAW_AGENT_SCHEMA_VERSION,
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
import { sessionRecipientAuthoritySchemaSql } from "./openclaw-agent-recipient-authority-schema.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.js";
import { assertOpenClawMigrationWitnessPreserved } from "./openclaw-migration-witness.js";
import { closeOpenClawStateDatabaseForTest } from "./openclaw-state-db.js";

const tempDirs: string[] = [];

/** Release DDL captured from real files; never derived from the current schema. */
const CAPTURED_SCHEMA_25 = {
  // A fleet agent database at recipient-authority schema 25, as written by build 7d8a1a91c6.
  fleet: readCapturedAgentSchema("openclaw-agent-schema-v25-fleet-captured.sql"),
  // Upstream's canonical-writer schema 25 (6a8b0dceaf).
  upstream: readCapturedAgentSchema("openclaw-agent-schema-v25.sql"),
};

function stageCapturedSchema25(env: NodeJS.ProcessEnv, history: keyof typeof CAPTURED_SCHEMA_25) {
  return stageCapturedAgentDatabase(env, tempDirs, {
    ddl: CAPTURED_SCHEMA_25[history],
    version: 25,
    authorityRow: history === "fleet",
  });
}

type Shape = "fleet-25" | "upstream-25" | "schema-24" | "mixed-25";

/**
 * Writes a closed agent database at one historical shape and returns its path. Each shape
 * starts from captured DDL: upstream's steps 27–31 rebuild tables, so a current database
 * rolled back to 24 or 25 is not a schema those versions wrote.
 */
function stageAgentDatabase(env: NodeJS.ProcessEnv, shape: Shape): string {
  if (shape === "fleet-25" || shape === "upstream-25") {
    return stageCapturedSchema25(env, shape === "fleet-25" ? "fleet" : "upstream");
  }
  if (shape === "schema-24") {
    return stageCapturedAgentDatabase(env, tempDirs, {
      ddl: readCapturedAgentSchema("openclaw-agent-schema-v24.sql"),
      version: 24,
      authorityRow: false,
    });
  }
  // mixed-25: the authority table is present but the legacy triggers are retired.
  return stageCapturedAgentDatabase(env, tempDirs, {
    ddl: `${CAPTURED_SCHEMA_25.upstream}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`,
    version: 25,
    authorityRow: true,
  });
}

afterAll(() => {
  cleanupTempDirs(tempDirs);
});

afterEach(() => {
  closeOpenClawAgentDatabasesForTest();
  closeOpenClawStateDatabaseForTest();
});

describe("agent schema 25 → 39 bridge", () => {
  it("is schema 39", () => {
    expect(OPENCLAW_AGENT_SCHEMA_VERSION).toBe(39);
  });

  it("migrates the fleet's recipient-authority schema 25, retiring the legacy triggers and keeping authority rows", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-fleet-") };
    const databasePath = stageAgentDatabase(env, "fleet-25");
    expect(readShape(databasePath)).toMatchObject({
      userVersion: 25,
      authorityTable: true,
      legacyTriggers: true,
      predicateColumns: "none",
    });

    await migrateAgentDatabase(env, tempDirs);

    expect(readShape(databasePath)).toEqual({
      userVersion: 39,
      schemaVersion: 39,
      authorityTable: true,
      legacyTriggers: false,
      predicateColumns: "all",
      authorityRows: [{ session_key: AUTHORITY.sessionKey, epoch: AUTHORITY.epoch }],
    });
    // Ordinary opens accept the migrated file.
    expect(readSqliteUserVersion(openAgentDatabase(env, tempDirs).db)).toBe(39);
  });

  it("migrates upstream's canonical-writer schema 25 by adding predicates and recipient authority", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-upstream-") };
    const databasePath = stageAgentDatabase(env, "upstream-25");
    expect(readShape(databasePath)).toMatchObject({
      userVersion: 25,
      authorityTable: false,
      legacyTriggers: false,
      predicateColumns: "none",
    });

    await migrateAgentDatabase(env, tempDirs);

    expect(readShape(databasePath)).toEqual({
      userVersion: 39,
      schemaVersion: 39,
      authorityTable: true,
      legacyTriggers: false,
      predicateColumns: "all",
      authorityRows: [],
    });
  });

  it("migrates schema 24 through every step to schema 39", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema24-") };
    const databasePath = stageAgentDatabase(env, "schema-24");
    expect(readShape(databasePath)).toMatchObject({
      userVersion: 24,
      authorityTable: false,
      legacyTriggers: true,
      predicateColumns: "none",
    });

    await migrateAgentDatabase(env, tempDirs);

    expect(readShape(databasePath)).toEqual({
      userVersion: 39,
      schemaVersion: 39,
      authorityTable: true,
      legacyTriggers: false,
      predicateColumns: "all",
      authorityRows: [],
    });
  });

  it("reopens a migrated schema 39 database unchanged", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-reopen-") };
    const databasePath = stageAgentDatabase(env, "fleet-25");
    await migrateAgentDatabase(env, tempDirs);
    const migrated = readShape(databasePath);

    await migrateAgentDatabase(env, tempDirs);
    expect(readSqliteUserVersion(openAgentDatabase(env, tempDirs).db)).toBe(39);
    closeOpenClawAgentDatabasesForTest();

    expect(readShape(databasePath)).toEqual(migrated);
  });

  it("refuses a schema 25 database whose shape matches neither history", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-mixed-") };
    const databasePath = stageAgentDatabase(env, "mixed-25");
    const before = readShape(databasePath);

    await expect(migrateAgentDatabase(env, tempDirs)).rejects.toThrow(
      /unrecognized schema-25 shape/u,
    );

    expect(readShape(databasePath)).toEqual(before);
  });

  it("rolls a failed fleet schema 25 migration back to its original shape", async () => {
    const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-rollback-") };
    const databasePath = stageAgentDatabase(env, "fleet-25");
    const before = readShape(databasePath);
    materializeSharedStateDatabase(env, tempDirs);
    const { DatabaseSync } = requireNodeSqlite();
    const database = new DatabaseSync(databasePath);
    let reachedPublication = false;
    // Fail at the final marker publication, after every migration step has run.
    database.setAuthorizer((action, name, value) => {
      if (action === constants.SQLITE_PRAGMA && name === "user_version" && value === "39") {
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
      const databasePath = stageCapturedSchema25(env, "fleet");
      expect(readShape(databasePath)).toMatchObject({
        userVersion: 25,
        authorityTable: true,
        legacyTriggers: true,
        predicateColumns: "none",
      });

      await migrateAgentDatabase(env, tempDirs);

      expect(readShape(databasePath)).toEqual({
        userVersion: 39,
        schemaVersion: 39,
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
      expect(readSqliteUserVersion(openAgentDatabase(env, tempDirs).db)).toBe(39);
    });

    it("migrates a captured upstream schema 25 database by adding predicates and recipient authority", async () => {
      const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, "schema25-captured-upstream-") };
      const databasePath = stageCapturedSchema25(env, "upstream");
      expect(readShape(databasePath)).toMatchObject({
        userVersion: 25,
        authorityTable: false,
        legacyTriggers: false,
        predicateColumns: "none",
      });

      await migrateAgentDatabase(env, tempDirs);

      expect(readShape(databasePath)).toEqual({
        userVersion: 39,
        schemaVersion: 39,
        authorityTable: true,
        legacyTriggers: false,
        predicateColumns: "all",
        authorityRows: [],
      });
      expect(readCapturedSession(databasePath)).toEqual({
        current_session_id: CAPTURED_SESSION.entry.sessionId,
        entry_json: JSON.stringify(CAPTURED_SESSION.entry),
      });
      expect(readCapturedSessionStartedAt(databasePath)).toBe(
        CAPTURED_SESSION.entry.sessionStartedAt,
      );
      expect(readSqliteUserVersion(openAgentDatabase(env, tempDirs).db)).toBe(39);
    });

    it.each(["fleet", "upstream"] as const)(
      "witnesses a captured %s schema 25 database as preserved across migration",
      async (origin) => {
        const env = { OPENCLAW_STATE_DIR: makeTempDir(tempDirs, `schema25-witness-${origin}-`) };
        const databasePath = stageCapturedSchema25(env, origin);
        const original = captureAgentWitness(databasePath);

        await migrateAgentDatabase(env, tempDirs);

        expect(() =>
          assertOpenClawMigrationWitnessPreserved(original, captureAgentWitness(databasePath)),
        ).not.toThrow();
        if (origin === "fleet") {
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
});
