import { formatAgentInternalEventsForPrompt, type AgentInternalEvent } from "./internal-events.js";
import type { SubagentRunOutcome } from "./subagents/announce/subagent-run-outcome.js";
import {
  SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION,
  SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION,
} from "./subagents/completion/subagent-completion-instructions.js";

function buildAnnounceReplyInstruction(params: {
  requesterIsSubagent: boolean;
  completionTarget?: "parent";
  modelRouteChange?: string;
  preserveModelRouteNotice?: boolean;
}): string {
  const modelRouteInstruction = !params.modelRouteChange
    ? ""
    : params.preserveModelRouteNotice
      ? " Preserve any runtime-authored model-route change notice in your update."
      : " Keep runtime-authored model-route change notices internal on this shared surface.";
  if (params.completionTarget === "parent") {
    return SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION;
  }
  if (params.requesterIsSubagent) {
    return `${SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION} Convert the reviewed outcome into a concise internal orchestration update for your parent agent in your own words.${modelRouteInstruction} Keep this internal context private (don't mention system/log/stats/session details or announce type).`;
  }
  return `A completed subagent task is ready for parent review. ${SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION}${modelRouteInstruction} Otherwise send a truthful user-facing update unless this exact result is already visible to the user in this same turn. Keep this internal context private (don't mention system/log/stats/session details or announce type), and do not copy the internal event text verbatim.`;
}

function buildAnnounceSteerMessage(events: AgentInternalEvent[]): string {
  return (
    formatAgentInternalEventsForPrompt(events) ||
    "A background task finished. Process the completion update now."
  );
}

export function buildSubagentAnnounceMessages(params: {
  requesterIsSubagent: boolean;
  completionTarget?: "parent";
  childSessionKey: string;
  childSessionId: string;
  taskLabel: string;
  outcome: SubagentRunOutcome;
  findings: string;
  noVisibleResult?: boolean;
  statsLine?: string;
  modelRouteChange?: string;
  preserveModelRouteNotice?: boolean;
}): {
  internalEvents: AgentInternalEvent[];
  triggerMessage: string;
} {
  const statusLabel =
    params.outcome.status === "ok"
      ? "completed; ready for parent review"
      : params.outcome.status === "timeout"
        ? params.outcome.error
          ? `timed out: ${params.outcome.error}`
          : "timed out"
        : params.outcome.status === "error"
          ? `failed: ${params.outcome.error || "unknown error"}`
          : "finished with unknown status";
  const replyInstruction = buildAnnounceReplyInstruction(params);
  const internalEvents: AgentInternalEvent[] = [
    {
      type: "task_completion",
      source: "subagent",
      announceType: "subagent task",
      childSessionKey: params.childSessionKey,
      childSessionId: params.childSessionId,
      taskLabel: params.taskLabel,
      status: params.outcome.status,
      statusLabel,
      result: params.findings,
      ...(params.noVisibleResult ? { noVisibleResult: true } : {}),
      modelRouteChange: params.modelRouteChange,
      statsLine: params.statsLine,
      replyInstruction,
    },
  ];
  return { internalEvents, triggerMessage: buildAnnounceSteerMessage(internalEvents) };
}
