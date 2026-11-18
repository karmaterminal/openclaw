/**
 * Sovereign prompt handoff checks on the Codex route (openclaw#1321).
 *
 * Codex builds the provider request in its binary, so OpenClaw checks each app-server
 * handoff that carries a thread's instructions against the spans of the render that built
 * it. The spans travel with the exact request object built from that render; a copied or
 * reshaped request carries none, so for an enforce agent it refuses rather than passing.
 */
import {
  assertSovereignPromptRoute,
  checkSovereignPromptHandoff,
  type SovereignPromptHandoffReceipt,
  type SovereignPromptSpans,
} from "openclaw/plugin-sdk/agent-harness-runtime";
import { isOwnedCodexAppServerProcess } from "./auth-start-options.js";
import type { CodexAppServerStartOptions } from "./config-contracts.js";

type CodexSovereignAttempt = Pick<
  Parameters<typeof checkSovereignPromptHandoff>[0],
  "config" | "agentId"
>;
type CodexInstructionRequest = {
  baseInstructions?: string | null;
  developerInstructions?: string | null;
};

const requestSpans = new WeakMap<object, SovereignPromptSpans>();

/** Builds a request whose base render reports its spans, and binds them to that request. */
export function withCodexSovereignSpans<T extends object>(
  build: (onRenderedSovereignSpans: (spans: SovereignPromptSpans) => void) => T,
): T {
  let rendered: SovereignPromptSpans | undefined;
  const request = build((spans) => {
    rendered = spans;
  });
  if (rendered) {
    requestSpans.set(request, rendered);
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

// The passed handoff that loaded each live thread, per client: a reused thread keeps the
// instructions of the handoff that loaded it. Process-local like live threads (a restart
// resumes cold, which is checked again); bounded above the client's live-thread capacity.
const loadedThreads = new WeakMap<object, Map<string, SovereignPromptHandoffReceipt>>();
const MAX_LOADED_THREADS = 256;

/** Records the checked handoff that loaded `threadId`; one that passed no check clears it. */
export function recordCodexThreadLoad(
  client: object,
  threadId: string,
  receipt: SovereignPromptHandoffReceipt | undefined,
): void {
  const threads = loadedThreads.get(client) ?? new Map<string, SovereignPromptHandoffReceipt>();
  loadedThreads.set(client, threads);
  threads.delete(threadId);
  if (receipt) {
    threads.set(threadId, receipt);
  }
  for (const oldest of threads.keys()) {
    if (threads.size <= MAX_LOADED_THREADS) {
      break;
    }
    threads.delete(oldest);
  }
}

/** Whether a passed handoff for `receipt`'s agent and generation loaded the live thread. */
export function isCodexThreadLoadedBy(
  client: object,
  threadId: string,
  receipt: SovereignPromptHandoffReceipt,
): boolean {
  const loadedBy = loadedThreads.get(client)?.get(threadId);
  return loadedBy?.agentId === receipt.agentId && loadedBy.setDigest === receipt.setDigest;
}

/**
 * Refuses an enforce agent's resume on an app-server other clients can reach, before
 * anything is read. One can load the thread between OpenClaw's read and its resume; Codex
 * then ignores the resume's instructions, and its answer names none in effect.
 */
export function refuseSharedCodexServerResume(
  attempt: CodexSovereignAttempt,
  start: CodexAppServerStartOptions,
): void {
  if (!isOwnedCodexAppServerProcess(start)) {
    assertSovereignPromptRoute({
      config: attempt.config,
      agentId: attempt.agentId,
      route: "codex:external-resume",
    });
  }
}

/** Refuses an enforce agent's reuse of a live thread no passed handoff loaded. */
export function refuseUnverifiedCodexThreadReuse(attempt: CodexSovereignAttempt): void {
  checkSovereignPromptHandoff({
    config: attempt.config,
    agentId: attempt.agentId,
    spans: undefined,
    site: "live_thread_reuse",
    carriers: [],
  });
}

/**
 * Reuse that renders nothing (a native ephemeral thread is sent nothing) takes the loading
 * handoff's receipt when it names this attempt's agent, and otherwise refuses for an enforce
 * agent. `undefined` for an agent with no sovereign text.
 */
export function checkCodexUnrenderedThreadReuse(
  attempt: CodexSovereignAttempt,
  client: object,
  threadId: string,
): SovereignPromptHandoffReceipt | undefined {
  const loadedBy = loadedThreads.get(client)?.get(threadId);
  if (loadedBy?.verification && loadedBy.agentId === attempt.agentId) {
    return { ...loadedBy, verification: { ...loadedBy.verification, site: "live_thread_reuse" } };
  }
  refuseUnverifiedCodexThreadReuse(attempt);
  return undefined;
}
