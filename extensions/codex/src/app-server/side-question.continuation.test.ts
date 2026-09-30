// Codex tests cover side question continuation-tool isolation.
import { useProviderToolSchemaRuntimeForTest } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it, vi } from "vitest";
import {
  agentDelta,
  createFakeClient,
  createOpenClawCodingToolsMock,
  getSharedCodexAppServerClientMock,
  runCodexAppServerSideQuestion,
  sideParams,
  threadResult,
  turnCompleted,
  turnStartResult,
  useSideQuestionTestSetup,
} from "./side-question.test-support.js";

useProviderToolSchemaRuntimeForTest(["openai", "codex", "lmstudio"]);

describe("runCodexAppServerSideQuestion", () => {
  useSideQuestionTestSetup();

  it("rejects inherited continuation calls from a side fork without executing them", async () => {
    const client = createFakeClient();
    const continuationExecute = vi.fn();
    let toolResponse: unknown;
    createOpenClawCodingToolsMock.mockImplementation(
      (options: { disableContinuationTools?: boolean }) =>
        options.disableContinuationTools
          ? []
          : [
              {
                name: "continue_delegate",
                description: "Schedule continuation work",
                parameters: { type: "object", properties: {} },
                execute: continuationExecute,
              },
            ],
    );
    client.request.mockImplementation(async (method: string) => {
      if (method === "thread/fork") {
        return threadResult("side-thread");
      }
      if (method === "thread/inject_items") {
        return {};
      }
      if (method === "turn/start") {
        setTimeout(() => {
          void (async () => {
            toolResponse = await client.handleRequest({
              id: 42,
              method: "item/tool/call",
              params: {
                threadId: "side-thread",
                turnId: "turn-1",
                callId: "inherited-continuation",
                tool: "continue_delegate",
                arguments: { task: "must not schedule" },
              },
            });
            client.emit(agentDelta("side-thread", "turn-1", "Side answer."));
            client.emit(turnCompleted("side-thread", "turn-1", "Side answer."));
          })();
        }, 0);
        return turnStartResult("turn-1");
      }
      if (method === "thread/unsubscribe" || method === "turn/interrupt") {
        return {};
      }
      throw new Error(`unexpected request: ${method}`);
    });
    getSharedCodexAppServerClientMock.mockResolvedValue(client);

    await expect(runCodexAppServerSideQuestion(sideParams())).resolves.toEqual({
      text: "Side answer.",
    });
    expect(continuationExecute).not.toHaveBeenCalled();
    expect(toolResponse).toEqual({
      success: false,
      contentItems: [{ type: "inputText", text: "Unknown OpenClaw tool: continue_delegate" }],
    });
  });
});
