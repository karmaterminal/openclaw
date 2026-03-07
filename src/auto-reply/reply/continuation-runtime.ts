import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";

export type ContinuationRuntimeConfig = {
  enabled: boolean;
  defaultDelayMs: number;
  minDelayMs: number;
  maxDelayMs: number;
  maxChainLength: number;
  costCapTokens: number;
  maxDelegatesPerTurn: number;
  generationGuardTolerance: number;
  contextPressureThreshold?: number;
};

const DEFAULT_CONTINUATION_DELAY_MS = 15_000;
const DEFAULT_CONTINUATION_MIN_DELAY_MS = 5_000;
const DEFAULT_CONTINUATION_MAX_DELAY_MS = 300_000;
const DEFAULT_CONTINUATION_MAX_CHAIN_LENGTH = 10;
const DEFAULT_CONTINUATION_COST_CAP_TOKENS = 500_000;
const DEFAULT_CONTINUATION_MAX_DELEGATES_PER_TURN = 5;
const DEFAULT_CONTINUATION_GENERATION_GUARD_TOLERANCE = 0;

export function resolveContinuationRuntimeConfig(
  cfg: OpenClawConfig = loadConfig(),
): ContinuationRuntimeConfig {
  const continuation = cfg.agents?.defaults?.continuation;

  return {
    enabled: continuation?.enabled === true,
    defaultDelayMs: continuation?.defaultDelayMs ?? DEFAULT_CONTINUATION_DELAY_MS,
    minDelayMs: continuation?.minDelayMs ?? DEFAULT_CONTINUATION_MIN_DELAY_MS,
    maxDelayMs: continuation?.maxDelayMs ?? DEFAULT_CONTINUATION_MAX_DELAY_MS,
    maxChainLength: continuation?.maxChainLength ?? DEFAULT_CONTINUATION_MAX_CHAIN_LENGTH,
    costCapTokens: continuation?.costCapTokens ?? DEFAULT_CONTINUATION_COST_CAP_TOKENS,
    maxDelegatesPerTurn:
      continuation?.maxDelegatesPerTurn ?? DEFAULT_CONTINUATION_MAX_DELEGATES_PER_TURN,
    generationGuardTolerance:
      continuation?.generationGuardTolerance ?? DEFAULT_CONTINUATION_GENERATION_GUARD_TOLERANCE,
    contextPressureThreshold:
      typeof continuation?.contextPressureThreshold === "number"
        ? continuation.contextPressureThreshold
        : undefined,
  };
}
