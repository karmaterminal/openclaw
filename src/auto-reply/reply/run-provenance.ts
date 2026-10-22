import type { DiagnosticRunFireReason } from "../../infra/diagnostic-events.js";
import type { GetReplyOptions } from "../types.js";

// Continuation work/delegate wakes and `subagent-return` (an ordinary inter-session subagent
// completion) are system-injected wakes, so their trigger travels with the queued return even
// though `subagent-return` is NOT a mid-chain continuation wake at the chain-budget reset gate
// (see get-reply-run `isContinuationWake`).
export function isContinuationHeartbeatEquivalent(
  continuationTrigger:
    | Pick<GetReplyOptions, "continuationTrigger">["continuationTrigger"]
    | undefined,
): boolean {
  return (
    continuationTrigger === "work-wake" ||
    continuationTrigger === "delegate-return" ||
    continuationTrigger === "subagent-return"
  );
}

export function resolveReplyRunFireReason(params: {
  opts?: Pick<GetReplyOptions, "continuationTrigger">;
  drainsContinuationDelegateQueue?: boolean;
}): DiagnosticRunFireReason {
  if (
    params.drainsContinuationDelegateQueue === true ||
    params.opts?.continuationTrigger === "delegate-return" ||
    params.opts?.continuationTrigger === "subagent-return"
  ) {
    return "continuation-chain";
  }
  if (params.opts?.continuationTrigger === "work-wake") {
    return "timer";
  }
  return "external-trigger";
}
