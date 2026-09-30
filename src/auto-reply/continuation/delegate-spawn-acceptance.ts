import { markPendingDelegateSpawnAccepted } from "./delegate-store.js";
import type { PendingContinuationDelegate } from "./types.js";

/**
 * Commit an accepted spawn as the delegate's handoff to `subagent_runs` (RFC
 * §5.4.4). If the commit cannot land, the accepted child is rolled back so no
 * child runs without the custody record that owns it.
 */
export async function commitPendingDelegateSpawnAcceptance(
  delegate: Pick<
    PendingContinuationDelegate,
    "flowId" | "expectedRevision" | "task" | "spawnAttempt"
  >,
  childSessionKey: string,
  requireWriteSuccess: boolean,
  rollbackAccepted?: () => Promise<void>,
  childRunId?: string,
): Promise<void> {
  try {
    const committed = await markPendingDelegateSpawnAccepted(delegate, childSessionKey, {
      ...(requireWriteSuccess ? { requireWriteSuccess: true } : {}),
      ...(childRunId ? { childRunId } : {}),
    });
    if (!committed) {
      throw new Error("Continuation delegate source acceptance became stale.");
    }
  } catch (error) {
    await rollbackAccepted?.();
    throw error;
  }
}
