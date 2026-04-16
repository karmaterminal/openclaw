/**
 * Continuation configuration types, defaults, and resolution.
 *
 * The continuation system is opt-in (`enabled: false` by default) and bounded
 * by chain-length, token-cost, delay-clamping, and per-turn fan-out limits.
 * Generation guard tolerance has been removed by design decision — delayed work
 * should not be cancelled by unrelated channel noise.
 */

export type ContinuationConfig = {
  /** Feature gate — explicit opt-in required in openclaw.json. */
  enabled?: boolean;
  /** Maximum depth of a single continuation chain (recursion guard). */
  maxChainLength?: number;
  /** Default delay between continuation turns (ms). */
  defaultDelayMs?: number;
  /** Floor for delay clamping (ms). */
  minDelayMs?: number;
  /** Ceiling for delay clamping (ms). */
  maxDelayMs?: number;
  /** Per-chain token budget. */
  costCapTokens?: number;
  /** Per-turn fan-out limit for continue_delegate(). */
  maxDelegatesPerTurn?: number;
  /** Context-pressure threshold (0–1 ratio). */
  contextPressureThreshold?: number;
  /** Use Task Flow for durable delegate queue persistence. */
  taskFlowDelegates?: boolean;
};

export type ResolvedContinuationConfig = Required<ContinuationConfig>;

export const CONTINUATION_DEFAULTS: ResolvedContinuationConfig = {
  enabled: false,
  maxChainLength: 10,
  defaultDelayMs: 15_000,
  minDelayMs: 5_000,
  maxDelayMs: 300_000,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
  contextPressureThreshold: 0.8,
  taskFlowDelegates: true,
};

export function resolveContinuationConfig(
  raw: ContinuationConfig | undefined,
): ResolvedContinuationConfig {
  if (!raw) {
    return { ...CONTINUATION_DEFAULTS };
  }
  return {
    enabled: raw.enabled ?? CONTINUATION_DEFAULTS.enabled,
    maxChainLength: clampPositiveInt(raw.maxChainLength, CONTINUATION_DEFAULTS.maxChainLength),
    defaultDelayMs: clampPositiveInt(raw.defaultDelayMs, CONTINUATION_DEFAULTS.defaultDelayMs),
    minDelayMs: clampPositiveInt(raw.minDelayMs, CONTINUATION_DEFAULTS.minDelayMs),
    maxDelayMs: clampPositiveInt(raw.maxDelayMs, CONTINUATION_DEFAULTS.maxDelayMs),
    costCapTokens: clampPositiveInt(raw.costCapTokens, CONTINUATION_DEFAULTS.costCapTokens),
    maxDelegatesPerTurn: clampPositiveInt(
      raw.maxDelegatesPerTurn,
      CONTINUATION_DEFAULTS.maxDelegatesPerTurn,
    ),
    contextPressureThreshold: clampFraction(
      raw.contextPressureThreshold,
      CONTINUATION_DEFAULTS.contextPressureThreshold,
    ),
    taskFlowDelegates: raw.taskFlowDelegates ?? CONTINUATION_DEFAULTS.taskFlowDelegates,
  };
}

/** Clamp a value intended to be a positive integer, falling back to `fallback`. */
function clampPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}

/** Clamp a fractional 0–1 value, falling back to `fallback`. */
function clampFraction(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

/** Clamp a delay value to [minDelayMs, maxDelayMs]. */
export function clampDelay(delayMs: number, config: ResolvedContinuationConfig): number {
  return Math.max(config.minDelayMs, Math.min(config.maxDelayMs, Math.floor(delayMs)));
}
