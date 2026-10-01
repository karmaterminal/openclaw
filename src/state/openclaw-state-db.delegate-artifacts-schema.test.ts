// State DB open and migration keep the delegate artifact schema lazy until its owner ensures it.
import type { DatabaseSync } from "node:sqlite";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDirs, makeTempDir } from "../../test/helpers/temp-dir.js";
import { ensureDelegateArtifactsSchema } from "../agents/delegate-artifact-store.kernel.js";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import { readSqliteNumberPragma } from "../infra/sqlite-pragma.test-support.js";
import { OPENCLAW_STATE_SCHEMA_VERSION } from "./openclaw-state-db-contract.js";
import {
  closeOpenClawStateDatabaseAsync,
  closeOpenClawStateDatabaseForTest,
  openOpenClawStateDatabase,
} from "./openclaw-state-db.js";

const stateDbTempDirs: string[] = [];

function createTempStateDir(): string {
  return makeTempDir(stateDbTempDirs, "openclaw-state-db-");
}

// Synthetic pre-v8 databases must not retain the current placement-only index.
function markStateDatabaseVersion(database: DatabaseSync, version: number): void {
  database.exec(`
    ${version < 8 ? "DROP INDEX IF EXISTS idx_worker_session_placements_environment;" : ""} PRAGMA user_version = ${version};
    UPDATE schema_meta SET schema_version = ${version} WHERE meta_key = 'primary';
  `);
}

// The ensurer extracts these from the canonical state schema; names are sorted.
function readDelegateArtifactSchemaNames(): { indexes: string[]; tables: string[] } {
  return {
    indexes: [
      "idx_delegate_artifact_audit_recipient",
      "idx_delegate_artifact_bindings_recipient",
      "idx_delegate_artifact_claims_flow",
      "idx_delegate_artifact_policies_producer",
      "idx_delegate_artifact_policies_retention",
    ],
    tables: [
      "delegate_artifact_audit",
      "delegate_artifact_bindings",
      "delegate_artifact_claims",
      "delegate_artifact_policies",
      "delegate_artifact_recipient_outcomes",
    ],
  };
}

function findSchemaObjectNames(
  database: DatabaseSync,
  type: "index" | "table",
  names: string[],
): string[] {
  const placeholders = names.map(() => "?").join(", ");
  return (
    database
      .prepare(
        `SELECT name
           FROM sqlite_schema
          WHERE type = ?
            AND name IN (${placeholders})
          ORDER BY name`,
      )
      .all(type, ...names) as Array<{ name: string }>
  ).map((row) => row.name);
}

afterAll(async () => {
  await closeOpenClawStateDatabaseAsync();
  cleanupTempDirs(stateDbTempDirs);
});

afterEach(async () => {
  await closeOpenClawStateDatabaseAsync();
  closeOpenClawStateDatabaseForTest();
  vi.restoreAllMocks();
});

describe("openclaw state database", () => {
  for (const { label, version } of [
    { label: "a current v17 database", version: 17 },
    { label: "a v16 database migrating to v17", version: 16 },
  ] as const) {
    it(`keeps delegate artifact schema lazy after opening ${label}`, () => {
      const stateDir = createTempStateDir();
      const options = { env: { OPENCLAW_STATE_DIR: stateDir } };
      const databasePath = openOpenClawStateDatabase(options).path;
      closeOpenClawStateDatabaseForTest();

      const schemaNames = readDelegateArtifactSchemaNames();
      const { DatabaseSync } = requireNodeSqlite();
      const preFeature = new DatabaseSync(databasePath);
      preFeature.exec("PRAGMA foreign_keys = OFF;");
      for (const tableName of schemaNames.tables) {
        preFeature.exec(`DROP TABLE IF EXISTS "${tableName}";`);
      }
      if (version === 16) {
        markStateDatabaseVersion(preFeature, 16);
      }
      preFeature.close();

      const reopened = openOpenClawStateDatabase(options);
      expect(readSqliteNumberPragma(reopened.db, "user_version")).toBe(
        OPENCLAW_STATE_SCHEMA_VERSION,
      );
      expect(findSchemaObjectNames(reopened.db, "table", schemaNames.tables)).toEqual([]);
      expect(findSchemaObjectNames(reopened.db, "index", schemaNames.indexes)).toEqual([]);

      ensureDelegateArtifactsSchema(options);
      closeOpenClawStateDatabaseForTest();
      const postEnsure = openOpenClawStateDatabase(options);

      expect(findSchemaObjectNames(postEnsure.db, "table", schemaNames.tables)).toEqual(
        schemaNames.tables,
      );
      expect(findSchemaObjectNames(postEnsure.db, "index", schemaNames.indexes)).toEqual(
        schemaNames.indexes,
      );
    });
  }
});
