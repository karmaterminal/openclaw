import type { SessionEntry } from "../../config/sessions.js";
import { hasRestartRecoverySourceClaim } from "../../config/sessions/restart-recovery-state.js";
import type { SessionEntryTargetPatchScope } from "../../config/sessions/session-accessor.types.js";
import { readSessionEntryInWorker } from "../../config/sessions/session-entry-read-runtime.js";
import { composeSessionSourceAssertion } from "../../config/sessions/session-source-authority.js";
import {
  assertAgentRunLifecycleGenerationCurrent,
  getAgentEventLifecycleGeneration,
} from "../../infra/agent-events.js";
import { getReplyOperationSessionReader } from "../../sessions/session-controller.session-reader.js";
import type { RunReplyAgentParams } from "./agent-runner-core.js";
import {
  isDuplicateRestartRecoverySource,
  retireTerminalRestartRecoverySourceClaim,
} from "./restart-recovery-source.js";
import { readChannelSourceTurnId } from "./source-turn-id.js";

type ReplyRestartRecoveryRead = {
  sourceTurnId: string | undefined;
  entry: SessionEntry | undefined;
  /** The read's lifecycle and operator-authority check; queued admission reuses it. */
  assertCurrent: () => void;
  /** Provider redelivered a source this session already owns; the caller must not run it. */
  duplicate: boolean;
  /** Entry after a duplicate's terminal source claim was retired, when one was. */
  retiredEntry?: SessionEntry;
};

/**
 * Source-turn and active-steer consumers read the durable recovery facts fresh;
 * an unrelated turn uses the active entry it already holds.
 */
export async function readReplyRestartRecoverySource(
  params: Pick<RunReplyAgentParams, "followupRun" | "sessionCtx" | "sessionKey" | "storePath"> & {
    activeSessionEntry: SessionEntry | undefined;
    activeSteer: boolean;
    providedReplyOperation: RunReplyAgentParams["replyOperation"];
  },
): Promise<ReplyRestartRecoveryRead> {
  const { activeSessionEntry, followupRun, sessionKey, storePath } = params;
  const readGeneration = getAgentEventLifecycleGeneration();
  const assertReadCurrent = composeSessionSourceAssertion(
    [followupRun.operatorAuthority?.assertCurrent],
    (assertSource) => {
      assertAgentRunLifecycleGenerationCurrent(readGeneration);
      assertSource();
    },
  );
  const sourceTurnId = readChannelSourceTurnId(params.sessionCtx);
  let target: SessionEntryTargetPatchScope | undefined;
  const entry =
    sessionKey && storePath && (sourceTurnId || params.activeSteer)
      ? ((await readSessionEntryInWorker(
          { agentId: followupRun.run.agentId, storePath, sessionKey },
          assertReadCurrent,
          undefined,
          (admitted) => {
            target = admitted;
          },
          getReplyOperationSessionReader(params.providedReplyOperation),
        )) ?? activeSessionEntry)
      : activeSessionEntry;
  assertReadCurrent();
  if (!sourceTurnId || !isDuplicateRestartRecoverySource(entry, sourceTurnId)) {
    return { sourceTurnId, entry, assertCurrent: assertReadCurrent, duplicate: false };
  }
  // Durable source ownership identifies provider redelivery even if the run
  // became terminal before its claim cleanup committed.
  if (!sessionKey || !storePath || !hasRestartRecoverySourceClaim(entry, sourceTurnId)) {
    return { sourceTurnId, entry, assertCurrent: assertReadCurrent, duplicate: true };
  }
  if (!target) {
    throw new Error("Restart recovery retirement has no admitted session target");
  }
  const retiredEntry = await retireTerminalRestartRecoverySourceClaim({
    target,
    assertCurrent: assertReadCurrent,
    sessionId: entry.sessionId,
    sourceTurnId,
  });
  return {
    sourceTurnId,
    entry,
    assertCurrent: assertReadCurrent,
    duplicate: true,
    retiredEntry,
  };
}
