import { executeSqliteQuerySync, getNodeSqliteKysely } from "../../infra/kysely-sync.js";
import { withSqliteDatabaseWriteScope } from "../../infra/sqlite-database-admission.js";
import type { DB as OpenClawAgentKyselyDatabase } from "../../state/openclaw-agent-db.generated.js";
import type { OpenClawAgentDatabase } from "../../state/openclaw-agent-db.js";
import { createSessionRecipientAuthorityEpoch } from "./session-recipient-authority-types.js";

type SessionRecipientAuthorityDatabase = Pick<
  OpenClawAgentKyselyDatabase,
  "session_recipient_authority"
>;

export function getSessionRecipientAuthorityKysely(database: Pick<OpenClawAgentDatabase, "db">) {
  return getNodeSqliteKysely<SessionRecipientAuthorityDatabase>(database.db);
}

/** Replace (or create) the epoch inside the caller's write transaction. */
export function advanceSessionRecipientAuthorityInTransaction(
  database: Pick<OpenClawAgentDatabase, "db">,
  sessionKey: string,
): string {
  const epoch = createSessionRecipientAuthorityEpoch();
  const now = Date.now();
  // Scope the write to its own session: an unscoped write would advance every
  // session's write token and revoke unrelated actor replicas.
  withSqliteDatabaseWriteScope(database.db, [sessionKey], () =>
    executeSqliteQuerySync(
      database.db,
      getSessionRecipientAuthorityKysely(database)
        .insertInto("session_recipient_authority")
        .values({ session_key: sessionKey, epoch, created_at: now, updated_at: now })
        .onConflict((conflict) =>
          conflict.column("session_key").doUpdateSet({ epoch, updated_at: now }),
        ),
    ),
  );
  return epoch;
}
