// Handoff verification on the Codex route (openclaw#1321, 🌻's ruling (c)). Codex builds the
// provider request inside its binary, so OpenClaw checks the last request it controls: each
// app-server handoff that carries the thread's instructions must carry every span of the
// attempt's own validated render, or refuse before it is written. A reused thread keeps the
// instructions of the handoff that loaded it, so reuse needs that handoff to have passed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";
import type * as AgentHarnessRuntime from "openclaw/plugin-sdk/agent-harness-runtime";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { retainCodexAppServerLiveThread } from "./client-runtime.js";
import { buildCodexAppServerConnectionFingerprint } from "./plugin-app-cache-key.js";
import {
  createAgentLifecycleHarness,
  createParams as createRunAttemptParams,
  setupRunAttemptTestHooks,
  tempDir,
  threadStartResult,
} from "./run-attempt-test-harness.js";
import {
  readCodexAppServerBinding,
  registerCodexTestSessionIdentity,
  sessionBindingIdentity,
  testCodexAppServerBindingStore,
  writeCodexAppServerBinding,
} from "./session-binding.test-helpers.js";
import {
  GENERATION,
  SENTINEL,
  SOVEREIGN_BODIES,
  STOCK_IDENTITY,
  fixtureBody,
  writeSovereignGeneration,
} from "./sovereign-generation.test-support.js";
import {
  startOrResumeAttemptThreadWithoutSkills,
  type CodexAttemptThreadInput,
} from "./thread-lifecycle.test-fixtures.js";

/** Per-test faults injected at the seams between the validated render and the handoff. */
const seams = vi.hoisted(() => ({
  /** OpenClaw code that changes the base after its render, or hands another agent's. */
  edit: undefined as "alter" | "other-agent" | undefined,
  /** A handoff path that skips the check, so the thread's instructions are unverified. */
  unchecked: false,
  /** The developer policy refresh loses its policy text after the resume was checked. */
  emptyRefresh: false,
}));

vi.mock("./thread-policy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./thread-policy.js")>();
  return {
    ...actual,
    refreshCodexThreadPolicy: (params: Parameters<typeof actual.refreshCodexThreadPolicy>[0]) =>
      actual.refreshCodexThreadPolicy(
        seams.emptyRefresh
          ? { ...params, developerInstructions: "<thread_policy>\n\n</thread_policy>" }
          : params,
      ),
  };
});

vi.mock("openclaw/plugin-sdk/agent-harness-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof AgentHarnessRuntime>();
  return {
    ...actual,
    buildAgentHarnessBasePrompt: (
      params: Parameters<typeof actual.buildAgentHarnessBasePrompt>[0],
    ) => {
      if (seams.edit === "other-agent") {
        return actual.buildAgentHarnessBasePrompt({ ...params, agentId: "other" });
      }
      const text = actual.buildAgentHarnessBasePrompt(params);
      return seams.edit === "alter"
        ? text.replaceAll("Synthetic fixture prose", "Altered prose")
        : text;
    },
    checkSovereignPromptHandoff: (
      params: Parameters<typeof actual.checkSovereignPromptHandoff>[0],
    ) => (seams.unchecked ? undefined : actual.checkSovereignPromptHandoff(params)),
  };
});

setupRunAttemptTestHooks({ isolateNativeSkillHome: true });

const PREFLIGHT = ["config/read", "configRequirements/read"];
const IDENTITY = SOVEREIGN_BODIES["identity-section.md"]!;
const verification = (site: string) => ({
  result: "handoff-verified",
  route: "codex",
  boundary: "app_server_handoff",
  site,
});

let agentsRoot = "";
let mainSetDigest = "";
// The process loads each generation once, so one config serves every case in this file.
let config: NonNullable<CodexAttemptThreadInput["params"]["config"]>;

beforeAll(() => {
  agentsRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "openclaw-codex-handoff-"));
  const agentDir = (agentId: string) => {
    const dir = path.join(agentsRoot, agentId);
    fs.mkdirSync(dir, { mode: 0o700 });
    return dir;
  };
  const main = agentDir("main");
  mainSetDigest = writeSovereignGeneration(main, "main").setDigest;
  const other = agentDir("other");
  writeSovereignGeneration(other, "other", {
    ...SOVEREIGN_BODIES,
    "identity-section.md": fixtureBody("the other agent's identity"),
  });
  config = {
    agents: {
      entries: {
        main: { agentDir: main, sovereignPrompts: { mode: "enforce" } },
        other: { agentDir: other, sovereignPrompts: { mode: "enforce" } },
        off: { agentDir: agentDir("off"), sovereignPrompts: { mode: "off" } },
        plain: { agentDir: agentDir("plain") },
      },
    },
  };
});

afterAll(() => {
  fs.rmSync(agentsRoot, { recursive: true, force: true });
});

function appServerOptions(): CodexAttemptThreadInput["appServer"] {
  return {
    start: { transport: "stdio", command: "codex", args: ["app-server"], headers: {} },
    requestTimeoutMs: 60_000,
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    codeModeOnly: false,
    loopDetectionPreToolUseRelay: true,
    connectionClass: "local-loopback",
  };
}

function attempt(agentId: string, session = "session-1", incognito = false) {
  const sessionFile = path.join(tempDir, `${agentId}-${session}.jsonl`);
  const workspaceDir = path.join(tempDir, "workspace");
  const sessionKey = incognito
    ? `agent:${agentId}:dashboard:incognito-${session}`
    : `agent:${agentId}:${session}`;
  const params = createRunAttemptParams(sessionFile, workspaceDir, { sessionKey });
  params.agentId = agentId;
  params.config = config;
  params.disableTools = false;
  return { params, sessionFile, workspaceDir };
}

function start(
  client: CodexAttemptThreadInput["client"],
  input: ReturnType<typeof attempt>,
  overrides: Partial<CodexAttemptThreadInput> = {},
) {
  return startOrResumeAttemptThreadWithoutSkills({
    signal: new AbortController().signal,
    dynamicTools: [],
    appServer: appServerOptions(),
    userMcpServersEnabled: false,
    client,
    params: input.params,
    cwd: input.workspaceDir,
    ...overrides,
  });
}

/**
 * A synthetic server: `nativeConfig` with an `instructions` key makes the Codex base the
 * operator's. Each thread/start after the first gets a numbered id.
 */
function respond(threadId: string, nativeConfig: Record<string, unknown> = {}) {
  let starts = 0;
  return async (method: string) => {
    if (method === "config/read") {
      return { config: nativeConfig, origins: {}, layers: [] };
    }
    if (method === "configRequirements/read") {
      return { requirements: null };
    }
    if (method === "thread/start") {
      starts += 1;
      return threadStartResult(starts === 1 ? threadId : `${threadId}-${starts}`);
    }
    if (method === "thread/resume") {
      return threadStartResult(threadId);
    }
    throw new Error(`unexpected method: ${method}`);
  };
}

type Request = { mock: { calls: unknown[][] } };
const methods = (request: Request) => request.mock.calls.map(([method]) => method as string);
const sent = (request: Request, method: string) =>
  request.mock.calls
    .filter(([name]) => name === method)
    .map(([, params]) => params as Record<string, unknown>);
const injectedText = (request: Request) =>
  JSON.stringify(sent(request, "thread/inject_items").map((params) => params.items));

async function writeBinding(input: ReturnType<typeof attempt>, threadId: string) {
  registerCodexTestSessionIdentity(
    input.sessionFile,
    input.params.sessionId,
    input.params.sessionKey,
    input.params.agentId,
  );
  await writeCodexAppServerBinding(input.sessionFile, {
    threadId,
    cwd: input.workspaceDir,
    model: "gpt-5.4-codex",
    modelProvider: "openai",
    dynamicToolsFingerprint: "[]",
    webSearchThreadConfigFingerprint: JSON.stringify({
      "features.standalone_web_search": false,
      web_search: "cached",
    }),
  });
}

function expectRefused(error: unknown, site: string) {
  expect(error).toMatchObject({
    name: "SovereignPromptRefusal",
    code: "transform_altered",
    details: { route: "codex", site: `app_server_handoff:${site}` },
  });
  expect(inspect(error, { depth: 8, showHidden: true })).not.toContain(SENTINEL);
  expect(JSON.stringify(error)).not.toContain(SENTINEL);
}

describe.skipIf(process.platform === "win32")("Codex route: sovereign handoff check", () => {
  it("checks a new thread's thread/start against the attempt's spans and records the result", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-new"),
    });
    const started = await start(client, attempt("main"));

    expect(methods(request)).toEqual([...PREFLIGHT, "thread/start"]);
    expect(sent(request, "thread/start")[0]?.baseInstructions).toContain(IDENTITY);
    expect(started.sovereignReceipt).toEqual({
      agentId: "main",
      generation: GENERATION,
      setDigest: mainSetDigest,
      bytes: expect.any(Number),
      files: expect.arrayContaining([expect.objectContaining({ path: "identity-section.md" })]),
      verification: verification("thread/start"),
    });
    expect(JSON.stringify(started.sovereignReceipt)).not.toContain(SENTINEL);
  });

  it.each([
    { name: "a base altered after its validated render", edit: "alter" as const },
    { name: "another agent's base and spans", edit: "other-agent" as const },
  ])("refuses $name before thread/start is written", async ({ edit }) => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-refused"),
    });
    const input = attempt("main");
    seams.edit = edit;
    try {
      const error = await start(client, input).catch((cause: unknown) => cause);
      expectRefused(error, "thread/start");
    } finally {
      seams.edit = undefined;
    }
    expect(methods(request)).toEqual(PREFLIGHT);
    await expect(readCodexAppServerBinding(input.sessionFile)).resolves.toBeUndefined();
  });

  it("refuses an enforce agent's thread/start that carries no spans at all", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-withdrawn"),
    });
    // A replaced system prompt withdraws OpenClaw's base, so no span reaches the handoff.
    const error = await start(client, attempt("main"), { systemPromptReplaced: true }).catch(
      (cause: unknown) => cause,
    );

    expectRefused(error, "thread/start");
    expect(methods(request)).toEqual(PREFLIGHT);
  });

  it("re-hands and checks the base when it resumes a thread created under other instructions", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-existing"),
      persistedThreads: ["thread-existing"],
    });
    const input = attempt("main");
    await writeBinding(input, "thread-existing");

    const resumed = await start(client, input);

    expect(methods(request)).toEqual([
      ...PREFLIGHT,
      "thread/read",
      "thread/resume",
      "thread/inject_items",
    ]);
    // A request base outranks the one the rollout saved (codex-rs core/src/session/mod.rs),
    // so the resumed thread runs on this attempt's base.
    expect(sent(request, "thread/resume")[0]?.baseInstructions).toContain(IDENTITY);
    expect(resumed.sovereignReceipt?.verification).toEqual(verification("thread/resume"));
  });

  it("refuses a resume whose base was altered, writing neither thread/resume nor its policy refresh", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-existing"),
      persistedThreads: ["thread-existing"],
    });
    const input = attempt("main");
    await writeBinding(input, "thread-existing");
    seams.edit = "alter";
    try {
      const error = await start(client, input).catch((cause: unknown) => cause);
      expectRefused(error, "thread/resume");
    } finally {
      seams.edit = undefined;
    }

    expect(methods(request)).not.toContain("thread/resume");
    expect(methods(request)).not.toContain("thread/inject_items");
    await expect(readCodexAppServerBinding(input.sessionFile)).resolves.toMatchObject({
      threadId: "thread-existing",
    });
  });

  it("checks the developer carrier and its policy refresh behind an authored Codex base", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-existing", { instructions: "Operator-authored base" }),
      persistedThreads: ["thread-existing"],
    });
    const input = attempt("main");
    await writeBinding(input, "thread-existing");

    const resumed = await start(client, input);

    const resume = sent(request, "thread/resume")[0];
    expect(resume?.baseInstructions).toBeUndefined();
    expect(resume?.developerInstructions).toContain(IDENTITY);
    // The resumed history still holds its creation-time policy; the refresh carries this one.
    expect(injectedText(request)).toContain(JSON.stringify(IDENTITY).slice(1, -1));
    expect(resumed.sovereignReceipt?.verification).toEqual(verification("thread/resume"));
  });

  it("refuses a policy refresh that lost the span behind an authored base before it is injected", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-existing", { instructions: "Operator-authored base" }),
      persistedThreads: ["thread-existing"],
    });
    const input = attempt("main", "refresh");
    await writeBinding(input, "thread-existing");
    seams.emptyRefresh = true;
    try {
      const error = await start(client, input).catch((cause: unknown) => cause);
      // The resume was written and checked; its refresh is refused, and the resumed
      // subscription is released as for any failed policy handoff.
      expect(error).toMatchObject({ name: "CodexThreadPolicyHandoffError" });
      expectRefused((error as Error).cause, "thread/inject_items");
    } finally {
      seams.emptyRefresh = false;
    }
    expect(methods(request)).toContain("thread/resume");
    expect(methods(request)).not.toContain("thread/inject_items");
  });

  it("reuses a live thread loaded by a passed handoff without writing, and records the reuse", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-warm"),
    });
    const input = attempt("main");
    const started = await start(client, input);
    await expect(
      retainCodexAppServerLiveThread(
        client,
        started.threadId,
        undefined,
        started.liveThreadConfigFingerprint,
      ),
    ).resolves.toBe(true);
    request.mockClear();

    const reused = await start(client, input);

    expect(methods(request)).toEqual(PREFLIGHT);
    expect(reused.threadId).toBe(started.threadId);
    expect(reused.sovereignReceipt?.verification).toEqual(verification("live_thread_reuse"));
  });

  it("never reuses a live thread whose base skipped the check: it resumes cold and checks again", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-unchecked"),
    });
    const input = attempt("main");
    seams.unchecked = true;
    let started: Awaited<ReturnType<typeof start>>;
    try {
      started = await start(client, input);
    } finally {
      seams.unchecked = false;
    }
    expect(started.sovereignReceipt).toBeUndefined();
    await retainCodexAppServerLiveThread(
      client,
      started.threadId,
      undefined,
      started.liveThreadConfigFingerprint,
    );
    request.mockClear();

    const resumed = await start(client, input);

    expect(methods(request)).toEqual([
      ...PREFLIGHT,
      "thread/read",
      "thread/unsubscribe",
      "thread/resume",
      "thread/inject_items",
    ]);
    expect(sent(request, "thread/resume")[0]?.baseInstructions).toContain(IDENTITY);
    expect(resumed.sovereignReceipt?.verification).toEqual(verification("thread/resume"));
  });

  it("reuses an ephemeral thread only when its creation handoff passed the check", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-ephemeral"),
    });
    const verified = attempt("main", "verified", true);
    const started = await start(client, verified);
    expect(sent(request, "thread/start")[0]?.ephemeral).toBe(true);
    await retainCodexAppServerLiveThread(
      client,
      started.threadId,
      undefined,
      started.liveThreadConfigFingerprint,
      null,
      started.liveThreadEphemeralPolicy,
    );
    const reused = await start(client, verified);
    expect(reused.sovereignReceipt?.verification).toEqual(verification("live_thread_reuse"));

    // An ephemeral thread has no resume source, so a reuse it cannot verify refuses.
    const unchecked = attempt("main", "unchecked", true);
    seams.unchecked = true;
    let created: Awaited<ReturnType<typeof start>>;
    try {
      created = await start(client, unchecked);
    } finally {
      seams.unchecked = false;
    }
    await retainCodexAppServerLiveThread(
      client,
      created.threadId,
      undefined,
      created.liveThreadConfigFingerprint,
      null,
      created.liveThreadEphemeralPolicy,
    );
    request.mockClear();
    const error = await start(client, unchecked).catch((cause: unknown) => cause);

    expectRefused(error, "live_thread_reuse");
    expect(methods(request).filter((method) => method.startsWith("thread/"))).toEqual([]);
  });

  it.each([
    { name: "checks", edit: undefined },
    { name: "refuses an altered", edit: "alter" as const },
  ])("$name supervised branch thread/start", async ({ edit }) => {
    const input = attempt("main", `supervised-${edit ?? "verified"}`);
    registerCodexTestSessionIdentity(
      input.sessionFile,
      input.params.sessionId,
      input.params.sessionKey,
      input.params.agentId,
    );
    const identity = sessionBindingIdentity(input.params);
    const pendingSupervisionBranch = {
      connectionFingerprint: buildCodexAppServerConnectionFingerprint(
        appServerOptions(),
        input.params.agentDir,
      ),
      sourceThreadId: "thread-source",
    };
    await testCodexAppServerBindingStore.mutate(identity, {
      kind: "set",
      if: { kind: "absent" },
      binding: {
        threadId: "thread-source",
        cwd: input.workspaceDir,
        connectionScope: "supervision",
        supervisionSourceThreadId: "thread-source",
        preserveNativeModel: true,
        pendingSupervisionBranch,
        conversationSourceTransferComplete: true,
        historyCoveredThrough: new Date(0).toISOString(),
      },
    });
    const native = (threadId: string) => {
      const result = threadStartResult(threadId);
      return {
        ...result,
        model: "gpt-5.6-luna",
        modelProvider: "openai",
        thread: { ...result.thread, modelProvider: "openai" },
      };
    };
    const request = vi.fn(async (method: string) => {
      switch (method) {
        case "config/read":
          return { config: {}, origins: {}, layers: [] };
        case "configRequirements/read":
          return { requirements: null };
        case "thread/read":
          return {
            thread: { ...native("thread-source").thread, status: { type: "idle" }, turns: [] },
          };
        case "thread/fork":
          return native("thread-probe");
        case "thread/start":
          return native("thread-final");
        case "thread/unsubscribe":
        case "thread/archive":
        case "thread/inject_items":
          return {};
        default:
          throw new Error(`unexpected method: ${method}`);
      }
    });
    seams.edit = edit;
    try {
      const outcome = await start({ request } as never, input).catch((cause: unknown) => cause);
      if (edit) {
        expectRefused(outcome, "thread/start");
        expect(methods(request)).not.toContain("thread/start");
        expect(testCodexAppServerBindingStore.read(identity)).toMatchObject({
          pendingSupervisionBranch: { sourceThreadId: "thread-source" },
        });
      } else {
        expect(outcome).toMatchObject({
          threadId: "thread-final",
          sovereignReceipt: { verification: verification("thread/start") },
        });
        expect(sent(request, "thread/start")[0]?.baseInstructions).toContain(IDENTITY);
      }
    } finally {
      seams.edit = undefined;
    }
  });

  it("leaves an off agent's handoffs as they were and records no result", async () => {
    const { client, request } = await createAgentLifecycleHarness({
      respond: respond("thread-off"),
    });
    const explicit = await start(client, attempt("off"));
    const absent = await start(client, attempt("plain"));

    const [explicitStart, absentStart] = sent(request, "thread/start");
    expect(explicitStart).toEqual(absentStart);
    expect(explicitStart?.baseInstructions).toContain(STOCK_IDENTITY);
    expect(JSON.stringify(explicitStart)).not.toContain(SENTINEL);
    expect(explicit.sovereignReceipt).toBeUndefined();
    expect(absent.sovereignReceipt).toBeUndefined();
  });
});
