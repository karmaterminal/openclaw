export type BusySkipBackoffParams = { baseMs: number; ceilingMs: number; factor: number };

/** PRE-increment skip count: base, base·factor, … capped at ceiling. */
export function computeBusySkipBackoffMs(
  busySkipCount: number,
  params: BusySkipBackoffParams,
): number {
  const exponent = Math.max(0, busySkipCount);
  return Math.min(params.ceilingMs, params.baseMs * params.factor ** exponent);
}
