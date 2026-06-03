import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_MAX_CONCURRENT,
  DEFAULT_SUBAGENT_ARCHIVE_AFTER_MINUTES,
  DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT,
  DEFAULT_SUBAGENT_MAX_CONCURRENT,
  resolveAgentMaxConcurrent,
  resolveSubagentMaxConcurrent,
} from "./agent-limits.js";
import { DEFAULT_CRON_MAX_CONCURRENT_RUNS, resolveCronMaxConcurrentRuns } from "./cron-limits.js";
import { applyAgentDefaults } from "./defaults.js";
import { OpenClawSchema } from "./zod-schema.js";

describe("agent concurrency defaults", () => {
  it("resolves defaults when unset", () => {
    expect(resolveAgentMaxConcurrent({})).toBe(DEFAULT_AGENT_MAX_CONCURRENT);
    expect(resolveSubagentMaxConcurrent({})).toBe(DEFAULT_SUBAGENT_MAX_CONCURRENT);
    expect(resolveCronMaxConcurrentRuns()).toBe(DEFAULT_CRON_MAX_CONCURRENT_RUNS);
  });

  it("clamps invalid values to at least 1", () => {
    const cfg = {
      agents: {
        defaults: {
          maxConcurrent: 0,
          subagents: { maxConcurrent: -3 },
        },
      },
    };
    expect(resolveAgentMaxConcurrent(cfg)).toBe(1);
    expect(resolveSubagentMaxConcurrent(cfg)).toBe(1);
    expect(resolveCronMaxConcurrentRuns({ maxConcurrentRuns: 0 })).toBe(1);
  });

  it("accepts subagent spawn depth and per-agent child limits", () => {
    const parsed = OpenClawSchema.parse({
      agents: {
        defaults: {
          subagents: {
            maxSpawnDepth: 2,
            maxChildrenPerAgent: 7,
          },
        },
      },
    });

    expect(parsed.agents?.defaults?.subagents?.maxSpawnDepth).toBe(2);
    expect(parsed.agents?.defaults?.subagents?.maxChildrenPerAgent).toBe(7);
  });

  it("injects missing agent defaults", () => {
    const cfg = applyAgentDefaults({});

    expect(cfg.agents?.defaults?.maxConcurrent).toBe(DEFAULT_AGENT_MAX_CONCURRENT);
    expect(cfg.agents?.defaults?.subagents?.maxConcurrent).toBe(DEFAULT_SUBAGENT_MAX_CONCURRENT);
    expect(cfg.agents?.defaults?.subagents?.archiveAfterMinutes).toBe(
      DEFAULT_SUBAGENT_ARCHIVE_AFTER_MINUTES,
    );
  });

  // cure #871: the maxChildrenPerAgent default deterministically bit 6+ delegate
  // fanout patterns at the prior value of 5 (PROOFS R-CD-CHAINED-DEPTH-2/Chain-3
  // at 4896c3129b). 20 gives ~4x headroom over the empirical bite-threshold for
  // prince-fanout patterns while keeping unbounded explosion in check.
  it("pins maxChildrenPerAgent default at 20 (cure #871: prince-fanout headroom)", () => {
    expect(DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT).toBe(20);
    // Sanity guard: not so high that a misconfigured agent could runaway-fork.
    // 20 is the figs-aligned canon; anything > 100 should make us pause and ask why.
    expect(DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT).toBeLessThanOrEqual(100);
  });
});
