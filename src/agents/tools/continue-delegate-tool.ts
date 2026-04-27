import { Type } from "typebox";
import {
  stagePostCompactionDelegate,
  enqueuePendingDelegate,
  pendingDelegateCount,
  stagedPostCompactionDelegateCount,
} from "../../auto-reply/continuation-delegate-store.js";
import { resolveMaxDelegatesPerTurn } from "../../auto-reply/reply/continuation-runtime.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { resolveSnakeCaseParamKey } from "../../param-key.js";
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
      '"post-compaction" = silent-wake delegate that fires when compaction happens, not on a timer. ' +
      "Use for context evacuation: the shard starts at the moment of compaction and returns to the post-compaction session.",
  }),
  targetSessionKeys: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Address one or more sibling sessions for cross-session enrichment. " +
        "One delegate completion \u2192 N receivers (the choral fan-out shape). " +
        "Stage-1: persisted as descriptor on the pending delegate. " +
        "Stage-2 (follow-up under #355): dispatch wires one substrate-queue row " +
        "per recipient with per-target fail-isolation via existing FallbackResolver. " +
        "Binary-canticle (a)-shape; broadcast (b)-shape lands on top via canticle#11.",
    }),
  ),
});

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
  return {
    label: "Continuation",
    name: "continue_delegate",
    description:
      "Schedule a continuation delegate — a background sub-agent that can run now, later, " +
      "or at compaction, then return visibly or silently to this session. Use for ambient " +
      "enrichment, chunked/aspected fan-out, or preserving working state across compaction. " +
      'Use "silent-wake" when the result should quietly enrich context and wake you to act. ' +
      "Can be called multiple times per turn for parallel fan-out while the main session stays free. " +
      "Prefer this over exec or raw sessions_spawn when the goal is gateway-managed delayed/silent/wake-on-return delegate work.",
    parameters: ContinueDelegateToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = opts.agentSessionKey;

      if (!sessionKey) {
        throw new ToolInputError(
          "continue_delegate requires an active session. Not available in sessionless contexts.",
        );
      }
      // Reject the legacy singular field fail-loud (Codex P1, #363 review): the
      // descriptor is silently dropped if we accept it, which can misroute work
      // to the current session when the caller intended cross-session delegation.
      // Make the bad state unrepresentable rather than prohibited — same
      // structural-cure-vs-vigilance shape as `declineToCarry()` in #366.
      if (
        Object.hasOwn(params, "targetSessionKey") ||
        Object.hasOwn(params, "target_session_key")
      ) {
        throw new ToolInputError(
          "targetSessionKey (singular) was removed in #355 stage-1; use targetSessionKeys: string[] for one-or-many recipients.",
        );
      }
      let targetSessionKeys: string[] | undefined;
      // Accept both camelCase (`targetSessionKeys`) and snake_case
      // (`target_session_keys`) callers — same convention as every other tool
      // param in the runtime (Codex P2, #363 review).
      const targetKeysParamKey = resolveSnakeCaseParamKey(params, "targetSessionKeys");
      if (targetKeysParamKey && params[targetKeysParamKey] !== undefined) {
        const raw = params[targetKeysParamKey];
        if (!Array.isArray(raw)) {
          throw new ToolInputError("targetSessionKeys must be an array of session-key strings.");
        }
        const keys = raw.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
        if (keys.length !== raw.length) {
          throw new ToolInputError(
            "targetSessionKeys must contain only non-empty session-key strings.",
          );
        }
        if (keys.length > 0) {
          targetSessionKeys = keys;
        }
        // Stage-1: descriptor-only. Stage-2 (follow-up under #355) wires the
        // substrate-queue dispatch (one row per recipient, per-target
        // fail-isolation via existing FallbackResolver, riding on #354's
        // session-delivery-queue extension). Until then the descriptor is
        // persisted/round-tripped via taskflow but does not change dispatch.
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
      const isPostCompaction = modeRaw === "post-compaction";
      const silent = modeRaw === "silent" || modeRaw === "silent-wake" || isPostCompaction;
      const silentWake = modeRaw === "silent-wake" || isPostCompaction;

      // Check per-turn delegate limit
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

      if (isPostCompaction) {
        // Stage for the current turn. agent-runner commits successful turns to
        // SessionEntry so failed runs do not leak stale compaction delegates.
        stagePostCompactionDelegate(sessionKey, {
          task,
          createdAt: Date.now(),
          silent: true,
          silentWake: true,
        });

        return jsonResult({
          status: "queued-for-compaction",
          mode: "post-compaction",
          note:
            "Delegate will fire when compaction occurs, not on a timer. " +
            "The shard starts at the moment of compaction and returns to the post-compaction session. " +
            "Chain tracking applies at dispatch time.",
        });
      }

      // Enqueue for post-run processing by agent-runner.ts
      log.debug(
        `[continue_delegate:enqueue] session=${sessionKey} silent=${silent} silentWake=${silentWake} delayMs=${delayMs} task=${task.slice(0, 80)}`,
      );
      enqueuePendingDelegate(sessionKey, {
        task,
        delayMs,
        silent,
        silentWake,
        targetSessionKeys,
      });

      const dispatchIndex = currentCount + 1;

      return jsonResult({
        status: "scheduled",
        mode: modeRaw || "normal",
        delaySeconds: delaySeconds ?? 0,
        delegateIndex: dispatchIndex,
        delegatesThisTurn: dispatchIndex,
        note:
          "Delegate will be dispatched after your response completes. " +
          "Chain tracking (cost cap, depth limit) applies.",
      });
    },
  };
}
