// Upstream's regression matrix for nested completion delivery, registered into
// subagent-announce.format.e2e.test.ts's "subagent announce formatting" suite. It lives
// here only to keep that grandfathered file under its line budget; the block below is
// upstream's (86e2107b52, #166052) verbatim, with the file-level helpers passed in.
import { describe, expect, it, type Mock } from "vitest";
import type {
  AgentCallRequest,
  MockSubagentRun,
  visibleAgentResponse,
} from "./subagent-announce.test-support.js";

export function registerNestedCompletionRegressionMatrix(options: {
  subagentRegistryMock: {
    countPendingDescendantRuns: Mock<(sessionKey: string) => number>;
    listSubagentRunsForRequester: Mock<(sessionKey: string) => MockSubagentRun[]>;
  };
  agentSpy: Mock<(req: AgentCallRequest) => Promise<ReturnType<typeof visibleAgentResponse>>>;
  makeChildCompletion: (
    requesterSessionKey: string,
    child: string,
    resultText: string,
    overrides?: Partial<MockSubagentRun> & { endedAt?: number },
  ) => MockSubagentRun;
  announceWake: (childSessionKey: string, childRunId: string) => Promise<unknown>;
  getAgentCall: (index?: number) => AgentCallRequest;
  getAgentCallContext: (call?: AgentCallRequest) => string;
}): void {
  const {
    subagentRegistryMock,
    agentSpy,
    makeChildCompletion,
    announceWake,
    getAgentCall,
    getAgentCallContext,
  } = options;

  describe("subagent announce regression matrix for nested completion delivery", () => {
    it("defers a synthesis wake until both children settle", async () => {
      // Regression guard: fan-out paths previously announced after the first child and dropped the sibling.
      let pending = 1;
      subagentRegistryMock.countPendingDescendantRuns.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-fanout" ? pending : 0,
      );
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-fanout"
          ? [
              makeChildCompletion("agent:main:subagent:parent-fanout", "a", "result A", {
                runId: "run-fanout-a",
              }),
              makeChildCompletion("agent:main:subagent:parent-fanout", "b", "result B", {
                runId: "run-fanout-b",
                createdAt: 11,
              }),
            ]
          : [],
      );

      const deferred = await announceWake("agent:main:subagent:parent-fanout", "run-parent-fanout");
      expect(deferred).toBe("retryable");
      expect(agentSpy).not.toHaveBeenCalled();

      pending = 0;
      const announced = await announceWake(
        "agent:main:subagent:parent-fanout",
        "run-parent-fanout",
      );
      expect(announced).toBe("delivered");
      expect(agentSpy).toHaveBeenCalledTimes(1);
      const call = getAgentCall();
      const message = getAgentCallContext(call);
      expect(message).toContain("result A");
      expect(message).toContain("result B");
    });

    it("includes child error status and output in the parent synthesis wake", async () => {
      // Regression guard: failed child outcomes must still surface through parent completion synthesis.
      subagentRegistryMock.countPendingDescendantRuns.mockReturnValue(0);
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-error"
          ? [
              makeChildCompletion(
                "agent:main:subagent:parent-error",
                "child-error",
                "traceback: child exploded",
                {
                  task: "error child",
                  execution: { endedAt: 11, outcome: { status: "error", error: "child exploded" } },
                },
              ),
            ]
          : [],
      );

      const didAnnounce = await announceWake(
        "agent:main:subagent:parent-error",
        "run-parent-error",
      );

      expect(didAnnounce).toBe("delivered");
      const call = getAgentCall();
      const message = getAgentCallContext(call);
      expect(message).toContain("status: error: child exploded");
      expect(message).toContain("traceback: child exploded");
    });
  });
}
