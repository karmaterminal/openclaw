import { onTestFinished, vi } from "vitest";
import type { createOpenClawCodingToolsInternal } from "../../../agents/agent-tools.js";

type ToolsFactory = typeof createOpenClawCodingToolsInternal;
let createTools: ToolsFactory | undefined;
const factories = new Map<string, ToolsFactory>();
// Runs whose factory is executing: a factory that extends the real surface through the
// public builder re-enters this spy, and that inner build must be the real one.
const activeRuns = new Set<string>();

/** Substitutes construction while preserving the real host's private authority and bindings. */
export async function setHostToolFactoryForTest(
  params: { runId: string },
  factory: ToolsFactory,
): Promise<void> {
  const agentTools = await import("../../../agents/agent-tools.js");
  const actual = (createTools ??= agentTools.createOpenClawCodingToolsInternal);
  factories.set(params.runId, factory);
  const spy = vi
    .spyOn(agentTools, "createOpenClawCodingToolsInternal")
    .mockImplementation((...args) => {
      const runId = args[0]?.runId;
      const runFactory = runId && !activeRuns.has(runId) ? factories.get(runId) : undefined;
      if (!runId || !runFactory) {
        return actual(...args);
      }
      activeRuns.add(runId);
      try {
        return runFactory(...args);
      } finally {
        activeRuns.delete(runId);
      }
    });
  onTestFinished(() => {
    factories.clear();
    activeRuns.clear();
    spy.mockRestore();
  });
}
