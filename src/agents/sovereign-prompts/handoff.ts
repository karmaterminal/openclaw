import type { SessionSystemPromptReport } from "../../config/sessions/session-system-prompt-report.js";
/**
 * Handoff verification for sovereign prompts (openclaw#1321, design § 7.1).
 *
 * Codex builds the provider request inside its binary, past anything OpenClaw can read, so
 * OpenClaw checks the last request it controls: each app-server handoff that carries the
 * thread's instructions. The check takes the spans of the render that built that handoff
 * and never re-resolves an owner or re-renders. Whatever the binary does with the handed
 * instructions stays unverified, and the result says so by naming the boundary.
 */
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  isSovereignPromptAgent,
  readLoadedSovereignPromptSnapshot,
  strictAgentId,
  type SovereignPromptSpans,
} from "./runtime.js";
import { describeSovereignPromptsRefused, SovereignPromptRefusal } from "./snapshot.js";
import {
  codexHandoffVerified,
  SOVEREIGN_CODEX_HANDOFF_BOUNDARY,
  type SovereignCodexHandoffSite,
} from "./verification.js";

const log = createSubsystemLogger("agents/sovereign-prompts");

/** The prompt report's receipt: the loaded generation's metadata and the check it passed. */
export type SovereignPromptHandoffReceipt = NonNullable<SessionSystemPromptReport["sovereign"]>;

/**
 * Checks one Codex handoff before it is written. Every span of the render that built it
 * must appear whole in one of the handoff's instruction carriers (`baseInstructions`,
 * `developerInstructions`, an injected policy message); formatting around a span (the
 * `<thread_policy>` frame, a notice) passes.
 *
 * Returns `undefined` for an agent with no sovereign text (off, or no `enforce` agent in
 * the process), and the receipt when the check passes. Under `enforce` it refuses, logging
 * a content-free line, when the handoff carries no spans, spans of another agent or
 * generation, or loses a span: `transform_altered`, `route=codex`,
 * `site=app_server_handoff:<site>`. The caller writes nothing after a refusal.
 */
export function checkSovereignPromptHandoff(params: {
  config?: OpenClawConfig;
  /** The attempt's agent, as its run names it. */
  agentId?: string;
  /** The spans of the render that built this handoff; `undefined` when it rendered none. */
  spans: SovereignPromptSpans | undefined;
  site: SovereignCodexHandoffSite;
  carriers: readonly (string | null | undefined)[];
}): SovereignPromptHandoffReceipt | undefined {
  const { spans } = params;
  if (!spans && !isSovereignPromptAgent(params.config, params.agentId)) {
    return undefined;
  }
  const agentId = strictAgentId(params.agentId);
  const snapshot = agentId ? readLoadedSovereignPromptSnapshot(agentId) : undefined;
  const carriers = params.carriers.filter((text): text is string => typeof text === "string");
  if (
    !spans ||
    !snapshot ||
    spans.agentId !== agentId ||
    spans.setDigest !== snapshot.setDigest ||
    !spans.instances.every((instance) => carriers.some((text) => text.includes(instance)))
  ) {
    const refusal = new SovereignPromptRefusal("transform_altered", {
      route: "codex",
      site: `${SOVEREIGN_CODEX_HANDOFF_BOUNDARY}:${params.site}`,
    });
    const { line, fields } = describeSovereignPromptsRefused(
      agentId ?? spans?.agentId ?? "(none)",
      refusal,
    );
    log.warn(line, fields);
    throw refusal;
  }
  return { ...snapshot.toJSON(), verification: codexHandoffVerified(params.site) };
}
