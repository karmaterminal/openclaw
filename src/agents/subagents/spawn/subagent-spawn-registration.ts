/** Subagent spawn registration admission, publication, and pipeline failure results. */
import type { SessionEntry } from "../../../config/sessions/types.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import {
  notifyHomeOfSessionCreated,
  recordSessionCreatedStateEvent,
} from "../../../sessions/session-created.js";
import { summarizeSpawnError } from "../../spawn-pipeline.js";
import {
  isSpawnSubagentAdmissionCancelledError,
  type SpawnSubagentResult,
} from "./subagent-spawn-contract.js";
import type { resolveSubagentSpawnRequest } from "./subagent-spawn-request.js";

type ResolveCollectorAdmission = Extract<
  Awaited<ReturnType<typeof resolveSubagentSpawnRequest>>,
  { ok: true }
>["resolved"]["admission"]["resolve"];

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

/** Records the child's "created" state event where upstream records it, before child_spawned. */
export async function recordSubagentSessionCreated(
  childEntry: SessionEntry | undefined,
  childSessionKey: string,
  agentId: string,
): Promise<void> {
  if (childEntry) {
    await recordSessionCreatedStateEvent({
      sessionKey: childSessionKey,
      agentId,
      entry: childEntry,
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

export function buildSubagentSpawnPipelineFailureResult(
  pipelineResult: {
    phase: "initialize" | "dispatch" | "register";
    error: unknown;
    runId?: string;
  },
  {
    childIdem,
    childSessionKey,
    reportFailurePhase,
    acceptedRunCleanupError,
  }: {
    childIdem: string;
    childSessionKey: string;
    reportFailurePhase: boolean;
    /** Upstream's pending accepted-run termination text, appended to the error. */
    acceptedRunCleanupError?: string;
  },
): SpawnSubagentResult {
  const runId = pipelineResult.runId ?? childIdem;
  const spawnError =
    pipelineResult.error && typeof pipelineResult.error === "object"
      ? pipelineResult.error
      : undefined;
  // SAFETY: spawnError is a non-null object or undefined; spawnStatus is read as unknown and compared.
  const spawnStatus = (spawnError as { spawnStatus?: unknown } | undefined)?.spawnStatus;
  return {
    status: isSpawnSubagentAdmissionCancelledError(pipelineResult.error)
      ? "cancelled"
      : spawnStatus === "forbidden"
        ? "forbidden"
        : "error",
    error: [
      pipelineResult.phase === "register" && spawnStatus !== "forbidden"
        ? `Failed to register subagent run: ${summarizeSpawnError(pipelineResult.error)}`
        : summarizeSpawnError(pipelineResult.error),
      acceptedRunCleanupError,
    ]
      .filter(Boolean)
      .join(" "),
    childSessionKey,
    ...(pipelineResult.phase === "initialize" ? {} : { runId }),
    ...(reportFailurePhase ? { failurePhase: pipelineResult.phase } : {}),
  };
}
