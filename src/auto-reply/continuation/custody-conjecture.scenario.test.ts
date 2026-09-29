/**
 * Conjecture tests for the post-TaskFlow continuation custody contract
 * (docs/design/continue-work-signal-v2.md §5.4 and §9.2.2 at RFC 5201b2df47).
 *
 * Every scenario drives public continuation boundaries: the continue_delegate,
 * continue_work and request_compaction tools, the response-token grammar, the
 * agent runner's post-turn scheduling seam, compaction release, session reset,
 * and the Gateway startup recovery passes. Outcomes are observed at owners
 * outside continuation custody: calls into the spawn owner, continuation turns
 * granted by the reply owner, durable session-delivery notices, and payload
 * bytes left on disk. Nothing here reads or writes TaskFlow rows or the future
 * `continuation_records` table, so the suite survives the custody re-home.
 *
 * A Gateway restart is a fresh module graph over the same state directory
 * (`vi.resetModules()` plus re-import): every process-local map, timer handle,
 * in-flight claim and drain coordinator is gone, and only durable state
 * carries over. Work abandoned by the "crashed" graph (a spawn that never
 * returns) stays suspended forever, exactly like a killed process.
 *
 * Where the RFC changes today's behavior, the test is `it.fails` and its name
 * says which section changes it. Each such test is paired with a green test
 * that pins the invariant both designs share, so an expected-red test cannot
 * silently pass because its scenario stopped reaching the boundary.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnSubagentDirectMock = vi.hoisted(() => vi.fn());
const getReplyFromConfigMock = vi.hoisted(() => vi.fn());

// The spawn owner is the boundary where "a child was started" is observable.
vi.mock("../../agents/subagents/spawn/subagent-spawn.js", () => ({
  spawnSubagentDirect: (...args: unknown[]) => spawnSubagentDirectMock(...args),
}));
// The reply owner is the boundary where "a continuation turn ran" is observable.
vi.mock("../reply/get-reply.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../reply/get-reply.js")>()),
  getReplyFromConfig: (...args: unknown[]) => getReplyFromConfigMock(...args),
}));

import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";

const OWNER = "agent:main:discord:channel:custody-conjecture";
const OWNER_SESSION_ID = "custody-conjecture-owner-session";
const INTERRUPTED_NOTICE = "[continuation:delegate-spawn-interrupted]";
const START_MS = 1_800_000_000_000;
const CONFIG = {
  agents: { defaults: { continuation: { enabled: true } } },
  tools: { sessions_spawn: { attachments: { enabled: true } } },
};

type Gateway = Awaited<ReturnType<typeof bootGateway>>;
type DelegateForm = "tool" | "token";

async function bootGateway() {
  const [
    config,
    sessionPaths,
    accessor,
    delegateTool,
    workTool,
    compactionTool,
    recovery,
    work,
    signal,
    schedule,
    controller,
    postCompaction,
    resetCleanup,
    replyRuns,
    deliveryRecovery,
    deliveryStorage,
    sentinel,
    workerContext,
  ] = await Promise.all([
    import("../../config/config.js"),
    import("../../config/sessions.js"),
    import("../../config/sessions/session-accessor.js"),
    import("../../agents/tools/continue-delegate-tool.js"),
    import("../../agents/tools/continue-work-tool.js"),
    import("../../agents/tools/request-compaction-tool.js"),
    import("./delegate-dispatch-recovery.js"),
    import("./work-dispatch.js"),
    import("./signal.js"),
    import("../reply/agent-runner-continuation-schedule.js"),
    import("../reply/agent-runner-continuation.js"),
    import("../reply/post-compaction-delegate-dispatch.js"),
    import("../reply/session-reset-cleanup.js"),
    import("../reply/reply-run-registry.js"),
    import("../../infra/session-delivery-queue-recovery.js"),
    import("../../infra/session-delivery-queue-storage.js"),
    import("../../gateway/server-restart-sentinel.js"),
    import("../../state/openclaw-state-worker-context.js"),
  ]);
  config.setRuntimeConfigSnapshot(CONFIG as never);
  const storePath = sessionPaths.resolveSessionStorePathCore(undefined, { agentId: "main" });
  const loadOwnerEntry = () =>
    accessor.loadSessionEntry({
      hydrateSkillPromptRefs: false,
      readConsistency: "latest",
      sessionKey: OWNER,
      storePath,
    });

  /** The continuation half of Gateway startup, with its boot-time cutoff. */
  async function runContinuationRecovery(): Promise<void> {
    const armedAt = Date.now();
    await recovery.recoverPendingContinuationDelegates({
      queuedCreatedAtOrBefore: armedAt,
      includeRunningUpdatedAtOrBefore: armedAt,
    });
    await recovery.requeueAwaitingNextCompactionDelegates({ runningUpdatedAtOrBefore: armedAt });
    await recovery.recoverAndReleaseStagedPostCompactionDelegates({
      runningUpdatedAtOrBefore: armedAt,
    });
    await work.recoverPendingContinuationWork();
  }

  async function pendingOwnerDeliveries() {
    return (await deliveryStorage.loadPendingSessionDeliveries()).filter(
      (entry) => entry.sessionKey === OWNER,
    );
  }

  function followupRun(runId: string) {
    return {
      prompt: "",
      summaryLine: "custody conjecture turn",
      enqueuedAt: Date.now(),
      run: {
        agentId: "main",
        sessionId: OWNER_SESSION_ID,
        sessionKey: OWNER,
        runId,
        workspaceDir: process.cwd(),
        config: config.getRuntimeConfig(),
        provider: "openai",
        model: "gpt-5.6-luna",
        timeoutMs: 30_000,
        blockReplyBreak: "message_end",
        skipProviderRuntimeHints: true,
      },
    } as never;
  }

  return {
    storePath,
    loadOwnerEntry,
    async seedOwnerSession(): Promise<void> {
      await accessor.replaceSessionEntry({ storePath, sessionKey: OWNER }, {
        sessionKey: OWNER,
        sessionId: OWNER_SESSION_ID,
        updatedAt: Date.now(),
        status: "done",
      } as never);
    },
    delegateTool(runId: string) {
      return delegateTool.createContinueDelegateTool({ agentSessionKey: OWNER, runId });
    },
    workTool(requests: Array<{ reason: string; delaySeconds: number }>) {
      return workTool.createContinueWorkTool({
        agentSessionKey: OWNER,
        requestContinuation: (request) => requests.push(request),
      });
    },
    compactionTool(triggerCompaction: () => Promise<{ ok: boolean; compacted: boolean }>) {
      return compactionTool.createRequestCompactionTool({
        agentSessionKey: OWNER,
        sessionId: OWNER_SESSION_ID,
        ownerAgentId: "main",
        getContextUsage: () => 0.95,
        triggerCompaction,
      });
    },
    /**
     * The agent runner's post-turn continuation seam: extract the response
     * token (or the turn's continue_work tool requests), admit it, and
     * dispatch any queued delegates, exactly as `completeReplyAgentRun` does.
     */
    async completeTurn(params: {
      runId: string;
      finalText: string;
      continueWorkRequests?: Array<{ reason: string; delaySeconds: number }>;
    }): Promise<void> {
      const requests = params.continueWorkRequests ?? [];
      const extraction = signal.extractContinuationSignal({
        payloads: [{ text: params.finalText }],
        ...(requests[0] ? { continueWorkRequest: requests[0] } : {}),
        enabled: true,
        sessionKey: OWNER,
      });
      let activeEntry = loadOwnerEntry();
      const continuation = controller.createReplyContinuationController({
        cfg: config.getRuntimeConfig(),
        sessionKey: OWNER,
        storePath,
        isContinuationWake: false,
        activeSessionStore: undefined,
        getActiveSessionEntry: () => activeEntry,
        setActiveSessionEntry: (entry) => {
          activeEntry = entry;
        },
      });
      await schedule.scheduleReplyContinuation({
        cfg: config.getRuntimeConfig(),
        sessionKey: OWNER,
        followupRun: followupRun(params.runId),
        runId: params.runId,
        usage: { input: 1, output: 1 },
        effectiveContinuationSignal: extraction.signal,
        continuationExtractionFromBracket: extraction.fromBracket,
        effectiveContinueWorkRequests: requests,
        continuationWorkReason: extraction.workReason,
        internalBracketTraceparent: undefined,
        continuation,
        getActiveSessionEntry: () => activeEntry,
      });
    },
    /** Compaction release, as the agent runner calls it after an auto-compaction. */
    async releaseAfterCompaction(runId: string): Promise<void> {
      await postCompaction.dispatchPostCompactionDelegates({
        cfg: config.getRuntimeConfig(),
        compactionCount: 1,
        followupRun: followupRun(runId),
        postCompactionDelegatesToPreserve: [],
        sessionEntry: loadOwnerEntry(),
        sessionKey: OWNER,
        storePath,
      });
    },
    /** Hold the owner's reply lane, as an in-flight agent turn does. */
    beginOwnerReplyRun() {
      return replyRuns.createReplyOperation({
        sessionKey: OWNER,
        sessionId: OWNER_SESSION_ID,
        agentId: "main",
        resetTriggered: false,
      });
    },
    resetOwnerSession(): void {
      resetCleanup.clearSessionResetRuntimeState([OWNER], { agentId: "main", reason: "reset" });
    },
    /**
     * Gateway startup: session-delivery recovery (scheduled at +1250 ms), then
     * continuation recovery (+1400 ms) in `server-runtime-services.ts` order.
     */
    async runStartupRecovery(): Promise<void> {
      const queueContext = workerContext.captureOpenClawStateWorkerContext();
      await deliveryRecovery.recoverPendingSessionDeliveries({
        deliver: (entry, context) =>
          sentinel.deliverQueuedSessionDelivery({
            deps: {} as never,
            entry,
            queueContext: context.queueContext,
          }),
        queueContext,
        log: { info: () => {}, warn: () => {}, error: () => {} },
      });
      await runContinuationRecovery();
    },
    runContinuationRecovery,
    pendingOwnerDeliveries,
    async interruptedNotices(): Promise<string[]> {
      return (await pendingOwnerDeliveries()).flatMap((entry) =>
        entry.kind === "systemEvent" && entry.text.includes(INTERRUPTED_NOTICE) ? [entry.text] : [],
      );
    },
  };
}

/**
 * Drop everything a Gateway process holds in memory.
 *
 * A killed process cannot react to anything, so the dying graph's continuation
 * machinery (idle-retry waiters, work and hedge timers, dispatch claims) is
 * stopped first; otherwise its reply-run-ended waiter would wake on the reply
 * run eviction below and drive work from beyond the grave. The rest of
 * continuation's state is module-local and goes with the module graph. The
 * process-wide singletons a new process would not inherit are the Gateway
 * lifecycle generation (its rotation evicts prior-lifecycle reply runs) and
 * the in-memory event queue.
 */
async function discardProcessState(): Promise<void> {
  const [continuationRuntime, delegateDispatch, agentEvents, systemEvents] = await Promise.all([
    import("../../plugin-sdk/continuation-test-runtime.js"),
    import("./delegate-dispatch.js"),
    import("../../infra/agent-events.js"),
    import("../../infra/system-events.js"),
  ]);
  continuationRuntime.resetContinuationWorkDispatchForTests();
  continuationRuntime.resetContinueDelegateTurnAdmissionForTests();
  delegateDispatch.resetDelegateDispatchHedgesForTests();
  agentEvents.rotateAgentEventLifecycleGeneration();
  systemEvents.drainSystemEventEntries(OWNER);
  vi.resetModules();
}

function boundaryCallCounts() {
  return {
    spawns: spawnSubagentDirectMock.mock.calls.length,
    turns: getReplyFromConfigMock.mock.calls.length,
  };
}

/** A crash: discard process state and boot a fresh module graph over the same state dir. */
async function restartGateway(): Promise<Gateway> {
  const beforeCrash = boundaryCallCounts();
  await discardProcessState();
  const gateway = await bootGateway();
  // Anything the dead graph does after the crash would be a harness leak.
  expect(boundaryCallCounts(), "the crashed module graph acted after the crash").toEqual(
    beforeCrash,
  );
  return gateway;
}

async function withGateway(run: (gateway: Gateway, stateDir: string) => Promise<void>) {
  await withOpenClawTestState(
    { layout: "state-only", prefix: "openclaw-continuation-custody-conjecture-" },
    async (state) => {
      await discardProcessState();
      const gateway = await bootGateway();
      await gateway.seedOwnerSession();
      await run(gateway, state.stateDir);
    },
  );
}

function acceptSpawn() {
  let children = 0;
  return async () => {
    children += 1;
    return {
      status: "accepted" as const,
      childSessionKey: `agent:main:subagent:custody-child-${children}`,
      runId: `custody-child-run-${children}`,
    };
  };
}

/**
 * A spawn the process never returns from: the crash lands inside the spawn
 * owner, after continuation claimed the delegate. Whether the Gateway had
 * accepted the child (§5.4.4 boundary 3) or not (boundary 2) is invisible to
 * continuation at recovery, which is why Q3 treats both the same way.
 */
function crashInsideSpawn() {
  let entered!: () => void;
  const spawnEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hang = async () => {
    entered();
    return await new Promise<never>(() => {});
  };
  return { spawnEntered, hang };
}

function spawnedTasks(): string[] {
  return spawnSubagentDirectMock.mock.calls.map(([params]) => (params as { task: string }).task);
}

function continuationWakeTurns(): string[] {
  return getReplyFromConfigMock.mock.calls
    .map(([ctx]) => (ctx as { Body?: string }).Body ?? "")
    .filter((body) => body.startsWith("[continuation:wake]"));
}

/**
 * The spawn request with per-record identity (record id, chain position, trace)
 * removed. `ownerEpoch` also masks the owner session's recipient-authority
 * epoch, which differs between two owner incarnations.
 */
function spawnProjection(call: unknown[] | undefined, options: { ownerEpoch?: "mask" } = {}) {
  const [request, context] = (call ?? []) as [Record<string, unknown>, Record<string, unknown>];
  const {
    continuationDelegateFlowId: _recordId,
    continuationChainState: _chain,
    traceparent: _trace,
    task,
    ...stable
  } = request;
  const projected = {
    request: {
      ...stable,
      task: String(task).replace(/^\[continuation:chain-hop:\d+\] Delegated task \(turn \d+\//, ""),
    },
    requesterSessionKey: context.agentSessionKey,
  };
  if (options.ownerEpoch !== "mask") {
    return projected;
  }
  return JSON.parse(
    JSON.stringify(projected, (key, value: unknown) => (key === "epoch" ? "<owner-epoch>" : value)),
  ) as typeof projected;
}

function filesUnder(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(full) : entry.isFile() ? [full] : [];
  });
}

/** Every file in durable state that still holds the given bytes, raw or base64. */
function durableFilesHolding(stateDir: string, canary: string): string[] {
  const needles = [Buffer.from(canary), Buffer.from(Buffer.from(canary).toString("base64"))];
  return filesUnder(stateDir).filter((file) => {
    const bytes = fs.readFileSync(file);
    return needles.some((needle) => bytes.includes(needle));
  });
}

async function electDelegate(
  gateway: Gateway,
  form: DelegateForm,
  params: { runId: string; task: string; delaySeconds: number; mode?: string },
): Promise<void> {
  if (form === "tool") {
    await gateway.delegateTool(params.runId).execute(`${params.runId}-call`, {
      task: params.task,
      delaySeconds: params.delaySeconds,
      ...(params.mode ? { mode: params.mode } : {}),
    });
    await gateway.completeTurn({ runId: params.runId, finalText: "turn done" });
    return;
  }
  const delay = params.delaySeconds > 0 ? ` +${params.delaySeconds}s` : "";
  const mode = params.mode ? ` | ${params.mode}` : "";
  await gateway.completeTurn({
    runId: params.runId,
    finalText: `turn done\n[[CONTINUE_DELEGATE: ${params.task}${delay}${mode}]]`,
  });
}

/** Run a turn whose due delegate is claimed and then crashes inside the spawn. */
async function crashWhileClaimed(gateway: Gateway, form: DelegateForm): Promise<void> {
  const crash = crashInsideSpawn();
  spawnSubagentDirectMock.mockImplementationOnce(crash.hang);
  const turn = electDelegate(gateway, form, {
    runId: `claimed-${form}`,
    task: "publish the release notes",
    delaySeconds: 0,
  });
  await Promise.race([
    crash.spawnEntered,
    turn.then(() => {
      throw new Error("the turn finished without reaching the spawn owner");
    }),
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
  vi.setSystemTime(START_MS);
  spawnSubagentDirectMock.mockImplementation(acceptSpawn());
  getReplyFromConfigMock.mockImplementation(async () => ({ text: "continued" }));
});

afterEach(() => {
  spawnSubagentDirectMock.mockReset();
  getReplyFromConfigMock.mockReset();
  vi.useRealTimers();
});

describe("RFC §5.4.4 pre-spawn custody handoff: an unresolved claim is at-most-once (Q3)", () => {
  it.fails.each(["tool", "token"] as const)(
    "[expected red until the §5.4 re-home] %s form, boundary 2/3: restart spawns no second child and leaves exactly one interrupted notice",
    async (form) => {
      await withGateway(async (gateway) => {
        await crashWhileClaimed(gateway, form);
        expect(spawnedTasks()).toHaveLength(1);

        let restarted = await restartGateway();
        await restarted.runStartupRecovery();

        // Today C re-dispatches the `running` row and spawns a second child.
        expect(spawnedTasks()).toHaveLength(1);
        const notices = await restarted.interruptedNotices();
        expect(notices).toHaveLength(1);
        expect(notices[0]).toContain("publish the release notes");

        // The notice stays single across a second restart.
        restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(spawnedTasks()).toHaveLength(1);
        expect(await restarted.interruptedNotices()).toHaveLength(1);
      });
    },
  );

  it.each(["tool", "token"] as const)(
    "%s form, boundary 2/3: the claimed delegate is never silently dropped by a restart (§5.4.9 item 1)",
    async (form) => {
      await withGateway(async (gateway) => {
        await crashWhileClaimed(gateway, form);

        const restarted = await restartGateway();
        await restarted.runStartupRecovery();

        // C replays the claim; the re-home reports it. Either is visible.
        const replayed = spawnedTasks().length > 1;
        const reported = (await restarted.interruptedNotices()).length === 1;
        expect(replayed || reported).toBe(true);
      });
    },
  );
});

describe("RFC §5.4.9 item 1: queued work survives a restart until it is claimed", () => {
  it.each(["tool", "token"] as const)(
    "a queued %s-form continue_delegate spawns exactly once after a restart, at its due time",
    async (form) => {
      await withGateway(async (gateway) => {
        await electDelegate(gateway, form, {
          runId: `queued-${form}`,
          task: "reconcile the ledger",
          delaySeconds: 60,
        });
        expect(spawnedTasks()).toEqual([]);

        let restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(spawnedTasks()).toEqual([]);

        vi.setSystemTime(START_MS + 61_000);
        restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(spawnedTasks()).toHaveLength(1);
        expect(spawnedTasks()[0]).toContain("reconcile the ledger");

        restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(spawnedTasks()).toHaveLength(1);
      });
    },
  );

  it.each(["tool", "token"] as const)(
    "a queued %s-form continue_work election fires exactly one turn after a restart, at its due time",
    async (form) => {
      await withGateway(async (gateway) => {
        if (form === "tool") {
          const requests: Array<{ reason: string; delaySeconds: number }> = [];
          await gateway
            .workTool(requests)
            .execute("work-call", { reason: "finish the audit", delaySeconds: 60 });
          await gateway.completeTurn({
            runId: "work-tool",
            finalText: "turn done",
            continueWorkRequests: requests,
          });
        } else {
          await gateway.completeTurn({
            runId: "work-token",
            finalText: "turn done\nCONTINUE_WORK:60",
          });
        }

        let restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(continuationWakeTurns()).toEqual([]);

        vi.setSystemTime(START_MS + 61_000);
        restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(continuationWakeTurns()).toHaveLength(1);

        restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(continuationWakeTurns()).toHaveLength(1);
      });
    },
  );
});

describe("RFC §5.4.3 election replacement is one atomic owner-conditioned commit", () => {
  // An election made while its turn is still running is parked until that turn
  // ends, with its hedge due at maxDelayMs (300 s by default). A later election
  // for the same session supersedes the parked one. Recovering just after the
  // hedge is inside the dispatcher's backlog-fold grace (2 x maxDelayMs), so a
  // second live election would fire its own turn instead of being folded.
  const PARKED_HEDGE_DUE_MS = START_MS + 300_000;
  async function electWhileOwnerBusy(gateway: Gateway, runId: string, reason: string) {
    const requests: Array<{ reason: string; delaySeconds: number }> = [];
    await gateway.workTool(requests).execute(`${runId}-call`, { reason, delaySeconds: 0 });
    await gateway.completeTurn({ runId, finalText: "turn done", continueWorkRequests: requests });
  }

  it("a crash right after the replacement commits leaves exactly one live election, the replacement", async () => {
    await withGateway(async (gateway) => {
      gateway.beginOwnerReplyRun();
      await electWhileOwnerBusy(gateway, "turn-a", "parked follow-up");
      await electWhileOwnerBusy(gateway, "turn-b", "replacement follow-up");

      vi.setSystemTime(PARKED_HEDGE_DUE_MS + 1_000);
      let restarted = await restartGateway();
      await restarted.runStartupRecovery();
      const wakes = continuationWakeTurns();
      expect(wakes).toHaveLength(1);
      expect(wakes[0]).toContain("replacement follow-up");
      expect(wakes[0]).not.toContain("parked follow-up");

      restarted = await restartGateway();
      await restarted.runStartupRecovery();
      expect(continuationWakeTurns()).toHaveLength(1);
    });
  });

  it("a crash before the replacement commits leaves exactly one live election, the parked one", async () => {
    await withGateway(async (gateway) => {
      gateway.beginOwnerReplyRun();
      await electWhileOwnerBusy(gateway, "turn-a", "parked follow-up");

      vi.setSystemTime(PARKED_HEDGE_DUE_MS + 1_000);
      const restarted = await restartGateway();
      await restarted.runStartupRecovery();
      const wakes = continuationWakeTurns();
      expect(wakes).toHaveLength(1);
      expect(wakes[0]).toContain("parked follow-up");
    });
  });
});

describe("RFC §5.4.2 / §9.2.2 item 4: post-compaction release and queue insert", () => {
  async function releaseAndCrashInsideDrain(gateway: Gateway, form: DelegateForm) {
    await electDelegate(gateway, form, {
      runId: `staged-${form}`,
      task: "carry the working state",
      delaySeconds: 0,
      mode: "post-compaction",
    });
    expect(spawnedTasks()).toEqual([]);
    const crash = crashInsideSpawn();
    spawnSubagentDirectMock.mockImplementationOnce(crash.hang);
    await gateway.releaseAfterCompaction(`compaction-${form}`);
    await crash.spawnEntered;
  }

  it.each(["tool", "token"] as const)(
    "%s form: a crash after the release commits re-releases nothing from the staged delegate",
    async (form) => {
      await withGateway(async (gateway) => {
        await releaseAndCrashInsideDrain(gateway, form);
        expect(spawnedTasks()).toHaveLength(1);

        const restarted = await restartGateway();
        // Continuation recovery must not release the staged delegate a second
        // time; the queue entry is the only remaining custody.
        await restarted.runContinuationRecovery();
        expect(spawnedTasks()).toHaveLength(1);
        const queued = (await restarted.pendingOwnerDeliveries()).filter(
          (entry) => entry.kind === "postCompactionDelegate",
        );
        expect(queued).toHaveLength(1);
      });
    },
  );

  it.fails.each(["tool", "token"] as const)(
    "[expected red until the §5.4 re-home] %s form: redelivery after a crash inside the drain's spawn starts no second child and leaves exactly one interrupted notice (§5.4.4 post-compaction handoff)",
    async (form) => {
      await withGateway(async (gateway) => {
        await releaseAndCrashInsideDrain(gateway, form);

        let restarted = await restartGateway();
        await restarted.runStartupRecovery();

        // Today C's drain redelivers the entry and spawns a second child.
        expect(spawnedTasks()).toHaveLength(1);
        const notices = await restarted.interruptedNotices();
        expect(notices).toHaveLength(1);
        expect(notices[0]).toContain("carry the working state");

        restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(spawnedTasks()).toHaveLength(1);
        expect(await restarted.interruptedNotices()).toHaveLength(1);
      });
    },
  );

  it.each(["tool", "token"] as const)(
    "%s form: a released delegate whose drain crashed is never silently dropped by a restart",
    async (form) => {
      await withGateway(async (gateway) => {
        await releaseAndCrashInsideDrain(gateway, form);

        const restarted = await restartGateway();
        await restarted.runStartupRecovery();

        const replayed = spawnedTasks().length > 1;
        const reported = (await restarted.interruptedNotices()).length === 1;
        expect(replayed || reported).toBe(true);
      });
    },
  );
});

describe("RFC §5.4.4 reset at any boundary", () => {
  const CANARY = "custody-conjecture-attachment-canary-7f3e9b";

  async function queueWorkAndAttachedDelegate(gateway: Gateway) {
    await gateway.delegateTool("reset-tool").execute("reset-tool-call", {
      task: "review the attached notes",
      delaySeconds: 60,
      attachments: [{ name: "notes.txt", content: CANARY, encoding: "utf8" }],
    });
    await gateway.completeTurn({
      runId: "reset-token",
      finalText: "turn done\n[[CONTINUE_DELEGATE: token delegate before reset +60s]]",
    });
    const requests: Array<{ reason: string; delaySeconds: number }> = [];
    await gateway
      .workTool(requests)
      .execute("reset-work-call", { reason: "election before reset", delaySeconds: 60 });
    await gateway.completeTurn({
      runId: "reset-work",
      finalText: "turn done",
      continueWorkRequests: requests,
    });
  }

  it("reset cancels queued delegates and elections from both forms, and the attachment bytes are gone after the next startup", async () => {
    await withGateway(async (gateway, stateDir) => {
      await queueWorkAndAttachedDelegate(gateway);
      expect(durableFilesHolding(stateDir, CANARY)).not.toEqual([]);

      gateway.resetOwnerSession();

      vi.setSystemTime(START_MS + 61_000);
      let restarted = await restartGateway();
      await restarted.runStartupRecovery();
      expect(spawnedTasks()).toEqual([]);
      expect(continuationWakeTurns()).toEqual([]);
      expect(durableFilesHolding(stateDir, CANARY)).toEqual([]);

      restarted = await restartGateway();
      await restarted.runStartupRecovery();
      expect(spawnedTasks()).toEqual([]);
      expect(continuationWakeTurns()).toEqual([]);
    });
  });

  it.fails("[expected red until the §5.4 re-home] reset releases the attachment payload immediately, not at the next startup (§5.4.9 item 6)", async () => {
    await withGateway(async (gateway, stateDir) => {
      await queueWorkAndAttachedDelegate(gateway);
      expect(durableFilesHolding(stateDir, CANARY)).not.toEqual([]);

      gateway.resetOwnerSession();

      // Today the payload file waits for the startup custody reconcile.
      expect(durableFilesHolding(stateDir, CANARY)).toEqual([]);
    });
  });
});

describe("RFC §2.2/§2.6 tool and token forms converge on one custody record (§9.2.2 item 6)", () => {
  it("a delayed delegate reaches the spawn owner identically from the tool and the token form", async () => {
    await withGateway(async (gateway) => {
      for (const form of ["tool", "token"] as const) {
        await electDelegate(gateway, form, {
          runId: `parity-${form}`,
          task: "summarize the incident",
          delaySeconds: 60,
          mode: "silent-wake",
        });
      }
      vi.setSystemTime(START_MS + 61_000);
      const restarted = await restartGateway();
      await restarted.runStartupRecovery();

      expect(spawnSubagentDirectMock).toHaveBeenCalledTimes(2);
      const [fromTool, fromToken] = spawnSubagentDirectMock.mock.calls.map((call) =>
        spawnProjection(call),
      );
      expect(fromTool).toEqual(fromToken);
      expect(fromTool?.request).toMatchObject({ silentAnnounce: true, wakeOnReturn: true });
    });
  });

  it("a post-compaction delegate reaches the spawn owner identically from the tool and the token form", async () => {
    const projections: Array<ReturnType<typeof spawnProjection>> = [];
    for (const form of ["tool", "token"] as const) {
      await withGateway(async (gateway) => {
        await electDelegate(gateway, form, {
          runId: "parity",
          task: "restore the plan",
          delaySeconds: 0,
          mode: "post-compaction",
        });
        const crash = crashInsideSpawn();
        spawnSubagentDirectMock.mockImplementationOnce(crash.hang);
        await gateway.releaseAfterCompaction("parity-compaction");
        await crash.spawnEntered;
        projections.push(
          spawnProjection(spawnSubagentDirectMock.mock.calls[0], { ownerEpoch: "mask" }),
        );
      });
      spawnSubagentDirectMock.mockClear();
    }
    expect(projections).toHaveLength(2);
    expect(projections[0]).toEqual(projections[1]);
  });

  it("a delayed continue_work election wakes the session identically from the tool and the token form", async () => {
    const wakes: string[] = [];
    for (const form of ["tool", "token"] as const) {
      await withGateway(async (gateway) => {
        if (form === "tool") {
          const requests: Array<{ reason: string; delaySeconds: number }> = [];
          await gateway
            .workTool(requests)
            .execute("parity-work", { reason: "finish the audit", delaySeconds: 60 });
          await gateway.completeTurn({
            runId: "parity",
            finalText: "turn done",
            continueWorkRequests: requests,
          });
        } else {
          await gateway.completeTurn({ runId: "parity", finalText: "turn done\nCONTINUE_WORK:60" });
        }
        vi.setSystemTime(START_MS + 61_000);
        const restarted = await restartGateway();
        await restarted.runStartupRecovery();
        expect(continuationWakeTurns()).toHaveLength(1);
        // Only the tool form carries a reason; provenance names per-record ids.
        wakes.push(
          (continuationWakeTurns()[0] ?? "").replace(/ (Prior reason:|\[provenance\]).*$/, ""),
        );
      });
      getReplyFromConfigMock.mockClear();
      vi.setSystemTime(START_MS);
    }
    expect(wakes).toHaveLength(2);
    expect(wakes[0]).toBe(wakes[1]);
    expect(wakes[0]).toMatch(/^\[continuation:wake\] Turn 1\//);
  });
});

describe("RFC §2.5 / §5.4 unchanged: request_compaction has no durable custody", () => {
  it("a compaction request in flight at a crash leaves nothing to replay", async () => {
    await withGateway(async (gateway) => {
      const triggerCompaction = vi.fn(() => new Promise<never>(() => {}));
      const result = await gateway
        .compactionTool(triggerCompaction)
        .execute("compact-call", { reason: "context pressure at 95%" });
      expect(result.details).toMatchObject({ status: "compaction_requested" });
      expect(triggerCompaction).toHaveBeenCalledTimes(1);

      const restarted = await restartGateway();
      await restarted.runStartupRecovery();
      expect(triggerCompaction).toHaveBeenCalledTimes(1);
      expect(await restarted.pendingOwnerDeliveries()).toEqual([]);
      expect(spawnedTasks()).toEqual([]);
      expect(continuationWakeTurns()).toEqual([]);
    });
  });
});
