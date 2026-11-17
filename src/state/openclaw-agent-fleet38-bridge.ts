// Frond (karmaterminal): fleet-38 bridge. Fork-owned and outside the upstream-facing continuation
// diff; the jump-13 Gate 2 notes list this file and each of its call sites.
//
// The deployed fleet build (3d3364ddc5) numbered recipient authority 38, so every fleet agent
// database reads 38 while holding upstream's 38 plus session_recipient_authority (upstream's 38 is
// a PostgreSQL-only step, so on SQLite the two differ by that table alone). The jump-13 candidate
// then numbered it 41, so a store it migrated reads 41 while holding upstream's 40 plus the
// authority table; upstream's own 41 adds session_transcript_active_event_facts instead. The
// jump-14 candidates (j14 prep e4a55624fc through #129388 51ff02dc16) numbered it 42, so a store
// they migrated reads 42 while holding upstream's 41 plus the authority table; upstream's own 42
// adds agent_tool_usage instead. Fork builds from jump 9 (48a4a4b441) through F″ (20a1ffd3d9)
// wrote the fleet's 38 DDL stamped 39, so a fleet-shaped 39 holds upstream's 38 plus the
// authority table under a 39 marker. Recipient authority is now 43, above upstream's 39 (cold
// transcript navigation), 40 (session creation receipts), 41 (active event facts) and 42 (tool
// usage). Before a migration reaches 43 the schema owner classifies a database stamped 38-42 by
// its markers: the authority table, upstream's creation-receipt, active-event-facts and
// tool-usage tables, and the transcript payload CHECK upstream's 39 widens. A version number
// alone never decides compatibility. Only upstream's own 38-42, the fleet's 38, the fleet-shaped
// 39, the jump-13 candidate's 41 and the jump-14 candidates' 42 are admitted. The fleet's 38 and
// fleet-shaped 39 then run upstream's 39-42, the jump-13 41 runs upstream's 41 and 42, and the
// jump-14 42 runs upstream's 42; each then runs the idempotent authority step, which keeps its
// table and rows, in the one migration transaction. Every other shape is refused before any
// write, including a 39 with the authority table and upstream's widened CHECK, the earlier
// candidate's 40, which no store holds, and any schema-41 or schema-42 shape that is neither
// upstream's own nor the jump-13 41 or jump-14 42.
import type { DatabaseSync } from "node:sqlite";
import { captureSqliteSchemaFacts } from "../infra/sqlite-schema-admission.js";
import { parseSqliteTableDefinition } from "../infra/sqlite-schema-contract-assembly.js";
import { extractSqliteTableSchema, normalizeSqlWhitespace } from "../infra/sqlite-schema-sql.js";
import { AGENT_ACTIVE_EVENT_FACTS_SCHEMA_VERSION } from "./openclaw-agent-active-event-facts-schema.js";
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
  AGENT_RECIPIENT_AUTHORITY_JUMP14_SCHEMA_VERSION,
  AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
  RECIPIENT_AUTHORITY_TABLE,
  sessionRecipientAuthoritySchemaSql,
} from "./openclaw-agent-recipient-authority-schema.js";
import { getOpenClawAgentMigrationSchema } from "./openclaw-agent-schema-history.js";
import { OPENCLAW_AGENT_SCHEMA_SQL } from "./openclaw-agent-schema.js";

const FLEET_38 = AGENT_TEXT_SEARCH_SCHEMA_VERSION;
const ACTIVE_EVENT_FACTS_TABLE = "session_transcript_active_event_facts";
const TOOL_USAGE_TABLE = "agent_tool_usage";

type AgentFleetBridgeMarkers = {
  authority: boolean;
  creationOperations: boolean;
  activeEventFacts: boolean;
  toolUsage: boolean;
  /** The transcript payload CHECK: upstream's widened 39 form, the prior form, or neither. */
  payloadCheck: "widened" | "prior" | "unknown";
};

/**
 * Which history an admitted database follows: upstream's own, the fleet's 38, jump 13's 41, or
 * jump 14's 42.
 */
type AgentBridgeHistory = "upstream" | "fleet-38" | "jump-13" | "jump-14";

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
    activeEventFacts: facts.tableSql.has(ACTIVE_EVENT_FACTS_TABLE),
    toolUsage: facts.tableSql.has(TOOL_USAGE_TABLE),
    payloadCheck: definition.includes(widened)
      ? "widened"
      : definition.includes(withoutAgentColdNavigation(widened))
        ? "prior"
        : "unknown",
  };
}

type AdmittedShape = { history: AgentBridgeHistory; markers: AgentFleetBridgeMarkers };

/**
 * The markers each admitted shape at 38-42 holds; anything else is refused. The fleet-38 history
 * is the fleet's 38 DDL under either its own 38 or the jump 9-F″ 39 marker.
 */
const ADMITTED_SHAPES: Readonly<Record<number, readonly AdmittedShape[]>> = {
  // Upstream's 38, then the fleet's 38: the same schema plus recipient authority.
  [FLEET_38]: [
    {
      history: "upstream",
      markers: {
        authority: false,
        creationOperations: false,
        activeEventFacts: false,
        toolUsage: false,
        payloadCheck: "prior",
      },
    },
    {
      history: "fleet-38",
      markers: {
        authority: true,
        creationOperations: false,
        activeEventFacts: false,
        toolUsage: false,
        payloadCheck: "prior",
      },
    },
  ],
  // Upstream's 39, then the fleet's 38 DDL as jump 9 through F″ stamped it 39.
  [AGENT_COLD_NAVIGATION_SCHEMA_VERSION]: [
    {
      history: "upstream",
      markers: {
        authority: false,
        creationOperations: false,
        activeEventFacts: false,
        toolUsage: false,
        payloadCheck: "widened",
      },
    },
    {
      history: "fleet-38",
      markers: {
        authority: true,
        creationOperations: false,
        activeEventFacts: false,
        toolUsage: false,
        payloadCheck: "prior",
      },
    },
  ],
  [AGENT_CREATION_OPERATIONS_SCHEMA_VERSION]: [
    {
      history: "upstream",
      markers: {
        authority: false,
        creationOperations: true,
        activeEventFacts: false,
        toolUsage: false,
        payloadCheck: "widened",
      },
    },
  ],
  // Upstream's 41 adds active event facts; jump 13's 41 is upstream's 40 plus recipient authority.
  [AGENT_ACTIVE_EVENT_FACTS_SCHEMA_VERSION]: [
    {
      history: "upstream",
      markers: {
        authority: false,
        creationOperations: true,
        activeEventFacts: true,
        toolUsage: false,
        payloadCheck: "widened",
      },
    },
    {
      history: "jump-13",
      markers: {
        authority: true,
        creationOperations: true,
        activeEventFacts: false,
        toolUsage: false,
        payloadCheck: "widened",
      },
    },
  ],
  // Upstream's 42 adds tool usage; jump 14's 42 is upstream's 41 plus recipient authority.
  [AGENT_RECIPIENT_AUTHORITY_JUMP14_SCHEMA_VERSION]: [
    {
      history: "upstream",
      markers: {
        authority: false,
        creationOperations: true,
        activeEventFacts: true,
        toolUsage: true,
        payloadCheck: "widened",
      },
    },
    {
      history: "jump-14",
      markers: {
        authority: true,
        creationOperations: true,
        activeEventFacts: true,
        toolUsage: false,
        payloadCheck: "widened",
      },
    },
  ],
};

/**
 * Classifies a database at 38-42 by its markers. Undefined for any other version, which keeps its
 * own history; an unrecognized shape at 38-42 is refused.
 */
function classifyAgentBridgeDatabase(
  db: DatabaseSync,
  pathname: string,
  schemaVersion: number,
): AgentBridgeHistory | undefined {
  const admitted = ADMITTED_SHAPES[schemaVersion];
  if (!admitted) {
    return undefined;
  }
  const markers = readFleetBridgeMarkers(db);
  const shape = admitted.find(
    (candidate) =>
      candidate.markers.authority === markers.authority &&
      candidate.markers.creationOperations === markers.creationOperations &&
      candidate.markers.activeEventFacts === markers.activeEventFacts &&
      candidate.markers.toolUsage === markers.toolUsage &&
      candidate.markers.payloadCheck === markers.payloadCheck,
  );
  if (!shape) {
    throw new Error(
      `OpenClaw agent database ${pathname} has an unrecognized schema-${schemaVersion} shape (recipient authority: ${markers.authority}, session creation receipts: ${markers.creationOperations}, active event facts: ${markers.activeEventFacts}, tool usage: ${markers.toolUsage}, transcript payload constraint: ${markers.payloadCheck}); restore its pre-upgrade backup rather than migrating it.`,
    );
  }
  return shape.history;
}

/** The fleet's 38: upstream's 38 plus recipient authority, as the deployed fleet build wrote it. */
export function getAgentFleet38MigrationSchema(): string {
  return `${getOpenClawAgentMigrationSchema(FLEET_38)}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`;
}

/** Jump 13's 41: upstream's 40 plus recipient authority, without upstream's active event facts. */
export function getAgentJump13Schema41MigrationSchema(): string {
  return `${getOpenClawAgentMigrationSchema(AGENT_CREATION_OPERATIONS_SCHEMA_VERSION)}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`;
}

/** Jump 14's 42: upstream's 41 plus recipient authority, without upstream's tool usage. */
export function getAgentJump14Schema42MigrationSchema(): string {
  return `${getOpenClawAgentMigrationSchema(AGENT_ACTIVE_EVENT_FACTS_SCHEMA_VERSION)}\n${sessionRecipientAuthoritySchemaSql(OPENCLAW_AGENT_SCHEMA_SQL)}`;
}

/** The historical schema and physical upstream shape of a bridged (non-upstream) history. */
function bridgedHistory(
  history: AgentBridgeHistory | undefined,
): { migrationSchema: string; shapeVersion: number } | undefined {
  switch (history) {
    case "fleet-38":
      return { migrationSchema: getAgentFleet38MigrationSchema(), shapeVersion: FLEET_38 };
    case "jump-13":
      return {
        migrationSchema: getAgentJump13Schema41MigrationSchema(),
        shapeVersion: AGENT_CREATION_OPERATIONS_SCHEMA_VERSION,
      };
    case "jump-14":
      return {
        migrationSchema: getAgentJump14Schema42MigrationSchema(),
        shapeVersion: AGENT_ACTIVE_EVENT_FACTS_SCHEMA_VERSION,
      };
    default:
      return undefined;
  }
}

/**
 * Preflight for a migration from 38-42 across the authority step: refuses every shape but
 * upstream's own, the fleet's 38 DDL (at 38 or 39), jump 13's 41 and jump 14's 42, and gives each bridged
 * history its own historical schema and the upstream shape it physically holds, so every
 * upstream step above that shape still runs. Undefined for upstream's shapes and for every
 * other migration.
 */
export function planAgentFleet38Bridge(
  db: DatabaseSync,
  pathname: string,
  previousVersion: number,
  targetVersion: number,
): { migrationSchema: string; shapeVersion: number } | undefined {
  return targetVersion >= AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION &&
    previousVersion < targetVersion
    ? bridgedHistory(classifyAgentBridgeDatabase(db, pathname, previousVersion))
    : undefined;
}

/**
 * A historical check of a database at 38-42 compares each bridged history against its own shape
 * and refuses any shape the migration would refuse.
 */
export function readAgentFleet38HistoricalSchema(
  db: DatabaseSync,
  pathname: string,
  schemaVersion: number,
): string | undefined {
  return bridgedHistory(classifyAgentBridgeDatabase(db, pathname, schemaVersion))?.migrationSchema;
}

/**
 * The upstream shape a database at 38-42 physically holds when it follows a bridged history,
 * which can sit below its marker (the fleet-shaped 39 holds 38, jump 13's 41 holds 40, jump 14's
 * 42 holds 41).
 * Undefined for upstream's own shapes and every other version; unrecognized shapes are refused.
 */
export function readAgentBridgedShapeVersion(
  db: DatabaseSync,
  pathname: string,
  schemaVersion: number,
): number | undefined {
  return bridgedHistory(classifyAgentBridgeDatabase(db, pathname, schemaVersion))?.shapeVersion;
}
