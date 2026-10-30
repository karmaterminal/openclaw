// Continuation wake over upstream's session-event handoff (continuation-wake.ts).
//
// Real: the continuation producer (durable row + managed system event), the wake's
// coalescing and claims, the session-event handoff, ordinary reply admission, the
// continuation chain-budget gate, restart replay and the durable session-delivery queue.
// Only the model decision (runEmbeddedAgent) is synthetic.
import { expectDefined } from "@openclaw/normalization-core/expect";
import { afterEach, expect, it, vi } from "vitest";
import { createDeferred, withinTest } from "../../../test/helpers/promise.js";
import {
  admitModelTurn,
  completionConfig,
} from "../../agents/bash-tools.lifecycle.test-support.js";
import type { RunEmbeddedAgentParams } from "../../agents/embedded-agent-runner/run/params.js";
import type { EmbeddedAgentRunResult } from "../../agents/embedded-agent-runner/types.js";
import { runEmbeddedAgent } from "../../agents/embedded-agent.js";
import type { ChannelOutboundAdapter } from "../../channels/plugins/outbound.types.js";
import type { ChannelPlugin } from "../../channels/plugins/types.public.js";
import { setRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import {
  assignSessionOwner,
  deleteSessionEntryLifecycle,
  replaceSessionEntry,
} from "../../config/sessions/session-accessor.js";
import { readSessionEntryInWorker } from "../../config/sessions/session-entry-read-writable.js";
import { readSessionHistoryPageInWorker } from "../../config/sessions/session-history-worker-runtime.js";
import { captureSessionRecipientAuthority } from "../../config/sessions/session-sharing-store.async.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { recoverPendingProducedSessionDeliveries } from "../../gateway/server-restart-sentinel.js";
import {
  resetContinuationTracer,
  setContinuationTracer,
  type StartSpanOptions,
} from "../../infra/continuation-tracer.js";
import { loadPendingSessionDelivery } from "../../infra/session-delivery-queue-storage.js";
import { isDeliveryAdoptionClaimed } from "../../infra/system-event-delivery-claims.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import {
  isSystemEventTurnOwned,
  peekSystemEventEntries,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import {
  captureActivePluginRegistrySnapshot,
  restoreActivePluginRegistrySnapshot,
  setActivePluginRegistry,
} from "../../plugins/runtime.js";
import { resolveOpenClawAgentSqlitePath } from "../../state/openclaw-agent-db.paths.js";
import { openOpenClawStateDatabase } from "../../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import {
  createChannelTestPluginBase,
  createTestRegistry,
} from "../../test-utils/channel-plugins.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { normalizeSessionDeliveryState } from "../../utils/delivery-context.shared.js";
import { getReplyFromConfig } from "../reply/get-reply.js";
import { enqueueSessionEventForHost } from "../reply/session-event-handoff.js";
import {
  requestContinuationWake,
  resetContinuationWakesForTest,
  settleContinuationWakesForTest,
} from "./continuation-wake.js";
import { enqueueContinuationReturnDeliveries } from "./targeting.js";

// mock-isolation: Synthetic model decisions; admission, queue, handoff and durable rows stay real.
vi.mock("../../agents/embedded-agent-runner/run.js", () => ({
  runEmbeddedAgent: vi.fn(),
}));
const runEmbeddedAgentMock = vi.mocked(runEmbeddedAgent);
const failingAcks = vi.hoisted(() => new Set<string>());
// Durable acks stay real unless a case arms a failing row.
vi.mock("../../infra/session-delivery-queue-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../infra/session-delivery-queue-storage.js")>();
  return {
    ...actual,
    ackSessionDelivery: async (...args: Parameters<typeof actual.ackSessionDelivery>) => {
      if (failingAcks.has(args[0])) {
        throw new Error(`ack failed for ${args[0]}`);
      }
      return await actual.ackSessionDelivery(...args);
    },
  };
});
const failingStamp = vi.hoisted(() => ({ armed: false }));
// At-anchor rewrites stay real unless a case arms the consuming-run stamp's write to fail.
vi.mock("../../config/sessions/session-message-rewrite.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../config/sessions/session-message-rewrite.js")>();
  return {
    ...actual,
    rewritePreparedTranscriptMessageAtAnchor: async (
      ...args: Parameters<typeof actual.rewritePreparedTranscriptMessageAtAnchor>
    ) => {
      if (failingStamp.armed) {
        throw new Error("synthetic stamp write failure");
      }
      return await actual.rewritePreparedTranscriptMessageAtAnchor(...args);
    },
  };
});
// Match Gateway startup: activate the real reply runtimes before admitting turns.
await Promise.all([
  import("../dispatch.js"),
  import("../reply/get-reply-from-config.runtime.js").then((runtime) =>
    runtime.prewarmConfigDrivenReplyRuntime(),
  ),
]);

const AGENT_ID = "main";
const ROUTE = { channel: "telegram", to: "-100001", accountId: "default" };

afterEach(() => {
  failingAcks.clear();
  failingStamp.armed = false;
  resetContinuationWakesForTest();
  resetSystemEventsForTest();
  runEmbeddedAgentMock.mockReset();
});

type Fixture = {
  sessionKey: string;
  sendText: ReturnType<typeof vi.fn<NonNullable<ChannelOutboundAdapter["sendText"]>>>;
  prompts: string[];
};

/** A continuation-enabled session with a mid-chain budget and a transport route. */
async function withWakeFixture(
  label: string,
  run: (fixture: Fixture) => Promise<void>,
  options: { session?: false; sessionKey?: string } = {},
) {
  await withOpenClawTestState({ label, env: { OPENCLAW_TEST_FAST: "0" } }, async (state) => {
    const config: OpenClawConfig = completionConfig(state.workspaceDir);
    config.agents = {
      ...config.agents,
      defaults: { ...config.agents?.defaults, continuation: { enabled: true } },
    };
    setRuntimeConfigSnapshot(config);
    await state.writeConfig(config);
    openOpenClawStateDatabase();
    const registry = captureActivePluginRegistrySnapshot();
    const current = expectDefined(registry.activeRegistry, "active plugin registry");
    const sendText = vi
      .fn<NonNullable<ChannelOutboundAdapter["sendText"]>>()
      .mockResolvedValue({ channel: "telegram", messageId: "wake-reply" });
    const channels = createTestRegistry([
      {
        pluginId: "telegram",
        source: "test",
        plugin: {
          ...createChannelTestPluginBase({ id: "telegram" }),
          outbound: { deliveryMode: "direct", sendText },
        } satisfies ChannelPlugin,
      },
    ]);
    setActivePluginRegistry({
      ...current,
      channels: [
        ...current.channels.filter((entry) => entry.plugin.id !== "telegram"),
        ...channels.channels,
      ],
      channelSetups: [
        ...current.channelSetups.filter((entry) => entry.plugin.id !== "telegram"),
        ...channels.channelSetups,
      ],
    });
    const sessionKey = options.sessionKey ?? `agent:main:wake-${label}`;
    if (options.session !== false) {
      await replaceSessionEntry(
        { agentId: AGENT_ID, sessionKey },
        {
          sessionId: `session-${label}`,
          lifecycleRevision: "original",
          permissionMode: "full",
          delivery: normalizeSessionDeliveryState({ context: ROUTE }),
          continuationChainCount: 2,
          continuationChainTokens: 1_000,
          continuationChainStartedAt: 1,
          continuationChainId: "chain-before-wake",
          updatedAt: Date.now(),
        },
      );
    }
    const prompts: string[] = [];
    try {
      await run({ sessionKey, sendText, prompts });
    } finally {
      restoreActivePluginRegistrySnapshot(registry);
    }
  });
}

/** What the embedded runner settles when the model ends its turn with `NO_REPLY`. */
function silentTerminal(): EmbeddedAgentRunResult {
  return { payloads: [], meta: { durationMs: 1, terminalReply: { disposition: "silent" } } };
}

/** The model answers every turn with `reply`, or ends it silently for `NO_REPLY`. */
function answerTurns(prompts: string[], reply: string) {
  runEmbeddedAgentMock.mockImplementation(async (params: RunEmbeddedAgentParams) => {
    prompts.push(params.prompt);
    await admitModelTurn(params);
    return reply === "NO_REPLY"
      ? silentTerminal()
      : {
          payloads: [{ text: reply }],
          meta: { durationMs: 1, terminalReply: { disposition: "visible", text: reply } },
        };
  });
}

/** One durable delegate return through the real producer, waking its recipient. */
async function produceReturn(
  sessionKey: string,
  text: string,
  extra: Partial<Parameters<typeof enqueueContinuationReturnDeliveries>[0]> = {},
) {
  const outcome = await enqueueContinuationReturnDeliveries({
    targetSessionKeys: [sessionKey],
    text,
    // Restart replay recognizes a continuation return by its producer's key prefix.
    idempotencyKeyBase: `continuation-return:${text}`,
    wakeRecipients: true,
    childRunId: `child-run:${text}`,
    recipientAgentIds: new Map([[sessionKey, AGENT_ID]]),
    ownerAgentId: AGENT_ID,
    ...extra,
  });
  return expectDefined(outcome.deliveryIds[0], "durable return row");
}

async function rowPending(id: string) {
  return (await loadPendingSessionDelivery(id, captureOpenClawStateWorkerContext())) !== null;
}

type StoredUserRow = {
  provenance?: { kind?: string; sourceTool?: string; runId?: string };
  __openclaw?: Record<string, unknown>;
};

/** The session's user rows as sessions.get returns them: its unprojected stored-transcript read. */
async function readStoredUserRows(sessionKey: string): Promise<StoredUserRow[]> {
  const entry = await readSessionEntryInWorker({ agentId: AGENT_ID, sessionKey });
  const sessionId = expectDefined(entry?.sessionId, "session id");
  const messages = await readSessionHistoryPageInWorker({
    kind: "recent",
    params: {
      target: {
        agentId: AGENT_ID,
        sessionEntry: { sessionId },
        sessionId,
        sessionKey,
        storePath: resolveSessionStorePathCore(undefined, { agentId: AGENT_ID }),
      },
      maxMessages: 200,
      maxLines: 4020,
      allowResetArchiveFallback: true,
    },
  });
  return messages.filter(
    (message): message is StoredUserRow =>
      typeof message === "object" && message !== null && Reflect.get(message, "role") === "user",
  );
}

/** Run ids the synthetic model decisions were admitted under, in turn order. */
function consumingRunIds() {
  return runEmbeddedAgentMock.mock.calls.map(([params]) => params.runId);
}

it("hands a delegate return to one adopted turn that keeps the chain budget", async ({
  signal,
}) => {
  await withWakeFixture("delegate-return", async ({ sessionKey, sendText, prompts }) => {
    answerTurns(prompts, "Delegate result reviewed.");
    const row = await produceReturn(sessionKey, "delegate alpha finished");
    expect(await rowPending(row)).toBe(true);

    await withinTest(settleContinuationWakesForTest(), signal);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("delegate alpha finished");
    // Adopted, then acknowledged: the durable row settled and nothing is left queued.
    expect(await rowPending(row)).toBe(false);
    expect(
      peekSystemEventEntries(resolveSystemEventQueueKey(sessionKey, AGENT_ID)).map(
        (event) => event.sessionDeliveryAckId,
      ),
    ).toEqual([]);
    // A visible delegate return delivers to the session's route.
    expect(sendText).toHaveBeenCalledOnce();
    // continuationTrigger reached run context: the mid-chain return did not reset the budget.
    const entry = await readSessionEntryInWorker({ agentId: AGENT_ID, sessionKey });
    expect(entry).toMatchObject({
      continuationChainCount: 2,
      continuationChainId: "chain-before-wake",
    });
    // openclaw#1504: the input row names the return, its delegate's run, and the consuming run.
    expect(await readStoredUserRows(sessionKey)).toMatchObject([
      {
        provenance: {
          kind: "internal_system",
          sourceTool: "continuation",
          runId: "child-run:delegate alpha finished",
        },
        __openclaw: {
          inputDeliveries: [{ deliveryId: row, sourceRunId: "child-run:delegate alpha finished" }],
          inputRunId: expectDefined(consumingRunIds()[0], "consuming run"),
        },
      },
    ]);
  });
});

it("keeps silent-wake enrichment transport-silent and mid-chain", async ({ signal }) => {
  await withWakeFixture("silent-wake", async ({ sessionKey, sendText, prompts }) => {
    answerTurns(prompts, "Noted the enrichment.");
    const row = await produceReturn(sessionKey, "enrichment from delegate", {
      wakeRecipients: false,
      returnWake: { reason: "silent-wake-enrichment", parentRunId: "child-silent" },
    });
    requestContinuationWake({
      sessionKey,
      agentId: AGENT_ID,
      reason: "silent-wake-enrichment",
      parentRunId: "child-silent",
      deliveryIds: [row],
    });

    await withinTest(settleContinuationWakesForTest(), signal);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("enrichment from delegate");
    expect(runEmbeddedAgentMock.mock.calls[0]?.[0].terminalReplyExpectation).toBe("optional");
    expect(await rowPending(row)).toBe(false);
    // Recorded in the transcript, never sent to the channel.
    expect(sendText).not.toHaveBeenCalled();
    // A delegate return, not an external subagent-return: the chain budget carries forward.
    expect(await readSessionEntryInWorker({ agentId: AGENT_ID, sessionKey })).toMatchObject({
      continuationChainCount: 2,
      continuationChainId: "chain-before-wake",
    });
  });
});

it("preserves a subagent's owed result on a silent-wake return", async ({ signal }) => {
  await withWakeFixture(
    "silent-subagent",
    async ({ sessionKey, prompts }) => {
      answerTurns(prompts, "Nested result reviewed.");
      const row = await produceReturn(sessionKey, "nested enrichment", {
        wakeRecipients: false,
        returnWake: { reason: "silent-wake-enrichment", parentRunId: "nested-child" },
      });
      requestContinuationWake({
        sessionKey,
        agentId: AGENT_ID,
        reason: "silent-wake-enrichment",
        parentRunId: "nested-child",
        deliveryIds: [row],
      });
      await withinTest(settleContinuationWakesForTest(), signal);
      expect(prompts).toHaveLength(1);
      expect(runEmbeddedAgentMock.mock.calls[0]?.[0].terminalReplyExpectation).toBe(
        "result-required",
      );
    },
    { sessionKey: "agent:main:subagent:silent-nested-parent" },
  );
});

it("coalesces several pending returns into one turn without merging their rows", async ({
  signal,
}) => {
  await withWakeFixture("multiple", async ({ sessionKey, prompts }) => {
    answerTurns(prompts, "Both results reviewed.");
    const first = await produceReturn(sessionKey, "delegate one finished");
    const second = await produceReturn(sessionKey, "delegate two finished");
    const queued = peekSystemEventEntries(resolveSystemEventQueueKey(sessionKey, AGENT_ID));
    expect(queued.map((event) => event.sessionDeliveryAckId)).toEqual([first, second]);

    await withinTest(settleContinuationWakesForTest(), signal);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("delegate one finished");
    expect(prompts[0]).toContain("delegate two finished");
    expect(await rowPending(first)).toBe(false);
    expect(await rowPending(second)).toBe(false);
    // openclaw#1504: the wake's provenance names only the last delegate; each row names its own.
    const rows = await readStoredUserRows(sessionKey);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["__openclaw"]).toMatchObject({
      inputDeliveries: [
        { deliveryId: first, sourceRunId: "child-run:delegate one finished" },
        { deliveryId: second, sourceRunId: "child-run:delegate two finished" },
      ],
      inputRunId: expectDefined(consumingRunIds()[0], "consuming run"),
    });
  });
});

it("wakes a same-agent subagent session, as a nested delegate's return needs", async ({
  signal,
}) => {
  await withWakeFixture(
    "subagent",
    async ({ sessionKey, prompts }) => {
      answerTurns(prompts, "Nested result reviewed.");
      const row = await produceReturn(sessionKey, "nested delegate finished");

      await withinTest(settleContinuationWakesForTest(), signal);

      // The retired heartbeat runner needed a trusted exception to target a subagent session;
      // the session-event handoff admits it as any session, with the chain budget intact.
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain("nested delegate finished");
      expect(await rowPending(row)).toBe(false);
      expect(await readSessionEntryInWorker({ agentId: AGENT_ID, sessionKey })).toMatchObject({
        continuationChainCount: 2,
        continuationChainId: "chain-before-wake",
      });
    },
    { sessionKey: "agent:main:subagent:wake-nested-parent" },
  );
});

it("waits behind a busy session and acknowledges only once its turn is adopted", async ({
  signal,
}) => {
  await withWakeFixture("busy", async ({ sessionKey, prompts }) => {
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    runEmbeddedAgentMock.mockImplementation(async (params: RunEmbeddedAgentParams) => {
      prompts.push(params.prompt);
      await admitModelTurn(params);
      if (prompts.length === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      return silentTerminal();
    });
    const busy = enqueueSessionEventForHost("unrelated work in progress", {
      agentId: AGENT_ID,
      sessionKey,
      source: "task",
      deliver: false,
    });
    await withinTest(firstStarted.promise, signal);
    const row = await produceReturn(sessionKey, "delegate behind busy turn");

    const wakes = settleContinuationWakesForTest();
    await withinTest(
      vi.waitFor(() =>
        expect(
          peekSystemEventEntries(resolveSystemEventQueueKey(sessionKey, AGENT_ID)).some((event) =>
            isSystemEventTurnOwned(resolveSystemEventQueueKey(sessionKey, AGENT_ID), event),
          ),
        ).toBe(true),
      ),
      signal,
    );
    // Deferred behind the active run: handed off, not yet adopted, row still pending.
    expect(prompts).toHaveLength(1);
    expect(await rowPending(row)).toBe(true);

    releaseFirst.resolve();
    await withinTest(busy.settled, signal);
    await withinTest(wakes, signal);

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("delegate behind busy turn");
    expect(await rowPending(row)).toBe(false);
    // openclaw#1504: the run that executed the deferred return is stamped, not the busy run;
    // an event turn that consumed no return carries no stamp.
    const [busyRunId, wakeRunId] = consumingRunIds();
    expect(wakeRunId).not.toBe(busyRunId);
    const rows = await readStoredUserRows(sessionKey);
    const busyInput = rows.find((input) => input.provenance?.sourceTool === "task");
    expect(busyInput?.["__openclaw"]).not.toHaveProperty("inputRunId");
    expect(rows.find((input) => input.provenance?.sourceTool === "continuation")).toMatchObject({
      __openclaw: {
        inputDeliveries: [{ deliveryId: row, sourceRunId: "child-run:delegate behind busy turn" }],
        inputRunId: expectDefined(wakeRunId, "deferred consuming run"),
      },
    });
  });
});

it("replays a pending return after restart and wakes as its producer would", async ({ signal }) => {
  await withWakeFixture("restart", async ({ sessionKey, prompts }) => {
    answerTurns(prompts, "Recovered result reviewed.");
    const row = await produceReturn(sessionKey, "delegate before restart");
    // The process dies before the wake runs: the in-memory event and wake are gone, the row stays.
    resetContinuationWakesForTest();
    resetSystemEventsForTest();
    expect(await rowPending(row)).toBe(true);

    await recoverPendingProducedSessionDeliveries({
      deps: {},
      queueContext: captureOpenClawStateWorkerContext(),
    });
    await withinTest(settleContinuationWakesForTest(), signal);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("delegate before restart");
    expect(await rowPending(row)).toBe(false);
    expect(await readSessionEntryInWorker({ agentId: AGENT_ID, sessionKey })).toMatchObject({
      continuationChainCount: 2,
    });
    // openclaw#1504: the replay keeps the row's delegate run; the post-recovery run is stamped.
    expect(await readStoredUserRows(sessionKey)).toMatchObject([
      {
        __openclaw: {
          inputDeliveries: [{ deliveryId: row, sourceRunId: "child-run:delegate before restart" }],
          inputRunId: expectDefined(consumingRunIds()[0], "consuming run"),
        },
      },
    ]);
  });
});

it("leaves a return for a missing target queued and its row pending", async ({ signal }) => {
  await withWakeFixture(
    "missing-target",
    async ({ sessionKey, prompts }) => {
      answerTurns(prompts, "unreachable");
      const row = await produceReturn(sessionKey, "delegate for a missing session");

      await withinTest(settleContinuationWakesForTest(), signal);

      // The handoff refuses an absent origin: no turn, no ack, and the occurrence is
      // passive again so a later turn or replay still owns it.
      expect(prompts).toEqual([]);
      expect(await rowPending(row)).toBe(true);
      const queueKey = resolveSystemEventQueueKey(sessionKey, AGENT_ID);
      const queued = peekSystemEventEntries(queueKey);
      expect(queued.map((event) => event.sessionDeliveryAckId)).toEqual([row]);
      expect(queued.some((event) => isSystemEventTurnOwned(queueKey, event))).toBe(false);
    },
    { session: false },
  );
});

it("retires a return whose recipient authority a reset or owner change advanced", async ({
  signal,
}) => {
  await withWakeFixture("stale-authority", async ({ sessionKey, prompts }) => {
    answerTurns(prompts, "unreachable");
    const scope = { agentId: AGENT_ID, sessionKey };
    const recipientAuthority = await captureSessionRecipientAuthority(scope);
    const row = await produceReturn(sessionKey, "delegate for the old owner", {
      recipientAuthorities: new Map([[sessionKey, recipientAuthority]]),
    });
    // The session changes hands before the wake runs.
    assignSessionOwner(scope, {
      owner: { type: "human", id: "new-owner" },
      assignedBy: { type: "human", id: "operator" },
    });

    await withinTest(settleContinuationWakesForTest(), signal);

    expect(prompts).toEqual([]);
    // Retired, never delivered: the row settles and the event leaves the queue.
    expect(await rowPending(row)).toBe(false);
    expect(peekSystemEventEntries(resolveSystemEventQueueKey(sessionKey, AGENT_ID))).toEqual([]);
  });
});

it("releases a refused current return at once when a stale return's settlement fails", async ({
  signal,
}) => {
  await withWakeFixture("stale-settlement-failure", async ({ sessionKey, prompts }) => {
    answerTurns(prompts, "unreachable");
    const scope = { agentId: AGENT_ID, sessionKey };
    const recipientAuthority = await captureSessionRecipientAuthority(scope);
    const stale = await produceReturn(sessionKey, "delegate for the deleted session", {
      wakeRecipients: false,
      recipientAuthorities: new Map([[sessionKey, recipientAuthority]]),
    });
    // Deletion advances the recipient authority, and leaves no origin for a later return's turn.
    const deletion = await deleteSessionEntryLifecycle({
      agentId: AGENT_ID,
      archiveTranscript: false,
      storePath: resolveOpenClawAgentSqlitePath({ agentId: AGENT_ID }),
      target: { canonicalKey: sessionKey, storeKeys: [sessionKey] },
    });
    expect(deletion.deleted).toBe(true);
    const current = await produceReturn(sessionKey, "unbound delegate return", {
      wakeRecipients: false,
    });
    const queueKey = resolveSystemEventQueueKey(sessionKey, AGENT_ID);
    const queued = peekSystemEventEntries(queueKey);
    expect(queued.map((event) => event.sessionDeliveryAckId)).toEqual([stale, current]);
    const stateDir = queued[1]?.sessionDeliveryAckStateDir;
    failingAcks.add(stale);
    requestContinuationWake({
      sessionKey,
      agentId: AGENT_ID,
      reason: "delegate-return",
      deliveryIds: [stale, current],
    });

    await withinTest(settleContinuationWakesForTest(), signal);

    // The current return's handoff was refused; its claim is released now, not at lease
    // expiry, so a later turn or replay can take it. The stale row stays for replay.
    expect(prompts).toEqual([]);
    expect(isDeliveryAdoptionClaimed(current, stateDir)).toBe(false);
    expect(
      peekSystemEventEntries(queueKey).some((event) => isSystemEventTurnOwned(queueKey, event)),
    ).toBe(false);
    expect(await rowPending(current)).toBe(true);
    expect(await rowPending(stale)).toBe(true);
  });
});

it("adopts and acknowledges a return whose turn ends in an intentional silent reply", async ({
  signal,
}) => {
  await withWakeFixture("silent-terminal", async ({ sessionKey, sendText, prompts }) => {
    answerTurns(prompts, "NO_REPLY");
    const row = await produceReturn(sessionKey, "delegate with nothing to say");

    await withinTest(settleContinuationWakesForTest(), signal);

    expect(prompts).toHaveLength(1);
    expect(sendText).not.toHaveBeenCalled();
    expect(await rowPending(row)).toBe(false);
  });
});

it("emits the queue drain for the returns it hands off, parented by their traceparent", async ({
  signal,
}) => {
  await withWakeFixture("traced", async ({ sessionKey, prompts }) => {
    answerTurns(prompts, "Traced result reviewed.");
    const spans: Array<{ name: string } & StartSpanOptions> = [];
    setContinuationTracer({
      startSpan(name, options) {
        spans.push({ name, ...options });
        return { setAttributes() {}, setStatus() {}, recordException() {}, end() {} };
      },
    });
    try {
      const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
      await produceReturn(sessionKey, "[continuation:enrichment-return] traced delegate", {
        traceparent,
      });

      await withinTest(settleContinuationWakesForTest(), signal);

      expect(prompts).toHaveLength(1);
      // The woken turn drains no passive events, so this is the return's only drain span.
      expect(
        spans.filter(
          (span) => span.name === "continuation.queue.drain" && span.traceparent === traceparent,
        ),
      ).toEqual([
        {
          name: "continuation.queue.drain",
          traceparent,
          attributes: {
            "queue.drained_count": 1,
            "queue.drained_continuation_count": 1,
          },
        },
      ]);
    } finally {
      resetContinuationTracer();
    }
  });
});

// openclaw#1504: a user-authored row is never a delegate consumption, and the stamp is best-effort.
it("never stamps a user-authored turn that adopts a queued return as a delegate consumption", async ({
  signal,
}) => {
  await withWakeFixture("consuming-run-user", async ({ sessionKey, prompts }) => {
    answerTurns(prompts, "Answered the operator.");
    const row = await produceReturn(sessionKey, "delegate before the operator asked", {
      wakeRecipients: false,
    });

    await withinTest(
      getReplyFromConfig({
        Body: "what did the delegate find?",
        SessionKey: sessionKey,
        Provider: "telegram",
        Surface: "telegram",
        OriginatingChannel: "telegram",
        OriginatingTo: ROUTE.to,
        AccountId: ROUTE.accountId,
        ChatType: "direct",
        From: "telegram:operator",
        SenderId: "operator",
        CommandAuthorized: true,
      }),
      signal,
    );

    // The operator's turn adopted the return: it carries the receipt, but no consumption stamp.
    expect(await rowPending(row)).toBe(false);
    const rows = await readStoredUserRows(sessionKey);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.["__openclaw"]).toMatchObject({ sessionDeliveryAckIds: [row] });
    expect(rows[0]?.["__openclaw"]).not.toHaveProperty("inputRunId");
    expect(rows[0]?.["__openclaw"]).not.toHaveProperty("inputDeliveries");
  });
});

it("keeps a woken turn and its return when the consuming-run stamp fails to write", async ({
  signal,
}) => {
  await withWakeFixture(
    "consuming-run-stamp-failure",
    async ({ sessionKey, sendText, prompts }) => {
      answerTurns(prompts, "Delegate result reviewed.");
      const row = await produceReturn(sessionKey, "delegate with a lost stamp");
      failingStamp.armed = true;

      await withinTest(settleContinuationWakesForTest(), signal);

      // The stamp is best-effort: the turn answers and the return settles without it.
      expect(prompts).toHaveLength(1);
      expect(sendText).toHaveBeenCalledOnce();
      expect(await rowPending(row)).toBe(false);
      const [input] = await readStoredUserRows(sessionKey);
      expect(input?.["__openclaw"]).toMatchObject({
        inputDeliveries: [{ deliveryId: row, sourceRunId: "child-run:delegate with a lost stamp" }],
      });
      expect(input?.["__openclaw"]).not.toHaveProperty("inputRunId");
    },
  );
});
