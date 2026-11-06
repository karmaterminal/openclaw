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
 * Two policies share this owner. Runtimes that keep their own compaction use the
 * configured window ratios. The built-in runtime compacts at a resolved token
 * trigger, so its warnings are token points below that trigger.
 *
 * RFC: docs/design/continue-work-signal-v2.md §4.2
 */

import { resolveFreshSessionTotalTokens, type SessionEntry } from "../../config/sessions.js";
import { patchSessionEntryCore } from "../../config/sessions/session-accessor.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("continuation/context-pressure");

const DEFAULT_CONTEXT_PRESSURE_THRESHOLD = 0.8;

// A warning reaches the model with the next turn's prompt: the system-event drain runs
// before this check. So the headrooms below cover the turn in flight at the crossing,
// then the turn that reads the warning and makes its tool call.
/** One inbound message and the reply it produces. */
const TURN_HEADROOM_TOKENS = 8_000;
/** One handoff call and its result: a 4 KiB delegate task, or request_compaction's reason and focus. */
const TOOL_CALL_HEADROOM_TOKENS = 2_000;
/** H1: the second warning sits one turn and one tool call before the trigger. */
const SECOND_WARNING_HEADROOM_TOKENS = TURN_HEADROOM_TOKENS + TOOL_CALL_HEADROOM_TOKENS;
/** H2: the first warning leaves room to stage first, then still see the second warning. */
const FIRST_WARNING_HEADROOM_TOKENS = 2 * SECOND_WARNING_HEADROOM_TOKENS;

const FIRST_WARNING_BAND = 1;
const SECOND_WARNING_BAND = 2;

/**
 * A window ratio percentage from {@link resolveContextPressureBand}, or the ordinal
 * warning from {@link resolveTriggerPressureBand}: 0 is below every warning.
 */
export type PressureBand = number;

/**
 * Resolve which pressure band the current ratio falls into.
 * Returns 0 if below all bands.
 */
export function resolveContextPressureBand(
  ratio: number,
  threshold: number,
  earlyWarningBand?: number,
): PressureBand {
  if (!Number.isFinite(ratio) || ratio < 0 || !Number.isFinite(threshold) || threshold <= 0) {
    return 0;
  }
  const thresholdPct = Math.round(threshold * 100);
  const earlyWarningMultiplier = earlyWarningBand ?? 0;
  const earlyWarningThreshold =
    Number.isFinite(earlyWarningMultiplier) && earlyWarningMultiplier > 0
      ? threshold * earlyWarningMultiplier
      : 0;
  const pressureBands = [
    ...(earlyWarningThreshold > 0
      ? [{ threshold: earlyWarningThreshold, band: Math.round(earlyWarningThreshold * 100) }]
      : []),
    { threshold, band: thresholdPct },
    ...(threshold < 0.9 ? [{ threshold: 0.9, band: 90 }] : []),
    ...(Math.max(threshold, 0.9) < 0.95 ? [{ threshold: 0.95, band: 95 }] : []),
  ];
  let band: PressureBand = 0;
  for (const candidate of pressureBands) {
    if (ratio >= candidate.threshold) {
      band = candidate.band;
    }
  }
  return band;
}

/**
 * Resolve the built-in runtime's warning for a token total, given the compaction trigger.
 *
 * first = trigger - H2 (stage a handoff); second = trigger - H1. Neither is a share of the
 * window, so a trigger pulled low by a large reserve keeps both, in order, with the same
 * headroom. A window whose trigger cannot hold H2 keeps only the second warning, and one that
 * cannot hold H1 has none: a warning at or below zero tokens would carry no information.
 * At or past the trigger compaction owns the session, so nothing warns about it.
 */
export function resolveTriggerPressureBand(
  totalTokens: number,
  compactionTriggerTokens: number,
): PressureBand {
  if (totalTokens >= compactionTriggerTokens) {
    return 0;
  }
  const secondWarningTokens = compactionTriggerTokens - SECOND_WARNING_HEADROOM_TOKENS;
  if (secondWarningTokens > 0 && totalTokens >= secondWarningTokens) {
    return SECOND_WARNING_BAND;
  }
  const firstWarningTokens = compactionTriggerTokens - FIRST_WARNING_HEADROOM_TOKENS;
  return firstWarningTokens > 0 && totalTokens >= firstWarningTokens ? FIRST_WARNING_BAND : 0;
}

/** Tools the last completed run recorded: pre-run evidence of what this session admits. */
export function resolveRecordedToolNames(
  entry: Pick<SessionEntry, "systemPromptReport">,
): ReadonlySet<string> | undefined {
  const tools = entry.systemPromptReport?.tools?.entries;
  return tools ? new Set(tools.map((tool) => tool.name)) : undefined;
}

interface CheckSessionContextPressureParams {
  sessionEntry: SessionEntry;
  sessionKey: string;
  /** Owner of the session-event queue; system events require an agent-qualified key. */
  agentId?: string;
  contextPressureThreshold: number | undefined;
  contextWindowTokens: number;
  admittedToolNames?: ReadonlySet<string>;
  earlyWarningBand?: number;
  postCompaction?: boolean;
  /** Built-in runtime only: the resolved trigger selects token warnings over window ratios. */
  compactionTriggerTokens?: number;
  /** request_compaction's live guard verdict for this entry; absent means no request cue. */
  isRequestCompactionAdmitted?: (entry: SessionEntry) => boolean;
}

interface CheckContextPressureResult {
  fired: boolean;
  band: PressureBand;
}

type SessionContextPressureEvaluation = CheckContextPressureResult & {
  eventText?: string;
  logMessage?: string;
  logLevel?: "info" | "warn";
};

function buildTriggerPressureEvent(params: {
  percentUsed: number;
  tokensK: number;
  windowK: number;
  triggerK: number;
  canStageDelegate: boolean;
  canRequestCompaction: boolean;
}): string {
  const stageCue = params.canStageDelegate
    ? "Stage a chosen handoff: continue_delegate(mode='post-compaction', task='<working-state-summary>') carries it across compaction, or write critical state to memory files."
    : "Stage a chosen handoff: preserve critical working state outside the active context before upcoming compaction.";
  const requestCue = params.canRequestCompaction
    ? " Once it is staged, request_compaction(reason='...') lands compaction at a moment you choose."
    : "";
  return (
    `[system:context-pressure] ${params.percentUsed}% of context window consumed ` +
    `(${params.tokensK}k / ${params.windowK}k tokens). ` +
    `Automatic compaction runs at ${params.triggerK}k tokens. ${stageCue}${requestCue}`
  );
}

function buildContextPressureEvent(params: {
  percentUsed: number;
  tokensK: number;
  windowK: number;
  band: PressureBand;
  admittedToolNames?: ReadonlySet<string>;
  postCompaction?: boolean;
}): string {
  if (params.postCompaction) {
    return (
      `[system:context-pressure] Post-compaction: ${params.percentUsed}% context consumed ` +
      `(${params.tokensK}k/${params.windowK}k tokens). ` +
      `Session was compacted. Working state may need rehydration.`
    );
  }

  const hasContinueDelegate = params.admittedToolNames?.has("continue_delegate") === true;
  const hasRequestCompaction = params.admittedToolNames?.has("request_compaction") === true;
  if (!hasContinueDelegate && !hasRequestCompaction) {
    const urgency =
      params.band >= 95
        ? "COMPACTION IMMINENT — preserve critical working state outside the active context before the next turn."
        : "Preserve critical working state before upcoming compaction.";
    return (
      `[system:context-pressure] ${params.percentUsed}% of context window consumed ` +
      `(${params.tokensK}k / ${params.windowK}k tokens). ${urgency}`
    );
  }

  const urgency =
    hasContinueDelegate && hasRequestCompaction && params.band >= 95
      ? "COMPACTION IMMINENT — FIRST stage working-state survival via continue_delegate(mode='post-compaction', task='<working-state-summary>'), THEN call request_compaction(reason='<why>') volitionally; the alternative is forced compaction at absolute context exhaustion. " +
        "The post-compaction delegate is what carries state across the seam — if you call request_compaction without staging it first, working state will NOT survive. " +
        "Both are tool calls you can make right now, this turn."
      : hasContinueDelegate && hasRequestCompaction && params.band >= 90
        ? "Context window nearly full — FIRST stage working-state survival via continue_delegate(mode='post-compaction', task='...'), THEN call request_compaction(reason='...') volitionally; the alternative is forced compaction at absolute context exhaustion. " +
          "The post-compaction delegate fires after compaction completes and returns elective working-state to the new session — it is what carries state across the seam."
        : hasContinueDelegate
          ? "Consider continue_delegate(mode='post-compaction', task='...') to stage working-state survival for upcoming compaction, or write critical state to memory files."
          : "Preserve critical working state outside the active context, then call request_compaction(reason='...') before forced compaction.";

  return (
    `[system:context-pressure] ${params.percentUsed}% of context window consumed ` +
    `(${params.tokensK}k / ${params.windowK}k tokens). ${urgency}`
  );
}

function evaluateSessionContextPressure(
  params: CheckSessionContextPressureParams,
): SessionContextPressureEvaluation {
  const {
    sessionEntry,
    sessionKey,
    contextPressureThreshold,
    contextWindowTokens,
    admittedToolNames,
    earlyWarningBand,
    postCompaction = false,
    compactionTriggerTokens,
  } = params;
  const threshold =
    contextPressureThreshold ?? (postCompaction ? DEFAULT_CONTEXT_PRESSURE_THRESHOLD : undefined);
  // The post-compaction notice reports a seam, so only a warning needs a v2 total: a v1
  // total is one request_compaction refuses, and it is not pressure evidence either.
  const totalTokens = postCompaction
    ? sessionEntry.totalTokens
    : resolveFreshSessionTotalTokens(sessionEntry);

  if (
    threshold == null ||
    threshold <= 0 ||
    !Number.isFinite(contextWindowTokens) ||
    contextWindowTokens <= 0 ||
    totalTokens == null ||
    !Number.isFinite(totalTokens) ||
    totalTokens <= 0
  ) {
    return { fired: false, band: 0 };
  }

  const ratio = Math.max(0, totalTokens / contextWindowTokens);
  const usesTrigger = compactionTriggerTokens !== undefined;
  // The notice keeps out of the warning record, so it never spends a warning of the next cycle.
  const band = usesTrigger
    ? postCompaction
      ? 0
      : resolveTriggerPressureBand(totalTokens, compactionTriggerTokens)
    : resolveContextPressureBand(ratio, threshold, earlyWarningBand);
  if (!postCompaction && band === 0 && (usesTrigger || ratio < threshold)) {
    if (log.isEnabled("debug")) {
      log.debug(
        `[context-pressure:noop] reason=below-threshold ratio=${Math.round(ratio * 100)}% threshold=${Math.round(threshold * 100)}% rawRatio=${ratio.toFixed(4)} rawThreshold=${threshold.toFixed(4)} trigger=${compactionTriggerTokens ?? "none"} session=${sessionKey}`,
      );
    }
    return { fired: false, band: 0 };
  }

  const previous = sessionEntry.lastContextPressureBand;
  if (!postCompaction && previous !== undefined && band === previous) {
    if (log.isEnabled("debug")) {
      log.debug(
        `[context-pressure:noop] reason=band-dedup band=${band} previous=${previous} ratio=${Math.round(ratio * 100)}% session=${sessionKey}`,
      );
    }
    return { fired: false, band };
  }

  const percentUsed = Math.round(ratio * 100);
  const tokensK = Math.round(totalTokens / 1000);
  const windowK = Math.round(contextWindowTokens / 1000);
  const eventText =
    usesTrigger && !postCompaction
      ? buildTriggerPressureEvent({
          percentUsed,
          tokensK,
          windowK,
          triggerK: Math.round(compactionTriggerTokens / 1000),
          canStageDelegate: admittedToolNames?.has("continue_delegate") === true,
          canRequestCompaction:
            band === SECOND_WARNING_BAND &&
            admittedToolNames?.has("request_compaction") === true &&
            params.isRequestCompactionAdmitted?.(sessionEntry) === true,
        })
      : buildContextPressureEvent({
          percentUsed,
          tokensK,
          windowK,
          band,
          admittedToolNames,
          postCompaction,
        });

  return {
    fired: true,
    band,
    eventText,
    logMessage: `[context-pressure:fire]${postCompaction ? " post-compaction" : ""} band=${band} previous=${previous ?? "none"} ratio=${percentUsed}% tokens=${tokensK}k/${windowK}k session=${sessionKey}`,
    logLevel: postCompaction ? "info" : "warn",
  };
}

function publishSessionContextPressure(
  params: Pick<CheckSessionContextPressureParams, "sessionEntry" | "sessionKey" | "agentId"> & {
    expectedSessionId?: string;
  },
  evaluation: SessionContextPressureEvaluation,
): CheckContextPressureResult {
  if (!evaluation.fired || !evaluation.eventText || !evaluation.logMessage) {
    return { fired: false, band: evaluation.band };
  }
  log[evaluation.logLevel ?? "warn"](evaluation.logMessage);
  enqueueSystemEvent(evaluation.eventText, {
    // The owner is optional here because the recovery path may not carry one
    // (embedded-agent-runner/run/recovery-context-pressure.ts leaves agentId
    // unguarded). resolveSystemEventQueueKey takes the owner when supplied and
    // verifies it matches, and otherwise reads it off an already-qualified
    // session key, so a missing agentId is only fatal for a genuinely bare key.
    sessionKey: resolveSystemEventQueueKey(params.sessionKey, params.agentId),
    trusted: true,
    ...(params.expectedSessionId ? { expectedSessionId: params.expectedSessionId } : {}),
  });
  params.sessionEntry.lastContextPressureBand = evaluation.band;
  return { fired: true, band: evaluation.band };
}

function checkSessionContextPressure(
  params: CheckSessionContextPressureParams,
): CheckContextPressureResult {
  return publishSessionContextPressure(params, evaluateSessionContextPressure(params));
}

/**
 * Check whether a context-pressure event should fire for the given session.
 */
export function checkContextPressure(
  params: CheckSessionContextPressureParams,
): CheckContextPressureResult {
  return checkSessionContextPressure(params);
}

/**
 * Applies the context-pressure policy against the latest durable session row.
 * The band is committed before the trusted event becomes visible.
 */
export async function emitPersistedContextPressure(
  params: CheckSessionContextPressureParams & {
    continuationEnabled: boolean;
    storePath: string;
    expectedSessionId?: string;
  },
): Promise<CheckContextPressureResult> {
  if (!params.continuationEnabled) {
    return { fired: false, band: 0 };
  }

  let evaluation: SessionContextPressureEvaluation | undefined;
  const persisted = await patchSessionEntryCore(
    {
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      storePath: params.storePath,
    },
    (current) => {
      if (
        params.expectedSessionId !== undefined &&
        current.sessionId !== params.expectedSessionId
      ) {
        evaluation = undefined;
        return null;
      }
      evaluation = evaluateSessionContextPressure({
        ...params,
        sessionEntry: {
          ...current,
          totalTokens: params.sessionEntry.totalTokens,
          totalTokensFresh: params.sessionEntry.totalTokensFresh,
          totalTokensVersion: params.sessionEntry.totalTokensVersion,
        },
      });
      return evaluation.fired ? { lastContextPressureBand: evaluation.band } : null;
    },
    { preserveActivity: true },
  );
  if (!persisted || !evaluation?.fired) {
    return { fired: false, band: evaluation?.band ?? 0 };
  }
  return publishSessionContextPressure(params, evaluation);
}
