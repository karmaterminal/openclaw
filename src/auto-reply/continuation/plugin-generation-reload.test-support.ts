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
import type {
  PreparedModelRuntimePluginGeneration,
  PreparedReplyDispatchRuntime,
} from "../../agents/prepared-model-runtime.types.js";
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
import {
  bindPreparedReplyDispatchRuntime,
  getPreparedReplyDispatchRuntime,
} from "../reply/prepared-reply-dispatch-context.js";

export type ObservedPluginGeneration = {
  registry: string | undefined;
  generationRegistry: string | undefined;
  preparedGeneration: string | undefined;
  dispatchGeneration: string | undefined;
  plugin: string | undefined;
};

/** The generation a continuation re-entry admits on after the reload. */
export const CURRENT_PLUGIN_GENERATION: ObservedPluginGeneration = {
  registry: "current",
  generationRegistry: undefined,
  preparedGeneration: undefined,
  dispatchGeneration: undefined,
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
  const dispatchRuntime: PreparedReplyDispatchRuntime = {
    agentId: "main",
    agentDir: "/synthetic/agent",
    workspaceDir: "/synthetic/workspace",
    config: {},
    modelCatalog: { entries: [], routeVariants: [] },
    inboundPluginRegistry: previous.registry,
    pluginGeneration: preparedGeneration,
  };
  const original = captureActivePluginRegistrySnapshot();
  setActivePluginRegistry(previous.registry);
  // The production admission: a retained invocation exists only for opted-in plugins.
  const turn = acquirePreparedModelRuntimeSnapshotInvocation({ pluginRegistry: previous.registry });
  const generationOf = (registry: PluginRegistry | null | undefined) =>
    [previous, current].find((generation) => generation.registry === registry);
  return {
    /** Runs inside the predecessor's reply turn, composed as dispatch and get-reply-run compose it. */
    armInPredecessorTurn<T>(arm: () => T): T {
      return bindPreparedReplyDispatchRuntime(dispatchRuntime, () =>
        turn.run(() =>
          withPreparedModelRuntimePluginGenerationScope(preparedGeneration, () =>
            withPluginRuntimeGenerationScope(
              { metadataSnapshot, pluginRegistry: previous.registry },
              arm,
            ),
          ),
        ),
      )();
    },
    /** Publishes the successor; the predecessor turn then ends and releases its admission. */
    async reload(): Promise<void> {
      setActivePluginRegistry(current.registry);
      previous.instance.quiesce();
      await turn.release();
    },
    /** What a re-entry admits on: its registry, inherited pins, and the plugin it reaches. */
    observe(): ObservedPluginGeneration {
      const resolved = generationOf(getPluginRegistryForContext());
      let plugin: string | undefined;
      try {
        plugin = resolved?.tool();
      } catch (error) {
        plugin = error instanceof Error ? error.message : String(error);
      }
      const pin = (generation: PreparedModelRuntimePluginGeneration | undefined) =>
        generation === preparedGeneration ? "previous" : generation && "unknown";
      return {
        registry: resolved?.label,
        generationRegistry: generationOf(getPluginRuntimeGenerationRegistry())?.label,
        preparedGeneration: pin(getPreparedModelRuntimePluginGeneration()),
        dispatchGeneration: pin(getPreparedReplyDispatchRuntime()?.pluginGeneration),
        plugin,
      };
    },
    async dispose(): Promise<void> {
      await turn.release();
      restoreActivePluginRegistrySnapshot(original);
    },
  };
}
