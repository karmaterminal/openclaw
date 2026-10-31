// Frond (karmaterminal, #1415): which room events may join a cross-sender room aggregate.
import { describe, expect, it } from "vitest";
import { resolveReplyExecOverrides } from "../get-reply-exec-overrides.js";
import { createQueueTestRun } from "../queue.test-helpers.js";
import {
  resolveFollowupBatchKey,
  resolveFollowupDeliveryStorageKey,
  resolveRoomAggregateExecution,
} from "./delivery-context.js";
import type { FollowupRun } from "./types.js";

const ROOM = {
  sessionKey: "agent:main:discord:channel:room",
  messageProvider: "discord",
  chatType: "channel",
} as const;
const GROUP = {
  sessionKey: "agent:main:telegram:group:room",
  messageProvider: "telegram",
  chatType: "group",
} as const;

const config = {
  tools: {
    toolsBySender: { "id:grantee": { alsoAllow: ["exec"] }, "id:restricted": { deny: ["exec"] } },
  },
  agents: {
    entries: { agent: { tools: { toolsBySender: { "id:agent-restricted": { deny: ["exec"] } } } } },
  },
  channels: {
    telegram: {
      groups: { room: { toolsBySender: { "id:group-restricted": { deny: ["exec"] } } } },
    },
  },
};

type Patch = { source?: Partial<FollowupRun>; run?: Partial<FollowupRun["run"]> };

/** A non-owner room event as production stages it, elevated config enabled but not granted. */
function member(id: string, patch: Patch = {}, origin: typeof ROOM | typeof GROUP = ROOM) {
  return createQueueTestRun(
    {
      prompt: `room message from ${id}`,
      currentInboundEventKind: "room_event",
      originatingChannel: origin.messageProvider,
      originatingTo: "channel:room",
      originatingChatType: origin.chatType,
      ...patch.source,
    },
    {
      sessionKey: origin.sessionKey,
      messageProvider: origin.messageProvider,
      config,
      senderId: id,
      senderName: id,
      senderIsOwner: false,
      bashElevated: { enabled: true, allowed: false, defaultLevel: "on" },
      requesterOrigin: { ...origin, senderId: id, senderName: id },
      ...patch.run,
    },
  );
}

/** A member that keeps its own per-sender key never batches across senders. */
const joins = (run: FollowupRun) =>
  resolveFollowupBatchKey(run) !== resolveFollowupDeliveryStorageKey(run);

describe("room aggregate eligibility (#1415)", () => {
  it("batches baseline-authority senders under one room key", () => {
    expect(joins(member("alice"))).toBe(true);
    expect(resolveFollowupBatchKey(member("alice"))).toBe(resolveFollowupBatchKey(member("bob")));
  });

  it.each<[string, Patch]>([
    ["an addressed request", { source: { currentInboundEventKind: "user_request" } }],
    [
      "operator authority",
      { source: { operatorAuthority: { profileId: "op", scopes: [], assertCurrent: () => {} } } },
    ],
    ["cron-creator authority", { source: { createChannelCronAuthority: () => undefined } }],
    ["an owner memory audience", { source: { memoryAudienceSenderIsOwner: true } }],
    [
      "an explicit skill selection",
      { source: { explicitSkillSelections: [{ name: "s", path: "/s" }] } },
    ],
    ["the owner bit", { run: { senderIsOwner: true } }],
    ["a trace grant", { run: { traceAuthorized: true } }],
    ["an operator profile", { run: { operatorProfileId: "op" } }],
    [
      "an origin operator profile",
      { run: { requesterOrigin: { ...ROOM, senderId: "x", operatorProfileId: "op" } } },
    ],
    ["a legacy tool policy", { run: { conversationToolPolicy: { deny: ["exec"] } } }],
    [
      "a runtime plugin tool grant",
      { run: { runtimePluginToolGrant: { pluginId: "p", toolNames: ["t"] } } },
    ],
    ["an approval reviewer", { run: { approvalReviewerDeviceId: "device-1" } }],
    ["a UI command target", { run: { gatewayUiCommandTarget: { connId: "c", profileId: "p" } } }],
    [
      "an elevated grant",
      { run: { bashElevated: { enabled: true, allowed: true, defaultLevel: "on" } } },
    ],
    // A persisted child envelope resolves a senderless requester through its delegation floor.
    ["a spawned session", { run: { spawnedBy: "agent:main:main" } }],
    [
      "an unreadable sender policy",
      { run: { config: { tools: { toolsBySender: { untyped: {} } } } } },
    ],
  ])("keeps a member with %s on its own key", (_, patch) => {
    expect(joins(member("x", patch))).toBe(false);
  });

  it.each(["grantee", "restricted", "agent-restricted"])(
    "keeps a toolsBySender entry for id:%s on its own key",
    (id) => {
      expect(joins(member(id))).toBe(false);
    },
  );

  it("keeps a group toolsBySender entry on its own key", () => {
    expect(joins(member("anyone", {}, GROUP))).toBe(true);
    expect(joins(member("group-restricted", {}, GROUP))).toBe(false);
  });

  it("batches senders that share exec overrides and runs the aggregate with them", () => {
    // Agent exec defaults reach every staged run of the session, whoever sent it.
    const execOverrides = resolveReplyExecOverrides({
      agentExecDefaults: { host: "gateway", security: "full" },
    });
    const alice = member("alice", { run: { execOverrides } });
    expect(joins(alice)).toBe(true);
    expect(resolveFollowupBatchKey(member("bob", { run: { execOverrides } }))).toBe(
      resolveFollowupBatchKey(alice),
    );
    for (const other of [
      member("carol", { run: { execOverrides: { ...execOverrides, security: "allowlist" } } }),
      // A session permission mode an attempt wrote into its run's shared exec overrides.
      member("erin", { run: { execOverrides: { ...execOverrides, mode: "deny" } } }),
      member("dave"),
    ]) {
      expect(resolveFollowupBatchKey(other)).not.toBe(resolveFollowupBatchKey(alice));
    }
    expect(resolveRoomAggregateExecution(alice.run).execOverrides).toEqual(execOverrides);
  });
});
