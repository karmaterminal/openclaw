import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { parseSqliteTableDefinition } from "../infra/sqlite-schema-contract-assembly.js";
import {
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "./openclaw-state-db.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

afterEach(() => {
  closeOpenClawStateDatabaseForTest();
});

// continuation_records (a first-use table) and its indexes exactly as the deployed
// continuation composite 7b0631086b created them on fleet state databases. Its
// terminal_notice_pending CHECK still lists the retired 'rollback-election-conflict';
// the state schema compatibility map admits that exact legacy column definition. Its terminal_notice_pending
// CHECK still lists 'rollback-election-conflict'; nothing writes that value any more,
// but an existing database must keep opening without a repair or a migration.
const FLEET_CONTINUATION_RECORDS_DDL = `CREATE TABLE IF NOT EXISTS continuation_records (
  record_id TEXT NOT NULL PRIMARY KEY CHECK (length(record_id) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('work', 'delegate', 'post_compaction')),
  owner_session_key TEXT NOT NULL CHECK (length(owner_session_key) > 0),
  chain_id TEXT CHECK (chain_id IS NULL OR kind = 'work'),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  phase TEXT,
  failure_reason TEXT,
  cancel_requested_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  due_at INTEGER,
  state_json TEXT NOT NULL,
  spawn_attempts_json TEXT NOT NULL DEFAULT '[]',
  handoff_json TEXT,
  rollback_of TEXT,
  attachment_id TEXT,
  terminal_notice_pending TEXT CHECK (
    terminal_notice_pending IS NULL OR terminal_notice_pending IN (
      'retry-exhausted', 'delegate-spawn-interrupted', 'rollback-election-conflict'
    )
  ),
  CHECK ((status IN ('succeeded', 'failed', 'cancelled')) = (ended_at IS NOT NULL)),
  CHECK (attachment_id IS NULL OR status IN ('queued', 'running'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_continuation_records_owner
  ON continuation_records(owner_session_key, kind, status);
CREATE INDEX IF NOT EXISTS idx_continuation_records_due
  ON continuation_records(status, kind, due_at);`;

function withDatabase(pathname: string, run: (database: DatabaseSync) => void) {
  const database = new (requireNodeSqlite().DatabaseSync)(pathname);
  try {
    run(database);
  } finally {
    database.close();
  }
}

function canonicalContinuationRecordsDdl(): string {
  const schema = fs.readFileSync(new URL("./openclaw-state-schema.sql", import.meta.url), "utf8");
  const table = /CREATE TABLE IF NOT EXISTS continuation_records \([\s\S]*?\) STRICT;/u.exec(
    schema,
  );
  const indexes = schema.match(
    /CREATE INDEX IF NOT EXISTS idx_continuation_records_\w+\s+ON continuation_records\([^)]*\);/gu,
  );
  if (!table || !indexes || indexes.length === 0) {
    throw new Error("canonical continuation_records DDL not found");
  }
  return [table[0], ...indexes].join("\n\n");
}

function openWithContinuationRecords(prefix: string, ddl: string): () => unknown {
  const env = { OPENCLAW_STATE_DIR: tempDirs.make(prefix) };
  const statePath = openOpenClawStateDatabase({ env }).path;
  closeOpenClawStateDatabaseForTest();
  withDatabase(statePath, (database) => {
    database.exec(ddl);
  });
  return () => openOpenClawStateDatabase({ env });
}

describe("continuation_records written by an earlier continuation build", () => {
  it("opens a state database whose continuation_records came from the fleet composite", () => {
    const env = { OPENCLAW_STATE_DIR: tempDirs.make("openclaw-continuation-records-fleet-") };
    const statePath = openOpenClawStateDatabase({ env }).path;
    closeOpenClawStateDatabaseForTest();
    withDatabase(statePath, (database) => {
      database.exec(FLEET_CONTINUATION_RECORDS_DDL);
    });

    expect(() => openOpenClawStateDatabase({ env })).not.toThrow();
  });

  it("keeps the canonical terminal_notice_pending CHECK narrow", () => {
    const ddl = canonicalContinuationRecordsDdl();
    const column = parseSqliteTableDefinition(
      ddl.split("\n\n")[0] ?? "",
      "continuation_records",
    ).columns.get("terminal_notice_pending");
    expect(column).toBe(
      "terminal_notice_pending TEXT CHECK ( terminal_notice_pending IS NULL OR terminal_notice_pending IN ( 'retry-exhausted', 'delegate-spawn-interrupted' ) )",
    );
    expect(ddl).not.toContain("rollback-election-conflict");
  });

  it("opens a state database whose continuation_records uses the canonical DDL", () => {
    const open = openWithContinuationRecords(
      "openclaw-continuation-records-canonical-",
      canonicalContinuationRecordsDdl(),
    );
    expect(open).not.toThrow();
  });

  it("still rejects any other drift in the terminal_notice_pending CHECK", () => {
    const drifted = FLEET_CONTINUATION_RECORDS_DDL.replace(
      "'rollback-election-conflict'",
      "'some-other-notice'",
    );
    expect(drifted).not.toBe(FLEET_CONTINUATION_RECORDS_DDL);
    const open = openWithContinuationRecords("openclaw-continuation-records-drifted-", drifted);
    expect(open).toThrow(/column definitions differ for continuation_records/u);
  });
});
