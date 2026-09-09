import type { SessionEntry } from "../../config/sessions/types.js";
import { withContinuationOwner } from "../continuation/system-event-ownership.js";

export function assertPostCompactionSourceLifecycle(
  entry: { sourceSessionId?: string; sourceLifecycleRevision?: string },
  current: SessionEntry | undefined,
): asserts current is SessionEntry {
  if (
    !entry.sourceSessionId ||
    current?.sessionId !== entry.sourceSessionId ||
    current.lifecycleRevision !== entry.sourceLifecycleRevision
  ) {
    throw new Error("Continuation delegate source session lifecycle changed.");
  }
}

export function createPostCompactionSourceGuard(params: {
  ownerAgentId: string;
  sourceEntry: SessionEntry | undefined;
  loadCurrent: () => SessionEntry | undefined;
}) {
  if (!params.sourceEntry?.sessionId) {
    throw new Error("Post-compaction delegate source session owner is unavailable.");
  }
  const expected = {
    sourceSessionId: params.sourceEntry.sessionId,
    sourceLifecycleRevision: params.sourceEntry.lifecycleRevision,
  };
  const assertCurrent = () => assertPostCompactionSourceLifecycle(expected, params.loadCurrent());
  return {
    ...expected,
    assertCurrent,
    eventOptions: <T extends object>(options: T): T => {
      assertCurrent();
      return withContinuationOwner(options, params.ownerAgentId);
    },
  };
}
