/**
 * `continue_delegate` tool — delegated continuation.
 *
 * Dispatches a sub-agent with typed task, mode, and delay parameters.
 * The tool enqueues delegates into the continuation delegate store;
 * the runner consumes them post-response and feeds them to the scheduler.
 *
 * Multiple calls per turn are supported (multi-delegate fan-out).
 * No generation guard — delayed delegates survive channel noise.
 *
 * RFC: docs/design/continue-work-signal-v2.md §2.3
 */

import { Type } from "@sinclair/typebox";
import { resolveMaxDelegatesPerTurn } from "../../auto-reply/continuation/config.js";
import {
  enqueuePendingDelegate,
  pendingDelegateCount,
  stagePostCompactionDelegate,
  stagedPostCompactionDelegateCount,
} from "../../auto-reply/continuation/delegate-store.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/delegate-tool");

const DELEGATE_MODES = ["normal", "silent", "silent-wake", "post-compaction"] as const;

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
      '"post-compaction" = delegate fires when compaction happens, not on a timer. ' +
      "Use for context evacuation: the shard starts at the moment of compaction and returns to the post-compaction session.",
  }),
});

export function createContinueDelegateTool(opts: { agentSessionKey?: string }): AnyAgentTool {
  return {
    label: "Continuation",
    name: "continue_delegate",
    description:
      "Schedule a continuation delegate — a background sub-agent that can run now, later, " +
      "or at compaction, then return visibly or silently to this session. Use for ambient " +
      "enrichment, chunked/aspected fan-out, or preserving working state across compaction. " +
      'Use "silent-wake" when the result should quietly enrich context and wake you to act. ' +
      "Can be called multiple times per turn for parallel fan-out while the main session stays free.",
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
      const silent = mode === "silent";
      const silentWake = mode === "silent-wake";
      const postCompaction = mode === "post-compaction";

      // Per-turn cap check (tool-side early rejection).
      const maxPerTurn = resolveMaxDelegatesPerTurn();
      const currentPending = pendingDelegateCount(sessionKey);
      const currentStaged = stagedPostCompactionDelegateCount(sessionKey);
      if (currentPending + currentStaged >= maxPerTurn) {
        log.info(
          `[continue_delegate:rejected] maxDelegatesPerTurn=${maxPerTurn} current=${currentPending + currentStaged} session=${sessionKey}`,
        );
        return jsonResult({
          status: "rejected",
          reason: `Maximum delegates per turn (${maxPerTurn}) reached.`,
        });
      }

      if (postCompaction) {
        stagePostCompactionDelegate(sessionKey, {
          task: task.slice(0, 4096),
          stagedAt: Date.now(),
        });
        log.info(
          `[continue_delegate:staged-post-compaction] session=${sessionKey} task=${task.slice(0, 80)}`,
        );
        return jsonResult({
          status: "staged",
          mode: "post-compaction",
        });
      }

      enqueuePendingDelegate(sessionKey, {
        task: task.slice(0, 4096),
        delayMs,
        mode: silent ? "silent" : silentWake ? "silent-wake" : "normal",
      });

      // Log at info level for observability — addresses the silent success finding.
      log.info(
        `[continue_delegate:enqueue] session=${sessionKey} mode=${mode} delayMs=${delayMs ?? "immediate"} task=${task.slice(0, 80)}`,
      );

      return jsonResult({
        status: "enqueued",
        mode,
        delaySeconds: delaySeconds ?? 0,
      });
    },
  };
}
