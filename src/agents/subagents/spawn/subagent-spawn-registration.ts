/** Subagent spawn registration admission, publication, and pipeline failure results. */
import type { SessionEntry } from "../../../config/sessions/types.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { recordSessionCreated } from "../../../sessions/session-created.js";
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

export function publishSubagentSpawnRegistration(params: {
  cfg: OpenClawConfig;
  childEntry: SessionEntry | undefined;
  childSessionKey: string;
  agentId: string;
}): void {
  const { cfg, childEntry, childSessionKey, agentId } = params;
  if (childEntry) {
    recordSessionCreated(cfg, {
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
  }: { childIdem: string; childSessionKey: string; reportFailurePhase: boolean },
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
    error:
      pipelineResult.phase === "register" && spawnStatus !== "forbidden"
        ? `Failed to register subagent run: ${summarizeSpawnError(pipelineResult.error)}`
        : summarizeSpawnError(pipelineResult.error),
    childSessionKey,
    ...(pipelineResult.phase === "initialize" ? {} : { runId }),
    ...(reportFailurePhase ? { failurePhase: pipelineResult.phase } : {}),
  };
}
