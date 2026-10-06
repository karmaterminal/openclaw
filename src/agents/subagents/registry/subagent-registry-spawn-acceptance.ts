// Armed registration (H1, absorb 14fe10d0): an accepted child's registry row carries a
// durable acceptance intent (`spawnAcceptance` for native spawns, `launchDispatch`
// for a dispatched collector launch) until its final acceptance owner disarms it.
// While armed, the row is fenced from generic resume/restore and its delivery is
// gated. The in-process launch owner holds the arm; an armed row that nobody holds
// (after a restart, or after its owner let go) is failed closed by the sweeper.
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { getSubagentRunRuntimeKey } from "./subagent-run-generation.js";

type ArmedResumeSource = "live" | "restore";

// Holds are keyed by the host execution incarnation, which survives FIFO postimage
// replacement but not a process restart, so every restored arm starts unheld.
const held = new WeakSet<object>();
// A disarm whose commit outcome is unknown keeps the row held for the life of the
// process: neither the accept branch nor the rollback branch may be acted on.
const uncertainDisarm = new WeakSet<object>();
const deferredResumes = new WeakMap<object, ArmedResumeSource>();

type ArmedRow = Pick<SubagentRunRecord, "spawnAcceptance" | "launchDispatch">;

export function isSubagentSpawnArmed(entry: ArmedRow | undefined): boolean {
  return Boolean(entry?.spawnAcceptance || entry?.launchDispatch);
}

/** Holds an armed row for its in-process launch owner; unarmed rows are ignored. */
export function holdSubagentSpawnAcceptance(entry: SubagentRunRecord): void {
  if (isSubagentSpawnArmed(entry)) {
    held.add(getSubagentRunRuntimeKey(entry));
  }
}

export function releaseSubagentSpawnAcceptanceHold(entry: SubagentRunRecord | undefined): void {
  if (entry) {
    held.delete(getSubagentRunRuntimeKey(entry));
  }
}

/** Uncertain disarms stay held: the sweeper must not abort a child that may be accepted. */
export function isSubagentSpawnAcceptanceHeld(entry: SubagentRunRecord): boolean {
  const key = getSubagentRunRuntimeKey(entry);
  return held.has(key) || uncertainDisarm.has(key);
}

export function markSubagentSpawnDisarmUncertain(entry: SubagentRunRecord): void {
  const key = getSubagentRunRuntimeKey(entry);
  uncertainDisarm.add(key);
  held.delete(key);
}

export function isSubagentSpawnDisarmUncertain(entry: SubagentRunRecord): boolean {
  return uncertainDisarm.has(getSubagentRunRuntimeKey(entry));
}

/** Records the first deferred resume source; confirmation replays it exactly once. */
export function deferArmedSubagentResume(
  entry: SubagentRunRecord,
  source: ArmedResumeSource,
): void {
  const key = getSubagentRunRuntimeKey(entry);
  if (!deferredResumes.has(key)) {
    deferredResumes.set(key, source);
  }
}

export function takeDeferredArmedSubagentResume(
  entry: SubagentRunRecord,
): ArmedResumeSource | undefined {
  const key = getSubagentRunRuntimeKey(entry);
  const source = deferredResumes.get(key);
  deferredResumes.delete(key);
  return source;
}

/** Custody shape the sweeper adopts for an unheld armed row. */
export function resolveArmedSpawnRollback(
  entry: SubagentRunRecord,
): NonNullable<SubagentRunRecord["acceptedSpawnRollback"]> | undefined {
  if (entry.spawnAcceptance) {
    return {
      gatewayRunId: entry.spawnAcceptance.gatewayRunId,
      requestedAt: entry.spawnAcceptance.armedAt,
      reason: "Accepted subagent spawn was never confirmed by its acceptance owner.",
      expectedSessionId: entry.spawnAcceptance.expectedSessionId,
      expectedLifecycleRevision: entry.spawnAcceptance.expectedLifecycleRevision,
    };
  }
  if (entry.launchDispatch) {
    return {
      gatewayRunId: entry.launchDispatch.idempotencyKey,
      requestedAt: entry.launchDispatch.dispatchedAt,
      reason: "Collector launch was dispatched but never started.",
      expectedSessionId: entry.childSessionIdentity?.sessionId,
      expectedLifecycleRevision: entry.childSessionIdentity?.lifecycleRevision,
    };
  }
  return undefined;
}
