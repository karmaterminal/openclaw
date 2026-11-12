// Explicit in-place recovery of one restart-tombstoned session.
// Keeps the session ID and transcript, adds no reset boundary, and starts no turn.
import { randomUUID } from "node:crypto";
import { safeParseJsonRecord } from "@openclaw/normalization-core/json-coercion";
import { ErrorCodes } from "../../packages/gateway-protocol/src/gateway-error-codes.js";
import { errorShape } from "../../packages/gateway-protocol/src/schema/error-codes.js";
import type { ErrorShape } from "../../packages/gateway-protocol/src/schema/frames.js";
import { rewriteDoctorSessionEntries } from "../commands/doctor/shared/session-entry-rewrite.js";
import {
  inspectLegacyRestartTombstone,
  migrateLegacySessionEntryState,
} from "../commands/doctor/shared/session-entry-shape.js";
import { getRuntimeConfig } from "../config/io.js";
import { getSessionKysely } from "../config/sessions/session-accessor.sqlite-scope-helpers.js";
import {
  resolveSqliteScope,
  toDatabaseOptions,
} from "../config/sessions/session-accessor.sqlite-scope.js";
import { SESSION_LIFECYCLE_CHANGED_ERROR_REASON } from "../config/sessions/session-work-start.js";
import { withEngineStoreAdmission } from "../infra/database-engine/admission-scope.js";
import { formatErrorMessage } from "../infra/errors.js";
import { executeSqliteQuerySync } from "../infra/kysely-sync.js";
import { createVerifiedSqliteSnapshot } from "../infra/sqlite-snapshot.js";
import { isSessionControllerWorkActive } from "../sessions/session-controller.lifecycle.js";
import { withOpenClawAgentDatabaseReadOnly } from "../state/openclaw-agent-db-readonly.js";
import { resolveOpenClawAgentSqlitePath } from "../state/openclaw-agent-db.paths.js";
import { resolveSessionResetTarget } from "./session-reset-target.js";

export type SessionTombstoneRecoveryResult =
  | {
      ok: true;
      key: string;
      agentId: string;
      sessionId: string;
      recovered: boolean;
      backupPath?: string;
    }
  | { ok: false; error: ErrorShape };

class RecoveryRefusal extends Error {
  constructor(readonly error: ErrorShape) {
    super(error.message);
  }
}

type RecoveryScope = { agentId: string; storePath: string; env?: NodeJS.ProcessEnv };

const databaseOptions = (scope: RecoveryScope) =>
  toDatabaseOptions(resolveSqliteScope({ ...scope, sessionKey: "" }));

function readRawSessionEntry(
  scope: RecoveryScope,
  sessionKey: string,
): Record<string, unknown> | undefined {
  const read = withEngineStoreAdmission(() =>
    withOpenClawAgentDatabaseReadOnly(
      (database) =>
        executeSqliteQuerySync(
          database.db,
          getSessionKysely(database.db)
            .selectFrom("session_nodes")
            .select("entry_json")
            .where("session_key", "=", sessionKey),
        ).rows[0]?.entry_json,
      databaseOptions(scope),
    ),
  );
  return read.found && typeof read.value === "string" ? safeParseJsonRecord(read.value) : undefined;
}

/**
 * Lifts one restart tombstone in place under caller-held operator authority.
 * The raw row is inspected again inside the write commit, so live execution
 * owners and concurrent writers are checked at the point of effect.
 */
export async function recoverGatewaySessionTombstone(params: {
  key: string;
  agentId?: string;
  expectedSessionId: string;
  env?: NodeJS.ProcessEnv;
  assertCurrent: () => void;
}): Promise<SessionTombstoneRecoveryResult> {
  const resolved = await resolveSessionResetTarget(getRuntimeConfig(), params);
  if (!resolved.ok) {
    return resolved;
  }
  const { agentId, canonicalKey: sessionKey } = resolved.target;
  const scope = {
    agentId,
    storePath: resolved.storePath,
    ...(params.env ? { env: params.env } : {}),
  };
  const refuse = (code: Parameters<typeof errorShape>[0], message: string, reason?: string) =>
    new RecoveryRefusal(errorShape(code, message, reason ? { details: { reason } } : undefined));
  /** Returns whether the row still carries a tombstone this call may lift. */
  const decide = (entry: Record<string, unknown> | undefined): boolean => {
    if (!entry) {
      throw refuse(ErrorCodes.INVALID_REQUEST, `unknown session: ${params.key}`);
    }
    if (entry.sessionId !== params.expectedSessionId) {
      throw refuse(
        ErrorCodes.INVALID_REQUEST,
        `Session ${params.key} changed before recovery. Re-read it before retrying.`,
        SESSION_LIFECYCLE_CHANGED_ERROR_REASON,
      );
    }
    const tombstone = inspectLegacyRestartTombstone(entry);
    if (!tombstone) {
      return false;
    }
    if (!tombstone.retire) {
      throw refuse(ErrorCodes.INVALID_REQUEST, tombstone.warning, "restart-custody-retained");
    }
    if (isSessionControllerWorkActive(scope.storePath, [sessionKey, params.expectedSessionId])) {
      throw refuse(
        ErrorCodes.UNAVAILABLE,
        `Session ${params.key} has active work; recover it after that work settles.`,
        "active-work",
      );
    }
    return true;
  };
  const success = (recovered: boolean, backupPath?: string) => ({
    ok: true as const,
    key: sessionKey,
    agentId,
    sessionId: params.expectedSessionId,
    recovered,
    ...(backupPath ? { backupPath } : {}),
  });
  try {
    params.assertCurrent();
    const original = readRawSessionEntry(scope, sessionKey);
    if (!decide(original)) {
      return success(false);
    }
    // Doctor's pre-repair backup: a verified copy of the store holding the untouched row.
    const sourcePath = resolveOpenClawAgentSqlitePath(databaseOptions(scope));
    const backupPath = `${sourcePath}.pre-session-recover-${randomUUID()}.bak`;
    try {
      await createVerifiedSqliteSnapshot({
        sourcePath,
        targetPath: backupPath,
        preserveRowIds: true,
        beforePublish: params.assertCurrent,
      });
    } catch (error) {
      throw refuse(
        ErrorCodes.UNAVAILABLE,
        `Session recovery backup failed; nothing was changed: ${formatErrorMessage(error)}`,
      );
    }
    const unchanged = JSON.stringify(original);
    const rewritten = rewriteDoctorSessionEntries({
      scope,
      sessionKeys: [sessionKey],
      assertCurrent: params.assertCurrent,
      rawTransform: (entry, _sessionKey, updatedAt) => {
        // The backup must hold exactly the row this commit replaces.
        if (JSON.stringify(entry) !== unchanged || !decide(entry)) {
          throw refuse(
            ErrorCodes.INVALID_REQUEST,
            `Session ${params.key} changed during recovery. Re-read it before retrying.`,
            SESSION_LIFECYCLE_CHANGED_ERROR_REASON,
          );
        }
        return migrateLegacySessionEntryState(entry, updatedAt, { operatorRecovery: true });
      },
    });
    if (rewritten !== 1) {
      throw refuse(ErrorCodes.INVALID_REQUEST, `unknown session: ${params.key}`);
    }
    return success(true, backupPath);
  } catch (error) {
    if (error instanceof RecoveryRefusal) {
      return { ok: false, error: error.error };
    }
    throw error;
  }
}
