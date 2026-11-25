import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createCanonicalAgentConfigFixture } from "../test-utils/config-roster.js";
import { createAgentHarnessToolSurfaceRuntimeCore } from "./harness/tool-surface-bridge.js";
import { createOpenClawContinuationTools } from "./openclaw-tools.continuation.js";
import { buildAgentSystemPrompt } from "./system-prompt.js";
import { createStubTool } from "./test-helpers/agent-tool-stubs.js";
import { createSessionsYieldTool } from "./tools/sessions-yield-tool.js";

// Continuation tools must be known the way exec is: direct provider tools listed
// under ## Tooling even when Tool Search (on when tools.toolSearch is unset)
// catalogs everything else. Availability stays with the continuation owner.
const runtimes: ReturnType<typeof createAgentHarnessToolSurfaceRuntimeCore>[] = [];
afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.cleanup()));

function buildSurface(tools: OpenClawConfig["tools"], continuation = true) {
  const { config } = createCanonicalAgentConfigFixture({
    agents: { defaults: { continuation: { enabled: continuation } } },
    ...(tools ? { tools } : {}),
  });
  const requestContinuation = vi.fn();
  // Above the 70% guard: a dispatched request_compaction would reach its trigger.
  const getContextUsage = vi.fn(() => 0.9);
  const triggerCompaction = vi.fn(async () => ({ ok: true, compacted: true }));
  const runtime = createAgentHarnessToolSurfaceRuntimeCore({
    config,
    modelToolsEnabled: true,
    executeTool: async () => ({ content: [], details: {} }),
  });
  runtimes.push(runtime);
  const surface = runtime.compactTools([
    ...createOpenClawContinuationTools({
      config,
      agentSessionKey: "agent:main:main",
      sessionId: "session-1",
      continueWorkOpts: { requestContinuation },
      requestCompactionOpts: {
        sessionId: "session-1",
        contextUsageOrigin: "live_runner",
        getContextUsage,
        triggerCompaction,
      },
    }),
    createSessionsYieldTool({ sessionId: "session-1" }),
    createStubTool("fixture_lookup"),
  ]);
  const names = surface.tools.map((tool) => tool.name);
  const catalog = runtime.toolSearchCatalogRef?.current?.entries.map((entry) => entry.name);
  const tooling = (directory?: string) =>
    buildAgentSystemPrompt({
      workspaceDir: "/tmp/openclaw",
      continuationEnabled: true,
      toolNames: names,
      toolSchemaDirectoryPrompt: directory,
    })
      .split("Tools policy-filtered. Names case-sensitive; call exact.\n")[1]
      ?.split("The AGENTS.md Tools section guides usage")[0]
      ?.split("### Deferred Tool Schemas");
  const expectNoneRan = () => {
    expect(requestContinuation).not.toHaveBeenCalled();
    expect(getContextUsage).not.toHaveBeenCalled();
    expect(triggerCompaction).not.toHaveBeenCalled();
  };
  return { surface, names, catalog, tooling, expectNoneRan };
}

const search = ["tool_search", "tool_describe", "dispatch_action"];
const direct = ["continue_work", "continue_delegate", "request_compaction", "sessions_yield"];
const continuationNames = /continue_|request_compaction/;
const workLine =
  "- continue_work: Take your own next turn, now or after a delay; no message needed.";
const delegateLine =
  "- continue_delegate: Run bounded work beside you; its result returns to you (`silent-wake` wakes you), a session, the tree, or all.";
const compactionLine = /^- request_compaction\b/m;

describe("continuation tools beside sessions_yield on cataloged tool surfaces", () => {
  it.each([
    ["Tool Search default (unset)", undefined, search],
    ["Tool Search directory", { codeMode: false, toolSearch: { mode: "directory" } }, search],
    ["Code Mode", { codeMode: true }, ["exec", "wait"]],
  ] as const)("keeps them direct, never deferred: %s", async (_label, tools, controls) => {
    const { surface, names, catalog, tooling, expectNoneRan } = buildSurface(tools);
    expect(names).toEqual([...controls, ...direct]);
    expect(catalog).toEqual(["fixture_lookup"]);
    const directory = surface.promptToolPolicy.apply().toolSchemaDirectoryPrompt;
    expect(directory).toContain("fixture_lookup");
    expect(directory).not.toMatch(continuationNames);
    const [list, deferred] = tooling(directory) ?? [];
    expect(list).toContain(`- sessions_yield: End turn; await subagent events\n${workLine}`);
    expect(list).toContain(delegateLine);
    expect(list).toMatch(compactionLine);
    expect(deferred).toContain("fixture_lookup");
    expect(deferred).not.toMatch(continuationNames);
    const dispatch = surface.tools.find((tool) => tool.name === "dispatch_action");
    for (const id of dispatch ? direct : []) {
      await expect(dispatch?.execute("call-1", { id, args: {} })).rejects.toThrow(
        "Call it directly by its declared name",
      );
    }
    expectNoneRan();
  });

  it("stays absent from direct and deferred surfaces when continuation is disabled", () => {
    const { surface, names, catalog, tooling } = buildSurface(undefined, false);
    expect(names).toEqual([...search, "sessions_yield"]);
    expect(catalog).toEqual(["fixture_lookup"]);
    const directory = surface.promptToolPolicy.apply().toolSchemaDirectoryPrompt;
    expect(directory).toContain("fixture_lookup");
    expect(`${directory}${tooling(directory)?.join("")}`).not.toMatch(continuationNames);
  });

  it("lets a turn's tool policy remove one or more, direct or deferred", async () => {
    const { surface, expectNoneRan } = buildSurface(undefined);
    const turn = surface.promptToolPolicy.apply({
      toolsAllow: ["continue_delegate", "sessions_yield", "fixture_lookup"],
    });
    expect(turn.tools.map((tool) => tool.name)).toEqual([
      ...search,
      "continue_delegate",
      "sessions_yield",
    ]);
    expect(turn.callableToolNames).not.toContain("continue_work");
    expect(turn.callableToolNames).not.toContain("request_compaction");
    expect(turn.toolSchemaDirectoryPrompt).not.toMatch(continuationNames);
    const dispatch = surface.tools.find((tool) => tool.name === "dispatch_action");
    for (const id of ["continue_work", "request_compaction"]) {
      await expect(dispatch?.execute("call-2", { id, args: { reason: "x" } })).rejects.toThrow(
        "Use tool_search",
      );
    }
    expectNoneRan();
  });

  it("is unchanged with Tool Search off: all direct, no catalog", () => {
    const { names, catalog, tooling } = buildSurface({ codeMode: false, toolSearch: false });
    expect(names).toEqual([...direct, "fixture_lookup"]);
    expect(catalog).toBeUndefined();
    expect(tooling()?.[0]).toContain(`${workLine}\n${delegateLine}`);
    expect(tooling()?.[0]).toMatch(compactionLine);
  });
});
