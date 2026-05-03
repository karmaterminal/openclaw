import { t as createSubsystemLogger } from "./subsystem-CJBoMDt5.js";
import { t as createExpiringMapCache } from "./cache-utils-BGj7Si0m.js";
import { g as readStringParam, l as jsonResult, r as ToolInputError } from "./common-BGcbYPyw.js";
import { Type } from "typebox";
//#region src/agents/tools/request-compaction-tool.ts
const log = createSubsystemLogger("continuation/request-compaction");
/** Minimum context usage (0-1) before the tool will accept a compaction request. */
const MIN_CONTEXT_THRESHOLD = .7;
/** Minimum milliseconds between compaction requests per session. */
const RATE_LIMIT_MS = 300 * 1e3;
/** Volitional compaction counts are status-only diagnostics, not durable state. */
const VOLITIONAL_COMPACTION_COUNT_TTL_MS = 1440 * 60 * 1e3;
/**
* Per-session state for guards.
*
* Module-level map — same volatility contract as continuation-delegate-store.
* Does not survive gateway restarts. This is intentional: the guards are
* rate-limiters, not durable state. A restart resets the cooldown, which is
* fine — the session itself is fresh.
*/
const sessionGuardState = createExpiringMapCache({ ttlMs: RATE_LIMIT_MS });
/**
* Tracks sessions that have a compaction request in-flight.
* Used to dedup — if the agent calls request_compaction twice before the
* first one completes, the second call returns "already pending".
*/
const pendingCompactionSessions = /* @__PURE__ */ new Set();
const RequestCompactionToolSchema = Type.Object({ reason: Type.String({
	description: "Why the agent is requesting compaction now. Logged for diagnostics. Example: 'context pressure at 92%, working state evacuated to memory files and 2 post-compaction delegates staged.'",
	maxLength: 1024
}) });
/**
* Creates the `request_compaction` tool.
*
* This tool allows the agent to **request** compaction after it has prepared —
* evacuated working state to memory files, staged post-compaction delegates,
* or otherwise accepted the context loss.
*
* The tool is ASYNC: it enqueues compaction and returns immediately. The
* compaction runs between turns via the lane queue, not during the tool call.
*
* Guards (all checked before compaction is enqueued):
*   - **Context threshold:** context usage must be >= 70%.
*   - **Rate limit:** at most one compaction per 5 minutes per session.
*   - **Generation guard:** if the session generation has advanced since the
*     agent's turn started, another message arrived.
*/
function createRequestCompactionTool(opts) {
	return {
		label: "Compaction",
		name: "request_compaction",
		description: "Request compaction of the current session to reclaim context window space. Call this AFTER you have evacuated working state (memory files, post-compaction delegates, RESUMPTION.md). Guards: context must be >= 70% full, rate-limited to once per 5 minutes, and no new messages may have arrived since your turn started. Compaction is async — it runs after your turn completes. Prefer this over waiting for automatic compaction when you have context-pressure awareness and want to control the timing of state evacuation.",
		parameters: RequestCompactionToolSchema,
		execute: async (_toolCallId, args) => {
			const params = args;
			const sessionKey = opts.agentSessionKey;
			if (!sessionKey) throw new ToolInputError("request_compaction requires an active session. Not available in sessionless contexts.");
			if (!opts.sessionId) throw new ToolInputError("request_compaction requires a sessionId. Session may not be fully initialized.");
			const reason = readStringParam(params, "reason", { required: true }).slice(0, 1024);
			if (pendingCompactionSessions.has(sessionKey)) {
				log.debug(`[request_compaction:already-pending] session=${sessionKey}`);
				return jsonResult({
					status: "already_pending",
					reason: "A compaction request is already in-flight for this session."
				});
			}
			const contextUsage = opts.getContextUsage();
			if (contextUsage < MIN_CONTEXT_THRESHOLD) {
				log.debug(`[request_compaction:below-threshold] session=${sessionKey} usage=${(contextUsage * 100).toFixed(1)}%`);
				return jsonResult({
					status: "rejected",
					guard: "context_threshold",
					contextUsage: Math.round(contextUsage * 100),
					threshold: Math.round(MIN_CONTEXT_THRESHOLD * 100),
					reason: `Context usage (${Math.round(contextUsage * 100)}%) is below the minimum threshold (${Math.round(MIN_CONTEXT_THRESHOLD * 100)}%). Compaction is not needed yet.`
				});
			}
			const now = Date.now();
			const guard = sessionGuardState.get(sessionKey);
			if (guard && now - guard.lastRequestMs < RATE_LIMIT_MS) {
				const remainingMs = RATE_LIMIT_MS - (now - guard.lastRequestMs);
				const remainingSec = Math.ceil(remainingMs / 1e3);
				log.debug(`[request_compaction:rate-limited] session=${sessionKey} remainingSec=${remainingSec}`);
				return jsonResult({
					status: "rejected",
					guard: "rate_limit",
					retryAfterSeconds: remainingSec,
					reason: `Rate limited. Next compaction request allowed in ${remainingSec}s.`
				});
			}
			log.info(`[request_compaction:enqueuing] session=${sessionKey} usage=${(contextUsage * 100).toFixed(1)}% reason=${reason}`);
			sessionGuardState.set(sessionKey, { lastRequestMs: now });
			pendingCompactionSessions.add(sessionKey);
			opts.triggerCompaction().then((result) => {
				if (result.ok && result.compacted) incrementVolitionalCompactionCount(sessionKey);
			}, (err) => {
				log.error(`[request_compaction:background-error] session=${sessionKey} error=${err instanceof Error ? err.message : String(err)}`);
			}).finally(() => {
				pendingCompactionSessions.delete(sessionKey);
			});
			return jsonResult({
				status: "compaction_requested",
				contextUsage: Math.round(contextUsage * 100),
				reason,
				note: "Compaction has been enqueued and will run after your turn completes. Post-compaction context (AGENTS.md, SOUL.md) will be injected on the next turn. Any staged post-compaction delegates will be dispatched."
			});
		}
	};
}
const volitionalCompactionCounts = createExpiringMapCache({ ttlMs: VOLITIONAL_COMPACTION_COUNT_TTL_MS });
/** Increment the volitional compaction counter for a session. */
function incrementVolitionalCompactionCount(sessionKey) {
	volitionalCompactionCounts.set(sessionKey, (volitionalCompactionCounts.get(sessionKey) ?? 0) + 1);
}
/** Get the volitional compaction count for a session. */
function getVolitionalCompactionCount(sessionKey) {
	return volitionalCompactionCounts.get(sessionKey) ?? 0;
}
//#endregion
export { getVolitionalCompactionCount as n, createRequestCompactionTool as t };
