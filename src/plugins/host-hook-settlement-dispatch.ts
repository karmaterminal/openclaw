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

export type SettlementNotice = { pluginId: string; event: PluginNextTurnInjectionSettlement };

/** Best-effort delivery: one admitted call per registration, with no retained notice queue. */
export function dispatchSettlements(notices: SettlementNotice[], sessionKey: string): void {
  if (notices.length === 0) {
    return;
  }
  const registry = getPluginRegistryForContext();
  for (const { pluginId, event } of notices) {
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
      const delivered = Promise.resolve().then(() => {
        if (!isCurrent()) {
          return;
        }
        const notice = { ...event, sessionKey };
        return instance
          ? instance.runInRegistry(registry, () => registration.handler(notice))
          : registration.handler(notice);
      });
      const release = () => {
        const remaining = (inFlightByPluginId.get(pluginId) ?? 1) - 1;
        if (remaining > 0) {
          inFlightByPluginId.set(pluginId, remaining);
        } else {
          inFlightByPluginId.delete(pluginId);
        }
      };
      void delivered.then(release, release);
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), HANDLER_TIMEOUT_MS);
      });
      void Promise.race([delivered, timeout])
        .then((result) => {
          if (result === "timeout") {
            // Never start another call after a timeout: an unresolved handler retains
            // at most one plugin promise, regardless of future settlement volume.
            stalledHandlers.add(registration);
            log.warn(`next-turn settlement notification timed out for ${pluginId}`);
          }
        })
        .catch((error: unknown) => {
          log.warn(`next-turn settlement notification failed for ${pluginId}: ${String(error)}`);
        })
        .finally(() => {
          clearTimeout(timer);
          activeHandlers.delete(registration);
        });
    }
  }
}
