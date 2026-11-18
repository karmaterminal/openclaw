// Exact-route proof for the embedded OpenClaw route (#1321): a loaded generation reaches
// the attempt's model-facing system prompt, the hot path never rereads it, and a provider
// transform cannot alter a sovereign span.
import fs from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import type { OpenClawConfig } from "../../../config/types.js";
import { resetSovereignRedactionForTests } from "../../../logging/sovereign-redaction.js";
import { prepareSystemAgentRunAdmission } from "../../admitted-run-context.js";
import { resetSovereignPromptRuntimeForTests } from "../../sovereign-prompts/runtime.js";
import { SovereignPromptRefusal } from "../../sovereign-prompts/snapshot.js";
import {
  body,
  capture,
  expectNoSentinel,
  expectNoSentinelFilesSince,
  GENERATION,
  SENTINEL,
  sovereignAgentsConfig,
  writeAgentGeneration,
} from "../../sovereign-prompts/sovereign-fixture.test-support.js";
import { fakeTool } from "../../test-helpers/fake-tool.js";
import { makeProviderModelFixture } from "../../test-helpers/provider-model-fixture.js";
import { createAttemptSetupFixture } from "./attempt-setup.test-support.js";
import { buildAttemptSystemPrompt } from "./attempt-system-prompt.js";
import { createEmptyPromptBootstrap } from "./attempt-system-prompt.test-support.js";
import type { EmbeddedRunAttemptParams } from "./types.js";

// Prompt assembly consumes a prepared provider handle; discovery belongs to attempt setup.
vi.mock("../../../plugins/providers.runtime-core.js", () => ({
  createProviderRegistryResolver: () => ({
    isPluginProvidersLoadInFlight: () => {
      throw new Error("Prompt fixture unexpectedly discovered provider runtime");
    },
    resolvePluginProvidersCore: () => {
      throw new Error("Prompt fixture unexpectedly discovered provider runtime");
    },
  }),
}));

const startedAt = Date.now();
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const admissions: Array<ReturnType<typeof prepareSystemAgentRunAdmission>> = [];
afterAll(() => expectNoSentinelFilesSince(startedAt));
afterEach(() => {
  for (const admission of admissions.splice(0)) {
    admission.close();
  }
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

const WORKSPACE = "/openclaw-sovereign-fixture/workspace";
const text = (file: string) => body(file).trim();

function writeMainAgent() {
  const agentDir = tempDirs.make("openclaw-sovereign-attempt-");
  const { root } = writeAgentGeneration(agentDir, "main", {
    files: {
      "execution-section.md": body("execution-section.md"),
      "runtime-context-section.md": body("runtime-context-section.md"),
    },
  });
  return {
    root,
    config: sovereignAgentsConfig({ main: { agentDir, mode: "enforce" } }) as OpenClawConfig,
  };
}

async function prepareMainPrompt(config: OpenClawConfig) {
  const admission = prepareSystemAgentRunAdmission({}, "sovereign-attempt", "main", "test");
  admissions.push(admission);
  const attempt = {
    provider: "openai",
    modelId: "gpt-5.6-luna",
    model: makeProviderModelFixture({
      id: "gpt-5.6-luna",
      provider: "openai",
      api: "openai-responses",
      baseUrl: "https://api.openai.com/v1",
    }),
    permissionMode: "full",
    promptMode: "full",
    sessionId: "sovereign-attempt",
    sessionKey: "agent:main:sovereign-attempt",
    workspaceDir: WORKSPACE,
    config,
    admittedRunContext: await admission.admit("embedded"),
  } as EmbeddedRunAttemptParams;
  const tools = ["read", "exec"].map((name) => fakeTool(name, name));
  return prepareEmbeddedAttemptSystemPrompt({
    attempt,
    activeContextEngine: undefined,
    bootstrap: createEmptyPromptBootstrap(),
    capabilityToolNames: new Set(tools.map(({ name }) => name)),
    effectiveTools: tools,
    setup: createAttemptSetupFixture({
      effectiveCwd: WORKSPACE,
      effectiveWorkspace: WORKSPACE,
      sessionAgentId: "main",
      getProviderRuntimeHandle: () => ({
        provider: attempt.provider,
        modelId: attempt.modelId,
        prepared: true as const,
      }),
      sandboxSessionKey: attempt.sessionKey,
    }),
    isRawModelRun: false,
    modelToolsEnabled: true,
    skillsPrompt: "",
    toolSearchDirectoryEnabled: false,
    toolSearchRuntimeConfig: config,
  });
}

let prepareEmbeddedAttemptSystemPrompt: typeof import("./attempt-system-prompt-prepare.js").prepareEmbeddedAttemptSystemPrompt;
beforeAll(async () => {
  ({ prepareEmbeddedAttemptSystemPrompt } = await import("./attempt-system-prompt-prepare.js"));
});

describe.skipIf(process.platform === "win32")("embedded route: sovereign prompt text", () => {
  it("reaches the attempt's model-facing system prompt and is never reread", async () => {
    const { config, root } = writeMainAgent();
    const prepared = await prepareMainPrompt(config);
    const prompt = prepared.systemPromptText;
    const stable = prompt.match(
      /<!-- openclaw:attempt:STABLE -->\n([\s\S]*?)\n<!-- \/openclaw:attempt:STABLE -->/,
    )?.[1];
    const dynamic = prompt.match(
      /<!-- openclaw:attempt:DYNAMIC -->\n([\s\S]*?)\n<!-- \/openclaw:attempt:DYNAMIC -->/,
    )?.[1];
    expect(stable?.split("\n")[0]).toBe(text("identity-section.md"));
    expect(stable).toContain(`## Execution Bias\n${text("execution-section.md")}`);
    expect(stable).toContain(`## Runtime Context\n${text("runtime-context-section.md")}`);
    expect(dynamic).toContain(`## Tool Call Style\n${text("tool-section.md")}`);
    expect(dynamic).toContain(`## Care\n${text("safety-section.md")}`);
    expect(prompt).not.toContain("You are a personal assistant running inside OpenClaw.");
    expect(prompt).not.toContain("Routine low-risk: call silently.");
    // The receipt names the generation by digest and never carries a body.
    expect(prepared.systemPromptReport?.sovereign).toMatchObject({
      generation: GENERATION,
      setDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      files: expect.arrayContaining([
        expect.objectContaining({ path: "identity-section.md", converted: true }),
        expect.objectContaining({ path: "tool-section.d/tooling.md", converted: false }),
      ]),
    });
    expect(JSON.stringify(prepared.systemPromptReport)).not.toContain(SENTINEL);

    // A tool refresh re-renders from the frozen snapshot, even with the generation deleted.
    fs.rmSync(root, { recursive: true, force: true });
    const refresh = await prepared.prepareToolPrompt!(undefined, { permissionChanged: true });
    const refreshed = refresh(prompt);
    expect(refreshed).toContain("## Permission change");
    expect(refreshed.slice(0, refreshed.indexOf("<!-- openclaw:attempt:PERMISSION -->"))).toBe(
      `${prompt}\n\n`,
    );
  });

  it("refuses a provider transform that alters a sovereign span; additions pass", async () => {
    const { config } = writeMainAgent();
    const embeddedSystemPrompt = { config, agentId: "main", workspaceDir: WORKSPACE };
    const appended = await buildAttemptSystemPrompt({
      isRawModelRun: false,
      embeddedSystemPrompt,
      transformSystemPrompt: (prompt) => `${prompt}\n\nProvider addition.`,
    });
    expect(appended.systemPrompt).toContain(text("identity-section.md"));
    expect(appended.systemPrompt).toContain("Provider addition.");
    const altered = await capture(() =>
      buildAttemptSystemPrompt({
        isRawModelRun: false,
        embeddedSystemPrompt,
        transformSystemPrompt: (prompt) => prompt.replace("Synthetic fixture prose", "Rewritten"),
      }),
    );
    expect(altered.error).toBeInstanceOf(SovereignPromptRefusal);
    expect((altered.error as SovereignPromptRefusal).code).toBe("transform_altered");
    expectNoSentinel(altered);
  });
});
