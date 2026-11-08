// karmaterminal/openclaw#1560: a continuation chain alive across a Gateway restart comes back
// through boot work recovery. Its next hop's completion must still reach the requester room.
// Real: custody boot and work recovery, the dispatcher, the reply owner, subagent follow-up
// reactivation, the subagent registry (SQLite rows restored at boot), its lifecycle listener and
// completion announce, and in-process Gateway dispatch. Synthetic: the provider, and the booting
// Gateway's agent turn facade, which records the requester turn the announce starts.
import "../../test-utils/prepare-compiled-subprocesses.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subagentRuns } from "../../agents/subagents/registry/subagent-registry-memory.js";
import { mutateSubagentRuns } from "../../agents/subagents/registry/subagent-registry-persistence.js";
import {
  activateSubagentRegistry,
  initSubagentRegistry,
  registerSubagentRun,
} from "../../agents/subagents/registry/subagent-registry.js";
import { resetSubagentRegistryForTests } from "../../agents/subagents/registry/subagent-registry.test-helpers.js";
import { captureRuntimeConfigAsyncReader } from "../../config/io.runtime.js";
import { setRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";
import { upsertSessionEntryCore } from "../../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createLiveGatewayHolder } from "../../gateway/server-plugin-in-process-dispatch.test-support.js";
import { withPluginRuntimeGatewayContextResolver } from "../../plugins/runtime/gateway-request-scope.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import { closeOpenClawAgentDatabasesForTest } from "../../state/openclaw-agent-db.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { withFullRuntimeReplyConfig } from "../reply/get-reply-fast-path.js";
import { prewarmConfigDrivenReplyRuntime } from "../reply/get-reply-from-config.runtime.js";
import { resolveContinuationRuntimeConfig } from "./config.js";
import { runContinuationCustodyBoot } from "./custody-boot.js";
import { resetContinuationCustodyProjection } from "./custody/custody-projection.js";
import { hydrateContinuationCustody, listContinuationRecords } from "./custody/custody-store.js";
import {
  resetContinuationWorkDispatchForTests,
  scheduleContinuationWork,
} from "./work-dispatch.js";

const world = vi.hoisted(() => ({
  /** Run ids of the turns the provider ran. */
  runIds: [] as string[],
  warnings: [] as string[],
}));
// The provider is the edge: it reports the run's start and completes with a visible result.
vi.mock("../../agents/embedded-agent.js", async (importOriginal) => {
  const { prepareAgentRunTerminalReply } = await import("../../agents/agent-run-terminal-reply.js");
  return {
    ...(await importOriginal<typeof import("../../agents/embedded-agent.js")>()),
    runEmbeddedAgent: async (params: {
      runId: string;
      onAgentEvent?: (event: { stream: string; data: Record<string, unknown> }) => unknown;
    }) => {
      await params.onAgentEvent?.({ stream: "lifecycle", data: { phase: "start" } });
      world.runIds.push(params.runId);
      const { terminalReply } = prepareAgentRunTerminalReply({ rawText: "the attic is clear" });
      return {
        payloads: [{ text: "the attic is clear" }],
        meta: { durationMs: 1, terminalReply },
      };
    },
  };
});
// mock-isolation: The real loggers, with warnings recorded so a refusal's visible line is asserted.
vi.mock("../../logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../logging/subsystem.js")>();
  return {
    ...actual,
    createSubsystemLogger: (subsystem: string) => {
      const logger = actual.createSubsystemLogger(subsystem);
      return {
        ...logger,
        warn: (message: string, meta?: Record<string, unknown>) => {
          world.warnings.push(message);
          logger.warn(message, meta);
        },
      };
    },
  };
});

await prewarmConfigDrivenReplyRuntime();

const ROOM = "agent:main:discord:channel:900000000000000001";
const CHAIN = "agent:main:subagent:continuation-guard";
const CHAIN_SESSION = { sessionId: "guard", lifecycleRevision: "guard-life" };
const PREVIOUS_HOP = "guard-hop-1";
// Worker replies arrive as real macrotasks that the injected clock never advances.
const realSetImmediate = globalThis.setImmediate;
const realNow = performance.now.bind(performance);

type AgentTurn = { sessionKey?: string; message?: string; internalEvents?: unknown };

/** A Gateway instance: real in-process dispatch; the requester turns it starts are recorded. */
function gatewayInstance(options: { available?: false } = {}) {
  const turns: AgentTurn[] = [];
  // Gateway startup hands recovery its holder of the current instance.
  const holder = createLiveGatewayHolder();
  const context = holder();
  if (options.available === false) {
    // Production's instance fence: a retired instance no longer resolves itself.
    context.resolveGatewayContext = () => undefined;
  }
  context.createAgentTurnFacade = () => ({
    dispatch: async <T>(request: AgentTurn & { idempotencyKey?: string }) => {
      turns.push({
        sessionKey: request.sessionKey,
        message: request.message,
        internalEvents: request.internalEvents,
      });
      return { runId: request.idempotencyKey, status: "accepted" } as T;
    },
    dispatchRaw: async () => {
      throw new Error("unexpected raw dispatch");
    },
    wait: async () => {
      throw new Error("unexpected wait");
    },
  });
  return { context, turns, holder };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
});
afterEach(async () => {
  resetContinuationWorkDispatchForTests();
  resetContinuationCustodyProjection();
  await resetSubagentRegistryForTests({ persist: false });
  resetGatewayWorkAdmission();
  closeOpenClawAgentDatabasesForTest();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  world.runIds.length = 0;
  world.warnings.length = 0;
});

/** Yield real macrotasks until `done` holds; injected time stands still, so only due timers fire. */
async function until(done: () => boolean, describe: () => unknown) {
  const deadline = realNow() + 30_000;
  while (!done()) {
    if (realNow() > deadline) {
      throw new Error(`stalled: ${JSON.stringify(describe())}`);
    }
    await new Promise<void>((resolve) => {
      realSetImmediate(resolve);
    });
    await vi.advanceTimersByTimeAsync(0);
  }
}

async function withChainState(run: (cfg: OpenClawConfig) => Promise<void>) {
  await withOpenClawTestState(
    { label: "work-recovery-gateway-scope", env: { OPENCLAW_TEST_FAST: "0" } },
    async (state) => {
      vi.stubEnv("OPENCLAW_STATE_DIR", state.env.OPENCLAW_STATE_DIR);
      const cfg = withFullRuntimeReplyConfig({
        agents: {
          defaults: {
            workspace: state.workspaceDir,
            skipBootstrap: true,
            model: { primary: "mock-openai/gpt-4o" },
            models: { "mock-openai/gpt-4o": { agentRuntime: { id: "openclaw" as const } } },
            continuation: { enabled: true },
          },
        },
        plugins: { enabled: false },
      });
      await state.writeConfig(cfg);
      setRuntimeConfigSnapshot(cfg);
      await captureRuntimeConfigAsyncReader()();
      await hydrateContinuationCustody();
      await run(cfg);
    },
  );
}

/** The room's guard chain has run one hop, whose completion the room already received. */
async function chainWithOneHop(cfg: OpenClawConfig) {
  const scope = { cfg, agentId: "main" };
  await upsertSessionEntryCore({ ...scope, sessionKey: ROOM }, { sessionId: "room", updatedAt: 1 });
  await upsertSessionEntryCore(
    { ...scope, sessionKey: CHAIN },
    { ...CHAIN_SESSION, updatedAt: 1, spawnedBy: ROOM, spawnDepth: 1 },
  );
  await registerSubagentRun({
    runId: PREVIOUS_HOP,
    childSessionKey: CHAIN,
    childAgentId: "main",
    sessionEntry: CHAIN_SESSION,
    requesterSessionKey: ROOM,
    requesterDisplayKey: "room",
    task: "guard the attic",
    cleanup: "keep",
    expectsCompletionMessage: true,
  });
  await mutateSubagentRuns([PREVIOUS_HOP], (rows) => ({
    value: undefined,
    postimages: new Map([
      [
        PREVIOUS_HOP,
        {
          ...rows.get(PREVIOUS_HOP)!,
          execution: { status: "terminal", startedAt: 1, endedAt: 2, outcome: { status: "ok" } },
          delivery: { status: "delivered", deliveredAt: 2, announcedAt: 2 },
        },
      ],
    ]),
  }));
}

/** The chain elects its next hop, five minutes out; returns the hop's custody record. */
async function electNextHop() {
  const result = await scheduleContinuationWork({
    sessionKey: CHAIN,
    chainState: { currentChainCount: 1, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
    request: { reason: "check the attic again", delaySeconds: 300 },
    config: resolveContinuationRuntimeConfig(),
  });
  expect(result.scheduled).toBe(true);
  const [record] = await listContinuationRecords({ ownerSessionKey: CHAIN, kinds: ["work"] });
  return { recordId: record!.recordId, dueAt: record!.dueAt! };
}

/** The Gateway dies before the hop falls due; the new process restores the registry and boots. */
async function restartAfter(dueAt: number) {
  resetContinuationWorkDispatchForTests();
  resetContinuationCustodyProjection();
  await resetSubagentRegistryForTests({ persist: false });
  vi.setSystemTime(dueAt + 1);
  await initSubagentRegistry();
}

const recordStatus = async (recordId: string) =>
  (await listContinuationRecords({ recordIds: [recordId] }))[0]?.status;

/** The hop ran once, and its completion reached the room through `gateway`. */
async function expectHopAnnouncedToRoom(gateway: ReturnType<typeof gatewayInstance>) {
  const hopRow = () => (world.runIds[0] ? subagentRuns.get(world.runIds[0]) : undefined);
  await until(
    () => gateway.turns.length > 0 || Boolean(hopRow()?.delivery?.lastError),
    () => ({ runIds: world.runIds, delivery: hopRow()?.delivery, turns: gateway.turns }),
  );
  expect(world.runIds).toHaveLength(1);
  expect(hopRow()?.delivery?.lastError ?? null).toBeNull();
  expect(gateway.turns).toEqual([expect.objectContaining({ sessionKey: ROOM })]);
  // The room's turn carries the hop's result.
  expect(JSON.stringify(gateway.turns[0]?.internalEvents)).toContain("the attic is clear");
}

describe("a continuation work hop and the Gateway it announces through", () => {
  it("recovered at boot, announces its completion to the requester room", async () => {
    await withChainState(async (cfg) => {
      await chainWithOneHop(cfg);
      const { recordId, dueAt } = await electNextHop();
      await restartAfter(dueAt);

      // Gateway startup: registry activation, then custody recovery handed the same holder.
      const gateway = gatewayInstance();
      await activateSubagentRegistry(gateway.holder);
      const summary = await runContinuationCustodyBoot({
        armedAt: Date.now(),
        resolveGatewayContext: gateway.holder,
        whenSubagentRegistryActivated: async () => {},
      });

      expect(summary.work).toMatchObject({ sessions: 1, dispatched: 1, failed: 0 });
      await expectHopAnnouncedToRoom(gateway);
      expect(await recordStatus(recordId)).toBe("succeeded");
    });
  });

  it("live, armed by a turn under the Gateway, announces the same way", async () => {
    await withChainState(async (cfg) => {
      const gateway = gatewayInstance();
      await activateSubagentRegistry(gateway.holder);
      await chainWithOneHop(cfg);
      // The previous hop's turn ran under its Gateway's scope, and elected from it.
      const inTurn = <T>(run: () => Promise<T>) =>
        withPluginRuntimeGatewayContextResolver(gateway.context.resolveGatewayContext, run, {
          inheritRequestScope: false,
        });
      const { recordId, dueAt } = await inTurn(electNextHop);

      // A Node timer runs its callback in the async context that armed it; the injected clock
      // runs it in the caller's, so the hop's timer fires from the electing turn's scope.
      await inTurn(() => vi.advanceTimersByTimeAsync(dueAt - Date.now() + 1));
      await expectHopAnnouncedToRoom(gateway);
      expect(await recordStatus(recordId)).toBe("succeeded");
    });
  });

  it("recovered at boot with no available Gateway, is left queued visibly rather than run", async () => {
    await withChainState(async (cfg) => {
      await chainWithOneHop(cfg);
      const { recordId, dueAt } = await electNextHop();
      await restartAfter(dueAt);

      const retired = gatewayInstance({ available: false });
      await activateSubagentRegistry(retired.holder);
      const summary = await runContinuationCustodyBoot({
        armedAt: Date.now(),
        resolveGatewayContext: retired.holder,
        whenSubagentRegistryActivated: async () => {},
      });

      expect(summary.work).toMatchObject({ sessions: 1, dispatched: 0, failed: 0 });
      expect(world.runIds).toEqual([]);
      expect(await recordStatus(recordId)).toBe("queued");
      expect(world.warnings).toContainEqual(
        expect.stringContaining("[continuation:work-recovery-no-gateway] sessions=1 left queued"),
      );
    });
  });
});
