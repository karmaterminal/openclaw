// Frond (karmaterminal): fork-39 bridge. Fork-owned and outside the upstream-facing continuation
// diff; the jump-12 Gate 2 notes list this file and each of its call sites.
//
// Continuation builds before jump 12 numbered recipient authority 39, so fleet agent databases read
// 39 while holding upstream's 38 plus session_recipient_authority. Upstream's own 39 widens the
// transcript payload CHECK instead, and recipient authority is now 40. Only a positively identified
// fleet 39 is bridged: the authority table present and the prior payload CHECK in place of
// upstream's widened one. The schema owner then runs upstream's 39 step and the idempotent
// authority step in its one migration transaction and stamps 40. Every other 39 shape is refused.
import type { DatabaseSync } from "node:sqlite";
import { openNodeSqliteDatabase } from "../infra/node-sqlite.js";
import { captureSqliteSchemaFacts } from "../infra/sqlite-schema-admission.js";
import { parseSqliteTableDefinition } from "../infra/sqlite-schema-contract-assembly.js";
import { extractSqliteTableSchema, normalizeSqlWhitespace } from "../infra/sqlite-schema-sql.js";
import {
  agentColdNavigationPostgresMigration,
  withoutAgentColdNavigation,
  withoutAgentPostgresColdNavigation,
} from "./openclaw-agent-cold-navigation-schema.js";
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

const FORK_39 = AGENT_COLD_NAVIGATION_SCHEMA_VERSION;

type Schema39Markers = {
  authority: boolean;
  /** The transcript payload CHECK: upstream's widened 39 form, the prior form, or neither. */
  payloadCheck: "widened" | "prior" | "unknown";
};

function readSchema39Markers(db: DatabaseSync): Schema39Markers {
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
    payloadCheck: definition.includes(widened)
      ? "widened"
      : definition.includes(withoutAgentColdNavigation(widened))
        ? "prior"
        : "unknown",
  };
}

function isFork39Shape(markers: Schema39Markers): boolean {
  return markers.authority && markers.payloadCheck === "prior";
}

/** Classifies a schema-39 database; anything but upstream's 39 or the fleet's 39 is refused. */
export function isAgentFork39Database(db: DatabaseSync, pathname: string): boolean {
  const markers = readSchema39Markers(db);
  if (isFork39Shape(markers)) {
    return true;
  }
  if (!markers.authority && markers.payloadCheck === "widened") {
    return false;
  }
  throw new Error(
    `OpenClaw agent database ${pathname} has an unrecognized schema-39 shape (recipient authority: ${markers.authority}, transcript payload constraint: ${markers.payloadCheck}); restore its pre-upgrade backup rather than migrating it.`,
  );
}

/** The fleet's 39: upstream's 38 plus recipient authority, as each fork-39 build wrote it. */
export function getAgentFork39MigrationSchema(): string {
  return `${getOpenClawAgentMigrationSchema(AGENT_TEXT_SEARCH_SCHEMA_VERSION)}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`;
}

/** The bridge for a migration from 39 across the authority step; undefined for upstream's 39. */
export function planAgentFork39Bridge(
  db: DatabaseSync,
  pathname: string,
  previousVersion: number,
  targetVersion: number,
): { migrationSchema: string; shapeVersion: number } | undefined {
  // The fleet's 39 physically holds upstream's 38, so upstream's 39 step still runs.
  return previousVersion === FORK_39 &&
    targetVersion >= AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION &&
    isAgentFork39Database(db, pathname)
    ? { migrationSchema: getAgentFork39MigrationSchema(), shapeVersion: FORK_39 - 1 }
    : undefined;
}

/** A historical check of a database at 39 compares the fleet's 39 against its own shape. */
export function readAgentFork39HistoricalSchema(
  db: DatabaseSync,
  pathname: string,
  schemaVersion: number,
): string | undefined {
  return schemaVersion === FORK_39 && isAgentFork39Database(db, pathname)
    ? getAgentFork39MigrationSchema()
    : undefined;
}

/**
 * Doctor's backup scope: a bridged fleet 39 also crosses upstream's 39, so it backs up what both
 * steps rewrite. Any other shape keeps its declared crossing; its migration refuses before writing.
 */
export function withAgentFork39BackupCrossing<
  T extends {
    kind: "agent" | "state";
    path: string;
    foundVersion: number;
    supportedVersion: number;
  },
>(migration: T): T {
  if (
    migration.kind !== "agent" ||
    migration.foundVersion !== FORK_39 ||
    migration.supportedVersion < AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION
  ) {
    return migration;
  }
  using database = openNodeSqliteDatabase(migration.path, { readOnly: true });
  return isFork39Shape(readSchema39Markers(database))
    ? { ...migration, foundVersion: FORK_39 - 1 }
    : migration;
}

/**
 * The fleet's PostgreSQL 39, admitted as an exact alternate predecessor of the authority step: it
 * gains upstream's widened payload constraint and keeps its authority table and rows.
 */
export function agentFork39PostgresSource(agentPostgresSql: string, versionMetaSql: string) {
  return {
    fromSchema: {
      postgres: withoutAgentPostgresColdNavigation(agentPostgresSql),
      postgresVectorDecoderVersion: 2 as const,
      postgresVectorSearchVersion: 2 as const,
      postgresTextSearchVersion: 2 as const,
    },
    sql: `${agentColdNavigationPostgresMigration(agentPostgresSql)}
        ${versionMetaSql}`,
  };
}
