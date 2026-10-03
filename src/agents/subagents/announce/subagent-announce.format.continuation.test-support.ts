// Continuation-line harness pieces for subagent-announce.format.e2e.test.ts: the
// continuation-trigger cases registered into that suite's describe block.
import { expect, it, vi, type Mock } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import type { runSubagentAnnounceDispatch } from "./subagent-announce-dispatch.js";
import type { runSubagentAnnounceFlow } from "./subagent-announce.js";
import type { AgentCallRequest } from "./subagent-announce.test-support.js";

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
