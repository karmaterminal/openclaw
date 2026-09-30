// Seed a queued continuation-work record straight into custody, bypassing the
// election's owner condition and cap, as a pre-existing record would be. Tests
// that exercise the election itself call `enqueuePendingWorkReplacing`.
import crypto from "node:crypto";
import { createContinuationRecord } from "./custody/custody-store.js";
import {
  encodeWorkState,
  workRecordDueAt,
  workToRuntime,
  type PendingContinuationWork,
} from "./work-flow-state.js";

export async function enqueuePendingWork(
  work: PendingContinuationWork,
): Promise<PendingContinuationWork | null> {
  const state = encodeWorkState(work);
  const created = await createContinuationRecord({
    recordId: crypto.randomUUID(),
    kind: "work",
    ownerSessionKey: work.sessionKey,
    ...(work.chainId ? { chainId: work.chainId } : {}),
    status: "queued",
    phase: "Queued for same-session continuation wake",
    createdAt: work.electedAt,
    dueAt: workRecordDueAt(state),
    stateJson: JSON.stringify(state),
  });
  return created.outcome === "created" ? workToRuntime(created.record, state, "queued") : null;
}
