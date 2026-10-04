import { extractSqliteTableSchema } from "../infra/sqlite-schema-sql.js";

export const AGENT_RECIPIENT_AUTHORITY_SCHEMA_VERSION = 25;

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
