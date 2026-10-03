// Slack ingress cancellation: a cleared queued turn releases its migration fence budget-free.
import type { App, Receiver, ReceiverEvent } from "@slack/bolt";
import { closeOpenClawStateDatabaseForTest } from "openclaw/plugin-sdk/channel-ingress-test-runtime";
import { withTimeout } from "openclaw/plugin-sdk/time-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSlackDurableIngress, resolveSlackIngressTurnLifecycle } from "./ingress.js";
import { withQueue, type SlackIngressQueue } from "./ingress.test-support.js";

function receiverEvent(eventId: string, event: Record<string, unknown>): ReceiverEvent {
  return {
    body: {
      team_id: "T_TEST",
      api_app_id: "A_TEST",
      type: "event_callback",
      event_id: eventId,
      event_time: 1_700_000_000,
      event,
    },
    ack: vi.fn(async () => {}),
  };
}

function attachIngress(
  queue: SlackIngressQueue,
  processEvent: (event: ReceiverEvent) => Promise<void>,
) {
  const ingress = createSlackDurableIngress({
    accountId: "default",
    queue,
    pollIntervalMs: 20,
    adoptionStallTimeoutMs: 5_000,
  });
  let receive: ((event: ReceiverEvent) => Promise<void>) | undefined;
  const receiver: Receiver = {
    init: (app) => {
      receive = async (event) => await app.processEvent(event);
    },
    start: async () => undefined,
    stop: async () => undefined,
  };
  ingress.wrapReceiver(receiver).init({ processEvent } as App);
  return {
    ingress,
    receive: async (event: ReceiverEvent) => {
      if (!receive) {
        throw new Error("Receiver not initialized");
      }
      await receive(event);
    },
  };
}

describe("Slack ingress cancellation", () => {
  afterEach(() => {
    closeOpenClawStateDatabaseForTest();
  });

  it("releases the migration fence and reopens the row budget-free when a routed turn is cancelled", async () => {
    await withQueue(async (queue) => {
      const starts: string[] = [];
      const claimsAtRedelivery: Array<{ attempts: number; lastError?: string }> = [];
      let cancel: (() => Promise<void>) | undefined;
      const processEvent = vi.fn(async (received: ReceiverEvent) => {
        const event = (received.body as { event?: { type?: string } }).event;
        const type = event?.type ?? "unknown";
        starts.push(type);
        const lifecycle = resolveSlackIngressTurnLifecycle(received.customProperties);
        if (type !== "message") {
          await lifecycle?.onAdopted();
          return;
        }
        await lifecycle?.onSessionRouted?.("agent:main:slack:thread:C_NEW");
        if (!cancel) {
          // Hand the turn to the reply lane; the migration fence stays armed.
          lifecycle?.onDeferred();
          cancel = async () => {
            await lifecycle?.onCancelled?.();
          };
          return;
        }
        claimsAtRedelivery.push(
          ...(await queue.listClaims())
            .filter((claim) => claim.id === "Ev-routed")
            .map(({ attempts, lastError }) => ({ attempts, lastError })),
        );
        await lifecycle?.onAdopted();
      });
      const { ingress, receive } = attachIngress(queue, processEvent);
      ingress.start();
      try {
        await receive(
          receiverEvent("Ev-routed", {
            type: "message",
            channel: "C_NEW",
            channel_type: "channel",
            user: "U_TEST",
            ts: "1700000000.000200",
            thread_ts: "1700000000.000100",
            text: "before migration",
          }),
        );
        await vi.waitFor(() => expect(cancel).toBeDefined());
        await receive(
          receiverEvent("Ev-migration", {
            type: "channel_id_changed",
            old_channel_id: "C_OLD",
            new_channel_id: "C_NEW",
          }),
        );
        await vi.waitFor(async () => {
          expect((await queue.listClaims()).map((claim) => claim.id)).toEqual([
            "Ev-routed",
            "Ev-migration",
          ]);
        });
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
        // The deferred turn still fences the channel.
        expect(starts).toEqual(["message"]);

        await cancel?.();

        // Cancellation settles the fence, so the migration proceeds; the
        // cancelled row comes back with no attempt charged and is then adopted.
        await vi.waitFor(() => expect(starts).toContain("channel_id_changed"));
        await vi.waitFor(() => expect(starts.filter((type) => type === "message")).toHaveLength(2));
        await ingress.waitForIdle();
        expect(claimsAtRedelivery).toEqual([{ attempts: 0, lastError: undefined }]);
        expect(await queue.listPending()).toEqual([]);
        expect(await queue.listClaims()).toEqual([]);
      } finally {
        // A leaked fence would park the migration claim forever; fail instead of hanging.
        await withTimeout(ingress.stop(), 10_000, {
          message: "Slack ingress did not stop after cancellation",
        });
      }
    });
  });
});
