// Queued-launch helpers split from the launch manager for its line budget: the swarm
// wait-owner walk and the queued -> running start-transition plan.
import { isAgentEventLifecycleGenerationCurrent } from "../../../infra/agent-events.js";
import { parseAgentSessionKey } from "../../../routing/session-key.js";
import { matchesSubagentChildSessionOwner } from "./subagent-child-owner-match.js";
import {
  SubagentRegistryMutationRejectedError,
  waitForPendingSubagentKillClaim,
} from "./subagent-registry-persistence.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import {
  bindSubagentRunRuntimeKey,
  getSubagentRunRuntimeKey,
  isSameSubagentRunOwner,
  latestSubagentRun,
} from "./subagent-run-generation.js";

export function resolveSwarmWaitOwnerSessionKeys(
  getRunsForChildSession: (
    childSessionKey: string,
    childAgentId?: string,
  ) => Iterable<SubagentRunRecord>,
  requesterSessionKey: string,
  requesterAgentId?: string,
): string[] {
  const ownerSessionKeys: string[] = [];
  const visited: Array<{ childSessionKey: string; childAgentId?: string }> = [];
  let currentSessionKey = requesterSessionKey.trim();
  let currentAgentId = requesterAgentId;
  while (
    currentSessionKey &&
    !visited.some((entry) =>
      matchesSubagentChildSessionOwner(entry, currentSessionKey, currentAgentId),
    )
  ) {
    visited.push({ childSessionKey: currentSessionKey, childAgentId: currentAgentId });
    ownerSessionKeys.push(currentSessionKey);
    const latestOwner = latestSubagentRun(
      getRunsForChildSession(currentSessionKey, currentAgentId),
    );
    currentSessionKey =
      latestOwner?.controllerSessionKey?.trim() || latestOwner?.requesterSessionKey.trim() || "";
    currentAgentId =
      parseAgentSessionKey(currentSessionKey)?.agentId ?? latestOwner?.requesterAgentId;
  }
  return ownerSessionKeys;
}

/** Plans the queued -> running start transition, which also disarms a dispatched launch marker. */
export function planQueuedSubagentRunStart(
  rows: ReadonlyMap<string, SubagentRunRecord>,
  selected: SubagentRunRecord,
  nextRunId: string,
  acceptedLifecycleGeneration: string,
  admission: Parameters<typeof waitForPendingSubagentKillClaim>[1],
) {
  const current = rows.get(selected.runId);
  if (
    !current ||
    !isSameSubagentRunOwner(current, selected) ||
    !isAgentEventLifecycleGenerationCurrent(acceptedLifecycleGeneration)
  ) {
    return { value: undefined };
  }
  const lifecycleStarted =
    current.execution.status === "running" &&
    typeof current.execution.startedAt === "number" &&
    current.swarmLaunchPending === true;
  const terminalBeforeAcceptance =
    current.collectorCompletion !== undefined && current.queuedLaunch !== undefined;
  if (
    current.killIntent ||
    current.killReconciliation ||
    waitForPendingSubagentKillClaim(current, admission) ||
    (current.swarmLaunchPending === true &&
      typeof current.execution.endedAt === "number" &&
      current.collectorCompletion === undefined) ||
    (!terminalBeforeAcceptance && current.execution.status !== "queued" && !lifecycleStarted)
  ) {
    return { value: undefined };
  }
  if (nextRunId !== current.runId && rows.get(nextRunId)) {
    throw new SubagentRegistryMutationRejectedError(
      `collector gateway run id already exists: ${nextRunId}`,
    );
  }
  const entry = structuredClone(current);
  entry.swarmRunId ??= current.runId;
  entry.schedulerSlotId ??= entry.swarmRunId;
  entry.runId = nextRunId;
  if (!terminalBeforeAcceptance) {
    const startedAt =
      current.execution.status === "running" ? current.execution.startedAt : undefined;
    entry.execution = {
      ...entry.execution,
      status: "running",
      acceptedAt: Date.now(),
      lifecycleGeneration: acceptedLifecycleGeneration,
      restartRecovery: undefined,
      suppressSessionEffects: undefined,
      startedAt,
    };
    entry.sessionStartedAt =
      typeof startedAt === "number" ? (entry.sessionStartedAt ?? startedAt) : undefined;
  }
  entry.swarmLaunchPending = false;
  entry.queuedLaunch = undefined;
  // The start transition proves the dispatched launch started: disarm in the same write.
  delete entry.launchDispatch;
  bindSubagentRunRuntimeKey(entry, getSubagentRunRuntimeKey(current));
  const postimages = new Map<string, SubagentRunRecord | null>([[nextRunId, entry]]);
  if (selected.runId !== nextRunId) {
    postimages.set(selected.runId, null);
  }
  return {
    value: { source: current, entry, terminalBeforeAcceptance },
    postimages,
    ...(current.runId !== nextRunId ? { rekeys: new Map([[current.runId, nextRunId]]) } : {}),
  };
}
