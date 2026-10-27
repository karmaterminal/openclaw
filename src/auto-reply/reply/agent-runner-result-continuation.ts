// Continuation (karmaterminal): post-turn continuation accounting for accountAgentTurn, kept beside
// agent-runner-result-accounting.ts so that file stays under its line cap. The caller keeps the
// order: no-op rearm recording, replay-unsafe settlement, chain reset and entry refresh, then the
// signal extraction.
import type { EmbeddedAgentRunResult } from "../../agents/embedded-agent.js";
import {
  formatCurrentSpanContinuationTraceparent,
  resolveContinuationTraceparent,
} from "../../infra/continuation-tracer.js";
import { defaultRuntime } from "../../runtime.js";
import { resolveLiveContinuationRuntimeConfig } from "../continuation/config.js";
import { failQueuedDelegatesOwnedByRun } from "../continuation/delegate-store.js";
import {
  extractContinuationSignal,
  type ContinuationSignalExtraction,
} from "../continuation/signal.js";
import type { ContinueWorkRequest } from "../continuation/types.js";
import type { ReplyPayload } from "../types.js";
import type { FinalizeReplyAgentRunInput } from "./agent-runner-result.types.js";
import { recordNoOpRearmOutcome, summarizeEmbeddedRunOutcome } from "./no-op-rearm-guard.js";

/**
 * Post-turn no-op replay outcome recording. Record before the continuation/followup scheduling so
 * a no-op self-rearm turn increments the streak before it can schedule the next same-family wake.
 * This is also the recording site for continuation turns driven through getReplyFromConfig.
 */
export function recordReplyNoOpRearmOutcome(
  params: Pick<FinalizeReplyAgentRunInput, "noOpRearmWakeClass" | "opts" | "replySessionKey"> & {
    runId: string;
    runResult: EmbeddedAgentRunResult;
  },
): void {
  const { noOpRearmWakeClass, opts, replySessionKey, runResult } = params;
  if (!noOpRearmWakeClass || !replySessionKey) {
    return;
  }
  const facts = summarizeEmbeddedRunOutcome(runResult);
  const messageToolOnlyWithoutDelivery =
    opts?.sourceReplyDeliveryMode === "message_tool_only" &&
    runResult.didSendViaMessagingTool !== true &&
    runResult.didDeliverSourceReplyViaMessageTool !== true;
  recordNoOpRearmOutcome({
    sessionKey: replySessionKey,
    wakeClass: noOpRearmWakeClass,
    runId: params.runId,
    ...(messageToolOnlyWithoutDelivery
      ? { facts: { ...facts, hasVisibleReply: false } }
      : { facts }),
  });
}

/**
 * An incomplete, replay-unsafe turn elects nothing: its continue_work elections are ignored and
 * the delegates it queued are failed. Returns the elections that still count.
 */
export async function settleReplayUnsafeContinuationRequests(params: {
  continueWorkRequests: ContinueWorkRequest[];
  replayUnsafeIncompleteTurn: boolean;
  sessionKey: string | undefined;
  runId: string;
  runStartedAt: number;
}): Promise<ContinueWorkRequest[]> {
  const { continueWorkRequests, sessionKey } = params;
  if (!params.replayUnsafeIncompleteTurn) {
    return continueWorkRequests;
  }
  if (continueWorkRequests.length > 0) {
    defaultRuntime.log(
      `[continuation] Ignoring ${continueWorkRequests.length} continue_work election(s) because the enclosing turn was incomplete and replay-unsafe for session ${sessionKey ?? "unknown"}`,
    );
  }
  if (sessionKey) {
    const failedDelegateRows = await failQueuedDelegatesOwnedByRun(
      sessionKey,
      {
        originRunId: params.runId,
        legacyCreatedAfter: params.runStartedAt,
      },
      "Continuation delegate election ignored because the enclosing turn was incomplete and replay-unsafe.",
    );
    if (failedDelegateRows > 0) {
      defaultRuntime.log(
        `[continuation] Failed ${failedDelegateRows} queued continue_delegate election(s) because the enclosing turn was incomplete and replay-unsafe for session ${sessionKey}`,
      );
    }
  }
  return [];
}

/**
 * Merges the turn's bracket signals (CONTINUE_WORK, CONTINUE_DELEGATE) with its first typed
 * continue_work election (docs/design/continue-work-signal-v2.md §3.1). Display payloads strip
 * continuation tokens, so a raw terminal bracket signal is recovered before the typed fallback
 * is accepted.
 */
export function extractTurnContinuationSignal(params: {
  cfg: Parameters<typeof resolveLiveContinuationRuntimeConfig>[0];
  payloads: ReplyPayload[];
  firstWorkRequest: ContinueWorkRequest | undefined;
  /** Absent for a replay-unsafe turn, whose raw text elects nothing. */
  rawContinuationText: string | undefined;
  sessionKey: string | undefined;
  inheritedTraceparent: string | undefined;
}): { extraction: ContinuationSignalExtraction; internalBracketTraceparent: string | undefined } {
  const { firstWorkRequest, sessionKey } = params;
  let extraction = extractContinuationSignal({
    payloads: params.payloads,
    continueWorkRequest: firstWorkRequest
      ? { reason: firstWorkRequest.reason, delaySeconds: firstWorkRequest.delaySeconds }
      : undefined,
    enabled: resolveLiveContinuationRuntimeConfig(params.cfg).enabled,
    sessionKey,
  });
  if (!extraction.fromBracket && params.rawContinuationText) {
    const rawExtraction = extractContinuationSignal({
      payloads: [{ text: params.rawContinuationText }],
      enabled: resolveLiveContinuationRuntimeConfig(params.cfg).enabled,
      sessionKey,
    });
    if (rawExtraction.fromBracket) {
      extraction = rawExtraction;
    }
  }
  return {
    extraction,
    internalBracketTraceparent: extraction.fromBracket
      ? (formatCurrentSpanContinuationTraceparent() ??
        resolveContinuationTraceparent(params.inheritedTraceparent))
      : undefined,
  };
}
