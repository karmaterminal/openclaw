// Frond (karmaterminal): fleet-38 bridge. Fork-only: the deployed fleet build (3d3364ddc5) numbered
// recipient authority 38, so fleet agent databases at 38 hold upstream's 38 plus the authority
// table; fork builds jump 9-F″ wrote the same DDL stamped 39, and the jump-13 candidate numbered it
// 41 over upstream's 40. Authority is now 42, above upstream's 39, 40 and 41 (active event facts).
// Only upstream's own 38-41, the fleet's 38 DDL (at 38 or 39) and the jump-13 41 migrate: each
// upstream step above the physical shape runs once beside the authority step, authority rows
// survive, every other 38-41 shape is refused unchanged (the version number alone admits nothing),
// an interrupted run leaves the predecessor at every step, older targets refuse 42, and Doctor's
// declared backup restores the fleet's 38.
import { constants, type DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { AGENT_ACTIVE_EVENT_FACTS_SQL } from "./openclaw-agent-active-event-facts-schema.js";
import * as coldNavigation from "./openclaw-agent-cold-navigation-schema.js";
import { AGENT_CREATION_OPERATIONS_SQL } from "./openclaw-agent-creation-operations-schema.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION as target } from "./openclaw-agent-db-contract.js";
import { assertOpenClawAgentSchemaContains } from "./openclaw-agent-db-schema-helpers.js";
import { ensureOpenClawAgentSchema } from "./openclaw-agent-db-schema.js";
import * as sessionMigrations from "./openclaw-agent-db-session-migrations.js";
import { readCapturedAgentSchema } from "./openclaw-agent-db.schema-bridge.test-support.js";
import {
  getAgentFleet38MigrationSchema,
  getAgentJump13Schema41MigrationSchema,
  readAgentBridgedShapeVersion,
  readAgentFleet38HistoricalSchema,
} from "./openclaw-agent-fleet38-bridge.js";
import {
  sessionRecipientAuthoritySchemaSql,
  withoutSessionRecipientAuthoritySchema,
} from "./openclaw-agent-recipient-authority-schema.js";
import { getOpenClawAgentMigrationSchema } from "./openclaw-agent-schema-history.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.js";
import { assertOpenClawMigrationWitnessPreserved } from "./openclaw-migration-witness.js";
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
const SCHEMA = {
  // Deployed fleet build 3d3364ddc5 writes this fresh at 38 (blob 0800da7d05, also F″'s).
  fleet38: readCapturedAgentSchema("openclaw-agent-schema-v38-fleet.sql"),
  // Upstream's cold-navigation 39 as U12 (b8b054c13a) writes it fresh.
  upstream39: readCapturedAgentSchema("openclaw-agent-schema-v39.sql"),
  // Upstream's creation-receipt 40 as U13 (480d503053) writes it fresh.
  upstream40: readCapturedAgentSchema("openclaw-agent-schema-v40.sql"),
  // Upstream's active-event-facts 41 as U14 (644ff7d714) writes it fresh.
  upstream41: readCapturedAgentSchema("openclaw-agent-schema-v41.sql"),
  // The jump-13 candidate's authority 41 as d15065f6a6 writes it fresh: upstream's 40 plus authority.
  jump13: readCapturedAgentSchema("openclaw-agent-schema-v41-jump13.sql"),
};
const AUTHORITY_DDL = sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL);
const AGENT_ACTIVE_FACTS_DDL = AGENT_ACTIVE_EVENT_FACTS_SQL;
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
// The real steps, captured before any spy replaces them.
const runNavigation = coldNavigation.migrateAgentColdNavigationInTransaction;
const runAuthority = sessionMigrations.migrateSessionRecipientAuthorityInTransaction;
const WIDENED_CLAUSE = /event_json IS NULL AND event_zstd IS NULL\s+AND event_utf8_bytes/gu;
const ACTIVE_FACTS = "session_transcript_active_event_facts";
const FLEET_SCOPE = [
  "schema_meta",
  "session_creation_operations",
  "session_recipient_authority",
  ACTIVE_FACTS,
  "transcript_events",
];
const JUMP13_SCOPE = ["schema_meta", "session_recipient_authority", ACTIVE_FACTS];

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

function seed(ddl: string, version: number, authority = false) {
  return (database: DatabaseSync) => {
    database.exec(ddl);
    seedVersion(database, version);
    seedRows(database, authority);
  };
}

const insertCold = (database: DatabaseSync) =>
  database
    .prepare(`INSERT INTO transcript_events
    (session_id, seq, event_utf8_bytes, navigation_json, created_at) VALUES ('cold', 1, 123, ?, 1)`)
    .run(NAVIGATION);
const tableSql = (database: DatabaseSync, name: string) =>
  row(database, "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?", name)?.sql;
const authorityRows = (database: DatabaseSync) =>
  rows(database, "SELECT * FROM session_recipient_authority ORDER BY session_key");
const catalog = (database: DatabaseSync) =>
  rows(database, "SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name");
const hotTranscript = (database: DatabaseSync) =>
  rows(database, "SELECT CAST(rowid AS TEXT) AS id, * FROM transcript_events WHERE seq = 1");
const snapshot = (database: DatabaseSync) => ({
  catalog: catalog(database),
  version: row(database, "PRAGMA user_version"),
  sessions: rows(database, "SELECT * FROM session_nodes"),
  transcript: hotTranscript(database),
});

/** Asserts a migrated 42: upstream's 39, 40 and 41 shapes and the authority table. */
function expectMigrated(database: DatabaseSync) {
  expectVersion(database, target);
  expect(String(tableSql(database, "transcript_events")).match(WIDENED_CLAUSE)).toHaveLength(1);
  expect(tableSql(database, "session_creation_operations")).toBeDefined();
  expect(rows(database, "SELECT * FROM session_creation_operations")).toEqual([]);
  expect(tableSql(database, ACTIVE_FACTS)).toBeDefined();
  expect(rows(database, `SELECT * FROM ${ACTIVE_FACTS}`)).toEqual([]);
  expect(tableSql(database, "session_recipient_authority")).toBeDefined();
  expect(() =>
    assertOpenClawAgentSchemaContains(database, "migrated", OPENCLAW_AGENT_SCHEMA_SQL),
  ).not.toThrow();
}

/** Upstream's 39 admits a cold row the prior CHECK refused; foreign keys still hold. */
function expectWritableColdRow(database: DatabaseSync) {
  insertCold(database);
  expect(rows(database, "PRAGMA foreign_key_check")).toEqual([]);
}

const fleet38 = (ddl = SCHEMA.fleet38, predecessor = 38) =>
  migrationFixture({
    seed: seed(ddl, predecessor, true),
    predecessor,
    target,
    scope: FLEET_SCOPE,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

it("recognizes the captured fleet 38 as the bridge's historical schema, not upstream's 38", () => {
  using database = openNodeSqliteDatabase(":memory:");
  database.exec(SCHEMA.fleet38);
  expect(readAgentFleet38HistoricalSchema(database, "fleet", 38)).toBe(
    getAgentFleet38MigrationSchema(),
  );
  expect(() =>
    assertOpenClawAgentSchemaContains(database, "fleet", getAgentFleet38MigrationSchema()),
  ).not.toThrow();
  using upstream = openNodeSqliteDatabase(":memory:");
  seedAgentV38Schema(upstream);
  expect(readAgentFleet38HistoricalSchema(upstream, "upstream", 38)).toBeUndefined();
  expect(getOpenClawAgentMigrationSchema(40)).not.toContain("session_recipient_authority");
  expect(getOpenClawAgentMigrationSchema(41)).not.toContain("session_recipient_authority");
  expect(getOpenClawAgentMigrationSchema(41)).toContain(ACTIVE_FACTS);
  expect(getOpenClawAgentMigrationSchema(target)).toContain("session_recipient_authority");
});

// Ronan's j14 ruling: the fleet's 38 DDL stamped 39 and the jump-13 41 are bridged histories whose
// physical shape sits below their marker; upstream's own shapes are not bridged.
it("classifies each bridged history by its markers, never by its number", () => {
  const shapeOf = (ddl: string, version: number) => {
    using database = openNodeSqliteDatabase(":memory:");
    database.exec(ddl);
    return {
      shape: readAgentBridgedShapeVersion(database, "fixture", version),
      history: readAgentFleet38HistoricalSchema(database, "fixture", version),
    };
  };
  expect(shapeOf(SCHEMA.fleet38, 38)).toEqual({
    shape: 38,
    history: getAgentFleet38MigrationSchema(),
  });
  expect(shapeOf(SCHEMA.fleet38, 39)).toEqual({
    shape: 38,
    history: getAgentFleet38MigrationSchema(),
  });
  expect(shapeOf(SCHEMA.jump13, 41)).toEqual({
    shape: 40,
    history: getAgentJump13Schema41MigrationSchema(),
  });
  expect(shapeOf(SCHEMA.upstream39, 39)).toEqual({ shape: undefined, history: undefined });
  expect(shapeOf(SCHEMA.upstream40, 40)).toEqual({ shape: undefined, history: undefined });
  expect(shapeOf(SCHEMA.upstream41, 41)).toEqual({ shape: undefined, history: undefined });
  using jump13 = openNodeSqliteDatabase(":memory:");
  jump13.exec(SCHEMA.jump13);
  expect(() =>
    assertOpenClawAgentSchemaContains(jump13, "jump13", getAgentJump13Schema41MigrationSchema()),
  ).not.toThrow();
});

// (a) The captured fleet build's DDL and the bridge's own fleet-shape SQL take the same path, under
// the fleet's 38 marker and under the 39 marker fork builds jump 9-F″ stamped on the same DDL.
it.each([
  ["captured fleet build", SCHEMA.fleet38, 38],
  ["bridge fleet-shape SQL", getAgentFleet38MigrationSchema(), 38],
  ["captured fleet build stamped 39", SCHEMA.fleet38, 39],
  ["bridge fleet-shape SQL stamped 39", getAgentFleet38MigrationSchema(), 39],
] as const)(
  "takes the fleet's 38 DDL (%s) through upstream's 39, 40 and 41 once each to 42, keeping authority",
  async (_source, ddl, predecessor) => {
    const navigation = vi.spyOn(coldNavigation, "migrateAgentColdNavigationInTransaction");
    const authority = vi.spyOn(sessionMigrations, "migrateSessionRecipientAuthorityInTransaction");
    await fleet38(ddl, predecessor)("fleet38.sqlite", async ({ database, migrate }) => {
      expect(() => insertCold(database)).toThrow(/CHECK constraint/u);
      const witness = agentWitness(database);
      const before = snapshot(database);
      const authorityDefinition = tableSql(database, "session_recipient_authority");
      await migrate();
      expectMigrated(database);
      expect(navigation).toHaveBeenCalledTimes(1);
      expect(authority).toHaveBeenCalledTimes(1);
      expect(tableSql(database, "session_recipient_authority")).toBe(authorityDefinition);
      expect(authorityRows(database)).toEqual([AUTHORITY]);
      expect(rows(database, "SELECT * FROM session_nodes")).toEqual(before.sessions);
      expect(
        rows(
          database,
          "SELECT CAST(rowid AS TEXT) AS id, * FROM transcript_events WHERE session_id = 'hot'",
        ),
      ).toEqual(before.transcript);
      expect(assertOpenClawMigrationWitnessPreserved(witness, agentWitness(database))).toEqual({
        warnings: [],
      });
      expectWritableColdRow(database);
      // The stamped 42 is current: no step runs again. Its admission only adds upstream's
      // same-version 39 indexes, which version crossings leave to admission.
      ensureOpenClawAgentSchema(database, "main", database.location()!, target);
      expectVersion(database, target);
      expect(navigation).toHaveBeenCalledTimes(1);
      expect(authority).toHaveBeenCalledTimes(1);
      expect(authorityRows(database)).toEqual([AUTHORITY]);
    });
  },
);

// (b) and (c): upstream's own 38, 40 and 41 gain an empty authority table.
it.each([
  {
    shape: "upstream's 38",
    seed: (database: DatabaseSync) => {
      seedAgentV38Schema(database);
      seedRows(database, false);
    },
    predecessor: 38,
    scope: FLEET_SCOPE,
    navigationRuns: 1,
  },
  {
    shape: "upstream's 40",
    seed: seed(SCHEMA.upstream40, 40),
    predecessor: 40,
    scope: JUMP13_SCOPE,
    navigationRuns: 0,
  },
  {
    shape: "upstream's 41",
    seed: seed(SCHEMA.upstream41, 41),
    predecessor: 41,
    scope: ["schema_meta", "session_recipient_authority"],
    navigationRuns: 0,
  },
])("takes $shape to 42 by creating the authority table", async (shape) => {
  const navigation = vi.spyOn(coldNavigation, "migrateAgentColdNavigationInTransaction");
  await migrationFixture({ ...shape, target })(
    "fleet38-upstream.sqlite",
    async ({ database, migrate }) => {
      const witness = agentWitness(database);
      const creation = tableSql(database, "session_creation_operations");
      await migrate();
      expectMigrated(database);
      expect(navigation).toHaveBeenCalledTimes(shape.navigationRuns);
      expect(authorityRows(database)).toEqual([]);
      if (creation) {
        expect(tableSql(database, "session_creation_operations")).toBe(creation);
      }
      expect(assertOpenClawMigrationWitnessPreserved(witness, agentWitness(database))).toEqual({
        warnings: [],
      });
      expectWritableColdRow(database);
    },
  );
});

// (d) A fresh database: openclaw-agent-db.recipient-authority-migration.test.ts creates one at 42.

// (d′) Ronan's j14 ruling: a store the jump-13 candidate already stamped 41 (upstream's 40 plus
// authority) runs upstream's 41 once and keeps its authority table and rows at 42.
it("takes the jump-13 41 through upstream's 41 to 42 without losing recipient authority", async () => {
  const navigation = vi.spyOn(coldNavigation, "migrateAgentColdNavigationInTransaction");
  const authority = vi.spyOn(sessionMigrations, "migrateSessionRecipientAuthorityInTransaction");
  await migrationFixture({
    seed: seed(SCHEMA.jump13, 41, true),
    predecessor: 41,
    target,
    scope: JUMP13_SCOPE,
  })("jump13.sqlite", async ({ database, migrate }) => {
    expect(tableSql(database, ACTIVE_FACTS)).toBeUndefined();
    const witness = agentWitness(database);
    const before = snapshot(database);
    const authorityDefinition = tableSql(database, "session_recipient_authority");
    const creation = tableSql(database, "session_creation_operations");
    await migrate();
    expectMigrated(database);
    expect(navigation).not.toHaveBeenCalled();
    expect(authority).toHaveBeenCalledTimes(1);
    expect(tableSql(database, "session_recipient_authority")).toBe(authorityDefinition);
    expect(tableSql(database, "session_creation_operations")).toBe(creation);
    expect(authorityRows(database)).toEqual([AUTHORITY]);
    expect(rows(database, "SELECT * FROM session_nodes")).toEqual(before.sessions);
    expect(hotTranscript(database)).toEqual(before.transcript);
    expect(assertOpenClawMigrationWitnessPreserved(witness, agentWitness(database))).toEqual({
      warnings: [],
    });
    expectWritableColdRow(database);
    ensureOpenClawAgentSchema(database, "main", database.location()!, target);
    expectVersion(database, target);
    expect(authority).toHaveBeenCalledTimes(1);
    expect(authorityRows(database)).toEqual([AUTHORITY]);
  });
});

// (e) Every other shape at 38-41 is refused before any write, and so is its witness.
it.each([
  ["38 with upstream's widened CHECK", SCHEMA.upstream39, 38],
  ["38 with the widened CHECK and authority", `${SCHEMA.upstream39}\n${AUTHORITY_DDL}`, 38],
  ["38 with creation receipts", `${SCHEMA.fleet38}\n${AGENT_CREATION_OPERATIONS_SQL}`, 38],
  ["38 with active event facts", SCHEMA.upstream41, 38],
  ["39 with authority and the widened CHECK", `${SCHEMA.upstream39}\n${AUTHORITY_DDL}`, 39],
  ["39 with active event facts", SCHEMA.upstream41, 39],
  [
    "39 without upstream's widened CHECK",
    withoutSessionRecipientAuthoritySchema(SCHEMA.fleet38),
    39,
  ],
  ["39 with creation receipts", `${SCHEMA.upstream39}\n${AGENT_CREATION_OPERATIONS_SQL}`, 39],
  ["40 with authority and no creation receipts", `${SCHEMA.upstream39}\n${AUTHORITY_DDL}`, 40],
  ["40 with authority and creation receipts", `${SCHEMA.upstream40}\n${AUTHORITY_DDL}`, 40],
  ["40 without creation receipts", SCHEMA.upstream39, 40],
  ["40 with active event facts", SCHEMA.upstream41, 40],
  ["40 holding the jump-13 41", SCHEMA.jump13, 40],
  // Ronan's j14 ruling: an unknown same-version 41 is refused, never relabelled.
  ["41 with authority and active event facts", `${SCHEMA.upstream41}\n${AUTHORITY_DDL}`, 41],
  ["41 without authority or active event facts", SCHEMA.upstream40, 41],
  ["41 with authority and no creation receipts", `${SCHEMA.upstream39}\n${AUTHORITY_DDL}`, 41],
  ["41 with authority and the prior CHECK", SCHEMA.fleet38, 41],
  [
    "41 with active event facts and no creation receipts",
    `${SCHEMA.upstream39}\n${AGENT_ACTIVE_FACTS_DDL}`,
    41,
  ],
] as const)("refuses %s, unchanged", async (_shape, ddl, version) => {
  await migrationFixture({ seed: seed(ddl, version), predecessor: version, target, scope: [] })(
    "fleet38-refused.sqlite",
    async ({ database, migrate }) => {
      const before = snapshot(database);
      const refusal = new RegExp(`unrecognized schema-${version} shape`, "u");
      await expect(migrate()).rejects.toThrow(refusal);
      expect(snapshot(database)).toEqual(before);
      expect(() => agentWitness(database)).toThrow(refusal);
    },
  );
});

it("refuses a database above 42, unchanged", async () => {
  await migrationFixture({
    seed: seed(OPENCLAW_AGENT_SCHEMA_SQL, target + 1),
    predecessor: target + 1,
    target,
    scope: [],
  })("fleet38-newer.sqlite", async ({ database, migrate }) => {
    const before = snapshot(database);
    await expect(migrate()).rejects.toThrow(new RegExp(`schema version ${target + 1}`, "u"));
    expect(snapshot(database)).toEqual(before);
  });
});

// (f) An interruption at any step rolls the whole migration back; the retry applies each step once.
it.each([
  ["upstream's 39", "navigation"],
  ["upstream's 40", "creation"],
  ["upstream's 41", "activeFacts"],
  ["the authority step", "authority"],
  ["the version stamp", "stamp"],
] as const)("rolls back an interruption at %s, then migrates once on retry", async (_s, step) => {
  const navigation = vi.spyOn(coldNavigation, "migrateAgentColdNavigationInTransaction");
  const authority = vi.spyOn(sessionMigrations, "migrateSessionRecipientAuthorityInTransaction");
  // Each interruption lands after its step has written inside the migration transaction.
  if (step === "navigation") {
    navigation.mockImplementationOnce((database) => {
      runNavigation(database);
      throw new Error("interrupted after upstream's 39");
    });
  } else if (step === "authority") {
    authority.mockImplementationOnce((database) => {
      runAuthority(database);
      throw new Error("interrupted after the authority step");
    });
  }
  await fleet38()("fleet38-interrupted.sqlite", async ({ database, migrate }) => {
    const before = { ...snapshot(database), authority: authorityRows(database) };
    if (step === "creation" || step === "activeFacts") {
      const denied = step === "creation" ? "session_creation_operations" : ACTIVE_FACTS;
      database.setAuthorizer((action, name) =>
        action === constants.SQLITE_CREATE_TABLE && name === denied
          ? constants.SQLITE_DENY
          : constants.SQLITE_OK,
      );
    }
    if (step === "stamp") {
      await migrate("rollback");
    } else {
      await expect(migrate()).rejects.toThrow(/interrupted|authoriz/u);
      database.setAuthorizer(null);
    }
    expect({ ...snapshot(database), authority: authorityRows(database) }).toEqual(before);
    vi.clearAllMocks();
    await migrate();
    expectMigrated(database);
    expectWritableColdRow(database);
    expect(navigation).toHaveBeenCalledTimes(1);
    expect(authority).toHaveBeenCalledTimes(1);
    expect(authorityRows(database)).toEqual(before.authority);
  });
});

// (g) Older targets refuse 42, and Doctor's declared backup restores the fleet's exact 38.
it("refuses 42 at the jump-13 (41), j12′ (40) and fleet (38) targets", async () => {
  await fleet38()("fleet38-older.sqlite", async ({ database, migrate }) => {
    await migrate();
    const migrated = snapshot(database);
    // Older runtimes refuse with the same `userVersion > OPENCLAW_AGENT_SCHEMA_VERSION` check
    // (a22bd9c05c and 3d3364ddc5, openclaw-agent-db-schema-read.ts).
    for (const older of [41, 40, 38]) {
      expect(() =>
        ensureOpenClawAgentSchema(database, "main", database.location()!, older),
      ).toThrow(new RegExp(`uses schema version ${target}; expected at most ${older}`, "u"));
    }
    expect(snapshot(database)).toEqual(migrated);
  });
});

it("restores the fleet's 38 from Doctor's declared backup", async () => {
  await fleet38()(
    "fleet38-restore.sqlite",
    async ({ database, restore }) => {
      await restore(() => ({
        transcript: tableSql(database, "transcript_events"),
        creation: tableSql(database, "session_creation_operations"),
        authority: authorityRows(database),
        catalog: catalog(database),
        version: row(database, "PRAGMA user_version"),
      }));
    },
    "state",
  );
});
