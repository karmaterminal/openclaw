/**
 * Continuation coverage for effective tool inventory resolution.
 * Verifies the inventory threads stub continuation callbacks into tool creation only when
 * continuation is enabled; the shared inventory contract lives in tools-effective-inventory.test.ts.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import type { createOpenClawCodingToolsInternal } from "./agent-tools.js";
import type { AnyAgentTool } from "./tools/common.js";

function mockTool(params: { name: string; label: string; description: string }): AnyAgentTool {
  return {
    ...params,
    parameters: { type: "object", properties: {} },
    execute: async () => ({ text: params.description }),
  } as unknown as AnyAgentTool;
}

const effectiveInventoryState = vi.hoisted(() => ({
  createToolsMock: vi.fn<typeof createOpenClawCodingToolsInternal>(() => []),
}));

vi.mock("./agent-scope.js", async () => {
  const actual = await vi.importActual<typeof import("./agent-scope.js")>("./agent-scope.js");
  return {
    ...actual,
    resolveSessionAgentId: () => "main",
    resolveAgentWorkspaceDir: () => "/tmp/workspace-main",
    resolveAgentDir: () => "/tmp/agents/main/agent",
  };
});

vi.mock("./agent-tools.js", () => ({
  createOpenClawCodingToolsInternalAsync: async (
    options?: Parameters<typeof createOpenClawCodingToolsInternal>[0],
  ) => effectiveInventoryState.createToolsMock(options),
}));

vi.mock("./auth-profiles/source-check.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth-profiles/source-check.js")>()),
  hasAnyAuthProfileStoreSourceAsync: async () => false,
}));

vi.mock("./embedded-agent-runner/tool-schema-runtime.js", () => ({
  normalizeProviderToolSchemas: (options: { tools: AnyAgentTool[] }) => options.tools,
  logProviderToolSchemaDiagnostics: vi.fn(),
}));

vi.mock("./embedded-agent-runner/model.static-catalog.js", () => ({
  resolveBundledStaticCatalogModel: () => undefined,
}));

vi.mock("./embedded-agent-runner/model.js", () => ({
  resolveModelAsync: vi.fn(),
}));

vi.mock("../plugins/provider-runtime.js", () => ({
  normalizeProviderTransportWithPlugin: () => undefined,
}));

let resolveEffectiveToolInventory: typeof import("./tools-effective-inventory.js").resolveEffectiveToolInventory;

describe("resolveEffectiveToolInventory continuation tools", () => {
  beforeAll(async () => {
    ({ resolveEffectiveToolInventory } = await import("./tools-effective-inventory.js"));
  });

  beforeEach(() => {
    effectiveInventoryState.createToolsMock = vi.fn<typeof createOpenClawCodingToolsInternal>(
      () => [mockTool({ name: "exec", label: "Exec", description: "Run shell commands" })],
    );
    setActivePluginRegistry(createEmptyPluginRegistry());
  });

  it("threads requestCompactionOpts when continuation.enabled is true", async () => {
    await resolveEffectiveToolInventory({
      cfg: { agents: { defaults: { continuation: { enabled: true } } } },
    });

    expect(effectiveInventoryState.createToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestCompactionOpts: expect.objectContaining({
          getContextUsage: expect.any(Function),
          triggerCompaction: expect.any(Function),
        }),
      }),
    );
  });

  it("threads continueWorkOpts when continuation.enabled is true", async () => {
    await resolveEffectiveToolInventory({
      cfg: { agents: { defaults: { continuation: { enabled: true } } } },
    });

    expect(effectiveInventoryState.createToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        continueWorkOpts: expect.objectContaining({
          requestContinuation: expect.any(Function),
        }),
      }),
    );
  });

  it("omits requestCompactionOpts when continuation.enabled is not true", async () => {
    await resolveEffectiveToolInventory({ cfg: {} });

    expect(effectiveInventoryState.createToolsMock).toHaveBeenCalledTimes(1);
    const passed = effectiveInventoryState.createToolsMock.mock.calls[0]?.[0];
    expect(passed?.requestCompactionOpts).toBeUndefined();
    expect(passed?.continueWorkOpts).toBeUndefined();
  });
});
