import { Type } from "@sinclair/typebox";
import {
  enqueuePendingDelegate,
  pendingDelegateCount,
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "../../auto-reply/continuation-delegate-store.js";
import { resolveMaxDelegatesPerTurn } from "../../auto-reply/reply/continuation-runtime.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/delegate-tool");
const DELEGATE_MODES = ["normal", "silent", "silent-wake", "post-compaction"] as const;

const ContinueDelegateToolSchema = Type.Object({
  task: Type.String({
    description:
      "The delegated sub-agent's task. Treat this like a letter to your future self: include scope, desired return shape, and what the parent should do with the result.",
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
      'Return mode. "normal" announces through the usual sub-agent path, ' +
      '"silent" suppresses the direct completion echo, and "silent-wake" preserves the ' +
      'silent delegate contract for immediate internal enrichment flows. "post-compaction" ' +
      "stages the delegate until the next successful compaction lifecycle completes.",
  }),
});

export function createContinueDelegateTool(opts: { agentSessionKey?: string }): AnyAgentTool {
  return {
    label: "Continuation",
    name: "continue_delegate",
    description:
      "Schedule a continuation delegate: a background sub-agent that can run now, later, " +
      "or after compaction, then return visibly or silently to this session. Use for ambient " +
      'enrichment, chunked fan-out, or preserving working state across compaction. Use "silent-wake" ' +
      "when the result should quietly enrich context and wake you to act.",
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
      const postCompaction = modeRaw === "post-compaction";
      const silent = modeRaw === "silent" || modeRaw === "silent-wake" || postCompaction;
      const silentWake = modeRaw === "silent-wake" || postCompaction;

      const maxPerTurn = resolveMaxDelegatesPerTurn();
      const currentCount =
        pendingDelegateCount(sessionKey) + stagedPostCompactionDelegateCount(sessionKey);
      if (currentCount >= maxPerTurn) {
        return jsonResult({
          status: "error",
          reason: `maxDelegatesPerTurn exceeded (${maxPerTurn}). Cannot dispatch more delegates this turn.`,
          dispatched: currentCount,
          limit: maxPerTurn,
        });
      }

      log.debug(
        `[continue_delegate:enqueue] session=${sessionKey} postCompaction=${postCompaction} silent=${silent} silentWake=${silentWake} delayMs=${delayMs} task=${task.slice(0, 80)}`,
      );
      if (postCompaction) {
        stagePostCompactionDelegate(sessionKey, {
          task,
          ...(delayMs !== undefined ? { delayMs } : {}),
        });
      } else {
        enqueuePendingDelegate(sessionKey, {
          task,
          ...(delayMs !== undefined ? { delayMs } : {}),
          ...(silent ? { silent: true } : {}),
          ...(silentWake ? { silentWake: true } : {}),
        });
      }

      const dispatchIndex = currentCount + 1;

      return jsonResult({
        status: postCompaction ? "staged" : "scheduled",
        mode: modeRaw || "normal",
        delaySeconds: delaySeconds ?? 0,
        delegateIndex: dispatchIndex,
        delegatesThisTurn: dispatchIndex,
        note: postCompaction
          ? "Delegate has been staged and will be released after compaction completes."
          : "Delegate will be dispatched after your response completes.",
      });
    },
  };
}
