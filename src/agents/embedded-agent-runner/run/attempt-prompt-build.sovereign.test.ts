// Whole-prompt replacement for a sovereign prompt agent fails the run (#1321, design
// question 6): the embedded before_prompt_build site and the session-extension
// before_agent_start site. Prepend and append stay allowed; an off agent's replacement
// still applies. Session extensions observe sovereign spans as markers (§ 5.4).
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../../../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../../../config/types.js";
import { resetSovereignRedactionForTests } from "../../../logging/sovereign-redaction.js";
import type { PluginHookBeforePromptBuildResult } from "../../../plugins/hook-before-agent-start.types.js";
import { createHookRunner } from "../../../plugins/hooks.js";
import { prepareSystemAgentRunAdmission } from "../../admitted-run-context.js";
import { forgetPromptBuildDrainCacheForRun } from "../../plugin-turn-context.js";
import {
  createAssistant,
  createAssistantResultStream,
  createTestSession,
  registerAgentSessionLoopTestLifecycle,
  streamMocks,
  testModel,
} from "../../sessions/agent-session-loop-correctness.test-support.js";
import {
  assertSovereignPromptNotReplaced,
  resetSovereignPromptRuntimeForTests,
} from "../../sovereign-prompts/runtime.js";
import { SovereignPromptRefusal } from "../../sovereign-prompts/snapshot.js";
import {
  SENTINEL,
  sovereignAgentsConfig,
  useSovereignTempDirs,
  writeAgentGeneration,
} from "../../sovereign-prompts/sovereign-fixture.test-support.js";
import { buildConfiguredAgentSystemPrompt } from "../../system-prompt-config.js";
import { createStubTool } from "../../test-helpers/agent-tool-stubs.js";
import { prepareEmbeddedAttemptPromptAssembly } from "./attempt-prompt-build.js";

vi.mock("../../../plugins/host-hook-state.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../plugins/host-hook-state.js")>()),
  drainPluginNextTurnInjectionContext: vi.fn(async () => ({ queuedInjections: [] })),
}));

registerAgentSessionLoopTestLifecycle();
const tempDirs = useSovereignTempDirs(afterEach);
afterEach(() => {
  clearRuntimeConfigSnapshot();
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

// The switch alone decides; no generation is read at these sites.
const configFor = (mode?: "enforce") =>
  ({
    agents: {
      entries: {
        main: {
          agentDir: "/openclaw-sovereign-fixture/agent",
          ...(mode ? { sovereignPrompts: { mode } } : {}),
        },
      },
    },
  }) as OpenClawConfig;

async function assemble(config: OpenClawConfig, hookResult: PluginHookBeforePromptBuildResult) {
  const runId = `sovereign-override-${Math.random().toString(36).slice(2)}`;
  setRuntimeConfigSnapshot(config);
  const { session, sessionManager } = await createTestSession({
    customTools: [createStubTool("read")],
  });
  const admission = prepareSystemAgentRunAdmission(config, runId, "main", "sovereign-override");
  onTestFinished(() => {
    admission.close();
    forgetPromptBuildDrainCacheForRun(runId);
  });
  const hookRunner = createHookRunner({
    hooks: [],
    plugins: [],
    typedHooks: [
      {
        pluginId: "sovereign-override",
        hookName: "before_prompt_build",
        source: "test",
        handler: async () => hookResult,
      },
    ],
  });
  let systemPrompt = "Base system prompt";
  await prepareEmbeddedAttemptPromptAssembly({
    attempt: {
      admittedRunContext: await admission.admit("embedded"),
      config,
      model: testModel,
      provider: testModel.provider,
      prompt: "hello",
      transcriptPrompt: "hello",
      runId,
      sessionId: runId,
      sessionKey: `agent:main:${runId}`,
      sessionPersistence: "detached",
      trigger: "user",
      workspaceDir: "/tmp/sovereign-override",
    },
    activeSession: session,
    sessionManager,
    hookRunner,
    hookAgentId: "main",
    diagnosticTrace: { traceId: "11111111111111111111111111111111" },
    isRawModelRun: false,
    sessionAgentId: "main",
    runtimeModel: testModel.id,
    systemPromptText: systemPrompt,
    runAbortSignal: new AbortController().signal,
    hasBaselineTools: () => session.getActiveToolNames().length > 0,
    applyPromptBuildToolsAllow: () => [],
    setActiveSessionSystemPrompt: (prompt) => {
      systemPrompt = prompt;
    },
  });
  return systemPrompt;
}

describe("sovereign whole-prompt replacement", () => {
  it("embedded before_prompt_build: a replacement refuses; prepend and append still apply", async () => {
    const replaced = await assemble(configFor("enforce"), {
      systemPrompt: "Plugin replacement prompt",
    }).catch((error: unknown) => error);
    expect(replaced).toBeInstanceOf(SovereignPromptRefusal);
    expect(replaced).toMatchObject({
      code: "sovereign_override_denied",
      details: { site: "before_prompt_build" },
    });
    expect(String(replaced)).not.toContain("Plugin replacement prompt");

    const added = await assemble(configFor("enforce"), {
      prependSystemContext: "Plugin prepend",
      appendSystemContext: "Plugin append",
    });
    expect(added).toContain("Plugin prepend");
    expect(added).toContain("Base system prompt");
    expect(added).toContain("Plugin append");

    expect(await assemble(configFor(), { systemPrompt: "Plugin replacement prompt" })).toContain(
      "Plugin replacement prompt",
    );
  });

  it("session-extension before_agent_start: even an empty replacement refuses before the model call", async () => {
    const config = configFor("enforce");
    const { session } = await createTestSession({
      extension: (api) => {
        api.on("before_agent_start", async () => ({ systemPrompt: "" }));
      },
      // What the embedded runner passes for this agent (attempt-session-prepare.ts).
      assertSystemPromptReplacementAllowed: () =>
        assertSovereignPromptNotReplaced(config, "main", "before_agent_start"),
    });
    const outcome = await session.prompt("hello").catch((error: unknown) => error);
    expect(outcome).toMatchObject({
      code: "sovereign_override_denied",
      details: { site: "before_agent_start" },
    });
    expect(streamMocks.streamSimple).not.toHaveBeenCalled();
  });

  it("session extensions see sovereign spans as markers; the model still gets the prompt", async () => {
    const agentDir = tempDirs.make("openclaw-sovereign-extension-");
    writeAgentGeneration(agentDir, "main");
    const config = sovereignAgentsConfig({ main: { agentDir, mode: "enforce" } }) as OpenClawConfig;
    // A real render registers the instances the redactor masks.
    const prompt = await buildConfiguredAgentSystemPrompt({
      config,
      agentId: "main",
      workspaceDir: "/openclaw-sovereign-fixture/workspace",
      toolNames: ["read"],
    });
    expect(prompt).toContain(SENTINEL);
    let modelPrompt: string | undefined;
    streamMocks.streamSimple.mockImplementation((model, context) => {
      modelPrompt = context.systemPrompt;
      return createAssistantResultStream(createAssistant(model, "Done."));
    });
    const views: Record<string, unknown> = {};
    const { session } = await createTestSession({
      systemPrompt: prompt,
      extension: (api) => {
        api.on("before_agent_start", async (event, ctx) => {
          views.event = event.systemPrompt;
          views.options = event.systemPromptOptions.customPrompt;
          views.eventContext = ctx.getSystemPrompt();
        });
        api.on("agent_end", async (_event, ctx) => {
          views.context = ctx.getSystemPrompt();
        });
      },
    });
    await session.prompt("hello");
    expect(modelPrompt).toBe(prompt);
    expect(Object.keys(views).toSorted()).toEqual(["context", "event", "eventContext", "options"]);
    for (const [name, view] of Object.entries(views)) {
      expect(typeof view, name).toBe("string");
      expect(view, name).not.toContain(SENTINEL);
      expect(view, name).toMatch(/<!-- openclaw:sovereign identity\/opening sha256:[0-9a-f]{12} /);
    }
  });
});
