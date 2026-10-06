// A durable session delivery may be acknowledged only for an event that was
// actually formatted into the prompt. Prompt preparation consumes every
// selected event, then drops some of them (an event bound to another session
// id, a replaced store, an empty compaction). A dropped event must leave its
// durable row pending so the row can still reach the session it belongs to.
//
// Real system-event queue, real session-delivery queue, real session store.
import { describe, expect, it } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import {
  enqueueSessionDelivery,
  loadPendingSessionDeliveries,
} from "../../infra/session-delivery-queue-storage.js";
import { enqueueSystemEvent, resetSystemEventsForTest } from "../../infra/system-events.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import { captureContinuationQueueContext } from "../continuation/queue-context.js";
import { settleManagedSystemEventsAfterTurnAdoption } from "./session-system-event-adoption.js";
import {
  drainFormattedSystemEvents,
  prepareFormattedSystemEvents,
} from "./session-system-events.js";

const SESSION_KEY = "agent:main:ack-formatted";
const SESSION_ID = "session-ack-formatted-current";

const custody = useContinuationCustodyTestState();

async function seedSession(): Promise<void> {
  resetSystemEventsForTest();
  await replaceSessionEntry(
    {
      // The same store prompt preparation resolves for cfg {}.
      storePath: resolveSessionStorePathCore(undefined, { agentId: "main" }),
      sessionKey: SESSION_KEY,
    },
    {
      sessionKey: SESSION_KEY,
      sessionId: SESSION_ID,
      updatedAt: Date.now(),
      status: "done",
    } as never,
  );
}

async function durableEvent(
  stateDir: string,
  params: { text: string; expectedSessionId: string; awaitsAdoption?: boolean },
): Promise<string> {
  const id = await enqueueSessionDelivery(
    {
      kind: "systemEvent",
      sessionKey: SESSION_KEY,
      agentId: "main",
      text: params.text,
      idempotencyKey: `ack-formatted:${params.text}`,
      ...(params.awaitsAdoption ? { awaitPromptAdoption: true } : {}),
    },
    captureContinuationQueueContext(stateDir),
  );
  expect(
    enqueueSystemEvent(params.text, {
      sessionKey: SESSION_KEY,
      trusted: true,
      expectedSessionId: params.expectedSessionId,
      sessionDeliveryAckId: id,
      sessionDeliveryAckStateDir: stateDir,
      ...(params.awaitsAdoption ? { sessionDeliveryAwaitsTurnAdoption: true } : {}),
    }),
  ).toBe(true);
  return id;
}

async function pendingIds(stateDir: string): Promise<string[]> {
  return (await loadPendingSessionDeliveries(captureContinuationQueueContext(stateDir))).map(
    (entry) => entry.id,
  );
}

describe("session system-event acks follow what was formatted", () => {
  it("does not ack an ordinary durable event dropped for another session id", async () => {
    const stateDir = custody.stateDir();
    await seedSession();
    const current = await durableEvent(stateDir, {
      text: "FOR-CURRENT-SESSION",
      expectedSessionId: SESSION_ID,
    });
    const other = await durableEvent(stateDir, {
      text: "FOR-PREVIOUS-SESSION",
      expectedSessionId: "session-ack-formatted-previous",
    });

    const prompt = await drainFormattedSystemEvents({
      cfg: {},
      agentId: "main",
      sessionKey: SESSION_KEY,
      isMainSession: true,
      isNewSession: false,
    });

    expect(prompt).toContain("FOR-CURRENT-SESSION");
    expect(prompt).not.toContain("FOR-PREVIOUS-SESSION");
    const pending = await pendingIds(stateDir);
    // The formatted event is acked; the dropped one stays pending for replay.
    expect(pending).not.toContain(current);
    expect(pending).toContain(other);
  });

  it("does not hand an adoption-scoped event dropped for another session id to adoption", async () => {
    const stateDir = custody.stateDir();
    await seedSession();
    const current = await durableEvent(stateDir, {
      text: "ADOPT-CURRENT-SESSION",
      expectedSessionId: SESSION_ID,
      awaitsAdoption: true,
    });
    const other = await durableEvent(stateDir, {
      text: "ADOPT-PREVIOUS-SESSION",
      expectedSessionId: "session-ack-formatted-previous",
      awaitsAdoption: true,
    });

    const prepared = await prepareFormattedSystemEvents({
      cfg: {},
      agentId: "main",
      sessionKey: SESSION_KEY,
      isMainSession: true,
      isNewSession: false,
    });
    expect(prepared.blocks.some((block) => block.text.includes("ADOPT-CURRENT-SESSION"))).toBe(
      true,
    );
    expect(prepared.blocks.some((block) => block.text.includes("ADOPT-PREVIOUS-SESSION"))).toBe(
      false,
    );
    expect(prepared.managedDeliveries.map((delivery) => delivery.id)).toEqual([current]);

    await settleManagedSystemEventsAfterTurnAdoption({
      deliveries: prepared.managedDeliveries,
      persistedMessage: {
        __openclaw: {
          sessionDeliveryAckIds: prepared.managedDeliveries.map((delivery) => delivery.id),
        },
      },
    });
    const pending = await pendingIds(stateDir);
    expect(pending).not.toContain(current);
    expect(pending).toContain(other);
  });
});
