import {
  isSqliteCommitFenceUnchanged,
  snapshotSqliteCommitFence,
  waitForSqliteCommitFence,
} from "../../infra/sqlite-commit-fence.js";
import {
  getOpenClawAgentDatabaseIfOpen,
  isIncognitoOpenClawAgentSqlitePath,
  resolveOpenClawAgentSqlitePath,
} from "../../state/openclaw-agent-db.js";
import { OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "../../state/openclaw-state-db-contract.js";
import { resolveStateDir } from "../state-dir.js";
import type { SessionAccessScope } from "./session-accessor.sqlite-contract.js";
import {
  readSessionRecipientAuthorityEpochInDatabase,
  sessionRecipientAuthorityFenceKey,
} from "./session-accessor.sqlite-recipient-authority.js";
import { resolveSqliteScope, toDatabaseOptions } from "./session-accessor.sqlite-scope.js";
import {
  sessionRecipientAuthorityMatches,
  type SessionRecipientAuthority,
} from "./session-recipient-authority-types.js";
import { projectionLane } from "./session-transcript-worker-resources.js";
import { withSessionHistoryWorkerDatabase } from "./session-transcript-worker-runtime.js";

const MAX_FENCED_AUTHORITY_READS = 8;

/**
 * Compare a captured authority with a fresh durable epoch. No epoch is cached
 * across checks, so a commit by another process or handle is seen by the next
 * check. An in-process mutation that was in flight when the worker read began,
 * or started before the result returned, invalidates the read and forces a reread.
 *
 * The check linearizes at the fence comparison after the worker read: the result
 * reflects every in-process commit that finished before the fence snapshot and
 * every foreign commit that finished before the worker's read transaction began.
 * Callers act on the result without another await.
 */
export async function isSessionRecipientAuthorityCurrent(
  scope: SessionAccessScope,
  authority: SessionRecipientAuthority,
): Promise<boolean> {
  const env = { ...(scope.env ?? process.env) };
  env.OPENCLAW_STATE_DIR = resolveStateDir(env);
  const resolved = resolveSqliteScope({ ...scope, env });
  const options = toDatabaseOptions(resolved);
  if (isIncognitoOpenClawAgentSqlitePath(resolveOpenClawAgentSqlitePath(options), options)) {
    // Only this thread can open a process-held store, so its native read is current.
    const database = getOpenClawAgentDatabaseIfOpen(options);
    return (
      database !== undefined &&
      sessionRecipientAuthorityMatches(
        authority,
        readSessionRecipientAuthorityEpochInDatabase(database, resolved.sessionKey),
      )
    );
  }
  const fenceKeys = [sessionRecipientAuthorityFenceKey(resolved.sessionKey)];
  for (let attempt = 0; attempt < MAX_FENCED_AUTHORITY_READS; attempt += 1) {
    const snapshot = snapshotSqliteCommitFence(fenceKeys);
    if (!snapshot) {
      await waitForSqliteCommitFence(fenceKeys, OPENCLAW_SQLITE_BUSY_TIMEOUT_MS);
      continue;
    }
    const epoch = await withSessionHistoryWorkerDatabase(
      options,
      (owner) => owner.readRecipientAuthority({ sessionKey: resolved.sessionKey, env }),
      projectionLane,
    );
    if (isSqliteCommitFenceUnchanged(snapshot)) {
      return sessionRecipientAuthorityMatches(authority, epoch);
    }
  }
  // Unknown is never current, and it is not stale either: callers must not retire work.
  throw new Error(
    `Recipient authority for session ${resolved.sessionKey} stayed under concurrent mutation`,
  );
}
