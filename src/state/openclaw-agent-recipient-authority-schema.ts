import { extractSqliteTableSchema } from "../infra/sqlite-schema-sql.js";

// Continuation (karmaterminal): durable session-key recipient-authority generations sit on top of
// upstream's agent schema 31. The fleet first received them at its own schemas 25 and 26
// (openclaw-agent-fleet-schema-history.ts); the lane's unreleased 27 is not recognised.
export const AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION = 32;
export const RECIPIENT_AUTHORITY_TABLE = "session_recipient_authority";

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

const POSTGRES_AUTHORITY_TABLE_RE = /CREATE TABLE "session_recipient_authority" \([\s\S]*?\n\);\n/;

/** The generated PostgreSQL DDL for the authority table (one statement, no indexes). */
export function sessionRecipientAuthorityPostgresSql(postgres: string): string {
  const statement = POSTGRES_AUTHORITY_TABLE_RE.exec(postgres)?.[0];
  if (!statement) {
    throw new Error("Generated PostgreSQL agent schema lacks session_recipient_authority");
  }
  return statement;
}

/** PostgreSQL schemas before the authority step. */
export function withoutSessionRecipientAuthorityPostgresSchema(postgres: string): string {
  return postgres.replace(sessionRecipientAuthorityPostgresSql(postgres), "");
}
