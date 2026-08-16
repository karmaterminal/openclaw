import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeBoundedOptionalString } from "@openclaw/normalization-core/string-coerce";

/** Producer-supplied adoption facts. runId is recorded only when the caller passes one. */
export type ChannelIngressAdoptedFacts = {
  runId?: string;
};

/** Closed completion lineage persisted on completed ingress tombstones. */
export type ChannelIngressCompletionOutcome =
  | "agent-run-adopted"
  | "delivery-returned-completed"
  | "delivery-returned-without-handoff";

export type ChannelIngressCompletionLineage =
  | {
      outcome: "agent-run-adopted";
      runId?: string;
    }
  | {
      outcome: "delivery-returned-completed";
    }
  | {
      outcome: "delivery-returned-without-handoff";
    };

/** Full pre-adoption -> adoption ownership lifecycle for one claimed event. */
export type ChannelIngressDispatchLifecycle = {
  /** Pre-adoption only. After adopt the drain treats this signal as inert. */
  abortSignal: AbortSignal;
  /**
   * Fires when recovery-relevant session/run state is durable.
   * Drain completes (tombstones) the claim here -- never at settle.
   */
  onAdopted: (facts?: ChannelIngressAdoptedFacts) => void | Promise<void>;
  /**
   * Turn ownership deferred to reply-lane admission (queued followup).
   * Claim remains held until adopted or abandoned.
   */
  onDeferred: () => void;
  /**
   * Durable adoption finalization is in progress (e.g. settlement hold while
   * committing dedupe). Clears the pre-adoption stall watchdog so a timeout
   * settlement cannot race and dead-letter an about-to-complete claim.
   * Claim stays held until onAdopted / onAbandoned / fail.
   */
  onAdoptionFinalizing: () => void;
  /** Deferred work terminally failed after dispatch returned. */
  onFailed?: (error: unknown) => void | Promise<void>;
  /** Explicit cancellation before adoption; releases without consuming retry budget. */
  onCancelled?: () => void | Promise<void>;
  /**
   * Deferred turn finished without ever owning the reply lane.
   * Drain releases the claim for retry.
   */
  onAbandoned: () => void | Promise<void>;
};

/** Maps a drain lifecycle onto the reply-lane ownership surface. */
export function bindIngressLifecycleToReplyOptions(lifecycle: ChannelIngressDispatchLifecycle): {
  turnAdoptionLifecycle: {
    admission: "exclusive";
    onAdopted: (facts?: ChannelIngressAdoptedFacts) => void | Promise<void>;
    onDeferred: () => void;
    onAbandoned: () => void | Promise<void>;
    abortSignal: AbortSignal;
  };
} {
  return {
    turnAdoptionLifecycle: {
      admission: "exclusive",
      onAdopted: lifecycle.onAdopted,
      onDeferred: lifecycle.onDeferred,
      onAbandoned: lifecycle.onAbandoned,
      abortSignal: lifecycle.abortSignal,
    },
  };
}

// onAdoptionFinalizing stays drain-only (not reply-options); channels call it
// via the spooled-replay ALS lifecycle frame during settlement hold.

/** Keep runId diagnostic-sized so this column cannot become a payload dump. */
const INGRESS_COMPLETION_RUN_ID_MAX_LENGTH = 128;

const INGRESS_COMPLETION_OUTCOMES = [
  "agent-run-adopted",
  "delivery-returned-completed",
  "delivery-returned-without-handoff",
] as const satisfies readonly ChannelIngressCompletionOutcome[];

const INGRESS_COMPLETION_OUTCOME_SET = new Set<string>(INGRESS_COMPLETION_OUTCOMES);

function isIngressCompletionOutcome(value: unknown): value is ChannelIngressCompletionOutcome {
  return typeof value === "string" && INGRESS_COMPLETION_OUTCOME_SET.has(value);
}

/**
 * Persist only closed producer-known outcomes. Policy-gate, silence, and
 * session identity are not facts at this layer; extra keys would reintroduce
 * payload into the tombstone.
 */
export function buildChannelIngressCompletionLineage(
  input: unknown,
): ChannelIngressCompletionLineage | undefined {
  if (!isRecord(input) || !isIngressCompletionOutcome(input.outcome)) {
    return undefined;
  }
  if (input.outcome === "agent-run-adopted") {
    const runId = normalizeBoundedOptionalString(input.runId, INGRESS_COMPLETION_RUN_ID_MAX_LENGTH);
    return runId ? { outcome: "agent-run-adopted", runId } : { outcome: "agent-run-adopted" };
  }
  return { outcome: input.outcome };
}

/** Adoption always records agent-run-adopted; runId is copied only when supplied. */
export function buildAgentRunAdoptedLineage(
  facts?: ChannelIngressAdoptedFacts,
): ChannelIngressCompletionLineage {
  return (
    buildChannelIngressCompletionLineage({
      outcome: "agent-run-adopted",
      runId: facts?.runId,
    }) ?? { outcome: "agent-run-adopted" }
  );
}
