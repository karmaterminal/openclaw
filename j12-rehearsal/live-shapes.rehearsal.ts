// Jump-12 rehearsal (karmaterminal/openclaw-bootstrap#1727): the agent-database migration
// 38 -> 39 -> 40 and Doctor's scoped backup -> restore, on the four textual schema shapes the
// fleet's live agent databases hold (quoted vs bare identifiers, whitespace left by past table
// rebuilds). The inputs are schema text only; every row written here is synthetic.
//
// Each shape is built byte for byte from its sqlite_schema dump, seeded, copied into an isolated
// OpenClaw state directory, and migrated through Doctor's own preflight and version phase (the
// path `openclaw doctor --fix` and systemd activation take). Nothing here opens a seat or a real
// database.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { zstdCompressSync } from "node:zlib";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prepareDoctorDatabasePreflight } from "../src/commands/doctor-database-preflight.js";
import { restoreDoctorMigrationBackup } from "../src/commands/doctor-migration-backup-restore.js";
import { prepareDoctorDatabaseMigrations } from "../src/commands/doctor-schema-migrations.js";
import { withMaintenance } from "../src/commands/doctor-schema-migrations.test-support.js";
import { hashSessionColdChunks } from "../src/config/sessions/session-cold-storage-chunks.js";
import { projectSessionTranscriptReportFacts } from "../src/config/sessions/session-transcript-report-facts.js";
import { readTranscriptPayloadNavigation } from "../src/config/sessions/transcript-payload-navigation.js";
import {
  prepareTranscriptPayload,
  TRANSCRIPT_PAYLOAD_COLUMNS,
} from "../src/config/sessions/transcript-payload.js";
import { loadSqliteVecExtension } from "../src/infra/database-engine/sqlite-vec.js";
import { inspectScopedMigrationSnapshot } from "../src/infra/sqlite-migration-scoped-snapshot.js";
import { parseSqliteTableDefinition } from "../src/infra/sqlite-schema-contract-assembly.js";
import {
  extractSqliteTableSchema,
  normalizeSqlWhitespace,
  quoteSqliteIdentifier as quote,
} from "../src/infra/sqlite-schema-sql.js";
import { withoutAgentColdNavigation } from "../src/state/openclaw-agent-cold-navigation-schema.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION } from "../src/state/openclaw-agent-db-contract.js";
import { withAgentDatabaseMaintenanceLease } from "../src/state/openclaw-agent-db-maintenance-lease.js";
import { ensureOpenClawAgentDatabaseSchema } from "../src/state/openclaw-agent-db-schema.js";
import {
  closeOpenClawAgentDatabasesAsync,
  openOpenClawAgentDatabase,
} from "../src/state/openclaw-agent-db.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "../src/state/openclaw-agent-schema.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "../src/state/openclaw-state-db.js";
import { resolveSchemaMigrationBackupTables } from "../src/state/schema-migration-backup-scope.js";
import { assertSqliteMigrationScopePreserved } from "../src/state/sqlite-migration-scope.test-support.js";
import { withOpenClawTestState } from "../src/test-utils/openclaw-test-state.js";
import { VERSION } from "../src/version.js";

// Pass-through recorders: the real plan, bridge and backup-crossing decisions of each Doctor run.
const recorded = vi.hoisted(() => ({
  plans: [] as Array<{
    previousVersion: number;
    targetVersion: number;
    shapeVersion: number;
    crosses: number[];
  }>,
  bridges: [] as Array<{
    previousVersion: number;
    targetVersion: number;
    bridged: boolean;
    shapeVersion?: number;
  }>,
  backupCrossings: [] as Array<{ foundVersion: number; crossingFrom: number }>,
}));

vi.mock("../src/state/openclaw-agent-fleet-schema-history.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/state/openclaw-agent-fleet-schema-history.js")>();
  return {
    ...actual,
    planAgentFleetSchemaHistory(
      ...args: Parameters<typeof actual.planAgentFleetSchemaHistory>
    ): ReturnType<typeof actual.planAgentFleetSchemaHistory> {
      const plan = actual.planAgentFleetSchemaHistory(...args);
      const [, , previousVersion, targetVersion] = args;
      recorded.plans.push({
        previousVersion,
        targetVersion,
        shapeVersion: plan.shapeVersion,
        crosses: Array.from({ length: targetVersion }, (_, index) => index + 1).filter((version) =>
          plan.crosses(version),
        ),
      });
      return plan;
    },
  };
});

vi.mock("../src/state/openclaw-agent-fork39-bridge.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/state/openclaw-agent-fork39-bridge.js")>();
  return {
    ...actual,
    planAgentFork39Bridge(
      ...args: Parameters<typeof actual.planAgentFork39Bridge>
    ): ReturnType<typeof actual.planAgentFork39Bridge> {
      const result = actual.planAgentFork39Bridge(...args);
      recorded.bridges.push({
        previousVersion: args[2],
        targetVersion: args[3],
        bridged: result !== undefined,
        ...(result ? { shapeVersion: result.shapeVersion } : {}),
      });
      return result;
    },
    withAgentFork39BackupCrossing<
      T extends {
        kind: "agent" | "state";
        path: string;
        foundVersion: number;
        supportedVersion: number;
      },
    >(migration: T): T {
      const result = actual.withAgentFork39BackupCrossing(migration);
      recorded.backupCrossings.push({
        foundVersion: migration.foundVersion,
        crossingFrom: result.foundVersion,
      });
      return result;
    },
  };
});

const SHAPES_DIR =
  process.env.J12_SHAPES_DIR ?? "/home/figs/.local/state/frond-scribe/j12-live-schema-shapes";
const SHAPE_NAMES = ["cael", "ronan", "elliott", "emeric"] as const;
const RECEIPTS_DIR = fileURLToPath(new URL("./receipts/", import.meta.url));
// Migrated copies stay here for the U12 refusal check when J12_WORK_DIR names a directory.
const KEEP_WORK = process.env.J12_WORK_DIR !== undefined;
const WORK_DIR =
  process.env.J12_WORK_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "j12-live-shape-work-"));
const T0 = 1_793_400_000_000;
const AGENT_ID = "main";
const APP_VERSION_38 = "2026.10.7";
const DECLARED_SCOPE = ["schema_meta", "session_recipient_authority", "transcript_events"];
const TIMEOUT_MS = 600_000;

// ---------------------------------------------------------------------------------------------
// Shape files: `-- ` header comments, then `<type> <name>` lines each followed by that object's
// sqlite_schema.sql and a terminating `;`.

type ObjectType = "table" | "index" | "trigger" | "view";
type ShapeObject = {
  type: ObjectType;
  name: string;
  sql: string;
  virtualModule?: string;
  shadowOf?: string;
};
type Shape = {
  name: string;
  file: string;
  sha256: string;
  userVersion: number;
  schemaMeta: Array<{ key: string; schemaVersion: number }>;
  objects: ShapeObject[];
};

const VIRTUAL_TABLE = /^CREATE VIRTUAL TABLE ("?)([A-Za-z0-9_]+)\1 USING ([A-Za-z0-9_]+)\s*\(/u;
// The shadow tables each module creates for itself; these are never executed from the dump.
const SHADOW_SUFFIXES: Record<string, RegExp[]> = {
  fts5: [/^data$/u, /^idx$/u, /^content$/u, /^docsize$/u, /^config$/u],
  vec0: [
    /^chunks$/u,
    /^info$/u,
    /^rowids$/u,
    /^auxiliary$/u,
    /^vector_chunks\d+$/u,
    /^metadatachunks\d+$/u,
    /^metadatatext\d+$/u,
  ],
};

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readShapeSums(): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of fs.readFileSync(path.join(SHAPES_DIR, "SHA256SUMS"), "utf8").split("\n")) {
    const match = /^([0-9a-f]{64}) {2}(\S+)$/u.exec(line);
    if (match) {
      sums.set(match[2]!, match[1]!);
    }
  }
  return sums;
}

function readBookkeepingKeys(): Array<{ key: string; schemaVersion: number }> {
  return fs
    .readFileSync(path.join(SHAPES_DIR, "schema_meta.keys.txt"), "utf8")
    .split("\n")
    .flatMap((line) => {
      const match = /^(\S+) \(schema_version=(\d+)\)$/u.exec(line);
      return match ? [{ key: match[1]!, schemaVersion: Number(match[2]) }] : [];
    });
}

function parseShape(name: string): Shape {
  const file = path.join(SHAPES_DIR, `fleet38-shape-${name}.sql`);
  const bytes = fs.readFileSync(file);
  const text = bytes.toString("utf8");
  if (text.includes("\r")) {
    throw new Error(`${file}: carriage returns would not survive line splitting`);
  }
  const lines = text.split("\n");
  let userVersion: number | undefined;
  const schemaMeta: Shape["schemaMeta"] = [];
  const objects: ShapeObject[] = [];
  const header = /^(table|index|trigger|view) ([A-Za-z_][A-Za-z0-9_]*)$/u;
  let current: { type: ObjectType; name: string; lines: string[] } | undefined;
  const flush = () => {
    if (!current) {
      return;
    }
    const body = [...current.lines];
    while (body.length > 0 && body.at(-1) === "") {
      body.pop();
    }
    const block = body.join("\n");
    if (!block.endsWith(";") || !block.startsWith("CREATE ")) {
      throw new Error(`${file}: ${current.type} ${current.name} is not one CREATE statement`);
    }
    const sql = block.slice(0, -1);
    if (!sql.includes(current.name)) {
      throw new Error(`${file}: ${current.type} ${current.name} DDL does not name its object`);
    }
    objects.push({ type: current.type, name: current.name, sql });
    current = undefined;
  };
  for (const [index, line] of lines.entries()) {
    if (!current && objects.length === 0 && line.startsWith("-- ")) {
      const version = /^-- user_version=(\d+)$/u.exec(line);
      const meta = /^-- schema_meta (\S+) schema_version=(\d+)$/u.exec(line);
      if (version) {
        userVersion = Number(version[1]);
      } else if (meta) {
        schemaMeta.push({ key: meta[1]!, schemaVersion: Number(meta[2]) });
      } else {
        throw new Error(`${file}:${index + 1}: unknown header comment`);
      }
      continue;
    }
    const match = header.exec(line);
    if (match) {
      flush();
      current = { type: match[1] as ObjectType, name: match[2]!, lines: [] };
      continue;
    }
    if (!current) {
      if (line === "" && index === lines.length - 1) {
        continue;
      }
      throw new Error(`${file}:${index + 1}: DDL outside an object block`);
    }
    current.lines.push(line);
  }
  flush();
  if (userVersion === undefined) {
    throw new Error(`${file}: missing user_version header`);
  }
  const virtuals = objects.flatMap((object) => {
    const match = object.type === "table" ? VIRTUAL_TABLE.exec(object.sql) : null;
    if (!match) {
      return [];
    }
    const module = match[3]!.toLowerCase();
    if (!SHADOW_SUFFIXES[module]) {
      throw new Error(`${file}: virtual table module ${module} has no known shadow tables`);
    }
    object.virtualModule = module;
    return [{ name: object.name, module }];
  });
  for (const object of objects) {
    if (object.type !== "table" || object.virtualModule) {
      continue;
    }
    const owner = virtuals.find(
      ({ name: table, module }) =>
        object.name.startsWith(`${table}_`) &&
        SHADOW_SUFFIXES[module]!.some((suffix) => suffix.test(object.name.slice(table.length + 1))),
    );
    if (owner) {
      object.shadowOf = owner.name;
    }
  }
  return { name, file, sha256: sha256(bytes), userVersion, schemaMeta, objects };
}

// ---------------------------------------------------------------------------------------------
// Physical capture: every catalog entry and every stored table (shadow tables included, virtual
// tables through their shadows), each value with its storage class and exact bytes.

type SchemaRow = { type: string; name: string; tbl_name: string; sql: string | null };
type TableCapture = { columns: string[]; rows: string[][]; sha256: string };
type Capture = {
  userVersion: number;
  schema: SchemaRow[];
  tables: Map<string, TableCapture>;
};

function readSchema(db: DatabaseSync): SchemaRow[] {
  return db
    .prepare("SELECT type, name, tbl_name, sql FROM main.sqlite_schema ORDER BY type, name")
    .all() as SchemaRow[];
}

function readTable(db: DatabaseSync, name: string, withoutRowid: boolean): TableCapture {
  const xinfo = db.prepare(`PRAGMA main.table_xinfo(${quote(name)})`).all() as Array<{
    name: string;
    pk: number;
    hidden: number;
  }>;
  const columns = xinfo.filter((column) => column.hidden !== 1).map((column) => column.name);
  const rowid = withoutRowid
    ? undefined
    : ["rowid", "_rowid_", "oid"].find(
        (alias) => !columns.some((column) => column.toLowerCase() === alias),
      );
  if (!withoutRowid && !rowid) {
    throw new Error(`${name} hides every implicit rowid alias`);
  }
  const names = rowid ? [rowid, ...columns] : columns;
  const order = rowid
    ? [rowid]
    : xinfo
        .filter((column) => column.pk > 0)
        .toSorted((left, right) => left.pk - right.pk)
        .map((column) => column.name);
  const selections = names.map((column, index) => {
    const quoted = quote(column);
    return `typeof(${quoted}) AS t${index}, CASE typeof(${quoted})
      WHEN 'integer' THEN CAST(${quoted} AS TEXT)
      WHEN 'real' THEN printf('%!.26g', ${quoted})
      WHEN 'text' THEN CAST(${quoted} AS BLOB)
      ELSE ${quoted} END AS v${index}`;
  });
  const hash = createHash("sha256").update(JSON.stringify(names));
  const rows: string[][] = [];
  for (const row of db
    .prepare(
      `SELECT ${selections.join(", ")} FROM main.${quote(name)} ORDER BY ${order.map(quote).join(", ")}`,
    )
    .iterate()) {
    const encoded = names.map((_, index) => {
      const value = row[`v${index}`];
      const bytes =
        value === null
          ? Buffer.alloc(0)
          : typeof value === "string"
            ? Buffer.from(value)
            : Buffer.from(value as Uint8Array);
      return `${String(row[`t${index}`])}:${bytes.toString("hex")}`;
    });
    hash.update(encoded.join(",")).update("\n");
    rows.push(encoded);
  }
  return { columns: names, rows, sha256: hash.digest("hex") };
}

function captureDatabase(db: DatabaseSync): Capture {
  const tables = new Map<string, TableCapture>();
  const list = db
    .prepare(
      `SELECT name, wr FROM pragma_table_list
       WHERE schema = 'main' AND type IN ('table', 'shadow')
         AND name NOT IN ('sqlite_schema', 'sqlite_temp_schema')
       ORDER BY name`,
    )
    .all() as Array<{ name: string; wr: number }>;
  for (const { name, wr } of list) {
    tables.set(name, readTable(db, name, wr === 1));
  }
  return {
    userVersion: Number(db.prepare("PRAGMA user_version").get()!.user_version),
    schema: readSchema(db),
    tables,
  };
}

/** Reads only. A writable handle lets SQLite checkpoint and remove its WAL files on close. */
function captureFile(pathname: string): Capture {
  using db = new DatabaseSync(pathname);
  return captureDatabase(db);
}

function diffSchema(before: SchemaRow[], after: SchemaRow[]): string[] {
  const key = (row: SchemaRow) => `${row.type} ${row.name}`;
  const left = new Map(before.map((row) => [key(row), row]));
  const right = new Map(after.map((row) => [key(row), row]));
  return [...new Set([...left.keys(), ...right.keys()])].toSorted().flatMap((name) => {
    const [a, b] = [left.get(name), right.get(name)];
    if (!a) {
      return [`${name}: added`];
    }
    if (!b) {
      return [`${name}: removed`];
    }
    return a.sql === b.sql && a.tbl_name === b.tbl_name ? [] : [`${name}: sql changed`];
  });
}

function diffTables(before: Capture, after: Capture): string[] {
  return [...new Set([...before.tables.keys(), ...after.tables.keys()])]
    .toSorted()
    .flatMap((name) => {
      const [a, b] = [before.tables.get(name), after.tables.get(name)];
      if (!a) {
        return [`${name}: added (${b!.rows.length} rows)`];
      }
      if (!b) {
        return [`${name}: removed`];
      }
      return a.sha256 === b.sha256 ? [] : [`${name}: content changed`];
    });
}

/** Human-readable rows for the receipt; large blobs are summarized by length and digest. */
function describeRows(capture: TableCapture) {
  return capture.rows.map((row) =>
    Object.fromEntries(
      row.map((cell, index) => {
        const [type, hex] = cell.split(":") as [string, string];
        const bytes = Buffer.from(hex, "hex");
        const value =
          type === "null"
            ? null
            : type === "text"
              ? bytes.toString("utf8")
              : type === "blob"
                ? bytes.length <= 64
                  ? `x'${hex}'`
                  : `blob(${bytes.length} bytes, sha256 ${sha256(bytes)})`
                : bytes.toString("utf8");
        return [capture.columns[index]!, value];
      }),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Build and seed.

type BuildFacts = {
  sqliteVersion: string;
  vecVersion: string;
  vecExtension: string;
};

async function buildShapeDatabase(shape: Shape, pathname: string, legacyEpoch = false) {
  const db = new DatabaseSync(pathname, { allowExtension: true });
  try {
    // The agent database owner creates files with incremental auto-vacuum and runs them in WAL.
    db.exec("PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = WAL;");
    const vec = await loadSqliteVecExtension({ db });
    if (!vec.ok) {
      throw new Error(`sqlite-vec is required to create the vec0 table: ${vec.error}`);
    }
    const facts: BuildFacts = {
      sqliteVersion: String(db.prepare("SELECT sqlite_version() AS v").get()!.v),
      vecVersion: String(db.prepare("SELECT vec_version() AS v").get()!.v),
      vecExtension: path.basename(path.dirname(vec.extensionPath ?? "")),
    };
    const executable = shape.objects.filter((object) => !object.shadowOf);
    const ordered = [
      ...executable.filter((object) => object.type === "table" && !object.virtualModule),
      ...executable.filter((object) => object.virtualModule),
      ...executable.filter((object) => object.type === "index"),
      ...executable.filter((object) => object.type === "trigger"),
      ...executable.filter((object) => object.type === "view"),
    ];
    db.exec("BEGIN IMMEDIATE");
    for (const object of ordered) {
      db.exec(object.sql);
    }
    db.exec(`PRAGMA user_version = ${shape.userVersion}`);
    const insertMeta = db.prepare(
      `INSERT INTO schema_meta (meta_key, role, schema_version, agent_id, app_version, created_at, updated_at)
       VALUES (?, 'agent', ?, ?, ?, ?, ?)`,
    );
    insertMeta.run("primary", shape.userVersion, AGENT_ID, APP_VERSION_38, T0, T0);
    for (const { key, schemaVersion } of readBookkeepingKeys().filter(
      ({ key }) => key !== "primary",
    )) {
      insertMeta.run(
        key,
        schemaVersion,
        AGENT_ID,
        key === "historical-transcript-directives-v1"
          ? JSON.stringify({ phase: "complete", version: 2 })
          : "rehearsal-synthetic-archive.jsonl.zst",
        T0 + 1,
        T0 + 2,
      );
    }
    db.exec("COMMIT");
    const built = readSchema(db);
    seedSyntheticRows(db, legacyEpoch);
    return { facts, built, seededSchema: readSchema(db) };
  } finally {
    db.close();
  }
}

const SESSIONS = {
  main: { key: "agent:main:main", id: "sess-main" },
  channel: { key: "agent:main:discord:channel:rehearsal", id: "sess-channel" },
  child: { key: "agent:main:subagent:rehearsal", id: "sess-child" },
  cold: { key: "agent:main:main", id: "sess-cold" },
} as const;
const AUTHORITY = [
  { session_key: SESSIONS.main.key, epoch: "11111111-2222-4333-8444-555555555555" },
  { session_key: SESSIONS.channel.key, epoch: "66666666-7777-4888-9999-aaaaaaaaaaaa" },
];
const LEGACY_EPOCH = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

function messageEvent(id: string, parentId: string | null, role: string, text: string) {
  return JSON.stringify({
    type: "message",
    id,
    parentId,
    timestamp: new Date(T0).toISOString(),
    message: { role, content: [{ type: "text", text }] },
  });
}

function seedSyntheticRows(db: DatabaseSync, legacyEpoch: boolean): void {
  db.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
  const run = (sql: string, ...values: Array<string | number | null | Uint8Array>) =>
    db.prepare(sql).run(...values);
  run("INSERT INTO session_key_contract (id, main_key, updated_at) VALUES (1, 'main', ?)", T0);
  run(
    `INSERT INTO conversations (conversation_id, channel, account_id, kind, peer_id, label,
       created_at, updated_at, delivery_target)
     VALUES ('conv-rehearsal', 'discord', 'acct-rehearsal', 'channel', 'peer-rehearsal',
       'rehearsal', ?, ?, 'channel:peer-rehearsal')`,
    T0,
    T0,
  );
  const entry = (sessionId: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ sessionId, updatedAt: T0, ...extra });
  run(
    `INSERT INTO session_nodes (session_key, current_session_id, entry_json, entry_valid,
       updated_at, created_at, created_via, created_actor_type)
     VALUES (?, ?, ?, 1, ?, ?, 'operator', 'human')`,
    SESSIONS.main.key,
    SESSIONS.main.id,
    entry(SESSIONS.main.id),
    T0,
    T0,
  );
  run(
    `INSERT INTO session_nodes (session_key, current_session_id, entry_json, entry_valid,
       updated_at, created_at, created_via, created_actor_type, label)
     VALUES (?, ?, ?, 1, ?, ?, 'channel', 'system', 'rehearsal channel')`,
    SESSIONS.channel.key,
    SESSIONS.channel.id,
    entry(SESSIONS.channel.id),
    T0 + 1,
    T0,
  );
  run(
    `INSERT INTO session_nodes (session_key, current_session_id, entry_json, entry_valid,
       updated_at, created_at, created_via, created_actor_type, status, parent_session_key,
       spawned_by)
     VALUES (?, ?, ?, 1, ?, ?, 'spawn', 'agent', 'done', ?, ?)`,
    SESSIONS.child.key,
    SESSIONS.child.id,
    // The edge probe carries the pre-table entry-local epoch some old builds wrote.
    entry(SESSIONS.child.id, legacyEpoch ? { recipientAuthorityEpoch: LEGACY_EPOCH } : {}),
    T0 + 2,
    T0,
    SESSIONS.main.key,
    SESSIONS.main.key,
  );
  for (const session of [SESSIONS.main, SESSIONS.channel, SESSIONS.child, SESSIONS.cold]) {
    run(
      `INSERT INTO session_windows (session_id, session_key, reason, session_scope, created_at,
         updated_at, primary_conversation_id)
       VALUES (?, ?, 'initial', 'conversation', ?, ?, ?)`,
      session.id,
      session.key,
      T0,
      T0,
      session === SESSIONS.channel ? "conv-rehearsal" : null,
    );
  }

  // Transcript rows in each payload form the schema-38 CHECK admits, prepared by the product's
  // own payload encoder: identity JSON, identity JSON with navigation, and zstd with navigation.
  const insertEvent = db.prepare(
    `INSERT INTO transcript_events (${TRANSCRIPT_PAYLOAD_COLUMNS.join(", ")})
     VALUES (${TRANSCRIPT_PAYLOAD_COLUMNS.map(() => "?").join(", ")})`,
  );
  const insertPayload = (seq: number, payload: Record<string, unknown>) =>
    insertEvent.run(
      ...TRANSCRIPT_PAYLOAD_COLUMNS.map((column) =>
        column === "session_id"
          ? SESSIONS.main.id
          : column === "seq"
            ? seq
            : column === "created_at"
              ? T0 + seq
              : ((payload[column] ?? null) as string | number | null | Uint8Array),
      ),
    );
  const prompt = messageEvent("evt-1", null, "user", "synthetic rehearsal prompt");
  const identity = prepareTranscriptPayload(db, prompt, undefined, "UTF-8");
  expect(identity.event_json).toBe(prompt);
  insertPayload(1, identity);
  const reply = messageEvent("evt-2", "evt-1", "assistant", "synthetic rehearsal reply");
  const navigation = readTranscriptPayloadNavigation(
    db,
    reply,
    JSON.stringify(projectSessionTranscriptReportFacts(JSON.parse(reply))),
  );
  expect(navigation).not.toBeNull();
  insertPayload(2, {
    ...prepareTranscriptPayload(db, reply, undefined, "UTF-8"),
    navigation_json: navigation,
  });
  const long = messageEvent(
    "evt-3",
    "evt-2",
    "assistant",
    "synthetic rehearsal paragraph, repeated to be worth compressing. ".repeat(80),
  );
  const compressed = prepareTranscriptPayload(db, long, undefined, "UTF-8");
  expect(compressed.event_json).toBeNull();
  expect(compressed.event_zstd).not.toBeNull();
  expect(compressed.navigation_json).not.toBeNull();
  insertPayload(3, compressed);
  for (const [index, eventId] of ["evt-1", "evt-2", "evt-3"].entries()) {
    run(
      `INSERT INTO transcript_event_identities (session_id, event_id, seq, event_type, parent_id,
         message_idempotency_key, created_at)
       VALUES (?, ?, ?, 'message', ?, ?, ?)`,
      SESSIONS.main.id,
      eventId,
      index + 1,
      index === 0 ? null : `evt-${index}`,
      index === 0 ? "idem-rehearsal-1" : null,
      T0 + index + 1,
    );
    run(
      `INSERT INTO session_transcript_active_events (session_id, active_position, event_seq,
         message_position, context_eligible)
       VALUES (?, ?, ?, ?, 1)`,
      SESSIONS.main.id,
      index,
      index + 1,
      index,
    );
  }

  for (const [index, row] of AUTHORITY.entries()) {
    run(
      "INSERT INTO session_recipient_authority (session_key, epoch, created_at, updated_at) VALUES (?, ?, ?, ?)",
      row.session_key,
      row.epoch,
      T0 + index,
      T0 + 10 + index,
    );
  }

  // One complete cold archive held as a single chunk.
  const coldEvent = messageEvent("evt-cold", null, "user", "synthetic archived prompt");
  const archive = zstdCompressSync(
    Buffer.from(
      [
        { kind: "header", version: 1, sessionId: SESSIONS.cold.id, generation: "gen-rehearsal" },
        { kind: "event", row: { seq: 0, event_json: coldEvent, created_at: T0 } },
        {
          kind: "identity",
          row: {
            event_id: "evt-cold",
            seq: 0,
            event_type: "message",
            parent_id: null,
            message_idempotency_key: null,
            created_at: T0,
          },
        },
      ]
        .map((record) => JSON.stringify(record))
        .join("\n"),
    ),
  );
  const chunk = {
    chunk_index: 0,
    archive_name: `${sha256(archive)}.jsonl.zst`,
    archive_sha256: sha256(archive),
    first_seq: 0,
    last_seq: 0,
    event_count: 1,
    raw_bytes: Buffer.byteLength(coldEvent),
    archive_bytes: archive.length,
  };
  const manifest = hashSessionColdChunks([chunk]);
  run(
    `INSERT INTO session_transcript_cold_archives (session_id, generation, archive_name,
       archive_sha256, event_count, raw_bytes, archive_bytes, last_seq, archived_at, storage,
       archive_blob)
     VALUES (?, 'gen-rehearsal', ?, ?, 1, ?, ?, 0, ?, 'sqlite', ?)`,
    SESSIONS.cold.id,
    `${manifest}.jsonl.zst`,
    manifest,
    chunk.raw_bytes,
    chunk.archive_bytes,
    T0,
    archive,
  );
  run(
    `INSERT INTO session_transcript_cold_archive_chunks (session_id, chunk_index, archive_name,
       archive_sha256, first_seq, last_seq, event_count, raw_bytes, archive_bytes, archive_blob)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    SESSIONS.cold.id,
    chunk.chunk_index,
    chunk.archive_name,
    chunk.archive_sha256,
    chunk.first_seq,
    chunk.last_seq,
    chunk.event_count,
    chunk.raw_bytes,
    chunk.archive_bytes,
    archive,
  );

  // Undeclared tables with triggers, FTS5 and vec0 storage, so the scope witness has bytes to hold.
  const embedding = Buffer.from(
    new Float32Array(768).map((_, index) => ((index % 7) + 1) / 8).buffer,
  );
  run(
    `INSERT INTO memory_index_sources (id, path, source, hash, mtime, size)
     VALUES (1, 'memory/rehearsal.md', 'memory', 'hash-rehearsal', 1.5, 42)`,
  );
  run(
    `INSERT INTO memory_index_chunks (chunk_rowid, id, path, source, start_line, end_line, hash,
       model, text, embedding, updated_at)
     VALUES (1, 'chunk-rehearsal', 'memory/rehearsal.md', 'memory', 1, 3, 'hash-chunk',
       'rehearsal-embedding', 'synthetic rehearsal memory text', ?, ?)`,
    embedding,
    T0,
  );
  run(
    "INSERT INTO memory_index_chunks_vec (id, embedding) VALUES ('chunk-rehearsal', ?)",
    embedding,
  );
  run(
    `INSERT INTO standing_intents (intent_key, id, description, trigger_keywords, status,
       expires_at, max_fires, created_at)
     VALUES (1, 'intent-rehearsal', 'synthetic intent', 'rehearsal synthetic', 'armed', ?, 1, ?)`,
    T0 + 86_400_000,
    T0,
  );
  run(
    `INSERT INTO session_transcript_fts (rowid, text, session_id, message_id, role, timestamp)
     VALUES (1, 'synthetic rehearsal prompt', ?, 'evt-1', 'user', ?)`,
    SESSIONS.main.id,
    String(T0),
  );
  run(
    "INSERT INTO session_transcript_fts_rows (id, session_id, message_id) VALUES (1, ?, 'evt-1')",
    SESSIONS.main.id,
  );
  run(
    `INSERT INTO cache_entries (scope, key, blob, updated_at)
     VALUES ('rehearsal', 'bytes', X'000100FF', ?)`,
    T0,
  );
  db.exec("COMMIT;");
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// Doctor runs, as systemd activation drives them: preflight under maintenance, then the declared
// version phase (scoped backup, migration, backup completion) for every discovered target.

async function runDoctorVersionPhase(env: NodeJS.ProcessEnv) {
  recorded.plans.length = 0;
  recorded.bridges.length = 0;
  recorded.backupCrossings.length = 0;
  return withMaintenance(async () => {
    const preflight = await prepareDoctorDatabasePreflight();
    const targets = preflight.agentDatabaseMigrationDiscovery?.discovery.schemaTargets ?? [];
    const pendingMigrations = preflight.pendingMigrations ?? [];
    const result = pendingMigrations.length
      ? await prepareDoctorDatabaseMigrations({
          env,
          databasePaths: targets.map((target) => target.path),
          agentDatabaseTargets: targets,
          pendingDatabasePaths: pendingMigrations.map((entry) => entry.path),
          pendingMigrations,
        })
      : undefined;
    return {
      preflight: {
        incompatible: preflight.incompatible,
        indeterminate: preflight.indeterminate,
        agentRefusals: preflight.agentRefusals ?? [],
        pendingMigrations,
        targets: targets.map(({ agentId, path: pathname, source }) => ({
          agentId,
          path: pathname,
          source,
        })),
      },
      result,
      plans: [...recorded.plans],
      bridges: [...recorded.bridges],
      backupCrossings: [...recorded.backupCrossings],
    };
  });
}

function stageInState(state: { statePath: (...parts: string[]) => string }, pristine: string) {
  expect([`${pristine}-wal`, `${pristine}-shm`].filter((file) => fs.existsSync(file))).toEqual([]);
  const agentPath = state.statePath("agents", AGENT_ID, "agent", "openclaw-agent.sqlite");
  fs.mkdirSync(path.dirname(agentPath), { recursive: true, mode: 0o700 });
  fs.copyFileSync(pristine, agentPath);
  fs.chmodSync(agentPath, 0o600);
  return agentPath;
}

function findScopedBackup(agentPath: string): string {
  const archives = fs
    .readdirSync(path.dirname(agentPath))
    .filter((name) => name.startsWith(path.basename(agentPath)) && name.endsWith(".scoped.bak"));
  expect(archives).toHaveLength(1);
  return path.join(path.dirname(agentPath), archives[0]!);
}

const WIDENED_CHECK = parseSqliteTableDefinition(
  extractSqliteTableSchema(OPENCLAW_AGENT_SCHEMA_SQL, "transcript_events"),
  "transcript_events",
).constraints.find((constraint) => constraint.includes("event_zstd IS NOT NULL"))!;
const PRIOR_CHECK = withoutAgentColdNavigation(WIDENED_CHECK);

function payloadCheck(sql: string | null | undefined): "widened" | "prior" | "unknown" {
  const definition = normalizeSqlWhitespace(sql ?? "");
  return definition.includes(WIDENED_CHECK)
    ? "widened"
    : definition.includes(PRIOR_CHECK)
      ? "prior"
      : "unknown";
}

function schemaMetaRows(capture: Capture) {
  return describeRows(capture.tables.get("schema_meta")!);
}

function redactRoot(value: unknown, root: string): unknown {
  return JSON.parse(JSON.stringify(value).replaceAll(root, "<state-root>"));
}

// ---------------------------------------------------------------------------------------------

const receipts: Record<string, Record<string, unknown>> = {};
const pristineFiles = new Map<string, string>();
const shapes = new Map<string, Shape>();
const sums = readShapeSums();

afterEach(async () => {
  await closeOpenClawAgentDatabasesAsync();
  closeOpenClawStateDatabaseForTest();
});

afterAll(() => {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  for (const [name, receipt] of Object.entries(receipts)) {
    fs.writeFileSync(
      path.join(RECEIPTS_DIR, `${name}.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
  }
  if (!KEEP_WORK) {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
  }
});

describe.each(SHAPE_NAMES)("fleet schema-38 shape %s", (shapeName) => {
  it(
    "builds byte for byte from its schema dump and seeds synthetic rows",
    async () => {
      const shape = parseShape(shapeName);
      shapes.set(shapeName, shape);
      const receipt: Record<string, unknown> = {
        shape: shapeName,
        input: {
          file: path.basename(shape.file),
          sha256: shape.sha256,
          sha256Expected: sums.get(path.basename(shape.file)),
        },
      };
      receipts[shapeName] = receipt;
      expect(shape.sha256).toBe(sums.get(path.basename(shape.file)));
      expect(shape.userVersion).toBe(38);
      expect(shape.schemaMeta).toEqual(
        readBookkeepingKeys().toSorted((a, b) =>
          a.key === "primary" ? -1 : b.key === "primary" ? 1 : a.key.localeCompare(b.key),
        ),
      );

      const pristine = path.join(WORK_DIR, `${shapeName}-pristine-38.sqlite`);
      fs.rmSync(pristine, { force: true });
      const { facts, built, seededSchema } = await buildShapeDatabase(shape, pristine);
      pristineFiles.set(shapeName, pristine);

      const expected = shape.objects.filter((object) => !object.shadowOf);
      const actual = built.filter((row) => !row.name.startsWith("sqlite_"));
      const actualByKey = new Map(actual.map((row) => [`${row.type} ${row.name}`, row]));
      const perObject = expected.map((object) => {
        const row = actualByKey.get(`${object.type} ${object.name}`);
        return {
          object: `${object.type} ${object.name}`,
          equal: row?.sql === object.sql,
        };
      });
      const shadows = shape.objects
        .filter((object) => object.shadowOf)
        .map((object) => ({
          object: `table ${object.name}`,
          of: object.shadowOf,
          equal: actualByKey.get(`table ${object.name}`)?.sql === object.sql,
        }));
      const unexpected = actual
        .filter(
          (row) =>
            !shape.objects.some(
              (object) => `${object.type} ${object.name}` === `${row.type} ${row.name}`,
            ),
        )
        .map((row) => `${row.type} ${row.name}`);
      receipt.build = {
        ...facts,
        pragmas: { auto_vacuum: "incremental", journal_mode: "wal" },
        objects: {
          shape: shape.objects.length,
          executed: expected.length,
          shadow: shadows.length,
          virtual: shape.objects
            .filter((object) => object.virtualModule)
            .map((object) => ({
              name: object.name,
              module: object.virtualModule,
            })),
        },
        byteEqualObjects: perObject.filter((entry) => entry.equal).length,
        unequalObjects: perObject.filter((entry) => !entry.equal).map((entry) => entry.object),
        shadowTablesEqual: shadows.filter((entry) => entry.equal).length,
        shadowTablesUnequal: shadows.filter((entry) => !entry.equal),
        unexpectedObjects: unexpected,
        seedingChangedSchema: diffSchema(built, seededSchema),
      };
      expect(perObject.filter((entry) => !entry.equal)).toEqual([]);
      expect(unexpected).toEqual([]);
      expect(actual.length).toBe(shape.objects.length);

      const seeded = captureFile(pristine);
      receipt.seeded = {
        userVersion: seeded.userVersion,
        schemaMeta: schemaMetaRows(seeded),
        tables: Object.fromEntries(
          [...seeded.tables].map(([name, table]) => [
            name,
            { rows: table.rows.length, sha256: table.sha256 },
          ]),
        ),
        rows: Object.fromEntries(
          [
            "session_nodes",
            "session_windows",
            "conversations",
            "transcript_events",
            "transcript_event_identities",
            "session_transcript_active_events",
            "session_recipient_authority",
            "session_transcript_cold_archives",
            "session_transcript_cold_archive_chunks",
            "session_key_contract",
            "memory_index_chunks",
            "memory_index_sources",
            "standing_intents",
            "session_transcript_fts_rows",
            "cache_entries",
          ].map((name) => [name, describeRows(seeded.tables.get(name)!)]),
        ),
      };
      expect(payloadCheck(shape.objects.find((o) => o.name === "transcript_events")!.sql)).toBe(
        "prior",
      );
    },
    TIMEOUT_MS,
  );

  it(
    "migrates 38 -> 40 through Doctor's version phase, keeps every row, and reopens at 40",
    async () => {
      const pristine = pristineFiles.get(shapeName);
      expect(pristine).toBeDefined();
      const receipt = receipts[shapeName]!;
      const before = captureFile(pristine!);
      await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
        openOpenClawStateDatabase({ env: state.env });
        const agentPath = stageInState(state, pristine!);
        const realPath = fs.realpathSync(agentPath);
        const tables = resolveSchemaMigrationBackupTables({
          kind: "agent",
          foundVersion: 38,
          supportedVersion: OPENCLAW_AGENT_SCHEMA_VERSION,
        });
        expect(OPENCLAW_AGENT_SCHEMA_VERSION).toBe(40);
        expect(tables).toEqual(DECLARED_SCOPE);

        // The witness reads every undeclared table, the vec0 table included, so it loads sqlite-vec
        // on its own handle. Doctor's handles never load it, as on a seat.
        const witness = new DatabaseSync(agentPath, { allowExtension: true });
        let doctor: Awaited<ReturnType<typeof runDoctorVersionPhase>>;
        try {
          const vec = await loadSqliteVecExtension({ db: witness });
          expect(vec.ok).toBe(true);
          doctor = await assertSqliteMigrationScopePreserved(witness, tables, () =>
            runDoctorVersionPhase(state.env),
          );
        } finally {
          witness.close();
        }
        await closeOpenClawAgentDatabasesAsync();

        expect(doctor.preflight).toMatchObject({
          incompatible: [],
          indeterminate: [],
          agentRefusals: [],
        });
        expect(doctor.preflight.pendingMigrations).toEqual([
          expect.objectContaining({
            kind: "agent",
            path: expect.stringMatching(/openclaw-agent\.sqlite$/u),
            foundVersion: 38,
            supportedVersion: 40,
          }),
        ]);
        expect(fs.realpathSync(doctor.preflight.pendingMigrations[0]!.path)).toBe(realPath);
        expect(doctor.result?.warnings).toEqual([]);
        // The ordinary 38 history: no fork-39 bridge, crossing upstream's 39 and the authority 40.
        expect(doctor.plans).toEqual([
          { previousVersion: 38, targetVersion: 40, shapeVersion: 38, crosses: [39, 40] },
        ]);
        expect(doctor.bridges).toEqual([
          { previousVersion: 38, targetVersion: 40, bridged: false },
        ]);
        expect(doctor.backupCrossings).toEqual([{ foundVersion: 38, crossingFrom: 38 }]);

        const backupPath = findScopedBackup(agentPath);
        const backupTables = inspectScopedMigrationSnapshot(backupPath).tables.map(
          (table) => table.name,
        );
        expect(backupTables).toEqual(DECLARED_SCOPE);

        const migrated = captureFile(agentPath);
        const transcriptSql = migrated.schema.find(
          (row) => row.type === "table" && row.name === "transcript_events",
        )?.sql;
        using plain = new DatabaseSync(agentPath, { readOnly: true });
        const integrity = plain.prepare("PRAGMA integrity_check").all();
        const foreignKeys = plain.prepare("PRAGMA foreign_key_check").all();
        const primary = plain
          .prepare("SELECT schema_version, app_version FROM schema_meta WHERE meta_key = 'primary'")
          .get();
        plain.close();
        const schemaChanges = diffSchema(before.schema, migrated.schema);
        const tableChanges = diffTables(before, migrated);
        const metaBefore = schemaMetaRows(before);
        const metaAfter = schemaMetaRows(migrated);

        receipt.migration = {
          doctor: redactRoot(
            {
              preflight: doctor.preflight,
              changes: doctor.result?.changes,
              warnings: doctor.result?.warnings,
            },
            state.root,
          ),
          plan: doctor.plans,
          fork39Bridge: doctor.bridges,
          backupCrossing: doctor.backupCrossings,
          declaredBackupScope: tables,
          backupArchiveTables: backupTables,
          undeclaredTablesPreserved: true,
          userVersion: migrated.userVersion,
          schemaMetaPrimary: primary,
          integrityCheck: integrity,
          foreignKeyCheck: foreignKeys,
          transcriptPayloadCheck: { before: "prior", after: payloadCheck(transcriptSql) },
          transcriptEventsSqlAfter: transcriptSql,
          schemaObjectsChanged: schemaChanges,
          tablesChanged: tableChanges,
          schemaMetaBefore: metaBefore,
          schemaMetaAfter: metaAfter,
        };
        expect(migrated.userVersion).toBe(40);
        expect(primary).toEqual({ schema_version: 40, app_version: VERSION });
        expect(integrity).toEqual([{ integrity_check: "ok" }]);
        expect(foreignKeys).toEqual([]);
        expect(payloadCheck(transcriptSql)).toBe("widened");
        // Only the payload constraint's catalog entry changes; every other object keeps its bytes.
        expect(schemaChanges).toEqual(["table transcript_events: sql changed"]);
        // Every seeded row survives byte for byte; schema_meta changes only its primary version row.
        expect(tableChanges).toEqual(["schema_meta: content changed"]);
        expect(metaAfter.filter((row) => row.meta_key !== "primary")).toEqual(
          metaBefore.filter((row) => row.meta_key !== "primary"),
        );
        expect(metaAfter.find((row) => row.meta_key === "primary")).toMatchObject({
          role: "agent",
          schema_version: "40",
          agent_id: AGENT_ID,
          app_version: VERSION,
          created_at: String(T0),
        });
        expect(describeRows(migrated.tables.get("session_recipient_authority")!)).toEqual(
          describeRows(before.tables.get("session_recipient_authority")!),
        );

        // Doctor again: nothing is pending, so the version phase does not run.
        const rerun = await runDoctorVersionPhase(state.env);
        expect(rerun.preflight.pendingMigrations).toEqual([]);
        expect(rerun.result).toBeUndefined();
        const afterRerun = captureFile(agentPath);
        expect(diffSchema(migrated.schema, afterRerun.schema)).toEqual([]);
        expect(diffTables(migrated, afterRerun)).toEqual([]);

        // The full schema owner (Doctor's later admission pass), twice.
        const ownerRuns: Array<{ schema: string[]; tables: string[] }> = [];
        let previous = afterRerun;
        for (let run = 0; run < 2; run++) {
          await withAgentDatabaseMaintenanceLease({ env: state.env }, async () => {
            using database = new DatabaseSync(agentPath);
            ensureOpenClawAgentDatabaseSchema(database, {
              agentId: AGENT_ID,
              path: agentPath,
              env: state.env,
            });
          });
          await closeOpenClawAgentDatabasesAsync();
          const current = captureFile(agentPath);
          ownerRuns.push({
            schema: diffSchema(previous.schema, current.schema),
            tables: diffTables(previous, current),
          });
          previous = current;
        }

        // The Gateway's ordinary open, twice: admission at 40 and the seeded rows through it.
        const opens: Array<{ userVersion: unknown; schema: string[]; tables: string[] }> = [];
        for (let open = 0; open < 2; open++) {
          const handle = openOpenClawAgentDatabase({ agentId: AGENT_ID, env: state.env });
          const db = handle.db as DatabaseSync;
          const userVersion = db.prepare("PRAGMA user_version").get()?.user_version;
          expect(
            db
              .prepare(
                "SELECT session_key, epoch FROM session_recipient_authority ORDER BY session_key",
              )
              .all(),
          ).toEqual(
            AUTHORITY.map(({ session_key, epoch }) => ({ session_key, epoch })).toSorted((a, b) =>
              a.session_key.localeCompare(b.session_key),
            ),
          );
          expect(
            db
              .prepare("SELECT seq FROM transcript_events WHERE session_id = ? ORDER BY seq")
              .all(SESSIONS.main.id),
          ).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
          await closeOpenClawAgentDatabasesAsync();
          const current = captureFile(agentPath);
          opens.push({
            userVersion,
            schema: diffSchema(previous.schema, current.schema),
            tables: diffTables(previous, current),
          });
          previous = current;
        }
        const final = previous;
        receipt.afterMigration = {
          doctorRerun: {
            pendingMigrations: rerun.preflight.pendingMigrations,
            versionPhaseRan: false,
          },
          schemaOwnerRuns: ownerRuns,
          ordinaryOpens: opens,
          finalVersusPristine: {
            schema: diffSchema(before.schema, final.schema),
            tables: diffTables(before, final),
          },
          finalChangedRows: Object.fromEntries(
            diffTables(migrated, final)
              .map((entry) => entry.split(":")[0]!)
              .filter((name) => final.tables.has(name) && migrated.tables.has(name))
              .map((name) => [
                name,
                {
                  afterVersionPhase: describeRows(migrated.tables.get(name)!),
                  final: describeRows(final.tables.get(name)!),
                },
              ]),
          ),
        };
        for (const open of opens) {
          expect(open.userVersion).toBe(40);
        }

        if (KEEP_WORK) {
          for (const suffix of ["", "-wal", "-shm"]) {
            if (fs.existsSync(`${agentPath}${suffix}`)) {
              fs.copyFileSync(
                `${agentPath}${suffix}`,
                path.join(WORK_DIR, `${shapeName}-migrated-40.sqlite${suffix}`),
              );
            }
          }
        }
      });
    },
    TIMEOUT_MS,
  );

  it(
    "restores the exact predecessor from Doctor's scoped pre-migration backup",
    async () => {
      const pristine = pristineFiles.get(shapeName);
      expect(pristine).toBeDefined();
      const receipt = receipts[shapeName]!;
      await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
        openOpenClawStateDatabase({ env: state.env });
        const agentPath = stageInState(state, pristine!);
        const original = captureFile(agentPath);

        const doctor = await runDoctorVersionPhase(state.env);
        await closeOpenClawAgentDatabasesAsync();
        expect(doctor.result?.warnings).toEqual([]);
        const migrated = captureFile(agentPath);
        expect(migrated.userVersion).toBe(40);
        const backupPath = findScopedBackup(agentPath);
        const backupTables = inspectScopedMigrationSnapshot(backupPath).tables.map(
          (table) => table.name,
        );
        expect(backupTables).toEqual(DECLARED_SCOPE);

        await restoreDoctorMigrationBackup({ sourcePath: agentPath, backupPath, env: state.env });
        const restored = captureFile(agentPath);
        using plain = new DatabaseSync(agentPath, { readOnly: true });
        const integrity = plain.prepare("PRAGMA integrity_check").all();
        const foreignKeys = plain.prepare("PRAGMA foreign_key_check").all();
        plain.close();
        const schemaDiff = diffSchema(original.schema, restored.schema);
        const tableDiff = diffTables(original, restored);

        // The restored 38 is migratable again: Doctor's repeatable step after a rollback.
        const remigration = await runDoctorVersionPhase(state.env);
        await closeOpenClawAgentDatabasesAsync();
        const remigrated = captureFile(agentPath);

        receipt.backupRestore = {
          doctor: redactRoot(
            { changes: doctor.result?.changes, warnings: doctor.result?.warnings },
            state.root,
          ),
          backupArchive: path.basename(backupPath),
          backupArchiveTables: backupTables,
          migratedUserVersion: migrated.userVersion,
          restoredUserVersion: restored.userVersion,
          restoredVersusPredecessor: { schema: schemaDiff, tables: tableDiff },
          schemaObjectsCompared: original.schema.length,
          tablesCompared: original.tables.size,
          integrityCheck: integrity,
          foreignKeyCheck: foreignKeys,
          remigration: redactRoot(
            {
              pendingMigrations: remigration.preflight.pendingMigrations,
              changes: remigration.result?.changes,
              warnings: remigration.result?.warnings,
              userVersion: remigrated.userVersion,
              versusFirstMigration: {
                schema: diffSchema(migrated.schema, remigrated.schema),
                tables: diffTables(migrated, remigrated),
              },
            },
            state.root,
          ),
        };
        expect(restored.userVersion).toBe(38);
        expect(schemaDiff).toEqual([]);
        expect(tableDiff).toEqual([]);
        expect(integrity).toEqual([{ integrity_check: "ok" }]);
        expect(foreignKeys).toEqual([]);
        expect(remigrated.userVersion).toBe(40);
      });
    },
    TIMEOUT_MS,
  );
});

// An entry-local recipient epoch (the unshipped pre-table form) is moved by the schema-40 step out
// of session_nodes, a table outside the declared backup scope. No current writer produces one; this
// probe records what a scoped restore does if a live store still held one.
it(
  "edge probe: a legacy entry-local recipient epoch under the scoped backup",
  async () => {
    const shape = shapes.get("cael") ?? parseShape("cael");
    const pristine = path.join(WORK_DIR, "cael-legacy-epoch-38.sqlite");
    fs.rmSync(pristine, { force: true });
    await buildShapeDatabase(shape, pristine, true);
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      openOpenClawStateDatabase({ env: state.env });
      const agentPath = stageInState(state, pristine);
      const original = captureFile(agentPath);
      const doctor = await runDoctorVersionPhase(state.env);
      await closeOpenClawAgentDatabasesAsync();
      const migrated = captureFile(agentPath);
      const backupPath = findScopedBackup(agentPath);
      await restoreDoctorMigrationBackup({ sourcePath: agentPath, backupPath, env: state.env });
      const restored = captureFile(agentPath);
      const childEntry = (capture: Capture) =>
        describeRows(capture.tables.get("session_nodes")!).find(
          (row) => row.session_key === SESSIONS.child.key,
        )?.entry_json;
      receipts["edge-legacy-epoch"] = {
        shape: "cael",
        warnings: doctor.result?.warnings,
        migratedUserVersion: migrated.userVersion,
        migratedVersusPredecessor: diffTables(original, migrated),
        authorityAfterMigration: describeRows(migrated.tables.get("session_recipient_authority")!),
        restoredUserVersion: restored.userVersion,
        restoredVersusPredecessor: {
          schema: diffSchema(original.schema, restored.schema),
          tables: diffTables(original, restored),
        },
        childEntryJson: {
          predecessor: childEntry(original),
          migrated: childEntry(migrated),
          restored: childEntry(restored),
        },
        authorityAfterRestore: describeRows(restored.tables.get("session_recipient_authority")!),
      };
      expect(migrated.userVersion).toBe(40);
      expect(restored.userVersion).toBe(38);
    });
  },
  TIMEOUT_MS,
);
