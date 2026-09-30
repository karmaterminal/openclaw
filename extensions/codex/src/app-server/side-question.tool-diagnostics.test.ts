// Codex tests cover side question dynamic tool diagnostics and their trace context.
import {
  onInternalDiagnosticEvent,
  type DiagnosticEventPayload,
} from "openclaw/plugin-sdk/diagnostic-runtime";
import { useProviderToolSchemaRuntimeForTest } from "openclaw/plugin-sdk/plugin-test-runtime";
import { describe, expect, it, vi } from "vitest";
import { codexTestTurnIds } from "./codex-app-server.test-fixtures.js";
import {
  agentDelta,
  createFakeClient,
  getSharedCodexAppServerClientMock,
  runCodexAppServerSideQuestion,
  sideParams,
  threadResult,
  toolExecuteMock,
  turnCompleted,
  turnStartResult,
  useSideQuestionTestSetup,
} from "./side-question.test-support.js";

async function handleClientRequestWhenReady(
  client: ReturnType<typeof createFakeClient>,
  request: Parameters<ReturnType<typeof createFakeClient>["handleRequest"]>[0],
  assertHandled: (response: unknown) => void = (response) => expect(response).not.toBeUndefined(),
): Promise<unknown> {
  let response: unknown;
  await vi.waitFor(async () => {
    response = await client.handleRequest(request);
    assertHandled(response);
  });
  return response;
}

function flushDiagnosticEvents() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function activeDiagnosticToolKeys(events: DiagnosticEventPayload[]): Set<string> {
  const active = new Set<string>();
  for (const event of events) {
    if (event.type === "tool.execution.started") {
      active.add(
        `${event.runId ?? event.sessionId ?? event.sessionKey ?? "unknown"}:${event.toolCallId ?? event.toolName}`,
      );
    } else if (
      event.type === "tool.execution.completed" ||
      event.type === "tool.execution.error" ||
      event.type === "tool.execution.blocked"
    ) {
      active.delete(
        `${event.runId ?? event.sessionId ?? event.sessionKey ?? "unknown"}:${event.toolCallId ?? event.toolName}`,
      );
    }
  }
  return active;
}

useProviderToolSchemaRuntimeForTest(["openai", "codex", "lmstudio"]);

describe("runCodexAppServerSideQuestion", () => {
  useSideQuestionTestSetup();

  it("clears side-thread dynamic tool diagnostics at the app-server request boundary", async () => {
    const client = createFakeClient();
    const diagnosticEvents: DiagnosticEventPayload[] = [];
    const unsubscribeDiagnostics = onInternalDiagnosticEvent((event) =>
      diagnosticEvents.push(event),
    );
    client.request.mockImplementation(async (method: string) => {
      if (method === "thread/fork") {
        return threadResult("side-thread");
      }
      if (method === "thread/inject_items") {
        return {};
      }
      if (method === "turn/start") {
        return turnStartResult("turn-1");
      }
      if (method === "thread/unsubscribe" || method === "turn/interrupt") {
        return {};
      }
      throw new Error(`unexpected request: ${method}`);
    });
    getSharedCodexAppServerClientMock.mockResolvedValue(client);

    const run = runCodexAppServerSideQuestion(
      sideParams({
        opts: { runId: "run-side-diagnostics" },
      }),
    );
    const response = await handleClientRequestWhenReady(client, {
      id: 42,
      method: "item/tool/call",
      params: {
        ...codexTestTurnIds("side-thread"),
        callId: "tool-1",
        tool: "wiki_status",
        arguments: { topic: "AGENTS.md" },
      },
    });
    expect(response).toMatchObject({ success: true });
    expect(toolExecuteMock).toHaveBeenCalledTimes(1);
    client.emit(agentDelta("side-thread", "turn-1", "Tool answer."));
    client.emit(turnCompleted("side-thread", "turn-1", "Tool answer."));
    await run;
    await flushDiagnosticEvents();
    unsubscribeDiagnostics();

    const toolDiagnosticEvents = diagnosticEvents.filter(
      (
        event,
      ): event is Extract<
        DiagnosticEventPayload,
        { type: "tool.execution.started" | "tool.execution.completed" | "tool.execution.error" }
      > => event.type.startsWith("tool.execution."),
    );
    expect(
      toolDiagnosticEvents.map((event) => ({
        type: event.type,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
      })),
    ).toEqual([
      {
        type: "tool.execution.started",
        toolName: "wiki_status",
        toolCallId: "tool-1",
      },
      {
        type: "tool.execution.completed",
        toolName: "wiki_status",
        toolCallId: "tool-1",
      },
    ]);
    expect(toolDiagnosticEvents[0]?.trace?.spanId).toBeTruthy();
    expect(toolDiagnosticEvents[1]?.trace).toEqual(toolDiagnosticEvents[0]?.trace);
    expect(activeDiagnosticToolKeys(diagnosticEvents)).toEqual(new Set());
  });
});
