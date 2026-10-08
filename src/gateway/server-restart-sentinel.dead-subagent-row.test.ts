// Fossil (causal-bug-proof): an adoption-scoped durable session-delivery row
// whose target subagent session no longer exists.
//
// Incident (prince seat, build 7b0631086b; same path at be0829d37d): ~7,600
// mute `agent:main:main` turns over 30 h, heartbeat flood guard tripping every
// ~11 s with `reason=wake`, last heartbeat outcome `wake_source=restart-sentinel`,
// and 3 `pending` session-delivery rows (retry 0) addressed to a
// `agent:main:subagent:continuation-…` session that no longer exists.
//
// Owner boundaries under test run for real: the durable session-delivery queue
// (SQLite state DB), the restart-sentinel replay, the in-memory system-event
// queue, the session-event wake queue, and heartbeat session resolution. The
// only stand-in is the heartbeat wake handler (the model turn): it resolves the
// wake's heartbeat session exactly as the runner does, records which queue the
// turn would read, and ends the turn mute (`ran`, nothing adopted).
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRuntimeConfigSnapshot } from "../config/config.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveHeartbeatSession } from "../infra/heartbeat-runner-session.js";
import { setHeartbeatWakeHandler } from "../infra/heartbeat-wake.js";
import type { HeartbeatWakeRequest } from "../infra/heartbeat-wake.js";
import { drainPendingSessionDelivery } from "../infra/session-delivery-queue-recovery.js";
import {
  enqueueSessionDelivery,
  loadPendingSessionDelivery,
} from "../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../infra/system-event-ownership.js";
import {
  peekDeliverableSystemEventEntries,
  peekSystemEventEntries,
  resetSystemEventsForTest,
} from "../infra/system-events.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import {
  deliverQueuedSessionDelivery,
  recoverPendingRestartContinuationDeliveries,
  settleQueuedSessionDelivery,
} from "./server-restart-sentinel.js";

const AGENT_ID = "main";
const MAIN_SESSION_KEY = "agent:main:main";
const REPLAY_CYCLES = 3;

type ObservedWake = {
  requestedSessionKey: string | undefined;
  source: string;
  reason: string | undefined;
  /** The session the heartbeat runner would execute for this wake. */
  resolvedSessionKey: string;
  /** Ack ids visible in the queue the woken turn reads. */
  visibleAckIds: string[];
};

const silentLog = { info: () => {}, warn: () => {}, error: () => {} };

function installMuteTurnWakeHandler(cfg: OpenClawConfig) {
  const wakes: ObservedWake[] = [];
  const dispose = setHeartbeatWakeHandler(async (request: HeartbeatWakeRequest) => {
    // Same resolution the runner's preflight uses for a non-trusted wake.
    const session = resolveHeartbeatSession(cfg, AGENT_ID, undefined, request.sessionKey);
    wakes.push({
      requestedSessionKey: request.sessionKey,
      source: request.source,
      reason: request.reason,
      resolvedSessionKey: session.sessionKey,
      visibleAckIds: peekDeliverableSystemEventEntries(
        resolveSystemEventQueueKey(session.sessionKey, AGENT_ID),
      ).flatMap((event) => (event.sessionDeliveryAckId ? [event.sessionDeliveryAckId] : [])),
    });
    // The turn ends mute: message_tool_only, nothing delivered, nothing adopted.
    return { status: "ran", durationMs: 0 };
  });
  return { wakes, dispose };
}

/** Let the session-event wake queue (250 ms coalesce) dispatch anything requested. */
async function settleWakes(): Promise<void> {
  await sleep(400);
}

async function replayInProcess(id: string) {
  const queueContext = captureOpenClawStateWorkerContext();
  // The scheduler's per-row arm and the 45-75 s pending sweep both land here.
  return await drainPendingSessionDelivery({
    id,
    queueContext,
    logLabel: "session delivery",
    log: silentLog,
    deliver: (entry, { queueContext: deliveryContext }) =>
      deliverQueuedSessionDelivery({ deps: {}, entry, queueContext: deliveryContext }),
    onSettled: settleQueuedSessionDelivery,
  });
}

async function replayAfterGatewayRestart() {
  // A gateway restart drops the in-memory system-event queue and the adoption
  // claims; boot recovery then replays every pending row.
  resetSystemEventsForTest();
  await recoverPendingRestartContinuationDeliveries({
    deps: {},
    queueContext: captureOpenClawStateWorkerContext(),
    log: silentLog,
  });
}

type RowShape = "awaitPromptAdoption" | "continuation-return";

async function enqueueAdoptionScopedRow(
  sessionKey: string,
  text: string,
  shape: RowShape = "awaitPromptAdoption",
) {
  return await enqueueSessionDelivery(
    {
      kind: "systemEvent",
      sessionKey,
      agentId: AGENT_ID,
      text,
      // Both shapes replay with sessionDeliveryAwaitsTurnAdoption: an explicit
      // awaitPromptAdoption row, and a continuation return (adoption-scoped by kind).
      ...(shape === "awaitPromptAdoption"
        ? { awaitPromptAdoption: true, idempotencyKey: `fossil:${sessionKey}:${text}` }
        : { idempotencyKey: `continuation-return:fossil:${sessionKey}:${text}` }),
    },
    captureOpenClawStateWorkerContext(),
  );
}

describe("restart-sentinel replay of adoption-scoped rows", () => {
  let disposeWake: (() => void) | undefined;

  beforeEach(() => {
    resetSystemEventsForTest();
  });

  afterEach(() => {
    disposeWake?.();
    disposeWake = undefined;
    resetSystemEventsForTest();
  });

  it("(a) characterizes a row for a LIVE subagent session whose woken turn ends mute", async () => {
    await withOpenClawTestState(
      { layout: "state-only", label: "fossil-live-subagent-row" },
      async () => {
        const cfg: OpenClawConfig = {};
        setRuntimeConfigSnapshot(cfg, cfg);
        const liveKey = "agent:main:subagent:continuation-live";
        await replaceSessionEntry(
          { agentId: AGENT_ID, sessionKey: liveKey },
          { sessionId: "live-subagent-session", updatedAt: 1 },
        );
        await replaceSessionEntry(
          { agentId: AGENT_ID, sessionKey: MAIN_SESSION_KEY },
          { sessionId: "main-session", updatedAt: 1 },
        );
        const handler = installMuteTurnWakeHandler(cfg);
        disposeWake = handler.dispose;
        const id = await enqueueAdoptionScopedRow(liveKey, "delegate returned");

        await replayAfterGatewayRestart();
        await settleWakes();
        for (let cycle = 0; cycle < REPLAY_CYCLES; cycle += 1) {
          await replayInProcess(id);
          await settleWakes();
        }

        // Characterization (recorded, not a contract): the replay targets the
        // live subagent's own queue, and the wake asks for that session.
        expect(
          peekSystemEventEntries(resolveSystemEventQueueKey(liveKey, AGENT_ID)).map(
            (event) => event.sessionDeliveryAckId,
          ),
        ).toEqual([id]);
        expect(handler.wakes.map((wake) => wake.requestedSessionKey)).toEqual([liveKey]);
        // The heartbeat runner does not honor a subagent target without
        // allowSubagentSession, so even a LIVE subagent's row wakes main, and the
        // woken main turn cannot see (and so never adopts) the row's event.
        expect(handler.wakes.map((wake) => wake.resolvedSessionKey)).toEqual([MAIN_SESSION_KEY]);
        expect(handler.wakes.map((wake) => wake.visibleAckIds)).toEqual([[]]);
        expect(await loadPendingSessionDelivery(id, captureOpenClawStateWorkerContext())).toEqual(
          expect.objectContaining({ id, retryCount: 0 }),
        );
      },
    );
  });

  it.each<RowShape>(["awaitPromptAdoption", "continuation-return"])(
    "(b) %s row whose target subagent session no longer exists must not keep waking main",
    async (shape) => {
      await withOpenClawTestState(
        { layout: "state-only", label: "fossil-dead-subagent-row" },
        async () => {
          const cfg: OpenClawConfig = {};
          setRuntimeConfigSnapshot(cfg, cfg);
          // The subagent session is gone: no session row exists for it.
          const deadKey = "agent:main:subagent:continuation-0afb297";
          await replaceSessionEntry(
            { agentId: AGENT_ID, sessionKey: MAIN_SESSION_KEY },
            { sessionId: "main-session", updatedAt: 1 },
          );
          const handler = installMuteTurnWakeHandler(cfg);
          disposeWake = handler.dispose;
          const id = await enqueueAdoptionScopedRow(deadKey, "orphaned continuation return", shape);

          // Each cycle is one gateway lifetime: boot recovery, then the in-process
          // scheduler/sweep replays the still-pending row.
          const wakesByPhase: Array<{ cycle: number; restart: number; sweep: number }> = [];
          for (let cycle = 0; cycle < REPLAY_CYCLES; cycle += 1) {
            const beforeRestart = handler.wakes.length;
            await replayAfterGatewayRestart();
            await settleWakes();
            const beforeSweep = handler.wakes.length;
            await replayInProcess(id);
            await settleWakes();
            wakesByPhase.push({
              cycle,
              restart: beforeSweep - beforeRestart,
              sweep: handler.wakes.length - beforeSweep,
            });
          }

          const mainWakes = handler.wakes.filter(
            (wake) => wake.resolvedSessionKey === MAIN_SESSION_KEY,
          );
          const pending = await loadPendingSessionDelivery(id, captureOpenClawStateWorkerContext());
          // Observed values, surfaced in the failure diff below.
          const observed = {
            mainWakeCount: mainWakes.length,
            requestedSessionKeys: [
              ...new Set(handler.wakes.map((wake) => wake.requestedSessionKey)),
            ],
            resolvedSessionKeys: [...new Set(handler.wakes.map((wake) => wake.resolvedSessionKey))],
            rowVisibleToWokenTurn: handler.wakes.some((wake) => wake.visibleAckIds.includes(id)),
            rowStatus: pending ? "pending" : "settled",
            rowRetryCount: pending?.retryCount,
            wakesByPhase,
          };
          console.info(`[fossil:${shape}] observed ${JSON.stringify(observed)}`);
          // Desired contract: a row whose target session no longer exists settles
          // or dead-letters instead of repeatedly waking a turn that cannot adopt it.
          expect(observed).toMatchObject({
            mainWakeCount: expect.toBeOneOf([0, 1]),
            rowStatus: "settled",
          });
        },
      );
    },
  );
});
