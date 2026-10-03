// Admission evidence for a claimed continuation delegate (RFC
// docs/design/continue-work-signal-v2.md §5.4.4). The spawn owner uses each
// attempt's precomputed child run ID verbatim as the Gateway run ID, so a
// `subagent_runs` row under a recorded child run ID proves the Gateway admitted
// that attempt. Only a row whose requester is the delegate's owner is custody;
// a matching run ID under another requester is a collision and never adopted.
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { prepareSubagentRunsByRunIds } from "../../agents/subagents/registry/subagent-registry.js";
import type { PendingContinuationDelegate } from "./types.js";

export type DelegateAdmissionEvidence =
  | { kind: "admitted"; runId: string; childSessionKey: string }
  | { kind: "collision"; runId: string }
  | { kind: "none" };

const REGISTRY_READ_ATTEMPTS = 8;

/** Read the registry under every recorded child run ID; throws when the read cannot settle. */
export async function readDelegateAdmissionEvidence(params: {
  runIds: readonly string[];
  requesterSessionKey: string;
}): Promise<DelegateAdmissionEvidence> {
  const runIds = [...new Set(params.runIds)];
  if (runIds.length === 0) {
    return { kind: "none" };
  }
  for (let attempt = 0; attempt < REGISTRY_READ_ATTEMPTS; attempt += 1) {
    // A prepared read can be superseded by a concurrent registry write before
    // it is consumed; re-prepare, bounded, as the spawn owner does.
    const prepared = await prepareSubagentRunsByRunIds(runIds);
    const read = prepared.consume((runs): DelegateAdmissionEvidence => {
      let collision: string | undefined;
      for (const runId of runIds) {
        const run = runs.get(runId);
        if (!run) {
          continue;
        }
        if (run.requesterSessionKey === params.requesterSessionKey) {
          return { kind: "admitted", runId, childSessionKey: run.childSessionKey };
        }
        collision ??= runId;
      }
      return collision ? { kind: "collision", runId: collision } : { kind: "none" };
    });
    if (read.ready) {
      return read.value;
    }
    await yieldToEventLoop();
  }
  throw new Error("subagent registry read for continuation admission evidence did not settle");
}

/** A delegate the dispatch must settle, with the admission evidence found for it. */
export type ClaimedDelegate = {
  delegate: PendingContinuationDelegate;
  /** Set when an earlier attempt, or an unresolved claim, has registry evidence. */
  evidence?: DelegateAdmissionEvidence;
  /** A claim a dead dispatch left behind: never spawned again (Q3). */
  unresolved?: true;
};

/**
 * Decide every claim that may already have a child (RFC §5.4.4): an
 * unresolved claim, and a requeued record whose earlier attempt the registry
 * may know ("Before a requeued record is claimed again"). Admitted claims are
 * handed off, unresolved or colliding ones interrupted, and the rest spawn. A
 * claim whose evidence cannot be read is left for the next recovery pass.
 */
export async function partitionDelegateClaimsByAdmission(params: {
  unresolvedClaims: readonly PendingContinuationDelegate[];
  claimed: readonly PendingContinuationDelegate[];
  ownerSessionKey: string;
  onUnavailable: (delegate: PendingContinuationDelegate, error: unknown) => void;
}): Promise<{
  accepted: ClaimedDelegate[];
  interrupted: ClaimedDelegate[];
  pending: PendingContinuationDelegate[];
}> {
  const accepted: ClaimedDelegate[] = [];
  const interrupted: ClaimedDelegate[] = [];
  const pending: PendingContinuationDelegate[] = [];
  const claims: ClaimedDelegate[] = [
    ...params.unresolvedClaims.map((delegate) => ({ delegate, unresolved: true as const })),
    ...params.claimed.map((delegate) => ({ delegate })),
  ];
  for (const claim of claims) {
    const earlierRunIds = claim.unresolved
      ? claim.delegate.recordedChildRunIds
      : claim.delegate.recordedChildRunIds?.filter(
          (runId) => runId !== claim.delegate.spawnAttempt?.childRunId,
        );
    let evidence: DelegateAdmissionEvidence;
    try {
      evidence = await readDelegateAdmissionEvidence({
        runIds: earlierRunIds ?? [],
        requesterSessionKey: params.ownerSessionKey,
      });
    } catch (error) {
      params.onUnavailable(claim.delegate, error);
      continue;
    }
    if (evidence.kind === "admitted") {
      accepted.push({ ...claim, evidence });
    } else if (claim.unresolved || evidence.kind === "collision") {
      interrupted.push({ ...claim, evidence });
    } else {
      pending.push(claim.delegate);
    }
  }
  return { accepted, interrupted, pending };
}
