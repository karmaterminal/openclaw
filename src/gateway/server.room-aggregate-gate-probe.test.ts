// Frond (karmaterminal, #1415): off-seat proof for the canary probe in canary/1415-gate-probe/.
// A real in-process Gateway hot-reloads the probe in and out through config.patch, the route
// `openclaw config set` and `openclaw config unset` take against a running Gateway. The room
// aggregate plugin gate reads the plugin owners that reload publishes, unmocked, and a room burst
// crosses real durable ingress into the real session mailbox; only the channel handler and the
// reply runner are replaced. Each case boots its own Gateway (about 14 s of test time for both):
// the contract is the Gateway's own hot plugin reload republishing the registry and inventory the
// gate reads, which no cheaper layer composes.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { expectDefined } from "@openclaw/normalization-core";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { HelloOk } from "../../packages/gateway-protocol/src/index.js";
import { createDeferred, withTestTimeout } from "../../test/helpers/promise.js";
import { runQaGatewayFixture } from "../../test/helpers/qa-gateway-cleanup.js";
import {
  admitFollowupRunLifecycle,
  enqueueFollowupRun,
  scheduleFollowupDrain,
  type FollowupRun,
  type QueueSettings,
} from "../auto-reply/reply/queue.js";
import { createQueueTestRun } from "../auto-reply/reply/queue.test-helpers.js";
import { isRoomAggregatePluginSurfaceAudited } from "../auto-reply/reply/queue/room-aggregate-plugin-gate.js";
import { getExistingFollowupQueue } from "../auto-reply/reply/queue/state.js";
import { bindIngressLifecycleToReplyOptions } from "../channels/message/ingress-drain-lifecycle.js";
import { createChannelIngressDrain } from "../channels/message/ingress-drain.js";
import { createTestIngressQueue } from "../channels/message/ingress-drain.test-helpers.js";
import { getRuntimeConfig } from "../config/io.js";
import { executeSqliteQuerySync, getNodeSqliteKysely } from "../infra/kysely-sync.js";
import { resetGatewayRestartStateForInProcessRestart } from "../infra/restart.js";
import { resetLogger, setLoggerOverride } from "../logging/logger.js";
import { getGatewayPluginMetadataSnapshot } from "../plugins/current-plugin-metadata-state.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { PLUGIN_HOOK_METADATA, type PluginHookName } from "../plugins/hook-types.js";
import { clearPluginMetadataLifecycleCaches } from "../plugins/plugin-metadata-lifecycle.js";
import type { PluginRegistry } from "../plugins/registry-types.js";
import { getActivePluginRegistry } from "../plugins/runtime.js";
import { defaultRuntime } from "../runtime.js";
import type { DB as OpenClawStateKyselyDatabase } from "../state/openclaw-state-db.generated.js";
import { openOpenClawStateDatabase } from "../state/openclaw-state-db.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../test-utils/openclaw-test-state.js";
import { getFreePort } from "../test-utils/ports.js";
import { GatewayClient } from "./client.js";
import { startGatewayServer } from "./server.js";

const TOKEN = "room-aggregate-gate-probe-synthetic-token";
const PROBE = "frond-1415-gate-probe";
const PROBE_SOURCE = path.resolve(import.meta.dirname, "../../canary/1415-gate-probe", PROBE);
// METHOD.md pins these bytes: sha256 of the `sha256sum index.cjs openclaw.plugin.json` listing.
const PROBE_SHA256 = "fbb216c6125876315ef649e59f0f2757b6240257304e630dcc06516510c80e81";
// Stand-in for the fleet's audited bundled plugins: the gate reads only a registration's owner
// id and loader origin, and discovery assigns "bundled" from containment in the bundled root.
const AUDITED = "diagnostics-otel";
const COLLECT_TITLE = "[Queued messages while agent was busy]";
const SENDERS = ["alice", "bob", "carol"];
const ROOM = {
  sessionKey: "agent:main:discord:channel:room",
  messageProvider: "discord",
  chatType: "channel",
} as const;

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * Per registry surface (array, map or record), how many registrations each plugin owns. Entries
 * that name no owner are core facts or loader memos, not registrations.
 */
function registrations(registry: PluginRegistry | null | undefined) {
  const counts: Record<string, Record<string, number>> = {};
  for (const [surface, value] of Object.entries(registry ?? {})) {
    const entries: unknown[] =
      value instanceof Map
        ? [...value.values()]
        : Array.isArray(value)
          ? value
          : isRecord(value)
            ? Object.values(value)
            : [];
    for (const entry of entries) {
      const id = isRecord(entry) ? (surface === "plugins" ? entry.id : entry.pluginId) : undefined;
      if (typeof id !== "string") {
        continue;
      }
      counts[surface] ??= {};
      counts[surface][id] = (counts[surface][id] ?? 0) + 1;
    }
  }
  return counts;
}

function withoutOwner(counts: ReturnType<typeof registrations>, owner: string) {
  return Object.fromEntries(
    Object.entries(counts).flatMap(([surface, owners]) => {
      const others = Object.entries(owners).filter(([id]) => id !== owner);
      return others.length > 0 ? [[surface, Object.fromEntries(others)] as const] : [];
    }),
  );
}

function ownedBy(counts: ReturnType<typeof registrations>, owner: string) {
  return Object.fromEntries(
    Object.entries(counts).flatMap(([surface, owners]) =>
      owners[owner] ? [[surface, owners[owner]] as const] : [],
    ),
  );
}

function hookedNames(): PluginHookName[] {
  const runner = getGlobalHookRunner();
  return (Object.keys(PLUGIN_HOOK_METADATA) as PluginHookName[]).filter((name) =>
    runner?.hasHooks(name),
  );
}

describe("room aggregate gate probe (#1415)", () => {
  let state: OpenClawTestState | undefined;
  let server: Awaited<ReturnType<typeof startGatewayServer>> | undefined;
  let client: GatewayClient | undefined;
  let hotReloadRecovery: Mock;
  let staged = "";
  let baseline: ReturnType<typeof registrations> = {};
  let baselineHooks: PluginHookName[] = [];
  let auditedRecord: unknown;
  let auditedHook: unknown;
  // A turn clock that advances only when a turn runs: members adopted by one turn share a
  // completion time, members run by separate turns do not.
  let turnClock = 1_000_000;

  const testState = () => expectDefined(state, "test state");
  const gateway = () => expectDefined(client, "gateway client");
  const active = () => getActivePluginRegistry();

  /** A seat-shaped Gateway running only the audited stand-in, with the probe staged but unused. */
  const openGateway = async () => {
    turnClock = 1_000_000;
    state = await createOpenClawTestState({
      label: "room-aggregate-gate-probe",
      env: {
        OPENCLAW_GATEWAY_TOKEN: undefined,
        OPENCLAW_GATEWAY_PASSWORD: undefined,
        OPENCLAW_TEST_MINIMAL_GATEWAY: "0",
        OPENCLAW_SKIP_BROWSER_CONTROL_SERVER: "1",
        OPENCLAW_SKIP_CANVAS_HOST: "1",
        OPENCLAW_SKIP_CHANNELS: "1",
        OPENCLAW_SKIP_CRON: "1",
        OPENCLAW_SKIP_GMAIL_WATCHER: "1",
        OPENCLAW_SKIP_PROVIDERS: "1",
      },
    });
    setLoggerOverride({ level: "silent", consoleLevel: "silent" });

    const auditedDir = state.path("bundled", AUDITED);
    await fs.mkdir(auditedDir, { recursive: true });
    await fs.writeFile(
      path.join(auditedDir, "package.json"),
      JSON.stringify({
        name: `@openclaw/${AUDITED}`,
        version: "1.0.0",
        type: "commonjs",
        openclaw: { extensions: ["./index.cjs"] },
      }),
    );
    await fs.writeFile(
      path.join(auditedDir, "openclaw.plugin.json"),
      JSON.stringify({
        id: AUDITED,
        activation: { onCapabilities: ["hook"] },
        configSchema: { type: "object", additionalProperties: false },
      }),
    );
    await fs.writeFile(
      path.join(auditedDir, "index.cjs"),
      `module.exports = { id: "${AUDITED}", register(api) { api.on("before_tool_call", () => undefined); } };`,
    );
    vi.stubEnv("OPENCLAW_BUNDLED_PLUGINS_DIR", state.path("bundled"));

    // Staged as METHOD.md stages it on a seat: a copy under the seat's own ~/.openclaw/.
    staged = state.statePath("canary", PROBE);
    await fs.cp(PROBE_SOURCE, staged, { recursive: true });
    const listing = await Promise.all(
      ["index.cjs", "openclaw.plugin.json"].map(
        async (file) => `${sha256(await fs.readFile(path.join(staged, file)))}  ${file}\n`,
      ),
    );
    expect(sha256(listing.join(""))).toBe(PROBE_SHA256);

    await state.writeConfig({
      agents: { defaults: { workspace: state.workspaceDir }, entries: { main: {} } },
      plugins: { slots: { memory: "none" }, entries: { [AUDITED]: { enabled: true } } },
    });
    const port = await getFreePort();
    hotReloadRecovery = vi.fn(() => ({ status: "emitted" as const }));
    server = await startGatewayServer(port, {
      auth: { mode: "token", token: TOKEN },
      controlUiEnabled: false,
      hotReloadRecovery,
    });
    const connected = createDeferred<HelloOk>();
    client = new GatewayClient({
      url: `ws://127.0.0.1:${port}`,
      token: TOKEN,
      clientName: "gateway-client",
      clientVersion: "1.0.0",
      platform: "test",
      mode: "backend",
      deviceIdentity: null,
      scopes: ["operator.admin"],
      hostDeps: {
        loadDeviceAuthToken: () => null,
        storeDeviceAuthToken: () => {},
        clearDeviceAuthToken: () => {},
      },
      onHelloOk: (hello) => connected.resolve(hello),
      onConnectError: (error) => connected.reject(error),
    });
    client.start();
    await withTestTimeout(connected.promise, 10_000, "Gateway connect timeout");
    await server.startupSettled;

    // Baseline: only the audited bundled plugin is loaded, for the run's workspace.
    expect(getGatewayPluginMetadataSnapshot()?.workspaceDir).toBe(state.workspaceDir);
    baseline = registrations(active());
    expect(ownedBy(baseline, AUDITED)).toEqual({ plugins: 1, typedHooks: 1 });
    expect(active()?.plugins.find(({ id }) => id === AUDITED)?.origin).toBe("bundled");
    baselineHooks = hookedNames();
    auditedRecord = active()?.plugins.find(({ id }) => id === AUDITED);
    auditedHook = active()?.typedHooks.find(({ pluginId }) => pluginId === AUDITED);
  };

  afterEach(async () => {
    await runQaGatewayFixture(
      async () => resetGatewayRestartStateForInProcessRestart(),
      async () => {
        await client?.stopAndWait();
        client = undefined;
      },
      async () => {
        await server?.close();
        server = undefined;
      },
      () => resetGatewayRestartStateForInProcessRestart(),
      () => vi.unstubAllEnvs(),
      () => state?.cleanup(),
      () => resetLogger(),
      () => clearPluginMetadataLifecycleCaches(),
    );
  });

  /**
   * The request `openclaw config set|unset` sends to a running Gateway: one merge patch against
   * the current hash, naming each array it replaces or deletes (src/cli/config-cli-owner-patch.ts).
   */
  const patch = async (value: unknown, replacePaths?: string[]) => {
    const { hash } = await gateway().request<{ hash: string }>("config.get", {});
    const result = await gateway().request<{
      restart?: unknown;
      sentinel: { payload: { stats: { requiresRestart: boolean } } };
    }>("config.patch", { raw: JSON.stringify(value), baseHash: hash, replacePaths });
    expect(result.sentinel.payload.stats.requiresRestart).toBe(false);
    expect(result.restart).toBeUndefined();
  };
  /** `openclaw gateway call plugins.list --json`, narrowed to the probe. */
  const probeListing = async () => {
    const listed = await gateway().request<{
      plugins: Array<{
        id: string;
        origin?: string;
        enabled: boolean;
        runtime?: { state: string };
      }>;
    }>("plugins.list", {});
    const entry = listed.plugins.find(({ id }) => id === PROBE);
    return entry && { origin: entry.origin, enabled: entry.enabled, runtime: entry.runtime };
  };
  const gateOpen = () =>
    isRoomAggregatePluginSurfaceAudited({
      config: getRuntimeConfig(),
      workspaceDir: testState().workspaceDir,
    });
  const probeDiagnostics = () =>
    (active()?.diagnostics ?? [])
      .filter(({ pluginId }) => pluginId === PROBE)
      .map(({ level, message }) => ({ level, message }));

  /** The column METHOD.md reads on a seat. */
  const readCompletedAt = (ids: string[]) => {
    const { db } = openOpenClawStateDatabase({
      env: { OPENCLAW_STATE_DIR: testState().stateDir },
    });
    const rows = executeSqliteQuerySync(
      db,
      getNodeSqliteKysely<Pick<OpenClawStateKyselyDatabase, "channel_ingress_events">>(db)
        .selectFrom("channel_ingress_events")
        .select(["event_id", "status", "completed_at"])
        .where("event_id", "in", ids),
    ).rows;
    return Object.fromEntries(
      rows.map((row) => [row.event_id, row.status === "completed" ? row.completed_at : null]),
    );
  };

  /** A three-sender room burst queued behind an active turn, drained when that turn ends. */
  const burst = async (phase: string) => {
    const key = `${ROOM.sessionKey}:${phase}`;
    const settings: QueueSettings = { mode: "collect", debounceMs: 0, cap: 50, dropPolicy: "old" };
    const ingress = createTestIngressQueue(testState().stateDir, { now: () => turnClock });
    const refusals: string[] = [];
    let dispatched = createDeferred();
    const drain = createChannelIngressDrain({
      queue: ingress,
      deferredLaneOccupancy: "release",
      retryPolicy: { baseMs: 1, maxMs: 1 },
      now: () => turnClock,
      dispatchClaimedEvent: async (event, lifecycle) => {
        const sender = event.id.slice(phase.length + 1);
        const { turnAdoptionLifecycle } = bindIngressLifecycleToReplyOptions(lifecycle);
        const run = createQueueTestRun(
          {
            prompt: `room message from ${sender}`,
            messageId: event.id,
            currentInboundEventKind: "room_event",
            originatingChannel: "discord",
            originatingTo: "channel:room",
            originatingChatType: "channel",
            turnAdoptionLifecycle,
            abortSignal: turnAdoptionLifecycle.abortSignal,
          },
          {
            sessionKey: ROOM.sessionKey,
            messageProvider: "discord",
            config: getRuntimeConfig(),
            workspaceDir: testState().workspaceDir,
            senderId: sender,
            senderName: sender,
            senderIsOwner: false,
            requesterOrigin: { ...ROOM, senderId: sender, senderName: sender },
          },
        );
        expect(enqueueFollowupRun(key, run, settings, "message-id", undefined, false)).toBe(true);
        dispatched.resolve();
        dispatched = createDeferred();
        return { kind: "deferred" as const };
      },
    });
    const calls: FollowupRun[] = [];
    const previousError = defaultRuntime.error;
    try {
      defaultRuntime.error = (...args: unknown[]) => {
        refusals.push(args.map(String).join(" "));
      };
      for (const sender of SENDERS) {
        await ingress.enqueue(
          `${phase}-${sender}`,
          { text: `room message from ${sender}` },
          { laneKey: "channel:room" },
        );
      }
      for (const _ of SENDERS) {
        const next = dispatched.promise;
        expect(await drain.drainOnce()).toEqual({ started: 1 });
        await next;
      }
      const settlements = (getExistingFollowupQueue(key)?.entries ?? []).map(
        (input) => input.settlement.promise,
      );
      scheduleFollowupDrain(key, async (run) => {
        calls.push(run);
        await admitFollowupRunLifecycle(run);
        turnClock += 1_000;
      });
      await Promise.allSettled(settlements);
      await vi.waitFor(() => expect(getExistingFollowupQueue(key)).toBeUndefined());
      await drain.waitForIdle();
    } finally {
      drain.dispose();
      defaultRuntime.error = previousError;
    }
    return {
      turns: calls.map((call) => ({ prompt: call.prompt, senderId: call.run.senderId })),
      completed: readCompletedAt(SENDERS.map((sender) => `${phase}-${sender}`)),
      refusals,
    };
  };

  const expectAggregated = (result: Awaited<ReturnType<typeof burst>>) => {
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]?.prompt.startsWith(COLLECT_TITLE)).toBe(true);
    expect(result.turns[0]?.senderId).toBeUndefined();
    // One adoption: every member completes at the same turn.
    expect(Object.keys(result.completed)).toHaveLength(SENDERS.length);
    expect(new Set(Object.values(result.completed)).size).toBe(1);
    expect(Object.values(result.completed)).not.toContain(null);
    expect(result.refusals).toEqual([]);
  };
  /** Each member runs as itself, with its own prompt, at its own turn, and the drain logs nothing. */
  const expectPerSender = (result: Awaited<ReturnType<typeof burst>>, phase: string) => {
    expect(result.turns).toEqual(
      SENDERS.map((sender) => ({ prompt: `room message from ${sender}`, senderId: sender })),
    );
    expect(SENDERS.map((sender) => result.completed[`${phase}-${sender}`])).toEqual([
      turnClock - 3_000,
      turnClock - 2_000,
      turnClock - 1_000,
    ]);
    expect(result.refusals).toEqual([]);
  };
  /**
   * An unchanged plugin keeps its registration objects across the probe's reloads. The reload's
   * channel-restart decision compares entries by identity, so such a plugin's channel is not a
   * restart target.
   */
  const expectRetained = () => {
    expect(active()?.plugins.find(({ id }) => id === AUDITED)).toBe(auditedRecord);
    expect(active()?.typedHooks.find(({ pluginId }) => pluginId === AUDITED)).toBe(auditedHook);
  };
  const expectBaseline = () => {
    expect(registrations(active())).toEqual(baseline);
    expect(hookedNames()).toEqual(baselineHooks);
    expect(gateOpen()).toBe(true);
  };
  const unloaded = (enabled: boolean) => ({
    origin: "config",
    enabled,
    runtime: { state: "unloaded" },
  });
  const loadedListing = { origin: "config", enabled: true, runtime: { state: "active" } };

  it("with an open allowlist, the load path plus explicit enablement closes the gate, reversibly", async () => {
    await openGateway();
    expect(await probeListing()).toBeUndefined();
    expectBaseline();
    const a = await burst("a");
    expectAggregated(a);

    // METHOD.md step 3a: the load path alone discovers the probe but never loads it.
    await patch({ plugins: { load: { paths: [staged] } } }, ["plugins.load.paths"]);
    expect(await probeListing()).toEqual(unloaded(true));
    expectBaseline();

    // METHOD.md step 3b: explicit enablement loads it on the hot reload.
    await patch({ plugins: { entries: { [PROBE]: { enabled: true } } } });
    expect(await probeListing()).toEqual(loadedListing);
    const loaded = registrations(active());
    // One plugin record, one hook, and the loader's provenance warning; no other registration.
    expect(ownedBy(loaded, PROBE)).toEqual({ plugins: 1, typedHooks: 1, diagnostics: 1 });
    expect(withoutOwner(loaded, PROBE)).toEqual(baseline);
    expect(active()?.plugins.find(({ id }) => id === PROBE)).toMatchObject({
      origin: "config",
      status: "loaded",
    });
    expect(probeDiagnostics()).toEqual([
      {
        level: "warn",
        message: expect.stringContaining("OpenClaw can't verify where this plugin came from."),
      },
    ]);
    expect(hookedNames().toSorted()).toEqual([...baselineHooks, "model_call_started"].toSorted());
    expectRetained();
    // The probe declares no tools, so a turn's lazily loaded tool owners are unchanged.
    const inventoried = getGatewayPluginMetadataSnapshot()?.plugins.find(({ id }) => id === PROBE);
    expect(inventoried).toMatchObject({ id: PROBE, origin: "config" });
    expect(inventoried?.contracts).toBeUndefined();
    // Dispatching the probe's hook through the real runner completes and returns nothing.
    await expect(
      expectDefined(getGlobalHookRunner(), "hook runner").runModelCallStarted(
        { runId: "probe-run", callId: "probe-call", provider: "openai", model: "gpt-test" },
        { runId: "probe-run" },
      ),
    ).resolves.toBeUndefined();
    expect(gateOpen()).toBe(false);
    expectPerSender(await burst("b"), "b");

    // METHOD.md step 5a: removing the enable entry unloads it on the hot reload.
    await patch({ plugins: { entries: { [PROBE]: null } } });
    expect(await probeListing()).toEqual(unloaded(true));
    expectBaseline();

    // METHOD.md step 5b: removing the load path leaves no trace of it.
    await patch({ plugins: { load: { paths: null } } }, ["plugins.load.paths"]);
    expect(await probeListing()).toBeUndefined();
    expectBaseline();
    expectRetained();
    const c = await burst("c");
    expectAggregated(c);
    // The same burst runs as the same senderless turn the baseline ran.
    expect(c.turns).toEqual(a.turns);
    expect(hotReloadRecovery).not.toHaveBeenCalled();
  });

  it("with a seat allowlist, allowlist membership is the probe's enable toggle", async () => {
    await openGateway();
    // A seat whose plugins.allow names its plugins (the fleet reference shape).
    await patch({ plugins: { allow: [AUDITED] } }, ["plugins.allow"]);
    expect(await probeListing()).toBeUndefined();
    expectBaseline();

    // METHOD.md step 3a: the allowlist keeps the discovered probe disabled.
    await patch({ plugins: { load: { paths: [staged] } } }, ["plugins.load.paths"]);
    expect(await probeListing()).toEqual(unloaded(false));
    expectBaseline();

    // METHOD.md step 3b, allowlist seats: naming the probe in plugins.allow is explicit
    // enablement for a non-bundled plugin, so it loads; an allowlisted plugin gets no
    // provenance warning.
    await patch({ plugins: { allow: [AUDITED, PROBE] } }, ["plugins.allow"]);
    expect(await probeListing()).toEqual(loadedListing);
    expect(ownedBy(registrations(active()), PROBE)).toEqual({ plugins: 1, typedHooks: 1 });
    expectRetained();
    expect(gateOpen()).toBe(false);
    expectPerSender(await burst("allow-b"), "allow-b");

    // METHOD.md step 5a, allowlist seats: restoring the recorded allowlist unloads it.
    await patch({ plugins: { allow: [AUDITED] } }, ["plugins.allow"]);
    expect(await probeListing()).toEqual(unloaded(false));
    expectBaseline();

    // METHOD.md step 5b.
    await patch({ plugins: { load: { paths: null } } }, ["plugins.load.paths"]);
    expect(await probeListing()).toBeUndefined();
    expectBaseline();
    expectRetained();
    expectAggregated(await burst("allow-c"));
    expect(hotReloadRecovery).not.toHaveBeenCalled();
  });
});
