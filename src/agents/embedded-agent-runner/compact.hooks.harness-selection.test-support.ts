import { vi } from "vitest";
import type { AgentHarness } from "../harness/types.js";

export const resolveAgentHarnessPolicyMock = vi.fn(() => ({ runtime: "openclaw" }));
export const resolveSelectedOpenAIRuntimeProviderMock = vi.fn(
  (params: { provider: string }) => params.provider,
);
export function createSelectedAgentHarnessMock(params: {
  agentHarnessId?: string;
  agentHarnessRuntimeOverride?: string;
}): AgentHarness {
  const configured = resolveAgentHarnessPolicyMock() as { runtime?: string };
  const id =
    params.agentHarnessId ?? params.agentHarnessRuntimeOverride ?? configured.runtime ?? "openclaw";
  return {
    id,
    label: `${id} test harness`,
    ...(id === "codex" ? { authBootstrap: "harness" as const } : {}),
    supports: () => ({ supported: true }),
    runAttempt: vi.fn(),
  };
}
export const selectAgentHarnessMock = vi.fn(createSelectedAgentHarnessMock);
export const selectAgentHarnessForPreparedModelProvidersMock = vi.fn(
  createSelectedAgentHarnessMock,
);

/** Registers the harness policy, OpenAI routing, runtime plugin, and selection mocks. */
export function mockCompactHooksHarnessSelection(): void {
  vi.doMock("../harness/policy.js", () => ({
    resolveAgentHarnessPolicy: resolveAgentHarnessPolicyMock,
  }));
  vi.doMock("../openai-routing.js", async () => {
    const actual =
      await vi.importActual<typeof import("../openai-routing.js")>("../openai-routing.js");
    return {
      ...actual,
      resolveSelectedOpenAIRuntimeProvider: resolveSelectedOpenAIRuntimeProviderMock,
    };
  });
  vi.doMock("../harness/runtime-plugin.js", () => ({
    ensureSelectedAgentHarnessPlugin: vi.fn(async () => undefined),
  }));

  vi.doMock("../harness/selection.js", async () => {
    const actual =
      await vi.importActual<typeof import("../harness/selection.js")>("../harness/selection.js");
    return {
      ...actual,
      selectAgentHarness: selectAgentHarnessMock,
      selectAgentHarnessForPreparedModelProviders: selectAgentHarnessForPreparedModelProvidersMock,
    };
  });
}
