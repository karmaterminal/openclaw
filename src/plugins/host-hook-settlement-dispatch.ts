import { readResolvedSessionEntryInWorker } from "../config/sessions/session-accessor.entry.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { PluginNextTurnInjectionSettlement } from "./host-hook-turn-types.js";
import { getPluginInstance } from "./plugin-instance-scope.js";
import { capturePluginLifecycleAuthority, isPluginRegistryRetired } from "./registry-lifecycle.js";
import { getPluginRegistryForContext } from "./runtime/gateway-request-scope.js";

const log = createSubsystemLogger("plugins/host-hook-settlement-dispatch");
const activeHandlers = new WeakSet<object>();
const stalledHandlers = new WeakSet<object>();
const inFlightByPluginId = new Map<string, number>();
const MAX_IN_FLIGHT_PER_PLUGIN = 8;
const HANDLER_TIMEOUT_MS = 1_000;

export type SettlementNotice = {
  pluginId: string;
  event: PluginNextTurnInjectionSettlement;
  sessionId: string;
  lifecycleRevision?: string;
  /** Internal repair authority; never included in the plugin callback event. */
  lateExpiryToken?: string;
};

type SettlementScope = { cfg: OpenClawConfig; sessionKey: string; agentId?: string };

/** Best-effort delivery: one admitted call per registration, with no retained notice queue. */
export function dispatchSettlements(
  notices: SettlementNotice[],
  scope: SettlementScope,
): Promise<void> {
  if (notices.length === 0) {
    return Promise.resolve();
  }
  const registry = getPluginRegistryForContext();
  const deliveries: Promise<void>[] = [];
  for (const pluginId of new Set(notices.map((notice) => notice.pluginId))) {
    const record = registry?.plugins.find(
      (plugin) => plugin.id === pluginId && plugin.status === "loaded",
    );
    if (!registry || !record) {
      continue;
    }
    for (const registration of registry.nextTurnInjectionSettlementHandlers ?? []) {
      if (
        registration.pluginId !== pluginId ||
        (inFlightByPluginId.get(pluginId) ?? 0) >= MAX_IN_FLIGHT_PER_PLUGIN ||
        activeHandlers.has(registration) ||
        stalledHandlers.has(registration)
      ) {
        continue;
      }
      const instance = getPluginInstance(record);
      const isCurrent = instance
        ? capturePluginLifecycleAuthority(registry, record, { scopedRuntime: true })
        : () =>
            !isPluginRegistryRetired(registry) &&
            registry.plugins.includes(record) &&
            record.status === "loaded";
      if (!isCurrent?.()) {
        continue;
      }
      activeHandlers.add(registration);
      inFlightByPluginId.set(pluginId, (inFlightByPluginId.get(pluginId) ?? 0) + 1);
      const batch = notices.filter((notice) => notice.pluginId === pluginId).slice(0, 32);
      const delivery = Promise.resolve()
        .then(async () => {
          for (const { event, sessionId, lifecycleRevision } of batch) {
            if (!isCurrent() || !sessionId || !lifecycleRevision) {
              continue;
            }
            const entry = await readResolvedSessionEntryInWorker(scope);
            if (
              !isCurrent() ||
              entry?.sessionId !== sessionId ||
              entry.lifecycleRevision !== lifecycleRevision
            ) {
              continue;
            }
            const notice = { ...event, sessionKey: scope.sessionKey };
            try {
              let result: void | Promise<void> = undefined;
              if (instance) {
                // A best-effort async notice must not retain a managed call lease
                // after its timeout. The callback's synchronous entry is scoped;
                // continuations cannot reuse the released instance authority.
                instance.runInRegistry(registry, () => {
                  result = registration.handler(notice);
                });
              } else {
                result = registration.handler(notice);
              }
              let timer: ReturnType<typeof setTimeout> | undefined;
              const timeout = new Promise<"timeout">((resolve) => {
                timer = setTimeout(() => resolve("timeout"), HANDLER_TIMEOUT_MS);
              });
              try {
                if ((await Promise.race([Promise.resolve(result), timeout])) === "timeout") {
                  stalledHandlers.add(registration);
                  log.warn(`next-turn settlement notification timed out for ${pluginId}`);
                  break;
                }
              } finally {
                clearTimeout(timer);
              }
            } catch (error) {
              log.warn(
                `next-turn settlement notification failed for ${pluginId}: ${String(error)}`,
              );
            }
          }
        })
        .catch((error: unknown) => {
          log.warn(`next-turn settlement notification failed for ${pluginId}: ${String(error)}`);
        })
        .finally(() => {
          const remaining = (inFlightByPluginId.get(pluginId) ?? 1) - 1;
          if (remaining > 0) {
            inFlightByPluginId.set(pluginId, remaining);
          } else {
            inFlightByPluginId.delete(pluginId);
          }
          activeHandlers.delete(registration);
        });
      deliveries.push(delivery);
    }
  }
  // Callers detach this bounded per-registration batch from prompt preparation.
  return Promise.all(deliveries).then(() => {});
}
