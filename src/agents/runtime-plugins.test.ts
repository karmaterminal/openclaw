import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  resolveCompatibleRuntimePluginRegistry: vi.fn(),
  resolveRuntimePluginRegistry: vi.fn(),
  getGatewayBindablePluginRegistry: vi.fn(),
}));

vi.mock("../plugins/loader.js", () => ({
  resolveCompatibleRuntimePluginRegistry: hoisted.resolveCompatibleRuntimePluginRegistry,
  resolveRuntimePluginRegistry: hoisted.resolveRuntimePluginRegistry,
}));

vi.mock("../plugins/runtime.js", () => ({
  getGatewayBindablePluginRegistry: hoisted.getGatewayBindablePluginRegistry,
}));

describe("ensureRuntimePluginsLoaded", () => {
  let ensureRuntimePluginsLoaded: typeof import("./runtime-plugins.js").ensureRuntimePluginsLoaded;
  let ensureRuntimePluginsLoadedReadOnly: typeof import("./runtime-plugins.js").ensureRuntimePluginsLoadedReadOnly;

  beforeEach(async () => {
    hoisted.resolveCompatibleRuntimePluginRegistry.mockReset();
    hoisted.resolveCompatibleRuntimePluginRegistry.mockReturnValue(undefined);
    hoisted.resolveRuntimePluginRegistry.mockReset();
    hoisted.resolveRuntimePluginRegistry.mockReturnValue(undefined);
    hoisted.getGatewayBindablePluginRegistry.mockReset();
    hoisted.getGatewayBindablePluginRegistry.mockReturnValue(null);
    vi.resetModules();
    ({ ensureRuntimePluginsLoaded, ensureRuntimePluginsLoadedReadOnly } =
      await import("./runtime-plugins.js"));
  });

  it("reuses a pinned gateway-bindable registry without forcing a fresh load", async () => {
    hoisted.getGatewayBindablePluginRegistry.mockReturnValue({});

    ensureRuntimePluginsLoaded({
      config: {} as never,
      workspaceDir: "/tmp/workspace",
      allowGatewaySubagentBinding: true,
    });

    expect(hoisted.resolveRuntimePluginRegistry).not.toHaveBeenCalled();
  });

  it("resolves runtime plugins through the shared runtime helper", async () => {
    ensureRuntimePluginsLoaded({
      config: {} as never,
      workspaceDir: "/tmp/workspace",
      allowGatewaySubagentBinding: true,
    });

    expect(hoisted.resolveRuntimePluginRegistry).toHaveBeenCalledWith({
      config: {} as never,
      workspaceDir: "/tmp/workspace",
      runtimeOptions: {
        allowGatewaySubagentBinding: true,
      },
    });
  });

  it("treats a pinned gateway-bindable registry as read-only compatible", async () => {
    hoisted.getGatewayBindablePluginRegistry.mockReturnValue({});

    expect(
      ensureRuntimePluginsLoadedReadOnly({
        config: {} as never,
        workspaceDir: "/tmp/workspace",
        allowGatewaySubagentBinding: true,
      }),
    ).toBe(true);
    expect(hoisted.resolveCompatibleRuntimePluginRegistry).not.toHaveBeenCalled();
  });

  it("uses compatible runtime lookup for read-only lifecycle checks", async () => {
    hoisted.resolveCompatibleRuntimePluginRegistry.mockReturnValue({});

    expect(
      ensureRuntimePluginsLoadedReadOnly({
        config: {} as never,
        workspaceDir: "/tmp/workspace",
        allowGatewaySubagentBinding: true,
      }),
    ).toBe(true);
    expect(hoisted.resolveCompatibleRuntimePluginRegistry).toHaveBeenCalledWith({
      config: {} as never,
      workspaceDir: "/tmp/workspace",
      runtimeOptions: {
        allowGatewaySubagentBinding: true,
      },
    });
  });
});
