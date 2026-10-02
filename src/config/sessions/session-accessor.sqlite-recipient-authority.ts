import type { DatabaseSync } from "node:sqlite";
import {
  executeSqliteQuerySync,
  executeSqliteQueryTakeFirstSync,
  getNodeSqliteKysely,
} from "../../infra/kysely-sync.js";
import { markSqliteCommitFenceMutation } from "../../infra/sqlite-commit-fence.js";
import type { DB as OpenClawAgentKyselyDatabase } from "../../state/openclaw-agent-db.generated.js";
import type { OpenClawAgentDatabase } from "../../state/openclaw-agent-db.js";
import {
  createSessionRecipientAuthorityEpoch,
  readSessionRecipientAuthorityEpoch,
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

/** Fence key shared by every writer that replaces or removes an existing epoch. */
export function sessionRecipientAuthorityFenceKey(sessionKey: string): string {
  return `session-recipient-authority\u0000${sessionKey}`;
}

/**
 * Writers that replace or delete a present epoch mark the process-wide fence inside
 * their transaction. Inserting a missing epoch cannot make any captured authority
 * current or stale, so capture and the additive migration backfill stay unfenced.
 */
export function markSessionRecipientAuthorityMutation(db: DatabaseSync, sessionKey: string): void {
  markSqliteCommitFenceMutation(db, sessionRecipientAuthorityFenceKey(sessionKey));
}

export function advanceSessionRecipientAuthorityInTransaction(
  database: OpenClawAgentDatabase,
  sessionKey: string,
): void {
  markSessionRecipientAuthorityMutation(database.db, sessionKey);
  const now = Date.now();
  executeSqliteQuerySync(
    database.db,
    getSessionRecipientAuthorityKysely(database)
      .insertInto("session_recipient_authority")
      .values({
        session_key: sessionKey,
        epoch: createSessionRecipientAuthorityEpoch(),
        created_at: now,
        updated_at: now,
      })
      .onConflict((conflict) =>
        conflict.column("session_key").doUpdateSet({
          epoch: createSessionRecipientAuthorityEpoch(),
          updated_at: now,
        }),
      ),
  );
}

// The kernels below run in the agent database workers. Process-held incognito
// databases cannot be reopened by path, so their sole native owner shares them.

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

/** Insert-if-absent; the caller owns the immediate write transaction. */
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
  const epoch = createSessionRecipientAuthorityEpoch();
  const now = Date.now();
  executeSqliteQuerySync(
    database.db,
    getSessionRecipientAuthorityKysely(database).insertInto("session_recipient_authority").values({
      session_key: sessionKey,
      epoch,
      created_at: now,
      updated_at: now,
    }),
  );
  return { state: "bound", epoch };
}
