import { extractSqliteTableSchema } from "../infra/sqlite-schema-sql.js";

// Continuation (karmaterminal): durable session-key recipient-authority generations sit on top of
// upstream's agent schema 31. The fleet first received them at its own schemas 25 and 26
// (openclaw-agent-fleet-schema-history.ts); the lane's unreleased 27 is not recognised.
export const AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION = 32;

export function sessionRecipientAuthoritySchemaSql(schema: string): string {
  return extractSqliteTableSchema(schema, "session_recipient_authority");
}

/** Historical admission must validate only the tables its schema version supported. */
export function withoutSessionRecipientAuthoritySchema(schema: string): string {
  if (!schema.includes("CREATE TABLE IF NOT EXISTS session_recipient_authority (")) {
    return schema;
  }
  return schema.replace(sessionRecipientAuthoritySchemaSql(schema), "");
}
