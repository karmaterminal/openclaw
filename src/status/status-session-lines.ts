// "RFC §" references herein cite docs/design/continue-work-signal-v2.md (Agent Self-Elected Turn Continuation / CONTINUE_WORK).
import { getVolitionalCompactionCount } from "../agents/tools/request-compaction-tool.js";
import { resolveContinuationRuntimeConfig } from "../auto-reply/continuation/config.js";
import { stagedPostCompactionDelegateCount } from "../auto-reply/continuation/delegate-store-post-compaction.js";
import { pendingDelegateCount } from "../auto-reply/continuation/delegate-store.js";
import type { SessionEntry } from "../config/sessions.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveStatusTtsSnapshot } from "../tts/status-config.js";

// Optional per-session /status rows derived from config and the session entry.

/**
 * RFC §6.3 Continuation row formatter for /status.
 * Renders only when continuation is enabled and a sessionKey is provided.
 * Format:
 *   🔄 Continuation: chain X/Y [| Z delegate(s) pending] [| W post-compaction staged] [| volitional: N]
 * Pending / staged fields are omitted when zero; volitional is omitted when zero.
 * Pluralization: "1 delegate pending" vs "N delegates pending".
 */
export function formatContinuationStatusLine(args: {
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionEntry?: SessionEntry;
}): string | null {
  const continuation = args.config?.agents?.defaults?.continuation;
  if (!continuation?.enabled || !args.sessionKey) {
    return null;
  }
  const { maxChainLength } = resolveContinuationRuntimeConfig(args.config);
  const chainCount = args.sessionEntry?.continuationChainCount ?? 0;
  let pending = 0;
  let staged = 0;
  let volitional = 0;
  try {
    pending = pendingDelegateCount(args.sessionKey);
  } catch {
    /* delegate-store not initialised */
  }
  try {
    staged = stagedPostCompactionDelegateCount(args.sessionKey);
  } catch {
    /* delegate-store not initialised */
  }
  try {
    volitional = getVolitionalCompactionCount(args.sessionKey);
  } catch {
    /* request-compaction-tool not initialised */
  }
  if (chainCount === 0 && pending === 0 && staged === 0 && volitional === 0) {
    return null;
  }
  const parts = [`chain ${chainCount}/${maxChainLength}`];
  if (pending > 0) {
    parts.push(`${pending} ${pending === 1 ? "delegate" : "delegates"} pending`);
  }
  if (staged > 0) {
    parts.push(`${staged} post-compaction staged`);
  }
  if (volitional > 0) {
    parts.push(`volitional: ${volitional}`);
  }
  return `🔄 Continuation: ${parts.join(" | ")}`;
}

export const formatVoiceModeLine = (
  config?: OpenClawConfig,
  sessionEntry?: SessionEntry,
  agentId?: string,
): string | null => {
  if (!config) {
    return null;
  }
  const snapshot = resolveStatusTtsSnapshot({
    cfg: config,
    sessionAuto: sessionEntry?.ttsAuto,
    agentId,
  });
  if (!snapshot) {
    return null;
  }
  const parts = [`🔊 Voice: ${snapshot.autoMode}`, `provider=${snapshot.provider}`];
  if (snapshot.persona) {
    parts.push(`persona=${snapshot.persona}`);
  }
  if (snapshot.displayName) {
    parts.push(`name=${snapshot.displayName}`);
  }
  if (snapshot.model) {
    parts.push(`model=${snapshot.model}`);
  }
  if (snapshot.voice) {
    parts.push(`voice=${snapshot.voice}`);
  }
  if (snapshot.baseUrl) {
    parts.push(
      snapshot.customBaseUrl
        ? `endpoint=custom(${snapshot.baseUrl})`
        : `endpoint=${snapshot.baseUrl}`,
    );
  }
  parts.push(`limit=${snapshot.maxLength}`, `summary=${snapshot.summarize ? "on" : "off"}`);
  return parts.join(" · ");
};
