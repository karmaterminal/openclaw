import { isIncognitoOpenClawAgentSqlitePath } from "../../state/openclaw-agent-db.js";
import { resolveOpenClawAgentSqlitePath } from "../../state/openclaw-agent-db.paths.js";
import { resolveStateDir } from "../state-dir.js";
import type { ExactSessionEntryReadOnlyResult } from "./session-accessor.sqlite-entry-availability.js";
import { loadSessionEntryReadOnlyInScope } from "./session-accessor.sqlite-exact-read.js";
import {
  resolveSqliteScope,
  resolveSqliteSessionKey,
  toDatabaseOptions,
} from "./session-accessor.sqlite-scope.js";
import type { SessionAccessScope } from "./session-accessor.types.js";
import {
  captureIncognitoSessionSource,
  withIncognitoSessionEntry,
} from "./session-incognito-binding.js";
import { resolveSessionStorePathForScope } from "./session-store-path.js";
import { withSessionHistoryWorkerDatabase } from "./session-transcript-worker-runtime.js";
import type { SessionRowPresenceWorkerInput } from "./session-transcript-worker.types.js";

/** Capture the exact metadata owner before initial-writer admission can wait. */
export function prepareSessionEntryPresenceRead(input: SessionAccessScope): Readonly<{
  sessionKey: string;
  storePath: string;
  read: () => Promise<boolean>;
}> {
  const binding = captureIncognitoSessionSource(input);
  if (binding) {
    const owner = "kind" in binding ? binding : binding.actor;
    const storePath = owner.path;
    const sessionKey = resolveSqliteSessionKey(input.sessionKey, owner.agentId);
    return {
      sessionKey,
      storePath,
      read: () =>
        withIncognitoSessionEntry(
          binding,
          sessionKey,
          () => {},
          async (entry) => Boolean(entry),
        ),
    };
  }
  const env = { ...(input.env ?? process.env) };
  env.OPENCLAW_STATE_DIR = resolveStateDir(env);
  const storePath = resolveSessionStorePathForScope({ ...input, env });
  const resolved = resolveSqliteScope({ ...input, storePath, env });
  const options = toDatabaseOptions(resolved);
  const databasePath = resolveOpenClawAgentSqlitePath(options);
  const scope: SessionRowPresenceWorkerInput["scope"] = {
    agentId: resolved.agentId,
    sessionKey: resolved.sessionKey,
    storePath: databasePath,
    databaseAgentId: options.agentId,
    env,
  };
  const incognito = isIncognitoOpenClawAgentSqlitePath(databasePath, options);
  return {
    sessionKey: resolved.sessionKey,
    storePath,
    read: incognito
      ? async () => loadSessionEntryReadOnlyInScope({ ...scope, projection: "list" }) !== undefined
      : async () =>
          await withSessionHistoryWorkerDatabase(
            options,
            async (owner) => await owner.readEntryPresence(scope),
          ),
  };
}

/**
 * Worker-thread form of the exact-key probe: an unreadable row stays distinct from an
 * absent one, which the logical entry read cannot report. Incognito rows live with their
 * in-process actor, not the history worker, so they are refused rather than guessed.
 */
export async function readExactSessionEntryAvailabilityInWorker(
  input: SessionAccessScope,
): Promise<ExactSessionEntryReadOnlyResult> {
  const env = { ...(input.env ?? process.env) };
  env.OPENCLAW_STATE_DIR = resolveStateDir(env);
  const scope = { ...input, env };
  const options = toDatabaseOptions(resolveSqliteScope(scope));
  if (
    captureIncognitoSessionSource(scope) ||
    isIncognitoOpenClawAgentSqlitePath(resolveOpenClawAgentSqlitePath(options), options)
  ) {
    throw new Error("Incognito session rows have no history-worker availability read");
  }
  return await withSessionHistoryWorkerDatabase(
    options,
    async (owner) => await owner.readEntryAvailability({ scope }),
  );
}
