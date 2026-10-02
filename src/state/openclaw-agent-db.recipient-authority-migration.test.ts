// Agent DB migration of upstream v18 session recipient authority into its own table.
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { withAgentDatabaseMaintenanceLease } from "./openclaw-agent-db-maintenance-lease.js";
import {
  closeOpenClawAgentDatabasesForTest,
  ensureOpenClawAgentDatabaseSchema,
  openOpenClawAgentDatabase as openOpenClawAgentDatabaseRuntime,
  resolveOpenClawAgentSqlitePath,
} from "./openclaw-agent-db.js";
import { removeCanonicalValidationFromHistoricalAgentFixture } from "./openclaw-agent-db.test-support.js";
import { materializeV21WorkerAgentDatabase } from "./openclaw-agent-schema-v21.test-support.js";
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

afterAll(() => {
  cleanupTempDirs(agentDbTempDirs);
});

afterEach(() => {
  closeOpenClawAgentDatabasesForTest();
  closeOpenClawStateDatabaseForTest();
});

describe("openclaw agent database", () => {
  it("upgrades upstream v18 recipient authority without parsing Doctor-owned malformed rows", async () => {
    const stateDir = createTempStateDir();
    const env = { OPENCLAW_STATE_DIR: stateDir };
    // The frozen upstream schema carries no session_recipient_authority table.
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
});
