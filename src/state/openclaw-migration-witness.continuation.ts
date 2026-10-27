// Continuation's recipient authority in migration witnesses, split from
// openclaw-migration-witness.ts to keep that file under its line cap.
import {
  assertOpenClawAgentSchemaContains,
  readOpenClawAgentHistoricalSchema,
} from "./openclaw-agent-db-schema-helpers.js";
import {
  AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
  RECIPIENT_AUTHORITY_TABLE,
} from "./openclaw-agent-recipient-authority-schema.js";

export { RECIPIENT_AUTHORITY_TABLE };

/** Agent schemas a witness admits: upstream's 24..37 and continuation's authority step. */
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
  AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION,
]);

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

/** The authority step creates its table; a migration crossing it may leave the table empty. */
export function omitAddedRecipientAuthority(
  currentTables: Map<string, { rowCount: number }>,
  crossing: boolean,
): void {
  if (crossing && currentTables.get(RECIPIENT_AUTHORITY_TABLE)?.rowCount === 0) {
    currentTables.delete(RECIPIENT_AUTHORITY_TABLE);
  }
}
