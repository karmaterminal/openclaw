// Sweeper reconciliation for accepted spawn rollbacks.
import type { callGateway } from "../../../gateway/call.js";
import { reconcileRetiredSubagentCancellation } from "../completion/subagent-completion-admission.store.js";
import { terminateAcceptedCollectorRun } from "../spawn/subagent-spawn-cleanup.js";
import { hasPendingSubagentRetirementPublication } from "./subagent-registry-memory.js";
import {
  isSubagentSpawnAcceptanceHeld,
  isSubagentSpawnArmed,
  resolveArmedSpawnRollback,
  takeDeferredArmedSubagentResume,
} from "./subagent-registry-spawn-acceptance.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { isSameSubagentRunOwner } from "./subagent-run-generation.js";

type AcceptedSpawnRollback = NonNullable<SubagentRunRecord["acceptedSpawnRollback"]>;

// Registry rows are frozen and every write publishes a new row object, so custody is
// compared by its durable fields rather than by object identity.
function isSameAcceptedSpawnRollback(
  current: AcceptedSpawnRollback | undefined,
  expected: AcceptedSpawnRollback,
): boolean {
  return (
    current !== undefined &&
    current.gatewayRunId === expected.gatewayRunId &&
    current.requestedAt === expected.requestedAt &&
    current.reason === expected.reason &&
    current.expectedSessionId === expected.expectedSessionId &&
    current.expectedLifecycleRevision === expected.expectedLifecycleRevision
  );
}

export async function reconcileAcceptedSpawnRollback(params: {
  runId: string;
  entry: SubagentRunRecord;
  runs: Map<string, SubagentRunRecord>;
  callGateway: typeof callGateway;
  recordAcceptedSubagentSpawnRollback: (params: {
    runId: string;
    childSessionKey: string;
    gatewayRunId: string;
    reason: string;
    expectedSessionId?: string;
    expectedLifecycleRevision?: string;
  }) => Promise<
    | { status: "persisted" }
    | { status: "pending-persistence"; error: unknown }
    | { status: "rejected" }
  >;
  releaseAcceptedSubagentSpawnRollback: (params: {
    runId: string;
    childSessionKey: string;
    gatewayRunId: string;
  }) => Promise<boolean>;
  rollbackSubagentRunRegistration: (params: {
    runId: string;
    childSessionKey: string;
  }) => Promise<boolean>;
  settleFailedQueuedSubagentLaunch: (runId: string, error: string) => Promise<boolean>;
  warn: (message: string, meta?: Record<string, unknown>) => void;
}): Promise<boolean> {
  // An unheld armed row is adopted as if it carried custody (H1 v4): the record
  // below converts armed -> custody; termination runs even when that write fails.
  const adopted = params.entry.acceptedSpawnRollback ?? resolveArmedSpawnRollback(params.entry);
  if (!adopted || !isSameSubagentRunOwner(params.runs.get(params.runId), params.entry)) {
    return false;
  }
  if (!params.entry.acceptedSpawnRollback) {
    // Adoption is the rollback of an unheld arm: a resume it deferred never replays.
    takeDeferredArmedSubagentResume(params.entry);
  }
  let rollback = adopted;
  const record = await params.recordAcceptedSubagentSpawnRollback({
    runId: params.runId,
    childSessionKey: params.entry.childSessionKey,
    gatewayRunId: rollback.gatewayRunId,
    reason: rollback.reason,
    expectedSessionId: rollback.expectedSessionId,
    expectedLifecycleRevision: rollback.expectedLifecycleRevision,
  });
  if (record.status === "pending-persistence") {
    params.warn("failed to persist accepted spawn rollback owner", {
      runId: params.runId,
      childSessionKey: params.entry.childSessionKey,
      error: record.error,
    });
  }
  // A converted arm now carries its own custody fields; compare against those.
  const recorded = params.runs.get(params.runId);
  if (
    !params.entry.acceptedSpawnRollback &&
    recorded &&
    isSameSubagentRunOwner(recorded, params.entry) &&
    recorded.acceptedSpawnRollback?.gatewayRunId === adopted.gatewayRunId
  ) {
    rollback = recorded.acceptedSpawnRollback;
  }
  const terminated = await terminateAcceptedCollectorRun({
    childSessionKey: params.entry.childSessionKey,
    gatewayRunId: rollback.gatewayRunId,
    expectedSessionId: rollback.expectedSessionId,
    expectedLifecycleRevision: rollback.expectedLifecycleRevision,
    callGateway: params.callGateway,
    retry: false,
  });
  const current = params.runs.get(params.runId);
  if (
    !terminated ||
    !current ||
    !isSameSubagentRunOwner(current, params.entry) ||
    !(
      isSameAcceptedSpawnRollback(current.acceptedSpawnRollback, rollback) ||
      // The conversion write failed (refused or fenced): the row is still armed.
      (!current.acceptedSpawnRollback &&
        resolveArmedSpawnRollback(current)?.gatewayRunId === adopted.gatewayRunId)
    ) ||
    // A Stop that began publishing during termination decides the outcome first;
    // settlement and release are idempotent and wait for a later sweep.
    hasPendingSubagentRetirementPublication(current)
  ) {
    return true;
  }
  // v3: a fenced (uncertain) or refused write must not throw out of the sweep; the
  // row stays fail-closed (armed or custody) and the next pass retries the abort.
  try {
    if (current.collect) {
      await params.settleFailedQueuedSubagentLaunch(params.runId, rollback.reason);
      // The accepted child is proven stopped, so this custody is discharged. Keeping
      // it would terminate the same gateway run again on every sweep.
      await params.releaseAcceptedSubagentSpawnRollback({
        runId: params.runId,
        childSessionKey: current.childSessionKey,
        gatewayRunId: rollback.gatewayRunId,
      });
    } else {
      await params.rollbackSubagentRunRegistration({
        runId: params.runId,
        childSessionKey: current.childSessionKey,
      });
    }
  } catch (error) {
    params.warn("accepted spawn rollback reconcile deferred", {
      runId: params.runId,
      childSessionKey: current.childSessionKey,
      error,
    });
  }
  return true;
}

export function isAcceptedSpawnCustodyRow(entry: SubagentRunRecord): boolean {
  return Boolean(entry.spawnAcceptance || entry.launchDispatch || entry.acceptedSpawnRollback);
}

/**
 * H1 v4 §3.3a: the sweeper decides armed and custody rows here, right after its
 * owner checks and before the retired-authority branch (which would otherwise
 * `continue` them forever). Stop precedence is kept in the original order:
 * (a) a provisional kill reconciles first, (b) the owner is refreshed, (c) a Stop
 * still publishing blocks adoption, (d) only custody or an unheld arm is adopted.
 * Returns the row to adopt, or undefined; the caller always `continue`s.
 */
export async function decideAcceptedSpawnCustodyRow(params: {
  runId: string;
  entry: SubagentRunRecord;
  runs: Map<string, SubagentRunRecord>;
  now: number;
}): Promise<SubagentRunRecord | undefined> {
  if (
    params.entry.killReconciliation &&
    (await reconcileRetiredSubagentCancellation(params.entry, params.now)) === false
  ) {
    return undefined;
  }
  const entry = params.runs.get(params.runId);
  if (!entry || !isSameSubagentRunOwner(entry, params.entry)) {
    return undefined;
  }
  if (hasPendingSubagentRetirementPublication(entry)) {
    return undefined;
  }
  return entry.acceptedSpawnRollback ||
    (isSubagentSpawnArmed(entry) && !isSubagentSpawnAcceptanceHeld(entry))
    ? entry
    : undefined;
}

export function selectNextAcceptedSpawnRollbackCandidate<T extends { runId: string }>(
  candidates: readonly T[],
  previousRunId?: string,
): T | undefined {
  const previousIndex = candidates.findIndex((candidate) => candidate.runId === previousRunId);
  return candidates.length > 0 ? candidates[(previousIndex + 1) % candidates.length] : undefined;
}
