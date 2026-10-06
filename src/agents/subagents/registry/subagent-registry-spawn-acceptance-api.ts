// H1 armed-registration disarm and release entry points of the registry facade (split
// from subagent-registry.ts for its line budget). Each disarm replays the resume the F2
// fence deferred while the row was armed exactly once; a rollback drops it.
import type { GatewayContextResolver } from "../../../gateway/server-methods/types.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import type { SubagentRegistrationIdentity } from "./subagent-registry-run-launch.js";
import type { createSubagentRunManager } from "./subagent-registry-run-manager.js";
import {
  isSubagentSpawnArmed,
  markSubagentSpawnDisarmUncertain,
  releaseSubagentSpawnAcceptanceHold,
  takeDeferredArmedSubagentResume,
} from "./subagent-registry-spawn-acceptance.js";
import { isSameSubagentRunOwner } from "./subagent-run-generation.js";

type SubagentRunManager = ReturnType<typeof createSubagentRunManager>;

export function createSubagentSpawnAcceptanceApi(deps: {
  manager: Pick<SubagentRunManager, "confirmSubagentSpawnAcceptance" | "startQueuedSubagentRun">;
  resume: (runId: string, source: "live" | "restore") => void;
  scheduleSweep: (params?: { delayMs?: number }) => void;
}) {
  /**
   * Final acceptance owner disarms the native acceptance intent. On confirmation the
   * hold is released and any resume deferred by the F2 fence (or an already-ended
   * child's delivery) is replayed exactly once.
   */
  async function confirmSubagentSpawnAcceptance(params: {
    runId: string;
    childSessionKey: string;
    expectedRegistration?: SubagentRegistrationIdentity;
  }): Promise<"confirmed" | "refused" | "uncertain"> {
    const outcome = await deps.manager.confirmSubagentSpawnAcceptance(params);
    if (outcome === "confirmed") {
      const current = subagentRuns.get(params.runId.trim());
      if (current && !isSubagentSpawnArmed(current)) {
        const deferred = takeDeferredArmedSubagentResume(current);
        if (deferred || typeof current.execution.endedAt === "number") {
          deps.resume(current.runId, deferred ?? "live");
        }
      }
    }
    return outcome;
  }

  /** A collector start write with an unknown outcome keeps its launch held until restart. */
  function markSubagentLaunchDispatchUncertain(runId: string): void {
    const current = subagentRuns.get(runId.trim());
    const owner =
      current ??
      [...subagentRuns.values()].find((candidate) => candidate.swarmRunId === runId.trim());
    if (owner) {
      markSubagentSpawnDisarmUncertain(owner);
    }
  }

  /**
   * The acceptance owner let go without confirming: the sweeper fails the arm closed.
   * A resume deferred while armed is dropped even when the rollback already converted
   * the arm to custody, so no later disarm can replay it.
   */
  function releaseSubagentSpawnAcceptanceHoldForRun(runId: string): void {
    const current = subagentRuns.get(runId.trim());
    if (!current) {
      return;
    }
    releaseSubagentSpawnAcceptanceHold(current);
    takeDeferredArmedSubagentResume(current);
    if (isSubagentSpawnArmed(current)) {
      deps.scheduleSweep({ delayMs: 0 });
    }
  }

  /**
   * The collector start transition disarms a dispatched launch marker in its own write
   * (H1 §3.4). Like native confirmation it then replays, exactly once, any resume the
   * F2 fence deferred while the launch was armed.
   */
  async function startQueuedSubagentRun(
    runId: string,
    gatewayRunId?: string,
    lifecycleGeneration?: string,
    gatewayContextResolver?: GatewayContextResolver,
  ): Promise<boolean> {
    const id = runId.trim();
    const selected =
      subagentRuns.get(id) ?? [...subagentRuns.values()].find((row) => row.swarmRunId === id);
    const started = await deps.manager.startQueuedSubagentRun(
      runId,
      gatewayRunId,
      lifecycleGeneration,
      gatewayContextResolver,
    );
    const current = selected && subagentRuns.get(gatewayRunId?.trim() || selected.runId);
    if (
      started &&
      current &&
      isSameSubagentRunOwner(current, selected) &&
      !isSubagentSpawnArmed(current)
    ) {
      const deferred = takeDeferredArmedSubagentResume(current);
      if (deferred) {
        deps.resume(current.runId, deferred);
      }
    }
    return started;
  }

  return {
    confirmSubagentSpawnAcceptance,
    markSubagentLaunchDispatchUncertain,
    releaseSubagentSpawnAcceptanceHoldForRun,
    startQueuedSubagentRun,
  };
}
