/**
 * Where each converted route checks sovereign spans (openclaw#1321, design § 7.1, 🌻's
 * ruling (c)). A route is converted only with a declared check: the embedded runtime checks
 * the settled provider request it builds (`final-payload`); Codex builds its provider request
 * inside its binary, so OpenClaw checks the last request it controls, each app-server handoff
 * that carries the thread's instructions (`handoff`), and names what stays unverified.
 *
 * A declaration says where a check runs; it is never a result. A passed check reports a
 * `*-verified` result into the run's prompt report.
 */
import type { SovereignPromptVerification } from "../../config/sessions/session-system-prompt-report.js";

/** The built-in API builders whose settled request the provider request check can read. */
export const SOVEREIGN_PROVIDER_REQUEST_APIS = [
  "anthropic-messages",
  "openai-completions",
  "mistral-conversations",
  "openai-responses",
  "azure-openai-responses",
  "openai-chatgpt-responses",
  "google-generative-ai",
  "google-vertex",
  "google-interactions",
] as const;

export type SovereignProviderRequestApi = (typeof SOVEREIGN_PROVIDER_REQUEST_APIS)[number];

/**
 * Codex app-server handoffs that carry a thread's instructions: a new thread, a cold resume,
 * the developer policy refresh after it, and reuse of a loaded thread, which keeps the
 * instructions of the handoff that loaded it.
 */
export const SOVEREIGN_CODEX_HANDOFF_SITES = [
  "thread/start",
  "thread/resume",
  "thread/inject_items",
  "live_thread_reuse",
] as const;

export type SovereignCodexHandoffSite = (typeof SOVEREIGN_CODEX_HANDOFF_SITES)[number];

export const SOVEREIGN_CODEX_HANDOFF_BOUNDARY = "app_server_handoff";

const SOVEREIGN_ROUTE_VERIFICATION = [
  {
    route: "openclaw",
    check: "final-payload",
    boundary: "provider_request",
    sites: SOVEREIGN_PROVIDER_REQUEST_APIS,
    unverified: [],
  },
  {
    route: "codex",
    check: "handoff",
    boundary: SOVEREIGN_CODEX_HANDOFF_BOUNDARY,
    sites: SOVEREIGN_CODEX_HANDOFF_SITES,
    // The provider request Codex builds from the handed instructions, and the parent-local
    // inference relay text (the personal USER.md line rides only there).
    unverified: ["codex_binary", "inference_relay"],
  },
] as const;

export const SOVEREIGN_CONVERTED_ROUTES: ReadonlySet<string> = new Set(
  SOVEREIGN_ROUTE_VERIFICATION.map(({ route }) => route),
);

/** The declarations as `openclaw sovereign slots` publishes them: no result, no load. */
export function describeSovereignRouteVerification() {
  return SOVEREIGN_ROUTE_VERIFICATION.map((entry) => ({
    ...entry,
    sites: [...entry.sites],
    unverified: [...entry.unverified],
  }));
}

export function finalPayloadVerified(
  api: SovereignProviderRequestApi,
): SovereignPromptVerification {
  return {
    result: "final-payload-verified",
    route: "openclaw",
    boundary: "provider_request",
    site: api,
  };
}

export function codexHandoffVerified(site: SovereignCodexHandoffSite): SovereignPromptVerification {
  return {
    result: "handoff-verified",
    route: "codex",
    boundary: SOVEREIGN_CODEX_HANDOFF_BOUNDARY,
    site,
  };
}
