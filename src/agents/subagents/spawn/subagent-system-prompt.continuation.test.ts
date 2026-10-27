import { expect, it } from "vitest";
import {
  buildSubagentSpawnEnvelope,
  buildSubagentStandingInstructions,
} from "./subagent-system-prompt.js";

// Continuation (karmaterminal): the spawn envelope's chaining and self-continuation guidance
// follows upstream's standing child policy after the "\n\n" boundary embedded prepare strips.
const base = {
  completionMode: "announce",
  spawnMode: "run",
  childSessionKey: "agent:main:subagent:child",
  task: "Synthetic task.",
  childDepth: 1,
  maxSpawnDepth: 2,
} as const;

it("appends tool-primary chaining and self-continuation after the standing policy", () => {
  const { systemPrompt, message } = buildSubagentSpawnEnvelope({
    ...base,
    continuationEnabled: true,
    toolNames: ["continue_work", "continue_delegate"],
  });
  expect(systemPrompt.startsWith(`${buildSubagentStandingInstructions(base)}\n\n`)).toBe(true);
  expect(systemPrompt).toContain("## Continuation Chaining\nUse the `continue_delegate` tool");
  expect(systemPrompt).toContain("## Self-Continuation\nUse `continue_work`");
  expect(message).not.toMatch(/Continuation Chaining|Self-Continuation/);
});

it("teaches bracket chaining without the tool, and only self-continuation to a leaf", () => {
  const bracket = buildSubagentSpawnEnvelope({
    ...base,
    continuationEnabled: true,
    toolNames: ["continue_work"],
  });
  expect(bracket.systemPrompt).toContain("end your ENTIRE response with:");
  const leaf = buildSubagentSpawnEnvelope({
    ...base,
    childDepth: 2,
    continuationEnabled: true,
    toolNames: ["continue_work"],
  });
  expect(leaf.systemPrompt).not.toContain("## Continuation Chaining");
  expect(leaf.systemPrompt).toContain("## Self-Continuation");
});

it("keeps upstream's exact standing policy when continuation is off", () => {
  const { systemPrompt } = buildSubagentSpawnEnvelope({
    ...base,
    continuationEnabled: false,
    toolNames: ["continue_work", "continue_delegate"],
  });
  expect(systemPrompt).toBe(buildSubagentStandingInstructions(base));
});
