import type { OpenClawConfig } from "./types.js";

export const DEFAULT_AGENT_MAX_CONCURRENT = 4;
export const DEFAULT_SUBAGENT_MAX_CONCURRENT = 8;
// Raised from 5 → 20 (cure #871): the 5-cap deterministically bit 6+ delegate fanout
// patterns (PROOFS R-CD-CHAINED-DEPTH-2/Chain-3 at 4896c3129b). 20 gives ~4x headroom
// over the empirical bite-threshold for prince-fanout patterns while keeping unbounded
// explosion in check. Users with stricter needs override via
// `agents.defaults.subagents.maxChildrenPerAgent`.
export const DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT = 20;
export const DEFAULT_SUBAGENT_ARCHIVE_AFTER_MINUTES = 60;
// Keep depth-1 subagents as leaves unless config explicitly opts into nesting.
export const DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH = 1;

export function resolveAgentMaxConcurrent(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.maxConcurrent;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  return DEFAULT_AGENT_MAX_CONCURRENT;
}

export function resolveSubagentMaxConcurrent(cfg?: OpenClawConfig): number {
  const raw = cfg?.agents?.defaults?.subagents?.maxConcurrent;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }
  return DEFAULT_SUBAGENT_MAX_CONCURRENT;
}
