import { formatErrorMessage } from "../../../infra/errors.js";
import { cleanupMaterializedSubagentAttachments } from "../subagent-attachment-cleanup.js";
import {
  type bindSubagentSpawnCleanup,
  terminateAcceptedCollectorRun,
} from "./subagent-spawn-cleanup.js";
import {
  type PreparedContextEngineSubagentSpawn,
  rollbackPreparedContextEngine,
} from "./subagent-spawn-context.js";
import { isSpawnSubagentAdmissionCancelledError } from "./subagent-spawn-contract.js";

export async function cleanupAcceptedSubagentSpawnFailure(params: {
  phase: "dispatch" | "register";
  error: unknown;
  runId: string;
  childSessionKey: string;
  acceptedChildRunId?: string;
  /** Only a run whose registration is required is terminated on register failure. */
  registrationRequired: boolean;
  contextEnginePreparation?: PreparedContextEngineSubagentSpawn;
  attachmentId?: string;
  expectedSessionId?: string;
  expectedLifecycleRevision?: string;
  emitLifecycleHooks: boolean;
  cleanupCreatedSession: (emitLifecycleHooks: boolean) => Promise<unknown>;
  /** Retained queued-registration ownership; false means another owner holds the child now. */
  isCurrent?: () => boolean;
  /**
   * Upstream's abort-only authority (fdbf48d138): a retained registry row can still
   * own the accepted run after it stopped owning session cleanup. Defaults to `isCurrent`.
   */
  isAbortCurrent?: () => boolean;
  /** Frozen cleanup owner; its settled termination is used while the session is retained. */
  cleanupOwner?: ReturnType<typeof bindSubagentSpawnCleanup>;
  /** Launch admission retention for the owner's settled termination (non-collector only). */
  retainAdmission?: () => () => void;
  /**
   * Retained cleanup dispatch capability from the frozen cleanup owner, which was
   * created specifically to outlive the operator. After source revocation the default
   * gateway path is no longer reliable cleanup authority, so termination goes
   * unconfirmed without this. Threading it grants cleanup capability, never operator
   * authority.
   */
  callGateway?: Parameters<typeof terminateAcceptedCollectorRun>[0]["callGateway"];
}): Promise<void> {
  const cleanupFailures: unknown[] = [];
  const ownsChild = params.isCurrent?.() !== false;
  const isAbortCurrent = params.isAbortCurrent ?? params.isCurrent;
  const callGateway = params.callGateway ?? params.cleanupOwner?.callGateway;
  if (
    isAbortCurrent?.() !== false &&
    params.phase === "register" &&
    params.acceptedChildRunId &&
    (params.registrationRequired || isSpawnSubagentAdmissionCancelledError(params.error))
  ) {
    try {
      // Upstream's terminateFailedRegistrationRun split (fdbf48d138): while the
      // registry still retains the row, stop the accepted run but preserve its
      // session. The feature keeps requiring confirmed termination either way.
      const deleteSessionOnMiss = ownsChild;
      if (
        !deleteSessionOnMiss &&
        params.retainAdmission &&
        params.cleanupOwner?.terminateAcceptedRun
      ) {
        const termination = await params.cleanupOwner.terminateAcceptedRun(params.retainAdmission);
        if (termination.status !== "settled") {
          throw new Error(
            `Accepted child termination was not confirmed: ${params.acceptedChildRunId}: ${formatErrorMessage(termination.error)}. ` +
              (termination.status === "pending"
                ? "Its session is retained, and Gateway cleanup is pending."
                : "Its session is retained; Gateway cleanup could not be scheduled."),
            { cause: params.error },
          );
        }
      } else {
        const terminated = await terminateAcceptedCollectorRun({
          childSessionKey: params.childSessionKey,
          gatewayRunId: params.acceptedChildRunId,
          expectedSessionId: params.expectedSessionId,
          expectedLifecycleRevision: params.expectedLifecycleRevision,
          isCurrent: deleteSessionOnMiss ? params.isCurrent : isAbortCurrent,
          sessionCleanup: deleteSessionOnMiss ? "delete-on-abort-miss" : "preserve",
          ...(callGateway ? { callGateway } : {}),
          retry: false,
        });
        if (!terminated) {
          throw new Error(
            `Accepted child termination was not confirmed: ${params.acceptedChildRunId}`,
            { cause: params.error },
          );
        }
      }
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (!ownsChild) {
    await params.contextEnginePreparation?.dispose().catch(() => {});
  } else {
    try {
      if (
        !(await rollbackPreparedContextEngine(params.contextEnginePreparation)) &&
        params.phase === "register"
      ) {
        throw new Error("Prepared context rollback was not confirmed", { cause: params.error });
      }
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (params.attachmentId && ownsChild) {
    try {
      await cleanupMaterializedSubagentAttachments({
        childSessionKey: params.childSessionKey,
        attachmentId: params.attachmentId,
        isCurrent: params.isCurrent,
      });
    } catch {
      // Best-effort cleanup only.
    }
  }
  try {
    await params.cleanupCreatedSession(params.emitLifecycleHooks);
  } catch (error) {
    cleanupFailures.push(error);
  }
  if (cleanupFailures.length > 0) {
    const aggregate = new AggregateError(
      cleanupFailures,
      `Subagent spawn cleanup incomplete: ${params.acceptedChildRunId ?? params.runId}`,
    );
    aggregate.cause = cleanupFailures[0];
    throw aggregate;
  }
}
