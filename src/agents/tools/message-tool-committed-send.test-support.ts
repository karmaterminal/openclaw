import { vi } from "vitest";
import type {
  MessageActionInput,
  MessageActionResult,
} from "../../infra/outbound/message-action-contracts.js";
import { createMessageTool } from "./message-tool-execution.js";

/**
 * The real message tool for one turn, with a transport that reports every send as a
 * committed core send. Delivery recording on the turn's reply operation runs unmodified.
 */
export function createCommittedSendMessageTool(params: {
  sessionId: string;
  runId: string;
  currentTarget: string;
}) {
  const sends = vi.fn(async (input: MessageActionInput): Promise<MessageActionResult> => {
    const to =
      typeof input.params.target === "string"
        ? input.params.target
        : `telegram:${params.currentTarget}`;
    const sendResult = {
      channel: "telegram",
      to,
      via: "direct" as const,
      mediaUrl: null,
      deliveryStatus: "sent" as const,
      dryRun: false,
      result: { channel: "telegram", messageId: `committed-send-${sends.mock.calls.length}` },
    };
    return {
      kind: "send",
      action: "send",
      channel: "telegram",
      to,
      handledBy: "core",
      payload: sendResult,
      sendResult,
      dryRun: false,
    };
  });
  const tool = createMessageTool({
    config: {},
    runId: params.runId,
    sessionId: params.sessionId,
    preparedMessageToolCatalog: { version: 0, channels: [], getChannel: () => undefined },
    currentChannelProvider: "telegram",
    currentChannelId: params.currentTarget,
    currentMessagingTarget: `telegram:${params.currentTarget}`,
    getScopedChannelsCommandSecretTargets: () => ({ targetIds: new Set<string>() }),
    resolveCommandSecretRefsViaGateway: async ({ config }) => ({
      resolvedConfig: config,
      diagnostics: [],
      targetStatesByPath: {},
      hadUnresolvedTargets: false,
    }),
    runMessageAction: sends,
  });
  return { tool, sends };
}
