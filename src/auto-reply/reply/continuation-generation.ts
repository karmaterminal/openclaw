import { loadConfig } from "../../config/config.js";

const DEFAULT_GENERATION_GUARD_TOLERANCE = 300;
const continuationGenerations = new Map<string, number>();

function resolveGenerationGuardTolerance() {
  const configured = loadConfig().agents?.defaults?.continuation?.generationGuardTolerance;
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured < 0) {
    return DEFAULT_GENERATION_GUARD_TOLERANCE;
  }
  return Math.max(0, Math.trunc(configured));
}

export function currentContinuationGeneration(sessionKey: string): number {
  return continuationGenerations.get(sessionKey) ?? 0;
}

export function scheduleContinuationGeneration(sessionKey: string): number {
  const next = currentContinuationGeneration(sessionKey) + 1;
  continuationGenerations.set(sessionKey, next);
  return next;
}

/**
 * Jump past the live tolerance window so every in-flight timer for the session
 * is invalidated by real external input.
 */
export function invalidateContinuationGeneration(sessionKey: string): number {
  const next = currentContinuationGeneration(sessionKey) + resolveGenerationGuardTolerance() + 1;
  continuationGenerations.set(sessionKey, next);
  return next;
}

/**
 * Read tolerance at fire time so hot-reloaded config applies to already
 * scheduled timers.
 */
export function isContinuationGenerationCurrent(sessionKey: string, generation: number): boolean {
  return (
    currentContinuationGeneration(sessionKey) <= generation + resolveGenerationGuardTolerance()
  );
}

export function resetContinuationGenerationsForTests(): void {
  continuationGenerations.clear();
}
