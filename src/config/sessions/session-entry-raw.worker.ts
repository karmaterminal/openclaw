// Recovery inspects persisted JSON before any ordinary session-entry projection.
import { executeSqliteQuerySync } from "../../infra/kysely-sync.js";
import type { OpenClawAgentReadOnlyDatabase } from "../../state/openclaw-agent-db-readonly.js";
import { getSessionKysely } from "./session-accessor.sqlite-scope-helpers.js";

export function readRawSessionEntryJson(
  database: OpenClawAgentReadOnlyDatabase,
  sessionKey: string,
): string | undefined {
  const entryJson = executeSqliteQuerySync(
    database.db,
    getSessionKysely(database.db)
      .selectFrom("session_nodes")
      .select("entry_json")
      .where("session_key", "=", sessionKey),
  ).rows[0]?.entry_json;
  return typeof entryJson === "string" ? entryJson : undefined;
}
