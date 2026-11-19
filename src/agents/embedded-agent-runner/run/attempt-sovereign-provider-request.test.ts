// Final-payload enforcement on the embedded route (#1321): the real transport preparation
// installs the sovereign check under the session's `before_provider_request` hook and a
// provider plugin's `wrapStreamFn`, so it sees what they leave, and a refused request
// never reaches the network.
import { configureAiTransportHost, getAiTransportHost } from "@openclaw/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUMMARIZATION_SYSTEM_PROMPT } from "../../../../packages/agent-core/src/harness/compaction/summarization-prompts.js";
import type { OpenClawConfig } from "../../../config/types.js";
import type { Model } from "../../../llm/types.js";
import { resetSovereignRedactionForTests } from "../../../logging/sovereign-redaction.js";
import { attachModelProviderRuntimePluginHandle } from "../../../plugins/provider-hook-runtime.js";
import type { ProviderPlugin } from "../../../plugins/types.js";
import { createResourceLoader } from "../../sessions/agent-session-loop-resource-loader.test-support.js";
import { AuthStorage } from "../../sessions/auth-storage.js";
import type { ExtensionFactory } from "../../sessions/extensions/types.js";
import { getModelRegistryRuntime } from "../../sessions/model-registry-runtime.js";
import { ModelRegistry } from "../../sessions/model-registry.js";
import { createAgentSession } from "../../sessions/sdk.js";
import { SessionManager } from "../../sessions/session-manager.js";
import { SettingsManager } from "../../sessions/settings-manager.js";
import {
  resetSovereignPromptRuntimeForTests,
  type SovereignPromptSpans,
} from "../../sovereign-prompts/runtime.js";
import {
  capture,
  expectNoSentinel,
  SENTINEL,
  sovereignAgentsConfig,
  useDeniedNetworkEgress,
  useSovereignTempDirs,
  writeAgentGeneration,
} from "../../sovereign-prompts/sovereign-fixture.test-support.js";
import { buildConfiguredAgentSystemPrompt } from "../../system-prompt-config.js";
import { makeProviderModelFixture } from "../../test-helpers/provider-model-fixture.js";
import { prepareCompactionSessionAgent } from "../compaction-session-agent.js";
import { prepareEmbeddedAttemptTransport } from "./attempt-stream-settle.js";
import type { EmbeddedRunAttemptParams } from "./types.js";

const tempDirs = useSovereignTempDirs(afterEach);
// Every request must reach the capture below; a connection it missed fails the case.
useDeniedNetworkEgress(beforeEach, afterEach);
const WORKSPACE = "/openclaw-sovereign-fixture/workspace";
/** The refusal as the run ends: the code survives, the transport redacts `key=value` text. */
const REFUSED = {
  stopReason: "error",
  errorCode: "transform_altered",
  errorMessage: expect.stringMatching(/^sovereign prompts refused: /),
};

type Edit = (payload: Record<string, unknown>) => Record<string, unknown> | undefined;
/** Mutable per-test behavior of the synthetic hook and provider wrapper. */
const edits: { hook?: Edit; provider?: Edit } = {};
/** Every request that reached the network edge, as the provider would receive it. */
let sent: Record<string, unknown>[] = [];
/** Scripted provider replies; the default rejects without asking for a resend. */
let replies: unknown[] = [];
let afterSend: (() => void) | undefined;
let originalHost: ReturnType<typeof getAiTransportHost>;

beforeEach(() => {
  verification = undefined;
  sent = [];
  replies = [];
  afterSend = undefined;
  edits.hook = undefined;
  edits.provider = undefined;
  originalHost = getAiTransportHost();
  const record: typeof fetch = async (input, init) => {
    sent.push(JSON.parse(await new Request(input, init).text()) as Record<string, unknown>);
    afterSend?.();
    const reply = replies.shift() ?? { error: { type: "invalid_request_error" } };
    return new Response(JSON.stringify(reply), {
      status: 400,
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

/** Renders `agentId`'s prompt through the chokepoint and keeps the spans it placed. */
async function render(config: OpenClawConfig, agentId: string) {
  let spans: SovereignPromptSpans | undefined;
  const prompt = await buildConfiguredAgentSystemPrompt({
    config,
    agentId,
    workspaceDir: WORKSPACE,
    toolNames: ["exec"],
    onRenderedSovereignSpans: (rendered) => {
      spans = rendered;
    },
  });
  return { prompt, spans };
}

function writeAgents(mainMode: "enforce" | "off" = "enforce") {
  const mainDir = tempDirs.make("openclaw-sovereign-request-main-");
  const otherDir = tempDirs.make("openclaw-sovereign-request-other-");
  writeAgentGeneration(mainDir, "main");
  writeAgentGeneration(otherDir, "other", {
    files: { "identity-section.md": `${SENTINEL} The other agent's identity. ${SENTINEL}\n` },
  });
  return sovereignAgentsConfig({
    main: { agentDir: mainDir, mode: mainMode },
    other: { agentDir: otherDir, mode: "enforce" },
  }) as OpenClawConfig;
}

/** Edits a provider plugin applies through its documented `wrapStreamFn` hook. */
const providerPlugin: ProviderPlugin = {
  id: "fixture-provider",
  label: "Fixture provider",
  auth: [],
  wrapStreamFn:
    ({ streamFn }) =>
    (model, context, options) =>
      streamFn!(model, context, {
        ...options,
        onPayload: async (payload, payloadModel) => {
          const replaced = await options?.onPayload?.(payload, payloadModel);
          const current = (replaced ?? payload) as Record<string, unknown>;
          return edits.provider?.(current) ?? replaced;
        },
      }),
};

/** A session `before_provider_request` handler, registered as session extensions do. */
const hookExtension: ExtensionFactory = (api) =>
  api.on("before_provider_request", (event) =>
    edits.hook?.(event.payload as Record<string, unknown>),
  );

async function createSession(model: Model, systemPrompt: string) {
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(model.provider, "synthetic-key");
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const { session } = await createAgentSession({
    systemPrompt,
    model,
    thinkingLevel: "off",
    tools: [],
    resourceLoader: await createResourceLoader(hookExtension),
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    modelRegistry,
  });
  // The agent loop hands its `onPayload` (the `before_provider_request` emitter) to each call.
  const send = async (
    requestSystemPrompt = systemPrompt,
    options: { serviceTier?: "default" | "priority" } = {},
  ) => {
    const stream = await session.agent.streamFn!(
      model,
      {
        systemPrompt: requestSystemPrompt,
        messages: [{ role: "user", content: "Reply OK", timestamp: 1 }],
      },
      { ...options, onPayload: session.agent.onPayload, apiKey: "synthetic-key" },
    );
    return await stream.result();
  };
  return { session, settingsManager, modelRegistry, send };
}

/** The executed result the check last reported for the run's prompt report. */
let verification: unknown;

async function composeAttemptStream(params: {
  config: OpenClawConfig;
  model: Model;
  systemPrompt: string;
  spans: (() => SovereignPromptSpans | undefined) | undefined;
}) {
  const { session, settingsManager, send } = await createSession(params.model, params.systemPrompt);
  const abort = new AbortController();
  await prepareEmbeddedAttemptTransport({
    attempt: {
      runId: "sovereign-request-run",
      sessionId: "sovereign-request-session",
      sessionKey: "agent:main:sovereign-request",
      provider: params.model.provider,
      modelId: params.model.id,
      model: params.model,
      config: params.config,
      resolvedApiKey: "synthetic-key",
      workspaceDir: WORKSPACE,
      runtimePlan: { auth: {}, transport: { resolveExtraParams: () => ({}) } },
    } as unknown as EmbeddedRunAttemptParams,
    session,
    settingsManager,
    providerThinkingLevel: undefined,
    sessionAgentId: "main",
    workspaceDir: WORKSPACE,
    workspaceOnly: true,
    agentDir: WORKSPACE,
    abortSignal: abort.signal,
    getProviderRuntimeHandle: () => ({ provider: params.model.provider, plugin: providerPlugin }),
    sandboxSessionKey: "agent:main:sovereign-request",
    codeModeControlsEnabled: false,
    sovereignSpans: params.spans,
    onSovereignVerification: (result) => {
      verification = result;
    },
    providerPromptState: { state: {}, effectiveContextTokenBudget: 200_000 },
  });
  return { send };
}

/** The compaction session's stream, prepared the way a compaction run prepares it. */
async function composeCompactionStream(params: {
  config: OpenClawConfig;
  model: Model;
  systemPrompt: string;
  spans: SovereignPromptSpans | undefined;
}) {
  const { session, modelRegistry, send } = await createSession(params.model, params.systemPrompt);
  await prepareCompactionSessionAgent({
    session,
    llmRuntime: getModelRegistryRuntime(modelRegistry).llmRuntime,
    providerStreamFn: undefined,
    sessionId: "sovereign-request-session",
    effectiveModel: params.model,
    resolvedApiKey: "synthetic-key",
    authStorage: undefined,
    config: params.config,
    provider: params.model.provider,
    modelId: params.model.id,
    thinkLevel: "off",
    sessionAgentId: "main",
    effectiveWorkspace: WORKSPACE,
    agentDir: WORKSPACE,
    sovereignSpans: params.spans,
  });
  return { send };
}

const anthropicModel = attachModelProviderRuntimePluginHandle(
  makeProviderModelFixture({
    id: "claude-sonnet-4-6",
    provider: "fixture-provider",
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com",
  }),
  { provider: "fixture-provider", plugin: providerPlugin },
);

const responsesModel = attachModelProviderRuntimePluginHandle(
  makeProviderModelFixture({
    id: "gpt-5.6-luna",
    provider: "openai",
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
  }),
  { provider: "openai", plugin: providerPlugin },
);

// No plugin transport serves this API, so the built-in Google SDK builder sends it. The
// reserved `.test` host keeps any request the capture missed off the network.
const vertexModel = attachModelProviderRuntimePluginHandle(
  makeProviderModelFixture({
    id: "gemini-3-pro-preview",
    provider: "fixture-provider",
    api: "google-vertex",
    baseUrl: "https://vertex.fixture.test/v1",
  }),
  { provider: "fixture-provider", plugin: providerPlugin },
);

/** Rewrites the fixture prose wherever the builder placed it. */
const alterSpans = (payload: Record<string, unknown>) =>
  JSON.parse(
    JSON.stringify(payload).replaceAll("Synthetic fixture prose", "Altered prose"),
  ) as Record<string, unknown>;

const systemText = (payload: Record<string, unknown>) => JSON.stringify(payload.system ?? null);

describe.skipIf(process.platform === "win32")("embedded route: provider request check", () => {
  it("sends an unchanged request carrying every span, and re-checks each send", async () => {
    const config = writeAgents();
    const { prompt, spans } = await render(config, "main");
    expect(spans?.instances.length).toBeGreaterThan(0);
    const { send } = await composeAttemptStream({
      config,
      model: anthropicModel,
      systemPrompt: prompt,
      spans: () => spans,
    });

    await send();
    expect(sent).toHaveLength(1);
    for (const instance of spans!.instances) {
      expect(systemText(sent[0]!)).toContain(JSON.stringify(instance).slice(1, -1));
    }
    // The executed result names the route, the boundary and the API builder it read.
    expect(verification).toEqual({
      result: "final-payload-verified",
      route: "openclaw",
      boundary: "provider_request",
      site: "anthropic-messages",
    });

    // A later send through the same chain is checked again: a hook that passed once
    // and then edits the system text is caught before the second request leaves, and
    // the run no longer reports a passed check.
    edits.hook = (payload) => ({ ...payload, system: "You are a different assistant." });
    const outcome = await capture(send);
    expect(outcome.value).toMatchObject(REFUSED);
    expect(sent).toHaveLength(1);
    expect(verification).toBeUndefined();
    expectNoSentinel(outcome);
  });

  it.each([
    {
      name: "a before_provider_request replacement",
      hook: (payload: Record<string, unknown>) => ({
        ...payload,
        system: [{ type: "text", text: "You are a stock assistant." }],
      }),
    },
    {
      name: "a provider wrapStreamFn edit",
      provider: (payload: Record<string, unknown>) => {
        // Edits the hook's editable copy in place, as compat patches do.
        for (const block of payload.system as { text: string }[]) {
          block.text = block.text.replaceAll("Synthetic fixture prose", "Edited prose");
        }
        return payload;
      },
    },
    {
      name: "a request with its system text removed",
      hook: ({ system: _system, ...payload }: Record<string, unknown>) => payload,
    },
  ])("refuses $name before the network, with no content in the refusal", async (testCase) => {
    const config = writeAgents();
    const { prompt, spans } = await render(config, "main");
    edits.hook = testCase.hook;
    edits.provider = testCase.provider;
    const { send } = await composeAttemptStream({
      config,
      model: anthropicModel,
      systemPrompt: prompt,
      spans: () => spans,
    });

    const outcome = await capture(send);
    expect(outcome.value).toMatchObject(REFUSED);
    expect(sent).toHaveLength(0);
    expectNoSentinel(outcome);
  });

  it("refuses another agent's text in the request, and another agent's spans at the check", async () => {
    const config = writeAgents();
    const main = await render(config, "main");
    const other = await render(config, "other");

    // The request carries the other agent's rendered prompt in place of this run's.
    edits.hook = (payload) => ({ ...payload, system: [{ type: "text", text: other.prompt }] });
    const swapped = await composeAttemptStream({
      config,
      model: anthropicModel,
      systemPrompt: main.prompt,
      spans: () => main.spans,
    });
    expect(await swapped.send()).toMatchObject(REFUSED);

    // The check is handed the other agent's spans for this run's agent: refused even
    // though the request carries them intact.
    edits.hook = undefined;
    const misbound = await composeAttemptStream({
      config,
      model: anthropicModel,
      systemPrompt: other.prompt,
      spans: () => other.spans,
    });
    expect(await misbound.send()).toMatchObject(REFUSED);
    expect(sent).toHaveLength(0);
  });

  it("checks OpenAI Responses through the whole chain, including its own resends", async () => {
    const config = writeAgents();
    const { prompt, spans } = await render(config, "main");
    const { send } = await composeAttemptStream({
      config,
      model: responsesModel,
      systemPrompt: prompt,
      spans: () => spans,
    });
    const tierRejection = {
      error: { type: "invalid_request_error", param: "service_tier", message: "Unsupported tier" },
    };

    // The transport resends at a slower tier without calling the hooks again.
    replies = [tierRejection];
    await send(undefined, { serviceTier: "priority" });
    expect(sent.map((request) => request.service_tier)).toEqual(["priority", "default"]);
    expect(JSON.stringify(sent[1])).toContain(SENTINEL);
    expect(verification).toMatchObject({
      result: "final-payload-verified",
      site: "openai-responses",
    });

    // This route resends its own copy, taken after the hooks: a hook that keeps the payload
    // and edits it after the first send cannot reach the resend, which is checked and sent
    // intact. (The built-in provider shares that payload; provider-request.test.ts covers it.)
    sent = [];
    replies = [tierRejection];
    let kept: Record<string, unknown> | undefined;
    edits.hook = (payload) => {
      kept = payload;
      return undefined;
    };
    afterSend = () => {
      if (kept) {
        Object.assign(kept, alterSpans(kept));
      }
    };
    await send(undefined, { serviceTier: "priority" });
    expect(sent).toHaveLength(2);
    expect(JSON.stringify(sent[1])).toContain(SENTINEL);
    expect(JSON.stringify(sent[1])).not.toContain("Altered prose");

    // A provider wrapper edit is refused before the first send.
    sent = [];
    edits.hook = undefined;
    afterSend = undefined;
    edits.provider = alterSpans;
    expect(await send()).toMatchObject(REFUSED);
    expect(sent).toHaveLength(0);
  });

  it("checks the Google SDK request through the whole chain, which sets its own run signal", async () => {
    const config = writeAgents();
    const { prompt, spans } = await render(config, "main");
    const { send } = await composeAttemptStream({
      config,
      model: vertexModel,
      systemPrompt: prompt,
      spans: () => spans,
    });

    // The embedded stream puts the run's signal in the SDK config, past the check.
    await send();
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0]!.systemInstruction)).toContain(SENTINEL);
    expect(verification).toMatchObject({
      result: "final-payload-verified",
      site: "google-vertex",
    });

    // A getter on a sibling field cannot change what the SDK sends. It edits only once the
    // check has passed this send, so earlier reads by the outer chain cannot trip it first.
    verification = undefined;
    edits.provider = (payload) => {
      const model = payload.model;
      return Object.defineProperty(payload, "model", {
        enumerable: true,
        configurable: true,
        get() {
          if (verification) {
            (payload.config as Record<string, unknown>).systemInstruction =
              "Different instructions";
          }
          return model;
        },
      });
    };
    const outcome = await capture(send);
    expect(outcome.value).toMatchObject(REFUSED);
    expect(sent).toHaveLength(1);
    expect(verification).toBeUndefined();
    expectNoSentinel(outcome);
  });

  it("checks compaction's own sovereign requests and passes its summaries", async () => {
    const config = writeAgents();
    const { prompt, spans } = await render(config, "main");
    const { send } = await composeCompactionStream({
      config,
      model: anthropicModel,
      systemPrompt: prompt,
      spans,
    });

    // A summary request carries the code-owned summarizer prompt, not the agent's.
    await send(SUMMARIZATION_SYSTEM_PROMPT);
    expect(sent).toHaveLength(1);

    // A request carrying the agent's prompt (the server compaction endpoint's) is checked.
    edits.provider = (payload) => ({ ...payload, system: "Provider-chosen system text." });
    expect(await send()).toMatchObject(REFUSED);
    expect(sent).toHaveLength(1);
  });

  it("leaves an off agent's request exactly as its hooks shaped it", async () => {
    const config = writeAgents("off");
    const { prompt, spans } = await render(config, "main");
    expect(spans).toBeUndefined();
    edits.hook = (payload) => ({ ...payload, system: "Hook-chosen system text." });
    const { send } = await composeAttemptStream({
      config,
      model: anthropicModel,
      systemPrompt: prompt,
      spans: () => spans,
    });

    await send();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.system).toBe("Hook-chosen system text.");
    expect(verification).toBeUndefined();
  });
});
