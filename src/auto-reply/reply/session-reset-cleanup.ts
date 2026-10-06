import { clearEmbeddedSessionPromptStates } from "../../agents/embedded-agent-runner/session-prompt-state.js";
import { killSessionSubagentRuns } from "../../agents/subagents/registry/subagent-control-kill.js";
import { loadExactSessionEntryReadOnly } from "../../config/sessions/session-accessor.js";
import { captureIncognitoSessionOperation } from "../../config/sessions/session-incognito-binding.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import {
  consumeSelectedSystemEventEntries,
  peekSystemEventEntries,
} from "../../infra/system-events.js";
import {
  agentSessionKeysMatchByRequestKey,
  normalizeAgentId,
  normalizeOptionalAgentId,
  parseAgentSessionKey,
} from "../../routing/session-key.js";
import { abortContinuationDispatchClaims } from "../continuation/continuation-dispatch-claims.js";
import { clearDelegateDispatchHedge } from "../continuation/delegate-dispatch-hedge.js";
import { cancelSessionContinuations } from "../continuation/session-reset.js";
import { clearTrackedContinuationTimers } from "../continuation/state.js";
import { clearContinuationWorkDispatch } from "../continuation/work-dispatch.js";
import { clearSessionLifecycleQueues } from "./queue/cleanup.js";
import {
  clearReplyRunForResetBySessionId,
  resolveActiveReplyOperationForSessionId,
} from "./reply-run-registry.js";

export class SessionResetCleanupError extends Error {}

/** Bind runtime cleanup to the parent incarnation accepted before asynchronous work. */
export function createSessionResetCleanupGuard(params: {
  storePath: string;
  sessionKey: string;
  expectedSession: Pick<SessionEntry, "sessionId" | "lifecycleRevision"> | undefined;
  assertCurrent?: () => void;
}): () => void {
  const binding = captureIncognitoSessionOperation(params);
  const sessionId = params.expectedSession?.sessionId;
  const lifecycleRevision = params.expectedSession?.lifecycleRevision;
  return () => {
    params.assertCurrent?.();
    const current = binding
      ? binding.actor.sessions.readSharing(params.sessionKey)?.entry
      : loadExactSessionEntryReadOnly({
          storePath: params.storePath,
          sessionKey: params.sessionKey,
          clone: false,
        })?.entry;
    if (current?.sessionId !== sessionId || current?.lifecycleRevision !== lifecycleRevision) {
      throw new SessionResetCleanupError(
        "Reset did not complete because the session changed before cleanup. Retry /reset.",
      );
    }
  };
}

/** Reset must report unfinished child cleanup before committing a fresh conversation. */
export async function stopSessionResetSubagents(
  params: Parameters<typeof killSessionSubagentRuns>[0] & { assertCurrent: () => void },
): Promise<void> {
  try {
    // Hooks and child finalizers can yield after reset accepted its parent. Fence
    // that incarnation before selection and at every child cancellation boundary.
    params.assertCurrent();
    const result = await killSessionSubagentRuns(params);
    params.assertCurrent();
    if (result.status === "error") {
      throw new Error(result.error);
    }
  } catch (cause) {
    if (cause instanceof SessionResetCleanupError) {
      throw cause;
    }
    throw new SessionResetCleanupError(
      "Reset did not complete because some subagent tasks could not be stopped. Inspect the remaining tasks and retry /reset.",
      { cause },
    );
  }
}

type SessionRuntimeCleanupReason = "new" | "reset" | "delete" | "idle" | "daily";

function interruptsContinuationAuthority(reason: SessionRuntimeCleanupReason): boolean {
  return reason === "new" || reason === "reset" || reason === "delete";
}

/** Clears queued follow-ups and pending system events visible to the resetting agent. */
export async function clearSessionResetRuntimeState(
  keys: Array<string | undefined>,
  opts: {
    agentId: string;
    sessionKey: string;
    reason: SessionRuntimeCleanupReason;
    activeReplySessionId?: string;
    assertCurrent: () => void;
  },
): Promise<void> {
  opts.assertCurrent();
  const normalizedKeys = [
    ...new Set(keys.flatMap((key) => (typeof key === "string" && key.trim() ? [key.trim()] : []))),
  ];
  const interruptContinuations = interruptsContinuationAuthority(opts.reason);
  if (interruptContinuations) {
    // Durable authority must close before timers, waiters, or queues are destroyed.
    // A persistence failure leaves every transient claim path intact for retry.
    for (const key of normalizedKeys) {
      await cancelSessionContinuations(key);
    }
    opts.assertCurrent();
  }

  clearEmbeddedSessionPromptStates([opts.activeReplySessionId]);
  const cleared = clearSessionLifecycleQueues({
    keys,
    agentId: opts.agentId,
    sessionKey: opts.sessionKey,
    sessionId: opts.activeReplySessionId,
    assertCurrent: opts.assertCurrent,
  });
  for (const key of cleared.keys) {
    opts.assertCurrent();
    if (interruptContinuations) {
      abortContinuationDispatchClaims(key);
      clearContinuationWorkDispatch(key);
      clearDelegateDispatchHedge(key);
      clearTrackedContinuationTimers(key);
    }
    const owner = parseAgentSessionKey(key)?.agentId;
    if (owner && owner !== normalizeAgentId(opts.agentId)) {
      continue;
    }
    const queueKey = resolveSystemEventQueueKey(key, opts.agentId);
    consumeSelectedSystemEventEntries(queueKey, peekSystemEventEntries(queueKey));
  }

  if (opts.activeReplySessionId) {
    opts.assertCurrent();
    const operation = resolveActiveReplyOperationForSessionId(opts.activeReplySessionId);
    const ownerAgentId =
      normalizeOptionalAgentId(operation?.agentId) ?? parseAgentSessionKey(operation?.key)?.agentId;
    if (
      operation &&
      ownerAgentId === normalizeAgentId(opts.agentId) &&
      operation.sessionId === opts.activeReplySessionId &&
      cleared.keys.some(
        (key) =>
          key !== opts.activeReplySessionId &&
          agentSessionKeysMatchByRequestKey(operation.key, key),
      )
    ) {
      clearReplyRunForResetBySessionId(opts.activeReplySessionId);
    }
  }
}
