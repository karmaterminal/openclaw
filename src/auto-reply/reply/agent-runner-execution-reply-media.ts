/** Reply media context for one agent turn, bound to its run and requester identity. */
import type { OpenClawConfig } from "../../config/config.js";
import type { AppContextTurnParams } from "./agent-runner-execution-mcp-context.js";
import type { ReplyMediaContext } from "./reply-media-paths.js";
import { createReplyMediaContext } from "./reply-media-paths.runtime.js";

export function createAgentTurnReplyMediaContext(
  params: AppContextTurnParams,
  runtimeConfig: OpenClawConfig,
): ReplyMediaContext {
  return createReplyMediaContext({
    cfg: runtimeConfig,
    agentId: params.followupRun.run.agentId,
    sessionKey: params.sessionKey,
    workspaceDir: params.followupRun.run.workspaceDir,
    mediaNormalizationOwner: params.followupRun.run.mediaNormalizationOwner,
    messageProvider: params.followupRun.run.messageProvider,
    accountId: params.followupRun.originatingAccountId ?? params.followupRun.run.agentAccountId,
    groupId: params.followupRun.run.groupId,
    groupChannel: params.followupRun.run.groupChannel,
    groupSpace: params.followupRun.run.groupSpace,
    requesterSenderId: params.followupRun.run.senderId,
    requesterSenderName: params.followupRun.run.senderName,
    requesterSenderUsername: params.followupRun.run.senderUsername,
    requesterSenderE164: params.followupRun.run.senderE164,
  });
}
