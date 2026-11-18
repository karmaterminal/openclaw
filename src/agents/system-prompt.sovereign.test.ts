// Sovereign slots in both prompt renderers (#1321): positions, gates, provider overrides,
// the stable-prefix cache, and the chokepoint's refusals, from real fixture generations.
import path from "node:path";
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from "@openclaw/ai/internal/shared";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.js";
import {
  redactSovereignText,
  resetSovereignRedactionForTests,
} from "../logging/sovereign-redaction.js";
import {
  loadSovereignPromptsForProcess,
  resetSovereignPromptRuntimeForTests,
} from "./sovereign-prompts/runtime.js";
import { SovereignPromptRefusal } from "./sovereign-prompts/snapshot.js";
import {
  body,
  capture,
  expectNoSentinel,
  SENTINEL,
  sovereignAgentsConfig,
  useSovereignTempDirs,
  writeAgentGeneration,
  type GenerationSpec,
} from "./sovereign-prompts/sovereign-fixture.test-support.js";
import { buildConfiguredAgentSystemPrompt } from "./system-prompt-config.js";
import { buildAgentHarnessBasePrompt } from "./system-prompt-harness-base.js";

const tempDirs = useSovereignTempDirs(afterEach);
afterEach(() => {
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

const MEDIA = "tool-section.d/media-dedupe.md";
// Every converted file, so each slot's position can be found by its body.
const FULL: GenerationSpec["files"] = {
  "execution-section.md": body("execution-section.md"),
  "runtime-context-section.md": body("runtime-context-section.md"),
  "project-context-section.md": body("project-context-section.md"),
  "project-context-section.d/precedence-soul.md": body("precedence-soul"),
  "safety-section.d/credentials.control-tools.md": body("credentials.control-tools"),
  "safety-section.d/credentials.no-control-tools.md": body("credentials.no-control-tools"),
  [MEDIA]: `${SENTINEL} media {{oc:tool:current}} ${SENTINEL}\n`,
};
const text = (file: string) => body(file).trim();

// Stock bodies of the converted slots; none may render for a sovereign agent.
const STOCK = [
  "You are a personal assistant running inside OpenClaw.",
  "Actionable request: act now.",
  "OpenClaw may attach a separate runtime-context message",
  "Loaded project context:",
  "SOUL.md: persona/tone.",
  "Routine low-risk: call silently.",
  "Before config/scheduler edits",
  "Permission blocks:",
  "Do not call `image_generate` again",
];

function writeAgent(agentId: string, files: GenerationSpec["files"] = FULL) {
  const agentDir = tempDirs.make("openclaw-sovereign-render-");
  writeAgentGeneration(agentDir, agentId, { files });
  return agentDir;
}

function configFor(entries: Parameters<typeof sovereignAgentsConfig>[0]) {
  return sovereignAgentsConfig(entries) as OpenClawConfig;
}

const workspaceDir = "/openclaw-sovereign-fixture/workspace";
const render = (
  config: OpenClawConfig,
  agentId: string | undefined,
  extra: Partial<Parameters<typeof buildConfiguredAgentSystemPrompt>[0]> = {},
) =>
  buildConfiguredAgentSystemPrompt({
    config,
    agentId,
    workspaceDir,
    toolNames: ["exec", "image_generate", "gateway"],
    contextFiles: [{ path: "SOUL.md", content: "Soul file content." }],
    ...extra,
  });

function positions(prompt: string, needles: readonly string[]) {
  return needles.map((needle) => {
    const at = prompt.indexOf(needle);
    expect(at, needle).toBeGreaterThanOrEqual(0);
    return at;
  });
}

describe.skipIf(process.platform === "win32")("sovereign slots in the main renderer", () => {
  it("renders each converted slot at its position under its code-owned heading, never stock", async () => {
    const config = configFor({ main: { agentDir: writeAgent("main"), mode: "enforce" } });
    const prompt = await render(config, "main");
    expect(prompt.split("\n")[0]).toBe(text("identity-section.md"));
    expect(prompt).toContain(`## Execution Bias\n${text("execution-section.md")}`);
    expect(prompt).toContain(`## Runtime Context\n${text("runtime-context-section.md")}`);
    expect(prompt).toContain(
      `# Project Context\n${text("project-context-section.md")}\n${text("precedence-soul")}\n## SOUL.md`,
    );
    expect(prompt).toContain(`## Tool Call Style\n${text("tool-section.md")}`);
    expect(prompt).toContain(
      `## Care\n${text("safety-section.md")}\n${text("credentials.control-tools")}`,
    );
    expect(prompt).toContain(`${SENTINEL} media image_generate ${SENTINEL}`);
    for (const stock of STOCK) {
      expect(prompt).not.toContain(stock);
    }
    // Order pinned: S slots above the cache boundary in registry order, D slots below it.
    const at = positions(prompt, [
      text("identity-section.md"),
      text("execution-section.md"),
      text("runtime-context-section.md"),
      text("project-context-section.md"),
      SYSTEM_PROMPT_CACHE_BOUNDARY,
      `${SENTINEL} media image_generate`,
      text("tool-section.md"),
      text("safety-section.md"),
    ]);
    expect(at).toEqual([...at].toSorted((a, b) => a - b));
    // Declared but unconverted (T2): the tooling line still renders from code.
    expect(prompt).toContain("## Tooling");
    expect(prompt).not.toContain(text("tool-section.d/tooling.md"));
    // A render is a pure function of the snapshot and the run's facts.
    expect(await render(config, "main")).toBe(prompt);
  });

  it("omits an absent optional section and leaves an off agent's prompt untouched", async () => {
    const sparse = writeAgent("sparse", {});
    const plain = writeAgent("plain");
    const config = configFor({
      sparse: { agentDir: sparse, mode: "enforce" },
      plain: { agentDir: plain },
    });
    const prompt = await render(config, "sparse", { toolNames: ["exec"] });
    for (const heading of ["## Execution Bias", "## Runtime Context"]) {
      expect(prompt).not.toContain(heading);
    }
    // Project Context keeps its code-owned heading and the file pass-through, with no framing.
    expect(prompt).toContain("# Project Context\n## SOUL.md\nSoul file content.");
    // No credential fragment in this generation: Care is the safety body alone.
    expect(prompt).toContain(`## Care\n${text("safety-section.md")}\n## `);
    const stock = await render(config, "plain");
    expect(stock).not.toContain(SENTINEL);
    for (const line of STOCK) {
      expect(stock).toContain(line);
    }
  });

  it("ignores provider overrides of converted sections for a sovereign agent only", async () => {
    const config = configFor({
      main: { agentDir: writeAgent("main"), mode: "enforce" },
      plain: { agentDir: writeAgent("plain") },
    });
    const promptContribution = {
      sectionOverrides: { execution_bias: "OVERRIDE-EXEC", tool_call_style: "OVERRIDE-TOOL" },
    };
    const sovereign = await render(config, "main", { promptContribution });
    expect(sovereign).not.toContain("OVERRIDE-");
    expect(sovereign).toContain(text("execution-section.md"));
    // The override no longer owns the tool section, so exec approval guidance returns.
    expect(sovereign).toContain("/approve");
    const plain = await render(config, "plain", { promptContribution });
    expect(plain).toContain("OVERRIDE-EXEC");
    expect(plain).toContain("OVERRIDE-TOOL");
  });

  it("never serves one agent's text to another, or to a call naming no agent", async () => {
    const other = `${SENTINEL} other ${SENTINEL}`;
    const config = {
      agents: {
        ownership: "explicit",
        // `a` is the recorded owner, the agent OpenClaw resolves when a call names none.
        defaults: { systemAgent: { agentId: "a" } },
        entries: configFor({
          a: { agentDir: writeAgent("a"), mode: "enforce" },
          b: { agentDir: writeAgent("b", { "identity-section.md": other }), mode: "enforce" },
          plain: { agentDir: writeAgent("plain") },
        }).agents?.entries,
      },
    } as OpenClawConfig;
    // The stock render warms the shared LRU first; neither sovereign agent may hit it.
    const plain = await render(config, "plain");
    const harness = (agentId?: string) =>
      buildAgentHarnessBasePrompt({ config, agentId, toolNames: ["exec"] });
    expect(plain.split("\n")[0]).toBe("You are a personal assistant running inside OpenClaw.");
    for (const [agentId, own, foreign] of [
      ["a", text("identity-section.md"), other],
      ["b", other, text("identity-section.md")],
    ] as const) {
      for (const prompt of [await render(config, agentId), harness(agentId)]) {
        expect(prompt.split("\n")[0]).toBe(own);
        expect(prompt).not.toContain(foreign);
      }
    }
    // A call naming no agent has lost its run identity: the owner's text is not its to take.
    for (const build of [() => render(config, undefined), () => harness()]) {
      const outcome = await capture(build);
      expect(outcome.error).toBeInstanceOf(SovereignPromptRefusal);
      expect((outcome.error as SovereignPromptRefusal).code).toBe("agent_unknown");
      expectNoSentinel(outcome);
    }
  });

  it("renders minimal and none modes with exactly their slots", async () => {
    const config = configFor({ main: { agentDir: writeAgent("main"), mode: "enforce" } });
    const minimal = await render(config, "main", { promptMode: "minimal" });
    expect(minimal.split("\n")[0]).toBe(text("identity-section.md"));
    expect(minimal).not.toContain("## Execution Bias");
    expect(minimal).toContain(`## Runtime Context\n${text("runtime-context-section.md")}`);
    expect(minimal).toContain(`## Care\n${text("safety-section.md")}`);
    const none = await render(config, "main", {
      promptMode: "none",
      runtimeInfo: { model: "openai/gpt-fixture" },
    });
    expect(none.split("\n")).toEqual([
      text("identity-section.md"),
      expect.stringMatching(/^Current model identity: openai\/gpt-fixture\./),
    ]);
  });

  it("registers blinded spellings, so a blind child's echo stays masked", async () => {
    const identity = `${SENTINEL} lives in ${workspaceDir}/notes ${SENTINEL}`;
    const config = configFor({
      main: {
        agentDir: writeAgent("main", { ...FULL, "identity-section.md": identity }),
        mode: "enforce",
      },
    });
    const prompt = await render(config, "main", { runtimeInfo: { agentId: "main", blind: true } });
    expect(prompt).not.toContain(workspaceDir);
    expect(prompt).toContain(SENTINEL);
    expect(redactSovereignText(prompt)).not.toContain(SENTINEL);
  });

  it("refuses a refused, unloaded or unresolvable enforce agent before rendering", async () => {
    const broken = writeAgent("broken", { "tool-section.md": null });
    const good = writeAgent("good");
    const late = writeAgent("late");
    loadSovereignPromptsForProcess(
      configFor({
        broken: { agentDir: broken, mode: "enforce" },
        good: { agentDir: good, mode: "enforce" },
      }),
      { log: { info: () => {}, warn: () => {} } },
    );
    const config = configFor({
      broken: { agentDir: broken, mode: "enforce" },
      good: { agentDir: good, mode: "enforce" },
      late: { agentDir: late, mode: "enforce" },
    });
    for (const [agentId, code] of [
      ["broken", "required_missing"],
      ["late", "not_loaded"],
      [undefined, "agent_unknown"],
    ] as const) {
      const outcome = await capture(() => render(config, agentId));
      expect(outcome.error).toBeInstanceOf(SovereignPromptRefusal);
      expect((outcome.error as SovereignPromptRefusal).code).toBe(code);
      expectNoSentinel(outcome, [broken, good, late]);
    }
    // The other agent still renders in the same process.
    expect((await render(config, "good")).split("\n")[0]).toBe(text("identity-section.md"));
  });
});

describe.skipIf(process.platform === "win32")(
  "sovereign slots in the harness base renderer",
  () => {
    const toolNames = ["exec", "video_generate", "openclaw"];
    const promptContribution = {
      sectionOverrides: { execution_bias: "OVERRIDE-EXEC", tool_call_style: "OVERRIDE-TOOL" },
    };

    it("replaces HARNESS_IDENTITY and the shared policy sections, ignoring overrides", () => {
      const config = configFor({
        main: { agentDir: writeAgent("main"), mode: "enforce" },
        plain: { agentDir: writeAgent("plain") },
      });
      const base = buildAgentHarnessBasePrompt({
        config,
        agentId: "main",
        toolNames,
        promptContribution,
      });
      expect(base.split("\n")[0]).toBe(text("identity-section.md"));
      const at = positions(base, [
        text("identity-section.md"),
        `## Execution Bias\n${text("execution-section.md")}`,
        `## Runtime Context\n${text("runtime-context-section.md")}`,
        `${SENTINEL} media video_generate ${SENTINEL}`,
        `## Tool Call Style\n${text("tool-section.md")}`,
        `## Care\n${text("safety-section.md")}\n${text("credentials.control-tools")}`,
      ]);
      expect(at).toEqual([...at].toSorted((a, b) => a - b));
      expect(base).not.toContain("OVERRIDE-");
      for (const stock of STOCK) {
        expect(base).not.toContain(stock);
      }
      expect(
        buildAgentHarnessBasePrompt({ config, agentId: "main", toolNames, promptMode: "none" }),
      ).toBe(text("identity-section.md"));
      const plain = buildAgentHarnessBasePrompt({ config, agentId: "plain", toolNames });
      expect(plain.split("\n")[0]).toBe("You are a personal assistant running inside OpenClaw.");
      expect(plain).not.toContain(SENTINEL);
    });

    it("refuses a refused enforce agent before rendering", async () => {
      const broken = writeAgent("broken", { "identity-section.md": "" });
      const config = configFor({ broken: { agentDir: broken, mode: "enforce" } });
      const outcome = await capture(() =>
        buildAgentHarnessBasePrompt({ config, agentId: "broken", toolNames }),
      );
      expect((outcome.error as SovereignPromptRefusal).code).toBe("required_empty");
      expectNoSentinel(outcome, [path.dirname(broken)]);
    });
  },
);
