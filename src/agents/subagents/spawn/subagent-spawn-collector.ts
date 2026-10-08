import { composeSessionSourceAssertion } from "../../../config/sessions/session-source-authority.js";
import type { GatewayContextResolver } from "../../../gateway/server-methods/types.js";
import { hasRetainedPluginRuntimeCloseError } from "../../../plugins/runtime-close-error.js";
import { getCanonicalGatewayContextResolver } from "../../../plugins/runtime/gateway-request-scope.js";
import {
  GatewayDrainingError,
  runWithGatewayDetachedWorkContinuation,
  runWithGatewayIndependentRootWorkContinuation,
} from "../../../process/gateway-work-admission.js";
import { getAsyncWorkSignal } from "../../../shared/async-work-scope.js";
import { createDeferredCore } from "../../../shared/deferred.js";
import type { AdmittedRunOperatorAuthority } from "../../admitted-run-context.js";
import { summarizeSpawnError } from "../../spawn-pipeline.js";
import { subagentRuns } from "../registry/subagent-registry-memory.js";
import { classifySubagentDisarmFailure } from "../registry/subagent-registry-spawn-acceptance-writes.js";
import {
  armSubagentLaunchDispatch,
  completeCollectorLaunchCleanup,
  markSubagentLaunchDispatchUncertain,
  recordAcceptedSubagentSpawnRollback,
  releaseAcceptedSubagentSpawnRollback,
  releaseSubagentSpawnAcceptanceHoldForRun,
  settleFailedQueuedSubagentLaunch,
  startQueuedSubagentRun,
} from "../registry/subagent-registry.js";
import type { SubagentRegistrationScope } from "../registry/subagent-registry.types.js";
import type { holdQueuedSwarmRun, activateSwarmRun } from "../swarm/swarm-scheduler.js";
import {
  type bindSubagentSpawnCleanup,
  type cleanupFailedSpawnBeforeAgentStart,
  retrySubagentCleanup,
  terminateAcceptedCollectorRun,
} from "./subagent-spawn-cleanup.js";
import type { PreparedContextEngineSubagentSpawn } from "./subagent-spawn-context.js";
import { readGatewayRunId } from "./subagent-spawn-gateway.js";
import { emitSessionLifecycleEvent } from "./subagent-spawn.runtime.js";

type CollectorLaunchCallbacks = Pick<
  Parameters<typeof activateSwarmRun>[0],
  "start" | "onStartFailure" | "onRemoved" | "signal"
>;
export type CollectorCleanupOptions = Pick<
  Parameters<typeof cleanupFailedSpawnBeforeAgentStart>[0],
  "waitForSessionDeletion" | "waitForCleanup"
>;

/** Hands preparation cleanup to its reservation before registration can wait on Stop. */
export function createCollectorPreparationHold(params: {
  reservation: ReturnType<typeof holdQueuedSwarmRun>;
  gatewayContextResolver?: GatewayContextResolver;
}) {
  const { reservation } = params;
  const removal = reservation
    ? createDeferredCore<CollectorLaunchCallbacks["onRemoved"]>()
    : undefined;
  if (reservation && removal) {
    reservation.bindPreparation({
      onRemoved: removal.promise,
      lifecycleOwner: params.gatewayContextResolver
        ? getCanonicalGatewayContextResolver(params.gatewayContextResolver)
        : undefined,
    });
  }
  let handedOff = false;
  let releaseAuthority: (() => void) | undefined;
  const release = () => {
    const retained = releaseAuthority;
    releaseAuthority = undefined;
    retained?.();
  };
  return {
    retainAuthority: (retained: (() => void) | undefined) => {
      releaseAuthority = retained;
    },
    releaseAuthority: release,
    prepared(
      preparation: PreparedContextEngineSubagentSpawn | undefined,
      isCurrent: () => boolean,
    ) {
      if (!removal) {
        return;
      }
      handedOff = true;
      removal.resolve(async (reason) => {
        try {
          if (reason === "shutdown" || !isCurrent()) {
            await preparation?.dispose();
          } else {
            await preparation?.rollback();
          }
        } finally {
          release();
        }
      });
    },
    finish() {
      if (!handedOff) {
        release();
        removal?.resolve(undefined);
      }
    },
  };
}

/** Owns registered collector launch and settlement while the caller retains its FIFO reservation. */
export function createCollectorLaunchCallbacks(params: {
  childRunId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  gatewayContextResolver?: GatewayContextResolver;
  operatorAuthority?: AdmittedRunOperatorAuthority;
  releaseOperatorAuthority?: () => void;
  cleanupOwner?: ReturnType<typeof bindSubagentSpawnCleanup>;
  registrationScope?: SubagentRegistrationScope;
  preparation?: PreparedContextEngineSubagentSpawn;
  provisionalSessionIdentity: {
    expectedSessionId?: string;
    expectedLifecycleRevision?: string;
  };
  launchChildRun: (
    assertDispatchCurrent: () => void,
  ) => Promise<{ response: Parameters<typeof readGatewayRunId>[0] }>;
  recordParticipant: () => void;
  emitSpawnLifecycleHooks: (runId: string) => Promise<void>;
  cleanupFailedSpawn: (
    options?: CollectorCleanupOptions,
  ) => ReturnType<typeof cleanupFailedSpawnBeforeAgentStart>;
}): CollectorLaunchCallbacks {
  const {
    childRunId,
    childSessionKey,
    gatewayContextResolver,
    registrationScope,
    preparation,
    provisionalSessionIdentity,
  } = params;
  const canLaunchQueuedRegistration = registrationScope?.canLaunch;
  const canCleanupCreatedSession =
    params.cleanupOwner?.isCurrent ?? registrationScope?.canCleanupSession;
  const callCleanupGateway = params.cleanupOwner?.callGateway;
  let releaseOperatorAuthority = params.releaseOperatorAuthority;
  const releaseAuthority = () => {
    const release = releaseOperatorAuthority;
    releaseOperatorAuthority = undefined;
    release?.();
  };
  let launchTerminationConfirmed = false;
  let pendingLaunchTermination: string | undefined;
  let dispatchAttempted = false;
  const recordRollbackOwner = async (gatewayRunId: string, reason: string, error: unknown) => {
    // Whatever the record outcome, the dispatched launch is no longer held: custody
    // (or the still-armed launch marker) is the sweeper's to fail closed.
    const rollbackOwner = await recordAcceptedSubagentSpawnRollback({
      runId: childRunId,
      childSessionKey,
      gatewayRunId,
      reason,
      ...provisionalSessionIdentity,
      // The recorder stays OWNERSHIP-BLIND. Durable custody must persist even when
      // live authority is revoked, or the accepted child is orphaned with nothing
      // for the sweeper to reconcile. The durable
      // row is fenced by expectedRegistration plus frozen session identity and run
      // id; the live predicate is consumed only by terminateAcceptedCollectorRun.
    });
    releaseSubagentSpawnAcceptanceHoldForRun(childRunId);
    if (rollbackOwner.status === "persisted") {
      return error;
    }
    const aggregate = new AggregateError(
      [
        error,
        rollbackOwner.status === "rejected"
          ? new Error(`Accepted collector rollback owner was rejected: ${childRunId}`)
          : rollbackOwner.error,
      ],
      `Accepted collector rollback incomplete: ${childRunId}`,
    );
    aggregate.cause = error;
    return aggregate;
  };
  let launchRegistered = false;
  const launchIdempotencyKey = () => {
    const row = subagentRuns.get(childRunId);
    const queuedKey = row?.queuedLaunch?.request.idempotencyKey;
    return (
      row?.swarmLaunchIdempotencyKey ??
      (typeof queuedKey === "string" && queuedKey ? queuedKey : childRunId)
    );
  };
  const startOnce = async () => {
    await runWithGatewayIndependentRootWorkContinuation(async () => {
      for (
        let claim = registrationScope?.waitForClaim();
        claim;
        claim = registrationScope?.waitForClaim()
      ) {
        await claim;
      }
      const assertLaunchCurrent = composeSessionSourceAssertion(
        [params.operatorAuthority?.assertCurrent],
        (assertSource) => {
          assertSource();
          if (canLaunchQueuedRegistration?.() === false) {
            throw new Error("Collector registration no longer owns this launch");
          }
        },
      );
      assertLaunchCurrent();
      // H1 §3.4: durable launch marker before dispatch. A failed write dispatches nothing.
      // A dispatched launch is never relaunched by restore; its start transition disarms it.
      if (
        !(await armSubagentLaunchDispatch({
          runId: childRunId,
          childSessionKey,
          idempotencyKey: launchIdempotencyKey(),
        }))
      ) {
        throw new Error("Collector launch marker could not be recorded before dispatch");
      }
      dispatchAttempted = true;
      let launch: Awaited<ReturnType<typeof params.launchChildRun>>;
      try {
        launch = await params.launchChildRun(assertLaunchCurrent);
      } catch (error) {
        releaseSubagentSpawnAcceptanceHoldForRun(childRunId);
        throw error;
      }
      // Queued registration already owns the task row before either dispatch route starts.
      // Out-of-process Gateway tracking finds that exact runId and suppresses its CLI row.
      const gatewayRunId = readGatewayRunId(launch.response) ?? childRunId;
      if (registrationScope?.canAcceptLaunch() === false) {
        await terminateAcceptedCollectorRun({
          childSessionKey,
          gatewayRunId,
          ...provisionalSessionIdentity,
          isCurrent: canCleanupCreatedSession,
          ...(callCleanupGateway ? { callGateway: callCleanupGateway } : {}),
          sessionCleanup: "preserve",
        });
        launchTerminationConfirmed = true;
        releaseSubagentSpawnAcceptanceHoldForRun(childRunId);
        throw new Error("Collector registration changed during launch");
      }
      params.recordParticipant();
      try {
        const started = gatewayContextResolver
          ? await startQueuedSubagentRun(
              childRunId,
              gatewayRunId,
              undefined,
              gatewayContextResolver,
            )
          : await startQueuedSubagentRun(childRunId, gatewayRunId);
        if (!started) {
          throw new Error("collector registry row could not transition from queued to running");
        }
        launchRegistered = true;
      } catch (error) {
        if (classifySubagentDisarmFailure(error) === "uncertain") {
          // §3.6: the start write may have landed. Never act on the rollback branch:
          // keep the hold, skip custody and termination, and leave settlement to the
          // next process restore, which decides by the durable row.
          markSubagentLaunchDispatchUncertain(childRunId);
          launchRegistered = true;
          return;
        }
        // Publication temporarily blocks cleanup authority. Settle rollback after
        // that barrier so a paused owner cannot count as confirmed termination.
        pendingLaunchTermination = gatewayRunId;
        // Record the accepted-spawn rollback owner before termination or settlement so
        // the sweeper can reconcile the accepted child if termination fails or the
        // process dies mid-cleanup, including while an overlapping Stop is still
        // publishing. That Stop's staged kill write rebases onto this custody instead of
        // losing it. Registry writes are async upstream, so the record is awaited here.
        throw await recordRollbackOwner(gatewayRunId, summarizeSpawnError(error), error);
      }
      await params.emitSpawnLifecycleHooks(gatewayRunId);
    }, "subagents:spawn");
    await disposeFailedPreparation();
    releaseAuthority();
  };
  // Scheduler retries repeat settlement, never the launch or admitted cleanup.
  let startAttempt: Promise<void> | undefined;
  const cleanupOnce = async () =>
    await Promise.allSettled([
      Promise.resolve().then(() => preparation?.rollback()),
      params.cleanupFailedSpawn({
        // A launch RPC can fail after acceptance. Keep the FIFO slot until
        // deleting the child session proves no accepted run remains active.
        waitForSessionDeletion: !launchTerminationConfirmed,
        waitForCleanup: () =>
          registrationScope?.waitForClaim() ?? registrationScope?.waitForRetirementPublication(),
      }),
    ]);
  let cleanupAttempt: ReturnType<typeof cleanupOnce> | undefined;
  const cleanupSucceeded = ([contextRollback, sessionCleanup]: Awaited<
    ReturnType<typeof cleanupOnce>
  >) =>
    contextRollback.status === "fulfilled" &&
    sessionCleanup.status === "fulfilled" &&
    sessionCleanup.value.attachmentsRemoved &&
    sessionCleanup.value.sessionDeleted;
  const publishCleanupCompletion = async (cleanup: Awaited<ReturnType<typeof cleanupOnce>>) => {
    // A succeeded cleanup is a FACT about a finished exact-session
    // operation -- it already requires attachmentsRemoved AND sessionDeleted, and that
    // delete could only have happened through the identity-fenced frozen owner.
    // Re-checking live currentness here was a TOCTOU trap: authority expiring after an
    // authorized delete left collectorLaunchCleanupPending true forever even though the
    // session was gone. The pre-delete gate keeps successor protection.
    if (cleanupSucceeded(cleanup)) {
      emitSessionLifecycleEvent({
        sessionKey: childSessionKey,
        reason: "delete",
        parentSessionKey: params.requesterSessionKey,
      });
      await completeCollectorLaunchCleanup(childRunId);
    }
  };
  const disposeFailedPreparation = async () => {
    try {
      await preparation?.dispose();
    } catch (error) {
      if (hasRetainedPluginRuntimeCloseError(error)) {
        throw error;
      }
    }
  };
  // A Stop publishing on this row decides its outcome before the launch owner
  // terminates, releases custody, or settles; publications can begin while any
  // of those awaits is in flight, so callers re-check after each await.
  const waitForStopPublications = async () => {
    for (
      let publication = registrationScope?.waitForRetirementPublication();
      publication;
      publication = registrationScope?.waitForRetirementPublication()
    ) {
      await publication;
    }
  };
  const settleLaunchFailure = async (error: unknown) => {
    if (launchRegistered && hasRetainedPluginRuntimeCloseError(error)) {
      // The accepted child keeps its outcome; only its preparation still needs closure.
      throw error;
    }
    if (error instanceof GatewayDrainingError) {
      return false;
    }
    const callerSignal = getAsyncWorkSignal();
    if (!dispatchAttempted && callerSignal?.aborted) {
      return false;
    }
    return await runWithGatewayDetachedWorkContinuation(async () => {
      for (;;) {
        if (!dispatchAttempted && callerSignal?.aborted) {
          return false;
        }
        const claim = registrationScope?.waitForClaim();
        if (!claim) {
          break;
        }
        await claim;
      }
      await waitForStopPublications();
      const failure = error;
      if (pendingLaunchTermination && !launchTerminationConfirmed) {
        let terminated: boolean;
        try {
          terminated = await terminateAcceptedCollectorRun({
            childSessionKey,
            gatewayRunId: pendingLaunchTermination,
            ...provisionalSessionIdentity,
            isCurrent: canCleanupCreatedSession,
            ...(callCleanupGateway ? { callGateway: callCleanupGateway } : {}),
          });
        } catch (terminationError) {
          // Rollback custody was recorded before termination, so the sweeper
          // owns reconciliation of an accepted child whose termination failed.
          launchTerminationConfirmed = true;
          const aggregate = new AggregateError(
            [failure, terminationError],
            `Accepted collector rollback incomplete: ${childRunId}`,
          );
          aggregate.cause = failure;
          throw aggregate;
        }
        launchTerminationConfirmed = true;
        // Releasing custody supersedes any staged Stop write on this row.
        await waitForStopPublications();
        if (terminated) {
          // The accepted child is proven stopped, so the rollback custody recorded
          // for the sweeper is discharged; an unconfirmed stop keeps it.
          await releaseAcceptedSubagentSpawnRollback({
            runId: childRunId,
            childSessionKey,
            gatewayRunId: pendingLaunchTermination,
          });
        }
      }
      const launchError = summarizeSpawnError(failure);
      const settleFailure = async () => {
        if (registrationScope) {
          await registrationScope.settleFailedLaunch(launchError);
          return;
        }
        await retrySubagentCleanup(async () => {
          await settleFailedQueuedSubagentLaunch(childRunId, launchError);
          return true;
        });
      };
      if (!dispatchAttempted && registrationScope) {
        await settleFailure();
      }
      const ownsSessionCleanup = canCleanupCreatedSession?.() !== false;
      if (!ownsSessionCleanup) {
        await disposeFailedPreparation();
      }
      const cleanup = ownsSessionCleanup ? await (cleanupAttempt ??= cleanupOnce()) : undefined;
      if (dispatchAttempted || !registrationScope) {
        await settleFailure();
      }
      const completedCleanup = cleanup ?? (cleanupAttempt && (await cleanupAttempt));
      if (completedCleanup) {
        await publishCleanupCompletion(completedCleanup);
      }
      if (ownsSessionCleanup) {
        await disposeFailedPreparation();
      }
      releaseAuthority();
      return true;
    }, "subagents:spawn-cleanup");
  };
  return {
    signal: params.operatorAuthority?.signal,
    start: () => (startAttempt ??= startOnce()),
    onStartFailure: settleLaunchFailure,
    onRemoved: async (reason) => {
      try {
        if (launchRegistered) {
          await preparation?.dispose();
        } else if (reason === "cancelled" && params.operatorAuthority?.signal?.aborted) {
          // The scheduler has already removed the queued launch, so
          // custody has transferred. Release the operator-source lease HERE, before
          // awaiting settlement -- releasing only in the `finally` sequenced it after
          // a settlement that cannot complete while the lease is held, which is the
          // `sourceHolds: 1` / `collectorCleanupPending: true` liveness seam. Cleanup
          // proceeds under the independent cleanup owner, never under operator
          // authority; the `finally` release below stays as an idempotent backstop.
          const [settlement] = await Promise.allSettled([
            settleLaunchFailure(params.operatorAuthority.signal.reason),
          ]);
          // Logical failure settlement can outlive cleanup ownership. Rejoin the
          // cached disposer so retained native resources never certify cancellation.
          try {
            await preparation?.dispose();
          } catch (error) {
            if (settlement.status === "rejected" && settlement.reason !== error) {
              throw new AggregateError(
                [settlement.reason, error],
                "Collector source revocation settlement and disposal failed",
                { cause: error },
              );
            }
            throw error;
          }
          if (settlement.status === "rejected") {
            throw settlement.reason;
          }
          if (!settlement.value) {
            throw new Error("Collector source revocation settlement is pending");
          }
          const cleanup = cleanupAttempt && (await cleanupAttempt);
          if (!cleanup || !cleanupSucceeded(cleanup)) {
            const failed = cleanup?.find((result) => result.status === "rejected");
            if (failed) {
              throw failed.reason;
            }
            throw new Error("Collector source revocation cleanup is incomplete");
          }
        } else if (reason === "shutdown" || canCleanupCreatedSession?.() === false) {
          // Restart replays queuedLaunch without repeating its durable context preparation.
          await preparation?.dispose();
        } else {
          await preparation?.rollback();
        }
      } finally {
        releaseAuthority();
      }
    },
  };
}
