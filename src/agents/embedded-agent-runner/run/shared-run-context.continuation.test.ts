import { expect, it } from "vitest";
import {
  projectEmbeddedAttemptContext,
  projectEmbeddedMessageContext,
} from "./shared-run-context.js";

// Continuation (karmaterminal): the dispatcher spreads one projection for the attempt's message
// context and continuation options, so its position in the attempt literal only holds while the
// two key sets stay disjoint.
it("projects message context and continuation options as their disjoint union", () => {
  const continuation = {
    drainsContinuationDelegateQueue: true,
    disableContinuationTools: false,
    continueWorkOpts: { requestContinuation: () => {} },
    requestCompactionOpts: {
      getContextUsage: () => 0.5,
      triggerCompaction: async () => ({ ok: true, compacted: true }),
    },
  };
  const run: Parameters<typeof projectEmbeddedAttemptContext>[0] = {
    requesterOrigin: { sessionKey: "agent:main:main" },
    operatorProfileId: "operator",
    conversationId: "conversation",
    senderId: "sender",
    senderName: "Sender",
    senderUsername: "sender-user",
    senderE164: "+15550000000",
    senderIsOwner: true,
    gitContributorProfileId: "contributor",
    approvalReviewerDeviceId: "device",
    currentChannelId: "channel",
    chatId: "chat",
    channelContext: { chat: { id: "chat" } },
    currentMessagingTarget: "target",
    currentThreadTs: "thread",
    currentMessageId: "message",
    currentInboundAudio: true,
    replyToMode: "first",
    ...continuation,
  };
  const message = projectEmbeddedMessageContext(run);

  expect(Object.values(message)).not.toContain(undefined);
  expect(Object.keys(message).filter((key) => Object.hasOwn(continuation, key))).toEqual([]);
  expect(projectEmbeddedAttemptContext(run)).toStrictEqual({ ...message, ...continuation });
});
