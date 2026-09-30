// Verifies agent concurrency config defaults and limits.
import { expect, it } from "vitest";
import {
  DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT,
  resolveAgentMaxConcurrent,
  resolveSubagentMaxConcurrent,
} from "./agent-limits.js";
import { OpenClawSchema } from "./zod-schema.js";

it("clamps invalid agent concurrency limits to at least one", () => {
  const config = { agents: { defaults: { maxConcurrent: 0, subagents: { maxConcurrent: -3 } } } };
  expect(resolveAgentMaxConcurrent(config)).toBe(1);
  expect(resolveSubagentMaxConcurrent(config)).toBe(1);
});

it("rejects maxChildrenPerAgent above schema ceiling (10000)", () => {
  expect(() =>
    OpenClawSchema.parse({
      agents: {
        defaults: {
          subagents: { maxChildrenPerAgent: 10001 },
        },
        entries: { main: { default: true } },
      },
    }),
  ).toThrow();
});

it("accepts maxChildrenPerAgent at schema ceiling (10000)", () => {
  const parsed = OpenClawSchema.parse({
    agents: {
      defaults: {
        subagents: { maxChildrenPerAgent: 10000 },
      },
      entries: { main: { default: true } },
    },
  });
  expect(parsed.agents?.defaults?.subagents?.maxChildrenPerAgent).toBe(10000);
});

it("uses the established maxChildrenPerAgent default", () => {
  expect(DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT).toBe(5);
});
