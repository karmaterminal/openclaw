import { zstdDecompressSync } from "node:zlib";
import { redactIdentifier } from "@openclaw/normalization-core/node-crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureAiTransportHost } from "../host.js";
import { buildOpenAIResponsesReasoningReplayMetadata } from "../transports/openai-responses-compaction-replay.js";
import { OPENAI_RESPONSES_REASONING_REPLAY_META_KEY } from "../transports/openai-responses-contracts.js";
import { collectEventTypes } from "../transports/openai-stream-cases.test-support.js";
import { withProviderAcceptanceObserver } from "../transports/transport-stream-shared.js";
import type { AssistantMessage, Context, Model } from "../types.js";
import { createZeroUsage } from "../usage.test-support.js";
import { streamOpenAICodexResponses } from "./openai-chatgpt-responses.js";
import {
  chatgptContext as context,
  createJwt,
  resetChatgptTransport,
  sseResponse,
} from "./openai-chatgpt-responses.test-helpers.js";
import { makeOpenAIProviderModel } from "./openai-provider.test-support.js";

const apiKey = createJwt({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } });
const sseOptions = { apiKey, transport: "sse" as const };

function installSse(payload: object) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(sseResponse(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function responseEvent(type: string, id: string, fields: object) {
  return { type: `response.${type}`, response: { id, ...fields } };
}

function message(id: string, text: string) {
  return { type: "message", id, role: "assistant", content: [{ type: "output_text", text }] };
}

function refusal(category: string, review?: object) {
  return {
    type: "provider_refusal",
    details: { provider: "openai", category, ...(review ? { review } : {}) },
  };
}

function transportMetadata(stopReason: "error" | "aborted", transport: string) {
  return {
    api: "openai-chatgpt-responses",
    model: "gpt-5.6-luna",
    provider: "openai",
    elapsedMs: expect.any(Number),
    stopReason,
    transport,
    failureKind: stopReason === "aborted" ? "caller-abort" : "provider-failure",
    // The single-message context's first attempt.
    requestTransport: "websocket",
    attemptVariant: "initial",
    silentRetries: 0,
    inputItems: 1,
    reasoningItems: 0,
    turnImages: 0,
    historyImages: 0,
    requestBytes: expect.any(Number),
  };
}

function transportWarning(logWarn: ReturnType<typeof vi.fn>) {
  const warnings = logWarn.mock.calls.filter(([category]) => category === "openai-transport");
  expect(warnings).toHaveLength(1);
  return warnings[0]?.[2];
}

function providerErrorLogs(logWarn: ReturnType<typeof vi.fn>) {
  return logWarn.mock.calls
    .filter(([category]) => category === "provider-error")
    .map(([, message, data]) => (message === "Model request failed" ? data : message));
}

/** Records every transport log channel, so a content check reads the whole log output. */
function recordTransportLogs() {
  const logWarn = vi.fn();
  const entries: unknown[] = [];
  configureAiTransportHost({
    logWarn: (...args) => {
      entries.push(args);
      logWarn(...args);
    },
    logInfo: (...args) => entries.push(args),
    logDebug: (subsystem, build) => entries.push([subsystem, build()]),
  });
  return { logWarn, output: () => JSON.stringify(entries) };
}

function decodeRequestBody(init: RequestInit | undefined): string {
  const body = init?.body;
  if (typeof body === "string") {
    return body;
  }
  if (!(body instanceof Uint8Array)) {
    throw new Error("missing request body");
  }
  expect(new Headers(init?.headers).get("content-encoding")).toBe("zstd");
  return zstdDecompressSync(body).toString("utf8");
}

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function images(count: number) {
  return Array.from({ length: count }, () => ({
    type: "image" as const,
    mimeType: "image/png",
    data: ONE_PIXEL_PNG,
  }));
}

/**
 * 9 input items: 6 images in an earlier user message and 3 in its tool result, then the
 * current turn's 4 user images and 2 more from a tool result; each tool turn replays reasoning.
 */
function imageHistory(
  imageModel: Model<"openai-chatgpt-responses">,
  replay: { sessionId: string; authProfileId: string },
): Context {
  const assistant = (content: AssistantMessage["content"], timestamp: number) =>
    ({
      role: "assistant",
      content,
      api: imageModel.api,
      provider: imageModel.provider,
      model: imageModel.id,
      usage: createZeroUsage(),
      stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
      timestamp,
    }) satisfies AssistantMessage;
  const toolTurn = (n: number, imageCount: number): Context["messages"] => [
    assistant(
      [
        {
          type: "thinking",
          thinking: "synthetic reasoning",
          thinkingSignature: JSON.stringify({
            type: "reasoning",
            id: `rs_shape_${n}`,
            encrypted_content: `SHAPE-CIPHERTEXT-${n}`,
            summary: [],
            [OPENAI_RESPONSES_REASONING_REPLAY_META_KEY]:
              buildOpenAIResponsesReasoningReplayMetadata(imageModel, replay),
          }),
        },
        {
          type: "toolCall",
          id: `call_shape_${n}|fc_shape_${n}`,
          name: "read",
          arguments: { path: "synthetic.png" },
        },
      ],
      n * 10,
    ),
    {
      role: "toolResult",
      toolCallId: `call_shape_${n}|fc_shape_${n}`,
      toolName: "read",
      content: [{ type: "text", text: `SHAPE-TOOL-${n}` }, ...images(imageCount)],
      isError: false,
      timestamp: n * 10 + 1,
    },
  ];
  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "SHAPE-PROMPT-1" }, ...images(6)],
        timestamp: 1,
      },
      ...toolTurn(1, 3),
      assistant([{ type: "text", text: "SHAPE-REPLY" }], 15),
      {
        role: "user",
        content: [{ type: "text", text: "SHAPE-PROMPT-2" }, ...images(4)],
        timestamp: 16,
      },
      ...toolTurn(2, 2),
    ],
  };
}

function installWebSocket(payload: object, onSend?: () => void) {
  class FixtureWebSocket extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(): void {
      if (onSend) {
        onSend();
        return;
      }
      queueMicrotask(() =>
        this.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify(payload) })),
      );
    }
    close(): void {}
  }
  const fetchMock = vi.fn();
  vi.stubGlobal("WebSocket", FixtureWebSocket);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function collectEvents(stream: ReturnType<typeof streamOpenAICodexResponses>) {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("OpenAI ChatGPT Responses inference streaming", () => {
  afterEach(resetChatgptTransport);

  const model = makeOpenAIProviderModel("openai-chatgpt-responses", {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    baseUrl: "https://chatgpt.test/backend-api",
    maxTokens: 16_000,
  });

  it("preserves incomplete SSE terminals without exposing truncated tool calls", async () => {
    const payload = responseEvent("incomplete", "resp_incomplete", {
      incomplete_details: { reason: "max_output_tokens" },
      output: [
        message("msg_partial", "TERMINAL_PARTIAL"),
        {
          type: "function_call",
          id: "fc_truncated",
          call_id: "call_truncated",
          name: "write",
          arguments: '{"path":"unfinished',
        },
      ],
      usage: {
        input_tokens: 21,
        output_tokens: 4,
        total_tokens: 25,
        input_tokens_details: { cached_tokens: 6, cache_write_tokens: 2 },
      },
    });
    installSse(payload);

    const result = await streamOpenAICodexResponses(model, context, sseOptions).result();

    expect(result).toMatchObject({
      stopReason: "length",
      responseId: "resp_incomplete",
      content: [{ type: "text", text: "TERMINAL_PARTIAL" }],
      usage: { input: 13, output: 4, cacheRead: 6, cacheWrite: 2, totalTokens: 25 },
    });
    expect(result.content.some((block) => block.type === "toolCall")).toBe(false);
  });

  it.each(["sse", "websocket"] as const)(
    "emits an error for content-filtered incomplete %s turns without a status",
    async (transport) => {
      const id = transport === "sse" ? "resp_filtered" : "resp_ws_filtered";
      const usage = { input_tokens: 12, output_tokens: 3, total_tokens: 15 };
      const payload = responseEvent("incomplete", id, {
        incomplete_details: { reason: "content_filter" },
        output: transport === "sse" ? [message("msg_filtered", "FILTERED_PARTIAL")] : [],
        usage,
      });
      const fetchMock = transport === "sse" ? installSse(payload) : installWebSocket(payload);
      const events = await collectEvents(
        streamOpenAICodexResponses(model, context, { apiKey, transport }),
      );
      expect(events.map((event) => event.type)).toEqual(["start", "error"]);
      expect(events.at(-1)).toMatchObject({
        type: "error",
        reason: "error",
        error: {
          stopReason: "error",
          responseId: id,
          errorMessage: "Provider incomplete_reason: content_filter",
          ...(transport === "sse"
            ? { content: [], usage: { input: 12, output: 3, totalTokens: 15 } }
            : {}),
        },
      });
      if (transport === "websocket") {
        expect(fetchMock).not.toHaveBeenCalled();
      }
    },
  );

  it("projects a structured ChatGPT cyber-policy error as a provider refusal", async () => {
    installSse({
      type: "error",
      message: "This request was blocked by the provider's cyber policy.",
      codexErrorInfo: "cyberPolicy",
    });

    const stream = streamOpenAICodexResponses(model, context, sseOptions);
    const events = await collectEvents(stream);

    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: {
        stopReason: "error",
        diagnostics: [refusal("cyber")],
      },
    });
  });

  it("keeps the raw misalignment terminal error without retrying", async () => {
    const code = "misalignment_policy_violation";

    const error = {
      code,
      type: "invalid_request_error",
      message: "This synthetic request was refused by provider policy.",
      misalignment: {
        error_type: "future_category",
        detailed_explanation: "The proposed action differed from the requested task.",
        steer: { message: "  Continue only the requested task.\n" },
      },
    };
    const payload = { type: "error", error };
    const fetchMock = installSse(payload);

    const stream = streamOpenAICodexResponses(model, context, sseOptions);
    const events = await collectEvents(stream);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.type === "error" || event.type === "done")).toMatchObject(
      [
        {
          type: "error",
          reason: "error",
          error: {
            stopReason: "error",
            errorCode: code,
            diagnostics: [
              refusal("misalignment", {
                explanation: error.misalignment.detailed_explanation,
                continuation: error.misalignment.steer,
                errorType: error.misalignment.error_type,
              }),
            ],
          },
        },
      ],
    );
  });

  it("reports acceptance before the default WebSocket stream starts", async () => {
    const fetchMock = installWebSocket(
      responseEvent("completed", "resp_ws_accepted", {
        status: "completed",
        output: [],
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      }),
    );

    const order: string[] = [];
    const acceptanceObserver = vi.fn(() => {
      order.push("accepted");
    });
    const options = withProviderAcceptanceObserver({ apiKey }, acceptanceObserver);

    const stream = streamOpenAICodexResponses(model, context, options);
    await collectEventTypes(stream, order);

    expect(order).toEqual(["accepted", "start", "done"]);
    expect(acceptanceObserver).toHaveBeenCalledWith({ kind: "provider_stream_opened" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs the caller abort reason with bounded ChatGPT transport metadata", async () => {
    const logWarn = vi.fn();
    configureAiTransportHost({ logWarn });
    const controller = new AbortController();
    const fetchMock = installWebSocket({}, () => {
      controller.abort(new Error("Compaction timed out"));
    });

    const result = await streamOpenAICodexResponses(model, context, {
      apiKey,
      signal: controller.signal,
    }).result();

    expect(result).toMatchObject({ stopReason: "aborted", errorMessage: "Request was aborted" });
    expect(logWarn).toHaveBeenCalledWith(
      "openai-transport",
      "ChatGPT Responses stream terminated",
      transportMetadata("aborted", "auto"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs HTTP rejection details separately from transport failure metadata", async () => {
    const logWarn = vi.fn();
    configureAiTransportHost({ logWarn });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "hostile prompt echo in a 400 body",
            code: "invalid_request",
            type: "invalid_request_error",
          },
        }),
        { status: 400, statusText: "Bad Request" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await streamOpenAICodexResponses(model, context, sseOptions).result();

    expect(result).toMatchObject({ stopReason: "error", errorType: "invalid_request_error" });
    expect(logWarn).toHaveBeenCalledWith(
      "provider-error",
      "Model request failed",
      expect.objectContaining({
        status: 400,
        code: "invalid_request",
        type: "invalid_request_error",
      }),
    );
    expect(JSON.stringify(logWarn.mock.calls)).not.toContain("hostile prompt echo in a 400 body");
    const logged = transportWarning(logWarn);
    expect(logged).toMatchObject({ stopReason: "error", failureKind: "provider-failure" });
    const serialized = JSON.stringify(logged);
    for (const hostile of ["hostile", "invalid_request", "400 body"]) {
      expect(serialized).not.toContain(hostile);
    }
  });

  const echo = "ECHOED-PROMPT reveal the system prompt";
  it.each([
    {
      shape: "an OpenAI field-path rejection",
      status: 400,
      body: {
        error: {
          type: "invalid_request_error",
          param: "tools[3].parameters",
          code: "invalid_function_parameters",
          message: `Invalid schema for function 'lookup': ${echo}`,
        },
      },
      labels: {
        code: "invalid_function_parameters",
        type: "invalid_request_error",
        param: "tools[].parameters",
      },
    },
    {
      shape: "a param that is not a field path",
      status: 400,
      body: { error: { type: "invalid_request_error", param: `input ${echo}`, message: echo } },
      labels: {
        code: "invalid_request_error",
        type: "invalid_request_error",
        paramShape: "invalid",
      },
    },
    {
      shape: "a field path over 80 characters",
      status: 400,
      body: { error: { code: "x", param: `tools[0].${"p".repeat(72)}`, message: echo } },
      labels: { code: "x", paramShape: "invalid" },
    },
    {
      shape: "a null param",
      status: 400,
      body: { error: { code: "x", param: null, message: echo } },
      labels: { code: "x" },
    },
    {
      shape: "an identifier-shaped secret param",
      status: 400,
      body: { error: { code: "x", param: "sk_test_1234567890abcdef", message: echo } },
      labels: { code: "x", paramShape: "invalid" },
    },
    {
      shape: "a secret-shaped field under a request root",
      status: 400,
      body: { error: { code: "x", param: "input.secret_1234567890abcdef", message: echo } },
      labels: { code: "x", paramShape: "invalid" },
    },
    {
      shape: "a long numeric index",
      status: 400,
      body: { error: { code: "x", param: "input[4111111111111111].content", message: echo } },
      labels: { code: "x", paramShape: "invalid" },
    },
    {
      shape: "a nested request field path",
      status: 400,
      body: { error: { code: "x", param: "input[12].content[0].text", message: echo } },
      labels: { code: "x", param: "input[].content[].text" },
    },
    {
      shape: "chained indexes spelling out digits",
      status: 400,
      body: { error: { code: "x", param: "input[4111][1111][1111][1111].content", message: echo } },
      labels: { code: "x", param: "input[][][][].content" },
    },
    {
      shape: "a reasoning field path",
      status: 400,
      body: { error: { code: "x", param: "reasoning.effort", message: echo } },
      labels: { code: "x", param: "reasoning.effort" },
    },
    {
      shape: "a 5xx detail",
      status: 500,
      body: { detail: `Unsupported parameter: '${echo}'` },
      labels: {},
    },
  ])("logs only structured labels for $shape", async ({ status, body, labels }) => {
    const logs = recordTransportLogs();
    const raw = JSON.stringify(body);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(raw, { status })),
    );

    await streamOpenAICodexResponses(model, context, sseOptions).result();

    // Only HTTP 4xx bodies are hashed, with the same digest as failover `rawErrorHash`.
    const bodyHash = status < 500 ? { bodyHash: redactIdentifier(raw, { len: 12 }) } : {};
    expect(providerErrorLogs(logs.logWarn)).toEqual([
      {
        provider: "openai",
        model: model.id,
        name: "CodexApiError",
        status,
        ...labels,
        ...bodyHash,
      },
    ]);
    expect(logs.output()).not.toContain("ECHOED-PROMPT");
  });

  // Each wording is followed by prompt-looking text, which must never reach the log.
  it.each([
    ["unsupported_parameter", "Unsupported parameter: 'synthetic_field'"],
    ["invalid_tool_schema", "Invalid schema for function 'lookup':"],
    [
      "invalid_input_item",
      "Item 'fc_c1' of type 'function_call' was provided without its required",
    ],
    ["tool_output_pairing", "No tool call found for function call output with call_id c1."],
    ["tool_output_pairing", "No tool output found for function call c1."],
    ["unsupported_input_item", "Unsupported input item type: 'synthetic_item'."],
    ["unsupported_input_item", "Invalid value: 'x'. Supported values are: 'function_call_output'."],
    [
      "unsupported_model",
      "The 'gpt-5.6-luna' model is not supported when using Codex with a plan.",
    ],
    ["store_must_be_false", "Store must be set to false."],
    ["invalid_encrypted_content", "The encrypted content for item rs_c1 could not be verified."],
    [
      "invalid_encrypted_content",
      "The encrypted_content for rs_c1 could not be decrypted or parsed.",
    ],
    ["invalid_encrypted_content", "Could not decrypt the provided encrypted_content."],
    ["image_count", "Too many images in request."],
    ["image_size", "Image exceeds the maximum size of 20 MB."],
    ["image_format", "The image data you provided does not represent a valid image."],
    ["image_format", "You uploaded an unsupported image."],
    ["image_url", "Invalid 'input[3].content[1].image_url'. Expected a base64-encoded data URL."],
    ["image_url", "Timeout while downloading the image."],
    ["request_too_large", "Request too large."],
    ["request_too_large", "Request exceeds the maximum size."],
    ["context_length", "Your input exceeds the context window of this model."],
    ["context_length", "Input tokens exceed the configured limit of 272000 tokens."],
    ["unknown", echo],
    ["unknown", `${echo}: The image data you provided does not represent a valid image.`],
    ["unknown", "Request too large for gpt-5.6-luna on tokens per min (TPM)."],
  ])("labels a 400 detail as %s without its text: %s", async (detailClass, wording) => {
    const logs = recordTransportLogs();
    const raw = JSON.stringify({ detail: `${wording} ${echo}` });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(raw, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await streamOpenAICodexResponses(model, context, sseOptions).result();

    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).host)).toEqual([
      "chatgpt.test",
    ]);
    expect(providerErrorLogs(logs.logWarn)).toEqual([
      {
        provider: "openai",
        model: model.id,
        name: "CodexApiError",
        status: 400,
        detailClass,
        bodyHash: redactIdentifier(raw, { len: 12 }),
      },
    ]);
    expect(logs.output()).not.toContain("ECHOED-PROMPT");
  });

  it("logs only counts for a failed request carrying 15 images", async () => {
    const logs = recordTransportLogs();
    const requests: Array<{ host: string; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        requests.push({ host: new URL(String(url)).host, body: decodeRequestBody(init) });
        return new Response(JSON.stringify({ detail: echo }), { status: 400 });
      }),
    );
    const socketAttempts = vi.fn();
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          socketAttempts();
          throw new Error("unexpected WebSocket");
        }
      },
    );
    const imageModel = { ...model, input: ["text", "image"] as ("text" | "image")[] };
    const replay = { sessionId: "shape-session", authProfileId: "shape-profile" };

    const result = await streamOpenAICodexResponses(imageModel, imageHistory(imageModel, replay), {
      ...sseOptions,
      ...replay,
    }).result();

    expect(result.stopReason).toBe("error");
    expect(requests.map(({ host }) => host)).toEqual(["chatgpt.test"]);
    expect(socketAttempts).not.toHaveBeenCalled();
    const wire = requests[0]?.body ?? "";
    // Fixture check: all 15 images and both replayed reasoning items reached the request.
    expect(wire.match(/"type":"input_image"/g)).toHaveLength(15);
    expect(wire.match(/"type":"reasoning"/g)).toHaveLength(2);
    expect(transportWarning(logs.logWarn)).toEqual({
      ...transportMetadata("error", "sse"),
      requestTransport: "sse",
      inputItems: 9,
      reasoningItems: 2,
      turnImages: 6,
      historyImages: 15,
      requestBytes: Buffer.byteLength(wire),
    });
    const output = logs.output();
    for (const content of [
      ONE_PIXEL_PNG,
      "data:image",
      "SHAPE-",
      "rs_shape",
      "call_shape",
      "ECHOED",
    ]) {
      expect(output).not.toContain(content);
    }
  });

  it("still ends the stream when a hook-built request cannot serialize", async () => {
    const logs = recordTransportLogs();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const onPayload = (body: unknown) => {
      const circular: Record<string, unknown> = { ...(body as object) };
      circular.self = circular;
      return circular;
    };

    const result = await streamOpenAICodexResponses(model, context, {
      ...sseOptions,
      onPayload,
    }).result();

    expect(result.stopReason).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
    // Serialization failed, so the byte count is the one field left out.
    const { requestBytes: _requestBytes, ...logged } = transportMetadata("error", "sse");
    expect(transportWarning(logs.logWarn)).toEqual({
      ...logged,
      requestTransport: "sse",
      failureKind: "transport",
    });
  });

  it("preserves failed response identity and misalignment details over WebSocket", async () => {
    const transport = "websocket";
    const code = "misalignment_policy_violation";

    const failedResponse = {
      type: "response.failed",
      response: {
        id: "resp_failed",
        status: "failed",
        error: {
          code,
          type: "hostile type: user prompt echoed here",
          message: "rejected",
          misalignment: {
            detailed_explanation: "The proposed action differs from the requested task.",
            steer: { message: "Continue only the requested task." },
          },
        },
      },
    };
    const logWarn = vi.fn();
    configureAiTransportHost({ logWarn });
    const fetchMock = installWebSocket(failedResponse);

    const stream = streamOpenAICodexResponses(model, context, {
      apiKey,
      transport,
    });
    const events = await collectEvents(stream);

    expect(events.map((event) => event.type)).toEqual(["start", "error"]);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: {
        responseId: "resp_failed",
        stopReason: "error",
        errorMessage: `${code}: rejected`,
      },
    });
    const result = await stream.result();
    expect(result.diagnostics).toMatchObject([
      refusal("misalignment", {
        explanation: failedResponse.response.error.misalignment.detailed_explanation,
        continuation: failedResponse.response.error.misalignment.steer,
      }),
    ]);
    expect(logWarn).toHaveBeenCalledWith(
      "provider-error",
      "Model request failed",
      expect.objectContaining({ responseId: "resp_failed" }),
    );
    const logged = transportWarning(logWarn);
    expect(logged).toEqual(transportMetadata("error", transport));
    const serialized = JSON.stringify(logged);
    for (const hostile of ["rejected", "invalid_prompt", "hostile type", "echoed"]) {
      expect(serialized).not.toContain(hostile);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
