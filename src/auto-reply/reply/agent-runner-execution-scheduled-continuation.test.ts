import { afterEach, describe, expect, it } from "vitest";
import { withContinuationOpts } from "../../agents/agent-tools.options.js";
import type { RunEmbeddedAgentInternalParams } from "../../agents/embedded-agent-runner/run/internal-params.js";
import { createOpenClawContinuationTools } from "../../agents/openclaw-tools.continuation.js";
import { setRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import { makeCronJob } from "../../cron/delivery.test-helpers.js";
import { TEST_SCHEDULED_TURN } from "../../cron/scheduled-occurrence.test-support.js";
import { listContinuationRecords } from "../continuation/custody/custody-store.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import { resetContinuationWorkDispatchForTests } from "../continuation/work-dispatch.js";
import { decodeWorkState } from "../continuation/work-flow-state.js";
import {
  createFollowupRun,
  makeTestSessionStorePath,
  runFallbackCandidate,
  setupAgentRunnerExecutionTestState,
  useProductionEmbeddedRunExecutionParamsForTest,
  type FallbackRunnerParams,
} from "./agent-runner-execution.test-support.js";
import { createReplyParams } from "./test-helpers.js";

const state = await setupAgentRunnerExecutionTestState();
useContinuationCustodyTestState();
afterEach(() => {
  resetContinuationWorkDispatchForTests();
});

describe("scheduled turn in a shared session", () => {
  // A main or session:<key> job runs as a reply turn of that session (the room heartbeat): the
  // reply pipeline settles its continue_work elections and drains its delegates after the turn.
  it("schedules the continue_work its model calls through the reply pipeline", async () => {
    const sessionKey = "agent:main:discord:channel:room";
    const runId = "room-heartbeat-run";
    const storePath = makeTestSessionStorePath();
    const sessionEntry = { sessionId: "room-session", updatedAt: Date.now() };
    await replaceSessionEntry({ storePath, sessionKey }, sessionEntry);
    await useProductionEmbeddedRunExecutionParamsForTest();
    state.runWithModelFallbackMock.mockImplementationOnce((params: FallbackRunnerParams) =>
      runFallbackCandidate(params, "anthropic", "claude"),
    );
    const followupRun = createFollowupRun({
      sessionKey,
      sessionId: sessionEntry.sessionId,
      config: { agents: { defaults: { continuation: { enabled: true } } } },
    });
    followupRun.run.scheduledAutomation = {
      ...TEST_SCHEDULED_TURN,
      job: makeCronJob({ sessionTarget: `session:${sessionKey}`, wakeMode: "now" }),
    };
    let toolNames: string[] | undefined;
    state.runEmbeddedAgentMock.mockImplementationOnce(
      async (runParams: RunEmbeddedAgentInternalParams) => {
        const { trigger, jobId, continueWorkOpts, requestCompactionOpts } = runParams;
        expect({ trigger, jobId }).toEqual({ trigger: "cron", jobId: expect.any(String) });
        // The facts the attempt hands its tool assembly, through the gate and factory that build
        // its continuation tools.
        const tools = createOpenClawContinuationTools(
          withContinuationOpts(
            { trigger, jobId, continueWorkOpts, requestCompactionOpts },
            {
              config: runParams.config,
              agentSessionKey: runParams.sessionKey,
              sessionId: runParams.sessionId,
              runId: runParams.runId,
            },
          ),
        );
        toolNames = tools.map((tool) => tool.name);
        // The model calls continue_work when its listing offers it.
        await tools
          .find((tool) => tool.name === "continue_work")
          ?.execute("room-continue", { reason: "check the room again", delaySeconds: 60 });
        return { payloads: [{ text: "Checked the room." }], meta: {} };
      },
    );
    const { runReplyAgent } = await import("./agent-runner-run.js");
    setRuntimeConfigSnapshot(followupRun.run.config);

    await runReplyAgent(
      createReplyParams(followupRun, {
        opts: { runId },
        sessionKey,
        storePath,
        sessionEntry,
        sessionStore: { [sessionKey]: sessionEntry },
        sessionCtx: { Provider: "discord", MessageSid: "msg" },
      }),
    );

    // After the turn, the pipeline's settle path recorded the election as this session's wake.
    const records = await listContinuationRecords({ ownerSessionKey: sessionKey, kinds: ["work"] });
    expect(records).toMatchObject([{ kind: "work", status: "queued" }]);
    expect(decodeWorkState(records[0]!)).toMatchObject({
      sessionKey,
      hop: 1,
      delayMs: 60_000,
      reason: "check the room again",
      originRunId: runId,
    });
    expect(toolNames).toEqual(["continue_work", "continue_delegate", "request_compaction"]);
  });
});
