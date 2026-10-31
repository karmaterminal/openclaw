// Frond (karmaterminal): fork-39 bridge. Fork-only: continuation builds before jump 12 numbered
// recipient authority 39, so fleet agent databases at 39 hold upstream's 38 plus the authority
// table. Upstream's own 39 widens the transcript payload CHECK and authority is now 40. Only the
// fleet's 39 may be bridged: upstream's 39 step runs once beside the authority step, authority rows
// survive, every other 39 shape is refused, an interrupted run leaves the predecessor, and Doctor's
// declared backup restores it.
import type { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import * as coldNavigation from "./openclaw-agent-cold-navigation-schema.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION as target } from "./openclaw-agent-db-contract.js";
import { assertOpenClawAgentSchemaContains } from "./openclaw-agent-db-schema-helpers.js";
import { readCapturedAgentSchema } from "./openclaw-agent-db.schema-bridge.test-support.js";
import {
  getAgentFork39MigrationSchema,
  readAgentFork39HistoricalSchema,
  withAgentFork39BackupCrossing,
} from "./openclaw-agent-fork39-bridge.js";
import {
  sessionRecipientAuthoritySchemaSql,
  withoutSessionRecipientAuthoritySchema,
} from "./openclaw-agent-recipient-authority-schema.js";
import { getOpenClawAgentMigrationSchema } from "./openclaw-agent-schema-history.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.js";
import { assertOpenClawMigrationWitnessPreserved } from "./openclaw-migration-witness.js";
import { resolveSchemaMigrationBackupTables } from "./schema-migration-backup-scope.js";
import {
  agentWitness,
  expectVersion,
  migrationFixture,
  row,
  rows,
  seedAgentV38Schema,
  seedVersion,
} from "./schema-migration.test-support.js";

/** Release DDL captured from exact commits; never derived from the current schema. */
const SCHEMA_39 = {
  // Every fork build from jump 9 (48a4a4b441) through F″ (20a1ffd3d9) writes this fresh.
  fleet: readCapturedAgentSchema("openclaw-agent-schema-v39-fleet.sql"),
  // Upstream's cold-navigation 39 as U12 (b8b054c13a) writes it fresh.
  upstream: readCapturedAgentSchema("openclaw-agent-schema-v39.sql"),
};
const AUTHORITY = {
  session_key: "agent:main:retained-authority",
  epoch: "55555555-5555-4555-8555-555555555555",
  created_at: 1,
  updated_at: 2,
};
const NAVIGATION = JSON.stringify({
  version: 1,
  report: { kind: "ignored" },
  navigation: {},
  reset: {},
  model: {},
  modelBytes: 0,
  modelWithoutCheckpointBytes: 0,
  withoutCustomDataBytes: 0,
});
const WIDENED_CLAUSE = /event_json IS NULL AND event_zstd IS NULL\s+AND event_utf8_bytes/gu;
const FLEET_SCOPE = ["schema_meta", "session_recipient_authority", "transcript_events"];

function seedRows(database: DatabaseSync, authority: boolean): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    INSERT OR IGNORE INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', 0);
    INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at)
      VALUES ('agent:main:retained', 'hot', '{"sessionId":"hot","updatedAt":1}', 1);
    UPDATE session_nodes SET entry_valid = 1;
    INSERT INTO session_windows (session_id, session_key, created_at, updated_at)
      VALUES ('hot', 'agent:main:retained', 1, 1), ('cold', 'agent:main:retained', 1, 1);
    INSERT INTO transcript_events (session_id, seq, event_json, created_at)
      VALUES ('hot', 1, '{"type":"message","message":{"role":"user"}}', 1);
    INSERT INTO session_transcript_cold_archives
      (session_id, generation, archive_name, archive_sha256, event_count, raw_bytes,
       archive_bytes, last_seq, archived_at, storage, archive_blob)
      VALUES ('cold', 'generation', 'retained.jsonl.zst', '${"a".repeat(64)}',
        1, 7, 3, 1, 1, 'sqlite', X'0011FF');
    INSERT INTO cache_entries (scope, key, blob, updated_at)
      VALUES ('unrelated', 'bytes', X'000100FF', 1);
    ANALYZE;
  `);
  if (authority) {
    database
      .prepare(
        "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(AUTHORITY.session_key, AUTHORITY.epoch, AUTHORITY.created_at, AUTHORITY.updated_at);
  }
}

function seed39(ddl: string, authority: boolean) {
  return (database: DatabaseSync) => {
    database.exec(ddl);
    seedVersion(database, 39);
    seedRows(database, authority);
  };
}

const insertCold = (database: DatabaseSync) =>
  database
    .prepare(`INSERT INTO transcript_events
    (session_id, seq, event_utf8_bytes, navigation_json, created_at) VALUES ('cold', 1, 123, ?, 1)`)
    .run(NAVIGATION);
const transcriptSql = (database: DatabaseSync) =>
  String(row(database, "SELECT sql FROM sqlite_schema WHERE name = 'transcript_events'")?.sql);
const authorityRows = (database: DatabaseSync) =>
  rows(database, "SELECT * FROM session_recipient_authority ORDER BY session_key");
const catalog = (database: DatabaseSync) =>
  rows(database, "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name");

const fleet39 = migrationFixture({
  seed: seed39(SCHEMA_39.fleet, true),
  // Doctor backs the bridge up as a crossing from 38 (asserted below).
  predecessor: 38,
  target,
  scope: FLEET_SCOPE,
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("recognizes the captured fleet 39 as the bridge's historical schema, not upstream's 39", () => {
  using database = openNodeSqliteDatabase(":memory:");
  database.exec(SCHEMA_39.fleet);
  expect(readAgentFork39HistoricalSchema(database, "fleet", 39)).toBe(
    getAgentFork39MigrationSchema(),
  );
  expect(() =>
    assertOpenClawAgentSchemaContains(database, "fleet", getAgentFork39MigrationSchema()),
  ).not.toThrow();
  expect(() =>
    assertOpenClawAgentSchemaContains(database, "fleet", getOpenClawAgentMigrationSchema(39)),
  ).toThrow(/constraints differ for transcript_events/u);
  using upstream = openNodeSqliteDatabase(":memory:");
  upstream.exec(SCHEMA_39.upstream);
  expect(readAgentFork39HistoricalSchema(upstream, "upstream", 39)).toBeUndefined();
});

it("takes upstream's 38 through upstream's 39 to 40", async () => {
  const seed = (database: DatabaseSync) => {
    seedAgentV38Schema(database);
    seedRows(database, false);
  };
  const config = { seed, predecessor: 38 } as const;
  // Upstream's own step alone: the widened constraint, no authority table.
  await migrationFixture({ ...config, target: 39, scope: ["schema_meta", "transcript_events"] })(
    "fork39-from-38-to-39.sqlite",
    async ({ database, migrate }) => {
      expect(() => insertCold(database)).toThrow(/CHECK constraint/u);
      await migrate();
      expectVersion(database, 39);
      expect(transcriptSql(database).match(WIDENED_CLAUSE)).toHaveLength(1);
      expect(
        row(database, "SELECT 1 FROM sqlite_schema WHERE name = 'session_recipient_authority'"),
      ).toBeUndefined();
    },
  );
  // Both steps in one transaction: upstream's 39 once, then continuation's 40.
  const step = vi.spyOn(coldNavigation, "migrateAgentColdNavigationInTransaction");
  await migrationFixture({ ...config, target, scope: FLEET_SCOPE })(
    "fork39-from-38-to-40.sqlite",
    async ({ database, migrate }) => {
      await migrate();
      expectVersion(database, target);
      expect(step).toHaveBeenCalledTimes(1);
      expect(transcriptSql(database).match(WIDENED_CLAUSE)).toHaveLength(1);
      expect(authorityRows(database)).toEqual([]);
      insertCold(database);
    },
  );
});

it("adds recipient authority to upstream's 39 without re-running upstream's step", async () => {
  const step = vi.spyOn(coldNavigation, "migrateAgentColdNavigationInTransaction");
  await migrationFixture({
    seed: seed39(SCHEMA_39.upstream, false),
    predecessor: 39,
    target,
    scope: ["schema_meta", "session_recipient_authority"],
  })("fork39-upstream.sqlite", async ({ database, migrate }) => {
    const witness = agentWitness(database);
    const definition = transcriptSql(database);
    await migrate();
    expectVersion(database, target);
    expect(step).not.toHaveBeenCalled();
    expect(transcriptSql(database)).toBe(definition);
    expect(authorityRows(database)).toEqual([]);
    expect(assertOpenClawMigrationWitnessPreserved(witness, agentWitness(database))).toEqual({
      warnings: [],
    });
  });
});

it("bridges the fleet's 39: upstream's 39 runs exactly once and authority rows survive", async () => {
  const step = vi.spyOn(coldNavigation, "migrateAgentColdNavigationInTransaction");
  await fleet39("fork39-fleet.sqlite", async ({ database, migrate }) => {
    expect(() => insertCold(database)).toThrow(/CHECK constraint/u);
    const witness = agentWitness(database);
    const hot = rows(database, "SELECT CAST(rowid AS TEXT) AS id, * FROM transcript_events");
    await migrate();
    expectVersion(database, target);
    expect(step).toHaveBeenCalledTimes(1);
    expect(authorityRows(database)).toEqual([AUTHORITY]);
    expect(rows(database, "SELECT CAST(rowid AS TEXT) AS id, * FROM transcript_events")).toEqual(
      hot,
    );
    expect(transcriptSql(database).match(WIDENED_CLAUSE)).toHaveLength(1);
    expect(assertOpenClawMigrationWitnessPreserved(witness, agentWitness(database))).toEqual({
      warnings: [],
    });
    insertCold(database);
    expect(rows(database, "PRAGMA foreign_key_check")).toEqual([]);
    // The stamped 40 is current: the schema owner never bridges or re-runs upstream's 39 again.
    await migrate();
    expect(step).toHaveBeenCalledTimes(1);
    expect(authorityRows(database)).toEqual([AUTHORITY]);
  });
});

it.each([
  [
    "both markers",
    `${SCHEMA_39.upstream}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`,
  ],
  ["neither marker", withoutSessionRecipientAuthoritySchema(SCHEMA_39.fleet)],
] as const)("refuses an ambiguous 39 with %s, unchanged", async (_shape, ddl) => {
  await migrationFixture({
    seed: seed39(ddl, false),
    predecessor: 39,
    target,
    scope: [],
  })("fork39-ambiguous.sqlite", async ({ database, migrate }) => {
    const before = { catalog: catalog(database), version: row(database, "PRAGMA user_version") };
    await expect(migrate()).rejects.toThrow(/unrecognized schema-39 shape/u);
    expect({ catalog: catalog(database), version: row(database, "PRAGMA user_version") }).toEqual(
      before,
    );
    expect(() => agentWitness(database)).toThrow(/unrecognized schema-39 shape/u);
  });
});

it("rolls an interrupted bridge back whole, then bridges once on retry", async () => {
  await fleet39("fork39-interrupted.sqlite", async ({ database, migrate }) => {
    const before = { catalog: catalog(database), authority: authorityRows(database) };
    await migrate("rollback");
    expectVersion(database, 39);
    expect({ catalog: catalog(database), authority: authorityRows(database) }).toEqual(before);
    expect(() => insertCold(database)).toThrow(/CHECK constraint/u);
    await migrate();
    expectVersion(database, target);
    expect(transcriptSql(database).match(WIDENED_CLAUSE)).toHaveLength(1);
    expect(authorityRows(database)).toEqual(before.authority);
  });
});

it("restores the fleet's 39 from Doctor's declared backup", async () => {
  await fleet39(
    "fork39-restore.sqlite",
    async ({ database, restore }) => {
      const pathname = database.location()!;
      expect(
        resolveSchemaMigrationBackupTables(
          withAgentFork39BackupCrossing({
            kind: "agent",
            path: pathname,
            foundVersion: 39,
            supportedVersion: target,
          }),
        ),
      ).toEqual(FLEET_SCOPE);
      await restore(() => ({
        definition: transcriptSql(database),
        version: row(database, "PRAGMA user_version"),
        authority: authorityRows(database),
        catalog: catalog(database),
      }));
      expect(getOpenClawAgentMigrationSchema(39)).not.toContain("session_recipient_authority");
    },
    "state",
  );
});
