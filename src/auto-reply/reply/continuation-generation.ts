import { resolveContinuationRuntimeConfig } from "./continuation-runtime.js";

const continuationGenerations = new Map<string, number>();

/**
 * Read generationGuardTolerance from live config at call time.
 * Delegates to the single normalization authority in continuation-runtime.
 */
function resolveGenerationGuardTolerance(): number {
  return resolveContinuationRuntimeConfig().generationGuardTolerance;
}

export function currentContinuationGeneration(sessionKey: string): number {
  return continuationGenerations.get(sessionKey) ?? 0;
}

/**
 * Increment generation by 1 — used when scheduling a continuation timer.
 * The returned value is captured by the timer callback for later comparison.
 */
export function scheduleContinuationGeneration(sessionKey: string): number {
  const next = currentContinuationGeneration(sessionKey) + 1;
  continuationGenerations.set(sessionKey, next);
  return next;
}

/**
 * Jump past the live tolerance window so every in-flight timer for the session
 * is invalidated. Called when external input arrives (cancels pending timers).
 * Reads tolerance at call time (hot-reload safe).
 */
export function invalidateContinuationGeneration(sessionKey: string): number {
  const next = currentContinuationGeneration(sessionKey) + resolveGenerationGuardTolerance() + 1;
  continuationGenerations.set(sessionKey, next);
  return next;
}

/**
 * Check if a timer's captured generation is still current.
 * Reads tolerance at check time (fire time), not at capture time (schedule time).
 * This is the P1 fix for the stale-closure bug.
 */
export function isContinuationGenerationCurrent(sessionKey: string, generation: number): boolean {
  return (
    currentContinuationGeneration(sessionKey) <= generation + resolveGenerationGuardTolerance()
  );
}

/** For tests only. */
export function resetContinuationGenerationsForTests(): void {
  continuationGenerations.clear();
}
