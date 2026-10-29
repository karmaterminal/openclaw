// Fossil (causal-bug-proof): an adoption-scoped durable session-delivery row
// whose target subagent session no longer exists.
//
// Incident (prince seat, build 7b0631086b; same path at be0829d37d): ~7,600
// mute `agent:main:main` turns over 30 h, heartbeat flood guard tripping every
// ~11 s with `reason=wake`, last heartbeat outcome `wake_source=restart-sentinel`,
// and 3 `pending` session-delivery rows (retry 0) addressed to a
// `agent:main:subagent:continuation-…` session that no longer exists.
//
// (Historical: the heartbeat runner of that build resolved a subagent-targeted wake
// to `agent:main:main`. Upstream retired heartbeat turns; a continuation wake now
// hands the row's event to its own session through the session-event handoff.)
//
// Owner boundaries under test run for real: the durable session-delivery queue
// (SQLite state DB), the restart-sentinel replay and the in-memory system-event
// queue. The only stand-in is the continuation wake (the model turn): it records
// which session each wake targets and which row events that session's queue holds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRuntimeConfigSnapshot } from "../config/config.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { drainPendingSessionDelivery } from "../infra/session-delivery-queue-recovery.js";
import {
  enqueueSessionDelivery,
  loadPendingSessionDelivery,
} from "../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../infra/system-event-ownership.js";
import { peekSystemEventEntries, resetSystemEventsForTest } from "../infra/system-events.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import {
  deliverQueuedSessionDelivery,
  recoverPendingProducedSessionDeliveries,
  settleQueuedSessionDelivery,
} from "./server-restart-sentinel.js";

const AGENT_ID = "main";
const MAIN_SESSION_KEY = "agent:main:main";
const REPLAY_CYCLES = 3;

type ObservedWake = {
  requestedSessionKey: string;
  reason: string;
  deliveryIds: readonly string[];
  /** Ack ids visible in the queue the woken turn reads. */
  visibleAckIds: string[];
};

const wakes = vi.hoisted((): ObservedWake[] => []);
// mock-isolation: The woken turn is the stand-in; the handoff itself is covered by continuation-wake tests.
vi.mock("../auto-reply/continuation/continuation-wake.js", async () => {
  const { peekDeliverableSystemEventEntries: peek } = await import("../infra/system-events.js");
  const { resolveSystemEventQueueKey: queueKey } =
    await import("../infra/system-event-ownership.js");
  return {
    requestContinuationWake: (request: {
      sessionKey: string;
      reason: string;
      deliveryIds: readonly string[];
    }) => {
      wakes.push({
        requestedSessionKey: request.sessionKey,
        reason: request.reason,
        deliveryIds: request.deliveryIds,
        visibleAckIds: peek(queueKey(request.sessionKey, AGENT_ID)).flatMap((event) =>
          event.sessionDeliveryAckId ? [event.sessionDeliveryAckId] : [],
        ),
      });
    },
  };
});

const silentLog = { info: () => {}, warn: () => {}, error: () => {} };

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
  await recoverPendingProducedSessionDeliveries({
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
  beforeEach(() => {
    resetSystemEventsForTest();
    wakes.length = 0;
  });

  afterEach(() => {
    resetSystemEventsForTest();
  });

  it("(a) a row for a LIVE subagent session wakes that session, whose queue holds the row", async () => {
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
        const id = await enqueueAdoptionScopedRow(liveKey, "delegate returned");

        await replayAfterGatewayRestart();
        for (let cycle = 0; cycle < REPLAY_CYCLES; cycle += 1) {
          await replayInProcess(id);
        }

        // The replay targets the live subagent's own queue, and one wake asks for
        // that session; in-process replays of the still-queued row do not wake again.
        expect(
          peekSystemEventEntries(resolveSystemEventQueueKey(liveKey, AGENT_ID)).map(
            (event) => event.sessionDeliveryAckId,
          ),
        ).toEqual([id]);
        expect(wakes.map((wake) => wake.requestedSessionKey)).toEqual([liveKey]);
        // The wake names the row and the woken session's own queue holds it, so the
        // handed-off turn can adopt it (the retired runner woke main instead).
        expect(wakes.map((wake) => wake.deliveryIds)).toEqual([[id]]);
        expect(wakes.map((wake) => wake.visibleAckIds)).toEqual([[id]]);
        expect(await loadPendingSessionDelivery(id, captureOpenClawStateWorkerContext())).toEqual(
          expect.objectContaining({ id, retryCount: 0 }),
        );
      },
    );
  });

  it.each<RowShape>(["awaitPromptAdoption", "continuation-return"])(
    "(b) %s row whose target subagent session no longer exists must not keep waking",
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
          const id = await enqueueAdoptionScopedRow(deadKey, "orphaned continuation return", shape);

          // Each cycle is one gateway lifetime: boot recovery, then the in-process
          // scheduler/sweep replays the still-pending row.
          const wakesByPhase: Array<{ cycle: number; restart: number; sweep: number }> = [];
          for (let cycle = 0; cycle < REPLAY_CYCLES; cycle += 1) {
            const beforeRestart = wakes.length;
            await replayAfterGatewayRestart();
            const beforeSweep = wakes.length;
            await replayInProcess(id);
            wakesByPhase.push({
              cycle,
              restart: beforeSweep - beforeRestart,
              sweep: wakes.length - beforeSweep,
            });
          }

          const pending = await loadPendingSessionDelivery(id, captureOpenClawStateWorkerContext());
          // Observed values, surfaced in the failure diff below.
          const observed = {
            wakeCount: wakes.length,
            requestedSessionKeys: [...new Set(wakes.map((wake) => wake.requestedSessionKey))],
            rowStatus: pending ? "pending" : "settled",
            rowRetryCount: pending?.retryCount,
            wakesByPhase,
          };
          console.info(`[fossil:${shape}] observed ${JSON.stringify(observed)}`);
          // Desired contract: a row whose target session no longer exists settles
          // or dead-letters instead of repeatedly waking a turn that cannot adopt it.
          expect(observed).toMatchObject({
            wakeCount: expect.toBeOneOf([0, 1]),
            rowStatus: "settled",
          });
        },
      );
    },
  );
});
