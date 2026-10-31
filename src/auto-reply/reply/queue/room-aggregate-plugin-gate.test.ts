// Frond (karmaterminal, #1415): a senderless room aggregate runs only while every plugin surface its
// turn can reach is an audited bundled implementation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { onGatewayWorkMetricsChanged } from "../../../infra/gateway-work-metrics-events.js";
import {
  clearCurrentPluginMetadataSnapshot,
  setCurrentPluginMetadataSnapshotState,
} from "../../../plugins/current-plugin-metadata-state.js";
import { initializeGlobalHookRunner } from "../../../plugins/hook-runner-global.js";
import { createPluginRecord } from "../../../plugins/loader-records.js";
import { createPluginMetadataSnapshotFixture } from "../../../plugins/plugin-metadata.test-support.js";
import type { PluginOrigin } from "../../../plugins/plugin-origin.types.js";
import { createEmptyPluginRegistry } from "../../../plugins/registry-empty.js";
import type { PluginRegistry } from "../../../plugins/registry-types.js";
import {
  resetPluginRuntimeStateForTest,
  setActivePluginRegistry,
} from "../../../plugins/runtime.js";
import { testing as controllerTesting } from "../../../sessions/session-controller.test-support.js";
import { admitFollowupRunLifecycle, enqueueFollowupRun, scheduleFollowupDrain } from "../queue.js";
import { createQueueTestRun, installQueueRuntimeErrorSilencer } from "../queue.test-helpers.js";
import { resolveFollowupBatchKey, resolveFollowupDeliveryStorageKey } from "./delivery-context.js";
import { getExistingFollowupQueue } from "./state.js";
import type { FollowupRun, QueueSettings } from "./types.js";

installQueueRuntimeErrorSilencer();
// Start each case from a process with no plugins loaded.
beforeEach(() => setActivePluginRegistry(createEmptyPluginRegistry()));
afterEach(() => {
  controllerTesting.resetSessionControllerForTest();
  resetPluginRuntimeStateForTest();
  clearCurrentPluginMetadataSnapshot();
});

const ROOM = {
  sessionKey: "agent:main:discord:channel:room",
  messageProvider: "discord",
  chatType: "channel",
} as const;

/** A non-owner room event as Discord ingress stages it, in the "/tmp" test workspace. */
function member(id: string, config: OpenClawConfig = {}): FollowupRun {
  return createQueueTestRun(
    {
      prompt: `room message from ${id}`,
      messageId: id,
      currentInboundEventKind: "room_event",
      originatingChannel: "discord",
      originatingTo: "channel:room",
      originatingChatType: "channel",
    },
    {
      sessionKey: ROOM.sessionKey,
      messageProvider: "discord",
      config,
      senderId: id,
      senderName: id,
      senderIsOwner: false,
      requesterOrigin: { ...ROOM, senderId: id, senderName: id },
    },
  );
}

/** A member keeping its own per-sender key never batches across senders. */
const joins = (run: FollowupRun) =>
  resolveFollowupBatchKey(run) !== resolveFollowupDeliveryStorageKey(run);

type Owner = { id: string; origin?: PluginOrigin; status?: "loaded" | "disabled" };

/** A loader-shaped registry where each owner registers a tool-call hook, a turn-time surface. */
function pluginRegistry(...owners: Owner[]): PluginRegistry {
  const registry = createEmptyPluginRegistry();
  for (const { id, origin = "bundled", status = "loaded" } of owners) {
    registry.plugins.push(
      createPluginRecord({
        id,
        origin,
        source: `/plugins/${origin}/${id}/index.js`,
        enabled: status === "loaded",
        configSchema: false,
      }),
    );
    if (status === "loaded") {
      registry.typedHooks.push({
        pluginId: id,
        hookName: "before_tool_call",
        handler: () => undefined,
        source: `/plugins/${origin}/${id}/index.js`,
      });
    }
  }
  return registry;
}

// The fleet's active plugins (bootstrap openclaw-config role).
const FLEET: Owner[] = [
  "discord",
  "active-memory",
  "codex",
  "diagnostics-otel",
  "memory-core",
  "memory-wiki",
].map((id) => ({ id }));

describe("room aggregate plugin gate (#1415)", () => {
  it("batches senders with no plugins and with only the fleet's audited plugins active", () => {
    expect(joins(member("alice"))).toBe(true);
    setActivePluginRegistry(pluginRegistry(...FLEET));
    expect(joins(member("alice"))).toBe(true);
    // An overridden duplicate never loads, so it neither runs nor blocks.
    setActivePluginRegistry(
      pluginRegistry(...FLEET, { id: "discord", origin: "global", status: "disabled" }),
    );
    expect(joins(member("alice"))).toBe(true);
  });

  it.each([
    "typedHooks",
    "hooks",
    "legacyInternalHooks",
    "tools",
    "channels",
    "agentHarnesses",
    "trustedToolPolicies",
    "mcpServerConnectionResolvers",
    "memoryCapabilities",
    "memoryPromptPreparations",
    "memoryPromptSupplements",
    "memoryCorpusSupplements",
  ] as const)("keeps a member on its own key while an unaudited plugin registers %s", (surface) => {
    const registry = pluginRegistry(...FLEET);
    setActivePluginRegistry(registry);
    registry.plugins.push(
      createPluginRecord({
        id: "sender-gate",
        origin: "bundled",
        source: "/plugins/bundled/sender-gate/index.js",
        enabled: true,
        configSchema: false,
      }),
    );
    // The gate reads only a registration's owner; an owner-only stub stays out of activation.
    (registry[surface] as Array<{ pluginId: string }>).push({ pluginId: "sender-gate" });
    expect(joins(member("alice"))).toBe(false);
  });

  it.each<[string, Owner[]]>([
    ["a third-party plugin under an audited name", [{ id: "codex", origin: "config" }]],
    ["an audited name also loaded from elsewhere", [{ id: "discord", origin: "workspace" }]],
  ])("keeps a member on its own key while %s registers a turn-time hook", (_, extra) => {
    setActivePluginRegistry(pluginRegistry(...FLEET.filter(({ id }) => id !== "codex"), ...extra));
    expect(joins(member("alice"))).toBe(false);
  });

  it("keeps a member on its own key when a hook's provenance or the registry is unreadable", () => {
    // A hook with no loader record behind it has no provenance.
    const orphan = pluginRegistry(...FLEET);
    orphan.typedHooks.push({
      pluginId: "ghost",
      hookName: "llm_input",
      handler: () => undefined,
      source: "/plugins/ghost/index.js",
    });
    setActivePluginRegistry(orphan);
    expect(joins(member("alice"))).toBe(false);

    // An SDK-initialized hook registry carries no loader origin at all.
    setActivePluginRegistry(pluginRegistry(...FLEET));
    const sdkHooks = pluginRegistry({ id: "discord" });
    initializeGlobalHookRunner({ ...sdkHooks, plugins: [{ id: "discord", status: "loaded" }] });
    expect(joins(member("alice"))).toBe(false);

    resetPluginRuntimeStateForTest();
    const unreadable = pluginRegistry(...FLEET);
    setActivePluginRegistry(unreadable);
    Object.defineProperty(unreadable, "typedHooks", {
      get: () => {
        throw new Error("registry unavailable");
      },
    });
    expect(joins(member("alice"))).toBe(false);
  });

  it("reads unloaded tool owners from the Gateway inventory of the run's workspace", () => {
    const inventory = (id: string, origin: PluginOrigin, workspaceDir = "/tmp") =>
      setCurrentPluginMetadataSnapshotState(
        {
          ...createPluginMetadataSnapshotFixture({
            plugins: [{ id, origin, contracts: { tools: [`${id}_tool`] } }],
          }),
          workspaceDir,
        },
        undefined,
        undefined,
        undefined,
        "gateway",
      );
    // Plugin tools load lazily at turn time; no runtime registry holds these yet.
    inventory("memory-core", "bundled");
    expect(joins(member("alice"))).toBe(true);
    inventory("lazy-tools", "global");
    expect(joins(member("alice"))).toBe(false);
    // A disabled tool plugin never loads.
    expect(
      joins(member("alice", { plugins: { entries: { "lazy-tools": { enabled: false } } } })),
    ).toBe(true);
    // Another workspace's discovery is not this run's: a workspace plugin there may shadow an id.
    inventory("memory-core", "bundled", "/srv/other-agent");
    expect(joins(member("alice"))).toBe(false);
  });
});

describe("room aggregate plugin gate at the drain (#1415)", () => {
  const settings: QueueSettings = { mode: "collect", debounceMs: 0, cap: 50, dropPolicy: "old" };
  const COLLECT_TITLE = "[Queued messages while agent was busy]";

  /** Room events queued behind an active turn; its end drains the mailbox into `calls`. */
  async function drainRoom(senders: string[], onClaim?: (sources: number) => void) {
    const key = `agent:main:discord:channel:room:${expect.getState().currentTestName}`;
    for (const id of senders) {
      expect(enqueueFollowupRun(key, member(id), settings, "message-id", undefined, false)).toBe(
        true,
      );
    }
    const calls: FollowupRun[] = [];
    let claimed = false;
    const stop = onGatewayWorkMetricsChanged(() => {
      const sources = getExistingFollowupQueue(key)?.claim?.sources.length ?? 0;
      if (onClaim && !claimed && sources > 0) {
        claimed = true;
        onClaim(sources);
      }
    });
    try {
      const settlements = (getExistingFollowupQueue(key)?.entries ?? []).map(
        (input) => input.settlement.promise,
      );
      scheduleFollowupDrain(key, async (run) => {
        calls.push(run);
        await admitFollowupRunLifecycle(run);
      });
      await Promise.allSettled(settlements);
      await vi.waitFor(() => expect(getExistingFollowupQueue(key)).toBeUndefined());
    } finally {
      stop();
    }
    return calls;
  }

  it("runs a 100-sender burst as one turn with only the fleet's audited plugins active", async () => {
    setActivePluginRegistry(pluginRegistry(...FLEET));
    const senders = Array.from({ length: 100 }, (_, index) => `speaker-${index + 1}`);
    const calls = await drainRoom(senders);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.prompt.startsWith(COLLECT_TITLE)).toBe(true);
    expect(calls[0]?.run.senderId).toBeUndefined();
  });

  it("falls back to per-sender turns when an unaudited plugin activates after the claim formed", async () => {
    setActivePluginRegistry(pluginRegistry(...FLEET));
    const senders = ["alice", "bob", "carol"];
    const calls = await drainRoom(senders, (sources) => {
      // Selection saw only audited plugins and claimed the whole room.
      expect(sources).toBe(senders.length);
      setActivePluginRegistry(pluginRegistry(...FLEET, { id: "sender-gate", origin: "global" }));
    });
    // Each member runs as itself; no turn runs senderless.
    expect(calls.map((call) => [call.prompt, call.run.senderId])).toEqual(
      senders.map((id) => [`room message from ${id}`, id]),
    );
  });
});
