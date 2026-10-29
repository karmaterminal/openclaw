import { readSessionEntryReadOnlyInWorker } from "../../../config/sessions/session-entry-read-runtime.js";
import type { SessionEntry } from "../../../config/sessions/types.js";
import type { callGateway as GatewayCaller } from "../../../gateway/call.js";
import { bindGatewayLifecycleRequest } from "../../../gateway/server-lifecycle-runtime-context.js";
import { normalizeDiagnosticTraceparent } from "../../../infra/diagnostic-trace-context.js";
import { isIncognitoSessionKey } from "../../../routing/session-key.js";
import { resolveSubagentChildAgentId } from "../registry/subagent-child-owner-match.js";
import type { SubagentRunRecord } from "../registry/subagent-registry.types.js";
import { withSubagentSessionSource } from "../spawn/subagent-session-source.js";

export { resolveContinuationRuntimeConfig } from "../../../auto-reply/continuation/config.js";
export { dispatchGatewayMethodInProcess } from "../../../gateway/server-plugin-in-process-dispatch.js";
export { getRuntimeConfig } from "../../../config/config.js";
export { resolveSessionStorePathCore } from "../../../config/sessions.js";

export type ContinuationSpawnParams = Pick<
  SubagentRunRecord,
  | "silentAnnounce"
  | "wakeOnReturn"
  | "continuationTargetSessionKey"
  | "continuationTargetSessionKeys"
  | "continuationFanoutMode"
  | "continuationRecipientAuthorityBinding"
  | "traceparent"
> & {
  continuationDelegateFlowId?: string;
  /**
   * Precomputed `continuation:` child run id (RFC §5.4.4, Q2). Spawn uses it verbatim
   * as the Gateway run id, so the admitted registry row's `run_id` equals it. In-process
   * continuation callers only: `sessions_spawn` never forwards it.
   */
  continuationChildRunId?: string;
  drainsContinuationDelegateQueue?: boolean;
  continuationChainState?: {
    count: number;
    startedAt: number;
    tokens: number;
    chainId?: string;
  };
};
function normalizeNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}
export function buildContinuationSessionPatch(
  params: ContinuationSpawnParams,
): Partial<SessionEntry> {
  const patch: Partial<SessionEntry> = {};
  if (params.drainsContinuationDelegateQueue) {
    patch.subagentRole = "orchestrator";
    patch.subagentControlScope = "children";
  }
  const continuationTraceparent = normalizeDiagnosticTraceparent(params.traceparent);
  if (continuationTraceparent) {
    patch.continuationTraceparent = continuationTraceparent;
  }
  const chainState = params.continuationChainState;
  if (chainState) {
    patch.continuationChainCount = normalizeNonNegativeInteger(chainState.count);
    patch.continuationChainStartedAt = normalizeNonNegativeInteger(chainState.startedAt);
    patch.continuationChainTokens = normalizeNonNegativeInteger(chainState.tokens);
    const chainId = chainState.chainId?.trim();
    if (chainId) {
      patch.continuationChainId = chainId;
    }
  }
  return patch;
}

export async function readSubagentSessionEntry(
  storePath: string,
  sessionKey: string,
  explicitAgentId?: string,
) {
  const agentId = resolveSubagentChildAgentId({
    childSessionKey: sessionKey,
    childAgentId: explicitAgentId,
  });
  if (!agentId) {
    return undefined;
  }
  return withSubagentSessionSource({ agentId, storePath, sessionKey }, async (source) =>
    source
      ? source.actor.snapshot(source.authority)?.entry
      : isIncognitoSessionKey(sessionKey)
        ? undefined
        : readSessionEntryReadOnlyInWorker({ storePath, sessionKey, agentId }),
  );
}
export const callSubagentLifecycleGateway: typeof GatewayCaller = (request) =>
  bindGatewayLifecycleRequest()(request);
export { callGateway } from "../../../gateway/call.js";
export { readSessionMessagesAsync } from "../../../gateway/session-transcript-readers.js";
