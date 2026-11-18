// The handoff check's contract (#1321, 🌻's ruling (c)): a harness hands it the spans of the
// render that built a handoff and the handoff's instruction carriers. A passed check
// returns a content-free receipt; an enforce agent's handoff with no spans, another agent's
// or generation's spans, or a lost span refuses with a content-free line; an off agent
// gets no check and no receipt.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.js";
import { resetSovereignRedactionForTests } from "../../logging/sovereign-redaction.js";
import { buildAgentHarnessBasePrompt } from "../system-prompt-harness-base.js";
import { checkSovereignPromptHandoff } from "./handoff.js";
import { resetSovereignPromptRuntimeForTests, type SovereignPromptSpans } from "./runtime.js";
import {
  capture,
  expectNoSentinel,
  GENERATION,
  sovereignAgentsConfig,
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
afterEach(() => {
  sovereignWarn.mockClear();
  resetSovereignPromptRuntimeForTests();
  resetSovereignRedactionForTests();
});

function writeAgents() {
  const mainDir = tempDirs.make("openclaw-sovereign-handoff-main-");
  const otherDir = tempDirs.make("openclaw-sovereign-handoff-other-");
  writeAgentGeneration(mainDir, "main");
  writeAgentGeneration(otherDir, "other");
  return sovereignAgentsConfig({
    main: { agentDir: mainDir, mode: "enforce" },
    other: { agentDir: otherDir, mode: "enforce" },
    plain: { agentDir: tempDirs.make("openclaw-sovereign-handoff-plain-") },
  }) as OpenClawConfig;
}

/** One harness base render and the spans it placed. */
function render(config: OpenClawConfig, agentId: string) {
  let spans: SovereignPromptSpans | undefined;
  const base = buildAgentHarnessBasePrompt({
    config,
    agentId,
    toolNames: ["exec"],
    onRenderedSovereignSpans: (rendered) => {
      spans = rendered;
    },
  });
  return { base, spans };
}

const check = (
  config: OpenClawConfig,
  agentId: string,
  spans: SovereignPromptSpans | undefined,
  carriers: (string | undefined)[],
) => checkSovereignPromptHandoff({ config, agentId, spans, site: "thread/start", carriers });

describe.skipIf(process.platform === "win32")("checkSovereignPromptHandoff", () => {
  it("returns a content-free receipt when every span reaches a carrier", async () => {
    const config = writeAgents();
    const { base, spans } = render(config, "main");
    expect(spans?.instances.length).toBeGreaterThan(0);

    // The span may ride either carrier, framed as the harness frames it.
    const outcome = await capture(() =>
      check(config, "main", spans, [undefined, `<thread_policy>\n${base}\n</thread_policy>`]),
    );
    expect(outcome.value).toMatchObject({
      agentId: "main",
      generation: GENERATION,
      setDigest: spans!.setDigest,
      verification: {
        result: "handoff-verified",
        route: "codex",
        boundary: "app_server_handoff",
        site: "thread/start",
      },
    });
    expectNoSentinel(outcome);
    expect(sovereignWarn).not.toHaveBeenCalled();
  });

  it.each([
    { name: "a lost span", spans: "main", carriers: ["You are a stock assistant."] },
    { name: "no spans", spans: undefined, carriers: ["base"] },
    { name: "another agent's spans", spans: "other", carriers: ["base"] },
  ])("refuses an enforce agent's handoff with $name, content-free", async (testCase) => {
    const config = writeAgents();
    const main = render(config, "main");
    const spans = testCase.spans ? render(config, testCase.spans).spans : undefined;
    const carriers = testCase.carriers.map((text) => (text === "base" ? main.base : text));
    if (testCase.spans === "other") {
      carriers.push(render(config, "other").base);
    }

    const outcome = await capture(() => check(config, "main", spans, carriers));
    expect(outcome.error).toMatchObject({
      name: "SovereignPromptRefusal",
      code: "transform_altered",
      details: { route: "codex", site: "app_server_handoff:thread/start" },
    });
    expectNoSentinel(outcome);
    expect(sovereignWarn).toHaveBeenCalledWith(
      "[SOVEREIGN_PROMPTS_REFUSED] agent:main code=transform_altered route=codex site=app_server_handoff:thread/start",
      expect.objectContaining({ event: "sovereign_prompts.refused", agentId: "main" }),
    );
  });

  it("refuses spans from a generation this process did not load for the agent", async () => {
    const config = writeAgents();
    const { base, spans } = render(config, "main");
    const outcome = await capture(() =>
      check(config, "main", { ...spans!, setDigest: "0".repeat(64) }, [base]),
    );
    expect(outcome.error).toMatchObject({ code: "transform_altered" });
  });

  it("checks nothing and records nothing for an off agent", async () => {
    const config = writeAgents();
    const { base, spans } = render(config, "plain");
    expect(spans).toBeUndefined();
    expect(check(config, "plain", undefined, [base])).toBeUndefined();
    expect(sovereignWarn).not.toHaveBeenCalled();
  });
});
