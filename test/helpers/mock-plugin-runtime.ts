import { vi } from "vitest";
import { createEmptyPluginRegistry } from "../../src/plugins/registry-empty.js";
import type { PluginRegistry } from "../../src/plugins/registry-types.js";

type PluginRuntimeModule = typeof import("../../src/plugins/runtime.js");
type MockOverrides<T extends object> = Partial<Record<keyof T, unknown>>;

function emptyRegistry(): PluginRegistry {
  return createEmptyPluginRegistry();
}

export function buildPluginRuntimeMock(
  overrides: MockOverrides<PluginRuntimeModule> = {},
): PluginRuntimeModule {
  const defaults = {
    recordImportedPluginId: vi.fn(),
    setActivePluginRegistry: vi.fn(),
    getActivePluginRegistry: vi.fn(() => null),
    getActivePluginRegistryWorkspaceDir: vi.fn(() => undefined),
    requireActivePluginRegistry: vi.fn(emptyRegistry),
    pinActivePluginHttpRouteRegistry: vi.fn(),
    releasePinnedPluginHttpRouteRegistry: vi.fn(),
    getActivePluginHttpRouteRegistry: vi.fn(() => null),
    getActivePluginHttpRouteRegistryVersion: vi.fn(() => 0),
    requireActivePluginHttpRouteRegistry: vi.fn(emptyRegistry),
    resolveActivePluginHttpRouteRegistry: vi.fn((fallback: PluginRegistry) => fallback),
    pinActivePluginChannelRegistry: vi.fn(),
    releasePinnedPluginChannelRegistry: vi.fn(),
    getActivePluginChannelRegistry: vi.fn(() => null),
    getActivePluginChannelRegistryVersion: vi.fn(() => 0),
    requireActivePluginChannelRegistry: vi.fn(emptyRegistry),
    getActivePluginRegistryKey: vi.fn(() => null),
    getActivePluginRuntimeSubagentMode: vi.fn(() => "default" as const),
    getActivePluginRegistryVersion: vi.fn(() => 0),
    listImportedRuntimePluginIds: vi.fn(() => []),
    resetPluginRuntimeStateForTest: vi.fn(),
  } satisfies PluginRuntimeModule;
  return {
    ...defaults,
    ...overrides,
  } as PluginRuntimeModule;
}
