import { preserveResetPluginInjectionOutcomes } from "./plugin-host-cleanup.js";
import type { SessionEntry } from "./types.js";

/** A logical conversation keeps its display choices and live injection outcomes across reset. */
export function preserveResetSessionState(entry: SessionEntry | undefined, now: number) {
  return {
    label: entry?.label,
    autoLabel: entry?.autoLabel,
    icon: entry?.icon,
    category: entry?.category,
    boardFace: entry?.boardFace,
    boardPresentation: entry?.boardPresentation,
    visibility: entry?.visibility,
    displayName: entry?.displayName,
    pinnedAt: entry?.pinnedAt,
    sidebarRoot: entry?.sidebarRoot,
    pluginNextTurnInjectionOutcomes: entry
      ? preserveResetPluginInjectionOutcomes(entry, now)
      : undefined,
  };
}
