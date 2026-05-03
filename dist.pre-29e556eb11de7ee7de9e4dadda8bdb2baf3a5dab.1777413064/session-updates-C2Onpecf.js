import { a as normalizeLowercaseStringOrEmpty, c as normalizeOptionalString } from "./string-coerce-C1IzJjqi.js";
import { n as defaultRuntime } from "./runtime-Dx7oeLYq.js";
import { r as logVerbose } from "./globals-DeRFSEIV.js";
import { u as resolveAgentIdFromSessionKey } from "./session-key-EpIbK3Oz.js";
import { p as resolveSessionAgentId } from "./agent-scope-_6dFncNS.js";
import { t as matchesSkillFilter } from "./filter-CBGNTeP4.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-C-5w-v1N.js";
import { a as resolveSessionFilePathOptions, i as resolveSessionFilePath } from "./paths-DvU8Tgvw.js";
import { l as resolveSessionStoreEntry, o as updateSessionStore, s as updateSessionStoreEntry } from "./store-B39mP4xx.js";
import "./sessions-4KzgvLlx.js";
import { o as resolveStableSessionEndTranscript } from "./session-transcript-files.fs-rIur1Jet.js";
import { n as drainSystemEventEntries } from "./system-events-BjB5IdNm.js";
import { t as buildWorkspaceSkillSnapshot } from "./workspace-9W7oRVFf.js";
import "./skills-Btkps-SF.js";
import { i as resolveUserTimezone } from "./date-time-BlQAvlJF.js";
import { n as formatZonedTimestamp, r as resolveTimezone, t as formatUtcTimestamp } from "./format-datetime-CBGDbjG1.js";
import { t as canExecRequestNode } from "./exec-defaults-DCJPBk1N.js";
import { n as getSkillsSnapshotVersion, o as shouldRefreshSnapshotForVersion } from "./refresh-state-D0ogm_8K.js";
import { t as ensureSkillsWatcher } from "./refresh-8NGaz0fL.js";
import { t as getRemoteSkillEligibility } from "./skills-remote-CjhhXACg.js";
import { n as buildSessionStartHookPayload, t as buildSessionEndHookPayload } from "./session-hooks-C2UsI6Ni.js";
import { t as buildChannelSummary } from "./channel-summary-DNh9Nns0.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
//#region src/infra/continuation-tracer.ts
const noopSpan = Object.freeze({
	setAttributes(_attrs) {},
	setStatus(_status, _message) {},
	recordException(_err) {},
	end() {}
});
let activeTracer = Object.freeze({ startSpan(_name, _options) {
	return noopSpan;
} });
/**
* Emit a `continuation.work` span at the runner-side accept seam
* (#334 Slice 2 chunk 2). Centralized helper so the runner stays
* narrow at the call site and the span shape is testable in
* isolation. Sites that don't have a chainId yet (chain not
* persisted, or substrate-disabled deploys) MAY pass `chainId:
* undefined` — the attribute is omitted, downstream collectors
* see a span without a correlation key.
*
* Wraps tracer interactions in a try/catch and logs via the caller's
* `log` callback if provided — the accept path must never block on
* span emission.
*/
function emitContinuationWorkSpan(args) {
	try {
		const reasonPreview = args.reason ? args.reason.length > 80 ? args.reason.slice(0, 80) : args.reason : void 0;
		const attrs = {
			"delay.ms": Math.round(args.delayMs),
			"chain.step.remaining": Math.max(0, args.chainStepRemaining),
			...args.chainId !== void 0 && { "chain.id": args.chainId },
			...reasonPreview !== void 0 && { "reason.preview": reasonPreview }
		};
		const span = activeTracer.startSpan("continuation.work", { attributes: attrs });
		span.setStatus("OK");
		span.end();
	} catch (err) {
		args.log?.(`Failed to emit continuation.work span: ${String(err)}`);
	}
}
/**
* Emit a `continuation.delegate.dispatch` span at the runner-side
* delegate accept seam (#334 Slice 2 chunk 3). Mirrors
* `emitContinuationWorkSpan` shape — same try/catch wrap, same
* `chain.id` / `chain.step.remaining` / `delay.ms` / `reason.preview`
* plumbing — plus two delegate-specific axes:
*
*  - `delegate.delivery` (`"immediate" | "timer"`): runner-internal
*    scheduling axis. `"immediate"` when no delay was requested or
*    the delay was 0 (no `setTimeout` armed); `"timer"` when a
*    non-zero clamped delay armed `setTimeout`.
*  - `delegate.mode` (`"normal" | "silent" | "silent-wake" |
*    "post-compaction"`): caller-intent semantic axis. Optional in
*    the helper signature so future call sites (e.g. an exporter
*    replaying a partial dispatch record) can emit without a mode
*    annotation; current runner wiring always supplies one.
*
* Per cohort design (sprites-of-thornfield, 2026-04-27): emit at the
* **enqueue/accept seam**, NOT at the timer-fire callback. The chain-step
* is committed when the runner accepts the dispatch into the chain;
* the `setTimeout` is a delivery mechanism, not a chain semantic.
* Cancelled-but-accepted dispatches (compaction, reset, gateway shutdown)
* still happened, and a fire-time span would underreport them.
* `continuation.delegate.fire` remains a future name, not preempted.
*
* Wraps tracer interactions in a try/catch and logs via the caller's
* `log` callback if provided — the accept path must never block on
* span emission.
*/
function emitContinuationDelegateSpan(args) {
	try {
		const reasonPreview = args.reason ? args.reason.length > 80 ? args.reason.slice(0, 80) : args.reason : void 0;
		const attrs = {
			"delay.ms": Math.round(args.delayMs),
			"chain.step.remaining": Math.max(0, args.chainStepRemaining),
			"delegate.delivery": args.delivery,
			...args.chainId !== void 0 && { "chain.id": args.chainId },
			...args.delegateMode !== void 0 && { "delegate.mode": args.delegateMode },
			...reasonPreview !== void 0 && { "reason.preview": reasonPreview }
		};
		const span = activeTracer.startSpan("continuation.delegate.dispatch", { attributes: attrs });
		span.setStatus("OK");
		span.end();
	} catch (err) {
		args.log?.(`Failed to emit continuation.delegate.dispatch span: ${String(err)}`);
	}
}
/**
* Emit a `continuation.disabled` span at a runner-side cap-gate reject
* (#334 Slice 2 chunk 4). Mirrors `emitContinuationWorkSpan` /
* `emitContinuationDelegateSpan` shape — same try/catch wrap, same
* `chain.id` / `chain.step.remaining` / `reason.preview` plumbing. Adds
* three reject-specific axes:
*
*  - `disabled.reason` (`"cap.chain" | "cap.cost" |
*    "cap.delegates_per_turn" | "reservation.missing"`): which gate
*    prevented follow-through. Per-chain (chain/cost) gates landed in
*    chunk 4; per-turn delegate-budget cap landed in chunk 5a;
*    `reservation.missing` (fire-time reservation already cleared) lands
*    in chunk 5b. Family semantics (🌻, 2026-04-27): "anything that
*    prevented follow-through," not "cap axes only" — the family is
*    grammar-defined (verb-on-gate), not enum-cardinality-defined.
*  - `signal.kind` ({@link ContinuationDisabledSignalKind}): the kind of
*    signal that was rejected. Values derived from {@link CONTINUATION_SIGNAL_KINDS} SSOT.
*  - `delegate.delivery` / `delegate.mode`: only set when the rejected
*    signal was a delegate (bracket-delegate or tool-delegate). Work
*    signals omit both — they're self-elected single-session and don't
*    share that taxonomy.
*
* IMPORTANT (per cohort design 2026-04-27, 🌊): a reject means the chain
* never advanced for this signal. Helper does NOT mint or persist a
* `chain.id` for reject spans — callers pass `chainId` through as-is
* from the live session entry (which may be `undefined` when the
* rejected signal would have been the first chain step). `chain.step.remaining`
* is set to the chain-budget remaining at the moment of reject, NOT
* post-decrement (no decrement happens on rejects).
*
* Wraps tracer interactions in a try/catch and logs via the caller's
* `log` callback if provided — the reject path must never block on
* span emission.
*/
function emitContinuationDisabledSpan(args) {
	try {
		const reasonPreview = args.reason ? args.reason.length > 80 ? args.reason.slice(0, 80) : args.reason : void 0;
		const attrs = {
			"chain.step.remaining": Math.max(0, args.chainStepRemaining),
			"disabled.reason": args.disabledReason,
			"signal.kind": args.signalKind,
			"continuation.disabled": true,
			...args.chainId !== void 0 && { "chain.id": args.chainId },
			...args.delegateDelivery !== void 0 && { "delegate.delivery": args.delegateDelivery },
			...args.delegateMode !== void 0 && { "delegate.mode": args.delegateMode },
			...reasonPreview !== void 0 && { "reason.preview": reasonPreview }
		};
		const span = activeTracer.startSpan("continuation.disabled", { attributes: attrs });
		span.setStatus("OK");
		span.end();
	} catch (err) {
		args.log?.(`Failed to emit continuation.disabled span: ${String(err)}`);
	}
}
/**
* Emit a `continuation.delegate.fire` span at the runner-side delegate
* timer-callback start (#334 Slice 2 chunk 5b). The verb-on-timer
* counterpart to `emitContinuationDelegateSpan`'s verb-on-decision: this
* span fires at the moment a deferred delegate's `setTimeout` callback
* actually runs, so consumers can pair `dispatch`/`fire` events on the
* same `chain.id` and observe scheduling drift / fire-time divergences.
*
* **Callsite invariants** (cohort design, sprites-of-thornfield 2026-04-27):
*
*  - Emit BEFORE `takeDelayedContinuationReservation` runs — the fire
*    event is wall-clock truth ("the timer fired"); whatever happens next
*    (spawn, reservation-missing log-and-return) is a separate concern
*    and gets its own sibling span (`continuation.disabled` with
*    `reason = reservation.missing` for the existing log-and-return
*    divergence; future `continuation.delegate.error` for hard faults).
*  - `chainId` is **closed-over from dispatch-time** as a captured local
*    in the `setTimeout` closure. The helper never re-reads
*    `activeSessionEntry?.continuationChainId` at fire-time. This matches
*    the no-mint-on-fire invariant and prevents races with compaction or
*    session mutation between arm and fire (mirrors chunks 3/4's
*    enclosure discipline).
*  - `chainId` is **always defined** at delegate-fire time — chain
*    reservation mints pre-`setTimeout` (chunk 3 invariant). Sig encodes
*    this with the non-optional `string` type. **Defense-in-depth:**
*    helper no-ops gracefully (logs + returns) if `undefined` slips
*    through anyway, so a future invariant break never crashes
*    fire-emit.
*  - `delegate.delivery: "timer"` is implicit — fire spans only emit on
*    the timer-deferred path (immediate-delivery dispatches don't
*    arm a timer, so there's no fire event for them). The helper sets
*    the attr internally rather than taking it as an arg.
*  - 5b is **instrumentation-of-status-quo only**: the helper does NOT
*    re-evaluate any cap (`cap.chain | cap.cost | cap.delegates_per_turn`)
*    at fire-time. Fire-time gating is a future-policy seam, deferred to
*    a future memo.
*
* **`chainStepRemainingAtDispatch` provenance** (🌻 dedicated-paragraph
* note, sprites-of-thornfield 2026-04-27): this value reflects
* **dispatch-time headroom** (reservation snapshot), NOT callback-time
* live state. Rationale: trace continuity with the dispatch span (same
* `chain.id`, same step counter) so consumers can pair `dispatch` /
* `fire` events without reasoning about between-tick mutations. If a
* future consumer wants "remaining headroom _at_ fire time," that is a
* **separate axis** (provisional name `chain.step.remaining_at_fire`)
* and a **separate decision** — do not fold it into this field.
*
* Wraps tracer interactions in a try/catch and logs via the caller's
* `log` callback if provided — the fire path must never block on span
* emission.
*/
function emitContinuationDelegateFireSpan(args) {
	if (args.chainId === void 0 || args.chainId === null) {
		args.log?.("Failed to emit continuation.delegate.fire span: chainId invariant violated (undefined)");
		return;
	}
	try {
		const reasonPreview = args.reason ? args.reason.length > 80 ? args.reason.slice(0, 80) : args.reason : void 0;
		const attrs = {
			"chain.id": args.chainId,
			"chain.step.remaining": Math.max(0, args.chainStepRemainingAtDispatch),
			"delay.ms": Math.round(args.delayMs),
			"fire.deferred_ms": Math.max(0, Math.floor(args.fireDeferredMs)),
			"delegate.delivery": "timer",
			"delegate.mode": args.delegateMode,
			...reasonPreview !== void 0 && { "reason.preview": reasonPreview }
		};
		const span = activeTracer.startSpan("continuation.delegate.fire", { attributes: attrs });
		span.setStatus("OK");
		span.end();
	} catch (err) {
		args.log?.(`Failed to emit continuation.delegate.fire span: ${String(err)}`);
	}
}
/**
* Emit a `continuation.work.fire` span at the bracket-work timer-callback
* seam (#334 Slice 2 chunk 5c). Symmetric to `emitContinuationDelegateFireSpan`
* but scope-narrower: WORK-fire has NO fire-time divergence in current bytes
* (no reservation system at the bracket-work seam — `enqueueSystemEvent` and
* `requestHeartbeatNow` are synchronous and non-divergent), so 5c emits a
* single span with no `continuation.disabled` sibling — unlike 5b which paired
* fire+disabled(`reservation.missing`).
*
* **Cohort 3/3 verdicts (PR #390, sprites-of-thornfield 2026-04-27):**
*  - **Naming:** `continuation.work.fire` (parallel grammar). Family rule
*    `<noun>.<action>` two-segment dotted-only; `.fire` already means
*    timer-callback in the family-grammar.
*  - **Helper shape:** separate from `emitContinuationDelegateFireSpan`.
*    Unified-parameterized devolves into `if (kind === "work")` branches and
*    couples sibling-disabled-emit divergence across helper boundary.
*  - **`reason.preview` carry-through:** yes. `continuationWorkReason` is in
*    closure scope at dispatch, free to forward; snapshot-by-architecture
*    (no recompute path exists), pays off in operator-mode triage.
*
* **Provenance pins (mirror 5b discipline):**
*  - `chainId` is closed-over from dispatch-time `persistContinuationChainState`
*    return value. Never recomputed at fire-time.
*  - `chainStepRemainingAtDispatch` is a dispatch-time snapshot, NOT a
*    fire-time recompute. Trace continuity with the dispatch span (same
*    `chain.id`, same step counter) so consumers can pair `work` / `work.fire`
*    events without reasoning about between-tick mutations.
*  - 5c is **instrumentation-of-status-quo only**: helper does NOT re-evaluate
*    any cap (`cap.chain | cap.cost | cap.delegates_per_turn`) at fire-time.
*    Fire-time gating is a future-policy seam, deferred to a future memo.
*  - `fire.deferred_ms` = wall-clock from `setTimeout`-arm to callback fire,
*    `Math.floor` integer ms. Drift formula: `drift = fire.deferred_ms − delay.ms`.
*
* Wraps tracer interactions in a try/catch and logs via the caller's `log`
* callback if provided — the fire path must never block on span emission.
*/
function emitContinuationWorkFireSpan(args) {
	if (args.chainId === void 0 || args.chainId === null) {
		args.log?.("Failed to emit continuation.work.fire span: chainId invariant violated (undefined)");
		return;
	}
	try {
		const reasonPreview = args.reason ? args.reason.length > 80 ? args.reason.slice(0, 80) : args.reason : void 0;
		const attrs = {
			"chain.id": args.chainId,
			"chain.step.remaining": Math.max(0, args.chainStepRemainingAtDispatch),
			"delay.ms": Math.round(args.delayMs),
			"fire.deferred_ms": Math.max(0, Math.floor(args.fireDeferredMs)),
			...reasonPreview !== void 0 && { "reason.preview": reasonPreview }
		};
		const span = activeTracer.startSpan("continuation.work.fire", { attributes: attrs });
		span.setStatus("OK");
		span.end();
	} catch (err) {
		args.log?.(`Failed to emit continuation.work.fire span: ${String(err)}`);
	}
}
/**
* Emit a `continuation.queue.drain` span at the substrate system-events
* queue consumer seam (#334 Slice 2 chunk 6a). Fired once per
* `drainFormattedSystemEvents` call, regardless of how many entries the
* synchronous bulk-pull returned (including empty drains).
*
* **Cohort 4/4 contract (PR #393 memo, sprites-of-thornfield 2026-04-27):**
*  - **Naming:** `continuation.queue.drain` (parallel grammar with
*    `continuation.queue.enqueue` — producer-verb / consumer-verb on the
*    substrate queue mechanical pair).
*  - **Attrs:** `queue.drained_count` (total) and
*    `queue.drained_continuation_count` (best-effort continuation-prefix
*    subset). NO `chain.id` — the substrate queue is session-scoped and
*    multi-chain at drain time; attaching a single `chain.id` would lie.
*  - **Live counts (no snapshot):** drain is a single-tick synchronous
*    bulk-pull. There is no temporal gap to bridge.
*  - **No `disabled` sibling on empty drain:** a 0-count drain is the
*    absence of work, not the rejection of work. The
*    `continuation.disabled` family is reserved for gates that prevented
*    follow-through (cap.*, reservation.missing).
*  - **Aggregate emit:** one span per drain call. Per-event recordation,
*    if cohort wants it later, slots under OTEL `addEvent` on this single
*    span \u2014 NOT additional spans. Deferred to Slice 3.
*
* Wraps tracer interactions in a try/catch and forwards exceptions to the
* caller's `log` callback if provided \u2014 the drain path must never block
* on span emission, and must not perturb drain semantics (the span fires
* AFTER the drain completes; emit failure is invisible to the consumer).
*/
function emitContinuationQueueDrainSpan(args) {
	try {
		const drainedCount = Math.max(0, Math.floor(args.drainedCount));
		const attrs = {
			"queue.drained_count": drainedCount,
			"queue.drained_continuation_count": Math.min(drainedCount, Math.max(0, Math.floor(args.drainedContinuationCount)))
		};
		const span = activeTracer.startSpan("continuation.queue.drain", { attributes: attrs });
		span.setStatus("OK");
		span.end();
	} catch (err) {
		args.log?.(`Failed to emit continuation.queue.drain span: ${String(err)}`);
	}
}
/**
* Emit a `continuation.compaction.released` span at the agent-runner
* post-compaction-delegate dispatch seam (#334 Slice 2 chunk 6b). Fired
* once per `autoCompactionCount > 0` branch, after
* `dispatchPostCompactionDelegates` returns, with the released-count
* snapshotted before the dispatch call.
*
* Mirrors `emitContinuationQueueDrainSpan` shape — separate-helper rule
* (chunk 6a precedent). Integer hygiene (`Math.max(0, Math.floor(...))`)
* per chunk-6a defense-in-depth: helper enforces invariant even though
* the caller snapshots from a `.length` (structurally non-negative).
*
* Wraps tracer interactions in a try/catch and forwards exceptions to the
* caller's `log` callback if provided — the release path must never block
* on span emission.
*/
function emitContinuationCompactionReleasedSpan(args) {
	try {
		const releasedCount = Math.max(0, Math.floor(args.releasedCount));
		const compactionId = args.compactionId;
		const compactionIdValid = typeof compactionId === "number" && Number.isInteger(compactionId) && compactionId >= 0;
		if (!compactionIdValid && compactionId !== void 0) args.log?.(`emitContinuationCompactionReleasedSpan: invalid compaction.id (${compactionId}); dropping attr`);
		const attrs = {
			"signal.kind": "compaction-release",
			"compaction.released": releasedCount,
			...compactionIdValid ? { "compaction.id": compactionId } : {}
		};
		const span = activeTracer.startSpan("continuation.compaction.released", { attributes: attrs });
		span.setStatus("OK");
		span.end();
	} catch (err) {
		args.log?.(`Failed to emit continuation.compaction.released span: ${String(err)}`);
	}
}
//#endregion
//#region src/auto-reply/reply/session-system-events.ts
/** Drain queued system events, format as `System:` lines, return the block (or undefined). */
async function drainFormattedSystemEvents(params) {
	const compactSystemEvent = (line) => {
		const trimmed = line.trim();
		if (!trimmed) return null;
		const lower = normalizeLowercaseStringOrEmpty(trimmed);
		if (lower.includes("reason periodic")) return null;
		if (lower.startsWith("read heartbeat.md")) return null;
		if (lower.includes("heartbeat poll") || lower.includes("heartbeat wake")) return null;
		if (trimmed.startsWith("Node:")) return trimmed.replace(/ · last input [^·]+/i, "").trim();
		return trimmed;
	};
	const resolveSystemEventTimezone = (cfg) => {
		const raw = normalizeOptionalString(cfg.agents?.defaults?.envelopeTimezone);
		if (!raw) return { mode: "local" };
		const lowered = normalizeLowercaseStringOrEmpty(raw);
		if (lowered === "utc" || lowered === "gmt") return { mode: "utc" };
		if (lowered === "local" || lowered === "host") return { mode: "local" };
		if (lowered === "user") return {
			mode: "iana",
			timeZone: resolveUserTimezone(cfg.agents?.defaults?.userTimezone)
		};
		const explicit = resolveTimezone(raw);
		return explicit ? {
			mode: "iana",
			timeZone: explicit
		} : { mode: "local" };
	};
	const formatSystemEventTimestamp = (ts, cfg) => {
		const date = new Date(ts);
		if (Number.isNaN(date.getTime())) return "unknown-time";
		const zone = resolveSystemEventTimezone(cfg);
		if (zone.mode === "utc") return formatUtcTimestamp(date, { displaySeconds: true });
		if (zone.mode === "local") return formatZonedTimestamp(date, { displaySeconds: true }) ?? "unknown-time";
		return formatZonedTimestamp(date, {
			timeZone: zone.timeZone,
			displaySeconds: true
		}) ?? "unknown-time";
	};
	const systemLines = [];
	const queued = drainSystemEventEntries(params.sessionKey);
	const drainedContinuationCount = queued.filter((event) => event.text.startsWith("[continuation:")).length;
	emitContinuationQueueDrainSpan({
		drainedCount: queued.length,
		drainedContinuationCount,
		log: (message) => defaultRuntime.log(message)
	});
	systemLines.push(...queued.flatMap((event) => {
		const compacted = compactSystemEvent(event.text);
		if (!compacted) return [];
		const prefix = event.trusted === false ? "System (untrusted)" : "System";
		const timestamp = `[${formatSystemEventTimestamp(event.ts, params.cfg)}]`;
		return compacted.split("\n").map((subline, index) => `${prefix}: ${index === 0 ? `${timestamp} ` : ""}${subline}`);
	}));
	if (params.isMainSession && params.isNewSession) {
		const summary = await buildChannelSummary(params.cfg);
		if (summary.length > 0) systemLines.unshift(...summary.flatMap((line) => line.split("\n").map((subline) => `System: ${subline}`)));
	}
	if (systemLines.length === 0) return;
	return systemLines.join("\n");
}
//#endregion
//#region src/auto-reply/reply/session-updates.ts
async function persistSessionEntryUpdate(params) {
	if (!params.sessionStore || !params.sessionKey) return;
	params.sessionStore[params.sessionKey] = {
		...params.sessionStore[params.sessionKey],
		...params.nextEntry
	};
	if (!params.storePath) return;
	await updateSessionStore(params.storePath, (store) => {
		const resolved = resolveSessionStoreEntry({
			store,
			sessionKey: params.sessionKey
		});
		store[resolved.normalizedKey] = {
			...resolved.existing,
			...params.nextEntry
		};
		for (const legacyKey of resolved.legacyKeys) delete store[legacyKey];
	});
}
function emitCompactionSessionLifecycleHooks(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner) return;
	if (hookRunner.hasHooks("session_end")) {
		const transcript = resolveStableSessionEndTranscript({
			sessionId: params.previousEntry.sessionId,
			storePath: params.storePath,
			sessionFile: params.previousEntry.sessionFile,
			agentId: resolveAgentIdFromSessionKey(params.sessionKey)
		});
		const payload = buildSessionEndHookPayload({
			sessionId: params.previousEntry.sessionId,
			sessionKey: params.sessionKey,
			cfg: params.cfg,
			reason: "compaction",
			sessionFile: transcript.sessionFile,
			transcriptArchived: transcript.transcriptArchived,
			nextSessionId: params.nextEntry.sessionId
		});
		hookRunner.runSessionEnd(payload.event, payload.context).catch((err) => {
			logVerbose(`session_end hook failed: ${String(err)}`);
		});
	}
	if (hookRunner.hasHooks("session_start")) {
		const payload = buildSessionStartHookPayload({
			sessionId: params.nextEntry.sessionId,
			sessionKey: params.sessionKey,
			cfg: params.cfg,
			resumedFrom: params.previousEntry.sessionId
		});
		hookRunner.runSessionStart(payload.event, payload.context).catch((err) => {
			logVerbose(`session_start hook failed: ${String(err)}`);
		});
	}
}
async function ensureSkillSnapshot(params) {
	if (process.env.OPENCLAW_TEST_FAST === "1") return {
		sessionEntry: params.sessionEntry,
		skillsSnapshot: params.sessionEntry?.skillsSnapshot,
		systemSent: params.sessionEntry?.systemSent ?? false
	};
	const { sessionEntry, sessionStore, sessionKey, storePath, sessionId, isFirstTurnInSession, workspaceDir, cfg, skillFilter } = params;
	let nextEntry = sessionEntry;
	let systemSent = sessionEntry?.systemSent ?? false;
	const sessionAgentId = resolveSessionAgentId({
		sessionKey,
		config: cfg
	});
	const remoteEligibility = getRemoteSkillEligibility({ advertiseExecNode: canExecRequestNode({
		cfg,
		sessionEntry,
		sessionKey,
		agentId: sessionAgentId
	}) });
	const snapshotVersion = getSkillsSnapshotVersion(workspaceDir);
	const existingSnapshot = nextEntry?.skillsSnapshot;
	ensureSkillsWatcher({
		workspaceDir,
		config: cfg
	});
	const shouldRefreshSnapshot = shouldRefreshSnapshotForVersion(existingSnapshot?.version, snapshotVersion) || !matchesSkillFilter(existingSnapshot?.skillFilter, skillFilter);
	const buildSnapshot = () => buildWorkspaceSkillSnapshot(workspaceDir, {
		config: cfg,
		agentId: sessionAgentId,
		skillFilter,
		eligibility: { remote: remoteEligibility },
		snapshotVersion
	});
	if (isFirstTurnInSession && sessionStore && sessionKey) {
		const current = nextEntry ?? sessionStore[sessionKey] ?? {
			sessionId: sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now()
		};
		const skillSnapshot = !current.skillsSnapshot || shouldRefreshSnapshot ? buildSnapshot() : current.skillsSnapshot;
		nextEntry = {
			...current,
			sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now(),
			systemSent: true,
			skillsSnapshot: skillSnapshot
		};
		await persistSessionEntryUpdate({
			sessionStore,
			sessionKey,
			storePath,
			nextEntry
		});
		systemSent = true;
	}
	const skillsSnapshot = Boolean(nextEntry?.skillsSnapshot) && (nextEntry?.skillsSnapshot !== existingSnapshot || !shouldRefreshSnapshot) ? nextEntry?.skillsSnapshot : shouldRefreshSnapshot || !nextEntry?.skillsSnapshot ? buildSnapshot() : nextEntry.skillsSnapshot;
	if (skillsSnapshot && sessionStore && sessionKey && !isFirstTurnInSession && (!nextEntry?.skillsSnapshot || shouldRefreshSnapshot)) {
		const current = nextEntry ?? {
			sessionId: sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now()
		};
		nextEntry = {
			...current,
			sessionId: sessionId ?? current.sessionId ?? crypto.randomUUID(),
			updatedAt: Date.now(),
			skillsSnapshot
		};
		await persistSessionEntryUpdate({
			sessionStore,
			sessionKey,
			storePath,
			nextEntry
		});
	}
	return {
		sessionEntry: nextEntry,
		skillsSnapshot,
		systemSent
	};
}
async function incrementCompactionCount(params) {
	const { sessionEntry, sessionStore, sessionKey, storePath, cfg, now = Date.now(), amount = 1, tokensAfter, newSessionId } = params;
	if (!sessionStore || !sessionKey) return;
	const entry = sessionStore[sessionKey] ?? sessionEntry;
	if (!entry) return;
	const incrementBy = Math.max(0, amount);
	const nextCount = (entry.compactionCount ?? 0) + incrementBy;
	const updates = {
		compactionCount: nextCount,
		lastContextPressureBand: void 0,
		updatedAt: now
	};
	if (newSessionId && newSessionId !== entry.sessionId) {
		updates.sessionId = newSessionId;
		updates.sessionFile = resolveCompactionSessionFile({
			entry,
			sessionKey,
			storePath,
			newSessionId
		});
	}
	if (tokensAfter != null && tokensAfter > 0) {
		updates.totalTokens = tokensAfter;
		updates.totalTokensFresh = true;
		updates.inputTokens = void 0;
		updates.outputTokens = void 0;
		updates.cacheRead = void 0;
		updates.cacheWrite = void 0;
	}
	sessionStore[sessionKey] = {
		...entry,
		...updates
	};
	if (storePath) await updateSessionStoreEntry({
		storePath,
		sessionKey,
		update: async () => updates
	});
	if (newSessionId && newSessionId !== entry.sessionId && cfg) emitCompactionSessionLifecycleHooks({
		cfg,
		sessionKey,
		storePath,
		previousEntry: entry,
		nextEntry: sessionStore[sessionKey]
	});
	return nextCount;
}
function resolveCompactionSessionFile(params) {
	const pathOpts = resolveSessionFilePathOptions({
		agentId: resolveAgentIdFromSessionKey(params.sessionKey),
		storePath: params.storePath
	});
	const rewrittenSessionFile = rewriteSessionFileForNewSessionId({
		sessionFile: params.entry.sessionFile,
		previousSessionId: params.entry.sessionId,
		nextSessionId: params.newSessionId
	});
	const normalizedRewrittenSessionFile = rewrittenSessionFile && path.isAbsolute(rewrittenSessionFile) ? canonicalizeAbsoluteSessionFilePath(rewrittenSessionFile) : rewrittenSessionFile;
	return resolveSessionFilePath(params.newSessionId, normalizedRewrittenSessionFile ? { sessionFile: normalizedRewrittenSessionFile } : void 0, pathOpts);
}
function canonicalizeAbsoluteSessionFilePath(filePath) {
	const resolved = path.resolve(filePath);
	const missingSegments = [];
	let cursor = resolved;
	while (true) try {
		return path.join(fs.realpathSync(cursor), ...missingSegments.toReversed());
	} catch {
		const parent = path.dirname(cursor);
		if (parent === cursor) return resolved;
		missingSegments.push(path.basename(cursor));
		cursor = parent;
	}
}
function rewriteSessionFileForNewSessionId(params) {
	const trimmed = normalizeOptionalString(params.sessionFile);
	if (!trimmed) return;
	const base = path.basename(trimmed);
	if (!base.endsWith(".jsonl")) return;
	const withoutExt = base.slice(0, -6);
	if (withoutExt === params.previousSessionId) return path.join(path.dirname(trimmed), `${params.nextSessionId}.jsonl`);
	if (withoutExt.startsWith(`${params.previousSessionId}-topic-`)) return path.join(path.dirname(trimmed), `${params.nextSessionId}${base.slice(params.previousSessionId.length)}`);
	const forkMatch = withoutExt.match(/^(\d{4}-\d{2}-\d{2}T[\w-]+(?:Z|[+-]\d{2}(?:-\d{2})?)?)_(.+)$/);
	if (forkMatch?.[2] === params.previousSessionId) return path.join(path.dirname(trimmed), `${forkMatch[1]}_${params.nextSessionId}.jsonl`);
}
//#endregion
export { emitContinuationDelegateFireSpan as a, emitContinuationWorkFireSpan as c, emitContinuationCompactionReleasedSpan as i, emitContinuationWorkSpan as l, incrementCompactionCount as n, emitContinuationDelegateSpan as o, drainFormattedSystemEvents as r, emitContinuationDisabledSpan as s, ensureSkillSnapshot as t };
