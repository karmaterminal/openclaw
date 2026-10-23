/** Subagent spawn registration admission, publication, and pipeline failure results. */
import type { SessionEntry } from "../../../config/sessions/types.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { notifyHomeOfSessionCreated } from "../../../sessions/session-created.js";
import { summarizeSpawnError, type runSpawnPipeline } from "../../spawn-pipeline.js";
import {
  isSpawnSubagentAdmissionCancelledError,
  type SpawnSubagentResult,
} from "./subagent-spawn-contract.js";
import type { resolveSubagentSpawnRequest } from "./subagent-spawn-request.js";

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
  pipelineResult: Extract<Awaited<ReturnType<typeof runSpawnPipeline>>, { ok: false }>,
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
  const { phase, error } = pipelineResult;
  const spawnStatus =
    error && typeof error === "object" && "spawnStatus" in error ? error.spawnStatus : undefined;
  return {
    status: isSpawnSubagentAdmissionCancelledError(error)
      ? "cancelled"
      : spawnStatus === "forbidden"
        ? "forbidden"
        : "error",
    error: [
      phase === "register" && spawnStatus !== "forbidden"
        ? `Failed to register subagent run: ${summarizeSpawnError(error)}`
        : summarizeSpawnError(error),
      acceptedRunCleanupError,
    ]
      .filter(Boolean)
      .join(" "),
    childSessionKey,
    ...(phase === "initialize" ? {} : { runId: pipelineResult.runId ?? childIdem }),
    context: undefined,
    ...(reportFailurePhase ? { failurePhase: phase } : {}),
  };
}
