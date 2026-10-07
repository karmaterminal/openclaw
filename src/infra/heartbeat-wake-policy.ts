import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { listAgentIds } from "../agents/agent-scope.js";
import type { ContinuationTrigger } from "../auto-reply/get-reply-options.types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeAgentId } from "../routing/session-key.js";
import {
  hasTrustedContinuationHeartbeatWake,
  type HeartbeatWakeIntent,
  type HeartbeatWakeSource,
} from "./heartbeat-wake-contracts.js";

export type HeartbeatWakePayloadFlags = {
  isExecEventWake: boolean;
  isCronWake: boolean;
  isWakePayload: boolean;
};

function isContinuationHeartbeatWakeReason(reason?: string): boolean {
  const normalized = (reason ?? "").trim();
  return (
    normalized === "continuation" ||
    normalized === "silent-wake-enrichment" ||
    normalized === "delegate-return"
  );
}

export function resolveHeartbeatContinuationTrigger(
  reason?: string,
): ContinuationTrigger | undefined {
  const normalized = (reason ?? "").trim();
  if (normalized === "continuation") {
    return "work-wake";
  }
  if (normalized === "silent-wake-enrichment" || normalized === "delegate-return") {
    return "delegate-return";
  }
  return undefined;
}

export function inferHeartbeatWakeSourceFromReason(
  reason?: string,
): HeartbeatWakeSource | undefined {
  const trimmed = (reason ?? "").trim();
  if (trimmed === "exec-event") {
    return "exec-event";
  }
  if (trimmed.startsWith("cron:")) {
    return "cron";
  }
  if (trimmed === "wake" || trimmed.startsWith("hook:")) {
    return "hook";
  }
  if (isContinuationHeartbeatWakeReason(trimmed)) {
    return "hook";
  }
  if (trimmed.startsWith("acp:spawn:")) {
    return "acp-spawn";
  }
  if (trimmed.startsWith("session-state:")) {
    return "session-state";
  }
  return undefined;
}

export function resolveHeartbeatWakePayloadFlags(params: {
  source?: HeartbeatWakeSource;
  reason?: string;
}): HeartbeatWakePayloadFlags {
  const source = params.source ?? inferHeartbeatWakeSourceFromReason(params.reason);
  const reason = (params.reason ?? "").trim();
  return {
    isExecEventWake: source === "exec-event",
    isCronWake: source === "cron",
    isWakePayload:
      source === "hook" ||
      source === "acp-spawn" ||
      source === "session-state" ||
      source === "background-task" ||
      source === "background-task-blocked" ||
      reason === "wake" ||
      isContinuationHeartbeatWakeReason(reason),
  };
}

type TargetedUnscheduledWakeParams = {
  source?: HeartbeatWakeSource;
  intent?: HeartbeatWakeIntent;
  reason?: string;
  agentId?: string;
  sessionKey?: string;
  /** Set by the scheduler handoff; the request itself may carry the internal marker instead. */
  trustedContinuationRouting?: boolean;
};

/**
 * A continuation return whose producer required a wake (delegate return or
 * silent-wake enrichment). Only internal producers can set the trusted marker,
 * so this exception cannot be requested through the public wake API.
 */
function isTrustedContinuationReturnWake(params: TargetedUnscheduledWakeParams): boolean {
  const reason = params.reason?.trim();
  return (
    (params.trustedContinuationRouting === true || hasTrustedContinuationHeartbeatWake(params)) &&
    params.intent === "immediate" &&
    (reason === "delegate-return" || reason === "silent-wake-enrichment")
  );
}

export function isTargetedUnscheduledWake(params: TargetedUnscheduledWakeParams): boolean {
  const hasSessionTarget = normalizeOptionalString(params.sessionKey) !== undefined;
  if (!hasSessionTarget && normalizeOptionalString(params.agentId) === undefined) {
    return false;
  }

  // These sources queue targeted events that would otherwise sit unread for a
  // configured agent without a recurring heartbeat schedule. Each case admits
  // exactly its producer's shape; exec completions keep their event intent so
  // they cannot broaden the immediate-wake exception.
  const reason = params.reason?.trim();
  // A wake-required continuation return must run its one turn whether or not
  // the recipient has a heartbeat schedule, on the fast path and on replay
  // alike. Session-targeted only: the return was queued for that session.
  if (hasSessionTarget && isTrustedContinuationReturnWake(params)) {
    return true;
  }
  switch (params.source) {
    case "cron":
      return params.intent === "immediate" && (reason?.startsWith("cron:") ?? false);
    case "notifications-event":
      return (
        hasSessionTarget &&
        ((params.intent === "immediate" && reason === "wake") ||
          (params.intent === "event" && reason === "notifications-event"))
      );
    case "manual":
    case "restart-sentinel":
      return params.intent === "immediate" && hasSessionTarget && reason === "wake";
    case "hook":
      return params.intent === "immediate" && (reason?.startsWith("hook:") ?? false);
    case "exec-event":
      return params.intent === "event" && reason === "exec-event";
    case "background-task":
    case "background-task-blocked":
      return params.intent === "immediate";
    default:
      return false;
  }
}

export function isConfiguredHeartbeatAgent(cfg: OpenClawConfig, agentId: string): boolean {
  const normalized = normalizeAgentId(agentId);
  return listAgentIds(cfg).some((candidate) => normalizeAgentId(candidate) === normalized);
}
