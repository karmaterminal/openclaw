// Armed-registration writes (H1, absorb 14fe10d0): the final acceptance owner's
// disarm and the collector's pre-dispatch launch marker. Both are single FIFO
// registry mutations; see subagent-registry-spawn-acceptance.ts for the hold.
import { hasSqliteWorkerOutcomeUnknown } from "../../../infra/sqlite-worker-contract.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import {
  assertSubagentRegistryWriteOutcomeKnown,
  mutateSubagentRuns,
  SubagentRegistryWriteError,
} from "./subagent-registry-persistence.js";
import type { SubagentRegistrationIdentity } from "./subagent-registry-run-launch.js";
import {
  holdSubagentSpawnAcceptance,
  markSubagentSpawnDisarmUncertain,
  releaseSubagentSpawnAcceptanceHold,
} from "./subagent-registry-spawn-acceptance.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

const log = createSubsystemLogger("agents/subagent-registry");

/**
 * Only a failure that provably never reached commit is `refused`. Any commit-granted,
 * unknown, or committed-but-unpublished outcome is `uncertain`.
 */
export function classifySubagentDisarmFailure(error: unknown): "refused" | "uncertain" {
  if (error instanceof SubagentRegistryWriteError) {
    return error.outcome === "not-committed" ? "refused" : "uncertain";
  }
  return hasSqliteWorkerOutcomeUnknown(error) ? "uncertain" : "refused";
}

export function matchesRegistrationIdentity(
  entry: SubagentRunRecord,
  expected: SubagentRegistrationIdentity | undefined,
): boolean {
  return (
    expected === undefined ||
    (entry.runId === expected.runId &&
      entry.childSessionKey === expected.childSessionKey &&
      entry.generation === expected.generation &&
      entry.createdAt === expected.createdAt)
  );
}

/**
 * Disarms a native acceptance intent at its final acceptance owner. Only a write
 * that provably never reached commit is `refused` (the arm survives on disk, so the
 * caller may roll back). A commit-granted, unknown or unpublished outcome is
 * `uncertain`: the caller must converge forward and never roll back, the row stays
 * held in-process, and the next process restore decides by the durable row.
 */
export async function confirmSubagentSpawnAcceptanceWrite(
  runs: Map<string, SubagentRunRecord>,
  params: {
    runId: string;
    childSessionKey: string;
    expectedRegistration?: SubagentRegistrationIdentity;
  },
): Promise<"confirmed" | "refused" | "uncertain"> {
  const runId = params.runId.trim();
  const context = captureOpenClawStateWorkerContext();
  const selected = runs.get(runId);
  try {
    // Another write's unknown outcome fences this run before this mutation queues;
    // this write then never reached commit, so it is refused, not uncertain.
    assertSubagentRegistryWriteOutcomeKnown([runId], context.admission);
  } catch (error) {
    log.warn("subagent acceptance confirmation refused by an unknown registry write", {
      runId,
      error,
    });
    return "refused";
  }
  try {
    const confirmed = await mutateSubagentRuns(
      [runId],
      (rows) => {
        const entry = rows.get(runId);
        if (
          !entry ||
          entry.childSessionKey !== params.childSessionKey ||
          !matchesRegistrationIdentity(entry, params.expectedRegistration) ||
          entry.acceptedSpawnRollback
        ) {
          return { value: false };
        }
        if (!entry.spawnAcceptance) {
          return { value: true };
        }
        const next = { ...entry };
        delete next.spawnAcceptance;
        return { value: true, postimages: new Map([[runId, next]]) };
      },
      {
        runs,
        context,
        onPublished: (postimages) => {
          const published = postimages.get(runId);
          if (published) {
            releaseSubagentSpawnAcceptanceHold(published);
          }
        },
      },
    );
    if (confirmed && selected) {
      releaseSubagentSpawnAcceptanceHold(selected);
    }
    return confirmed ? "confirmed" : "refused";
  } catch (error) {
    if (classifySubagentDisarmFailure(error) === "refused") {
      return "refused";
    }
    log.warn("subagent acceptance confirmation outcome is unknown", { runId, error });
    const current = selected ?? runs.get(runId);
    if (current) {
      markSubagentSpawnDisarmUncertain(current);
    }
    return "uncertain";
  }
}

/** Durable collector launch marker, written by one mutation before dispatch. */
export async function armSubagentLaunchDispatchWrite(
  runs: Map<string, SubagentRunRecord>,
  params: { runId: string; childSessionKey: string; idempotencyKey: string },
): Promise<boolean> {
  const runId = params.runId.trim();
  const idempotencyKey = params.idempotencyKey.trim();
  if (!runId || !idempotencyKey) {
    return false;
  }
  return mutateSubagentRuns(
    [runId],
    (rows) => {
      const entry = rows.get(runId);
      if (
        !entry ||
        !entry.collect ||
        entry.childSessionKey !== params.childSessionKey ||
        entry.execution.status !== "queued"
      ) {
        return { value: false };
      }
      if (entry.launchDispatch?.idempotencyKey === idempotencyKey) {
        return { value: true };
      }
      return {
        value: true,
        postimages: new Map([
          [runId, { ...entry, launchDispatch: { idempotencyKey, dispatchedAt: Date.now() } }],
        ]),
      };
    },
    {
      runs,
      onPublished: (postimages) => {
        const published = postimages.get(runId);
        if (published) {
          holdSubagentSpawnAcceptance(published);
        }
      },
    },
  );
}
