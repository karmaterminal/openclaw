import type { DatabaseSync } from "node:sqlite";
import {
  AGENT_JSON_PREDICATE_SCHEMA_VERSION,
  CANONICAL_SESSION_WRITER_VALIDATION_SCHEMA_VERSION,
} from "./openclaw-agent-db-contract.js";
import {
  getOpenClawAgentFleetSchema25MigrationSchema,
  getOpenClawAgentFleetSchema26MigrationSchema,
  getOpenClawAgentMigrationSchema,
  readOpenClawAgentSchema25Shape,
  readOpenClawAgentSchema26Shape,
} from "./openclaw-agent-db-schema-helpers.js";
import { AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION } from "./openclaw-agent-recipient-authority-schema.js";

/**
 * Schemas 25 and 26 each have two histories: upstream's, and the fleet's earlier
 * (unreleased) recipient-authority schema. The fleet's 25 still carries the legacy
 * validation triggers; its 26 lacks upstream's JSON predicate columns. Both already
 * have the authority table.
 */
type AgentFleetSchemaHistoryPlan = {
  /** The database is the fleet's schema 25. */
  fleetSchema25: boolean;
  /** The database is the fleet's schema 26. */
  fleetSchema26: boolean;
  /** For the fleet's schema 25, the schema to repair and assert instead of upstream's 25. */
  schema25MigrationSchema: string | undefined;
  /** For a schema-26 database of either history, the schema it must contain before migrating. */
  schema26MigrationSchema: string | undefined;
  /** This migration reaches the recipient-authority schema from below it. */
  addsRecipientAuthority: boolean;
};

/** Reads which history a database at schema 25 or 26 follows; mixed shapes are refused. */
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
  const schema26 = reachesAuthority && previousVersion === AGENT_JSON_PREDICATE_SCHEMA_VERSION;
  const fleetSchema26 =
    schema26 && readOpenClawAgentSchema26Shape(db, pathname) === "recipient-authority";
  let schema26MigrationSchema: string | undefined;
  if (schema26) {
    schema26MigrationSchema = fleetSchema26
      ? getOpenClawAgentFleetSchema26MigrationSchema()
      : getOpenClawAgentMigrationSchema(previousVersion);
  }
  return {
    fleetSchema25,
    fleetSchema26,
    schema25MigrationSchema: fleetSchema25
      ? getOpenClawAgentFleetSchema25MigrationSchema()
      : undefined,
    schema26MigrationSchema,
    addsRecipientAuthority:
      reachesAuthority && previousVersion < AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
  };
}
