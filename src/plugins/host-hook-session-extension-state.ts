import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { readResolvedSessionEntryInWorker } from "../config/sessions/session-accessor.entry.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { PluginJsonValue } from "./host-hooks.js";

export async function getPluginSessionExtensionState(params: {
  cfg: OpenClawConfig;
  pluginId: string;
  sessionKey?: string;
  agentId?: string;
}): Promise<Record<string, PluginJsonValue> | undefined> {
  const pluginId = params.pluginId.trim();
  const sessionKey = normalizeOptionalString(params.sessionKey);
  if (!pluginId || !sessionKey) {
    return undefined;
  }
  const entry = await readResolvedSessionEntryInWorker({
    cfg: params.cfg,
    sessionKey,
    agentId: params.agentId,
  });
  const value = entry?.pluginExtensions?.[pluginId] as Record<string, PluginJsonValue> | undefined;
  return value ? structuredClone(value) : undefined;
}
