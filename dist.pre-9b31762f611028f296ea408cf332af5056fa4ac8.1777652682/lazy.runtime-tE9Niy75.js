import { t as createSubsystemLogger } from "./subsystem-DRUx3zf3.js";
import "./delegate-store-BKkoivDc.js";
import "./config-xFdjNQEi.js";
import { i as loadContinuationChainState } from "./state-etYw3MLs.js";
import { n as dispatchToolDelegates } from "./delegate-dispatch-B6RI5kLA.js";
//#region src/auto-reply/continuation/context-pressure.ts
/**
* Context-pressure awareness for the continuation system.
*
* Monitors session token usage relative to the context window and fires
* system events when pressure bands are crossed. This gives the agent
* advance warning to evacuate working state before compaction.
*
* Post-compaction: fires regardless of context level to inform the session
* that compaction occurred. The session learns this cycle behaviorally.
*
* Band dedup: equality-based. The same band doesn't fire twice consecutively,
* but a new band (including a lower band after compaction) always fires.
*
* First-fire is signalled by `lastFiredBand.has(sessionKey) === false`
* (previously a `-1` magic sentinel — replaced in #228 per CLAUDE.md). The
* #580 collision shape — first-crossing of a sub-lowest-band ratio being
* silently suppressed because `band===previous===0` — is now precluded by
* checking presence in the map before comparing. The behavior pinned by
* `context-pressure.test.ts` (#580 regression) is preserved.
*
* RFC: docs/design/continue-work-signal-v2.md §4.2
*/
const log = createSubsystemLogger("continuation/context-pressure");
/** Pressure bands as percentages. Ordered ascending. */
const PRESSURE_BANDS = [
	25,
	80,
	90,
	95
];
/**
* Per-session dedup state: the last band that fired.
* Reset when a new lifecycle begins (e.g., after compaction).
*
* Absence (`!map.has(sessionKey)`) means the session has never fired —
* it replaces the prior `-1` magic sentinel.
*/
const lastFiredBand = /* @__PURE__ */ new Map();
/**
* Resolve which pressure band the current ratio falls into.
* Returns 0 if below all bands.
*/
function resolveContextPressureBand(ratio) {
	let band = 0;
	for (const threshold of PRESSURE_BANDS) if (ratio * 100 >= threshold) band = threshold;
	return band;
}
/**
* Check whether a context-pressure event should fire for the given session.
*
* Returns the event text if it should fire, or null if suppressed by dedup.
*
* @param sessionKey - Session identifier for dedup tracking
* @param totalTokens - Current token count in the session
* @param contextWindow - Total context window size in tokens
* @param threshold - Config threshold (0-1); only fire if ratio >= threshold
* @param postCompaction - If true, fire unconditionally (post-compaction lifecycle)
*/
function checkContextPressure(params) {
	const { sessionKey, totalTokens, contextWindow, threshold, postCompaction } = params;
	if (contextWindow <= 0) {
		if (log.isEnabled("debug")) log.debug(`[context-pressure:noop] reason=window-zero contextWindow=${contextWindow} session=${sessionKey}`);
		return null;
	}
	const ratio = totalTokens / contextWindow;
	const percentUsed = Math.round(ratio * 100);
	if (postCompaction) {
		const band = resolveContextPressureBand(ratio);
		lastFiredBand.set(sessionKey, band);
		const eventText = `[system:context-pressure] Post-compaction: ${percentUsed}% context consumed (${Math.round(totalTokens / 1e3)}k/${Math.round(contextWindow / 1e3)}k tokens). Session was compacted. Working state may need rehydration.`;
		log.info(`[context-pressure:fire] post-compaction band=${band} ratio=${percentUsed}% session=${sessionKey}`);
		return eventText;
	}
	if (ratio < threshold) {
		if (log.isEnabled("debug")) log.debug(`[context-pressure:noop] reason=below-threshold ratio=${percentUsed}% threshold=${Math.round(threshold * 100)}% rawRatio=${ratio.toFixed(4)} rawThreshold=${threshold.toFixed(4)} session=${sessionKey}`);
		return null;
	}
	const band = resolveContextPressureBand(ratio);
	const previous = lastFiredBand.get(sessionKey);
	if (!(previous === void 0) && band === previous) {
		if (log.isEnabled("debug")) log.debug(`[context-pressure:noop] reason=band-dedup band=${band} previous=${previous} ratio=${percentUsed}% session=${sessionKey}`);
		return null;
	}
	lastFiredBand.set(sessionKey, band);
	const eventText = `[system:context-pressure] ${percentUsed}% context consumed (${Math.round(totalTokens / 1e3)}k/${Math.round(contextWindow / 1e3)}k tokens). Consider evacuating working state to memory files or delegating remaining work.`;
	log.info(`[context-pressure:fire] band=${band} previous=${previous ?? "none"} ratio=${percentUsed}% session=${sessionKey}`);
	return eventText;
}
//#endregion
export { checkContextPressure, dispatchToolDelegates, loadContinuationChainState };
