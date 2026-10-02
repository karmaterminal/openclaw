// Regression matrix for nested completion delivery, registered into
// subagent-announce.format.e2e.test.ts's "subagent announce formatting" suite.
import { describe, expect, it, type Mock } from "vitest";
import type { AgentRunTerminalReplySnapshot } from "../../agent-run-terminal-reply.types.js";
import type { runSubagentAnnounceFlow as RunSubagentAnnounceFlow } from "./subagent-announce.js";
import type { AgentCallRequest, visibleAgentResponse } from "./subagent-announce.test-support.js";

type NestedCompletionRun = {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  requesterDisplayKey: string;
  task: string;
  cleanup: "keep" | "delete";
  createdAt: number;
  execution: {
    endedAt?: number;
    outcome?: {
      status: "ok" | "timeout" | "error" | "unknown";
      error?: string;
    };
  };
  cleanupCompletedAt?: number;
  label?: string;
  completion?: {
    required: boolean;
    resultText?: string | null;
    terminalReply?: AgentRunTerminalReplySnapshot;
  };
};

type AnnounceFlowParams = Parameters<typeof RunSubagentAnnounceFlow>[0];

export function registerNestedCompletionRegressionMatrix(options: {
  getRunSubagentAnnounceFlow: () => typeof RunSubagentAnnounceFlow;
  defaultOutcomeAnnounce: Omit<AnnounceFlowParams, "childRunId">;
  subagentRegistryMock: {
    countPendingDescendantRuns: Mock<(sessionKey: string) => number>;
    listSubagentRunsForRequester: Mock<
      (sessionKey: string, scope?: { requesterRunId?: string }) => NestedCompletionRun[]
    >;
  };
  agentSpy: Mock<(req: AgentCallRequest) => Promise<ReturnType<typeof visibleAgentResponse>>>;
  getAgentCall: (index?: number) => AgentCallRequest;
  mockAcceptedWakeDispatch: (runId?: string) => void;
}): void {
  const { defaultOutcomeAnnounce, subagentRegistryMock, agentSpy, getAgentCall } = options;
  const { mockAcceptedWakeDispatch } = options;
  const runSubagentAnnounceFlow = (params: AnnounceFlowParams) =>
    options.getRunSubagentAnnounceFlow()(params);

  describe("subagent announce regression matrix for nested completion delivery", () => {
    function makeChildCompletion(params: {
      runId: string;
      childSessionKey: string;
      requesterSessionKey: string;
      task: string;
      createdAt: number;
      resultText: string;
      outcome?: { status: "ok" | "error" | "timeout"; error?: string };
      endedAt?: number;
      cleanupCompletedAt?: number;
      label?: string;
    }) {
      return {
        runId: params.runId,
        childSessionKey: params.childSessionKey,
        requesterSessionKey: params.requesterSessionKey,
        requesterDisplayKey: params.requesterSessionKey,
        task: params.task,
        label: params.label,
        cleanup: "keep" as const,
        createdAt: params.createdAt,
        execution: {
          endedAt: params.endedAt ?? params.createdAt + 1,
          outcome: params.outcome ?? ({ status: "ok" } as const),
        },
        cleanupCompletedAt: params.cleanupCompletedAt ?? params.createdAt + 2,
        completion: { required: true, resultText: params.resultText },
      };
    }

    it("wakes a waiting parent with its direct child result", async () => {
      // Regression guard: parent announce once used stale waiting text instead of child completion output.
      subagentRegistryMock.countPendingDescendantRuns.mockReturnValue(0);
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-2-level"
          ? [
              makeChildCompletion({
                runId: "run-child-2-level",
                childSessionKey: "agent:main:subagent:parent-2-level:subagent:child",
                requesterSessionKey: "agent:main:subagent:parent-2-level",
                task: "child task",
                createdAt: 10,
                resultText: "child final answer",
              }),
            ]
          : [],
      );

      mockAcceptedWakeDispatch();
      const didAnnounce = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-2-level",
        childRunId: "run-parent-2-level",
        expectsCompletionMessage: true,
        wakeOnDescendantSettle: true,
        roundOneReply: "placeholder waiting text",
      });

      expect(didAnnounce).toBe("delivered");
      const call = getAgentCall();
      const message = call?.params?.message ?? "";
      expect(message).toContain("Child completion results:");
      expect(message).toContain("child final answer");
      expect(message).not.toContain("placeholder waiting text");
    });

    it("defers a synthesis wake until both children settle", async () => {
      // Regression guard: fan-out paths previously announced after the first child and dropped the sibling.
      let pending = 1;
      subagentRegistryMock.countPendingDescendantRuns.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-fanout" ? pending : 0,
      );
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-fanout"
          ? [
              makeChildCompletion({
                runId: "run-fanout-a",
                childSessionKey: "agent:main:subagent:parent-fanout:subagent:a",
                requesterSessionKey: "agent:main:subagent:parent-fanout",
                task: "child a",
                createdAt: 10,
                resultText: "result A",
              }),
              makeChildCompletion({
                runId: "run-fanout-b",
                childSessionKey: "agent:main:subagent:parent-fanout:subagent:b",
                requesterSessionKey: "agent:main:subagent:parent-fanout",
                task: "child b",
                createdAt: 11,
                resultText: "result B",
              }),
            ]
          : [],
      );

      const deferred = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-fanout",
        childRunId: "run-parent-fanout",
        expectsCompletionMessage: true,
        wakeOnDescendantSettle: true,
      });
      expect(deferred).toBe("retryable");
      expect(agentSpy).not.toHaveBeenCalled();

      pending = 0;
      mockAcceptedWakeDispatch();
      const announced = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-fanout",
        childRunId: "run-parent-fanout",
        expectsCompletionMessage: true,
        wakeOnDescendantSettle: true,
      });
      expect(announced).toBe("delivered");
      expect(agentSpy).toHaveBeenCalledTimes(1);
      const call = getAgentCall();
      const message = call?.params?.message ?? "";
      expect(message).toContain("result A");
      expect(message).toContain("result B");
    });

    it("regression nested parallel, middle waits for two children then parent receives the synthesized middle result", async () => {
      // Regression guard: nested fan-out previously leaked incomplete middle-agent output to the parent.
      const middleSessionKey = "agent:main:subagent:parent-nested:subagent:middle";
      let middlePending = 2;
      subagentRegistryMock.countPendingDescendantRuns.mockImplementation((sessionKey: string) => {
        if (sessionKey === middleSessionKey) {
          return middlePending;
        }
        return 0;
      });
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) => {
        if (sessionKey === middleSessionKey) {
          return [
            makeChildCompletion({
              runId: "run-middle-a",
              childSessionKey: `${middleSessionKey}:subagent:a`,
              requesterSessionKey: middleSessionKey,
              task: "middle child a",
              createdAt: 10,
              resultText: "middle child result A",
            }),
            makeChildCompletion({
              runId: "run-middle-b",
              childSessionKey: `${middleSessionKey}:subagent:b`,
              requesterSessionKey: middleSessionKey,
              task: "middle child b",
              createdAt: 11,
              resultText: "middle child result B",
            }),
          ];
        }
        if (sessionKey === "agent:main:subagent:parent-nested") {
          return [
            makeChildCompletion({
              runId: "run-middle",
              childSessionKey: middleSessionKey,
              requesterSessionKey: "agent:main:subagent:parent-nested",
              task: "middle orchestrator",
              createdAt: 12,
              resultText: "middle synthesized output from A and B",
            }),
          ];
        }
        return [];
      });

      const middleDeferred = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: middleSessionKey,
        childRunId: "run-middle",
        roundOneReply: "middle synthesized output from A and B",
        requesterSessionKey: "agent:main:subagent:parent-nested",
        expectsCompletionMessage: true,
      });
      expect(middleDeferred).toBe("retryable");

      middlePending = 0;
      const middleAnnounced = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: middleSessionKey,
        childRunId: "run-middle",
        roundOneReply: "middle synthesized output from A and B",
        requesterSessionKey: "agent:main:subagent:parent-nested",
        expectsCompletionMessage: true,
      });
      expect(middleAnnounced).toBe("delivered");

      const parentAnnounced = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-nested",
        childRunId: "run-parent-nested",
        roundOneReply: "parent final decision",
        expectsCompletionMessage: true,
      });
      expect(parentAnnounced).toBe("delivered");
      expect(agentSpy).toHaveBeenCalledTimes(2);

      expect(getAgentCall().params?.message).toContain("middle synthesized output from A and B");
      expect(getAgentCall().params?.message).not.toContain("middle child result A");
      const parentCall = getAgentCall(1);
      expect(parentCall?.params?.message ?? "").toContain("parent final decision");
      expect(parentCall?.params?.message ?? "").not.toContain(
        "middle synthesized output from A and B",
      );
    });

    it("preserves child output order in the parent synthesis wake", async () => {
      // Regression guard: synthesized child summaries must stay deterministic for sequential orchestration chains.
      subagentRegistryMock.countPendingDescendantRuns.mockReturnValue(0);
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-sequential"
          ? [
              makeChildCompletion({
                runId: "run-seq-1",
                childSessionKey: "agent:main:subagent:parent-sequential:subagent:1",
                requesterSessionKey: "agent:main:subagent:parent-sequential",
                task: "step one",
                createdAt: 10,
                resultText: "result one",
              }),
              makeChildCompletion({
                runId: "run-seq-2",
                childSessionKey: "agent:main:subagent:parent-sequential:subagent:2",
                requesterSessionKey: "agent:main:subagent:parent-sequential",
                task: "step two",
                createdAt: 20,
                resultText: "result two",
              }),
              makeChildCompletion({
                runId: "run-seq-3",
                childSessionKey: "agent:main:subagent:parent-sequential:subagent:3",
                requesterSessionKey: "agent:main:subagent:parent-sequential",
                task: "step three",
                createdAt: 30,
                resultText: "result three",
              }),
            ]
          : [],
      );

      mockAcceptedWakeDispatch();
      const didAnnounce = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-sequential",
        childRunId: "run-parent-sequential",
        expectsCompletionMessage: true,
        wakeOnDescendantSettle: true,
      });

      expect(didAnnounce).toBe("delivered");
      const call = getAgentCall();
      const message = call?.params?.message ?? "";
      const firstIndex = message.indexOf("result one");
      const secondIndex = message.indexOf("result two");
      const thirdIndex = message.indexOf("result three");
      expect(firstIndex).toBeGreaterThanOrEqual(0);
      expect(secondIndex).toBeGreaterThan(firstIndex);
      expect(thirdIndex).toBeGreaterThan(secondIndex);
    });

    it("includes child error status and output in the parent synthesis wake", async () => {
      // Regression guard: failed child outcomes must still surface through parent completion synthesis.
      subagentRegistryMock.countPendingDescendantRuns.mockReturnValue(0);
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-error"
          ? [
              makeChildCompletion({
                runId: "run-child-error",
                childSessionKey: "agent:main:subagent:parent-error:subagent:child-error",
                requesterSessionKey: "agent:main:subagent:parent-error",
                task: "error child",
                createdAt: 10,
                resultText: "traceback: child exploded",
                outcome: { status: "error", error: "child exploded" },
              }),
            ]
          : [],
      );

      mockAcceptedWakeDispatch();
      const didAnnounce = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-error",
        childRunId: "run-parent-error",
        expectsCompletionMessage: true,
        wakeOnDescendantSettle: true,
      });

      expect(didAnnounce).toBe("delivered");
      const call = getAgentCall();
      const message = call?.params?.message ?? "";
      expect(message).toContain("status: error: child exploded");
      expect(message).toContain("traceback: child exploded");
    });

    it("regression descendant count gating, announce defers at pending > 0 then fires at pending = 0", async () => {
      // Regression guard: completion gating depends on countPendingDescendantRuns and must remain deterministic.
      let pending = 2;
      subagentRegistryMock.countPendingDescendantRuns.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-gated" ? pending : 0,
      );
      subagentRegistryMock.listSubagentRunsForRequester.mockImplementation((sessionKey: string) =>
        sessionKey === "agent:main:subagent:parent-gated"
          ? [
              makeChildCompletion({
                runId: "run-gated-child",
                childSessionKey: "agent:main:subagent:parent-gated:subagent:child",
                requesterSessionKey: "agent:main:subagent:parent-gated",
                task: "gated child",
                createdAt: 10,
                resultText: "gated child output",
              }),
            ]
          : [],
      );

      const first = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-gated",
        childRunId: "run-parent-gated",
        expectsCompletionMessage: true,
      });
      expect(first).toBe("retryable");
      expect(agentSpy).not.toHaveBeenCalled();

      pending = 0;
      const second = await runSubagentAnnounceFlow({
        ...defaultOutcomeAnnounce,
        childSessionKey: "agent:main:subagent:parent-gated",
        childRunId: "run-parent-gated",
        expectsCompletionMessage: true,
      });
      expect(second).toBe("delivered");
      expect(subagentRegistryMock.countPendingDescendantRuns).toHaveBeenCalledWith(
        "agent:main:subagent:parent-gated",
        expect.any(Function),
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
    });
  });
}
