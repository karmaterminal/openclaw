// Frond (karmaterminal, #1415): a cross-sender room aggregate runs senderless, so a plugin that
// treats an absent sender more permissively than a known one could allow a member something it
// would deny that member. Until plugins can report a per-member sender decision, the aggregate runs
// only while every plugin surface its turn can reach is an audited bundled implementation.
import { getGatewayPluginMetadataSnapshot } from "../../../plugins/current-plugin-metadata-state.js";
import { getGlobalPluginRegistry } from "../../../plugins/hook-runner-global.js";
import { createInstalledPluginEnabledPredicate } from "../../../plugins/installed-plugin-index.js";
import type { PluginOrigin } from "../../../plugins/plugin-origin.types.js";
import type { PluginRegistry } from "../../../plugins/registry-types.js";
import {
  getActivePluginChannelRegistry,
  getActivePluginRegistry,
} from "../../../plugins/runtime.js";
import { deferSessionControllerClaimBeforeExecution } from "../../../sessions/session-controller.mailbox-claim.js";
import type { SessionControllerMailboxClaim } from "../../../sessions/session-controller.mailbox.js";
import type { FollowupRun } from "./types.js";

type RoomTurn = Pick<FollowupRun["run"], "config" | "workspaceDir">;

/**
 * Bundled plugins whose turn-time surfaces deny an absent sender or never read one, cited relative
 * to extensions/<id>/. Admitted only at bundled origin: discovery assigns it from physical
 * containment in this build's bundled plugin roots, and duplicate-id resolution keeps the winner's
 * origin, so a third-party package reusing one of these ids stays unaudited.
 */
const AUDITED_BUNDLED_PLUGIN_IDS: ReadonlySet<string> = new Set([
  // Guild-admin and moderation actions require a trusted sender (src/channel-actions.ts:198,
  // enforced at core src/channels/plugins/message-action-dispatch.ts:634). Its sender-scoped group
  // tool policy is already held to member == baseline by resolveSenderScopedToolPolicyKey.
  "discord",
  // Global enable/disable requires the owner bit (session-policy.ts:160).
  "active-memory",
  // Owner tools require the owner bit (src/native-plugin-tool.ts:46, src/native-thread-tool.ts:166,
  // src/supervision-tools.ts:706).
  "codex",
  // Standing-intent creation refuses without a sender (src/standing-intents-tool.ts:106); recall
  // adds sender-scoped intents only when one is present (src/standing-intents-model.ts:217).
  "memory-core",
  // Persistent voice changes require the owner bit or operator.admin (index.ts:170).
  "talk-voice",
  // No source outside tests reads a sender field (senderId, senderIsOwner, requesterSenderId,
  // sender names, roleIds).
  "acpx",
  "browser",
  "canvas",
  "diagnostics-otel",
  "file-transfer",
  "github",
  "google-meet",
  "llama-cpp",
  "memory-lancedb",
  "memory-wiki",
  "ollama",
  "teams-meetings",
  "xai",
  "zoom-meetings",
]);

function isAuditedBundledPlugin(plugin: { id: string; origin: PluginOrigin }): boolean {
  return plugin.origin === "bundled" && AUDITED_BUNDLED_PLUGIN_IDS.has(plugin.id);
}

/** Every owner of a surface that runs during a turn with the turn's sender facts is audited. */
function areTurnSurfacesAudited(registry: PluginRegistry): boolean {
  const surfaces: ReadonlyArray<ReadonlyArray<{ pluginId: string }>> = [
    registry.typedHooks,
    registry.hooks,
    registry.legacyInternalHooks,
    registry.tools,
    registry.channels,
    registry.agentHarnesses,
    registry.trustedToolPolicies,
    registry.mcpServerConnectionResolvers,
    registry.memoryCapabilities,
    registry.memoryPromptPreparations,
    registry.memoryPromptSupplements,
    registry.memoryCorpusSupplements,
  ];
  const owners = new Set(surfaces.flatMap((entries) => entries.map((entry) => entry.pluginId)));
  return [...owners].every((id) => {
    // An overridden duplicate stays in the registry disabled; it never loads or registers.
    const loaded = registry.plugins.filter(
      (plugin) => plugin.id === id && plugin.status !== "disabled",
    );
    return loaded.length > 0 && loaded.every(isAuditedBundledPlugin);
  });
}

/**
 * Reads the process plugin owners, not request or generation overlays, so selection and the drain
 * agree; room events drain detached from any one request. Accepted edge cases: outside a Gateway
 * there is no boot inventory, so a tool plugin that has not loaded yet goes unseen (channel room
 * events only reach the queue through Gateway ingress); an unconfigured bundled channel reachable
 * only through the channel fallback holds no credentials to act with.
 */
export function isRoomAggregatePluginSurfaceAudited({ config, workspaceDir }: RoomTurn): boolean {
  try {
    const active = getActivePluginRegistry();
    const hooks = getGlobalPluginRegistry();
    // An SDK-initialized hook registry carries no loader origin.
    if (hooks && hooks !== active && (hooks.typedHooks.length > 0 || hooks.hooks.length > 0)) {
      return false;
    }
    const registries = new Set([active, getActivePluginChannelRegistry()]);
    if (![...registries].every((registry) => !registry || areTurnSurfacesAudited(registry))) {
      return false;
    }
    // Plugin tools load lazily at turn time, so the inventory names owners no registry holds yet.
    const inventory = getGatewayPluginMetadataSnapshot();
    if (!inventory) {
      return true;
    }
    // Discovery is per workspace: another workspace's plugins can shadow an audited id, so the
    // inventory speaks only for the workspace it was built for (as its metadata owner rules).
    if ((inventory.workspaceDir ?? "") !== workspaceDir) {
      return false;
    }
    const enabled = createInstalledPluginEnabledPredicate(inventory.index.plugins, config);
    return inventory.plugins.every(
      (plugin) =>
        !plugin.contracts?.tools?.length || !enabled(plugin.id) || isAuditedBundledPlugin(plugin),
    );
  } catch {
    return false;
  }
}

/**
 * Execution-time re-check: a plugin activated after the claim formed returns its members to
 * re-selection, which keys each by its own sender. A claim that cannot be deferred (being released)
 * is left unrun, so its sources are abandoned rather than run senderless.
 */
export function deferRoomAggregateForUnauditedPlugins(
  claim: SessionControllerMailboxClaim,
  turn: RoomTurn,
): boolean {
  if (isRoomAggregatePluginSurfaceAudited(turn)) {
    return false;
  }
  deferSessionControllerClaimBeforeExecution(claim);
  return true;
}
