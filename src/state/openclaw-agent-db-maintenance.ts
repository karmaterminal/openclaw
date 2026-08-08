import type { DatabaseSync } from "node:sqlite";
import { clearNodeSqliteKyselyCacheForDatabase } from "../infra/kysely-sync.js";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { isCanonicalSqliteIndexRepairable } from "../infra/sqlite-index-schema.js";
import { assertSqliteIntegrity, diagnoseSqliteIntegrity } from "../infra/sqlite-integrity.js";
import {
  createNewerSqliteSchemaVersionError,
  readSqliteUserVersion,
} from "../infra/sqlite-user-version.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { OPENCLAW_AGENT_SCHEMA_VERSION } from "./openclaw-agent-db-contract.js";
import {
  assertExistingAgentSchemaOwner,
  assertOpenClawAgentSchemaContains,
  assertSupportedAgentSchemaVersion,
  readExistingAgentSchemaMeta,
} from "./openclaw-agent-db-schema-helpers.js";
import { ensureOpenClawAgentDatabaseSchema } from "./openclaw-agent-db-schema.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.js";
import { OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db.js";

/** Require exact agent ownership without requiring the latest schema. */
export function assertOpenClawAgentDatabaseOwner(
  database: DatabaseSync,
  options: { agentId: string; pathname: string },
): NonNullable<ReturnType<typeof readExistingAgentSchemaMeta>> {
  const agentId = normalizeAgentId(options.agentId);
  const metadata = readExistingAgentSchemaMeta(database);
  if (!metadata) {
    throw new Error(
      `OpenClaw agent database ${options.pathname} has no schema ownership metadata.`,
    );
  }
  assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
  if (metadata.agentId !== agentId) {
    throw new Error(
      `OpenClaw agent database ${options.pathname} belongs to agent ${metadata.agentId}; requested agent ${agentId}.`,
    );
  }
  return metadata;
}

/** Require the exact agent owner and schema before offline file maintenance. */
export function assertOpenClawAgentDatabaseForMaintenance(
  database: DatabaseSync,
  options: { agentId: string; pathname: string },
): void {
  const metadata = assertOpenClawAgentDatabaseOwner(database, options);

  const userVersion = readSqliteUserVersion(database);
  if (userVersion > OPENCLAW_AGENT_SCHEMA_VERSION) {
    throw createNewerSqliteSchemaVersionError(
      "OpenClaw agent database",
      options.pathname,
      userVersion,
      OPENCLAW_AGENT_SCHEMA_VERSION,
    );
  }
  if (userVersion !== OPENCLAW_AGENT_SCHEMA_VERSION) {
    throw new Error(
      `OpenClaw agent database ${options.pathname} uses schema version ${userVersion}; run openclaw doctor --fix before compacting it.`,
    );
  }
  if (metadata.schemaVersion !== OPENCLAW_AGENT_SCHEMA_VERSION) {
    throw new Error(
      `OpenClaw agent database ${options.pathname} metadata schema version ${metadata.schemaVersion ?? "invalid"} does not match ${OPENCLAW_AGENT_SCHEMA_VERSION}; run openclaw doctor --fix before compacting it.`,
    );
  }
  assertOpenClawAgentSchemaContains(database, options.pathname, OPENCLAW_AGENT_SCHEMA_SQL);
}

/** Upgrade or repair a supported owned schema before strict offline maintenance. */
export function migrateOpenClawAgentDatabaseForMaintenance(options: {
  agentId: string;
  pathname: string;
}): void {
  const agentId = normalizeAgentId(options.agentId);
  const database = openNodeSqliteDatabase(options.pathname);
  try {
    database.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
    const metadata = readExistingAgentSchemaMeta(database);
    if (!metadata) {
      return;
    }
    assertExistingAgentSchemaOwner(metadata, agentId, options.pathname);
    assertSupportedAgentSchemaVersion(database, options.pathname);
    const userVersion = readSqliteUserVersion(database);
    const metadataVersion = metadata.schemaVersion;
    const hasCurrentVersion =
      userVersion === OPENCLAW_AGENT_SCHEMA_VERSION &&
      metadataVersion === OPENCLAW_AGENT_SCHEMA_VERSION;
    const hasSupportedOlderVersion =
      userVersion >= 1 &&
      userVersion < OPENCLAW_AGENT_SCHEMA_VERSION &&
      metadataVersion !== null &&
      metadataVersion === userVersion &&
      metadataVersion >= 1 &&
      metadataVersion < OPENCLAW_AGENT_SCHEMA_VERSION;
    if (!hasCurrentVersion && !hasSupportedOlderVersion) {
      return;
    }
    // A canonical, physically healthy current-version file already satisfies the
    // maintenance contract, so prove it read-only instead of routing it through
    // writable schema initialization: that path rewrites pending entry_valid
    // rows and would mutate a healthy artifact. Anything else falls through to
    // the repair below.
    if (hasCurrentVersion) {
      let contractFailure: Error | undefined;
      try {
        assertOpenClawAgentDatabaseForMaintenance(database, {
          agentId,
          pathname: options.pathname,
        });
      } catch (error) {
        // Carried, not swallowed: this is the only reason a file whose integrity
        // is clean may still be rewritten below. It is never chained onto the
        // integrity error, because a cause there would downgrade a proven
        // corruption finding to non-terminal.
        contractFailure = error instanceof Error ? error : new Error(String(error));
      }
      // Declared shape alone cannot prove a canonical file: an index b-tree can
      // diverge from canonical SQL while every declaration still matches, and
      // only a full integrity_check sees that.
      const diagnosis = diagnoseSqliteIntegrity(database, options.pathname);
      if (diagnosis.status !== "healthy") {
        if (!isCanonicalSqliteIndexRepairable(diagnosis, OPENCLAW_AGENT_SCHEMA_SQL)) {
          // Fail closed on the original integrity finding. Nothing below can undo
          // damage outside the canonical-index class, so the repair transaction
          // must never write into this file.
          throw diagnosis.error;
        }
      } else if (!contractFailure) {
        return;
      }
    }
    ensureOpenClawAgentDatabaseSchema(database, {
      agentId,
      path: options.pathname,
    });
    assertOpenClawAgentDatabaseForMaintenance(database, {
      agentId,
      pathname: options.pathname,
    });
    // Converged, once: the repair savepoint only proves the indexes it rebuilt,
    // and the schema migrations that follow it write again.
    assertSqliteIntegrity(database, options.pathname);
  } finally {
    clearNodeSqliteKyselyCacheForDatabase(database);
    database.close();
  }
}
