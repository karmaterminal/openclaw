// Off is stock (#1321): with `sovereignPrompts` absent, `{}` or `mode: "off"`, both prompt
// builders render exactly the stock bytes, alone or, for a call naming the agent, beside a
// loaded enforce agent whose own render ran first; beside it, a call naming no agent is
// refused. Inputs span the prompt modes, with and without an agent id, provider overrides
// and workspace files.
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import { resetSovereignRedactionForTests } from "../logging/sovereign-redaction.js";
import {
  loadSovereignPromptsForProcess,
  resetSovereignPromptRuntimeForTests,
} from "./sovereign-prompts/runtime.js";
import { SovereignPromptRefusal } from "./sovereign-prompts/snapshot.js";
import {
  SENTINEL,
  useSovereignTempDirs,
  writeAgentGeneration,
} from "./sovereign-prompts/sovereign-fixture.test-support.js";
import { buildConfiguredAgentSystemPrompt } from "./system-prompt-config.js";
import { buildAgentHarnessBasePrompt } from "./system-prompt-harness-base.js";
import type { PromptMode } from "./system-prompt.types.js";

const tempDirs = useSovereignTempDirs(afterEach);
afterEach(() => {
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

const STOCK_IDENTITY = "You are a personal assistant running inside OpenClaw.";
const workspaceDir = "/openclaw-sovereign-fixture/workspace";
const toolNames = ["exec", "read", "process", "sessions_spawn", "image_generate", "gateway"];
const promptContribution = {
  stablePrefix: "Provider stable prefix.",
  dynamicSuffix: "Provider dynamic suffix.",
  sectionOverrides: {
    interaction_style: "## Interaction Style\nProvider style.",
    execution_bias: "## Execution Bias\nProvider bias.",
    tool_call_style: "## Tool Call Style\nProvider tool style.",
  },
};
const contextFiles = [
  { path: "SOUL.md", content: "Soul file content." },
  { path: "USER.md", content: "User file content." },
  { path: "AGENTS.md", content: "Agents file content." },
];

const inputs = (["full", "minimal", "none"] as PromptMode[]).flatMap((promptMode) =>
  ["main", undefined].flatMap((agentId) =>
    [false, true].flatMap((overrides) =>
      [false, true].map((files) => ({ promptMode, agentId, overrides, files })),
    ),
  ),
);

/** A render's bytes, or the code it was refused with. */
async function outcome(agentId: string | undefined, render: () => string | Promise<string>) {
  try {
    return { agentId, text: await render() };
  } catch (error) {
    if (error instanceof SovereignPromptRefusal) {
      return { agentId, refused: error.code };
    }
    throw error;
  }
}

/** Every input through the main builder, and those without workspace files through the harness base. */
async function renderAll(config: OpenClawConfig) {
  const rendered: Awaited<ReturnType<typeof outcome>>[] = [];
  for (const { promptMode, agentId, overrides, files } of inputs) {
    const contribution = overrides ? { promptContribution } : {};
    rendered.push(
      await outcome(agentId, () =>
        buildConfiguredAgentSystemPrompt({
          config,
          agentId,
          workspaceDir,
          toolNames,
          promptMode,
          runtimeInfo: { model: "openai/gpt-fixture" },
          ...contribution,
          ...(files ? { contextFiles } : {}),
        }),
      ),
    );
    if (!files) {
      rendered.push(
        await outcome(agentId, () =>
          buildAgentHarnessBasePrompt({ config, agentId, toolNames, promptMode, ...contribution }),
        ),
      );
    }
  }
  return rendered;
}

const SHAPES = {
  absent: {},
  unset: { sovereignPrompts: {} },
  off: { sovereignPrompts: { mode: "off" } },
} as const;
type Shape = keyof typeof SHAPES;

/** `main` alone; with no agent enforce, a call naming none renders stock too. */
const sole = (agentDir: string, shape: Shape) =>
  ({ agents: { entries: { main: { agentDir, ...SHAPES[shape] } } } }) as OpenClawConfig;

/** `main` as the recorded owner beside `prince`. */
const fleet = (dirs: { main: string; prince: string }, shape: Shape, princeEnforce: boolean) =>
  ({
    agents: {
      ownership: "explicit",
      defaults: { systemAgent: { agentId: "main" } },
      entries: {
        main: { agentDir: dirs.main, ...SHAPES[shape] },
        prince: {
          agentDir: dirs.prince,
          ...(princeEnforce ? { sovereignPrompts: { mode: "enforce" } } : {}),
        },
      },
    },
  }) as OpenClawConfig;

describe.skipIf(process.platform === "win32")("sovereign prompts off", () => {
  it("absent, unset and off render the stock bytes in both builders", async () => {
    const agentDir = tempDirs.make("openclaw-sovereign-off-");
    const stock = await renderAll(sole(agentDir, "absent"));
    expect(stock).toHaveLength(36);
    expect(stock[0]?.text?.split("\n")[0]).toBe(STOCK_IDENTITY);
    expect(stock[1]?.text?.split("\n")[0]).toBe(STOCK_IDENTITY);
    for (const shape of Object.keys(SHAPES) as Shape[]) {
      expect(await renderAll(sole(agentDir, shape)), shape).toEqual(stock);
    }
  });

  it("an off agent's prompt is unchanged beside a loaded enforce agent; a call naming no agent refuses", async () => {
    const dirs = {
      main: tempDirs.make("openclaw-sovereign-off-"),
      prince: tempDirs.make("openclaw-sovereign-off-prince-"),
    };
    writeAgentGeneration(dirs.prince, "prince");
    const stock = await renderAll(fleet(dirs, "absent", false));
    // The recorded owner is off, but a call naming no agent may be the enforce agent's, so it
    // is refused in each builder before any text exists (§ 4.6).
    const expected = stock.map(({ agentId, text }) =>
      agentId ? { agentId, text } : { agentId, refused: "agent_unknown" },
    );
    expect(stock.every(({ text }) => text?.startsWith(STOCK_IDENTITY))).toBe(true);
    for (const shape of Object.keys(SHAPES) as Shape[]) {
      resetSovereignPromptRuntimeForTests();
      resetSovereignRedactionForTests();
      const config = fleet(dirs, shape, true);
      loadSovereignPromptsForProcess(config, { log: { info: () => {}, warn: () => {} } });
      // The enforce agent renders first: its instances are registered for redaction.
      const prince = await buildConfiguredAgentSystemPrompt({
        config,
        agentId: "prince",
        workspaceDir,
        toolNames,
      });
      expect(prince.split("\n")[0]).toContain(SENTINEL);
      expect(await renderAll(config), shape).toEqual(expected);
    }
  });
});
