// Agent Core tests cover the repeated identical tool-error breaker in the agent loop.
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "./agent-loop.js";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  type Message,
  type Model,
} from "./llm.js";
import type { AgentLoopConfig, AgentTool, AgentToolCall, StreamFn } from "./types.js";

const model: Model = {
  id: "test-model",
  name: "Test Model",
  api: "test-api",
  provider: "test-provider",
  baseUrl: "https://example.test",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 1000,
};

const config: AgentLoopConfig = {
  model,
  convertToLlm: (messages) => messages as Message[],
};

const TEST_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

describe("runAgentLoop deferred tool hydration", () => {
  function repeatedToolErrorAssistantMessage(args: Record<string, unknown>): AssistantMessage {
    return {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: `call-${JSON.stringify(args)}`,
          name: "continue_delegate",
          arguments: args,
        },
      ],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: TEST_USAGE,
      stopReason: "toolUse",
      timestamp: Date.now(),
    };
  }

  it("terminates before another model call after repeated identical tool errors", async () => {
    const invalidArgs = {
      task: "depth-2 targeted return arrived",
      delaySeconds: 22,
      mode: "silent-wake",
      targetSessionKey: "agent:main:discord:channel:000000000000000001",
      targetSessionKeys: [],
      fanoutMode: "tree",
      model: "default",
    };
    const execute = vi.fn(async () => {
      throw new Error("fanoutMode cannot be combined with targetSessionKey or targetSessionKeys.");
    });
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      if (streamCalls > 2) {
        throw new Error("model was called after repeated tool error breaker tripped");
      }
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message = repeatedToolErrorAssistantMessage(invalidArgs);
        stream.push({ type: "done", reason: "toolUse", message });
        stream.end();
      });
      return stream;
    };
    const messages = await runAgentLoop(
      [{ role: "user", content: "schedule targeted return", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "continue_delegate",
            label: "continue_delegate",
            description: "Continuation delegate",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    expect(streamCalls).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
    const terminal = messages.at(-1) as AssistantMessage;
    expect(terminal).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorCode: "repeated_tool_error",
      errorType: "tool_error_loop",
    });
    expect(terminal.content).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Stopped after 2 identical failed continue_delegate"),
      }),
    ]);
    expect(terminal.errorMessage).toBe("Repeated tool-call failure loop.");
    expect(terminal.diagnostics?.[0]?.details).toMatchObject({
      toolName: "continue_delegate",
      error: "fanoutMode cannot be combined with targetSessionKey or targetSessionKeys.",
      repeatCount: 2,
      disposition: "terminated",
      argumentSummary: {
        normalizedHash: expect.any(String),
        normalizedLength: expect.any(Number),
      },
    });
    expect(JSON.stringify(terminal.diagnostics)).not.toContain(
      "agent:main:discord:channel:000000000000000001",
    );
  });

  it("treats normalized-away continue_delegate args as the same repeated failure", async () => {
    const firstInvalidArgs = {
      task: "  depth-2 targeted return arrived  ",
      delay_seconds: "22",
      mode: "normal",
      target_session_key: " agent:main:discord:channel:000000000000000001 ",
      target_session_keys: [],
      fanout_mode: "TREE",
      model: "default",
      traceparent: "not-a-traceparent",
    };
    const secondInvalidArgs = {
      task: "depth-2 targeted return arrived",
      delaySeconds: 22,
      targetSessionKey: "agent:main:discord:channel:000000000000000001",
      fanoutMode: "tree",
    };
    const execute = vi.fn(async () => {
      throw new Error("fanoutMode cannot be combined with targetSessionKey or targetSessionKeys.");
    });
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      if (streamCalls > 2) {
        throw new Error("model was called after canonical repeated tool error breaker tripped");
      }
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message = repeatedToolErrorAssistantMessage(
          streamCalls === 1 ? firstInvalidArgs : secondInvalidArgs,
        );
        stream.push({ type: "done", reason: "toolUse", message });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [{ role: "user", content: "schedule targeted return", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "continue_delegate",
            label: "continue_delegate",
            description: "Continuation delegate",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    expect(streamCalls).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorCode: "repeated_tool_error",
    });
  });

  it("keeps raw tool arguments out of repeated-error diagnostics", async () => {
    const sensitiveArgs = {
      command: "ls /very/sensitive/path",
      prompt: "private user text",
    };
    const execute = vi.fn(async () => {
      throw new Error("deterministic validation failure");
    });
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage = {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `sensitive-${streamCalls}`,
              name: "exec",
              arguments: sensitiveArgs,
            },
          ],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: TEST_USAGE,
          stopReason: "toolUse",
          timestamp: Date.now(),
        };
        stream.push({ type: "done", reason: "toolUse", message });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [{ role: "user", content: "run bad command", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "exec",
            label: "exec",
            description: "Exec",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    const terminal = messages.at(-1) as AssistantMessage;
    const diagnosticsJson = JSON.stringify(terminal.diagnostics);
    expect(terminal).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorCode: "repeated_tool_error",
    });
    expect(diagnosticsJson).toContain("argumentSummary");
    expect(diagnosticsJson).not.toContain("ls /very/sensitive/path");
    expect(diagnosticsJson).not.toContain("private user text");
  });

  it("keeps raw tool error text out of repeated-error diagnostics and content", async () => {
    const execute = vi.fn(async () => {
      throw new Error(
        'failed command "ls /very/sensitive/path" for agent:main:discord:channel:000000000000000001 with prompt "private user text" Authorization: Bearer credential_value_to_redact token=abc123',
      );
    });
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage = {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `error-leak-${streamCalls}`,
              name: "exec",
              arguments: { command: "ls /tmp" },
            },
          ],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: TEST_USAGE,
          stopReason: "toolUse",
          timestamp: Date.now(),
        };
        stream.push({ type: "done", reason: "toolUse", message });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [{ role: "user", content: "run bad command", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "exec",
            label: "exec",
            description: "Exec",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    const terminal = messages.at(-1) as AssistantMessage;
    const terminalJson = JSON.stringify(terminal);
    expect(terminal).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorCode: "repeated_tool_error",
    });
    expect(terminalJson).not.toContain("/very/sensitive/path");
    expect(terminalJson).not.toContain("agent:main:discord:channel:000000000000000001");
    expect(terminalJson).not.toContain("private user text");
    expect(terminalJson).not.toContain("abc123");
    expect(terminalJson).not.toContain("credential_value_to_redact");
  });

  it("omits echoed tool arguments from repeated-error assistant content", async () => {
    const execute = vi.fn(async () => {
      throw new Error(
        "Validation failed for tool edit: path must be string. Received arguments: {}",
      );
    });
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage = {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `invalid-edit-${streamCalls}`,
              name: "edit",
              arguments: {},
            },
          ],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: TEST_USAGE,
          stopReason: "toolUse",
          timestamp: Date.now(),
        };
        stream.push({ type: "done", reason: "toolUse", message });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [{ role: "user", content: "edit the file", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "edit",
            label: "edit",
            description: "Edit",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    const terminal = messages.at(-1) as AssistantMessage;
    const content = JSON.stringify(terminal.content);
    expect(content).toContain("Stopped after 2 identical failed edit tool calls.");
    expect(content).toContain("Validation failed for tool edit: path must be string.");
    expect(content).not.toContain("Received arguments");
  });

  it("counts repeated empty error payloads as deterministic failures", async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "will be replaced by afterToolCall" }],
      details: {},
    }));
    const afterToolCall = vi.fn(async () => ({
      content: [],
      details: {},
      isError: true,
    }));
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      if (streamCalls > 2) {
        throw new Error("model was called after empty error breaker tripped");
      }
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage = {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `empty-error-${streamCalls}`,
              name: "empty_error_tool",
              arguments: { query: "same" },
            },
          ],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: TEST_USAGE,
          stopReason: "toolUse",
          timestamp: Date.now(),
        };
        stream.push({ type: "done", reason: "toolUse", message });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [{ role: "user", content: "run empty error tool", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "empty_error_tool",
            label: "empty_error_tool",
            description: "Empty error tool",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute,
          },
        ],
      },
      { ...config, afterToolCall },
      () => {},
      undefined,
      streamFn,
    );

    expect(streamCalls).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(afterToolCall).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorCode: "repeated_tool_error",
    });
  });

  it("treats reordered multi-tool failures as the same repeated failure", async () => {
    const executeAlpha = vi.fn(async () => {
      throw new Error("alpha failed deterministically");
    });
    const executeBeta = vi.fn(async () => {
      throw new Error("beta failed deterministically");
    });
    let streamCalls = 0;
    const toolCall = (id: string, name: string, args: Record<string, unknown>): AgentToolCall => ({
      type: "toolCall",
      id,
      name,
      arguments: args,
    });
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      if (streamCalls > 2) {
        throw new Error("model was called after reordered multi-tool breaker tripped");
      }
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const calls =
          streamCalls === 1
            ? [
                toolCall("alpha-1", "alpha_tool", { value: 1 }),
                toolCall("beta-1", "beta_tool", { value: 2 }),
              ]
            : [
                toolCall("beta-2", "beta_tool", { value: 2 }),
                toolCall("alpha-2", "alpha_tool", { value: 1 }),
              ];
        const message: AssistantMessage = {
          role: "assistant",
          content: calls,
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: TEST_USAGE,
          stopReason: "toolUse",
          timestamp: Date.now(),
        };
        stream.push({ type: "done", reason: "toolUse", message });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [{ role: "user", content: "run failing batch", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "alpha_tool",
            label: "alpha_tool",
            description: "Alpha",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute: executeAlpha,
          },
          {
            name: "beta_tool",
            label: "beta_tool",
            description: "Beta",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute: executeBeta,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    expect(streamCalls).toBe(2);
    expect(executeAlpha).toHaveBeenCalledTimes(2);
    expect(executeBeta).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorCode: "repeated_tool_error",
    });
  });

  it("allows a corrected retry with changed arguments after an initial tool error", async () => {
    const invalidArgs = {
      task: "return to main",
      targetSessionKey: "agent:main:discord:channel:000000000000000001",
      fanoutMode: "tree",
    };
    const correctedArgs = {
      task: "return to main",
      targetSessionKey: "agent:main:discord:channel:000000000000000001",
    };
    const execute = vi
      .fn<AgentTool["execute"]>()
      .mockRejectedValueOnce(
        new Error("fanoutMode cannot be combined with targetSessionKey or targetSessionKeys."),
      )
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "scheduled" }],
        details: { status: "scheduled" },
      });
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message =
          streamCalls === 1
            ? repeatedToolErrorAssistantMessage(invalidArgs)
            : streamCalls === 2
              ? repeatedToolErrorAssistantMessage(correctedArgs)
              : {
                  role: "assistant" as const,
                  content: [{ type: "text" as const, text: "done" }],
                  api: model.api,
                  provider: model.provider,
                  model: model.id,
                  usage: TEST_USAGE,
                  stopReason: "stop" as const,
                  timestamp: Date.now(),
                };
        stream.push({
          type: "done",
          reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
          message,
        });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [{ role: "user", content: "schedule targeted return", timestamp: Date.now() }],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "continue_delegate",
            label: "continue_delegate",
            description: "Continuation delegate",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    expect(streamCalls).toBe(3);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)).toMatchObject({ role: "assistant", stopReason: "stop" });
  });

  it("terminates when a repeated error batch also contains a successful sibling tool call", async () => {
    const invalidArgs = {
      task: "return to main",
      targetSessionKey: "agent:main:discord:channel:000000000000000001",
      fanoutMode: "tree",
    };
    const executeInvalid = vi.fn(async () => {
      throw new Error("fanoutMode cannot be combined with targetSessionKey or targetSessionKeys.");
    });
    const executeProgress = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "made progress" }],
      details: { status: "ok" },
    }));
    let streamCalls = 0;
    const streamFn: StreamFn = () => {
      streamCalls += 1;
      if (streamCalls > 2) {
        throw new Error("model was called after mixed batch breaker tripped");
      }
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const message: AssistantMessage =
          streamCalls <= 2
            ? {
                role: "assistant",
                content: [
                  {
                    type: "toolCall",
                    id: `invalid-${streamCalls}`,
                    name: "continue_delegate",
                    arguments: invalidArgs,
                  },
                  {
                    type: "toolCall",
                    id: `progress-${streamCalls}`,
                    name: "progress_probe",
                    arguments: { step: streamCalls },
                  },
                ],
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: TEST_USAGE,
                stopReason: "toolUse",
                timestamp: Date.now(),
              }
            : {
                role: "assistant",
                content: [{ type: "text", text: "done" }],
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: TEST_USAGE,
                stopReason: "stop",
                timestamp: Date.now(),
              };
        stream.push({
          type: "done",
          reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
          message,
        });
        stream.end();
      });
      return stream;
    };

    const messages = await runAgentLoop(
      [
        {
          role: "user",
          content: "schedule targeted return and probe progress",
          timestamp: Date.now(),
        },
      ],
      {
        systemPrompt: "",
        messages: [],
        tools: [
          {
            name: "continue_delegate",
            label: "continue_delegate",
            description: "Continuation delegate",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute: executeInvalid,
          },
          {
            name: "progress_probe",
            label: "progress_probe",
            description: "Progress probe",
            parameters: Type.Object({}, { additionalProperties: true }),
            execute: executeProgress,
          },
        ],
      },
      config,
      () => {},
      undefined,
      streamFn,
    );

    expect(streamCalls).toBe(2);
    expect(executeInvalid).toHaveBeenCalledTimes(2);
    expect(executeProgress).toHaveBeenCalledTimes(2);
    expect(messages.at(-1)).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorCode: "repeated_tool_error",
    });
  });
});
