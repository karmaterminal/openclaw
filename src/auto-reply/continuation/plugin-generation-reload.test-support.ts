// A delayed continuation armed inside one plugin generation's reply turn fires
// after a reload published the next one. Its re-entry must admit on the
// generation current at fire time, as upstream's detached queue paths do.
import { AsyncResource } from "node:async_hooks";
import { vi } from "vitest";
import {
  getPreparedModelRuntimePluginGeneration,
  withPreparedModelRuntimePluginGenerationScope,
} from "../../agents/prepared-model-runtime-generation-scope.js";
import { acquirePreparedModelRuntimeSnapshotInvocation } from "../../agents/prepared-model-runtime.resources.js";
import type { PreparedModelRuntimePluginGeneration } from "../../agents/prepared-model-runtime.types.js";
import { createTestInstance } from "../../plugins/plugin-instance.test-support.js";
import { createEmptyPluginMetadataSnapshot } from "../../plugins/plugin-metadata-empty.test-support.js";
import { createEmptyPluginRegistry } from "../../plugins/registry-empty.js";
import type { PluginRegistry } from "../../plugins/registry-types.js";
import {
  captureActivePluginRegistrySnapshot,
  restoreActivePluginRegistrySnapshot,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
import { getPluginRegistryForContext } from "../../plugins/runtime/gateway-request-scope.js";
import {
  getPluginRuntimeGenerationRegistry,
  withPluginRuntimeGenerationScope,
} from "../../plugins/runtime/generation-scope.js";
import { createPluginRecord } from "../../plugins/status.test-helpers.js";

export type ObservedPluginGeneration = {
  registry: string | undefined;
  generationRegistry: string | undefined;
  preparedGeneration: string | undefined;
  plugin: string | undefined;
};

/** The generation a continuation re-entry admits on after the reload. */
export const CURRENT_PLUGIN_GENERATION: ObservedPluginGeneration = {
  registry: "current",
  generationRegistry: undefined,
  preparedGeneration: undefined,
  plugin: "current",
};

/**
 * Node timers run in the async context that armed them; vitest's fake timers run
 * in the advancing caller's. Restore the real inheritance under test.
 */
export function inheritArmingContextInFakeTimers() {
  const fakeSetTimeout = globalThis.setTimeout;
  return vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation((callback, delay) => fakeSetTimeout(AsyncResource.bind(callback), delay));
}

/**
 * One plugin, two generations. `generationOverlap` is the manifest opt-in: only an
 * opted-in plugin keeps its predecessor turn admitted across the reload.
 */
export function createPluginGenerationReload(generationOverlap: boolean) {
  const createGeneration = (label: string) => {
    const registry = createEmptyPluginRegistry();
    const record = createPluginRecord({
      id: "reloaded-plugin",
      status: "loaded",
      generationOverlap,
    });
    registry.plugins.push(record);
    const instance = createTestInstance(record.id, { record, registry });
    return { label, registry, instance, tool: instance.wrap(() => label) };
  };
  const previous = createGeneration("previous");
  const current = createGeneration("current");
  const metadataSnapshot = createEmptyPluginMetadataSnapshot();
  const preparedGeneration: PreparedModelRuntimePluginGeneration = {
    remoteCatalog: null,
    pluginMetadataSnapshot: metadataSnapshot,
    inlineProviderModels: [],
    configuredCatalogEntries: [],
    pluginRegistry: previous.registry,
  };
  const original = captureActivePluginRegistrySnapshot();
  setActivePluginRegistry(previous.registry);
  // The production admission: a retained invocation exists only for opted-in plugins.
  const turn = acquirePreparedModelRuntimeSnapshotInvocation({ pluginRegistry: previous.registry });
  const label = (registry: PluginRegistry | null | undefined) =>
    [previous, current].find((generation) => generation.registry === registry)?.label;
  return {
    /** Runs inside the predecessor's reply turn, composed as get-reply-run composes it. */
    armInPredecessorTurn<T>(arm: () => T): T {
      return turn.run(() =>
        withPreparedModelRuntimePluginGenerationScope(preparedGeneration, () =>
          withPluginRuntimeGenerationScope(
            { metadataSnapshot, pluginRegistry: previous.registry },
            arm,
          ),
        ),
      );
    },
    /** Publishes the successor; the predecessor turn then ends and releases its admission. */
    async reload(): Promise<void> {
      setActivePluginRegistry(current.registry);
      previous.instance.quiesce();
      await turn.release();
    },
    /** What a re-entry admits on: its registry, inherited pins, and the plugin it reaches. */
    observe(): ObservedPluginGeneration {
      const registry = getPluginRegistryForContext();
      const tool = [previous, current].find((generation) => generation.registry === registry)?.tool;
      let plugin: string | undefined;
      try {
        plugin = tool?.();
      } catch (error) {
        plugin = error instanceof Error ? error.message : String(error);
      }
      const prepared = getPreparedModelRuntimePluginGeneration();
      return {
        registry: label(registry),
        generationRegistry: label(getPluginRuntimeGenerationRegistry()),
        preparedGeneration: prepared === preparedGeneration ? "previous" : prepared && "unknown",
        plugin,
      };
    },
    async dispose(): Promise<void> {
      await turn.release();
      restoreActivePluginRegistrySnapshot(original);
    },
  };
}
