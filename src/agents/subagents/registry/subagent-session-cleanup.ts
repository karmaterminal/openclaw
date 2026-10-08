import { GatewayClientRequestError } from "../../../../packages/gateway-client/src/request-error.js";
import type { SessionsDeleteParams } from "../../../../packages/gateway-protocol/src/index.js";
import { SESSION_LIFECYCLE_CHANGED_ERROR_REASON } from "../../../config/sessions/lifecycle.js";
import type { GatewayContextResolver } from "../../../gateway/server-methods/types.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import {
  getCanonicalGatewayContextResolver,
  getGatewayContextLifetime,
  withPluginRuntimeGatewayContextResolver,
} from "../../../plugins/runtime/gateway-request-scope.js";
import {
  isGatewayRestartDrainError,
  runWithGatewayDetachedWorkAdmission,
} from "../../../process/gateway-work-admission.js";
import { runOutsideAsyncWorkScope } from "../../../shared/async-work-scope.js";
import { createLazyRuntimeModule } from "../../../shared/lazy-runtime.js";
import type { SpawnSubagentMode } from "../spawn/subagent-spawn.types.js";

// Shutdown preparation must retain this importer's promise before installed chunks can change.
export const loadSubagentSessionCleanupRuntime = createLazyRuntimeModule(
  () => import("../../../gateway/server-methods/sessions-delete.js"),
);

type CallGateway = (options: {
  method: "sessions.delete";
  params: SessionsDeleteParams;
  timeoutMs: number;
  prepareDispatchCurrent?: () => Promise<void>;
  assertDispatchCurrent?: () => void;
}) => Promise<unknown>;
type SubagentSessionCleanupOutcome = "deleted" | "changed" | "failed";

const DEFERRED_SESSION_CLEANUP_RETRY_MS = 5_000;
const DEFAULT_SESSION_CLEANUP_DELETE_FAILURE_RETRIES = 3;
const cleanupRetryTimers = new Map<string, NodeJS.Timeout>();
const log = createSubsystemLogger("agents/subagent-session-cleanup");

function isSessionLifecycleChangedGatewayError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== "GatewayClientRequestError") {
    return false;
  }
  const requestError = error as Error & { gatewayCode?: unknown; details?: unknown };
  const details = requestError.details;
  return (
    requestError.gatewayCode === "INVALID_REQUEST" &&
    typeof details === "object" &&
    details !== null &&
    (details as { reason?: unknown }).reason === SESSION_LIFECYCLE_CHANGED_ERROR_REASON
  );
}

type DeleteSubagentSessionForCleanupParams = {
  callGateway: CallGateway;
  /** Transferred owner; omission keeps the caller scope, undefined resolver stays unbound. */
  gatewayBinding?: { resolveGatewayContext: GatewayContextResolver | undefined };
  prepareCurrent?: () => Promise<boolean>;
  isCurrent?: () => boolean;
  childSessionKey: string;
  spawnMode?: SpawnSubagentMode;
  emitLifecycleHooks?: boolean;
  deleteTranscript?: boolean;
  expectedSessionId?: string;
  expectedLifecycleRevision?: string;
  timeoutMs?: number;
  /** Runs after continuation guards settle, immediately before gateway dispatch. */
  onBeforeDispatch?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  deleteFailureRetries?: number;
};

function clearDeferredCleanupRetry(childSessionKey: string): void {
  const existing = cleanupRetryTimers.get(childSessionKey);
  if (!existing) {
    return;
  }
  clearTimeout(existing);
  cleanupRetryTimers.delete(childSessionKey);
}

function scheduleDeferredCleanupRetry(params: DeleteSubagentSessionForCleanupParams): void {
  if (cleanupRetryTimers.has(params.childSessionKey)) {
    return;
  }
  const handle = setTimeout(() => {
    cleanupRetryTimers.delete(params.childSessionKey);
    // The retry outlives the request that deferred it; the timer still carries
    // that request's (now drained) work scope, whose cancellation would abort the
    // prepared descendant read. Run it as its own delayed Gateway work.
    void runWithGatewayDetachedWorkAdmission(
      () => deleteSubagentSessionForCleanup(params),
      "subagents:session-cleanup-retry",
    ).catch((error: unknown) => {
      if (isGatewayRestartDrainError(error)) {
        return;
      }
      log.warn(
        `[subagent-session-cleanup-retry-failed] child=${params.childSessionKey} error=${String(error)}`,
      );
    });
  }, DEFERRED_SESSION_CLEANUP_RETRY_MS);
  handle.unref();
  cleanupRetryTimers.set(params.childSessionKey, handle);
}

export function resetSubagentSessionCleanupForTests(): void {
  for (const handle of cleanupRetryTimers.values()) {
    clearTimeout(handle);
  }
  cleanupRetryTimers.clear();
}

async function runCleanupContinuationGuards(
  params: DeleteSubagentSessionForCleanupParams,
): Promise<"changed" | "deferred" | "clear"> {
  const [
    { hasLiveContinuationCustody },
    { failStagedPostCompactionDelegatesForCleanup },
    { countActiveDescendantRuns },
  ] = await Promise.all([
    import("../../../auto-reply/continuation/work-store.js"),
    import("../../../auto-reply/continuation/delegate-store-post-compaction.js"),
    import("./subagent-registry-read.js"),
  ]);
  if (params.isCurrent?.() === false) {
    return "changed";
  }
  // Live continuation work, an in-flight regular continuation delegate, or an
  // accepted child run that still uses this session as requester owns
  // same-session re-entry. Keep the child session entry until the remaining
  // work drains, then retry, so delete-mode child sessions do not leak after
  // cleanup bookkeeping finishes AND delayed bracket/tool delegates do not lose
  // the child's chain/requester state to deletion before they finish. The
  // delegate gate counts queued AND `running` (claimed) records; the registry
  // gate covers the post-accept window after the custody record handed off but
  // the spawned continuation still depends on this requester session.
  // Post-compaction records are failed below only when cleanup is actually
  // going to delete the child: if same-session re-entry is pending, the child
  // may still reach a future compaction seam.

  if (
    (await hasLiveContinuationCustody(params.childSessionKey)) ||
    (await countActiveDescendantRuns(params.childSessionKey)) > 0
  ) {
    scheduleDeferredCleanupRetry(params);
    return "deferred";
  }
  const failedPostCompactionDelegates = await failStagedPostCompactionDelegatesForCleanup(
    params.childSessionKey,
    "Post-compaction delegate was staged by a delete-mode child session during cleanup; the completed child will not receive a future compaction seam.",
  );
  if (failedPostCompactionDelegates > 0) {
    log.warn(
      `[subagent-session-cleanup-post-compaction-delegates-dropped] child=${params.childSessionKey} count=${failedPostCompactionDelegates}`,
    );
  }
  return "clear";
}

export async function deleteSubagentSessionForCleanup(
  params: DeleteSubagentSessionForCleanupParams,
): Promise<SubagentSessionCleanupOutcome> {
  if (!params.expectedSessionId || !params.expectedLifecycleRevision) {
    return "failed";
  }
  // The continuation guards read durable state. A run's finalizer can call this while its
  // Gateway closes, and upstream requires that cleanup to settle before the Gateway
  // retires, so the reads must not inherit the closing request's work scope. A guard that
  // still fails is reported like a failed delete: onError, deferred retry, "failed".
  let guard: "changed" | "deferred" | "clear";
  try {
    guard = await runOutsideAsyncWorkScope(() => runCleanupContinuationGuards(params));
  } catch (error) {
    log.warn(
      `[subagent-session-cleanup-guard-failed] child=${params.childSessionKey} error=${error instanceof Error ? error.message : String(error)}`,
    );
    params.onError?.(error);
    scheduleDeferredCleanupRetry(params);
    return "failed";
  }
  if (guard === "changed") {
    return "changed";
  }
  if (guard === "deferred") {
    return "failed";
  }

  clearDeferredCleanupRetry(params.childSessionKey);
  const { prepareCurrent, isCurrent } = params;
  const cleanupParams: SessionsDeleteParams = {
    key: params.childSessionKey,
    deleteTranscript: params.deleteTranscript ?? true,
    emitLifecycleHooks: params.emitLifecycleHooks ?? params.spawnMode === "session",
    expectedSessionId: params.expectedSessionId,
    expectedLifecycleRevision: params.expectedLifecycleRevision,
  };
  const assertCurrent = () => {
    if (isCurrent?.() === false) {
      throw new Error("subagent cleanup owner is no longer current");
    }
  };
  const prepareDispatchCurrent = prepareCurrent
    ? async () => {
        if (!(await prepareCurrent())) {
          throw new Error("subagent cleanup owner is no longer current");
        }
      }
    : undefined;
  try {
    await params.onBeforeDispatch?.();
    const run = async () => {
      const resolver = params.gatewayBinding?.resolveGatewayContext;
      if (resolver && isCurrent) {
        const owner = getCanonicalGatewayContextResolver(resolver);
        const context = owner?.();
        if (!owner || !context) {
          throw new Error("subagent cleanup Gateway owner is no longer current");
        }
        if (!context.localEmbedded) {
          const lifetime = getGatewayContextLifetime(owner).signal;
          const assertOwner = () => {
            lifetime.throwIfAborted();
            if (owner() !== context) {
              throw new Error("subagent cleanup Gateway owner is no longer current");
            }
            assertCurrent();
          };
          // Join the captured Gateway before yielding; its closed ingress is not this cleanup's owner.
          return context.trackExecution(async () => {
            assertOwner();
            await prepareDispatchCurrent?.();
            const { deleteGatewaySession } = await loadSubagentSessionCleanupRuntime();
            assertOwner();
            const result = await deleteGatewaySession({
              params: cleanupParams,
              client: null,
              context,
              assertCurrent: assertOwner,
            });
            if (!result.ok) {
              throw new GatewayClientRequestError(result.error);
            }
          });
        }
      }
      return params.callGateway({
        method: "sessions.delete",
        params: cleanupParams,
        timeoutMs: params.timeoutMs ?? 10_000,
        ...(prepareDispatchCurrent ? { prepareDispatchCurrent } : {}),
        ...(isCurrent ? { assertDispatchCurrent: assertCurrent } : {}),
      });
    };
    // Provisional cleanup already carries its admitted Gateway in the request scope.
    await (params.gatewayBinding
      ? withPluginRuntimeGatewayContextResolver(params.gatewayBinding.resolveGatewayContext, run)
      : run());
    return "deleted";
  } catch (error) {
    if (isSessionLifecycleChangedGatewayError(error)) {
      return "changed";
    }
    const deleteFailureRetries =
      params.deleteFailureRetries ?? DEFAULT_SESSION_CLEANUP_DELETE_FAILURE_RETRIES;
    log.warn(
      `[subagent-session-cleanup-delete-failed] child=${params.childSessionKey} retriesRemaining=${deleteFailureRetries} error=${error instanceof Error ? error.message : String(error)}`,
    );
    params.onError?.(error);
    if (deleteFailureRetries > 0) {
      scheduleDeferredCleanupRetry({
        ...params,
        deleteFailureRetries: deleteFailureRetries - 1,
      });
    }
    return "failed";
  }
}
