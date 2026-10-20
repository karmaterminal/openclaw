// Continuation-line harness pieces for subagent-announce.format.e2e.test.ts: the
// continuation-trigger case registered into that suite's describe block.
import { expect, it, type Mock } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
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
