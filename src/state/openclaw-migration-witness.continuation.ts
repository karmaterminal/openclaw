import { AGENT_ACTIVE_EVENT_FACTS_SCHEMA_VERSION } from "./openclaw-agent-active-event-facts-schema.js";
// Continuation's recipient authority in migration witnesses, split from
// openclaw-migration-witness.ts to keep that file under its line cap.
import {
  assertOpenClawAgentSchemaContains,
  readOpenClawAgentHistoricalSchema,
} from "./openclaw-agent-db-schema-helpers.js";
import {
  AGENT_RECIPIENT_AUTHORITY_JUMP13_SCHEMA_VERSION,
  AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
  RECIPIENT_AUTHORITY_TABLE,
} from "./openclaw-agent-recipient-authority-schema.js";

export { RECIPIENT_AUTHORITY_TABLE };

/** Agent schemas a witness admits: upstream's 24..41 and continuation's authority step. */
export const AGENT_WITNESS_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  AGENT_ACTIVE_EVENT_FACTS_SCHEMA_VERSION,
  AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
]);

const ACTIVE_EVENT_FACTS_TABLE = "session_transcript_active_event_facts";

/**
 * Jump 13 numbered the authority step 41, so its witness reads 41 while holding upstream's 40
 * plus the authority table, without upstream's active event facts. The schema owner admits only
 * that marker pair at 41 besides upstream's own (openclaw-agent-fleet38-bridge.ts); the number
 * alone never implies which tables a witness holds.
 */
export function isJump13AuthorityWitness(witness: {
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
 * 13's 41 also crosses upstream's step 41, whose companion table it gains empty.
 */
export function omitAddedRecipientAuthority(
  currentTables: Map<string, { rowCount: number }>,
  crossing: boolean,
  original: Parameters<typeof isJump13AuthorityWitness>[0],
): void {
  if (crossing && currentTables.get(RECIPIENT_AUTHORITY_TABLE)?.rowCount === 0) {
    currentTables.delete(RECIPIENT_AUTHORITY_TABLE);
  }
  if (
    crossing &&
    isJump13AuthorityWitness(original) &&
    currentTables.get(ACTIVE_EVENT_FACTS_TABLE)?.rowCount === 0
  ) {
    currentTables.delete(ACTIVE_EVENT_FACTS_TABLE);
  }
}
