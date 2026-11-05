// Frond (karmaterminal): fleet-38 bridge. Fork-owned and outside the upstream-facing continuation
// diff; the jump-13 Gate 2 notes list this file and each of its call sites.
//
// The deployed fleet build (3d3364ddc5) numbered recipient authority 38, so every fleet agent
// database reads 38 while holding upstream's 38 plus session_recipient_authority (upstream's 38 is
// a PostgreSQL-only step, so on SQLite the two differ by that table alone). Recipient authority is
// now 41, above upstream's 39 (cold transcript navigation) and 40 (session creation receipts).
// Before a migration reaches 41 the schema owner classifies a database stamped 38, 39 or 40 by its
// markers: the authority table, upstream's creation-receipt table, and the transcript payload CHECK
// upstream's 39 widens. Only upstream's own 38, 39 and 40 and the fleet's 38 are admitted; the
// fleet's 38 then runs upstream's 39 and 40 and the idempotent authority step, which keeps its table
// and rows, in the one migration transaction. Every other shape is refused before any write,
// including the earlier candidates' 39 and 40, which no store holds.
import type { DatabaseSync } from "node:sqlite";
import { captureSqliteSchemaFacts } from "../infra/sqlite-schema-admission.js";
import { parseSqliteTableDefinition } from "../infra/sqlite-schema-contract-assembly.js";
import { extractSqliteTableSchema, normalizeSqlWhitespace } from "../infra/sqlite-schema-sql.js";
import { withoutAgentColdNavigation } from "./openclaw-agent-cold-navigation-schema.js";
import {
  AGENT_CREATION_OPERATIONS_SCHEMA_VERSION,
  SESSION_CREATION_OPERATIONS_TABLE,
} from "./openclaw-agent-creation-operations-schema.js";
import {
  AGENT_COLD_NAVIGATION_SCHEMA_VERSION,
  AGENT_TEXT_SEARCH_SCHEMA_VERSION,
} from "./openclaw-agent-db-contract.js";
import {
  AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
  RECIPIENT_AUTHORITY_TABLE,
  sessionRecipientAuthoritySchemaSql,
} from "./openclaw-agent-recipient-authority-schema.js";
import { getOpenClawAgentMigrationSchema } from "./openclaw-agent-schema-history.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.js";

const FLEET_38 = AGENT_TEXT_SEARCH_SCHEMA_VERSION;

type AgentFleetBridgeMarkers = {
  authority: boolean;
  creationOperations: boolean;
  /** The transcript payload CHECK: upstream's widened 39 form, the prior form, or neither. */
  payloadCheck: "widened" | "prior" | "unknown";
};

function readFleetBridgeMarkers(db: DatabaseSync): AgentFleetBridgeMarkers {
  const facts = captureSqliteSchemaFacts(db);
  const widened = parseSqliteTableDefinition(
    extractSqliteTableSchema(OPENCLAW_AGENT_SCHEMA_SQL, "transcript_events"),
    "transcript_events",
  ).constraints.find((constraint) => constraint.includes("event_zstd IS NOT NULL"));
  if (!widened) {
    throw new Error("Cold navigation payload constraint is missing");
  }
  const transcript = facts.tableSql.get("transcript_events");
  const definition = transcript ? normalizeSqlWhitespace(transcript) : "";
  return {
    authority: facts.tableSql.has(RECIPIENT_AUTHORITY_TABLE),
    creationOperations: facts.tableSql.has(SESSION_CREATION_OPERATIONS_TABLE),
    payloadCheck: definition.includes(widened)
      ? "widened"
      : definition.includes(withoutAgentColdNavigation(widened))
        ? "prior"
        : "unknown",
  };
}

/** The markers each admitted shape at 38, 39 and 40 holds; anything else is refused. */
const ADMITTED_SHAPES: Readonly<Record<number, readonly AgentFleetBridgeMarkers[]>> = {
  // Upstream's 38, then the fleet's 38: the same schema plus recipient authority.
  [FLEET_38]: [
    { authority: false, creationOperations: false, payloadCheck: "prior" },
    { authority: true, creationOperations: false, payloadCheck: "prior" },
  ],
  [AGENT_COLD_NAVIGATION_SCHEMA_VERSION]: [
    { authority: false, creationOperations: false, payloadCheck: "widened" },
  ],
  [AGENT_CREATION_OPERATIONS_SCHEMA_VERSION]: [
    { authority: false, creationOperations: true, payloadCheck: "widened" },
  ],
};

/**
 * Classifies a database at 38, 39 or 40; true for the fleet's 38, false for upstream's own shape.
 * Undefined for any other version, which keeps its own history.
 */
function isAgentFleet38Database(
  db: DatabaseSync,
  pathname: string,
  schemaVersion: number,
): boolean | undefined {
  const admitted = ADMITTED_SHAPES[schemaVersion];
  if (!admitted) {
    return undefined;
  }
  const markers = readFleetBridgeMarkers(db);
  const shape = admitted.find(
    (candidate) =>
      candidate.authority === markers.authority &&
      candidate.creationOperations === markers.creationOperations &&
      candidate.payloadCheck === markers.payloadCheck,
  );
  if (!shape) {
    throw new Error(
      `OpenClaw agent database ${pathname} has an unrecognized schema-${schemaVersion} shape (recipient authority: ${markers.authority}, session creation receipts: ${markers.creationOperations}, transcript payload constraint: ${markers.payloadCheck}); restore its pre-upgrade backup rather than migrating it.`,
    );
  }
  return shape.authority;
}

/** The fleet's 38: upstream's 38 plus recipient authority, as the deployed fleet build wrote it. */
export function getAgentFleet38MigrationSchema(): string {
  return `${getOpenClawAgentMigrationSchema(FLEET_38)}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`;
}

/**
 * Preflight for a migration from 38, 39 or 40 across the authority step: refuses every shape but
 * upstream's own and the fleet's 38, and gives the fleet's 38 its own historical schema. Undefined
 * for upstream's shapes and for every other migration.
 */
export function planAgentFleet38Bridge(
  db: DatabaseSync,
  pathname: string,
  previousVersion: number,
  targetVersion: number,
): { migrationSchema: string } | undefined {
  // The fleet's 38 physically holds upstream's 38, so upstream's 39 and 40 still run.
  return targetVersion >= AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION &&
    previousVersion < targetVersion &&
    isAgentFleet38Database(db, pathname, previousVersion)
    ? { migrationSchema: getAgentFleet38MigrationSchema() }
    : undefined;
}

/**
 * A historical check of a database at 38, 39 or 40 compares the fleet's 38 against its own shape
 * and refuses any shape the migration would refuse.
 */
export function readAgentFleet38HistoricalSchema(
  db: DatabaseSync,
  pathname: string,
  schemaVersion: number,
): string | undefined {
  return isAgentFleet38Database(db, pathname, schemaVersion)
    ? getAgentFleet38MigrationSchema()
    : undefined;
}
