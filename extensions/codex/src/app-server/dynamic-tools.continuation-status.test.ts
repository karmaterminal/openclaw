// Codex dynamic tool bridge tests cover continuation tool status classification.
import type { AgentToolResult } from "openclaw/plugin-sdk/agent-core";
import type { AnyAgentTool } from "openclaw/plugin-sdk/agent-harness";
import { resetGlobalHookRunner } from "openclaw/plugin-sdk/hook-runtime";
import {
  createEmptyPluginRegistry,
  setActivePluginRegistry,
} from "openclaw/plugin-sdk/plugin-test-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodexDynamicToolBridge } from "./dynamic-tools.js";

const CODEX_OPENCLAW_DYNAMIC_TOOL_NAMESPACE = "openclaw";

function createTool(overrides: Partial<AnyAgentTool>): AnyAgentTool {
  return {
    name: "tts",
    description: "Convert text to speech.",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    execute: vi.fn(),
    ...overrides,
  } as unknown as AnyAgentTool;
}

function textToolResult(text: string, details: unknown = {}): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function createSingleToolBridge(
  tool: AnyAgentTool,
  options: Omit<Parameters<typeof createCodexDynamicToolBridge>[0], "tools" | "signal"> = {},
) {
  return createCodexDynamicToolBridge({
    tools: [tool],
    signal: new AbortController().signal,
    ...options,
  });
}

function createBridgeWithToolResult(
  toolName: string,
  toolResult: AgentToolResult<unknown>,
  hookContext?: Parameters<typeof createCodexDynamicToolBridge>[0]["hookContext"],
) {
  return createSingleToolBridge(
    createTool({ name: toolName, execute: vi.fn(async () => toolResult) }),
    { hookContext },
  );
}

afterEach(() => {
  resetGlobalHookRunner();
  setActivePluginRegistry(createEmptyPluginRegistry());
});

describe("createCodexDynamicToolBridge", () => {
  it.each([
    { toolName: "continue_work", status: "scheduled" },
    { toolName: "continue_delegate", status: "scheduled" },
    { toolName: "continue_delegate", status: "queued-for-compaction" },
    { toolName: "request_compaction", status: "compaction_requested" },
    { toolName: "request_compaction", status: "already_pending" },
  ])(
    "treats $toolName status $status as a successful dynamic tool call",
    async ({ toolName, status }) => {
      const onAgentToolResult = vi.fn();
      const bridge = createBridgeWithToolResult(
        toolName,
        textToolResult(`${toolName}: ${status}`, { status }),
      );

      const result = await bridge.handleToolCall(
        {
          threadId: "thread-1",
          turnId: "turn-1",
          callId: `call-${toolName}-${status}`,
          namespace: CODEX_OPENCLAW_DYNAMIC_TOOL_NAMESPACE,
          tool: toolName,
          arguments: {},
        },
        { onAgentToolResult },
      );

      expect(result.success).toBe(true);
      expect(onAgentToolResult).toHaveBeenCalledWith(
        expect.objectContaining({ toolName, isError: false }),
      );
    },
  );

  it("keeps structured continuation guard rejections informational", async () => {
    const bridge = createBridgeWithToolResult(
      "continue_delegate",
      textToolResult("delegate limit reached", {
        status: "rejected",
        guard: "maxDelegatesPerTurn",
      }),
    );

    const result = await bridge.handleToolCall({
      threadId: "thread-1",
      turnId: "turn-1",
      callId: "call-continue-delegate-rejected",
      namespace: CODEX_OPENCLAW_DYNAMIC_TOOL_NAMESPACE,
      tool: "continue_delegate",
      arguments: {},
    });

    expect(result.success).toBe(true);
  });

  it("keeps explicitly failed continuation rejections classified as failures", async () => {
    const bridge = createBridgeWithToolResult(
      "continue_delegate",
      textToolResult("delegate request failed", {
        status: "rejected",
        ok: false,
      }),
    );

    const result = await bridge.handleToolCall({
      threadId: "thread-1",
      turnId: "turn-1",
      callId: "call-continue-delegate-rejected-failed",
      namespace: CODEX_OPENCLAW_DYNAMIC_TOOL_NAMESPACE,
      tool: "continue_delegate",
      arguments: {},
    });

    expect(result.success).toBe(false);
  });
});
