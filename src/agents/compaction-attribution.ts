export type RequestCompactionInvocation = {
  sessionKey: string;
  sessionId: string;
  runId?: string;
  diagId: string;
  trigger: "volitional";
  reason: string;
  contextUsage: number;
  requestedAtMs: number;
};

export type CompactionCounterAttribution = {
  runId?: string;
  trigger: string;
  outcome: string;
};

let compactionDiagCounter = 0;

export function createCompactionDiagId(now = Date.now()): string {
  compactionDiagCounter = (compactionDiagCounter + 1) % 0x100_000;
  return `cmp-${now.toString(36)}-${compactionDiagCounter.toString(36).padStart(4, "0")}`;
}

export function normalizeCompactionTrigger(value: unknown): string {
  if (value === "threshold") {
    return "budget";
  }
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}
