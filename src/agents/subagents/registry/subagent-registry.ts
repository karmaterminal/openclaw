import { getRuntimeConfig } from "../../../config/config.js";
import { prepareSqliteTargetFromSessionStorePath } from "../../../config/sessions/session-sqlite-target.js";
import type { GatewayContextResolver } from "../../../gateway/server-methods/types.js";
import { measureStartup, type GatewayStartupTrace } from "../../../gateway/server-startup-trace.js";
import { registerSystemEventStoreOwner } from "../../../infra/system-event-ownership.js";
import { runWithGatewayIndependentRootWorkAdmission } from "../../../process/gateway-work-admission.js";
import type { AgentRecoveryProgress } from "../../../state/agent-database-preparation-recovery.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import { reconcileRetiredSubagentCancellation } from "../completion/subagent-completion-admission.store.js";
import { terminateAcceptedCollectorRun } from "../spawn/subagent-spawn-cleanup.js";
import {
  hasRetainedRequiredCompletionDelivery,
  isDeliverySuspended,
} from "./subagent-delivery-state.js";
import { runSubagentRegistryActivation } from "./subagent-registry-activation.js";
import { runRegistrySubagentAnnounceFlow } from "./subagent-registry-announce-flow.js";
import {
  createSubagentRegistryCompletionRuntime,
  createSubagentResumeReader,
} from "./subagent-registry-completion-runtime.js";
import { emitSubagentProgressEndedHook } from "./subagent-registry-completion.js";
import { createSubagentRegistryContextCleanup } from "./subagent-registry-context-cleanup.js";
import {
  callSubagentRegistryGateway,
  createSubagentRegistryGatewayCaller,
  loadSubagentAnnounceModule,
  loadSubagentBrowserCleanupModule,
} from "./subagent-registry-deps.js";
import { bindSubagentRunGatewayOwners } from "./subagent-registry-gateway-owner.js";
import {
  ANNOUNCE_EXPIRY_MS,
  GATEWAY_ADMISSION_RETRY_DELAY_MS,
} from "./subagent-registry-helpers.js";
import { createSubagentKillConfirmation } from "./subagent-registry-kill-confirmation.js";
import { suspendReplacedStoreNotifications } from "./subagent-registry-lifecycle-cleanup.js";
import { subagentRegistryLog as log } from "./subagent-registry-lifecycle-log.js";
import { SubagentLifecycleController } from "./subagent-registry-lifecycle.js";
import { createSubagentRegistryListener } from "./subagent-registry-listener.js";
import {
  getSubagentChildSessionCandidates,
  getSubagentRunsForChildSession,
  getSubagentRunsForCollectorGroup,
  subagentRuns,
} from "./subagent-registry-memory.js";
import { mutateSubagentRuns } from "./subagent-registry-persistence.js";
import { createSubagentRegistryPublicApi } from "./subagent-registry-public-api.js";
import {
  countPendingDescendantRuns,
  getLatestLiveSubagentRunByChildSessionKey,
} from "./subagent-registry-read.js";
import { captureRequesterSettleWakeRecoverySource } from "./subagent-registry-restart-recovery.js";
import { createSubagentRegistryRestorer } from "./subagent-registry-restore.js";
import { handleOrphanedSubagentResume } from "./subagent-registry-resume-orphan.js";
import type { RegisterSubagentRunParams } from "./subagent-registry-run-launch-record.js";
import type { SubagentRegistrationOwnership } from "./subagent-registry-run-launch.js";
import { createSweeperRunManagerOperations } from "./subagent-registry-run-manager-bridge.js";
import { createSubagentRunManager } from "./subagent-registry-run-manager.js";
import { createSubagentSpawnAcceptanceApi } from "./subagent-registry-spawn-acceptance-api.js";
import {
  deferArmedSubagentResume,
  isSubagentSpawnArmed,
} from "./subagent-registry-spawn-acceptance.js";
import { clearSubagentRunsReadCacheForTest } from "./subagent-registry-state.js";
import { callGatewayForSweep } from "./subagent-registry-sweep-gateway.js";
import { hasContinuationWorkForSweepEntry } from "./subagent-registry-sweep-guards.js";
import { reconcileProvisionalSubagentKill } from "./subagent-registry-sweep-kill.js";
import {
  createSubagentRegistrySweeper,
  retireSupersededSubagentRun as retireSupersededSubagentRunForSweep,
} from "./subagent-registry-sweeper.js";
import type { RegisterSubagentRunOptions, SubagentRunRecord } from "./subagent-registry.types.js";
import {
  isRequesterRetirementCustodyCurrent,
  isRequesterCompletionCohortCurrent,
} from "./subagent-requester-settle-identity.js";
import { isClaimedByLiveRequesterTurn } from "./subagent-requester-turn-liveness.js";
import { getSubagentRunRuntimeKey, isSameSubagentRunOwner } from "./subagent-run-generation.js";
import { resolveSubagentWaitTimeoutMs } from "./subagent-run-timeout.js";
import {
  resolveSubagentRunOrphanReason,
  resolveSubagentSessionCompletion,
  resolveSubagentSessionStartedAt,
  type SubagentRunOrphanReason,
} from "./subagent-session-reconciliation.js";

export { SubagentSessionCleanupRevocationChangedError } from "./subagent-registry-lifecycle.js";
export type { SubagentRunRecord } from "./subagent-registry.types.js";
const warn = (message: string, meta?: Record<string, unknown>) => log.warn(message, meta);

const completionRetryTimers = new Set<ReturnType<typeof setTimeout>>();
let activeGatewayContextResolver: GatewayContextResolver | undefined;
const SUBAGENT_ANNOUNCE_TIMEOUT_MS = 120_000;

/** Prepare registry hydration before the session owner's synchronous reset commit. */
export async function prepareSubagentSessionCleanupRevocation(
  sessionKey: string,
  childAgentId?: string,
  assertCurrent?: () => void,
): Promise<() => void> {
  await subagentRestorer.restoreOnce(true);
  await subagentLifecycleController.revokeTerminalSessionEffects(
    getSubagentRunsForChildSession(sessionKey, childAgentId),
    assertCurrent,
  );
  return () => {
    assertCurrent?.();
    subagentLifecycleController.assertTerminalSessionEffectsRevoked(
      getSubagentRunsForChildSession(sessionKey, childAgentId),
    );
  };
}

export function scheduleSubagentRegistrySweep(params?: { delayMs?: number }) {
  subagentSweeper.schedule(params);
}

const resumedRuns = new Set<object>();
const resumeReader = createSubagentResumeReader({
  resumedRuns,
  runBackgroundWork: (entry, run) => subagentLifecycleController.runBackgroundWork(entry, run),
  getGatewayContextResolver: () => activeGatewayContextResolver,
  resume: resumeCheckedSubagentRun,
  retryAfterDrain: (...args) => subagentLifecycleController.resumeAfterDrain(...args),
});

const completionRuntime = createSubagentRegistryCompletionRuntime({
  runs: subagentRuns,
  resumed: resumedRuns,
  retryTimers: completionRetryTimers,
  completeSubagentRun: (params) => completeSubagentRun(params),
  scheduleSweep: scheduleSubagentRegistrySweep,
  resumeRun: (runId) => resumeSubagentRun(runId),
});
const pendingLifecycle = completionRuntime.pendingLifecycle;
const clearPendingLifecycleError = pendingLifecycle.clearError;
const clearPendingLifecycleTimeout = pendingLifecycle.clearTimeout;

const contextCleanup = createSubagentRegistryContextCleanup({
  isEndedHookOwnerCurrent: (entry): boolean =>
    subagentLifecycleController.isEndedHookOwnerCurrent(entry),
});

const subagentLifecycleController = new SubagentLifecycleController({
  ...contextCleanup,
  runs: subagentRuns,
  resumedRuns,
  subagentAnnounceTimeoutMs: SUBAGENT_ANNOUNCE_TIMEOUT_MS,
  getRuntimeConfig,
  clearPendingLifecycleError,
  // Lifecycle wiring precedes publicApi construction; inject this read query
  // as a late-bound callback instead of threading a partially built API object.
  countPendingDescendantRuns,
  getLatestRunForChildSession: getLatestLiveSubagentRunByChildSessionKey,
  emitSubagentProgressEndedForRun: emitSubagentProgressEndedHook,
  retireSupersededRun: retireSupersededSubagentRun,
  resumeSubagentRun,
  confirmProvisionalKill: (entry) => killConfirmation.confirmProvisionalSubagentKill(entry),
  callGateway: callSubagentRegistryGateway,
  captureSubagentCompletionReply: async (sessionKey, options) =>
    (await loadSubagentAnnounceModule()).captureSubagentCompletionReply(sessionKey, options),
  cleanupBrowserSessionsForLifecycleEnd: async (args) =>
    (await loadSubagentBrowserCleanupModule()).cleanupBrowserSessionsForLifecycleEnd(args),
  runSubagentAnnounceFlow: runRegistrySubagentAnnounceFlow,
  maybeWakeRequesterAfterAllChildrenSettled: async (args) =>
    subagentRestorer.canResumeWakes()
      ? (
          await import("../announce/subagent-announce.requester-settle-wake.js")
        ).maybeWakeRequesterAfterAllChildrenSettled(args)
      : false,
  warn,
});

const {
  clearRuntimeState,
  scheduleResume,
  completeCleanupBookkeeping,
  completeSubagentRun,
  finalizeResumedAnnounceGiveUpInBackground,
  refreshFrozenResultFromSession,
  resumeRequesterSettleWake,
  resumePendingRequesterSettlements,
  settleRequesterTurnAfterSessionSpawns,
  startSubagentAnnounceCleanupFlow,
} = subagentLifecycleController;
function suspendReplacedNotificationsInBackground(): void {
  void suspendReplacedStoreNotifications(subagentLifecycleController.options).catch(
    (error: unknown) => {
      log.warn("subagent notification retirement is deferred", { error });
    },
  );
}
registerSystemEventStoreOwner(
  Symbol.for("openclaw.subagentNotifications"),
  suspendReplacedNotificationsInBackground,
);

export function resumeSubagentRun(runId: string, source: "live" | "restore" = "live") {
  if (!runId) {
    return;
  }
  const entry = subagentRuns.get(runId);
  if (
    !entry ||
    resumedRuns.has(getSubagentRunRuntimeKey(entry)) ||
    subagentRuns.isCompletionAuthorityRetired(entry)
  ) {
    return;
  }
  if (entry.terminalOwner === "interrupted-recovery") {
    resumeReader.retirePending(entry);
    if (source === "restore") {
      // Startup recovery owns terminal reconciliation and resource cleanup before delivery.
      resumedRuns.add(getSubagentRunRuntimeKey(entry));
      return;
    }
    // The recovery completion path has run; live retries only resume its delivery.
    resumeCheckedSubagentRun(runId, entry, source, null);
    return;
  }
  if (isSubagentSpawnArmed(entry)) {
    // F2: an armed row (held or not) is fenced from orphan completion, expiry
    // give-up and announce/wake until its acceptance owner confirms. Confirmation
    // replays this deferred resume exactly once; resumedRuns stays unset so it can.
    resumeReader.retirePending(entry);
    deferArmedSubagentResume(entry, source, () => scheduleSubagentRegistrySweep({ delayMs: 0 }));
    return;
  }
  // The child session may be gone while its requester delivery remains durable:
  // no orphan read can settle it, so resume it as a live owner.
  if (hasRetainedRequiredCompletionDelivery(entry)) {
    resumeReader.retirePending(entry);
    resumeCheckedSubagentRun(runId, entry, source, null);
    return;
  }
  const orphanCheck = resolveSubagentRunOrphanReason({
    entry,
    includeStaleUnended: source === "restore",
  });
  if (orphanCheck === null || typeof orphanCheck === "string") {
    resumeReader.retirePending(entry);
    resumeCheckedSubagentRun(runId, entry, source, orphanCheck);
    return;
  }
  if (!resumeReader.hasPending(entry)) {
    resumeReader.read(runId, entry, source, orphanCheck);
  }
}

function resumeCheckedSubagentRun(
  runId: string,
  entry: SubagentRunRecord,
  source: "live" | "restore",
  orphanReason: SubagentRunOrphanReason | null,
  isHostCurrent?: () => boolean,
) {
  if (isSubagentSpawnArmed(entry)) {
    // An asynchronous orphan read can finish after the row was armed; the F2
    // fence still owns it until acceptance confirms.
    deferArmedSubagentResume(entry, source, () => scheduleSubagentRegistrySweep({ delayMs: 0 }));
    return;
  }
  if (source === "restore" && entry.requesterSettleWake) {
    subagentLifecycleController.markRequesterSettleWakeRestored(entry);
  }
  if (
    handleOrphanedSubagentResume({
      runId,
      entry,
      orphanReason,
      complete: completionRuntime.completeSubagentRunWithRecovery,
      warn: (message, meta) => log.warn(message, meta),
      ...(isHostCurrent ? { isHostCurrent } : {}),
    })
  ) {
    return;
  }
  if (entry.killReconciliation) {
    resumedRuns.add(getSubagentRunRuntimeKey(entry));
    const stillCurrent = () =>
      isHostCurrent?.() !== false && isSameSubagentRunOwner(subagentRuns.get(runId), entry);
    const failed = (error: unknown) => {
      log.warn("subagent settlement deferred before cleanup", { runId, error });
      if (stillCurrent()) {
        resumedRuns.delete(getSubagentRunRuntimeKey(entry));
        scheduleResume(entry, GATEWAY_ADMISSION_RETRY_DELAY_MS);
      }
    };
    void runWithGatewayIndependentRootWorkAdmission(async () => {
      try {
        const settled = await reconcileRetiredSubagentCancellation(entry, Date.now());
        if (!stillCurrent()) {
          return;
        }
        resumedRuns.delete(getSubagentRunRuntimeKey(entry));
        if (settled === false) {
          scheduleSubagentRegistrySweep();
          return;
        }
        resumeFinalizedSubagentRun(runId, subagentRuns.get(runId)!);
      } catch (error) {
        failed(error);
      }
    }, "subagents:cancel-reconcile").catch(failed);
    return;
  }
  resumeFinalizedSubagentRun(runId, entry);
}

/** Retires a killed row's obligations, re-evaluating its yielded cohort. */
function retireKilledSubagentObligations(entry: SubagentRunRecord): Promise<void> {
  return subagentLifecycleController.retireSubagentObligations(entry, () => {
    if (!isSameSubagentRunOwner(subagentRuns.get(entry.runId), entry)) {
      throw new Error("Killed subagent row changed before obligation retirement.");
    }
  });
}

const killConfirmation = createSubagentKillConfirmation((current) =>
  reconcileProvisionalSubagentKill({
    runId: current.runId,
    entry: current,
    now: Date.now(),
    runs: subagentRuns,
    completeSubagentRunWithRecovery: completionRuntime.completeSubagentRunWithRecovery,
    retireSupersededRun: retireSupersededSubagentRun,
    retireObligations: retireKilledSubagentObligations,
    startSubagentAnnounceCleanupFlow,
    getRunsForChildSession: getSubagentRunsForChildSession,
    warn,
  }),
);

/** Runs one kill owner's claim settlement; a confirmation that arrives meanwhile waits. */
export function withSubagentKillOwner<T>(runId: string, settle: () => Promise<T>): Promise<T> {
  return killConfirmation.withSubagentKillOwner(runId, settle);
}

function resumeFinalizedSubagentRun(runId: string, entry: SubagentRunRecord) {
  // A yielded wake waits only while a delivery owner remains: the session queue, or
  // this row's own unfinished cleanup. Completed cleanup leaves the wake as the owner.
  const yieldedWakeWaitingForDelivery =
    entry.requesterSettleWake?.requesterYieldBatch === true &&
    (entry.delivery?.status === "in_progress" ||
      (entry.cleanupCompletedAt === undefined &&
        (entry.delivery?.status === "pending" || entry.delivery?.status === "failed")));
  if (
    entry.requesterSettleWake &&
    typeof entry.execution.endedAt === "number" &&
    (!yieldedWakeWaitingForDelivery ||
      (entry.pauseReason === "sessions_yield" && entry.requesterSettleWake.pauseNotice))
  ) {
    resumeRequesterSettleWake(runId, entry);
    return;
  }
  if (entry.cleanupCompletedAt) {
    return;
  }
  if (typeof entry.execution.endedAt === "number" && isDeliverySuspended(entry)) {
    return;
  }
  if (entry.delivery?.status === "in_progress") {
    // The durable session queue resumes this delivery from its own owner row.
    return;
  }
  // Yielded runs stay paused until explicitly steered, except orchestrators
  // waiting on descendants: their settle retry must reach the wake path.
  if (entry.pauseReason === "sessions_yield" && entry.wakeOnDescendantSettle !== true) {
    return;
  }
  // Required completions are deadline-driven; retry count is diagnostic only.
  if (
    entry.expectsCompletionMessage !== true &&
    typeof entry.execution.endedAt === "number" &&
    Date.now() - entry.execution.endedAt > ANNOUNCE_EXPIRY_MS
  ) {
    finalizeResumedAnnounceGiveUpInBackground(runId, entry, "expiry");
    return;
  }

  const now = Date.now();
  const earliestRetryAt = entry.delivery?.nextAttemptAt ?? 0;
  if (entry.expectsCompletionMessage === true && now < earliestRetryAt) {
    const waitMs = Math.max(1, earliestRetryAt - now);
    scheduleResume(entry, waitMs);
    resumedRuns.add(getSubagentRunRuntimeKey(entry));
    return;
  }

  if (typeof entry.execution.endedAt === "number" && entry.execution.endedAt > 0) {
    // Operation settlement or, without one, the sweeper owns provisional cancellation cleanup.
    if (
      entry.killReconciliation ||
      contextCleanup.suppressAnnounceForSteerRestart(entry) ||
      startSubagentAnnounceCleanupFlow(entry)
    ) {
      resumedRuns.add(getSubagentRunRuntimeKey(entry));
    }
    return;
  }

  // Wait for completion again after restart.
  const cfg = getRuntimeConfig();
  const waitTimeoutMs = resolveSubagentWaitTimeoutMs(cfg, entry.runTimeoutSeconds);
  void subagentRunManager.waitForSubagentCompletion(runId, entry, waitTimeoutMs, true);
  resumedRuns.add(getSubagentRunRuntimeKey(entry));
}

const subagentRestorer = createSubagentRegistryRestorer({
  runs: subagentRuns,
  getGatewayContextResolver: () => activeGatewayContextResolver,
  bindGatewayOwners: async (entries, startupTrace, onRecovered) => {
    if (
      !(await bindSubagentRunGatewayOwners({
        runs: subagentRuns,
        entries,
        startupTrace,
        resumedRuns,
        getGatewayContextResolver: () => activeGatewayContextResolver,
        onRecovered: (entry) => {
          onRecovered(entry);
          subagentLifecycleController.markRequesterSettleWakeRestored(entry);
        },
      }))
    ) {
      return false;
    }
    suspendReplacedNotificationsInBackground();
    return true;
  },
  settleRequesterTurn: settleRequesterTurnAfterSessionSpawns,
  retireSupersededRun: retireSupersededSubagentRun,
  ensureListener: () => subagentListener.ensure(),
  startSweeper: () => subagentSweeper.start(),
  scheduleSweep: scheduleSubagentRegistrySweep,
  recoverInterruptedRuns: (entries, startupTrace) =>
    measureStartup(startupTrace, "background.subagent-interrupted", () =>
      subagentSweeper.recoverInterruptedRuns(entries),
    ).catch((error: unknown) => {
      log.warn("interrupted subagent recovery remains pending", { error });
    }),
  resumeRun: (runId) => resumeSubagentRun(runId, "restore"),
  listSwarmRunsForGroup: (groupId, requesterSessionKey, requesterAgentId) =>
    listSwarmRunsForGroup(groupId, requesterSessionKey, requesterAgentId),
  startQueuedSubagentRun: (runId, gatewayRunId, lifecycleGeneration) =>
    startQueuedSubagentRun(runId, gatewayRunId, lifecycleGeneration),
  terminateAcceptedRestoredCollectorRun: ({
    entry,
    gatewayRunId,
    timeoutMs,
    expectedSessionId,
    expectedLifecycleRevision,
  }) =>
    terminateAcceptedCollectorRun({
      childSessionKey: entry.childSessionKey,
      gatewayRunId,
      expectedSessionId,
      expectedLifecycleRevision,
      timeoutMs,
      callGateway: callSubagentRegistryGateway,
    }),
  cleanupCollectorLaunchResources: contextCleanup.cleanupCollectorLaunchResources,
  settleFailedQueuedSubagentLaunch: (runId, error) =>
    subagentRunManager.settleFailedQueuedSubagentLaunch(runId, error),
  completeCollectorLaunchCleanup: (runId) => publicApi.completeCollectorLaunchCleanup(runId),
  warn,
});

function retireSupersededSubagentRun(
  runId: string,
  expected: SubagentRunRecord,
  assertCurrent?: () => void,
): Promise<void> {
  assertCurrent?.();
  const entry = subagentRuns.get(runId);
  if (
    !entry ||
    !isSameSubagentRunOwner(entry, expected) ||
    !isRequesterRetirementCustodyCurrent(entry, expected)
  ) {
    return Promise.resolve();
  }
  const wake = entry.requesterSettleWake;
  const owesCompletion =
    entry.expectsCompletionMessage === true &&
    entry.suppressCompletionDelivery !== true &&
    !entry.killIntent &&
    !entry.killReconciliation;
  if (
    owesCompletion &&
    entry.execution.status === "terminal" &&
    !isClaimedByLiveRequesterTurn(entry) &&
    !wake &&
    !entry.cleanupCompletedAt
  ) {
    startSubagentAnnounceCleanupFlow(entry);
    return Promise.resolve();
  }
  const isCurrent = () =>
    isSameSubagentRunOwner(subagentRuns.get(runId), entry) &&
    isRequesterCompletionCohortCurrent(entry, getLatestLiveSubagentRunByChildSessionKey);
  const inRequesterCohort =
    Boolean(entry.requesterTurnRunId) || wake?.batchRunIds?.includes(entry.runId) === true;
  if (owesCompletion && inRequesterCohort && isCurrent()) {
    // A newer task owns session effects, but this cohort still owes the older result.
    if (entry.cleanupCompletedAt !== undefined) {
      resumeRequesterSettleWake(runId, entry);
      return Promise.resolve();
    }
    return completeCleanupBookkeeping({
      runId,
      entry,
      cleanup: entry.cleanup,
      completedAt: Date.now(),
      preserveTranscript: true,
      isCurrent,
    });
  }
  return retireSupersededSubagentRunForSweep({
    runId,
    entry,
    runs: subagentRuns,
    clearPendingLifecycleError,
    assertCurrent,
    isCurrent: (current) => {
      assertCurrent?.();
      return isRequesterRetirementCustodyCurrent(current, entry);
    },
  }).then(() => {
    if (!subagentRuns.has(runId)) {
      subagentLifecycleController.resumeAncestorCleanup(entry);
    }
  });
}

const subagentSweeper = createSubagentRegistrySweeper({
  ...contextCleanup,
  runs: subagentRuns,
  resumedRuns,
  clearPendingLifecycleError,
  clearPendingLifecycleTimeout,
  sweepPendingLifecycle: (now) => pendingLifecycle.sweepExpired(now),
  completeSubagentRunWithRecovery: completionRuntime.completeSubagentRunWithRecovery,
  ...createSweeperRunManagerOperations(() => subagentRunManager),
  getGatewayRecoveryRuntime: () => activeGatewayContextResolver?.()?.recoveryRuntime,
  finalizeInterruptedSubagentRun: completionRuntime.finalizeInterruptedSubagentRun,
  startSubagentAnnounceCleanupFlow,
  completeCleanupBookkeeping,
  resumeRequesterSettleWake,
  resumePendingRequesterSettlements,
  isCleanupOwnerCurrent: subagentLifecycleController.isCleanupOwnerCurrent,
  isTerminalTailActive: subagentLifecycleController.isTerminalTailActive,
  sessionEffectsHostCurrent: (entry) =>
    subagentLifecycleController.sessionEffectsHostCurrent(entry),
  shouldSuppressSessionEffects: (entry, effects) =>
    subagentLifecycleController.shouldSuppressSessionEffects(entry, effects),
  discardTerminalDelivery: SubagentLifecycleController.discardTerminalDelivery,
  shouldDeferArchive: hasContinuationWorkForSweepEntry,
  callGateway: callGatewayForSweep,
  retireSupersededRun: retireSupersededSubagentRun,
  retireObligations: retireKilledSubagentObligations,
  getRunsForChildSession: getSubagentRunsForChildSession,
  getRunsForCollectorGroup: getSubagentRunsForCollectorGroup,
  warn,
});

const subagentListener = createSubagentRegistryListener({
  runs: subagentRuns,
  pendingLifecycle,
  resumeRequesterSettleWake,
  adoptPausedSubagentRunIntoSuccessor: (entry) =>
    subagentRunManager.adoptPausedSubagentRunIntoSuccessor({
      childSessionKey: entry.childSessionKey,
      childAgentId: entry.childAgentId,
    }),
  refreshFrozenResultFromSession,
  completeSubagentRunWithRecovery: completionRuntime.completeSubagentRunWithRecovery,
});

const subagentRunManager = createSubagentRunManager({
  acquireTerminalCompletionLock: (runId) =>
    subagentLifecycleController.acquireTerminalCompletionLock(runId),
  runs: subagentRuns,
  getChildSessionCandidates: getSubagentChildSessionCandidates,
  getRunsForChildSession: getSubagentRunsForChildSession,
  resumedRuns,
  callGateway: createSubagentRegistryGatewayCaller(() => activeGatewayContextResolver),
  getRuntimeConfig,
  ensureListener: subagentListener.ensure,
  startSweeper: subagentSweeper.start,
  stopSweeper: subagentSweeper.stopIfIdle,
  resumeSubagentRun,
  clearPendingLifecycleError,
  clearPendingLifecycleTimeout,
  resolveSubagentWaitTimeoutMs,
  scheduleSweep: scheduleSubagentRegistrySweep,
  resolveSubagentSessionCompletion,
  resolveSubagentSessionStartedAt,
  notifyContextEngineSubagentEnded: contextCleanup.notifyContextEngineSubagentEnded,
  completeCleanupBookkeeping,
  completeSubagentRun: async (params) => {
    await completionRuntime.completeSubagentRunWithRecovery(params, "subagent-wait");
  },
});

export const replaceSubagentRunAfterSteerCore = subagentRunManager.replaceSubagentRunAfterSteer;
export const claimSubagentRunKill = subagentRunManager.claimSubagentRunKill;
export const releaseSubagentRunKillClaim = subagentRunManager.releaseSubagentRunKillClaim;
export const rollbackSubagentRunRegistration = subagentRunManager.rollbackSubagentRunRegistration;
export const recordAcceptedSubagentSpawnRollback =
  subagentRunManager.recordAcceptedSubagentSpawnRollback;
export const releaseAcceptedSubagentSpawnRollback =
  subagentRunManager.releaseAcceptedSubagentSpawnRollback;
export const armSubagentLaunchDispatch = subagentRunManager.armSubagentLaunchDispatch;

// Registration always settles through the registry writer. Callers await it and read
// the ownership the continuation spawn path checks.
export function registerSubagentRun(
  params: RegisterSubagentRunParams,
  options?: RegisterSubagentRunOptions,
): Promise<SubagentRegistrationOwnership> {
  return subagentRunManager.registerSubagentRun(
    {
      ...params,
      gatewayContextResolver: params.gatewayContextResolver ?? activeGatewayContextResolver,
    },
    options,
  );
}
const spawnAcceptanceApi = createSubagentSpawnAcceptanceApi({
  manager: subagentRunManager,
  resume: (runId, source) => resumeSubagentRun(runId, source),
  scheduleSweep: scheduleSubagentRegistrySweep,
});
export const {
  confirmSubagentSpawnAcceptance,
  markSubagentLaunchDispatchUncertain,
  releaseSubagentSpawnAcceptanceHoldForRun,
  startQueuedSubagentRun,
} = spawnAcceptanceApi;
export const settleFailedQueuedSubagentLaunch = subagentRunManager.settleFailedQueuedSubagentLaunch;

export const adoptPausedSubagentRunForFollowUp =
  subagentRunManager.adoptPausedSubagentRunForFollowUp;
export const adoptPausedSubagentRunIntoSuccessor =
  subagentRunManager.adoptPausedSubagentRunIntoSuccessor;

async function resetSubagentRegistryForTests(opts?: { persist?: boolean }) {
  if (opts?.persist !== false) {
    await mutateSubagentRuns([...subagentRuns.keys()], (rows) => ({
      value: undefined,
      postimages: new Map([...rows.keys()].map((id) => [id, null])),
    }));
  }
  clearRuntimeState();
  for (const timer of completionRetryTimers) {
    clearTimeout(timer);
  }
  completionRetryTimers.clear();
  subagentRuns.clear();
  resumedRuns.clear();
  pendingLifecycle.clearAll();
  clearSubagentRunsReadCacheForTest();
  const sweeperRetirement = subagentSweeper.reset();
  subagentRestorer.reset();
  activeGatewayContextResolver = undefined;
  subagentListener.reset();
  return sweeperRetirement;
}

const testing = {
  sweepOnceForTests: subagentSweeper.sweepOnce,
  runSweeperTickForTests: subagentSweeper.runTick,
} as const;

export const finalizeInterruptedSubagentRun = completionRuntime.finalizeInterruptedSubagentRun;
export const markSubagentRunTerminated = subagentRunManager.markSubagentRunTerminated;
export const retireSubagentObligations = subagentLifecycleController.retireSubagentObligations;

const publicApi = createSubagentRegistryPublicApi({
  runs: subagentRuns,
  restoreOnce: (context) => subagentRestorer.restoreOnce(true, context),
  settleRequesterTurn: settleRequesterTurnAfterSessionSpawns,
  markRequesterYielded: subagentLifecycleController.markRequesterTurnYielded,
});

export const getSubagentRunByRunId = publicApi.getSubagentRunByRunId;
export const prepareSubagentRunsByRunIds = publicApi.prepareSubagentRunsByRunIds;
export const listCollectorRunsForRequesterIncarnation =
  publicApi.listCollectorRunsForRequesterIncarnation;
export const completeCollectorLaunchCleanup = publicApi.completeCollectorLaunchCleanup;
export const recordSwarmStructuredOutput = publicApi.recordSwarmStructuredOutput;
export const listSwarmRunsForGroup = publicApi.listSwarmRunsForGroup;
export const getSwarmRunByLaunchReplayKey = publicApi.getSwarmRunByLaunchReplayKey;
export const countActiveRunsForSession = publicApi.countActiveRunsForSession;
export function initSubagentRegistry() {
  return subagentRestorer.restoreOnce();
}

export { getPrivateRequesterSettleRecoveryOwner } from "./subagent-registry-read.js";

export async function prepareRequesterSettleWakeRecoverySource(
  params: Omit<Parameters<typeof captureRequesterSettleWakeRecoverySource>[0], "context">,
) {
  const context = captureOpenClawStateWorkerContext();
  await subagentRestorer.restoreOnce(true, context);
  const physical = await prepareSqliteTargetFromSessionStorePath(params.storePath, {
    agentId: params.requesterAgentId,
  });
  return captureRequesterSettleWakeRecoverySource({ ...params, storePath: physical.path, context });
}
export function activateSubagentRegistry(
  resolveGatewayContext: GatewayContextResolver,
  startupTrace?: GatewayStartupTrace,
): AgentRecoveryProgress {
  // Reuse the instance's own fenced closure so late-restored siblings share one
  // authority across repeated activation; the raw holder can outlive that instance.
  return runSubagentRegistryActivation(() => {
    activeGatewayContextResolver = resolveGatewayContext()?.resolveGatewayContext;
    return subagentRestorer.activate(startupTrace);
  });
}
export { whenSubagentRegistryActivated } from "./subagent-registry-activation.js";
export const settleRequesterAfterSessionSpawns = publicApi.settleRequesterAfterSessionSpawns;
export const markRequesterTurnYielded = publicApi.markRequesterTurnYielded;
export const claimSubagentYield = publicApi.claimSubagentYield;
export const listUnsettledRequesterChildren = publicApi.listUnsettledRequesterChildren;
export type { UnsettledRequesterChild } from "./subagent-registry-requester-yield.js";

export const adoptSubagentRunForRequesterTurn =
  subagentLifecycleController.adoptSubagentRunForRequesterTurn;

const SUBAGENT_REGISTRY_TEST_HANDLE = Symbol.for("openclaw.subagentRegistryTestApi");
if (process.env.VITEST || process.env.NODE_ENV === "test") {
  (globalThis as Record<PropertyKey, unknown>)[SUBAGENT_REGISTRY_TEST_HANDLE] = {
    releaseSubagentRun: subagentRunManager.releaseSubagentRun,
    resetSubagentRegistryForTests,
    testing,
  };
}

// Register the subagent maintenance preserve-key provider as a module side effect.
import "./subagent-registry-maintenance.js";
