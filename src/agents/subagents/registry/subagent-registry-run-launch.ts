import { resolvePhysicalSessionStorePath } from "../../../config/sessions/session-store-path.js";
import type { GatewayContextResolver } from "../../../gateway/server-methods/types.js";
import { captureOperatorToolGatewayContinuationContext } from "../../../gateway/server-plugin-in-process-dispatch.js";
import {
  getAgentEventLifecycleGeneration,
  isAgentEventLifecycleGenerationCurrent,
} from "../../../infra/agent-events.js";
import { readExecRequestOwners } from "../../../infra/exec-request-context.js";
import { hasSqliteWorkerOutcomeUnknown } from "../../../infra/sqlite-worker-contract.js";
import {
  bindGatewayContextResolver,
  getGatewayContextResolver,
} from "../../../plugins/runtime/gateway-request-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import { emitSessionLifecycleEvent } from "../../../sessions/session-lifecycle-events.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import { normalizeDeliveryContext } from "../../../utils/delivery-context.shared.js";
import { resolveSubagentRequesterAgentId } from "../../subagent-requester-owner.js";
import {
  prepareTerminatedCollectorLaunch,
  prepareSwarmCollectorCompletion,
  clearPublishedSwarmCollectorOutput,
  updateSwarmCollectorCompletion,
} from "../swarm/swarm-collector.js";
import { bindSwarmRunReservation, ownsSwarmRunReservation } from "../swarm/swarm-scheduler.js";
import { resolveSubagentChildAgentId } from "./subagent-child-owner-match.js";
import { bindSubagentExecRequestOwners } from "./subagent-exec-request-ownership.js";
import {
  getCurrentSubagentRunOwner,
  subagentRuns,
  waitForSubagentRetirementPublication,
} from "./subagent-registry-memory.js";
import {
  SubagentRegistryWriteError,
  assertSubagentRegistryWriteSourceCurrent,
  mutateSubagentRuns,
  SubagentRegistryMutationRejectedError,
} from "./subagent-registry-persistence.js";
import { resolveSwarmWaitOwnerSessionKeys } from "./subagent-registry-queries.js";
import { registerRequiredQueuedSubagent } from "./subagent-registry-queued-registration.js";
import { planQueuedSubagentRunStart } from "./subagent-registry-run-launch-queued.js";
import {
  createFailedQueuedRun,
  createSubagentRegistrationRecord,
  type RegisterSubagentRunParams,
} from "./subagent-registry-run-launch-record.js";
import { SubagentRecoveryManager } from "./subagent-registry-run-recovery.js";
import * as spawnAcceptance from "./subagent-registry-spawn-acceptance.js";
import { prepareSubagentRegistrationRows } from "./subagent-registry-state.js";
import type {
  RegisterSubagentRunOptions,
  SubagentRegistrationOwnership,
  SubagentRegistrationScope,
  SubagentRunRecord,
} from "./subagent-registry.types.js";
import {
  compareSubagentRunGeneration,
  getSubagentRunRuntimeKey,
  isSameSubagentRunOwner,
  isSubagentRunGenerationCandidate,
  nextSubagentRunGeneration,
} from "./subagent-run-generation.js";

export type { RegisterSubagentRunParams } from "./subagent-registry-run-launch-record.js";
export type {
  SubagentRegistrationIdentity,
  SubagentRegistrationOwnership,
} from "./subagent-registry.types.js";

class SubagentRegistrationError extends AggregateError {
  constructor(
    errors: unknown[],
    message: string,
    readonly registrationOwnership: Exclude<
      SubagentRegistrationOwnership,
      { status: "new-row-committed" }
    >,
  ) {
    super(errors, message);
    this.name = "SubagentRegistrationError";
    this.cause = errors[0];
  }
}

export class SubagentLaunchManager extends SubagentRecoveryManager {
  private findRunByIdentity(runId: string): SubagentRunRecord | undefined {
    return (
      this.options.runs.get(runId) ??
      [...this.options.runs.values()].find((candidate) => candidate.swarmRunId === runId)
    );
  }

  readonly registerSubagentRun = async (
    registerParams: RegisterSubagentRunParams,
    options: RegisterSubagentRunOptions = {},
  ): Promise<SubagentRegistrationOwnership> => {
    const runId = registerParams.runId.trim();
    const childSessionKey = registerParams.childSessionKey.trim();
    const requesterSessionKey = registerParams.requesterSessionKey.trim();
    const now = Date.now();
    if (!runId || !childSessionKey || !requesterSessionKey) {
      return {
        status: "unknown",
        attempted: { runId, childSessionKey, generation: 0, createdAt: now },
      };
    }
    const lifecycleGeneration = getAgentEventLifecycleGeneration();
    const cfg = this.options.getRuntimeConfig();
    const requesterAgentId = resolveSubagentRequesterAgentId(cfg, registerParams);
    const controllerSessionKey = registerParams.controllerSessionKey?.trim() || requesterSessionKey;
    const childAgentId = resolveSubagentChildAgentId(registerParams);
    if (registerParams.childAgentId === undefined || !childAgentId) {
      throw new Error(
        "Subagent registration requires an explicit valid child agent matching its session key.",
      );
    }
    if (!registerParams.sessionEntry?.sessionId?.trim()) {
      throw new Error(
        "Subagent registration requires the original child sessionId. Inspect the created child and its run before retrying; do not register a replacement from the current session key.",
      );
    }
    const context = captureOpenClawStateWorkerContext();
    const gatewayContextResolver = registerParams.gatewayContextResolver;
    const gatewayContext = gatewayContextResolver?.();
    let selected = this.options.runs.get(runId);
    const registrationOwnership = subagentRuns.captureRegistrationOwnership(
      childSessionKey,
      undefined,
      childAgentId,
    );
    let authority: Awaited<ReturnType<typeof captureOperatorToolGatewayContinuationContext>>;
    let preparedRows: (() => ReadonlyMap<string, SubagentRunRecord>) | undefined;
    let plannedEntry: SubagentRunRecord | undefined;
    let registered: SubagentRunRecord | undefined;
    let custodyTransferred = false;
    let queuedScope: SubagentRegistrationScope | undefined;
    let initialOutcome: "pending" | "refused" | "uncertain" = "pending";
    let initialFailure: unknown;
    let registrationSettled = false;
    let activated = false;
    let replayedOwner: SubagentRunRecord | undefined;
    const currentEntry = () =>
      registered && getCurrentSubagentRunOwner(this.options.runs, registered);
    const registryCurrent = () => {
      try {
        assertSubagentRegistryWriteSourceCurrent(context);
        return isAgentEventLifecycleGenerationCurrent(lifecycleGeneration);
      } catch {
        return false;
      }
    };
    const ownsSession = () => {
      const observed = registered ?? plannedEntry;
      return (
        preparedRows !== undefined &&
        !registrationOwnership.superseded &&
        (!selected || observed !== undefined) &&
        (!this.options.runs.has(runId) ||
          (observed !== undefined &&
            isSameSubagentRunOwner(this.options.runs.get(runId), observed))) &&
        !Array.from(this.options.getRunsForChildSession(childSessionKey, childAgentId)).some(
          (candidate) =>
            !observed ||
            (!isSameSubagentRunOwner(candidate, observed) &&
              compareSubagentRunGeneration(candidate, observed) > 0),
        )
      );
    };
    const ownsCleanupSession = () =>
      preparedRows !== undefined &&
      ![
        ...preparedRows().values(),
        ...this.options.getChildSessionCandidates(childSessionKey),
      ].some(
        (candidate) =>
          candidate.runId !== registered?.runId &&
          isSubagentRunGenerationCandidate(candidate, childSessionKey, childAgentId),
      );
    const canCleanupRefusedIntent = () =>
      initialOutcome === "refused" &&
      ownsCleanupSession() &&
      !selected &&
      !this.options.runs.has(runId) &&
      registryCurrent();
    const activate = () => {
      this.options.ensureListener();
      this.options.startSweeper();
    };
    try {
      const queuedRegistration = registerParams.queued;
      const settleFailedLaunch = async (error: string) => {
        if (queuedRegistration && queuedScope) {
          return queuedScope.settleFailedLaunch(error);
        }
        if (initialOutcome === "uncertain") {
          throw initialFailure;
        }
        if (queuedRegistration && initialOutcome === "pending") {
          throw new SubagentRegistryMutationRejectedError("Queued registration has not settled");
        }
      };
      options.retainOwnership?.(
        queuedRegistration
          ? Object.freeze({
              waitForClaim: () => queuedScope?.waitForClaim(),
              waitForRetirementPublication: () => queuedScope?.waitForRetirementPublication(),
              canLaunch: () => queuedScope?.canLaunch() ?? false,
              canAcceptLaunch: () => queuedScope?.canAcceptLaunch() ?? false,
              canAbortAcceptedRun: () => queuedScope?.canAbortAcceptedRun() ?? false,
              canCleanupSession: () =>
                ownsCleanupSession() &&
                (queuedScope?.canCleanupSession() ?? canCleanupRefusedIntent()),
              canRetireReservation: () =>
                queuedScope?.canRetireReservation() ?? canCleanupRefusedIntent(),
              settleFailedLaunch,
            })
          : Object.freeze({
              waitForClaim: () => undefined,
              waitForRetirementPublication: () =>
                registered && waitForSubagentRetirementPublication(registered),
              canLaunch: () =>
                activated && registryCurrent() && Boolean(currentEntry()) && ownsSession(),
              canAcceptLaunch: () =>
                registered !== undefined &&
                !subagentRuns.isCompletionAuthorityRetired(registered) &&
                registryCurrent() &&
                Boolean(currentEntry()) &&
                ownsSession(),
              canAbortAcceptedRun: () => registryCurrent() && ownsSession(),
              canCleanupSession: () =>
                registrationSettled &&
                initialOutcome !== "uncertain" &&
                registryCurrent() &&
                ownsCleanupSession() &&
                ownsSession() &&
                !currentEntry(),
              canRetireReservation: () =>
                Boolean(
                  registered &&
                  ownsSwarmRunReservation(
                    registered.schedulerSlotId ?? runId,
                    getSubagentRunRuntimeKey(registered),
                  ),
                ),
              settleFailedLaunch,
            }),
      );
      authority = await captureOperatorToolGatewayContinuationContext();
      const assertCurrent = () => {
        options.assertCurrent?.();
        authority?.assertCurrent();
        authority?.signal.throwIfAborted();
        registrationOwnership.assertCurrent();
        if (!isAgentEventLifecycleGenerationCurrent(lifecycleGeneration)) {
          throw new SubagentRegistryMutationRejectedError(
            "Subagent registration lifecycle changed",
          );
        }
      };
      assertCurrent();
      preparedRows = await prepareSubagentRegistrationRows(
        childSessionKey,
        [
          runId,
          ...Array.from(
            this.options.getChildSessionCandidates(childSessionKey),
            (row) => row.runId,
          ),
        ],
        context,
      );
      selected ??= preparedRows().get(runId);
      assertCurrent();
      const isGenerationCandidate = (row: SubagentRunRecord) =>
        isSubagentRunGenerationCandidate(row, childSessionKey, childAgentId);
      const runIds = new Set([
        runId,
        ...[...preparedRows().values(), ...this.options.getChildSessionCandidates(childSessionKey)]
          .filter(isGenerationCandidate)
          .map((row) => row.runId),
      ]);
      const result = await mutateSubagentRuns(
        [...runIds],
        (rows) => {
          assertCurrent();
          const previous = rows.get(runId);
          if (previous && resolveSubagentChildAgentId(previous) !== childAgentId) {
            throw new SubagentRegistryMutationRejectedError(
              "Subagent registration cannot replace an unresolved or different child owner.",
            );
          }
          if (previous && options.acceptedRunReplay === true) {
            if (
              previous.childSessionKey !== childSessionKey ||
              previous.requesterSessionKey !== requesterSessionKey ||
              previous.requesterAgentId !== requesterAgentId ||
              previous.requesterTurnRunId !==
                (registerParams.requesterTurnRunId?.trim() || undefined) ||
              previous.expectsCompletionMessage !== registerParams.expectsCompletionMessage ||
              Boolean(previous.collect) !== Boolean(registerParams.collect)
            ) {
              throw new SubagentRegistryMutationRejectedError(
                "Accepted run already has another completion owner; inspect it before retrying.",
              );
            }
            subagentRuns.runWithCompletionAuthority(previous, () => options.assertCurrent?.());
            replayedOwner = previous;
            return { value: undefined };
          }
          if (selected ? !isSameSubagentRunOwner(previous, selected) : previous !== undefined) {
            throw new SubagentRegistryMutationRejectedError(
              "Subagent registration owner changed during preparation",
            );
          }
          const candidates = [...this.options.getChildSessionCandidates(childSessionKey)].filter(
            isGenerationCandidate,
          );
          if (candidates.some((row) => !runIds.has(row.runId))) {
            throw new SubagentRegistryMutationRejectedError("Subagent registration cohort changed");
          }
          const entry = createSubagentRegistrationRecord(registerParams, {
            now: Date.now(),
            generation: nextSubagentRunGeneration(rows.values(), childSessionKey, childAgentId),
            lifecycleGeneration,
            childAgentId,
            requesterAgentId,
            requesterOrigin: normalizeDeliveryContext(registerParams.requesterOrigin),
            swarmWaitOwnerSessionKeys:
              registerParams.collect && registerParams.swarmRequesterSessionKey
                ? resolveSwarmWaitOwnerSessionKeys(
                    this.options.getRunsForChildSession,
                    registerParams.swarmRequesterSessionKey,
                    requesterAgentId,
                  )
                : undefined,
          });
          entry.requesterStorePath =
            previous?.requesterStorePath ??
            resolvePhysicalSessionStorePath(
              { sessionKey: requesterSessionKey, agentId: requesterAgentId },
              cfg,
            );
          entry.controllerStorePath =
            previous?.controllerStorePath ??
            resolvePhysicalSessionStorePath(
              {
                sessionKey: controllerSessionKey,
                agentId: resolveAgentIdFromSessionKey(controllerSessionKey, requesterAgentId),
              },
              cfg,
            );
          const postimages = this.planSupersededKillReconciliations(rows, entry);
          postimages.set(runId, entry);
          plannedEntry = entry;
          return {
            value: entry,
            postimages,
          };
        },
        {
          runs: this.options.runs,
          preparedRows,
          context,
          assertCurrent,
          onPublished: (postimages, planned) => {
            const entry = planned && postimages.get(planned.runId);
            if (!entry) {
              return;
            }
            registered = entry;
            // The launch owner holds the arm until its final acceptance owner decides.
            spawnAcceptance.holdSubagentSpawnAcceptance(entry);
            bindGatewayContextResolver(entry, gatewayContextResolver);
            options.retainAdmission?.(
              this.captureAdmissionRejection(entry, options.admissionSessionEffects),
            );
            try {
              options.assertPublicationCurrent?.();
              bindSubagentExecRequestOwners(entry, readExecRequestOwners(options), {
                controllerSessionKey,
                controllerAgentId: resolveAgentIdFromSessionKey(
                  controllerSessionKey,
                  requesterAgentId,
                ),
              });
              if (authority && !registerParams.collect) {
                subagentRuns.bindCompletionAuthority(
                  entry,
                  authority,
                  options.requesterRunInstance,
                );
                custodyTransferred = true;
              }
            } finally {
              if (!registrationOwnership.superseded) {
                registrationOwnership.accept(entry);
              }
              bindSwarmRunReservation(
                entry.schedulerSlotId ?? runId,
                getSubagentRunRuntimeKey(entry),
                () => {
                  const current = getCurrentSubagentRunOwner(this.options.runs, entry);
                  if (current) {
                    emitSessionLifecycleEvent({
                      sessionKey: current.childSessionKey,
                      reason: "run-capacity",
                      scope: "runtime",
                    });
                  }
                },
              );
            }
          },
        },
      );
      if (!result) {
        // The replayed row is the committed owner; a missing generation reads as 0, like
        // "unknown", so an owned rollback against it fails closed instead of matching.
        return replayedOwner
          ? {
              status: "new-row-committed",
              attempted: {
                runId: replayedOwner.runId,
                childSessionKey: replayedOwner.childSessionKey,
                generation: replayedOwner.generation ?? 0,
                createdAt: replayedOwner.createdAt,
              },
            }
          : {
              status: "unknown",
              attempted: { runId, childSessionKey, generation: 0, createdAt: now },
            };
      }
      const published = currentEntry();
      if (!published) {
        throw new SubagentRegistryMutationRejectedError(
          "Subagent registration lost its acknowledged run owner",
        );
      }
      if (registerParams.queued) {
        await registerRequiredQueuedSubagent({
          context,
          entry: published,
          manager: this.options,
          activate,
          ...options,
          retainOwnership: (scope) => {
            queuedScope = scope;
          },
        });
      } else {
        assertSubagentRegistryWriteSourceCurrent(context);
        options.assertCurrent?.();
        options.assertPublicationCurrent?.();
        authority?.assertCurrent();
        authority?.signal.throwIfAborted();
        const current = currentEntry();
        if (
          !isAgentEventLifecycleGenerationCurrent(lifecycleGeneration) ||
          !current ||
          !ownsSession() ||
          current.killIntent ||
          current.killReconciliation ||
          getGatewayContextResolver(current) !== gatewayContextResolver ||
          (gatewayContextResolver &&
            (!gatewayContext || gatewayContextResolver() !== gatewayContext))
        ) {
          throw new SubagentRegistryMutationRejectedError(
            "Subagent registration lost its original run owner",
          );
        }
        activate();
        activated = true;
        void this.waitForSubagentCompletion(
          runId,
          current,
          this.options.resolveSubagentWaitTimeoutMs(cfg, registerParams.runTimeoutSeconds ?? 0),
        );
      }
      return {
        status: "new-row-committed",
        attempted: {
          runId: published.runId,
          childSessionKey: published.childSessionKey,
          generation: published.generation ?? 0,
          createdAt: published.createdAt,
        },
      };
    } catch (error) {
      if (!queuedScope) {
        initialOutcome =
          hasSqliteWorkerOutcomeUnknown(error) ||
          (error instanceof SubagentRegistryWriteError &&
            error.outcome === "committed" &&
            !registered)
            ? "uncertain"
            : "refused";
        initialFailure = error;
      }
      // Failed after publication: no caller owns the arm, so release it to the sweeper.
      spawnAcceptance.releaseSubagentSpawnAcceptanceHold(registered);
      if (!registerParams.queued && registered && !activated) {
        subagentRuns.retireCompletionAuthority(registered);
        if (registryCurrent() && currentEntry()) {
          // A committed child still needs terminal observation after its caller retires.
          activate();
        }
      }
      if (
        registered &&
        error instanceof SubagentRegistryWriteError &&
        error.outcome === "not-committed"
      ) {
        subagentRuns.releaseCompletionAuthority(registered);
      }
      if (!registered && initialOutcome === "refused") {
        // The registry mutation was refused before publication, so the attempted row never
        // replaced its predecessor; carry that ownership to the accepted-spawn rollback owner.
        const attempted = {
          runId,
          childSessionKey,
          generation: plannedEntry?.generation ?? 0,
          createdAt: plannedEntry?.createdAt ?? now,
        };
        throw new SubagentRegistrationError(
          [error],
          error instanceof Error
            ? error.message
            : `Subagent registration persistence failed: ${runId}`,
          selected
            ? {
                status: "predecessor-restored",
                attempted,
                predecessor: {
                  runId: selected.runId,
                  childSessionKey: selected.childSessionKey,
                  generation: selected.generation,
                  createdAt: selected.createdAt,
                },
              }
            : { status: "no-new-row", attempted },
        );
      }
      throw error;
    } finally {
      registrationSettled = true;
      if (!custodyTransferred) {
        authority?.release();
      }
      registrationOwnership.release();
    }
  };

  readonly startQueuedSubagentRun = async (
    runId: string,
    gatewayRunId?: string,
    lifecycleGeneration?: string,
    gatewayContextResolver?: GatewayContextResolver,
  ): Promise<boolean> => {
    const selected = this.findRunByIdentity(runId.trim());
    if (!selected) {
      return false;
    }
    const nextRunId = gatewayRunId?.trim() || selected.runId;
    const acceptedLifecycleGeneration = lifecycleGeneration ?? getAgentEventLifecycleGeneration();
    if (!isAgentEventLifecycleGenerationCurrent(acceptedLifecycleGeneration)) {
      return false;
    }
    const assertLaunchCurrent = () => {
      if (!isAgentEventLifecycleGenerationCurrent(acceptedLifecycleGeneration)) {
        throw new SubagentRegistryMutationRejectedError(
          "Queued subagent launch lifecycle changed before commit",
        );
      }
    };
    const context = captureOpenClawStateWorkerContext();
    const started = await mutateSubagentRuns(
      [selected.runId, nextRunId],
      (rows) =>
        planQueuedSubagentRunStart(
          rows,
          selected,
          nextRunId,
          acceptedLifecycleGeneration,
          context.admission,
        ),
      {
        runs: this.options.runs,
        context,
        assertCurrent: assertLaunchCurrent,
        onPublished: (postimages, result) => {
          const entry = postimages.get(nextRunId);
          if (entry && result) {
            if (result.source.runId !== entry.runId) {
              subagentRuns.publishQueuedSubagentRunRekey(result.source, entry);
            }
            bindGatewayContextResolver(entry, gatewayContextResolver);
          }
        },
      },
    );
    if (!started) {
      return false;
    }
    if (!started.terminalBeforeAcceptance) {
      void this.waitForSubagentCompletion(nextRunId, started.entry);
    }
    return true;
  };

  readonly settleFailedQueuedSubagentLaunch = async (
    runId: string,
    error: string,
  ): Promise<boolean> => {
    const selected = this.findRunByIdentity(runId);
    if (!selected?.collect) {
      return false;
    }
    // Usage preparation can outlive completion; retain the phase selected for this attempt.
    const wasQueued = typeof selected.execution.endedAt !== "number";
    const context = captureOpenClawStateWorkerContext();
    const prepared = await prepareSwarmCollectorCompletion(
      selected,
      this.options.getRuntimeConfig(),
      () => assertSubagentRegistryWriteSourceCurrent(context),
    );
    return mutateSubagentRuns(
      [selected.runId],
      (rows) => {
        const current = rows.get(selected.runId);
        if (!current || !isSameSubagentRunOwner(current, selected) || current.killIntent) {
          return { value: false };
        }
        let entry: SubagentRunRecord;
        if (wasQueued) {
          if (current.execution.status !== "queued" || current.killReconciliation) {
            return { value: false };
          }
          entry = createFailedQueuedRun(current, error);
          // The failed launch is settled; a dispatched marker has nothing left to guard.
          delete entry.launchDispatch;
          updateSwarmCollectorCompletion(entry, this.options.getRuntimeConfig(), prepared);
        } else {
          const endedAt = current.execution.endedAt;
          if (!current.collect || typeof endedAt !== "number") {
            return { value: false };
          }
          if (current.collectorCompletion && !current.launchDispatch) {
            return { value: true };
          }
          entry = { ...current };
          delete entry.launchDispatch;
          if (current.collectorCompletion) {
            return { value: true, postimages: new Map([[entry.runId, entry]]) };
          }
          prepareTerminatedCollectorLaunch(
            entry,
            endedAt,
            error,
            () => this.options.getRuntimeConfig(),
            prepared,
          );
        }
        return { value: true, postimages: new Map([[entry.runId, entry]]) };
      },
      {
        runs: this.options.runs,
        context,
        onPublished: (postimages) => {
          const published = postimages.get(selected.runId);
          if (published) {
            clearPublishedSwarmCollectorOutput(published);
          }
        },
      },
    );
  };
}
