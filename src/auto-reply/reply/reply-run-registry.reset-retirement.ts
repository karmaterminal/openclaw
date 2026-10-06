import { computeBackoff, type BackoffPolicy } from "../../infra/backoff.js";
import { diagnosticLogger as diag } from "../../logging/diagnostic-runtime.js";
import { resolveGlobalSingleton } from "../../shared/global-singleton.js";
import type { ReplyOperation } from "./reply-run-registry.contracts.js";
import { getAttachedBackend, replyRunState } from "./reply-run-registry.state.js";

/**
 * A committed session reset owns the session's durable state, not the old run's
 * backend. When the backend refuses cancellation the reset still succeeds, but
 * the old owner stays registered as "retiring" so no successor can run beside
 * it. Custody ends only on a confirmed stop: a cancellation attempt that returns,
 * or the owner completing itself.
 */
export type ReplyRunResetCancellation =
  | { status: "none" }
  | { status: "retired" }
  | { status: "retiring"; attempts: number; error: unknown };

type RetiringReset = { attempts: number; timer?: NodeJS.Timeout };

const RESET_CANCELLATION_RETRY_POLICY: BackoffPolicy = {
  initialMs: 1_000,
  maxMs: 30_000,
  factor: 2,
  jitter: 0,
};

// Shared across transformed module graphs, like the rest of the reply-run state.
const retiringResets = resolveGlobalSingleton(
  Symbol.for("openclaw.replyRunRegistry.retiringResets"),
  () => new Map<ReplyOperation, RetiringReset>(),
);

export function isReplyOperationRetiringForReset(operation: ReplyOperation): boolean {
  return retiringResets.has(operation);
}

function isRegistered(operation: ReplyOperation): boolean {
  return replyRunState.activeRunsByKey.get(operation.key) === operation;
}

function dropRetirement(operation: ReplyOperation): void {
  const entry = retiringResets.get(operation);
  if (entry?.timer) {
    clearTimeout(entry.timer);
  }
  retiringResets.delete(operation);
}

function scheduleRetry(operation: ReplyOperation, entry: RetiringReset): void {
  if (entry.timer) {
    clearTimeout(entry.timer);
  }
  entry.timer = setTimeout(
    () => {
      entry.timer = undefined;
      cancelReplyOperationForReset(operation);
    },
    computeBackoff(RESET_CANCELLATION_RETRY_POLICY, entry.attempts),
  );
  entry.timer.unref?.();
}

/** Request backend cancellation for a reset; never releases an owner whose cancel failed. */
export function cancelReplyOperationForReset(operation: ReplyOperation): ReplyRunResetCancellation {
  if (!isRegistered(operation)) {
    // The owner already left the slot, which is the confirmed stop.
    dropRetirement(operation);
    return { status: "none" };
  }
  try {
    if (operation.phase === "aborted") {
      getAttachedBackend(operation)?.cancel("restart");
    } else {
      operation.abortForRestart();
    }
  } catch (error) {
    let entry = retiringResets.get(operation);
    if (!entry) {
      entry = { attempts: 0 };
      retiringResets.set(operation, entry);
      // Owner completion is the other confirmed stop; stop retrying at once.
      void operation.ownerSettlement?.then(() => dropRetirement(operation));
    }
    entry.attempts += 1;
    scheduleRetry(operation, entry);
    diag.warn(
      `reply run reset cancellation failed; previous run still stopping: sessionKey=${operation.key} attempts=${entry.attempts} error=${String(error)}`,
    );
    return { status: "retiring", attempts: entry.attempts, error };
  }
  dropRetirement(operation);
  if (isRegistered(operation)) {
    operation.complete();
  }
  return { status: "retired" };
}

export function resetRetiringReplyRunsForTest(): void {
  for (const operation of [...retiringResets.keys()]) {
    dropRetirement(operation);
  }
}
