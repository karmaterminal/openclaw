// Continuation-line harness pieces for subagent-announce.format.e2e.test.ts:
// descendant-wake dispatch acks, the registry's reserved steer-dispatch seam, and
// the continuation-trigger cases registered into that suite's describe block.
import { expect, it, vi, type Mock } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import type { runSubagentAnnounceDispatch } from "./subagent-announce-dispatch.js";
import type { runSubagentAnnounceFlow } from "./subagent-announce.js";
import { visibleAgentResponse, type AgentCallRequest } from "./subagent-announce.test-support.js";

// The Gateway `agent` method acks a dispatch with status "accepted" and the request's
// idempotency key as runId (agent-request-preflight.ts, agent-run-admission-phase.ts).
// The descendant wake binds its reserved dispatch only to such an ack; a final-shaped
// response under a foreign run id is treated as unbound and stopped.
export function acceptedWakeResponse(runId: string) {
  return { ...visibleAgentResponse(runId), status: "accepted" };
}

export function createAcceptedWakeDispatchMock(
  agentSpy: Mock<(req: AgentCallRequest) => Promise<ReturnType<typeof visibleAgentResponse>>>,
): (runId?: string) => void {
  return (runId) => {
    agentSpy.mockImplementationOnce(async (req: AgentCallRequest) =>
      acceptedWakeResponse(runId ?? String(req.params?.idempotencyKey)),
    );
  };
}

export type SteerDispatchParams<Owner> = {
  runId: string;
  expected: Owner;
  gatewayRunId: string;
  phase: "dispatching" | "accepted";
  lifecycleGeneration?: string;
  expectedSessionId?: string;
  expectedLifecycleRevision?: string;
};

/** The registry's persisted outcome for a reserved descendant-wake steer dispatch. */
export function persistedSteerDispatch<Owner>(params: SteerDispatchParams<Owner>) {
  return {
    status: "persisted" as const,
    ownerRunId: params.runId,
    owner: params.expected,
    dispatch: {
      gatewayRunId: params.gatewayRunId,
      phase: params.phase,
      lifecycleGeneration: params.lifecycleGeneration,
      expectedSessionId: params.expectedSessionId,
      expectedLifecycleRevision: params.expectedLifecycleRevision,
    },
  };
}

/** The ended parent run a descendant wake reserves as its owner. */
export function endedWakeOwnerRun(runId: string) {
  return {
    runId,
    childSessionKey: "agent:main:subagent:parent",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "parent task",
    cleanup: "delete" as const,
    createdAt: 1,
    execution: {
      endedAt: 2,
      outcome: { status: "ok" as const },
    },
  };
}

type SteerRegistryMock = {
  clearSubagentRunSteerRestart: (...args: never[]) => unknown;
  getSubagentRunByRunId: (runId: string) => unknown;
  recordAcceptedSubagentSteerDispatch: (...args: never[]) => unknown;
};

// The continuation line's descendant wake reserves and binds its dispatch through
// the lazy registry runtime before replacing the run (subagent-registry-runtime.ts).
export function lazySteerRegistryRuntime<T extends SteerRegistryMock>(mock: T) {
  return {
    clearLazySubagentSteerRestart: (...args: Parameters<T["clearSubagentRunSteerRestart"]>) =>
      mock.clearSubagentRunSteerRestart(...args),
    getLazySubagentRunByRunId: (...args: [string]) => mock.getSubagentRunByRunId(...args),
    recordLazySubagentSteerDispatch: (
      ...args: Parameters<T["recordAcceptedSubagentSteerDispatch"]>
    ) => mock.recordAcceptedSubagentSteerDispatch(...args),
  };
}

export function withContinuationEnabled(config: OpenClawConfig): OpenClawConfig {
  return { ...config, agents: { defaults: { continuation: { enabled: true } } } };
}

type AnnounceFlowParams = Parameters<typeof runSubagentAnnounceFlow>[0];

export function registerContinuationTriggerOmittedCase(options: {
  getRunSubagentAnnounceFlow: () => typeof runSubagentAnnounceFlow;
  defaultOutcomeAnnounce: Omit<AnnounceFlowParams, "childRunId">;
  agentSpy: Mock<(req: AgentCallRequest) => Promise<unknown>>;
}): void {
  const { defaultOutcomeAnnounce, agentSpy } = options;
  it("omits continuationTrigger when continuation is disabled", async () => {
    const runSubagentAnnounceFlow = options.getRunSubagentAnnounceFlow();
    await runSubagentAnnounceFlow({
      ...defaultOutcomeAnnounce,
      childRunId: "run-no-continuation-trigger",
    });

    const call = agentSpy.mock.calls[0]?.[0] as {
      params?: {
        continuationTrigger?: string;
      };
    };
    expect(call?.params?.continuationTrigger).toBeUndefined();
  });
}

type CollectSessionStore = Record<
  string,
  {
    sessionId: string;
    lastChannel: string;
    lastTo: string;
    queueMode: "collect";
    queueDebounceMs: number;
  }
>;

export function registerDirectFirstSteerFallbackCase(options: {
  enableContinuation: () => void;
  embeddedRunMock: {
    isEmbeddedAgentRunActive: { mockReturnValue: (value: boolean) => unknown };
    isEmbeddedAgentRunStreaming: { mockReturnValue: (value: boolean) => unknown };
  };
  setSessionStore: (store: CollectSessionStore) => void;
  runSubagentAnnounceDispatch: typeof runSubagentAnnounceDispatch;
}): void {
  const { embeddedRunMock } = options;
  it("prefers direct delivery first for completion-mode and falls back to steering on direct failure", async () => {
    options.enableContinuation();
    embeddedRunMock.isEmbeddedAgentRunActive.mockReturnValue(true);
    embeddedRunMock.isEmbeddedAgentRunStreaming.mockReturnValue(false);
    options.setSessionStore({
      "agent:main:main": {
        sessionId: "session-collect",
        lastChannel: "whatsapp",
        lastTo: "+1555",
        queueMode: "collect",
        queueDebounceMs: 0,
      },
    });
    const direct = vi.fn(async () => ({
      delivered: false,
      path: "direct" as const,
      error: "direct delivery unavailable",
    }));
    const steer = vi.fn(async () => ({ status: "steered" as const }));
    const delivery = await options.runSubagentAnnounceDispatch({
      expectsCompletionMessage: true,
      direct,
      steer,
    });

    expect(delivery.delivered).toBe(true);
    expect(delivery.path).toBe("steered");
    expect(direct).toHaveBeenCalledTimes(1);
    expect(steer).toHaveBeenCalledTimes(1);
  });
}
