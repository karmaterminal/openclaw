// Frond (karmaterminal, #1415): the room aggregate runs only where a Gateway has published its
// boot plugin inventory and loaded audited plugins, so fixtures that expect aggregation stage both.
import { expectDefined } from "@openclaw/normalization-core";
import { onTestFinished } from "vitest";
import {
  clearCurrentPluginMetadataSnapshot,
  setCurrentPluginMetadataSnapshotState,
} from "../../../plugins/current-plugin-metadata-state.js";
import { createPluginRecord } from "../../../plugins/loader-records.js";
import { createPluginMetadataSnapshotFixture } from "../../../plugins/plugin-metadata.test-support.js";
import type { PluginOrigin } from "../../../plugins/plugin-origin.types.js";
import { createEmptyPluginRegistry } from "../../../plugins/registry-empty.js";
import { getActivePluginRegistry, setActivePluginRegistry } from "../../../plugins/runtime.js";

/** The inventory a Gateway builds for its workspace, naming each tool plugin a turn may load. */
export function stageGatewayPluginInventory(
  plugins: Array<{ id: string; origin: PluginOrigin }> = [],
  workspaceDir = "/tmp",
): void {
  setCurrentPluginMetadataSnapshotState(
    {
      ...createPluginMetadataSnapshotFixture({
        plugins: plugins.map((plugin) => ({
          ...plugin,
          contracts: { tools: [`${plugin.id}_tool`] },
        })),
      }),
      workspaceDir,
    },
    undefined,
    undefined,
    undefined,
    "gateway",
  );
}

/**
 * A Gateway running the bundled Discord plugin, whose turn-time sender surfaces are audited. The
 * shared test setup's Discord channel carries no loader record, so it is re-registered under one.
 */
export function stageBundledDiscordGateway(): void {
  const discord = expectDefined(
    getActivePluginRegistry()?.channels.find(({ pluginId }) => pluginId === "discord"),
    "Discord test channel",
  );
  const registry = createEmptyPluginRegistry();
  registry.channels.push(discord);
  registry.plugins.push(
    createPluginRecord({
      id: "discord",
      origin: "bundled",
      source: discord.source,
      enabled: true,
      configSchema: false,
    }),
  );
  setActivePluginRegistry(registry);
  stageGatewayPluginInventory();
  onTestFinished(clearCurrentPluginMetadataSnapshot);
}
