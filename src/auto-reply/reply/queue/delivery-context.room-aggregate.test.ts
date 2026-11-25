// Frond (karmaterminal, #1415): which room events may join a cross-sender room aggregate.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GroupChatConfig } from "../../../config/types.messages.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { clearCurrentPluginMetadataSnapshot } from "../../../plugins/current-plugin-metadata-state.js";
import { createEmptyPluginRegistry } from "../../../plugins/registry-empty.js";
import { setActivePluginRegistry } from "../../../plugins/runtime.js";
import { resolveReplyExecOverrides } from "../get-reply-exec-overrides.js";
import { createQueueTestRun } from "../queue.test-helpers.js";
import {
  createOverflowSummaryRetrySource,
  resolveFollowupBatchKey,
  resolveFollowupDeliveryStorageKey,
  resolveRoomAggregateExecution,
} from "./delivery-context.js";
import { stageGatewayPluginInventory } from "./room-aggregate-plugin-gate.test-support.js";
import type { FollowupRun } from "./types.js";

// A Gateway with no plugins loaded, so only authority facts decide eligibility.
beforeEach(() => {
  setActivePluginRegistry(createEmptyPluginRegistry());
  stageGatewayPluginInventory();
});
afterEach(clearCurrentPluginMetadataSnapshot);

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

const groupChat = {
  ambientOwnerAggregate: true,
  ambientOwnerAggregatePeers: [
    ...["peer-a", "peer-b", "peer-c", "peer-x"],
    ...["grantee", "restricted", "agent-restricted", "group-restricted"],
  ],
};
const config = {
  messages: { groupChat },
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

/**
 * A listed bot's unaddressed prose in an opted-in room, as production stages it: no owner, elevated
 * config enabled but not granted. A patched config keeps the opt-in unless it names its own messages.
 */
function member(id: string, patch: Patch = {}, origin: typeof ROOM | typeof GROUP = ROOM) {
  return createQueueTestRun(
    {
      prompt: `room message from ${id}`,
      currentInboundEventKind: "room_event",
      ambientRoomProse: true,
      originatingChannel: origin.messageProvider,
      originatingTo: "channel:room",
      originatingChatType: origin.chatType,
      ...patch.source,
    },
    {
      sessionKey: origin.sessionKey,
      messageProvider: origin.messageProvider,
      senderId: id,
      senderName: id,
      senderIsOwner: false,
      senderIsBot: true,
      bashElevated: { enabled: true, allowed: false, defaultLevel: "on" },
      requesterOrigin: { ...origin, senderId: id, senderName: id },
      ...patch.run,
      config: { ...config, ...patch.run?.config },
    },
  );
}

/** The same from a prince: a bot that is a command owner, with the trace grant the owner bit derives. */
const owner: typeof member = (id, patch = {}, origin) =>
  member(
    id,
    { ...patch, run: { senderIsOwner: true, traceAuthorized: true, ...patch.run } },
    origin,
  );

const LISTED = [
  ["a listed bot", member],
  ["a listed owner bot", owner],
] as const;

/** Authority a member may carry, each of which keeps it out of the senderless room aggregate. */
const exclusions: [string, Patch][] = [
  ["an addressed request", { source: { currentInboundEventKind: "user_request" } }],
  [
    "operator authority",
    { source: { operatorAuthority: { profileId: "op", scopes: [], assertCurrent: () => {} } } },
  ],
  ["cron-creator authority", { source: { createChannelCronAuthority: () => undefined } }],
  [
    "an explicit skill selection",
    { source: { explicitSkillSelections: [{ name: "s", path: "/s" }] } },
  ],
  [
    "a trace grant the owner bit does not derive",
    { run: { traceAuthorized: true, senderIsOwner: false } },
  ],
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
  ["a command or inline directive", { source: { ambientRoomProse: false } }],
  ["no recorded prose fact", { source: { ambientRoomProse: undefined } }],
  // 🌊's #1415 ruling: people, and senders the channel did not report as bots, keep their own turns.
  ["a human sender", { run: { senderIsBot: false } }],
  ["a sender of unauthenticated kind", { run: { senderIsBot: undefined } }],
];

/** A member that keeps its own per-sender key never batches across senders. */
const joins = (run: FollowupRun) =>
  resolveFollowupBatchKey(run) !== resolveFollowupDeliveryStorageKey(run);

describe("room aggregate eligibility (#1415)", () => {
  it("batches listed bots' prose under one room key, owners or not", () => {
    expect(joins(member("peer-a"))).toBe(true);
    expect(joins(owner("peer-b"))).toBe(true);
    const keys = [
      member("peer-a"),
      member("peer-b"),
      owner("peer-c"),
      owner("peer-c", { source: { memoryAudienceSenderIsOwner: true } }),
      // An overflow-compacted copy keeps its source's batch identity.
      createOverflowSummaryRetrySource(owner("peer-c")),
    ].map((run) => resolveFollowupBatchKey(run));
    expect(new Set(keys).size).toBe(1);
  });

  const withAgent = (messages: OpenClawConfig["messages"], agent: GroupChatConfig) => ({
    messages,
    agents: { entries: { agent: { ...config.agents.entries.agent, groupChat: agent } } },
  });
  const { ambientOwnerAggregatePeers } = groupChat;

  describe.each(LISTED)("%s", (_, peer) => {
    it.each(exclusions)("with %s keeps its own key", (__, patch) => {
      expect(joins(peer("peer-a", patch))).toBe(false);
    });

    it.each<[string, OpenClawConfig]>([
      ["unset", { messages: {} }],
      ["off", { messages: { groupChat: { ...groupChat, ambientOwnerAggregate: false } } }],
      ["on but off for the agent", withAgent({ groupChat }, { ambientOwnerAggregate: false })],
      ["on with no peers listed", { messages: { groupChat: { ambientOwnerAggregate: true } } }],
      [
        "on with the agent's empty peers list",
        withAgent({ groupChat }, { ambientOwnerAggregatePeers: [] }),
      ],
      ["on only for the agent, with no peers", withAgent({}, { ambientOwnerAggregate: true })],
    ])("keeps its own key with the mode %s", (__, cfg) => {
      expect(joins(peer("peer-a", { run: { config: cfg } }))).toBe(false);
    });

    it("follows the agent's override of the mode and of the peers list", () => {
      const at = (id: string, cfg: OpenClawConfig) => joins(peer(id, { run: { config: cfg } }));
      expect(at("peer-a", withAgent({}, groupChat))).toBe(true);
      const narrowed = withAgent({ groupChat }, { ambientOwnerAggregatePeers: ["peer-b"] });
      expect(at("peer-b", narrowed)).toBe(true);
      expect(at("peer-a", narrowed)).toBe(false);
    });

    it("matches the list by its own sender id, never by its name", () => {
      expect(joins(peer("peer-x"))).toBe(true);
      expect(joins(peer("peer-a", { run: { senderName: "figs", senderUsername: "figs" } }))).toBe(
        true,
      );
      const named = { senderName: "peer-a", senderUsername: "peer-a" };
      const requesterOrigin = { ...ROOM, senderId: "impostor", ...named };
      expect(joins(peer("impostor", { run: { ...named, requesterOrigin } }))).toBe(false);
    });

    it.each(["grantee", "restricted", "agent-restricted"])(
      "keeps a toolsBySender entry for id:%s on its own key",
      (id) => {
        expect(joins(peer(id))).toBe(false);
      },
    );

    it("keeps a group toolsBySender entry on its own key", () => {
      expect(joins(peer("peer-a", {}, GROUP))).toBe(true);
      expect(joins(peer("group-restricted", {}, GROUP))).toBe(false);
    });
  });

  it("batches senders that share exec overrides and runs the aggregate with them", () => {
    // Agent exec defaults reach every staged run of the session, whoever sent it.
    const execOverrides = resolveReplyExecOverrides({
      agentExecDefaults: { host: "gateway", security: "full" },
    });
    const first = member("peer-a", { run: { execOverrides } });
    expect(joins(first)).toBe(true);
    expect(resolveFollowupBatchKey(member("peer-b", { run: { execOverrides } }))).toBe(
      resolveFollowupBatchKey(first),
    );
    for (const other of [
      member("peer-c", { run: { execOverrides: { ...execOverrides, security: "allowlist" } } }),
      // A session permission mode an attempt wrote into its run's shared exec overrides.
      member("peer-b", { run: { execOverrides: { ...execOverrides, mode: "deny" } } }),
      member("peer-x"),
    ]) {
      expect(resolveFollowupBatchKey(other)).not.toBe(resolveFollowupBatchKey(first));
    }
    expect(resolveRoomAggregateExecution(first.run).execOverrides).toEqual(execOverrides);
  });

  it("runs the room baseline as no bot and with no member's account provenance", () => {
    const baseline = resolveRoomAggregateExecution({
      ...owner("peer-a").run,
      senderAccountVerified: true,
    });
    expect(baseline.senderIsBot).toBeUndefined();
    // Frond (karmaterminal, #1564): a rebuilt source never gains the owner's queue protection.
    expect(baseline.senderAccountVerified).toBeUndefined();
  });
});

// The fold's scope as 🌊 ruled it (#1415): lines cross senders, and the messages they quote, only in a
// room that opted in, and only from the bots it lists.
describe("what folds across senders and quotes (#1415)", () => {
  const listed = {
    ambientOwnerAggregatePeers: [
      ...groupChat.ambientOwnerAggregatePeers,
      "figs",
      "alice",
      "pk-figs",
    ],
  };
  const person = { senderIsBot: undefined };
  const figs = { ...person, senderAccountVerified: true as const };
  const request: Patch["source"] = { currentInboundEventKind: "user_request" };

  describe.each(["off", "on"] as const)("with ambientOwnerAggregate %s", (mode) => {
    it.each<[label: string, opted: boolean, id: string, peer: typeof member, patch?: Patch]>([
      ["a listed bot's prose", true, "peer-a", member],
      ["a listed owner bot's prose", true, "peer-a", owner],
      ["an unlisted bot's prose", false, "other-bot", member],
      ["an unlisted owner bot's prose", false, "other-bot", owner],
      // Even listed, a person is no bot peer, and neither is a webhook or proxy speaking for one.
      ["a person's prose", false, "bob", member, { run: person }],
      ["a listed person's prose", false, "alice", member, { run: { senderIsBot: false } }],
      ["the principal's prose", false, "figs", owner, { run: figs }],
      ["a listed proxy's prose", false, "pk-figs", owner, { run: person }],
      [
        "a person's directive-shaped text",
        false,
        "bob",
        member,
        { source: { ambientRoomProse: false }, run: person },
      ],
      // Channels classify control and native commands as requests (classifyChannelInboundEvent).
      ["a listed bot's mention", false, "peer-a", member, { source: request }],
      ["a listed owner bot's mention", false, "peer-a", owner, { source: request }],
      [
        "a listed bot's command or directive",
        false,
        "peer-a",
        member,
        { source: { ambientRoomProse: false } },
      ],
      [
        "a listed owner bot's command or directive",
        false,
        "peer-a",
        owner,
        { source: { ambientRoomProse: false } },
      ],
    ])("%s folds when opted in: %s", (_, opted, id, peer, patch = {}) => {
      const folds = mode === "on" && opted;
      const messages = { groupChat: { ...listed, ambientOwnerAggregate: mode === "on" } };
      const at = (quoted: string, sender: string, from: typeof member, extra: Patch = {}) =>
        resolveFollowupBatchKey(
          from(sender, {
            source: {
              originatingReplyToId: quoted,
              originatingReplyToMode: "batched",
              ...extra.source,
            },
            run: { ...extra.run, config: { messages } },
          }),
        );
      const line = at("m1", id, peer, patch);
      expect(at("m1", "peer-b", member) === line).toBe(folds);
      expect(at("m2", "peer-b", owner) === line).toBe(folds);
      // Outside the aggregate a sender's own lines stay apart by the message each one quotes.
      expect(at("m2", id, peer, patch) === line).toBe(folds);
    });
  });
});
