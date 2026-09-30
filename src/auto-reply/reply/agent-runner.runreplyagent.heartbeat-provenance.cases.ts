// Heartbeat turn-provenance cases registered by agent-runner.runreplyagent.e2e.test.ts.
import { expect, it, type Mock } from "vitest";
import type { ReplyPayload } from "../types.js";
import type { InternalGetReplyOptions } from "./get-reply.types.js";
import {
  REPLY_OPERATION_RUN_STATE,
  resolveReplyOperationAgentTurn,
  type ReplyOperationRunState,
} from "./reply-operation-run-state.js";

type CreateMinimalRun = (params?: { opts?: InternalGetReplyOptions }) => {
  run: () => Promise<ReplyPayload | ReplyPayload[] | undefined>;
};

function mockCallArgs(mock: Mock, label: string, callIndex = 0): unknown[] {
  const call: unknown[] | undefined = mock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`expected ${label} mock call ${callIndex}`);
  }
  return call;
}

export function registerHeartbeatProvenanceCases(
  createMinimalRun: CreateMinimalRun,
  runEmbeddedAgentMock: Mock,
): void {
  it("records the operation owned by an admitted heartbeat run", async () => {
    const runState: ReplyOperationRunState = {};
    const { run } = createMinimalRun({
      opts: { isHeartbeat: true, [REPLY_OPERATION_RUN_STATE]: runState },
    });

    await run();

    expect(runState.admission).toEqual({ status: "owned" });
    expect(resolveReplyOperationAgentTurn(runState)).toBe("ok");
  });

  it.each(["work-wake", "delegate-return", "subagent-return"] as const)(
    "reports %s continuation provenance to the runner-owned hook path as heartbeat",
    async (continuationTrigger) => {
      const { run } = createMinimalRun({
        opts: { continuationTrigger },
      });

      await run();

      const [call] = mockCallArgs(runEmbeddedAgentMock, "run embedded agent");
      // SAFETY: runEmbeddedAgentMock receives the embedded-run params object (AgentRunParams).
      expect((call as { trigger?: string }).trigger).toBe("heartbeat");
    },
  );
}
