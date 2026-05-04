import { Type } from "typebox";
import { resolveMaxDelegatesPerTurn } from "../../auto-reply/continuation/config.js";
import {
  enqueuePendingDelegate,
  getContinuationDelegateQueueDepths,
  stagePostCompactionDelegate,
} from "../../auto-reply/continuation/delegate-store.js";
import {
  CONTINUATION_DELEGATE_FANOUT_MODES,
  normalizeContinuationTargetKeys,
} from "../../auto-reply/continuation/targeting.js";
import {
  DIAGNOSTIC_TRACEPARENT_PATTERN,
  normalizeDiagnosticTraceparent,
} from "../../infra/diagnostic-trace-context.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { readSnakeCaseParamRaw } from "../../param-key.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/delegate-tool");

const DELEGATE_MODES = ["normal", "silent", "silent-wake", "post-compaction"] as const;
const FANOUT_MODES = CONTINUATION_DELEGATE_FANOUT_MODES;

const ContinueDelegateToolSchema = Type.Object({
  task: Type.String({
    description:
      "The delegated sub-agent's task. Treat this like a letter to your future self: include scope, chunk/range, desired return shape, and what the parent should do with the result.",
    maxLength: 4096,
  }),
  delaySeconds: Type.Optional(
    Type.Number({
      minimum: 0,
      description:
        "Seconds to wait before spawning the delegate. 0 or omitted = immediate. " +
        "Clamped to continuation.minDelayMs / maxDelayMs from config.",
    }),
  ),
  mode: optionalStringEnum(DELEGATE_MODES, {
    description:
      'Return mode. "normal" = announces to channel (default). ' +
      '"silent" = result injected as internal context only, no channel echo; use for ambient enrichment and future recall. ' +
      '"silent-wake" = silent + triggers a new generation cycle so the agent can act on the enrichment immediately. ' +
      '"post-compaction" = silent-wake delegate that fires when compaction happens, not on a timer. ' +
      "Use for context evacuation: the shard starts at the moment of compaction and returns to the post-compaction session.",
  }),
  targetSessionKey: Type.Optional(
    Type.String({
      description:
        "Route the delegate's COMPLETION ENVELOPE (not the task) to one specific session on this host. " +
        "The work itself always runs in a fresh sub-agent owned by the dispatcher; the named session " +
        "receives only the post-completion enrichment-return event. Use when a child should return " +
        "enrichment to an ancestor, sibling, or root session instead of the dispatching session. " +
        "This is NOT a way to deliver the original task to an existing session's run loop.",
    }),
  ),
  targetSessionKeys: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Route the delegate's COMPLETION ENVELOPE to multiple sessions on this host (byte-identical fan-out). " +
        "One delegate runs in a fresh sub-agent; each listed session receives the same completion payload " +
        "through the session-delivery queue. The original task body is NOT delivered to the listed sessions.",
    }),
  ),
  fanoutMode: optionalStringEnum(FANOUT_MODES, {
    description:
      'Broadcast COMPLETION-ENVELOPE targeting. "tree" routes the completion to every ancestor in the current ' +
      'continuation/subagent chain; "all" routes the completion to every known session on this host. ' +
      "Like targetSessionKey/targetSessionKeys, this routes the delegate's completion enrichment, not the " +
      "task body. Do not combine with targetSessionKey/targetSessionKeys.",
  }),
  traceparent: Type.Optional(
    Type.String({
      description:
        "Optional W3C traceparent carrier. When supplied by an instrumented upstream caller, " +
        "the delegate and return path can stitch continuation spans into the same trace tree.",
      pattern: DIAGNOSTIC_TRACEPARENT_PATTERN,
    }),
  ),
});

function readStrictStringArrayParam(
  params: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const raw = readSnakeCaseParamRaw(params, key);
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new ToolInputError(`${key} must be an array of non-empty strings.`);
  }
  if (raw.length === 0) {
    throw new ToolInputError(`${key} must include at least one session key.`);
  }
  const values: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new ToolInputError(`${key} must contain only non-empty strings.`);
    }
    values.push(entry.trim());
  }
  return normalizeContinuationTargetKeys(values);
}

/**
 * Creates the `continue_delegate` tool.
 *
 * This tool dispatches a sub-agent as a continuation delegate — tracked by the
 * gateway's continuation chain (cost caps, depth limits, chain counters).
 *
 * Architecture (Path A — side-channel):
 *   1. Tool writes to the module-level pending-delegate store during execution.
 *   2. After the agent's response finalizes, `agent-runner.ts` reads from the
 *      store and feeds delegates into the same scheduler that bracket-parsed
 *      `[[CONTINUE_DELEGATE:]]` signals use.
 *   3. Both paths (tool + brackets) converge at the same dispatch point —
 *      same cost cap, same chain depth, same delay clamping.
 *
 * The tool can be called multiple times per turn (multi-delegate fan-out).
 * Each call enqueues independently. No single-per-response regex limitation.
 *
 * No generation guard — delayed delegates survive channel noise (RFC
 * 2026-04-15: unrelated inbound traffic does not cancel scheduled work).
 */
export function createContinueDelegateTool(opts: { agentSessionKey?: string }): AnyAgentTool {
  let delegatesThisTurn = 0;

  return {
    label: "Continuation",
    name: "continue_delegate",
    description:
      "Schedule a continuation delegate — a background sub-agent that can run now, later, " +
      "or at compaction, then route its completion visibly or silently. Use for ambient " +
      "enrichment, chunked/aspected fan-out, or preserving working state across compaction. " +
      'Use "silent-wake" when the result should quietly enrich context and wake you to act. ' +
      "Can be called multiple times per turn for parallel fan-out while the main session stays free. " +
      "The delegate ALWAYS runs in a fresh sub-agent owned by the dispatcher. " +
      "Return-targeting fields control where the delegate's COMPLETION ENVELOPE is delivered, " +
      "NOT where the task runs: default routes the completion to the dispatching session; " +
      "targetSessionKey routes it to one other session; targetSessionKeys routes byte-identical " +
      "completion enrichment to multiple sessions; fanoutMode=tree routes to all ancestors in the chain; " +
      "fanoutMode=all routes to all known sessions on this host. None of these fields deliver the " +
      "original task body to the listed sessions or invoke their existing run loops. " +
      "Prefer this over exec or raw sessions_spawn when the goal is gateway-managed delayed/silent/wake-on-return delegate work. " +
      "This is the (a)-shape continuation surface: explicit recipient-addressing for completion-return via the " +
      "session-delivery-queue substrate (intra-host today). The (b)-shape evolution — " +
      "broadcast/publish-stream addressing across hosts where the dispatcher names an aspect-stream " +
      "and listeners tune in independently — is tracked in karmaterminal/binary-canticle#11; " +
      "both shapes share the same substrate when the (b)-shape lands.",
    parameters: ContinueDelegateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = opts.agentSessionKey;

      if (!sessionKey) {
        throw new ToolInputError(
          "continue_delegate requires an active session. Not available in sessionless contexts.",
        );
      }

      const task = readStringParam(params, "task", { required: true });
      if (!task.trim()) {
        throw new ToolInputError("task must be a non-empty string describing the delegated work.");
      }

      const delaySeconds = readNumberParam(params, "delaySeconds");
      const delayMs = delaySeconds !== undefined ? Math.max(0, delaySeconds) * 1000 : undefined;

      const modeRaw = typeof params.mode === "string" ? params.mode.trim().toLowerCase() : "";
      if (modeRaw && !DELEGATE_MODES.includes(modeRaw as (typeof DELEGATE_MODES)[number])) {
        throw new ToolInputError(
          `Unknown mode "${modeRaw}". Valid modes: ${DELEGATE_MODES.join(", ")}`,
        );
      }
      const mode = (modeRaw || "normal") as (typeof DELEGATE_MODES)[number];
      const isPostCompaction = mode === "post-compaction";
      const targetSessionKey = readStringParam(params, "targetSessionKey");
      const targetSessionKeys = readStrictStringArrayParam(params, "targetSessionKeys");
      const fanoutModeRaw = readStringParam(params, "fanoutMode");
      const fanoutMode = fanoutModeRaw?.toLowerCase();
      if (fanoutMode && !FANOUT_MODES.includes(fanoutMode as (typeof FANOUT_MODES)[number])) {
        throw new ToolInputError(
          `Unknown fanoutMode "${fanoutMode}". Valid fanout modes: ${FANOUT_MODES.join(", ")}`,
        );
      }
      if (fanoutMode && (targetSessionKey || (targetSessionKeys && targetSessionKeys.length > 0))) {
        throw new ToolInputError(
          "fanoutMode cannot be combined with targetSessionKey or targetSessionKeys.",
        );
      }
      const targetingFields = {
        ...(targetSessionKey ? { targetSessionKey } : {}),
        ...(targetSessionKeys && targetSessionKeys.length > 0 ? { targetSessionKeys } : {}),
        ...(fanoutMode ? { fanoutMode: fanoutMode as (typeof FANOUT_MODES)[number] } : {}),
      };
      const traceparentRaw = readStringParam(params, "traceparent");
      const traceparent =
        traceparentRaw !== undefined ? normalizeDiagnosticTraceparent(traceparentRaw) : undefined;
      if (traceparentRaw !== undefined && !traceparent) {
        throw new ToolInputError("traceparent must be a valid W3C traceparent header.");
      }
      const traceContextFields = traceparent ? { traceparent } : {};

      // Check per-turn delegate limit. Durable queued depth is reported for
      // visibility but does not consume this turn's admission budget.
      const maxPerTurn = resolveMaxDelegatesPerTurn();
      if (delegatesThisTurn >= maxPerTurn) {
        const queueDepths = getContinuationDelegateQueueDepths(sessionKey);
        return jsonResult({
          status: "error",
          reason: `maxDelegatesPerTurn exceeded (${maxPerTurn}). Cannot schedule more delegates in this turn.`,
          delegatesThisTurn,
          limit: maxPerTurn,
          queuedDelegateDepth: queueDepths.totalQueued,
          pendingQueuedDelegates: queueDepths.pendingQueued,
          runnablePendingDelegates: queueDepths.pendingRunnable,
          scheduledPendingDelegates: queueDepths.pendingScheduled,
          stagedPostCompactionDelegates: queueDepths.stagedPostCompaction,
        });
      }

      if (isPostCompaction) {
        stagePostCompactionDelegate(sessionKey, {
          task,
          stagedAt: Date.now(),
          ...targetingFields,
          ...traceContextFields,
        });
        delegatesThisTurn += 1;

        return jsonResult({
          status: "queued-for-compaction",
          mode: "post-compaction",
          delegateIndex: delegatesThisTurn,
          delegatesThisTurn,
          ...targetingFields,
          ...traceContextFields,
          note:
            "Delegate will fire when compaction occurs, not on a timer. " +
            "The shard starts at the moment of compaction and returns to the post-compaction session. " +
            "Chain tracking applies at dispatch time.",
        });
      }

      log.debug(
        `[continue_delegate:enqueue] session=${sessionKey} mode=${mode} delayMs=${delayMs} fanoutMode=${fanoutMode ?? "none"} targets=${targetSessionKeys?.length ?? (targetSessionKey ? 1 : 0)} task=${task.slice(0, 80)}`,
      );
      enqueuePendingDelegate(sessionKey, {
        task,
        delayMs,
        ...(mode !== "normal" ? { mode } : {}),
        ...targetingFields,
        ...traceContextFields,
      });

      delegatesThisTurn += 1;
      const dispatchIndex = delegatesThisTurn;

      return jsonResult({
        status: "scheduled",
        mode: modeRaw || "normal",
        delaySeconds: delaySeconds ?? 0,
        delegateIndex: dispatchIndex,
        delegatesThisTurn: dispatchIndex,
        ...targetingFields,
        ...traceContextFields,
        note:
          "Delegate will be dispatched after your response completes. " +
          "Chain tracking (cost cap, depth limit) applies.",
      });
    },
  };
}
