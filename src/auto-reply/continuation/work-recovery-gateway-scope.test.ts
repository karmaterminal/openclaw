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
import type { GatewayRequestContext } from "../../gateway/server-methods/types.js";
import { createContext } from "../../gateway/server-plugin-in-process-dispatch.test-support.js";
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
}));
// The provider is the edge: it reports the run's start and completes with a visible result.
vi.mock("../../agents/embedded-agent.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../agents/embedded-agent.js")>()),
  runEmbeddedAgent: async (params: {
    runId: string;
    onAgentEvent?: (event: { stream: string; data: Record<string, unknown> }) => unknown;
  }) => {
    await params.onAgentEvent?.({ stream: "lifecycle", data: { phase: "start" } });
    world.runIds.push(params.runId);
    return { payloads: [{ text: "the attic is clear" }], meta: { durationMs: 1 } };
  },
}));

await prewarmConfigDrivenReplyRuntime();

const ROOM = "agent:main:discord:channel:900000000000000001";
const CHAIN = "agent:main:subagent:continuation-guard";
const PREVIOUS_HOP = "guard-hop-1";
// Worker replies arrive as real macrotasks that the injected clock never advances.
const realSetImmediate = globalThis.setImmediate;
const realNow = performance.now.bind(performance);

type AgentTurn = { sessionKey?: string; message?: string };

/** The booting Gateway: real in-process dispatch; the requester turn it starts is recorded. */
function bootingGateway() {
  const turns: AgentTurn[] = [];
  const context: GatewayRequestContext = createContext([], () => ({}));
  context.resolveGatewayContext = () => context;
  context.createAgentTurnFacade = () => ({
    dispatch: async <T>(request: AgentTurn & { idempotencyKey?: string }) => {
      turns.push({ sessionKey: request.sessionKey, message: request.message });
      return { runId: request.idempotencyKey, status: "accepted" } as T;
    },
    dispatchRaw: async () => {
      throw new Error("unexpected raw dispatch");
    },
    wait: async () => {
      throw new Error("unexpected wait");
    },
  });
  return { context, turns };
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
});

/** Yield real macrotasks until `done` holds; injected time stands still, so only due timers fire. */
async function until(done: () => boolean | Promise<boolean>, describe: () => unknown) {
  const deadline = realNow() + 30_000;
  while (!(await done())) {
    if (realNow() > deadline) {
      throw new Error(`stalled: ${JSON.stringify(describe())}`);
    }
    await new Promise<void>((resolve) => {
      realSetImmediate(resolve);
    });
    await vi.advanceTimersByTimeAsync(0);
  }
}

/**
 * The previous process: the room's guard chain ran one hop and elected the next one, then the
 * Gateway died before that hop was due. Its subagent row and custody record are durable.
 */
async function chainAliveAcrossRestart(cfg: Parameters<typeof upsertSessionEntryCore>[0]["cfg"]) {
  const env = { cfg, agentId: "main" };
  await upsertSessionEntryCore({ ...env, sessionKey: ROOM }, { sessionId: "room", updatedAt: 1 });
  await upsertSessionEntryCore(
    { ...env, sessionKey: CHAIN },
    { sessionId: "guard", updatedAt: 1, spawnedBy: ROOM, spawnDepth: 1 },
  );
  await registerSubagentRun({
    runId: PREVIOUS_HOP,
    childSessionKey: CHAIN,
    childAgentId: "main",
    sessionEntry: { sessionId: "guard" },
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
  const result = await scheduleContinuationWork({
    sessionKey: CHAIN,
    chainState: { currentChainCount: 1, chainStartedAt: Date.now(), accumulatedChainTokens: 0 },
    request: { reason: "check the attic again", delaySeconds: 300 },
    config: resolveContinuationRuntimeConfig(),
  });
  expect(result.scheduled).toBe(true);
  const [record] = await listContinuationRecords({ ownerSessionKey: CHAIN, kinds: ["work"] });
  // The process dies: its timers, in-memory registry and custody projection are gone.
  resetContinuationWorkDispatchForTests();
  resetContinuationCustodyProjection();
  await resetSubagentRegistryForTests({ persist: false });
  // The new process boots after the hop fell due.
  vi.setSystemTime(record!.dueAt! + 1);
  await initSubagentRegistry();
  return record!.recordId;
}

describe("a continuation work hop recovered at Gateway boot", () => {
  it("announces its completion to the requester room through the booting Gateway", async () => {
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
        const recordId = await chainAliveAcrossRestart(cfg);

        // Gateway startup: registry activation, then custody recovery with the booting Gateway.
        const gateway = bootingGateway();
        const resolveGatewayContext = () => gateway.context;
        await activateSubagentRegistry(resolveGatewayContext);
        const summary = await runContinuationCustodyBoot({
          armedAt: Date.now(),
          resolveGatewayContext,
          whenSubagentRegistryActivated: async () => {},
        });
        expect(summary.work).toMatchObject({ sessions: 1, dispatched: 1, failed: 0 });

        const [hop] = world.runIds;
        const hopRow = () => (hop ? subagentRuns.get(hop) : undefined);
        await until(
          () =>
            gateway.turns.length > 0 ||
            Boolean(hopRow()?.delivery?.lastError) ||
            hopRow()?.delivery?.status === "failed",
          () => ({ runIds: world.runIds, row: hopRow(), turns: gateway.turns }),
        );
        expect(world.runIds).toHaveLength(1);
        expect(hopRow()?.delivery?.lastError ?? null).toBeNull();
        expect(gateway.turns).toEqual([expect.objectContaining({ sessionKey: ROOM })]);
        expect((await listContinuationRecords({ recordIds: [recordId] }))[0]).toMatchObject({
          status: "succeeded",
        });
      },
    );
  });
});
