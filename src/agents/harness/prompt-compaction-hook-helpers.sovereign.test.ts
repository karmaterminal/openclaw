// The harness before_prompt_build site (#1321): a replacement there also withdraws the
// Codex base, so for a sovereign prompt agent it fails the run, outside the hook's catch.
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/types.js";
import {
  initializeGlobalHookRunner,
  resetGlobalHookRunner,
} from "../../plugins/hook-runner-global.js";
import { createMockPluginRegistry } from "../../plugins/hooks.test-fixtures.js";
import { resetSovereignPromptRuntimeForTests } from "../sovereign-prompts/runtime.js";
import { SovereignPromptRefusal } from "../sovereign-prompts/snapshot.js";
import { resolveAgentHarnessBeforePromptBuildResult } from "./prompt-compaction-hook-helpers.js";

afterEach(() => {
  resetGlobalHookRunner();
  resetSovereignPromptRuntimeForTests();
});

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

function build(config: OpenClawConfig, result: Record<string, unknown>) {
  initializeGlobalHookRunner(
    createMockPluginRegistry([{ hookName: "before_prompt_build", handler: () => result }]),
  );
  return resolveAgentHarnessBeforePromptBuildResult({
    prompt: "hello",
    developerInstructions: "base",
    messages: [],
    ctx: { config, agentId: "main", runId: "sovereign-harness" },
  });
}

describe("harness before_prompt_build for a sovereign prompt agent", () => {
  it.each(["Plugin replacement prompt", ""])(
    "refuses a replacement (%j) instead of withdrawing the base",
    async (systemPrompt) => {
      const outcome = await build(configFor("enforce"), { systemPrompt }).catch(
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(SovereignPromptRefusal);
      expect(outcome).toMatchObject({
        code: "sovereign_override_denied",
        details: { site: "harness_before_prompt_build" },
      });
    },
  );

  it("keeps prepend context, and an off agent's replacement still applies", async () => {
    const added = await build(configFor("enforce"), { prependSystemContext: "Plugin prepend" });
    expect(added.systemPromptReplaced).toBeUndefined();
    expect(added.developerInstructions).toContain("Plugin prepend");
    expect(added.developerInstructions).toContain("base");
    const replaced = await build(configFor(), { systemPrompt: "Plugin replacement prompt" });
    expect(replaced.systemPromptReplaced).toBe(true);
    expect(replaced.developerInstructions).toBe("Plugin replacement prompt");
  });
});
