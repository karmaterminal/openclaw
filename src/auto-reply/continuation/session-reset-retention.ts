// Continuation (karmaterminal): /new and /reset replace a session's conversational head but keep
// its continuation-elected delegate tree. A reset durably marks the runs it retains before
// upstream's reset kill, runs that kill so it skips only those marks, and after the commit settles
// each mark against the session row: the successor revision adopted the tree, the old revision
// means the reset did not commit, and a missing row orphans it. Results held while a mark was
// pending are then released (adopted, aborted) or terminalized and the run stopped (orphaned).
// Requester identity is never re-keyed.
import { randomUUID } from "node:crypto";
import {
  type ActiveContinuationReset,
  runWithActiveContinuationReset,
} from "../../agents/subagents/registry/subagent-continuation-reset-active.js";
import { markContinuationRunsRetainedByReset } from "../../agents/subagents/registry/subagent-continuation-reset-retention.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { SessionResetCleanupError } from "../reply/session-reset-cleanup.js";
import { resolveContinuationResetRetentions } from "./session-reset-retention-resolve.js";

export { resolveContinuationResetRetentions };

const log = createSubsystemLogger("continuation/reset-retention");

/** One explicit reset's retention of its session's continuation-elected delegate tree. */
export type ContinuationResetRetentionScope = {
  /** The lifecycle revision this reset commits; minted before the kill so marks can name it. */
  successorRevision: string;
  /** Durably marks the retained runs, then runs a reset kill that skips them. */
  stopSubagents: <T>(
    params: { fromRevision?: string; assertCurrent: () => void },
    kill: () => Promise<T>,
  ) => Promise<T>;
  /** Runs a later kill of the same reset so it honors the same marks. */
  runKill: <T>(kill: () => Promise<T>) => Promise<T>;
  /** Settles this reset's marks against the session row and releases or terminalizes results; never throws. */
  resolve: () => Promise<void>;
};

export function prepareContinuationResetRetention(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
  agentId: string;
  storePath: string;
}): ContinuationResetRetentionScope {
  const reset: ActiveContinuationReset = {
    resetId: randomUUID(),
    sessionKey: params.sessionKey,
    agentId: params.agentId,
  };
  const successorRevision = randomUUID();
  let markAttempted = false;
  return {
    successorRevision,
    async stopSubagents(stop, kill) {
      markAttempted = true;
      try {
        await markContinuationRunsRetainedByReset({
          cfg: params.cfg,
          reset,
          fromRevision: stop.fromRevision,
          toRevision: successorRevision,
          assertCurrent: stop.assertCurrent,
        });
      } catch (cause) {
        if (cause instanceof SessionResetCleanupError) {
          throw cause;
        }
        throw new SessionResetCleanupError(
          "Reset did not complete because its continuation delegates could not be retained. Retry /reset.",
          { cause },
        );
      }
      return await runWithActiveContinuationReset(reset, kill);
    },
    runKill: (kill) => runWithActiveContinuationReset(reset, kill),
    async resolve() {
      if (!markAttempted) {
        return;
      }
      try {
        await resolveContinuationResetRetentions({
          cfg: params.cfg,
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          storePath: params.storePath,
          resetId: reset.resetId,
        });
      } catch (error) {
        // Never mask the reset's own outcome. The marks stay pending and their results held
        // until the next Gateway boot resolves them.
        log.warn(
          `[continuation:reset-retention] reset ${reset.resetId} for ${params.sessionKey} left unresolved until the next Gateway boot: ${String(error)}`,
        );
      }
    },
  };
}
