// Frond (karmaterminal, #1415): the room aggregate runs only where a Gateway has published its
// boot plugin inventory, so fixtures that expect aggregation stage one.
import { setCurrentPluginMetadataSnapshotState } from "../../../plugins/current-plugin-metadata-state.js";
import { createPluginMetadataSnapshotFixture } from "../../../plugins/plugin-metadata.test-support.js";
import type { PluginOrigin } from "../../../plugins/plugin-origin.types.js";

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
