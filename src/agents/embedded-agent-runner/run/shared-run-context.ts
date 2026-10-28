import type { EmbeddedForegroundPromptContext, RunEmbeddedAgentParams } from "./params.js";
import type { EmbeddedRunAttemptParams } from "./types.js";

export function projectEmbeddedMessageContext(run: Partial<EmbeddedForegroundPromptContext>) {
  return {
    requesterOrigin: run.requesterOrigin,
    operatorProfileId: run.operatorProfileId,
    conversationId: run.conversationId,
    sessionPromptDelivery: run.sessionPromptDelivery,
    senderId: run.senderId,
    senderName: run.senderName,
    senderUsername: run.senderUsername,
    senderE164: run.senderE164,
    senderIsOwner: run.senderIsOwner,
    gitContributorProfileId: run.gitContributorProfileId,
    approvalReviewerDeviceId: run.approvalReviewerDeviceId,
    currentChannelId: run.currentChannelId,
    chatId: run.chatId,
    channelContext: run.channelContext,
    currentMessagingTarget: run.currentMessagingTarget,
    currentThreadTs: run.currentThreadTs,
    currentMessageId: run.currentMessageId,
    currentInboundAudio: run.currentInboundAudio,
    replyToMode: run.replyToMode,
  };
}

/** Continuation (karmaterminal): the attempt's message context plus the run's continuation options. */
export function projectEmbeddedAttemptContext(
  run: Partial<EmbeddedForegroundPromptContext> & Parameters<typeof projectContinuationOpts>[0],
) {
  return { ...projectEmbeddedMessageContext(run), ...projectContinuationOpts(run) };
}

/** Continuation (karmaterminal): the run's continuation tool options, forwarded to the attempt. */
function projectContinuationOpts(
  run: Pick<
    RunEmbeddedAgentParams,
    | "drainsContinuationDelegateQueue"
    | "disableContinuationTools"
    | "continueWorkOpts"
    | "requestCompactionOpts"
  >,
) {
  return {
    drainsContinuationDelegateQueue: run.drainsContinuationDelegateQueue,
    disableContinuationTools: run.disableContinuationTools,
    continueWorkOpts: run.continueWorkOpts,
    requestCompactionOpts: run.requestCompactionOpts,
  };
}

export function projectTrajectorySessionTarget(
  target: EmbeddedRunAttemptParams["sessionTarget"],
  omitMissing = false,
) {
  const sessionTarget =
    target?.agentId && target.sessionId && target.sessionKey && target.storePath
      ? {
          agentId: target.agentId,
          sessionId: target.sessionId,
          sessionKey: target.sessionKey,
          storePath: target.storePath,
        }
      : undefined;
  return omitMissing && !sessionTarget ? {} : { sessionTarget };
}
