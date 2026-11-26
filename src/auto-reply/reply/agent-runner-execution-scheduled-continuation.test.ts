import { describe, expect, it } from "vitest";
import { withContinuationOpts } from "../../agents/agent-tools.options.js";
import type { RunEmbeddedAgentInternalParams } from "../../agents/embedded-agent-runner/run/internal-params.js";
import { createOpenClawContinuationTools } from "../../agents/openclaw-tools.continuation.js";
import { makeCronJob } from "../../cron/delivery.test-helpers.js";
import { TEST_SCHEDULED_TURN } from "../../cron/scheduled-occurrence.test-support.js";
import {
  createFollowupRun,
  createMinimalRunAgentTurnParams,
  getExecuteAgentTurnForTest,
  runFallbackCandidate,
  setupAgentRunnerExecutionTestState,
  useProductionEmbeddedRunExecutionParamsForTest,
  type FallbackRunnerParams,
} from "./agent-runner-execution.test-support.js";

const state = await setupAgentRunnerExecutionTestState();

describe("scheduled turn in a shared session", () => {
  // A main or session:<key> job runs as a reply turn of that session (the room heartbeat): the
  // reply pipeline settles its continue_work elections and drains its delegates after the turn.
  it("keeps the continuation tools the reply pipeline services", async () => {
    const sessionKey = "agent:main:discord:channel:room";
    await useProductionEmbeddedRunExecutionParamsForTest();
    state.runWithModelFallbackMock.mockImplementationOnce((params: FallbackRunnerParams) =>
      runFallbackCandidate(params, "anthropic", "claude"),
    );
    const followupRun = createFollowupRun({
      sessionKey,
      config: { agents: { defaults: { continuation: { enabled: true } } } },
    });
    followupRun.run.scheduledAutomation = {
      ...TEST_SCHEDULED_TURN,
      job: makeCronJob({ sessionTarget: `session:${sessionKey}`, wakeMode: "now" }),
    };
    let toolNames: string[] | undefined;
    state.runEmbeddedAgentMock.mockImplementationOnce(
      async (runParams: RunEmbeddedAgentInternalParams) => {
        expect(runParams).toMatchObject({ trigger: "cron", jobId: expect.any(String) });
        // The run's own parameters through the gate and factory that build its continuation tools.
        toolNames = createOpenClawContinuationTools(
          withContinuationOpts(runParams, {
            config: runParams.config,
            agentSessionKey: runParams.sessionKey,
            sessionId: runParams.sessionId,
            runId: runParams.runId,
          }),
        ).map((tool) => tool.name);
        return { payloads: [], meta: {} };
      },
    );
    const params = createMinimalRunAgentTurnParams({ followupRun });
    params.sessionKey = sessionKey;

    const result = await (await getExecuteAgentTurnForTest())(params);

    expect(result.kind).toBe("success");
    expect(toolNames).toEqual(["continue_work", "continue_delegate", "request_compaction"]);
  });
});
