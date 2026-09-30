// Announce origin resolution for threaded route targets and bound completion
// delivery (split from subagent-announce-delivery.test.ts).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionEntry } from "../../../config/sessions.js";
import {
  testing as sessionBindingServiceTesting,
  registerSessionBindingAdapter,
} from "../../../infra/outbound/session-binding-service.js";
import { normalizeLegacySessionEntryDelivery } from "../../../infra/state-migrations.legacy-session-store.js";
import { setActivePluginRegistry } from "../../../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../../test-utils/channel-plugins.js";
import {
  resolveAnnounceOrigin,
  resolveSubagentCompletionOrigin,
} from "./subagent-announce-origin.js";

afterEach(() => {
  sessionBindingServiceTesting.resetSessionBindingAdaptersForTests();
  setActivePluginRegistry(createTestRegistry());
});

function registerThreadedTargetTestChannel(channelId: string): void {
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: channelId,
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({
            id: channelId,
            capabilities: { chatTypes: ["group", "channel", "thread"] },
          }),
          messaging: {
            inferTargetChatType: () => "group",
            resolveSessionConversation: ({ rawId }: { rawId: string }) => {
              const topic = /^(.*):topic:(.+)$/u.exec(rawId);
              const id = topic?.[1] ?? rawId;
              return {
                id,
                threadId: topic?.[2],
                baseConversationId: id,
                parentConversationCandidates: [],
              };
            },
          },
        },
      },
    ]),
  );
}

function registerTestSessionBindings(
  channel: string,
  accountId: string,
  bindings: ReadonlyArray<{
    targetSessionKey: string;
    targetKind: "session" | "subagent";
    conversationId: string;
  }>,
): void {
  registerSessionBindingAdapter({
    channel,
    accountId,
    listBySession: (targetSessionKey) =>
      bindings
        .filter((binding) => binding.targetSessionKey === targetSessionKey)
        .map((binding) => ({
          bindingId: `${channel}:${accountId}:${binding.conversationId}`,
          targetSessionKey,
          targetKind: binding.targetKind,
          conversation: { channel, accountId, conversationId: binding.conversationId },
          status: "active" as const,
          boundAt: 1,
        })),
    resolveByConversation: () => null,
  });
}

describe("resolveAnnounceOrigin threaded route targets", () => {
  beforeEach(() => {
    registerThreadedTargetTestChannel("topicchat");
  });

  it.each([
    {
      name: "does not inherit a target or thread from another account on the same channel",
      stored: {
        lastChannel: "telegram",
        lastTo: "peer-b",
        lastAccountId: "bot-b",
        lastThreadId: 99,
      },
      requester: { channel: "telegram", accountId: "bot-a" },
      expected: { channel: "telegram", to: undefined, accountId: "bot-a" },
    },
    {
      name: "preserves stored thread ids when requester origin omits one for the same chat",
      stored: {
        lastChannel: "topicchat",
        lastTo: "topicchat:room-a:topic:99",
        lastThreadId: 99,
      },
      requester: { channel: "topicchat", to: "topicchat:room-a" },
      expected: { channel: "topicchat", to: "topicchat:room-a", threadId: 99 },
    },
    {
      name: "preserves stored thread ids for group-prefixed requester targets",
      stored: {
        lastChannel: "topicchat",
        lastTo: "topicchat:room-a:topic:99",
        lastThreadId: 99,
      },
      requester: { channel: "topicchat", to: "group:room-a" },
      expected: { channel: "topicchat", to: "group:room-a", threadId: 99 },
    },
    {
      name: "still strips stale thread ids when the stored route points at a different chat",
      stored: {
        lastChannel: "topicchat",
        lastTo: "topicchat:room-b:topic:99",
        lastThreadId: 99,
      },
      requester: { channel: "topicchat", to: "topicchat:room-a" },
      expected: { channel: "topicchat", to: "topicchat:room-a" },
    },
  ])("$name", ({ stored, requester, expected }) => {
    expect(
      resolveAnnounceOrigin(
        normalizeLegacySessionEntryDelivery(stored as unknown as SessionEntry),
        requester,
      ),
    ).toEqual(expected);
  });
});

describe("resolveSubagentCompletionOrigin", () => {
  it.each([
    {
      name: "resolves bound completion delivery from the requester session, not the child session",
      bindings: [
        {
          channel: "discord",
          accountId: "bot-alpha",
          targetSessionKey: "agent:worker:subagent:child",
          targetKind: "subagent" as const,
          conversationId: "child-window",
        },
        {
          channel: "discord",
          accountId: "acct-1",
          targetSessionKey: "agent:main:main",
          targetKind: "session" as const,
          conversationId: "parent-main",
        },
      ],
      childSessionKey: "agent:worker:subagent:child",
      requesterOrigin: {
        channel: "discord",
        accountId: "acct-1",
        to: "channel:parent-main",
      },
      expected: { channel: "discord", accountId: "acct-1", to: "channel:parent-main" },
      spawnMode: "session" as const,
    },
    {
      name: "prefers requester binding when child and requester share the same channel and accountId",
      bindings: [
        {
          channel: "telegram",
          accountId: "bot-1",
          targetSessionKey: "agent:main:telegram:default:direct:123",
          targetKind: "subagent" as const,
          conversationId: "direct:123",
        },
        {
          channel: "telegram",
          accountId: "bot-1",
          targetSessionKey: "agent:main:main",
          targetKind: "session" as const,
          conversationId: "direct:789",
        },
      ],
      childSessionKey: "agent:main:telegram:default:direct:123",
      requesterOrigin: {
        channel: "telegram",
        accountId: "bot-1",
        to: "telegram:direct:789",
      },
      expected: { channel: "telegram", accountId: "bot-1", to: "telegram:direct:789" },
      spawnMode: "run" as const,
    },
    {
      name: "falls back to child binding when requester has no binding",
      bindings: [
        {
          channel: "telegram",
          accountId: "bot-1",
          targetSessionKey: "agent:main:telegram:default:direct:123",
          targetKind: "subagent" as const,
          conversationId: "direct:123",
        },
      ],
      childSessionKey: "agent:main:telegram:default:direct:123",
      requesterOrigin: {
        channel: "telegram",
        accountId: "bot-1",
        to: "telegram:direct:123",
      },
      expected: { channel: "telegram", accountId: "bot-1", to: "telegram:direct:123" },
      spawnMode: "run" as const,
    },
  ])("$name", async ({ bindings, childSessionKey, requesterOrigin, expected, spawnMode }) => {
    const bindingGroups = new Map<string, (typeof bindings)[number][]>();
    for (const binding of bindings) {
      const key = `${binding.channel}\0${binding.accountId}`;
      const group = bindingGroups.get(key) ?? [];
      group.push(binding);
      bindingGroups.set(key, group);
    }
    for (const group of bindingGroups.values()) {
      const binding = group[0];
      if (binding) {
        registerTestSessionBindings(binding.channel, binding.accountId, group);
      }
    }

    const origin = await resolveSubagentCompletionOrigin({
      childSessionKey,
      requesterSessionKey: "agent:main:main",
      requesterOrigin,
      spawnMode,
      expectsCompletionMessage: true,
    });

    expect(origin).toEqual(expected);
  });
});
