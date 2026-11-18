/**
 * Sovereign prompt handoff checks on the Codex route (openclaw#1321, 🌻's ruling (c)).
 *
 * Codex builds the provider request in its binary, so OpenClaw checks each app-server
 * handoff that carries a thread's instructions against the spans of the render that built
 * it. The spans travel with the exact request object built from that render; a copied or
 * reshaped request carries none, so for an enforce agent it refuses rather than passing.
 */
import {
  checkSovereignPromptHandoff,
  type SovereignPromptHandoffReceipt,
  type SovereignPromptSpans,
} from "openclaw/plugin-sdk/agent-harness-runtime";

type CodexSovereignAttempt = Pick<
  Parameters<typeof checkSovereignPromptHandoff>[0],
  "config" | "agentId"
>;
type CodexInstructionRequest = {
  baseInstructions?: string | null;
  developerInstructions?: string | null;
};

const requestSpans = new WeakMap<object, SovereignPromptSpans>();

export function bindCodexSovereignSpans<T extends object>(
  request: T,
  spans: SovereignPromptSpans | undefined,
): T {
  if (spans) {
    requestSpans.set(request, spans);
  }
  return request;
}

/**
 * Checks a thread/start or thread/resume request before it is written, or the request a
 * loaded thread would need, for its reuse. `undefined` for an agent with no sovereign text.
 */
export function checkCodexThreadHandoff(
  attempt: CodexSovereignAttempt,
  site: "thread/start" | "thread/resume" | "live_thread_reuse",
  request: CodexInstructionRequest,
): SovereignPromptHandoffReceipt | undefined {
  return checkSovereignPromptHandoff({
    config: attempt.config,
    agentId: attempt.agentId,
    spans: requestSpans.get(request),
    site,
    carriers: [request.baseInstructions, request.developerInstructions],
  });
}

/**
 * Checks the developer policy refresh after a resume. The resumed history keeps its
 * creation-time developer message, so behind an authored Codex base this text is what
 * carries the spans; on an ordinary thread the base the resume handed carries them.
 */
export function checkCodexPolicyRefresh(
  attempt: CodexSovereignAttempt,
  resumeRequest: CodexInstructionRequest,
  text: string,
): void {
  checkSovereignPromptHandoff({
    config: attempt.config,
    agentId: attempt.agentId,
    spans: requestSpans.get(resumeRequest),
    site: "thread/inject_items",
    carriers: [resumeRequest.baseInstructions, text],
  });
}

/**
 * A reused thread keeps the instructions of the handoff that loaded it. Reuse needs that
 * handoff to have passed for this agent's loaded generation; an enforce agent's reuse of a
 * thread no passed handoff loaded refuses (`undefined` for an agent with no sovereign text).
 */
export function checkCodexThreadReuse(
  attempt: CodexSovereignAttempt,
  loadedBy: SovereignPromptHandoffReceipt | undefined,
  current: SovereignPromptHandoffReceipt | undefined,
): SovereignPromptHandoffReceipt | undefined {
  if (
    loadedBy &&
    loadedBy.agentId === current?.agentId &&
    loadedBy.setDigest === current.setDigest
  ) {
    return current;
  }
  return checkSovereignPromptHandoff({
    config: attempt.config,
    agentId: attempt.agentId,
    spans: undefined,
    site: "live_thread_reuse",
    carriers: [],
  });
}

/**
 * Reuse that renders nothing (a native ephemeral thread is sent nothing): the creating
 * handoff's receipt stands for this attempt only when it names this attempt's agent.
 */
export function checkCodexUnrenderedThreadReuse(
  attempt: CodexSovereignAttempt,
  loadedBy: SovereignPromptHandoffReceipt | undefined,
): SovereignPromptHandoffReceipt | undefined {
  const current =
    loadedBy && loadedBy.agentId === attempt.agentId
      ? {
          ...loadedBy,
          verification: loadedBy.verification && {
            ...loadedBy.verification,
            site: "live_thread_reuse",
          },
        }
      : undefined;
  return checkCodexThreadReuse(attempt, loadedBy, current);
}

/**
 * A live thread's fingerprint input: the passed handoff that loaded it. A thread handed
 * the same bytes without a passed check never matches, so it resumes cold and is checked.
 */
export function codexSovereignHandoffIdentity(receipt: SovereignPromptHandoffReceipt | undefined) {
  return receipt && { agentId: receipt.agentId, setDigest: receipt.setDigest };
}
