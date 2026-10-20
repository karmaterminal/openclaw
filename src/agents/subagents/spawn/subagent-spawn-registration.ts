/** Subagent spawn registration admission, publication, and pipeline failure results. */
import type { SessionEntry } from "../../../config/sessions/types.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { notifyHomeOfSessionCreated } from "../../../sessions/session-created.js";
import {
  isSpawnSubagentAdmissionCancelledError,
  type SpawnSubagentResult,
} from "./subagent-spawn-contract.js";
import type { resolveSubagentSpawnRequest } from "./subagent-spawn-request.js";
import { buildSubagentSpawnFailureResult } from "./subagent-spawn-result.js";

type ResolveCollectorAdmission = Extract<
  Awaited<ReturnType<typeof resolveSubagentSpawnRequest>>,
  { ok: true }
>["resolved"]["resolveAdmission"];

/** Collector registration must still fit the group's live admission budget. */
export function assertSubagentCollectorAdmission(
  resolveAdmission: ResolveCollectorAdmission,
): void {
  const latestAdmission = resolveAdmission();
  if (!latestAdmission.ok) {
    throw Object.assign(new Error(latestAdmission.error), {
      spawnStatus: "forbidden" as const,
    });
  }
}

/**
 * Notifies Home of the child only once its acceptance is confirmed (H1 final
 * acceptance): a rolled-back or refused child must never surface as a usable session.
 */
export async function notifyHomeOfAcceptedSubagentSession(
  cfg: OpenClawConfig,
  childEntry: SessionEntry | undefined,
  childSessionKey: string,
  agentId: string,
): Promise<void> {
  if (childEntry) {
    await notifyHomeOfSessionCreated(cfg, {
      sessionKey: childSessionKey,
      agentId,
      entry: childEntry,
    });
  }
}

/** Upstream's failure result, plus continuation's cancelled status and failure phase. */
export function buildSubagentSpawnPipelineFailureResult(
  pipelineResult: Parameters<typeof buildSubagentSpawnFailureResult>[0],
  {
    childIdem,
    childSessionKey,
    reportFailurePhase,
    acceptedRunCleanupError,
  }: {
    childIdem: string;
    childSessionKey: string;
    reportFailurePhase: boolean;
    /** Upstream's unconfirmed accepted-run termination text, appended to the error. */
    acceptedRunCleanupError?: string;
  },
): SpawnSubagentResult {
  const result = buildSubagentSpawnFailureResult(pipelineResult, {
    childSessionKey,
    fallbackRunId: childIdem,
    acceptedRunCleanupError,
  });
  return {
    ...result,
    status: isSpawnSubagentAdmissionCancelledError(pipelineResult.error)
      ? "cancelled"
      : result.status === "forbidden"
        ? "forbidden"
        : "error",
    context: undefined,
    ...(reportFailurePhase ? { failurePhase: pipelineResult.phase } : {}),
  };
}
