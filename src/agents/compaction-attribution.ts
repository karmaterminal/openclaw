import { generateSecureToken } from "../infra/secure-random.js";

export type RequestCompactionInvocation = {
  sessionKey: string;
  sessionId: string;
  runId?: string;
  diagId: string;
  trigger: "volitional";
  reason: string;
  customInstructions?: string;
  contextUsage: number;
  requestedAtMs: number;
  traceparent?: string;
};

export function createCompactionDiagId(now = Date.now()): string {
  return `cmp-${now.toString(36)}-${generateSecureToken(4)}`;
}
