/** Descendant-settle wake dispatch for an announcing child run (continuation-owned). */
import { buildAnnounceIdFromChildRun } from "../../announce-idempotency.js";
import {
  stripWakeRunSuffixes,
  wakeSubagentRunAfterDescendants,
} from "./subagent-announce-descendant-wake.js";
import type { SubagentAnnounceFlowParams } from "./subagent-announce.types.js";

/**
 * Wakes the announcing child run with its settled descendants' findings, keyed by the
 * announce id of the child's original (suffix-stripped) run.
 */
export async function wakeSubagentRunWithDescendantFindings(
  flow: Pick<
    SubagentAnnounceFlowParams,
    | "childRunId"
    | "childSessionKey"
    | "runTimeoutSeconds"
    | "label"
    | "task"
    | "resolveGatewayContext"
    | "signal"
  >,
  wake: {
    findings: string;
    prepareCurrent: () => Promise<boolean>;
    isChildSessionEffectsAllowed: () => boolean;
  },
  deps: Parameters<typeof wakeSubagentRunAfterDescendants>[1],
): ReturnType<typeof wakeSubagentRunAfterDescendants> {
  const wakeAnnounceId = buildAnnounceIdFromChildRun({
    childSessionKey: flow.childSessionKey,
    childRunId: stripWakeRunSuffixes(flow.childRunId),
  });
  return await wakeSubagentRunAfterDescendants(
    {
      runId: flow.childRunId,
      childSessionKey: flow.childSessionKey,
      runTimeoutSeconds: flow.runTimeoutSeconds,
      taskLabel: flow.label || flow.task || "task",
      findings: wake.findings,
      announceId: wakeAnnounceId,
      prepareCurrent: wake.prepareCurrent,
      isChildSessionEffectsAllowed: wake.isChildSessionEffectsAllowed,
      resolveGatewayContext: flow.resolveGatewayContext,
      signal: flow.signal,
    },
    deps,
  );
}
