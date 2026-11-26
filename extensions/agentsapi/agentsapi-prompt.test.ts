import { useAutoCleanupTempDirTracker } from "openclaw/plugin-sdk/test-env";
import { afterEach, expect, it } from "vitest";
import { createAttemptParams } from "./agentsapi-attempt.test-helpers.js";
import { buildAgentsApiInstructions } from "./agentsapi-prompt.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

// The native session keeps these instructions, so the continuation guide rides them once.
it.each([
  ["full", true, "### Self-elected turns"],
  ["minimal", true, "## Chain Delegation"],
  ["full", false, "### Self-elected turns"],
] as const)("carries the %s continuation guide (enabled: %s)", async (mode, enabled, heading) => {
  const params = createAttemptParams({
    workspaceDir: tempDirs.make("openclaw-agentsapi-prompt-"),
    promptMode: mode,
    config: { agents: { defaults: { continuation: { enabled } } } },
  });
  const tools = ["continue_work", "continue_delegate"].map((name) => ({
    type: "function" as const,
    name,
    description: `Fixture ${name} tool`,
    parameters: { type: "object", properties: {} },
  }));
  const instructions = await buildAgentsApiInstructions(params, tools, { type: "openai_hosted" });
  expect(instructions.includes(heading)).toBe(enabled);
  expect(
    instructions.includes(
      "You control your own turn cycle: `continue_work`, `continue_delegate` are how.",
    ),
  ).toBe(enabled);
});
