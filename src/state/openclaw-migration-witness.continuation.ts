// Continuation's recipient authority in migration witnesses, split from
// openclaw-migration-witness.ts to keep that file under its line cap.
import {
  assertOpenClawAgentSchemaContains,
  readOpenClawAgentHistoricalSchema,
} from "./openclaw-agent-db-schema-helpers.js";
import {
  AGENT_RECIPIENT_AUTHORITY_JUMP13_SCHEMA_VERSION,
  AGENT_RECIPIENT_AUTHORITY_JUMP14_SCHEMA_VERSION,
  RECIPIENT_AUTHORITY_TABLE,
} from "./openclaw-agent-recipient-authority-schema.js";

export { RECIPIENT_AUTHORITY_TABLE };

const ACTIVE_EVENT_FACTS_TABLE = "session_transcript_active_event_facts";
const TOOL_USAGE_TABLE = "agent_tool_usage";

/**
 * Jump 13 numbered the authority step 41, so its witness reads 41 while holding upstream's 40
 * plus the authority table, without upstream's active event facts. The schema owner admits only
 * that marker pair at 41 besides upstream's own (openclaw-agent-fleet38-bridge.ts); the number
 * alone never implies which tables a witness holds.
 */
function isJump13AuthorityWitness(witness: {
  role: string;
  schemaVersion: number;
  tables: readonly { name: string }[];
}): boolean {
  return (
    witness.role === "agent" &&
    witness.schemaVersion === AGENT_RECIPIENT_AUTHORITY_JUMP13_SCHEMA_VERSION &&
    witness.tables.some((table) => table.name === RECIPIENT_AUTHORITY_TABLE) &&
    !witness.tables.some((table) => table.name === ACTIVE_EVENT_FACTS_TABLE)
  );
}

/**
 * Jump 14 numbered the authority step 42, so its witness reads 42 while holding upstream's 41
 * plus the authority table, without upstream's tool usage. The schema owner admits only that
 * marker pair at 42 besides upstream's own (openclaw-agent-fleet38-bridge.ts).
 */
function isJump14AuthorityWitness(
  witness: Parameters<typeof isJump13AuthorityWitness>[0],
): boolean {
  return (
    witness.role === "agent" &&
    witness.schemaVersion === AGENT_RECIPIENT_AUTHORITY_JUMP14_SCHEMA_VERSION &&
    witness.tables.some((table) => table.name === RECIPIENT_AUTHORITY_TABLE) &&
    !witness.tables.some((table) => table.name === TOOL_USAGE_TABLE)
  );
}

/** The upstream companion table a bridged authority witness lacks at its marker, if any. */
export function bridgedWitnessOmittedTable(
  witness: Parameters<typeof isJump13AuthorityWitness>[0],
): string | undefined {
  return isJump13AuthorityWitness(witness)
    ? ACTIVE_EVENT_FACTS_TABLE
    : isJump14AuthorityWitness(witness)
      ? TOOL_USAGE_TABLE
      : undefined;
}

/**
 * Asserts a witness database against its historical schema and returns whether that history
 * carries the legacy validation triggers. Schemas 25 and 26 have two histories: a fleet backup
 * carries recipient authority, and the fleet's 25 also the legacy triggers.
 */
export function assertAgentWitnessHistoricalSchema(
  database: Parameters<typeof assertOpenClawAgentSchemaContains>[0],
  schemaVersion: number,
): boolean {
  const history = readOpenClawAgentHistoricalSchema(database, "migration witness", schemaVersion);
  assertOpenClawAgentSchemaContains(database, "migration witness", history.schema);
  return history.legacyValidationTriggers;
}

/**
 * The authority step creates its table; a migration crossing it may leave the table empty. Jump
 * 13's 41 also crosses upstream's step 41 and jump 14's 42 upstream's step 42, whose companion
 * table each gains empty.
 */
export function omitAddedRecipientAuthority(
  currentTables: Map<string, { rowCount: number }>,
  crossing: boolean,
  original: Parameters<typeof isJump13AuthorityWitness>[0],
): void {
  if (crossing && currentTables.get(RECIPIENT_AUTHORITY_TABLE)?.rowCount === 0) {
    currentTables.delete(RECIPIENT_AUTHORITY_TABLE);
  }
  const omitted = bridgedWitnessOmittedTable(original);
  if (crossing && omitted && currentTables.get(omitted)?.rowCount === 0) {
    currentTables.delete(omitted);
  }
}
