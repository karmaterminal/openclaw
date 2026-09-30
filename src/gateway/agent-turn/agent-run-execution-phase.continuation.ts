import { consumeSubagentTraceparentHandoff } from "../../agents/subagent-traceparent-handoff.js";
import type { AgentRunRequest } from "../server-methods/agent-request-types.js";

/**
 * Continuation handoff facts for one Gateway agent run.
 *
 * Consumes the one-shot subagent traceparent handoff, so call it exactly once per
 * run. Raw RPC callers cannot opt into continuation queue ownership or classify an
 * ordinary run as a continuation-triggered handoff: those request fields pass only
 * for an internal runtime handoff or a consumed subagent handoff.
 */
export function resolveAgentRunContinuationHandoff(params: {
  runId: string;
  resolvedSessionKey?: string;
  request: AgentRunRequest;
  canUseInternalRuntimeHandoff: boolean;
  sessionContinuationTraceparent?: string;
}): Pick<AgentRunRequest, "drainsContinuationDelegateQueue" | "continuationTrigger"> & {
  traceparent?: string;
} {
  const subagentTraceparentHandoff = consumeSubagentTraceparentHandoff({
    idempotencyKey: params.runId,
    sessionKey: params.resolvedSessionKey,
  })?.traceparent;
  const trusted = params.canUseInternalRuntimeHandoff || Boolean(subagentTraceparentHandoff);
  return {
    drainsContinuationDelegateQueue: trusted
      ? params.request.drainsContinuationDelegateQueue
      : undefined,
    continuationTrigger: trusted ? params.request.continuationTrigger : undefined,
    // Persistence clears the durable one-shot field before this asynchronous dispatch.
    traceparent:
      (params.canUseInternalRuntimeHandoff ? params.request.traceparent : undefined) ??
      subagentTraceparentHandoff ??
      params.sessionContinuationTraceparent,
  };
}
