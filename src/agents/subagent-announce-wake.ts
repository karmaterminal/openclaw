import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  getAgentEventLifecycleGeneration,
  isAgentEventLifecycleGenerationCurrent,
} from "../infra/agent-events.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../utils/message-channel.js";
import { buildAnnounceIdempotencyKey } from "./announce-idempotency.js";
import {
  loadSessionEntryByKey,
  resolveSubagentAnnounceTimeoutMs,
  runAnnounceDeliveryWithRetry,
} from "./subagent-announce-delivery.js";
import type {
  dispatchGatewayMethodInProcess,
  getRuntimeConfig,
} from "./subagent-announce.runtime.js";
import { terminateAcceptedCollectorRun } from "./subagent-spawn-cleanup.js";

type SubagentRegistryRuntime = typeof import("./subagent-registry-runtime.js");

export type SubagentDescendantWakeDeps = {
  callGateway: typeof import("../gateway/call.js").callGateway;
  dispatchGatewayMethodInProcess: typeof dispatchGatewayMethodInProcess;
  getRuntimeConfig: typeof getRuntimeConfig;
  loadSubagentRegistryRuntime: () => Promise<SubagentRegistryRuntime>;
};

export function hasUsableSessionEntry(entry: unknown): entry is Record<string, unknown> {
  if (!isRecord(entry)) {
    return false;
  }
  const sessionId = entry.sessionId;
  return typeof sessionId !== "string" || sessionId.trim() !== "";
}

function buildDescendantWakeMessage(params: { findings: string; taskLabel: string }): string {
  return [
    "[Subagent Context] Your prior run ended while waiting for descendant subagent completions.",
    "[Subagent Context] All pending descendants for that run have now settled.",
    "[Subagent Context] Continue your workflow using these results. Spawn more subagents if needed, otherwise send your final answer.",
    "",
    `Task: ${params.taskLabel}`,
    "",
    params.findings,
  ].join("\n");
}

const WAKE_RUN_SUFFIX = ":wake";

export function stripWakeRunSuffixes(runId: string): string {
  let next = runId.trim();
  while (next.endsWith(WAKE_RUN_SUFFIX)) {
    next = next.slice(0, -WAKE_RUN_SUFFIX.length);
  }
  return next || runId.trim();
}

export function isWakeContinuationRun(runId: string): boolean {
  const trimmed = runId.trim();
  if (!trimmed) {
    return false;
  }
  return stripWakeRunSuffixes(trimmed) !== trimmed;
}

export async function wakeSubagentRunAfterDescendants(
  params: {
    runId: string;
    childSessionKey: string;
    taskLabel: string;
    findings: string;
    announceId: string;
    isChildSessionEffectsAllowed: () => boolean;
    signal?: AbortSignal;
  },
  deps: SubagentDescendantWakeDeps,
): Promise<boolean> {
  if (params.signal?.aborted || !params.isChildSessionEffectsAllowed()) {
    return false;
  }

  const childEntry = loadSessionEntryByKey(params.childSessionKey);
  if (!hasUsableSessionEntry(childEntry)) {
    return false;
  }

  const cfg = deps.getRuntimeConfig();
  const announceTimeoutMs = resolveSubagentAnnounceTimeoutMs(cfg);
  const wakeLifecycleGeneration = getAgentEventLifecycleGeneration();
  const wakeMessage = buildDescendantWakeMessage({
    findings: params.findings,
    taskLabel: params.taskLabel,
  });

  let wakeRunId;
  try {
    const wakeResponse = await runAnnounceDeliveryWithRetry<{ runId?: string }>({
      operation: "descendant wake agent call",
      signal: params.signal,
      run: async () => {
        if (!params.isChildSessionEffectsAllowed()) {
          return {};
        }
        return await deps.dispatchGatewayMethodInProcess(
          "agent",
          {
            sessionKey: params.childSessionKey,
            message: wakeMessage,
            deliver: false,
            inputProvenance: {
              kind: "inter_session",
              sourceSessionKey: params.childSessionKey,
              sourceChannel: INTERNAL_MESSAGE_CHANNEL,
              sourceTool: "subagent_announce",
            },
            idempotencyKey: buildAnnounceIdempotencyKey(`${params.announceId}:wake`),
          },
          {
            timeoutMs: announceTimeoutMs,
          },
        );
      },
    });
    wakeRunId = normalizeOptionalString(wakeResponse?.runId) ?? "";
  } catch {
    return false;
  }

  if (!wakeRunId) {
    return false;
  }

  const terminateUnownedWake = async () => {
    await terminateAcceptedCollectorRun({
      childSessionKey: params.childSessionKey,
      gatewayRunId: wakeRunId,
      expectedSessionId:
        typeof childEntry.sessionId === "string"
          ? childEntry.sessionId.trim() || undefined
          : undefined,
      expectedLifecycleRevision:
        typeof childEntry.lifecycleRevision === "string"
          ? childEntry.lifecycleRevision.trim() || undefined
          : undefined,
      timeoutMs: announceTimeoutMs,
      callGateway: deps.callGateway,
    });
  };
  const { replaceSubagentRunAfterSteer } = await deps.loadSubagentRegistryRuntime();
  if (
    !params.isChildSessionEffectsAllowed() ||
    !isAgentEventLifecycleGenerationCurrent(wakeLifecycleGeneration)
  ) {
    await terminateUnownedWake();
    return false;
  }
  const replaced = await replaceSubagentRunAfterSteer({
    previousRunId: params.runId,
    nextRunId: wakeRunId,
    lifecycleGeneration: wakeLifecycleGeneration,
    preserveFrozenResultFallback: true,
    // Persist the wake message as the replacement run's task so that any
    // post-restart redispatch reconstructs the correct prompt.
    task: wakeMessage,
  });
  if (!replaced) {
    await terminateUnownedWake();
  }
  return replaced;
}
