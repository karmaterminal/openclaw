// Imported by agent.test.ts to keep its mocked suite in one Vitest module graph.
import { afterEach, describe, expect, it } from "vitest";
import {
  registerSubagentTraceparentHandoff,
  resetSubagentTraceparentHandoffsForTests,
} from "../../agents/subagent-traceparent-handoff.js";
import {
  getAgentTestMocks,
  buildExistingMainStoreEntry,
  primeMainAgentRun,
  backendGatewayClient,
  operatorWriteGatewayClient,
  waitForAgentCommandCall,
  invokeAgent,
  describe0AfterEach0,
} from "./agent.test-harness.js";

const mocks = getAgentTestMocks();

describe("gateway agent handler", () => {
  afterEach(async () => {
    // Shared harness teardown is async; the traceparent reset must follow it.
    await describe0AfterEach0();
    resetSubagentTraceparentHandoffsForTests();
  });

  it("uses the same-process subagent traceparent handoff when the request field is missing", async () => {
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const sessionKey = "agent:main:subagent:child-trace";
    const idempotencyKey = "child-trace-run";
    registerSubagentTraceparentHandoff({
      idempotencyKey,
      sessionKey,
      traceparent,
    });
    const existingEntry = buildExistingMainStoreEntry({
      spawnedBy: "agent:main:main",
    });
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: existingEntry,
      canonicalKey: sessionKey,
    });
    mocks.updateSessionStore.mockImplementation(async (_path, updater) => {
      const store: Record<string, Record<string, unknown>> = {
        [sessionKey]: { ...existingEntry },
      };
      return await updater(store);
    });
    mocks.agentCommand.mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: { durationMs: 100 },
    });

    await invokeAgent(
      {
        message: "child task",
        agentId: "main",
        sessionKey,
        idempotencyKey,
      },
      { client: backendGatewayClient() },
    );

    expect((await waitForAgentCommandCall()).traceparent).toBe(traceparent);
  });

  it("uses the provisional child session traceparent when the request field is missing across process", async () => {
    const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const sessionKey = "agent:main:subagent:child-session-trace";
    const idempotencyKey = "child-session-trace-run";
    const existingEntry = buildExistingMainStoreEntry({
      spawnedBy: "agent:main:main",
      continuationTraceparent: traceparent,
    });
    let persistedEntry: Record<string, unknown> | undefined;
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: existingEntry,
      canonicalKey: sessionKey,
    });
    mocks.updateSessionStore.mockImplementation(async (_path, updater) => {
      const store: Record<string, Record<string, unknown>> = {
        [sessionKey]: { ...existingEntry },
      };
      const result = await updater(store);
      persistedEntry = result as Record<string, unknown>;
      return result;
    });
    mocks.agentCommand.mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: { durationMs: 100 },
    });

    await invokeAgent(
      {
        message: "child task",
        agentId: "main",
        sessionKey,
        idempotencyKey,
      },
      { client: backendGatewayClient() },
    );

    expect((await waitForAgentCommandCall()).traceparent).toBe(traceparent);
    expect(persistedEntry?.continuationTraceparent).toBeUndefined();
  });

  it("forwards continuation metadata to the ingress agent command for backend callers", async () => {
    primeMainAgentRun();

    await invokeAgent(
      {
        message: "delegate finished",
        agentId: "main",
        sessionKey: "agent:main:main",
        continuationTrigger: "delegate-return",
        drainsContinuationDelegateQueue: true,
        idempotencyKey: "test-continuation-trigger-forward",
      },
      { reqId: "continuation-trigger-1", client: backendGatewayClient() },
    );

    const call = await waitForAgentCommandCall<{
      continuationTrigger?: string;
      drainsContinuationDelegateQueue?: boolean;
    }>();
    expect(call.continuationTrigger).toBe("delegate-return");
    expect(call.drainsContinuationDelegateQueue).toBe(true);
  });

  it("ignores internal continuation controls from non-backend callers", async () => {
    primeMainAgentRun();

    await invokeAgent(
      {
        message: "delegate finished",
        agentId: "main",
        sessionKey: "agent:main:main",
        continuationTrigger: "delegate-return",
        drainsContinuationDelegateQueue: true,
        traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        idempotencyKey: "test-continuation-trigger-non-backend",
      },
      { reqId: "continuation-trigger-non-backend", client: operatorWriteGatewayClient() },
    );

    const call = await waitForAgentCommandCall<{
      continuationTrigger?: string;
      drainsContinuationDelegateQueue?: boolean;
      traceparent?: string;
    }>();
    expect(call.continuationTrigger).toBeUndefined();
    expect(call.drainsContinuationDelegateQueue).toBeUndefined();
    expect(call.traceparent).toBeUndefined();
  });

  it("preserves core-spawned continuation controls with same-process traceparent handoff", async () => {
    primeMainAgentRun();
    const sessionKey = "agent:main:subagent:trusted-continuation";
    const idempotencyKey = "trusted-continuation-handoff";
    const traceparent = "00-2af7651916cd43dd8448eb211c80319c-d7ad6b7169203331-01";
    registerSubagentTraceparentHandoff({ idempotencyKey, sessionKey, traceparent });
    const existingEntry = buildExistingMainStoreEntry({
      spawnedBy: "agent:main:main",
    });
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: existingEntry,
      canonicalKey: sessionKey,
    });
    mocks.updateSessionStore.mockImplementation(async (_path, updater) => {
      const store: Record<string, Record<string, unknown>> = {
        [sessionKey]: { ...existingEntry },
      };
      return await updater(store);
    });

    await invokeAgent(
      {
        message: "trusted continuation child",
        agentId: "main",
        sessionKey,
        continuationTrigger: "delegate-return",
        drainsContinuationDelegateQueue: true,
        idempotencyKey,
      },
      { reqId: "trusted-continuation-handoff", client: operatorWriteGatewayClient() },
    );

    const call = await waitForAgentCommandCall<{
      continuationTrigger?: string;
      drainsContinuationDelegateQueue?: boolean;
      traceparent?: string;
    }>();
    expect(call.continuationTrigger).toBe("delegate-return");
    expect(call.drainsContinuationDelegateQueue).toBe(true);
    expect(call.traceparent).toBe(traceparent);
  });

  it("honors a request traceparent from backend callers", async () => {
    primeMainAgentRun();
    const traceparent = "00-1af7651916cd43dd8448eb211c80319c-c7ad6b7169203331-01";

    await invokeAgent(
      {
        message: "delegate finished",
        agentId: "main",
        sessionKey: "agent:main:main",
        traceparent,
        idempotencyKey: "test-continuation-traceparent-backend",
      },
      { reqId: "continuation-traceparent-backend", client: backendGatewayClient() },
    );

    expect((await waitForAgentCommandCall<{ traceparent?: string }>()).traceparent).toBe(
      traceparent,
    );
  });
});
