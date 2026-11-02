import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizePluginId, normalizePluginsConfig } from "./config-state.js";

/** Resolve operator hook policy through the same canonical id used by plugin activation. */
export function resolveInjectionHookPolicy(cfg: OpenClawConfig, pluginId: string) {
  return normalizePluginsConfig(cfg.plugins).entries[normalizePluginId(pluginId)]?.hooks;
}
