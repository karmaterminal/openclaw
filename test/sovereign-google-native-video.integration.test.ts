// The phase-A ruling on Gemini native video under sovereign enforce (openclaw#1321): a
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
import type { SubsystemLogger } from "../src/logging/subsystem.js";
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

// Every subsystem log call a run makes, at any level, whether or not a sink would write it.
const logged = vi.hoisted((): string[] => []);
vi.mock("../src/logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/logging/subsystem.js")>();
  const { inspect } = await import("node:util");
  const recording = (logger: SubsystemLogger): SubsystemLogger => {
    const record =
      (level: "trace" | "debug" | "info" | "warn" | "error" | "fatal") =>
      (message: string, meta?: Record<string, unknown>) => {
        logged.push(inspect([logger.subsystem, level, message, meta], { depth: 8 }));
        logger[level](message, meta);
      };
    return {
      ...logger,
      // Test runs log silently; every level counts as enabled, so each message is built.
      isEnabled: () => true,
      trace: record("trace"),
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
      fatal: record("fatal"),
      raw: (message) => {
        logged.push(inspect([logger.subsystem, "raw", message]));
        logger.raw(message);
      },
      child: (name) => recording(logger.child(name)),
    };
  };
  return {
    ...actual,
    createSubsystemLogger: (subsystem: string) =>
      recording(actual.createSubsystemLogger(subsystem)),
  };
});

const tempDirs = useSovereignTempDirs(afterEach);
// The fixtures use Google's real hosts (native video needs AI Studio), so every request must
// reach the capture; a connection it missed fails the case.
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
const REFUSED_LOG =
  "[SOVEREIGN_PROMPTS_REFUSED] agent:main code=transform_altered site=provider_request";

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
  logged.length = 0;
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
  const send = async (
    messages: Context["messages"],
    signal: AbortSignal = new AbortController().signal,
  ) => {
    const stream = await session.agent.streamFn!(
      model,
      { systemPrompt: prompt, messages },
      { onPayload: session.agent.onPayload, apiKey: "synthetic-key", signal },
    );
    return await stream.result();
  };
  return { send, abort, spans };
}

const googlePlugin = buildGoogleProvider();
/** A catalog model as the Google plugin resolves it, which decides its API and video input. */
function resolveGoogleModel(
  model: Parameters<typeof makeProviderModelFixture>[0],
  config: OpenClawConfig = {},
): Model {
  const catalog = makeProviderModelFixture({ ...model, input: ["text", "image"] });
  return googlePlugin.normalizeResolvedModel!({
    provider: catalog.provider,
    modelId: catalog.id,
    model: catalog,
    config,
  }) as Model;
}
// AI Studio serves a Gemini text model over Interactions unless the operator pins its API.
const geminiApi = resolveGoogleModel(
  {
    id: "gemini-3-pro-preview",
    provider: "google",
    api: "google-generative-ai",
    baseUrl: AI_STUDIO,
  },
  {
    models: {
      providers: { google: { baseUrl: AI_STUDIO, api: "google-generative-ai", models: [] } },
    },
  },
);
const interactions = resolveGoogleModel({
  id: "gemini-3-pro-preview",
  provider: "google",
  api: "google-generative-ai",
  baseUrl: AI_STUDIO,
});
const vertex = resolveGoogleModel({
  id: "gemini-3-pro-preview",
  provider: "google-vertex",
  api: "google-vertex",
  baseUrl: "https://us-central1-aiplatform.googleapis.com",
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

const API: Record<string, string> = {
  "Gemini API": "google-generative-ai",
  Interactions: "google-interactions",
};
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
    async ({ route, model, userParts, text, omitted }) => {
      expect(model).toMatchObject({ api: API[route], input: expect.arrayContaining(["video"]) });
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
      const logs = [...outcome.logs, ...logged].join("\n");
      expect(logs).not.toMatch(/video/i);
      expect(logs).not.toContain(SENTINEL);
      expectNoSentinel(outcome);
    },
  );

  it.each(NATIVE_VIDEO_ROUTES)(
    "$route: an off run sends the native video part unchanged",
    async ({ route, model, userParts, text, native }) => {
      expect(model).toMatchObject({ api: API[route], input: expect.arrayContaining(["video"]) });
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

  // The Vertex route admits no native video (the plugin's model resolution adds video input only
  // for provider `google` on AI Studio), so enforce changes nothing there: in both modes the turn
  // carries the canonical omission the context transform wrote, and never the video.
  it.each(["enforce", "off"] as const)(
    "Vertex: an %s run sends the canonical omission text, never the video",
    async (mode) => {
      expect(vertex.input).not.toContain("video");
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
      // The log capture the video rows read sees the refusal's content-free line.
      expect(logged.join("\n")).toContain(REFUSED_LOG);
      expectNoSentinel(outcome);
    },
  );

  // The plugin's transports materialize video after the check, across the whole request: a part
  // marked as video is replaced, whole, by the omission text (openclaw#1571 review 5966532014).
  // Each hook leaves every instruction text in place and adds only plain data, so the check before
  // materialization passes; the instruction that would have been sent has lost its text.
  const INJECTED_VIDEO = { mimeType: "video/mp4", data: "AA==" };
  type GeminiContent = { parts: Record<string, unknown>[] };
  const besideEachText = (payload: Record<string, unknown>) => {
    for (const part of (payload.systemInstruction as GeminiContent).parts) {
      if (typeof part.text === "string") {
        part.inlineData = INJECTED_VIDEO;
      }
    }
  };
  // The instruction's own text part, shared into the user turn and marked there.
  const sharedWithUserTurn = (payload: Record<string, unknown>) => {
    const userParts = (payload.contents as GeminiContent[])[0]!.parts;
    userParts.push((payload.systemInstruction as GeminiContent).parts[0]!);
    userParts.at(-1)!.inlineData = INJECTED_VIDEO;
  };
  const onInstructionContent = (payload: Record<string, unknown>) => {
    (payload.systemInstruction as Record<string, unknown>).inlineData = INJECTED_VIDEO;
  };
  const GEMINI_INSTRUCTION_EDITS = [
    { mark: "a video beside each instruction text", edit: besideEachText },
    { mark: "the instruction text part shared into the user turn", edit: sharedWithUserTurn },
    { mark: "a video on the instruction content itself", edit: onInstructionContent },
  ];
  it.each([
    ...GEMINI_INSTRUCTION_EDITS.flatMap((row) =>
      [
        { route: "Gemini API", model: geminiApi },
        { route: "Vertex", model: vertex },
      ].map((route) => ({ ...route, ...row, errorCode: "transform_altered" })),
    ),
    // Interactions carries the instruction as a string member of the request itself, so the
    // object a video mark there would replace is the whole request. The wrapper drops the code.
    {
      route: "Interactions",
      model: interactions,
      mark: "a video type on the request that carries the instruction",
      errorCode: undefined,
      edit: (payload: Record<string, unknown>) => {
        payload.type = "video";
      },
    },
  ])("$route: $mark sends nothing", async ({ model, errorCode, edit }) => {
    const { send } = await composeAttempt({
      config: writeAgent("enforce"),
      model,
      plugin: googlePlugin,
    });
    hook = (payload) => {
      edit(payload);
      return undefined;
    };

    const outcome = await capture(() => send(TEXT_TURN));
    // The instruction each send carried, had one gone out: the omission text in its place.
    expect(sent.map(({ body }) => body.systemInstruction ?? body.system_instruction)).toEqual([]);
    expect(verification).toBeUndefined();
    expect(outcome.value).toMatchObject(errorCode ? { ...REFUSED, errorCode } : REFUSED);
    expect(logged.join("\n")).toContain(REFUSED_LOG);
    expectNoSentinel(outcome);
  });

  // Materialization still omits a video a hook adds where it does not take the instruction with
  // it: in the user turn, or as a part of its own beside the instruction text, which the check
  // passes like any text a hook adds around the spans.
  it.each([
    {
      route: "Gemini API",
      model: geminiApi,
      instruction: (body: Record<string, unknown>) => body.systemInstruction,
      edit: (payload: Record<string, unknown>) => {
        (payload.contents as GeminiContent[])[0]!.parts.push({ inlineData: INJECTED_VIDEO });
        (payload.systemInstruction as GeminiContent).parts.push({ inlineData: INJECTED_VIDEO });
      },
      userParts: [{ text: "Reply OK" }, { text: VIDEO_OMITTED }],
    },
    {
      route: "Vertex",
      model: vertex,
      instruction: (body: Record<string, unknown>) => body.systemInstruction,
      edit: (payload: Record<string, unknown>) => {
        (payload.contents as GeminiContent[])[0]!.parts.push({ inlineData: INJECTED_VIDEO });
        (payload.systemInstruction as GeminiContent).parts.push({ inlineData: INJECTED_VIDEO });
      },
      userParts: [{ text: "Reply OK" }, { text: VIDEO_OMITTED }],
    },
    {
      route: "Interactions",
      model: interactions,
      instruction: (body: Record<string, unknown>) => body.system_instruction,
      edit: (payload: Record<string, unknown>) => {
        const [step] = payload.input as { content: unknown[] }[];
        step!.content.push({ type: "video", mime_type: "video/mp4", data: "AA==" });
      },
      userParts: [
        { type: "text", text: "Reply OK" },
        { type: "text", text: VIDEO_OMITTED },
      ],
    },
  ])(
    "$route: a video a hook adds beside the instruction is omitted and the request is sent",
    async ({ model, instruction, edit, userParts }) => {
      const { send } = await composeAttempt({
        config: writeAgent("enforce"),
        model,
        plugin: googlePlugin,
      });
      hook = (payload) => {
        edit(payload);
        return undefined;
      };

      await send(TEXT_TURN);
      expect(sent).toHaveLength(1);
      const { body } = sent[0]!;
      expect(
        model.api === "google-interactions" ? interactionsParts(body) : geminiParts(body),
      ).toEqual(userParts);
      expect(JSON.stringify(instruction(body))).toContain(SENTINEL);
      expect(withoutOmission(body)).not.toMatch(/video|AA==/i);
      expect(verification).toMatchObject({ result: "final-payload-verified", site: model.api });
    },
  );

  // Only the Google SDK builder merges `config.httpOptions.extraBody` into the body it serializes
  // (openclaw#1571 review 5964056490, finding 2); the plugin's REST and Interactions routes send
  // the plain body. An extra body naming the instruction, by either JSON name, sends nothing.
  it("Vertex SDK builder: an extraBody naming the instruction sends nothing; a harmless one is sent", async () => {
    const { send } = await composeAttempt({
      config: writeAgent("enforce"),
      model: vertexSdk,
      plugin: fixturePlugin,
    });
    const extraBody = (body: Record<string, unknown>) => (payload: Record<string, unknown>) => {
      (payload.config as Record<string, unknown>).httpOptions = { extraBody: body };
      return payload;
    };
    for (const field of ["systemInstruction", "system_instruction"]) {
      hook = extraBody({ [field]: { parts: [{ text: DIFFERENT }] } });
      const outcome = await capture(() => send(TEXT_TURN));
      expect(outcome.value).toMatchObject({ ...REFUSED, errorCode: "transform_altered" });
      expect(verification).toBeUndefined();
      expectNoSentinel(outcome);
    }
    expect(sent).toHaveLength(0);
    expect(logged.join("\n")).toContain(REFUSED_LOG);

    hook = extraBody({ labels: { fixture: "harmless" } });
    await send(TEXT_TURN);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body.labels).toEqual({ fixture: "harmless" });
    expect(JSON.stringify(sent[0]!.body.systemInstruction)).toContain(SENTINEL);
    expect(JSON.stringify(sent[0]!.body)).not.toContain(DIFFERENT);
    expect(verification).toMatchObject({ result: "final-payload-verified", site: "google-vertex" });
  });

  // Cancellation crosses the check. Inside it, the embedded stream composes the run's signal with
  // the caller's, which the check passes on. A transport takes the composed signal from its
  // options (the plugin routes) or, on the SDK builder, from the detached copy's config. An abort
  // from either source must reach the request on the wire.
  const CANCEL_ROUTES = [
    { route: "Gemini API", model: geminiApi, plugin: googlePlugin },
    { route: "Vertex", model: vertex, plugin: googlePlugin },
    { route: "Interactions", model: interactions, plugin: googlePlugin },
    { route: "Vertex SDK builder", model: vertexSdk, plugin: fixturePlugin },
  ];
  it.each(
    CANCEL_ROUTES.flatMap((row) =>
      (["run", "caller"] as const).map((source) => ({ ...row, source })),
    ),
  )(
    "$route: aborting the $source signal mid-send cancels the request and sends nothing further",
    async ({ model, plugin, source }) => {
      const { send, abort } = await composeAttempt({
        config: writeAgent("enforce"),
        model,
        plugin,
      });
      const caller = new AbortController();
      afterSend = () => (source === "run" ? abort : caller).abort();

      const outcome = await capture(() => send(TEXT_TURN, caller.signal));
      expect(sent).toHaveLength(1);
      expect(sent[0]!.signal.aborted).toBe(true);
      expect(JSON.stringify(sent[0]!.body)).toContain(SENTINEL);
      expect(verification).toMatchObject({ result: "final-payload-verified", site: model.api });
      expect(outcome.value).toMatchObject({ stopReason: "aborted" });
      // No retry, key rotation or later call of the canceled run reaches the network.
      const later = await capture(() => send(TEXT_TURN, caller.signal));
      expect(sent).toHaveLength(1);
      expectNoSentinel(outcome);
      expectNoSentinel(later);
    },
  );
});
