import type { DatabaseSync } from "node:sqlite";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import {
  AGENT_JSON_PREDICATE_SCHEMA_VERSION,
  AGENT_TEXT_SEARCH_SCHEMA_VERSION,
  CANONICAL_SESSION_WRITER_VALIDATION_SCHEMA_VERSION,
} from "./openclaw-agent-db-contract.js";
import {
  getOpenClawAgentFleetSchema25MigrationSchema,
  getOpenClawAgentFleetSchema26MigrationSchema,
  getOpenClawAgentMigrationSchema,
  readOpenClawAgentSchema25Shape,
  readOpenClawAgentSchema26Shape,
} from "./openclaw-agent-db-schema-helpers.js";
import {
  migrateSessionRecipientAuthorityInTransaction,
  readSqliteTableColumns,
} from "./openclaw-agent-db-session-migrations.js";
import {
  planAgentFleet38Bridge,
  readAgentBridgedShapeVersion,
} from "./openclaw-agent-fleet38-bridge.js";
import { AGENT_JSON_PREDICATE_COLUMNS } from "./openclaw-agent-json-predicate-schema.js";
import {
  AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
  RECIPIENT_AUTHORITY_TABLE,
  withoutSessionRecipientAuthoritySchema,
} from "./openclaw-agent-recipient-authority-schema.js";

/**
 * Schemas 25 and 26 each have two histories: upstream's, and the fleet's earlier
 * (unreleased) recipient-authority schema. The fleet's 25 still carries the legacy
 * validation triggers; its 26 lacks upstream's JSON predicate columns. Both already
 * have the authority table.
 */
type AgentFleetSchemaHistoryPlan = {
  /** The upstream schema the database physically holds; every step above it still runs. */
  shapeVersion: number;
  /** Whether this migration crosses a version step, measured from the physical shape. */
  crosses: (version: number) => boolean;
  /** The schema the database must contain before migrating, by its physical history. */
  previousSchema: () => string;
  /** Historical migration DDL leaves the authority table to the authority step. */
  withoutAddedAuthority: (schemaSql: string) => string;
  /** The idempotent authority step, after upstream's steps; existing rows are kept. */
  migrateInTransaction: (db: DatabaseSync) => void;
};

/** Reads which history a database at schema 25, 26 or 38-41 follows; mixed shapes are refused. */
export function planAgentFleetSchemaHistory(
  db: DatabaseSync,
  pathname: string,
  previousVersion: number,
  targetVersion: number,
): AgentFleetSchemaHistoryPlan {
  const reachesAuthority = targetVersion >= AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION;
  const fleetSchema25 =
    reachesAuthority &&
    previousVersion === CANONICAL_SESSION_WRITER_VALIDATION_SCHEMA_VERSION &&
    readOpenClawAgentSchema25Shape(db, pathname) === "recipient-authority";
  const fleetSchema26 =
    reachesAuthority &&
    previousVersion === AGENT_JSON_PREDICATE_SCHEMA_VERSION &&
    readOpenClawAgentSchema26Shape(db, pathname) === "recipient-authority";
  // Frond (karmaterminal): fleet-38 bridge.
  const fleet38 = planAgentFleet38Bridge(db, pathname, previousVersion, targetVersion);
  // The fleet's 38 DDL (at 38 or 39) physically holds upstream's 38, jump 13's 41 upstream's 40.
  const shapeVersion =
    fleetSchema25 || fleetSchema26
      ? previousVersion - 1
      : (fleet38?.shapeVersion ?? previousVersion);
  const addsRecipientAuthority =
    reachesAuthority && previousVersion < AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION;
  return {
    shapeVersion,
    crosses: (version) => shapeVersion < version && targetVersion >= version,
    previousSchema: () =>
      fleet38?.migrationSchema ??
      (fleetSchema25
        ? getOpenClawAgentFleetSchema25MigrationSchema()
        : fleetSchema26
          ? getOpenClawAgentFleetSchema26MigrationSchema()
          : getOpenClawAgentMigrationSchema(previousVersion)),
    withoutAddedAuthority: (schemaSql) =>
      addsRecipientAuthority ? withoutSessionRecipientAuthoritySchema(schemaSql) : schemaSql,
    migrateInTransaction: (database) => {
      if (addsRecipientAuthority) {
        migrateSessionRecipientAuthorityInTransaction(database);
      }
    },
  };
}

/**
 * Whether a pending agent migration starts from the fleet's schema 26. Its run also adds
 * upstream's step-26 JSON predicate columns, a step with no declared backup scope, so Doctor
 * must keep a full image for it. Any other shape is left to the migration, which refuses
 * what it cannot recognize.
 */
export function isAgentFleetSchema26Migration(migration: {
  kind: "agent" | "state";
  path: string;
  foundVersion: number;
}): boolean {
  if (
    migration.kind !== "agent" ||
    migration.foundVersion !== AGENT_JSON_PREDICATE_SCHEMA_VERSION
  ) {
    return false;
  }
  using database = openNodeSqliteDatabase(migration.path, { readOnly: true });
  const sessionColumns = readSqliteTableColumns(database, "session_nodes");
  return (
    readSqliteTableColumns(database, RECIPIENT_AUTHORITY_TABLE) !== null &&
    !AGENT_JSON_PREDICATE_COLUMNS.session_nodes.some((column) => sessionColumns?.has(column))
  );
}

/**
 * Whether a pending agent migration starts from a bridged shape that sits below its marker: the
 * fleet-shaped 39 (upstream's 38 plus authority) and jump 13's 41 (upstream's 40 plus authority).
 * Each run also crosses an upstream step its marker says it already holds, outside every declared
 * backup scope, so Doctor must keep a full image for it. An unrecognized shape at 38-41 is
 * refused here, before any backup or write, with the schema owner's own refusal.
 */
export function isAgentBridgedSchemaBelowMarkerMigration(migration: {
  kind: "agent" | "state";
  path: string;
  foundVersion: number;
}): boolean {
  if (
    migration.kind !== "agent" ||
    migration.foundVersion < AGENT_TEXT_SEARCH_SCHEMA_VERSION ||
    migration.foundVersion >= AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION
  ) {
    return false;
  }
  using database = openNodeSqliteDatabase(migration.path, { readOnly: true });
  const shapeVersion = readAgentBridgedShapeVersion(
    database,
    migration.path,
    migration.foundVersion,
  );
  return shapeVersion !== undefined && shapeVersion < migration.foundVersion;
}
