import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "../../infra/kysely-sync.js";
import { withOpenClawAgentDatabaseReadOnly } from "../../state/openclaw-agent-db-readonly.js";
import type { DB as OpenClawAgentKyselyDatabase } from "../../state/openclaw-agent-db.generated.js";
import type { OpenClawAgentDatabase } from "../../state/openclaw-agent-db.js";
import type { SessionAccessScope } from "./session-accessor.sqlite-contract.js";
import { resolveSqliteScope, toDatabaseOptions } from "./session-accessor.sqlite-scope.js";
import {
  createSessionRecipientAuthorityEpoch,
  readSessionRecipientAuthorityEpoch,
  sessionRecipientAuthorityMatches,
  type SessionRecipientAuthority,
  type SessionRecipientAuthorityEpochState,
} from "./session-recipient-authority-types.js";

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
  executeSqliteQuerySync(
    database.db,
    getSessionRecipientAuthorityKysely(database)
      .insertInto("session_recipient_authority")
      .values({ session_key: sessionKey, epoch, created_at: now, updated_at: now })
      .onConflict((conflict) =>
        conflict.column("session_key").doUpdateSet({ epoch, updated_at: now }),
      ),
  );
  return epoch;
}

/** Shared by the synchronous currency check, the capture worker, and incognito capture. */
export function readSessionRecipientAuthorityEpochInDatabase(
  database: Pick<OpenClawAgentDatabase, "db">,
  sessionKey: string,
): SessionRecipientAuthorityEpochState {
  const row = executeSqliteQueryTakeFirstSync(
    database.db,
    getSessionRecipientAuthorityKysely(database)
      .selectFrom("session_recipient_authority")
      .select("epoch")
      .where("session_key", "=", sessionKey),
  );
  return readSessionRecipientAuthorityEpoch(row?.epoch);
}

/**
 * Insert-if-absent inside the caller's immediate write transaction. A missing row
 * cannot appear between the read and the upsert, so initializing through the
 * advance upsert writes exactly what an insert would.
 */
export function captureSessionRecipientAuthorityInTransaction(
  database: Pick<OpenClawAgentDatabase, "db">,
  sessionKey: string,
): SessionRecipientAuthority {
  const current = readSessionRecipientAuthorityEpochInDatabase(database, sessionKey);
  if (current.state === "malformed") {
    throw new Error(`Invalid recipient authority epoch for session ${sessionKey}`);
  }
  if (current.state === "present") {
    return { state: "bound", epoch: current.epoch };
  }
  return {
    state: "bound",
    epoch: advanceSessionRecipientAuthorityInTransaction(database, sessionKey),
  };
}

/**
 * The adopt/deliver decision is this durable comparison itself. Callers act on it
 * in the same synchronous frame, so no cached or projected epoch stands in for
 * the store after another process may have committed.
 */
export function isSessionRecipientAuthorityCurrent(
  scope: SessionAccessScope,
  authority: SessionRecipientAuthority,
): boolean {
  const resolved = resolveSqliteScope(scope);
  const result = withOpenClawAgentDatabaseReadOnly(
    (database) =>
      sessionRecipientAuthorityMatches(
        authority,
        readSessionRecipientAuthorityEpochInDatabase(database, resolved.sessionKey),
      ),
    toDatabaseOptions(resolved),
  );
  return result.found && result.value;
}
