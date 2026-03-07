import { loadConfig } from "../../config/config.js";

/**
 * Canonical continuation runtime defaults.
 * Single source of truth — all consumer code imports from here.
 */
const DEFAULTS = {
  enabled: false,
  defaultDelayMs: 15_000,
  minDelayMs: 5_000,
  maxDelayMs: 300_000,
  maxChainLength: 10,
  costCapTokens: 500_000,
  maxDelegatesPerTurn: 5,
  generationGuardTolerance: 0,
} as const;

export interface ContinuationRuntimeConfig {
  enabled: boolean;
  defaultDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  maxChainLength: number;
  costCapTokens: number;
  maxDelegatesPerTurn: number;
  generationGuardTolerance: number;
}

/**
 * Resolve the live continuation runtime config by reading from loadConfig()
 * and normalizing defaults. Call this at the point of enforcement, not earlier.
 *
 * This is the single normalization authority for hot-reload-sensitive
 * continuation config values. Timer callbacks, tool execution, and runner
 * consumption should all go through this function.
 */
export function resolveContinuationRuntimeConfig(): ContinuationRuntimeConfig {
  const cfg = loadConfig();
  const c = cfg.agents?.defaults?.continuation;

  return {
    enabled: c?.enabled ?? DEFAULTS.enabled,
    defaultDelayMs: clampPositive(c?.defaultDelayMs, DEFAULTS.defaultDelayMs),
    minDelayMs: clampPositive(c?.minDelayMs, DEFAULTS.minDelayMs),
    maxDelayMs: clampPositive(c?.maxDelayMs, DEFAULTS.maxDelayMs),
    maxChainLength: clampPositive(c?.maxChainLength, DEFAULTS.maxChainLength),
    costCapTokens: clampNonNeg(c?.costCapTokens, DEFAULTS.costCapTokens),
    maxDelegatesPerTurn: clampPositive(c?.maxDelegatesPerTurn, DEFAULTS.maxDelegatesPerTurn),
    generationGuardTolerance: clampNonNeg(
      c?.generationGuardTolerance,
      DEFAULTS.generationGuardTolerance,
    ),
  };
}

/**
 * Convenience: resolve just maxDelegatesPerTurn from live config.
 * Used by continue_delegate tool and agent-runner consumption path.
 */
export function resolveMaxDelegatesPerTurn(): number {
  return resolveContinuationRuntimeConfig().maxDelegatesPerTurn;
}

/** Clamp to positive integer, fallback to default if not a finite positive number. */
function clampPositive(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.trunc(value));
}

/** Clamp to non-negative integer, fallback to default if not a finite non-negative number. */
function clampNonNeg(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.max(0, Math.trunc(value));
}
