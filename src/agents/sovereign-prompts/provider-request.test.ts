// Final-payload enforcement on each supported API builder (#1321): the real built-in
// builder shapes the request, the check reads that API's system field, and a refused
// request never reaches the network.
import { zstdDecompressSync } from "node:zlib";
import { configureAiTransportHost, getAiTransportHost } from "@openclaw/ai";
import { prepareModelRequestBody } from "@openclaw/ai/internal/model-request-body";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUMMARIZATION_SYSTEM_PROMPT } from "../../../packages/agent-core/src/harness/compaction/summarization-prompts.js";
import type { OpenClawConfig } from "../../config/types.js";
import { streamSimple } from "../../llm/stream.js";
import type { Context, Model } from "../../llm/types.js";
import { resetSovereignRedactionForTests } from "../../logging/sovereign-redaction.js";
import type { StreamFn } from "../runtime/index.js";
import { buildConfiguredAgentSystemPrompt } from "../system-prompt-config.js";
import { makeProviderModelFixture } from "../test-helpers/provider-model-fixture.js";
import { wrapStreamFnWithSovereignRequestCheck } from "./provider-request.js";
import { resetSovereignPromptRuntimeForTests, type SovereignPromptSpans } from "./runtime.js";
import {
  capture,
  expectNoSentinel,
  SENTINEL,
  sovereignAgentsConfig,
  useDeniedNetworkEgress,
  useSovereignTempDirs,
  writeAgentGeneration,
} from "./sovereign-fixture.test-support.js";

const sovereignWarn = vi.hoisted(() => vi.fn());
vi.mock("../../logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../logging/subsystem.js")>();
  return {
    ...actual,
    createSubsystemLogger: (subsystem: string) => {
      const logger = actual.createSubsystemLogger(subsystem);
      return subsystem === "agents/sovereign-prompts" ? { ...logger, warn: sovereignWarn } : logger;
    },
  };
});

const tempDirs = useSovereignTempDirs(afterEach);
// Every request must reach the capture below; a missed one fails instead of leaving.
useDeniedNetworkEgress(beforeEach, afterEach);
const REFUSED = { stopReason: "error", errorCode: "transform_altered" };

type Reply = { status: number; body: unknown };
/** Each request that reached the network edge, parsed as the provider receives it. */
let sent: Record<string, unknown>[] = [];
let replies: Reply[] = [];
let afterSend: (() => void) | undefined;
let originalHost: ReturnType<typeof getAiTransportHost>;

beforeEach(() => {
  sovereignWarn.mockClear();
  sent = [];
  replies = [];
  afterSend = undefined;
  originalHost = getAiTransportHost();
  const record: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const bytes = Buffer.from(await request.arrayBuffer());
    // The Codex SSE route compresses its body; read it as the provider would.
    const text = (
      request.headers.get("content-encoding") === "zstd" ? zstdDecompressSync(bytes) : bytes
    ).toString("utf8");
    sent.push(JSON.parse(text) as Record<string, unknown>);
    afterSend?.();
    const reply = replies.shift() ?? {
      status: 400,
      body: { error: { type: "invalid_request_error", message: "fixture rejection" } },
    };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  };
  configureAiTransportHost({ ...originalHost, buildModelFetch: () => record });
  vi.stubGlobal("fetch", record);
});

afterEach(() => {
  configureAiTransportHost(originalHost);
  vi.unstubAllGlobals();
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

async function renderMain() {
  const agentDir = tempDirs.make("openclaw-sovereign-builders-");
  writeAgentGeneration(agentDir, "main");
  const config = sovereignAgentsConfig({ main: { agentDir, mode: "enforce" } }) as OpenClawConfig;
  let spans: SovereignPromptSpans | undefined;
  const prompt = await buildConfiguredAgentSystemPrompt({
    config,
    agentId: "main",
    workspaceDir: "/openclaw-sovereign-fixture/workspace",
    toolNames: ["exec"],
    onRenderedSovereignSpans: (rendered) => {
      spans = rendered;
    },
  });
  return { prompt, spans: spans! };
}

/** The real built-in builder for `model.api`, behind the check; `receipts` collects outcomes. */
function checkedBuilder(spans: SovereignPromptSpans, receipts?: unknown[]) {
  return wrapStreamFnWithSovereignRequestCheck(streamSimple as StreamFn, {
    sessionAgentId: "main",
    sovereignSpans: () => spans,
    onSovereignVerification: (verification) => receipts?.push(verification),
  });
}

async function send(
  streamFn: StreamFn,
  model: Model,
  systemPrompt: string | undefined,
  onPayload?: (payload: Record<string, unknown>) => unknown,
  options: Record<string, unknown> = {},
) {
  const context: Context = {
    ...(systemPrompt === undefined ? {} : { systemPrompt }),
    messages: [{ role: "user", content: "Reply OK", timestamp: 1 }],
  };
  return await capture(async () => {
    const stream = await streamFn(model, context, {
      apiKey: model.api === "openai-chatgpt-responses" ? CHATGPT_TOKEN : "synthetic-key",
      ...options,
      ...(onPayload
        ? { onPayload: (payload: unknown) => onPayload(payload as Record<string, unknown>) }
        : {}),
    });
    return await stream.result();
  });
}

/** The Codex route reads its account from the token; this one is unsigned and synthetic. */
const CHATGPT_TOKEN = [
  { alg: "none", typ: "JWT" },
  { "https://api.openai.com/auth": { chatgpt_account_id: "acct-fixture" } },
]
  .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
  .concat("signature")
  .join(".");

/** Rewrites the fixture prose wherever the builder placed it. */
const alterSpans = (payload: Record<string, unknown>) =>
  JSON.parse(
    JSON.stringify(payload).replaceAll("Synthetic fixture prose", "Altered prose"),
  ) as Record<string, unknown>;

const BUILDERS: { api: string; model: Model }[] = [
  ["anthropic-messages", "anthropic", "claude-sonnet-4-6", "https://api.anthropic.com"],
  ["openai-completions", "openai", "gpt-5.6-luna", "https://api.openai.com/v1"],
  ["mistral-conversations", "mistral", "mistral-large-latest", "https://api.mistral.ai"],
  ["openai-responses", "openai", "gpt-5.6-luna", "https://api.openai.com/v1"],
  [
    "azure-openai-responses",
    "azure-openai-responses",
    "gpt-5.6-luna",
    "https://fixture.openai.azure.com/openai/v1",
  ],
  ["openai-chatgpt-responses", "openai", "gpt-5.6-luna", "https://chatgpt.com/backend-api"],
  [
    "google-generative-ai",
    "google",
    "gemini-3-pro-preview",
    "https://generativelanguage.googleapis.com/v1beta",
  ],
  [
    "google-vertex",
    "google-vertex",
    "gemini-3-pro-preview",
    "https://us-central1-aiplatform.googleapis.com",
  ],
  [
    "google-interactions",
    "google",
    "gemini-3-pro-preview",
    "https://generativelanguage.googleapis.com/v1beta",
  ],
].map(([api, provider, id, baseUrl]) => ({
  api: api!,
  model: makeProviderModelFixture({ id: id!, provider: provider!, api: api!, baseUrl: baseUrl! }),
}));

describe.skipIf(process.platform === "win32")("provider request check on each API builder", () => {
  it.each(BUILDERS)("$api: sends an unchanged request carrying every span", async ({ model }) => {
    const { prompt, spans } = await renderMain();
    const outcome = await send(checkedBuilder(spans), model, prompt);
    expect(outcome.error).toBeUndefined();
    expect(sent).toHaveLength(1);
    const wire = JSON.stringify(sent[0]);
    for (const instance of spans.instances) {
      expect(wire).toContain(JSON.stringify(instance).slice(1, -1));
    }
  });

  it.each(BUILDERS)(
    "$api: refuses an altered span, and a request without system text, before the network",
    async ({ model }) => {
      const { prompt, spans } = await renderMain();
      const altered = await send(checkedBuilder(spans), model, prompt, alterSpans);
      expect(altered.value).toMatchObject(REFUSED);
      expectNoSentinel(altered);
      const missing = await send(checkedBuilder(spans), model, undefined);
      expect(missing.value).toMatchObject(REFUSED);
      expectNoSentinel(missing);
      expect(sent).toHaveLength(0);
      // The log keeps the site the run's redacted error text loses, and no content.
      expect(sovereignWarn).toHaveBeenCalledTimes(2);
      expect(sovereignWarn).toHaveBeenCalledWith(
        "[SOVEREIGN_PROMPTS_REFUSED] agent:main code=transform_altered site=provider_request",
        {
          event: "sovereign_prompts.refused",
          agentId: "main",
          code: "transform_altered",
          site: "provider_request",
        },
      );
    },
  );

  it("refuses an API with no system-field reader before calling its transport", async () => {
    const { prompt, spans } = await renderMain();
    const transport = vi.fn<StreamFn>();
    const checked = wrapStreamFnWithSovereignRequestCheck(transport, {
      sessionAgentId: "main",
      sovereignSpans: () => spans,
    });
    const model = makeProviderModelFixture({
      id: "llama3",
      provider: "ollama",
      api: "ollama",
      baseUrl: "http://127.0.0.1:11434",
    });
    expect(() =>
      checked(model, { systemPrompt: prompt, messages: [] }, { apiKey: "synthetic-key" }),
    ).toThrow(
      expect.objectContaining({ code: "route_unconverted", details: { route: "api:ollama" } }),
    );
    expect(transport).not.toHaveBeenCalled();
    expect(sovereignWarn).toHaveBeenCalledWith(
      "[SOVEREIGN_PROMPTS_REFUSED] agent:main code=route_unconverted route=api:ollama",
      expect.objectContaining({ code: "route_unconverted", route: "api:ollama" }),
    );
  });

  it("checks the API a provider transport builds for, not the one it was routed by", async () => {
    const { prompt, spans } = await renderMain();
    // LM Studio is routed as openai-completions and builds an Anthropic request.
    const lmstudio: StreamFn = (model, context, options) =>
      streamSimple({ ...model, api: "anthropic-messages" }, context, options);
    const checked = wrapStreamFnWithSovereignRequestCheck(lmstudio, {
      sessionAgentId: "main",
      sovereignSpans: () => spans,
    });
    const model = makeProviderModelFixture({
      id: "qwen3",
      provider: "lmstudio",
      api: "openai-completions",
      baseUrl: "http://127.0.0.1:1234",
    });
    await send(checked, model, prompt);
    expect(sent).toHaveLength(1);
    expect(Array.isArray(sent[0]!.system)).toBe(true);
    const altered = await send(checked, model, prompt, alterSpans);
    expect(altered.value).toMatchObject(REFUSED);
    expect(sent).toHaveLength(1);
  });

  it("does not check a compaction summary, whose code-owned prompt carries no span", async () => {
    const { spans } = await renderMain();
    const model = BUILDERS.find(({ api }) => api === "openai-completions")!.model;
    // A provider wrapper may append to it, as Ollama's tool wire names do.
    const summaryPrompt = `${SUMMARIZATION_SYSTEM_PROMPT}\n\n## Tool wire names\n- exec`;
    const outcome = await send(checkedBuilder(spans), model, summaryPrompt);
    expect(outcome.value).toMatchObject({ errorCode: "400" });
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).not.toContain(SENTINEL);
  });

  it("passes a Responses continuation delta and still checks a resend that carries system text", async () => {
    const { prompt, spans } = await renderMain();
    const model = BUILDERS.find(({ api }) => api === "openai-responses")!.model;
    const user = { role: "user", content: [{ type: "input_text", text: "Reply OK" }] };
    const encoded: unknown[] = [];
    // A route without `instructions` sends the prompt first in input, then continues with
    // only new input after `previous_response_id`, encoding through the host each time.
    const transport: StreamFn = async (routed, _context, options) => {
      const encodeBody = prepareModelRequestBody(options);
      const developer = { role: "developer", content: [{ type: "input_text", text: prompt }] };
      await options?.onPayload?.({ model: routed.id, input: [developer, user] }, routed);
      encoded.push(
        await encodeBody({ model: routed.id, previous_response_id: "resp_1", input: [user] }),
      );
      await encodeBody({
        model: routed.id,
        previous_response_id: "resp_1",
        instructions: "Altered instructions.",
        input: [user],
      });
      throw new Error("unreachable");
    };
    const checked = wrapStreamFnWithSovereignRequestCheck(transport, {
      sessionAgentId: "main",
      sovereignSpans: () => spans,
    });
    await expect(
      checked(model, { systemPrompt: prompt, messages: [] }, { apiKey: "synthetic-key" }),
    ).rejects.toMatchObject({ code: "transform_altered", details: { site: "provider_request" } });
    expect(encoded).toHaveLength(1);
  });

  it("re-checks a resend the builder makes without the hook, after an earlier check passed", async () => {
    const { prompt, spans } = await renderMain();
    const model = BUILDERS.find(({ api }) => api === "openai-responses")!.model;
    const tierRejection = {
      status: 400,
      body: {
        error: {
          type: "invalid_request_error",
          param: "service_tier",
          message: "Unsupported service tier",
        },
      },
    };
    // The builder resends at a slower tier, from the request the hook already passed.
    replies = [tierRejection];
    await send(checkedBuilder(spans), model, prompt, undefined, { serviceTier: "priority" });
    expect(sent.map((request) => request.service_tier)).toEqual(["priority", "default"]);

    // A hook that keeps its payload and edits it after the first send is caught on the resend.
    sent = [];
    replies = [tierRejection];
    let retained: Record<string, unknown> | undefined;
    afterSend = () => {
      if (retained) {
        Object.assign(retained, alterSpans(retained));
      }
    };
    const outcome = await send(
      checkedBuilder(spans),
      model,
      prompt,
      (payload) => {
        retained = payload;
        return undefined;
      },
      { serviceTier: "priority" },
    );
    expect(outcome.value).toMatchObject(REFUSED);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).toContain(SENTINEL);
  });
});

// The check reads what the transport will send (openclaw#1571 review): the serialized
// request, from the carrier the transport uses, and never an object a serializer or an
// accessor can present differently from what goes on the wire.
describe.skipIf(process.platform === "win32")("provider request check on the sent request", () => {
  const modelFor = (api: string) => BUILDERS.find((builder) => builder.api === api)!.model;
  /** The builders that encode their body through the host; the rest serialize it themselves. */
  const HOST_ENCODED = new Set([
    "openai-completions",
    "openai-responses",
    "azure-openai-responses",
  ]);
  const DIFFERENT = "Different system instructions";

  it.each(BUILDERS)(
    "$api: refuses a hook replacement whose toJSON sends other system text",
    async ({ model }) => {
      const { prompt, spans } = await renderMain();
      const receipts: unknown[] = [];
      const outcome = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => ({
        ...payload,
        toJSON: () => alterSpans(payload),
      }));
      expect(outcome.value).toMatchObject(REFUSED);
      expect(sent).toHaveLength(0);
      expect(receipts).toEqual([undefined]);
    },
  );

  it("google-interactions: refuses system text behind a serializer or an accessor", async () => {
    const { prompt, spans } = await renderMain();
    const model = modelFor("google-interactions");
    const receipts: unknown[] = [];
    // The reviewer's probe: the original field stays visible beside a serializer.
    const serializer = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => ({
      ...payload,
      toJSON() {
        return { ...payload, system_instruction: DIFFERENT };
      },
    }));
    // An accessor that answers an object check's reads with the original, then sends other text.
    const accessor = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => {
      let reads = 0;
      return Object.defineProperty({ ...payload }, "system_instruction", {
        enumerable: true,
        get: () => (reads++ < 2 ? payload.system_instruction : DIFFERENT),
      });
    });
    expect(serializer.value).toMatchObject(REFUSED);
    expect(accessor.value).toMatchObject(REFUSED);
    expect(sent).toHaveLength(0);
    expect(receipts).toEqual([undefined, undefined]);
  });

  it.each(["google-generative-ai", "google-vertex"])(
    "%s: checks the SDK's config.systemInstruction, never a top-level bait field",
    async (api) => {
      const { prompt, spans } = await renderMain();
      const model = modelFor(api);
      const receipts: unknown[] = [];
      const bait = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => {
        const config = payload.config as Record<string, unknown>;
        return {
          ...payload,
          systemInstruction: config.systemInstruction,
          config: { ...config, systemInstruction: DIFFERENT },
        };
      });
      expect(bait.value).toMatchObject(REFUSED);
      expect(sent).toHaveLength(0);
      expect(receipts).toEqual([undefined]);

      // The same move made in place: the built request named its carrier before the hook ran.
      const moved = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => {
        payload.systemInstruction = (payload.config as Record<string, unknown>).systemInstruction;
        delete payload.config;
        return undefined;
      });
      expect(moved.value).toMatchObject(REFUSED);
      expect(sent).toHaveLength(0);

      await send(checkedBuilder(spans, receipts), model, prompt);
      expect(sent).toHaveLength(1);
      expect(JSON.stringify(sent[0]!.systemInstruction)).toContain(SENTINEL);
      expect(receipts.at(-1)).toMatchObject({ result: "final-payload-verified", site: api });
    },
  );

  it("checks the managed Google transport's top-level systemInstruction, its own carrier", async () => {
    const { prompt, spans } = await renderMain();
    // The managed transport (extensions/google) builds the REST body and sends it itself.
    const managed: StreamFn = async (routed, context, options) => {
      const built = {
        contents: [],
        systemInstruction: { parts: [{ text: context.systemPrompt }] },
      };
      const body = (await options?.onPayload?.(built, routed)) ?? built;
      await fetch(routed.baseUrl, { method: "POST", body: JSON.stringify(body) });
      throw new Error("fixture send");
    };
    const checked = wrapStreamFnWithSovereignRequestCheck(managed, {
      sessionAgentId: "main",
      sovereignSpans: () => spans,
    });
    const model = modelFor("google-generative-ai");
    const context = { systemPrompt: prompt, messages: [] };
    await expect(checked(model, context, {})).rejects.toThrow("fixture send");
    expect(sent).toHaveLength(1);
    // Spans moved into the SDK's `config` field, which the REST body does not use: none is sent.
    const moved = checked(model, context, {
      onPayload: () => ({ contents: [], config: { systemInstruction: prompt } }),
    });
    await expect(moved).rejects.toMatchObject({ code: "transform_altered" });
    // An in-place edit that adds the SDK's `config` beside other top-level text.
    const edited = checked(model, context, {
      onPayload: (payload) => {
        Object.assign(payload as Record<string, unknown>, {
          config: { systemInstruction: prompt },
          systemInstruction: { parts: [{ text: DIFFERENT }] },
        });
        return undefined;
      },
    });
    await expect(edited).rejects.toMatchObject({ code: "transform_altered" });
    expect(sent).toHaveLength(1);
  });

  // A plain carrier is not enough: any member the transport reads after the check can run
  // code (openclaw#1571 review 5964056490, finding 1). The getter sits on the sibling `model`.
  it.each(BUILDERS)(
    "$api: refuses a sibling getter that edits the plain carrier when the transport reads it",
    async ({ api, model }) => {
      const { prompt, spans } = await renderMain();
      const receipts: unknown[] = [];
      const outcome = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => {
        const originalModel = payload.model;
        const plain = { ...payload };
        Object.defineProperty(payload, "model", {
          enumerable: true,
          configurable: true,
          get() {
            // The reviewer's Google probes verbatim; elsewhere the same edit of the carrier.
            if (api === "google-interactions") {
              payload.system_instruction = DIFFERENT;
            } else if (api === "google-generative-ai" || api === "google-vertex") {
              (payload.config as Record<string, unknown>).systemInstruction = DIFFERENT;
            } else {
              const { model: _model, ...altered } = alterSpans(plain);
              Object.assign(payload, altered);
            }
            return originalModel;
          },
        });
        return payload;
      });
      expect(outcome.value).toMatchObject(REFUSED);
      expectNoSentinel(outcome);
      expect(sent).toHaveLength(0);
      expect(receipts.at(-1)).toBeUndefined();
    },
  );

  // A hook that keeps the request it returned can edit it once the check has passed, before
  // the transport serializes it. The receipt callback marks that moment deterministically.
  it.each(BUILDERS)(
    "$api: never sends an edit a hook makes to its kept request after the check",
    async ({ api, model }) => {
      const { prompt, spans } = await renderMain();
      let kept: Record<string, unknown> | undefined;
      const receipts: unknown[] = [];
      const checked = wrapStreamFnWithSovereignRequestCheck(streamSimple as StreamFn, {
        sessionAgentId: "main",
        sovereignSpans: () => spans,
        onSovereignVerification: (verification) => {
          receipts.push(verification);
          if (kept) {
            Object.assign(kept, alterSpans(kept));
            kept = undefined;
          }
        },
      });
      const outcome = await send(checked, model, prompt, (payload) => {
        kept = payload;
        return undefined;
      });
      expectNoSentinel(outcome);
      expect(JSON.stringify(sent)).not.toContain("Altered prose");
      if (HOST_ENCODED.has(api)) {
        // The route encodes the kept request through the host and reads the edit in its bytes.
        expect(outcome.value).toMatchObject(REFUSED);
        expect(sent).toHaveLength(0);
        expect(receipts.at(-1)).toBeUndefined();
      } else {
        // The route sends the checked copy, which the hook never held.
        expect(sent).toHaveLength(1);
        expect(JSON.stringify(sent[0])).toContain(SENTINEL);
        expect(receipts.at(-1)).toMatchObject({ result: "final-payload-verified" });
      }
    },
  );

  it.each(["google-generative-ai", "google-vertex"])(
    "%s: refuses an SDK fetch the request supplies, which would send past the check",
    async (api) => {
      const { prompt, spans } = await renderMain();
      const hookFetch = vi.fn<typeof fetch>(async () => new Response("{}", { status: 400 }));
      const receipts: unknown[] = [];
      const outcome = await send(
        checkedBuilder(spans, receipts),
        modelFor(api),
        prompt,
        (payload) => {
          (payload.config as Record<string, unknown>).httpOptions = { fetch: hookFetch };
          return undefined;
        },
      );
      expect(outcome.value).toMatchObject(REFUSED);
      expect(hookFetch).not.toHaveBeenCalled();
      expect(sent).toHaveLength(0);
      expect(receipts.at(-1)).toBeUndefined();
    },
  );

  it("google-generative-ai: carries the platform abort signal in config, and refuses a look-alike", async () => {
    const { prompt, spans } = await renderMain();
    const receipts: unknown[] = [];
    // As on the embedded route, a wrapper inside the check combines the run's signal.
    const combining: StreamFn = (routed, context, options) =>
      streamSimple(routed, context, {
        ...options,
        signal: AbortSignal.any([options!.signal!, new AbortController().signal]),
      });
    const checked = wrapStreamFnWithSovereignRequestCheck(combining, {
      sessionAgentId: "main",
      sovereignSpans: () => spans,
      onSovereignVerification: (verification) => receipts.push(verification),
    });
    const model = modelFor("google-generative-ai");
    const signal = new AbortController().signal;
    const outcome = await send(checked, model, prompt, undefined, { signal });
    expect(outcome.value).toMatchObject({ errorCode: "400" });
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0]!.systemInstruction)).toContain(SENTINEL);
    expect(receipts.at(-1)).toMatchObject({ result: "final-payload-verified" });

    // A signal's prototype with an accessor of its own runs payload code when it is read.
    const lookAlike = await send(
      checked,
      model,
      prompt,
      (payload) => {
        const config = payload.config as Record<string, unknown>;
        config.abortSignal = Object.defineProperty(
          Object.create(AbortSignal.prototype),
          "aborted",
          {
            get: () => false,
          },
        );
        return undefined;
      },
      { signal },
    );
    expect(lookAlike.value).toMatchObject(REFUSED);
    expect(sent).toHaveLength(1);
    expect(receipts.at(-1)).toBeUndefined();
  });

  // Plain data the SDK merges into the body after the checked carrier (finding 2).
  it.each(["google-generative-ai", "google-vertex"])(
    "%s: refuses an SDK extraBody that replaces the checked instruction, and sends a harmless one",
    async (api) => {
      const { prompt, spans } = await renderMain();
      const model = modelFor(api);
      const receipts: unknown[] = [];
      for (const field of ["systemInstruction", "system_instruction"]) {
        const replaced = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => {
          (payload.config as Record<string, unknown>).httpOptions = {
            extraBody: { [field]: { parts: [{ text: DIFFERENT }] } },
          };
          return undefined;
        });
        expect(replaced.value).toMatchObject(REFUSED);
        expectNoSentinel(replaced);
      }
      expect(sent).toHaveLength(0);
      expect(receipts).toEqual([undefined, undefined]);

      const harmless = await send(checkedBuilder(spans, receipts), model, prompt, (payload) => {
        (payload.config as Record<string, unknown>).httpOptions = {
          extraBody: { labels: { fixture: "harmless" } },
        };
        return undefined;
      });
      expect(harmless.value).toMatchObject({ errorCode: "400" });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.labels).toEqual({ fixture: "harmless" });
      expect(JSON.stringify(sent[0]!.systemInstruction)).toContain(SENTINEL);
      expect(receipts.at(-1)).toMatchObject({ result: "final-payload-verified", site: api });
    },
  );

  it("checks the bytes the host encoder returns, and returns those bytes", async () => {
    const { prompt, spans } = await renderMain();
    const model = modelFor("openai-responses");
    const user = { role: "user", content: [{ type: "input_text", text: "Reply OK" }] };
    const bodies: string[] = [];
    const receipts: unknown[] = [];
    // A resend the hook never saw, encoded through the host as OpenAI routes encode.
    const transport: StreamFn = async (routed, _context, options) => {
      const encodeBody = prepareModelRequestBody(options);
      await options?.onPayload?.({ model: routed.id, instructions: prompt, input: [user] }, routed);
      // Its accessor answers an object check's reads with the prompt, then serializes other text.
      let reads = 0;
      const resend = Object.defineProperty({ model: routed.id, input: [user] }, "instructions", {
        enumerable: true,
        get: () => (reads++ < 2 ? prompt : "Altered instructions."),
      });
      bodies.push(Buffer.from((await encodeBody(resend)).body).toString("utf8"));
      await encodeBody({
        model: routed.id,
        instructions: prompt,
        input: [user],
        toJSON: () => ({ model: routed.id, instructions: "Altered instructions.", input: [user] }),
      });
      throw new Error("unreachable");
    };
    const checked = wrapStreamFnWithSovereignRequestCheck(transport, {
      sessionAgentId: "main",
      sovereignSpans: () => spans,
      onSovereignVerification: (verification) => receipts.push(verification),
    });
    await expect(
      checked(model, { systemPrompt: prompt, messages: [] }, { apiKey: "synthetic-key" }),
    ).rejects.toMatchObject({ code: "transform_altered", details: { site: "provider_request" } });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain(SENTINEL);
    expect(bodies[0]).not.toContain("Altered instructions.");
    expect(receipts.map((receipt) => (receipt as { site?: string } | undefined)?.site)).toEqual([
      "openai-responses",
      "openai-responses",
      undefined,
    ]);
  });
});
