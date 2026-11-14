import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { logVerbose } from "openclaw/plugin-sdk/runtime-env";
import {
  asOptionalRecord as asRecord,
  normalizeOptionalString,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import type { SlackMessageEvent } from "../../types.js";
import { readSlackAssistantThreadContext } from "../assistant-thread-context.js";
import type { SlackAssistantThreadContext, SlackMonitorContext } from "../context.js";
import type { SlackEventScope } from "../event-scope.js";

export function hasSlackAssistantThreadMetadata(
  context: Omit<SlackAssistantThreadContext, "updatedAt"> | undefined,
): boolean {
  return Boolean(context?.channelId || context?.teamId || context?.enterpriseId !== undefined);
}

export function resolveSlackMessageAssistantThreadContext(
  message: SlackMessageEvent,
): Omit<SlackAssistantThreadContext, "updatedAt"> | undefined {
  const thread = asRecord(message.assistant_thread);
  if (!thread) {
    return undefined;
  }
  const context = asRecord(thread.context);
  const assistantChannelId = normalizeOptionalString(thread.channel_id) ?? message.channel;
  const threadTs = normalizeOptionalString(thread.thread_ts) ?? message.thread_ts ?? message.ts;
  if (!assistantChannelId || !threadTs) {
    return undefined;
  }
  return {
    assistantChannelId,
    threadTs,
    channelId: normalizeOptionalString(context?.channel_id),
    teamId: normalizeOptionalString(context?.team_id),
    enterpriseId:
      context?.enterprise_id === null ? null : normalizeOptionalString(context?.enterprise_id),
  };
}

export async function restoreSlackAssistantThreadContextFromMetadata(params: {
  ctx: SlackMonitorContext;
  message: SlackMessageEvent;
  eventScope?: SlackEventScope;
}): Promise<Omit<SlackAssistantThreadContext, "updatedAt"> | undefined> {
  const threadTs = params.message.thread_ts;
  const parentUserId = params.message.parent_user_id?.trim();
  if (
    !params.message.channel ||
    !threadTs ||
    !parentUserId ||
    (parentUserId !== params.ctx.botUserId && parentUserId !== params.ctx.botId)
  ) {
    return undefined;
  }
  try {
    return await readSlackAssistantThreadContext({
      client: params.eventScope?.client ?? params.ctx.app.client,
      channelId: params.message.channel,
      threadTs,
    });
  } catch (err) {
    logVerbose(
      `slack assistant context restore failed channel=${params.message.channel} ts=${threadTs}: ${formatErrorMessage(err)}`,
    );
  }
  return undefined;
}
