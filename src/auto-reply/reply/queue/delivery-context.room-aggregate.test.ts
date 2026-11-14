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

/** Authority a member may carry, each of which keeps it out of the senderless room aggregate. */
const exclusions: [string, Patch][] = [
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
];

/** A member that keeps its own per-sender key never batches across senders. */
const joins = (run: FollowupRun) =>
  resolveFollowupBatchKey(run) !== resolveFollowupDeliveryStorageKey(run);

describe("room aggregate eligibility (#1415)", () => {
  it("batches baseline-authority senders under one room key", () => {
    expect(joins(member("alice"))).toBe(true);
    expect(resolveFollowupBatchKey(member("alice"))).toBe(resolveFollowupBatchKey(member("bob")));
  });

  it.each(exclusions)("keeps a member with %s on its own key", (_, patch) => {
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

describe("ambient owner room aggregate eligibility (#1415)", () => {
  const peers = { ambientOwnerAggregatePeers: ["peer-a", "peer-x"] };
  const ambient: OpenClawConfig = {
    ...config,
    messages: { groupChat: { ambientOwnerAggregate: true, ...peers } },
  };
  const withAgent = (base: OpenClawConfig, groupChat: GroupChatConfig): OpenClawConfig => ({
    ...base,
    agents: { entries: { agent: { ...config.agents.entries.agent, groupChat } } },
  });
  /** Unaddressed prose from a bot owner as the reply run stages it; a patched config keeps the mode. */
  const owner = (id: string, patch: Patch = {}, cfg = ambient) =>
    member(id, {
      source: { ambientRoomProse: true, ...patch.source },
      run: {
        senderIsOwner: true,
        traceAuthorized: true,
        senderIsBot: true,
        ...patch.run,
        config: { ...cfg, ...patch.run?.config },
      },
    });
  // Only the owner facts relax; the trace grant only as the owner bit's own derivation.
  const relaxed = new Set(["an owner memory audience", "the owner bit", "a trace grant"]);

  it("batches owner prose with other senders under one room key", () => {
    expect(joins(owner("peer-a"))).toBe(true);
    expect(resolveFollowupBatchKey(owner("peer-a"))).toBe(
      resolveFollowupBatchKey(member("alice", { run: { config: ambient } })),
    );
    expect(joins(owner("peer-a", { source: { memoryAudienceSenderIsOwner: true } }))).toBe(true);
    // An overflow-compacted copy keeps its source's batch identity.
    expect(resolveFollowupBatchKey(createOverflowSummaryRetrySource(owner("peer-a")))).toBe(
      resolveFollowupBatchKey(owner("peer-a")),
    );
  });

  it.each<[string, OpenClawConfig]>([
    ["unset", config],
    ["off", { ...config, messages: { groupChat: { ambientOwnerAggregate: false, ...peers } } }],
    ["on but off for the agent", withAgent(ambient, { ambientOwnerAggregate: false })],
    [
      "on with no peers listed",
      { ...config, messages: { groupChat: { ambientOwnerAggregate: true } } },
    ],
    [
      "on with the agent's empty peers list",
      withAgent(ambient, { ambientOwnerAggregatePeers: [] }),
    ],
    ["on only for the agent, with no peers", withAgent(config, { ambientOwnerAggregate: true })],
  ])("keeps owner prose on its own key with the mode %s", (_, cfg) => {
    expect(joins(owner("peer-a", {}, cfg))).toBe(false);
  });

  it("follows the agent's override of the mode and of the peers list", () => {
    expect(
      joins(owner("peer-a", {}, withAgent(config, { ambientOwnerAggregate: true, ...peers }))),
    ).toBe(true);
    const narrowed = withAgent(ambient, { ambientOwnerAggregatePeers: ["peer-b"] });
    expect(joins(owner("peer-b", {}, narrowed))).toBe(true);
    expect(joins(owner("peer-a", {}, narrowed))).toBe(false);
  });

  it("matches the listed peer by its own sender id, never by its name", () => {
    expect(joins(owner("peer-x"))).toBe(true);
    expect(joins(owner("peer-a", { run: { senderName: "figs", senderUsername: "figs" } }))).toBe(
      true,
    );
    const named = { senderName: "peer-a", senderUsername: "peer-a" };
    expect(
      joins(
        owner("impostor", {
          run: { ...named, requesterOrigin: { ...ROOM, senderId: "impostor", ...named } },
        }),
      ),
    ).toBe(false);
  });

  it.each<[string, string, Patch]>([
    ["an unlisted bot", "peer-new", {}],
    ["a listed human", "peer-a", { run: { senderIsBot: false } }],
    ["a listed sender of unauthenticated kind", "peer-a", { run: { senderIsBot: undefined } }],
  ])("keeps owner prose from %s on its own key", (_, id, patch) => {
    expect(joins(owner(id, patch))).toBe(false);
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

  it.each<[string, Patch]>([
    ...exclusions.filter(([label]) => !relaxed.has(label)),
    ["a command or inline directive", { source: { ambientRoomProse: false } }],
    ["no recorded prose fact", { source: { ambientRoomProse: undefined } }],
  ])("keeps owner prose with %s on its own key", (_, patch) => {
    expect(joins(owner("peer-a", patch))).toBe(false);
  });

  it("keeps a non-owner trace grant and an owner's tool grant on their own keys", () => {
    const traced = member("x", {
      source: { ambientRoomProse: true },
      run: { config: ambient, traceAuthorized: true },
    });
    expect(joins(traced)).toBe(false);
    const grant = { tools: { toolsBySender: { "id:peer-x": { alsoAllow: ["exec"] } } } };
    expect(joins(owner("peer-x", { run: { config: grant } }))).toBe(false);
  });
});
