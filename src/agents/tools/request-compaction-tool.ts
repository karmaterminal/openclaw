import { Type } from "@sinclair/typebox";
import { z } from "zod";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  createManagedTaskFlow,
  deleteTaskFlowRecordById,
  failFlow,
  finishFlow,
  listTaskFlowRecords,
  listTaskFlowsForOwnerKey,
} from "../../tasks/task-flow-registry.js";
import type { TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, ToolInputError } from "./common.js";

const log = createSubsystemLogger("continuation/request-compaction");

const MIN_CONTEXT_THRESHOLD = 0.7;
const RATE_LIMIT_MS = 5 * 60 * 1000;
export const CONTINUATION_COMPACTION_CONTROLLER_ID = "core/continuation-compaction";

const RequestCompactionStateSchema = z.object({
  kind: z.literal("request_compaction"),
  reason: z.string().min(1).max(1024),
  contextUsage: z.number().nonnegative(),
  compacted: z.boolean().optional(),
  resultReason: z.string().optional(),
});

type RequestCompactionState = z.infer<typeof RequestCompactionStateSchema>;

const RequestCompactionToolSchema = Type.Object({
  reason: Type.String({
    description:
      "Why compaction is needed now. Include the context-pressure state and what working state you already preserved.",
    maxLength: 1024,
  }),
});

export type RequestCompactionToolOpts = {
  agentSessionKey?: string;
  sessionId?: string;
  getContextUsage: () => number;
  triggerCompaction: () => Promise<{ ok: boolean; compacted: boolean; reason?: string }>;
};

function isContinuationCompactionFlow(flow: TaskFlowRecord): boolean {
  return flow.syncMode === "managed" && flow.controllerId === CONTINUATION_COMPACTION_CONTROLLER_ID;
}

function listContinuationCompactionFlows(sessionKey: string): TaskFlowRecord[] {
  return listTaskFlowsForOwnerKey(sessionKey).filter(isContinuationCompactionFlow);
}

function listActiveContinuationCompactionFlows(sessionKey: string): TaskFlowRecord[] {
  return listContinuationCompactionFlows(sessionKey).filter(
    (flow) => flow.status === "queued" || flow.status === "running" || flow.status === "waiting",
  );
}

function findLatestContinuationCompactionFlow(sessionKey: string): TaskFlowRecord | undefined {
  return listContinuationCompactionFlows(sessionKey)[0];
}

function buildRequestCompactionState(params: {
  reason: string;
  contextUsage: number;
  compacted?: boolean;
  resultReason?: string;
}): RequestCompactionState {
  return {
    kind: "request_compaction",
    reason: params.reason,
    contextUsage: Math.round(params.contextUsage * 100),
    ...(params.compacted !== undefined ? { compacted: params.compacted } : {}),
    ...(params.resultReason ? { resultReason: params.resultReason } : {}),
  };
}

export function createRequestCompactionTool(opts: RequestCompactionToolOpts): AnyAgentTool {
  return {
    label: "Compaction",
    name: "request_compaction",
    description:
      "Request compaction of the current session after you have preserved the needed working state. " +
      "This is async and runs after your turn ends. Guarded by context threshold and cooldown checks.",
    parameters: RequestCompactionToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const sessionKey = opts.agentSessionKey;

      if (!sessionKey) {
        throw new ToolInputError(
          "request_compaction requires an active session. Not available in sessionless contexts.",
        );
      }

      if (!opts.sessionId) {
        throw new ToolInputError(
          "request_compaction requires a sessionId. Session may not be fully initialized.",
        );
      }

      const reason = readStringParam(params, "reason", { required: true }).slice(0, 1024);

      if (listActiveContinuationCompactionFlows(sessionKey).length > 0) {
        log.debug(`[request_compaction:already-pending] session=${sessionKey}`);
        return jsonResult({
          status: "already_pending",
          reason: "A compaction request is already in-flight for this session.",
        });
      }

      const contextUsage = opts.getContextUsage();
      if (!Number.isFinite(contextUsage) || contextUsage < MIN_CONTEXT_THRESHOLD) {
        log.debug(
          `[request_compaction:below-threshold] session=${sessionKey} usage=${(contextUsage * 100).toFixed(1)}%`,
        );
        return jsonResult({
          status: "rejected",
          guard: "context_threshold",
          contextUsage: Math.round(contextUsage * 100),
          threshold: Math.round(MIN_CONTEXT_THRESHOLD * 100),
          reason: `Context usage (${Math.round(contextUsage * 100)}%) is below the minimum threshold (${Math.round(MIN_CONTEXT_THRESHOLD * 100)}%).`,
        });
      }

      const now = Date.now();
      const latestFlow = findLatestContinuationCompactionFlow(sessionKey);
      if (latestFlow && now - latestFlow.createdAt < RATE_LIMIT_MS) {
        const remainingMs = RATE_LIMIT_MS - (now - latestFlow.createdAt);
        const remainingSec = Math.ceil(remainingMs / 1000);
        log.debug(
          `[request_compaction:rate-limited] session=${sessionKey} remainingSec=${remainingSec}`,
        );
        return jsonResult({
          status: "rejected",
          guard: "rate_limit",
          retryAfterSeconds: remainingSec,
          reason: `Rate limited. Next compaction request allowed in ${remainingSec}s.`,
        });
      }

      log.info(
        `[request_compaction:enqueuing] session=${sessionKey} usage=${(contextUsage * 100).toFixed(1)}% reason=${reason}`,
      );

      const flow = createManagedTaskFlow({
        ownerKey: sessionKey,
        controllerId: CONTINUATION_COMPACTION_CONTROLLER_ID,
        status: "running",
        notifyPolicy: "silent",
        goal: "Volitional compaction request",
        currentStep: "Compaction requested; waiting for turn completion",
        stateJson: buildRequestCompactionState({
          reason,
          contextUsage,
        }),
      });

      void opts
        .triggerCompaction()
        .then((result) => {
          if (result.ok && result.compacted) {
            finishFlow({
              flowId: flow.flowId,
              expectedRevision: flow.revision,
              currentStep: "Compaction completed",
              stateJson: buildRequestCompactionState({
                reason,
                contextUsage,
                compacted: true,
                ...(result.reason ? { resultReason: result.reason } : {}),
              }),
            });
            return;
          }

          failFlow({
            flowId: flow.flowId,
            expectedRevision: flow.revision,
            currentStep: "Compaction request did not complete",
            stateJson: buildRequestCompactionState({
              reason,
              contextUsage,
              compacted: false,
              ...(result.reason ? { resultReason: result.reason } : {}),
            }),
            blockedSummary: result.reason ?? "Compaction request did not complete.",
          });
        })
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          log.error(
            `[request_compaction:background-error] session=${sessionKey} error=${errorMessage}`,
          );
          failFlow({
            flowId: flow.flowId,
            expectedRevision: flow.revision,
            currentStep: "Compaction request failed",
            stateJson: buildRequestCompactionState({
              reason,
              contextUsage,
              compacted: false,
              resultReason: errorMessage,
            }),
            blockedSummary: errorMessage,
          });
        });

      return jsonResult({
        status: "compaction_requested",
        contextUsage: Math.round(contextUsage * 100),
        reason,
        note: "Compaction has been enqueued and will run after your turn completes.",
      });
    },
  };
}

export function incrementVolitionalCompactionCount(sessionKey: string): void {
  createManagedTaskFlow({
    ownerKey: sessionKey,
    controllerId: CONTINUATION_COMPACTION_CONTROLLER_ID,
    status: "succeeded",
    notifyPolicy: "silent",
    goal: "Volitional compaction request",
    currentStep: "Compaction completed",
    stateJson: buildRequestCompactionState({
      reason: "test helper increment",
      contextUsage: 1,
      compacted: true,
    }),
    endedAt: Date.now(),
  });
}

export function getVolitionalCompactionCount(sessionKey: string): number {
  return listContinuationCompactionFlows(sessionKey).filter((flow) => {
    if (flow.status !== "succeeded") {
      return false;
    }
    const parsed = RequestCompactionStateSchema.safeParse(flow.stateJson);
    return parsed.success && parsed.data.compacted === true;
  }).length;
}

export function _resetGuardState(sessionKey?: string): void {
  const flows = sessionKey
    ? listContinuationCompactionFlows(sessionKey)
    : listTaskFlowRecords().filter(isContinuationCompactionFlow);
  for (const flow of flows) {
    deleteTaskFlowRecordById(flow.flowId);
  }
}

export function _setPending(sessionKey: string): void {
  createManagedTaskFlow({
    ownerKey: sessionKey,
    controllerId: CONTINUATION_COMPACTION_CONTROLLER_ID,
    status: "running",
    notifyPolicy: "silent",
    goal: "Volitional compaction request",
    currentStep: "Compaction requested; waiting for turn completion",
    stateJson: buildRequestCompactionState({
      reason: "test helper pending",
      contextUsage: 1,
    }),
  });
}

export function _resetVolitionalCounts(sessionKey?: string): void {
  const flows = sessionKey
    ? listContinuationCompactionFlows(sessionKey)
    : listTaskFlowRecords().filter(isContinuationCompactionFlow);
  for (const flow of flows) {
    const parsed = RequestCompactionStateSchema.safeParse(flow.stateJson);
    if (parsed.success && parsed.data.compacted === true) {
      deleteTaskFlowRecordById(flow.flowId);
    }
  }
}

export const _guards = {
  MIN_CONTEXT_THRESHOLD,
  RATE_LIMIT_MS,
} as const;
