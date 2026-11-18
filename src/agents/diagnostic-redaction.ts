import { redactSecrets } from "../logging/redact.js";
import { redactSovereignValue } from "../logging/sovereign-redaction.js";
import { sanitizeDiagnosticPayload } from "./payload-redaction.js";

export function redactAgentDiagnosticPayload(value: string): string;
export function redactAgentDiagnosticPayload(value: unknown): unknown;
export function redactAgentDiagnosticPayload(value: unknown): unknown {
  // Sovereign spans first: secret redaction and sanitizing can split or bound them.
  return redactSecrets(sanitizeDiagnosticPayload(redactSovereignValue(value)));
}
