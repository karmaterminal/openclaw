// 🌻's phase-A ruling on Gemini native video under sovereign enforce (openclaw#1321): a
// self-serializing transport is handed a detached copy of the checked request, so an enforce
// run's native video cannot be restored by its placeholder. It must reach the model as the
// transport's omission text, in the request itself, and nothing may claim the video was
// received. The real embedded transport preparation runs the real Google plugin here, which a
// core test cannot load in its own module graph.
import fs from "node:fs";
import path from "node:path";
import { configureAiTransportHost, getAiTransportHost } from "@openclaw/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGoogleProvider } from "../extensions/google/api.js";
import { prepareEmbeddedAttemptTransport } from "../src/agents/embedded-agent-runner/run/attempt-stream-settle.js";
import { hydratePromptMediaMessages } from "../src/agents/embedded-agent-runner/run/images.js";
import type { EmbeddedRunAttemptParams } from "../src/agents/embedded-agent-runner/run/types.js";
import { createResourceLoader } from "../src/agents/sessions/agent-session-loop-resource-loader.test-support.js";
import { AuthStorage } from "../src/agents/sessions/auth-storage.js";
import type { ExtensionFactory } from "../src/agents/sessions/extensions/types.js";
import { convertToLlm } from "../src/agents/sessions/messages.js";
import { ModelRegistry } from "../src/agents/sessions/model-registry.js";
import { createAgentSession } from "../src/agents/sessions/sdk.js";
import { SessionManager } from "../src/agents/sessions/session-manager.js";
import { SettingsManager } from "../src/agents/sessions/settings-manager.js";
import {
  resetSovereignPromptRuntimeForTests,
  type SovereignPromptSpans,
} from "../src/agents/sovereign-prompts/runtime.js";
import {
  capture,
  expectNoSentinel,
  SENTINEL,
  sovereignAgentsConfig,
  useDeniedNetworkEgress,
  useSovereignTempDirs,
  writeAgentGeneration,
} from "../src/agents/sovereign-prompts/sovereign-fixture.test-support.js";
import { buildConfiguredAgentSystemPrompt } from "../src/agents/system-prompt-config.js";
import { makeProviderModelFixture } from "../src/agents/test-helpers/provider-model-fixture.js";
import type { OpenClawConfig } from "../src/config/types.js";
import type { Context, Model } from "../src/llm/types.js";
import { resetSovereignRedactionForTests } from "../src/logging/sovereign-redaction.js";
import { attachModelProviderRuntimePluginHandle } from "../src/plugins/provider-hook-runtime.js";
import type { ProviderPlugin } from "../src/plugins/types.js";
import { buildPersistedUserTurnMessage } from "../src/sessions/user-turn-transcript.js";
import { captureEnv, setTestEnvValue } from "../src/test-utils/env.js";

// The Google plugin's REST route sends through its own guarded fetch; it records here too.
const guardedFetch = vi.hoisted(() => ({ record: undefined as typeof fetch | undefined }));
vi.mock("../src/agents/provider-transport-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/agents/provider-transport-fetch.js")>()),
  buildGuardedModelFetch: (): typeof fetch => (input, init) => guardedFetch.record!(input, init),
}));

const tempDirs = useSovereignTempDirs(afterEach);
// The fixtures use Google's real hosts (native video needs AI Studio): every request must reach
// the capture, and a missed one fails instead of leaving the process.
useDeniedNetworkEgress(beforeEach, afterEach);

const WORKSPACE = "/openclaw-sovereign-fixture/workspace";
const MP4 = Buffer.from("0000001c6674797069736f6d0000000069736f6d0000000000000000", "hex");
const VIDEO = MP4.toString("base64");
const VIDEO_OMITTED = "(video omitted: native video slot unavailable)";
const VERTEX_OMITTED = "(video omitted: provider does not support native video)";
const AI_STUDIO = "https://generativelanguage.googleapis.com/v1beta";
/** The refusal as the run ends: the transport redacts its `key=value` text. */
const REFUSED = {
  stopReason: "error",
  errorMessage: expect.stringMatching(/^sovereign prompts refused: /),
};

/** Each request that reached the network edge, with the signal it was sent under. */
let sent: { body: Record<string, unknown>; signal: AbortSignal }[] = [];
let afterSend: (() => void) | undefined;
let hook: ((payload: Record<string, unknown>) => Record<string, unknown> | undefined) | undefined;
let verification: unknown;
let originalHost: ReturnType<typeof getAiTransportHost>;
let env: ReturnType<typeof captureEnv>;

beforeEach(() => {
  env = captureEnv(["OPENCLAW_STATE_DIR", "GOOGLE_CLOUD_PROJECT"]);
  setTestEnvValue("GOOGLE_CLOUD_PROJECT", "openclaw-fixture-project");
  sent = [];
  afterSend = undefined;
  hook = undefined;
  verification = undefined;
  originalHost = getAiTransportHost();
  const record: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    // As a real fetch: an aborted signal sends nothing, and an abort in flight rejects.
    request.signal.throwIfAborted();
    sent.push({
      body: JSON.parse(await request.text()) as Record<string, unknown>,
      signal: request.signal,
    });
    afterSend?.();
    request.signal.throwIfAborted();
    return new Response(JSON.stringify({ error: { code: 400, message: "fixture rejection" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };
  configureAiTransportHost({ ...originalHost, buildModelFetch: () => record });
  guardedFetch.record = record;
  vi.stubGlobal("fetch", record);
});

afterEach(() => {
  env.restore();
  configureAiTransportHost(originalHost);
  vi.unstubAllGlobals();
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

function writeAgent(mode: "enforce" | "off") {
  const agentDir = tempDirs.make("openclaw-sovereign-video-agent-");
  writeAgentGeneration(agentDir, "main");
  return sovereignAgentsConfig({ main: { agentDir, mode } }) as OpenClawConfig;
}

async function render(config: OpenClawConfig) {
  let spans: SovereignPromptSpans | undefined;
  const prompt = await buildConfiguredAgentSystemPrompt({
    config,
    agentId: "main",
    workspaceDir: WORKSPACE,
    toolNames: ["exec"],
    onRenderedSovereignSpans: (rendered) => {
      spans = rendered;
    },
  });
  return { prompt, spans };
}

/**
 * A user turn with a video in the media store, as the stream receives it: the attempt's context
 * transform hydrates each turn's media first (attempt-setup.ts), and a native video route's
 * provider handoff then restores the video itself.
 */
async function writeVideoTurn(model: Model): Promise<Context["messages"]> {
  const stateDir = tempDirs.make("openclaw-sovereign-video-state-");
  fs.mkdirSync(path.join(stateDir, "media", "inbound"), { recursive: true });
  fs.writeFileSync(path.join(stateDir, "media", "inbound", "clip.mp4"), MP4);
  setTestEnvValue("OPENCLAW_STATE_DIR", stateDir);
  const turn = buildPersistedUserTurnMessage({
    text: "Describe the clip",
    media: [
      {
        kind: "video",
        contentType: "video/mp4",
        sizeBytes: MP4.length,
        url: "media://inbound/clip.mp4",
      },
    ],
    timestamp: 1,
  });
  return convertToLlm(
    await hydratePromptMediaMessages([turn], {
      workspaceDir: WORKSPACE,
      model,
      workspaceOnly: true,
    }),
  );
}

/** A session `before_provider_request` handler, registered as session extensions do. */
const hookExtension: ExtensionFactory = (api) =>
  api.on("before_provider_request", (event) => hook?.(event.payload as Record<string, unknown>));

/** Prepares an attempt's transport as an embedded run does; `abort` cancels the run. */
async function composeAttempt(params: {
  config: OpenClawConfig;
  model: Model;
  plugin: ProviderPlugin;
}) {
  const { model } = params;
  const { prompt, spans } = await render(params.config);
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(model.provider, "synthetic-key");
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const { session } = await createAgentSession({
    systemPrompt: prompt,
    model,
    thinkingLevel: "off",
    tools: [],
    resourceLoader: await createResourceLoader(hookExtension),
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    modelRegistry: ModelRegistry.inMemory(authStorage),
  });
  const abort = new AbortController();
  const handle = { provider: model.provider, plugin: params.plugin };
  await prepareEmbeddedAttemptTransport({
    attempt: {
      runId: "sovereign-video-run",
      sessionId: "sovereign-video-session",
      sessionKey: "agent:main:sovereign-video",
      provider: model.provider,
      modelId: model.id,
      model: attachModelProviderRuntimePluginHandle(model, handle),
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
    getProviderRuntimeHandle: () => handle,
    sandboxSessionKey: "agent:main:sovereign-video",
    codeModeControlsEnabled: false,
    sovereignSpans: () => spans,
    onSovereignVerification: (result) => {
      verification = result;
    },
    providerPromptState: { state: {}, effectiveContextTokenBudget: 200_000 },
  });
  // The agent loop hands its `onPayload` (the `before_provider_request` emitter) and its own
  // signal to each call; the embedded stream composes the run's signal with it.
  const send = async (messages: Context["messages"]) => {
    const stream = await session.agent.streamFn!(
      model,
      { systemPrompt: prompt, messages },
      {
        onPayload: session.agent.onPayload,
        apiKey: "synthetic-key",
        signal: new AbortController().signal,
      },
    );
    return await stream.result();
  };
  return { send, abort, spans };
}

const googlePlugin = buildGoogleProvider();
// The Google plugin's model resolution adds video for Gemini on AI Studio; canonical model
// types omit it.
const VIDEO_INPUT = ["text", "image", "video"] as unknown as Model["input"];
const geminiApi = makeProviderModelFixture({
  id: "gemini-3-pro-preview",
  provider: "google",
  api: "google-generative-ai",
  baseUrl: AI_STUDIO,
  input: VIDEO_INPUT,
});
const interactions = makeProviderModelFixture({
  id: "gemini-3-pro-preview",
  provider: "google",
  api: "google-interactions",
  baseUrl: AI_STUDIO,
  input: VIDEO_INPUT,
});
const vertex = makeProviderModelFixture({
  id: "gemini-3-pro-preview",
  provider: "google-vertex",
  api: "google-vertex",
  baseUrl: "https://us-central1-aiplatform.googleapis.com",
  input: VIDEO_INPUT,
});

// No plugin serves this provider, so the built-in Google SDK builder sends it, with the run's
// composed abort signal in its config. The reserved `.test` host stays off the network.
const fixturePlugin: ProviderPlugin = {
  id: "fixture-provider",
  label: "Fixture provider",
  auth: [],
};
const vertexSdk = makeProviderModelFixture({
  id: "gemini-3-pro-preview",
  provider: "fixture-provider",
  api: "google-vertex",
  baseUrl: "https://vertex.fixture.test/v1",
});

const geminiParts = (body: Record<string, unknown>) =>
  (body.contents as { parts: unknown[] }[])[0]!.parts;
const interactionsParts = (body: Record<string, unknown>) =>
  (body.input as { content: unknown[] }[])[0]!.content;

/** The Google plugin's transports that restore native video by its placeholder. */
const NATIVE_VIDEO_ROUTES = [
  {
    route: "Gemini API",
    model: geminiApi,
    userParts: geminiParts,
    text: { text: "Describe the clip" },
    native: { inlineData: { mimeType: "video/mp4", data: VIDEO } },
    omitted: { text: VIDEO_OMITTED },
  },
  {
    route: "Interactions",
    model: interactions,
    userParts: interactionsParts,
    text: { type: "text", text: "Describe the clip" },
    native: { type: "video", mime_type: "video/mp4", data: VIDEO },
    omitted: { type: "text", text: VIDEO_OMITTED },
  },
];

/** What a request says once the omission text is taken out of it. */
const withoutOmission = (body: Record<string, unknown>) =>
  JSON.stringify(body).replaceAll(VIDEO_OMITTED, "");

describe.skipIf(process.platform === "win32")("sovereign enforce: Google native video", () => {
  it.each(NATIVE_VIDEO_ROUTES)(
    "$route: an enforce run's video reaches the model as the omission text, never as video",
    async ({ model, userParts, text, omitted }) => {
      const messages = await writeVideoTurn(model);
      const { send } = await composeAttempt({
        config: writeAgent("enforce"),
        model,
        plugin: googlePlugin,
      });

      const outcome = await capture(() => send(messages));
      expect(sent).toHaveLength(1);
      const { body } = sent[0]!;
      expect(userParts(body)).toEqual([text, omitted]);
      // The checked instruction went out with the omission. Nothing else in the request speaks
      // of the video: neither its bytes nor any claim that it was received or inspected.
      expect(JSON.stringify(body)).toContain(SENTINEL);
      expect(withoutOmission(body)).not.toMatch(/video/i);
      expect(verification).toEqual({
        result: "final-payload-verified",
        route: "openclaw",
        boundary: "provider_request",
        site: model.api,
      });
      expect(outcome.logs.join("\n")).not.toMatch(/video/i);
      expectNoSentinel(outcome);
    },
  );

  it.each(NATIVE_VIDEO_ROUTES)(
    "$route: an off run sends the native video part unchanged",
    async ({ model, userParts, text, native }) => {
      const messages = await writeVideoTurn(model);
      const { send, spans } = await composeAttempt({
        config: writeAgent("off"),
        model,
        plugin: googlePlugin,
      });
      expect(spans).toBeUndefined();

      await send(messages);
      expect(sent).toHaveLength(1);
      expect(userParts(sent[0]!.body)).toEqual([text, native]);
      expect(JSON.stringify(sent[0]!.body)).not.toContain(VIDEO_OMITTED);
      expect(verification).toBeUndefined();
    },
  );

  // The Vertex route admits no native video (the plugin adds video input only for provider
  // `google` on AI Studio), so enforce changes nothing there: in both modes the turn carries the
  // canonical omission the context transform wrote, and never the video.
  it.each(["enforce", "off"] as const)(
    "Vertex: an %s run sends the canonical omission text, never the video",
    async (mode) => {
      const messages = await writeVideoTurn(vertex);
      const { send } = await composeAttempt({
        config: writeAgent(mode),
        model: vertex,
        plugin: googlePlugin,
      });

      await send(messages);
      expect(sent).toHaveLength(1);
      const { body } = sent[0]!;
      expect(geminiParts(body)).toEqual([{ text: "Describe the clip" }, { text: VERTEX_OMITTED }]);
      expect(JSON.stringify(body).replaceAll(VERTEX_OMITTED, "")).not.toMatch(/video/i);
      expect(verification).toEqual(
        mode === "enforce" ? expect.objectContaining({ site: "google-vertex" }) : undefined,
      );
    },
  );

  const TEXT_TURN: Context["messages"] = [{ role: "user", content: "Reply OK", timestamp: 1 }];
  const DIFFERENT = "Different system instructions";

  // A request member the transport reads after the check could run code there (openclaw#1571
  // review 5964056490, finding 1). The getter edits only once this send's check has passed, so
  // earlier reads by the outer chain cannot trip it first; the plugin serializes `contents` and
  // `model` before the instruction.
  it.each([
    {
      route: "Gemini API",
      model: geminiApi,
      errorCode: "transform_altered",
      sibling: "contents",
      edit: (payload: Record<string, unknown>) => {
        payload.systemInstruction = { parts: [{ text: DIFFERENT }] };
      },
    },
    {
      route: "Vertex",
      model: vertex,
      errorCode: "transform_altered",
      sibling: "contents",
      edit: (payload: Record<string, unknown>) => {
        payload.systemInstruction = { parts: [{ text: DIFFERENT }] };
      },
    },
    {
      route: "Interactions",
      model: interactions,
      // The plugin's Interactions wrapper rethrows the stream's error as a plain Error, which
      // drops its code (follow-up); the refusal and the empty wire hold.
      errorCode: undefined,
      sibling: "model",
      edit: (payload: Record<string, unknown>) => {
        payload.system_instruction = DIFFERENT;
      },
    },
  ])(
    "$route: a sibling getter that edits the instruction after the check sends nothing",
    async ({ model, errorCode, sibling, edit }) => {
      const { send } = await composeAttempt({
        config: writeAgent("enforce"),
        model,
        plugin: googlePlugin,
      });
      hook = (payload) => {
        const value = payload[sibling];
        return Object.defineProperty(payload, sibling, {
          enumerable: true,
          configurable: true,
          get() {
            if (verification) {
              edit(payload);
            }
            return value;
          },
        });
      };

      const outcome = await capture(() => send(TEXT_TURN));
      expect(outcome.value).toMatchObject(errorCode ? { ...REFUSED, errorCode } : REFUSED);
      expect(sent).toHaveLength(0);
      expect(verification).toBeUndefined();
      expectNoSentinel(outcome);
    },
  );

  // Cancellation crosses the check: the run's abort reaches the request on the wire, whether the
  // transport takes the signal from its options (the plugin routes) or, on the SDK builder, from
  // the detached copy's config, where the embedded stream composed it with the caller's signal.
  it.each([
    { route: "Gemini API", model: geminiApi, plugin: googlePlugin },
    { route: "Vertex", model: vertex, plugin: googlePlugin },
    { route: "Interactions", model: interactions, plugin: googlePlugin },
    { route: "Vertex SDK builder", model: vertexSdk, plugin: fixturePlugin },
  ])(
    "$route: aborting the run mid-send cancels the request and sends nothing further",
    async ({ model, plugin }) => {
      const { send, abort } = await composeAttempt({
        config: writeAgent("enforce"),
        model,
        plugin,
      });
      afterSend = () => abort.abort();

      const outcome = await capture(() => send(TEXT_TURN));
      expect(sent).toHaveLength(1);
      expect(sent[0]!.signal.aborted).toBe(true);
      expect(JSON.stringify(sent[0]!.body)).toContain(SENTINEL);
      expect(verification).toMatchObject({ result: "final-payload-verified", site: model.api });
      expect(outcome.value).toMatchObject({ stopReason: "aborted" });
      // No retry, key rotation or later call of the canceled run reaches the network.
      const later = await capture(() => send(TEXT_TURN));
      expect(sent).toHaveLength(1);
      expectNoSentinel(outcome);
      expectNoSentinel(later);
    },
  );
});
