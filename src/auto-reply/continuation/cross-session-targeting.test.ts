import { describe, expect, it, vi } from "vitest";
import type { QueuedSessionDeliveryPayload } from "../../infra/session-delivery-queue-storage.js";
import {
  enqueueContinuationReturnDeliveries,
  resolveContinuationReturnTargetSessionKeys,
} from "./targeting.js";

describe("continuation cross-session targeting", () => {
  type EnqueueSystemEvent = typeof import("../../infra/system-events.js").enqueueSystemEvent;

  it("defaults returns to the dispatching session", () => {
    expect(
      resolveContinuationReturnTargetSessionKeys({
        defaultSessionKey: "agent:main:parent",
      }),
    ).toEqual(["agent:main:parent"]);
  });

  it("targets one other session via targetSessionKey", () => {
    expect(
      resolveContinuationReturnTargetSessionKeys({
        defaultSessionKey: "agent:main:parent",
        targetSessionKey: "agent:main:root",
      }),
    ).toEqual(["agent:main:root"]);
  });

  it("targets multiple sessions with byte-identical target order and dedupe", () => {
    expect(
      resolveContinuationReturnTargetSessionKeys({
        defaultSessionKey: "agent:main:parent",
        targetSessionKeys: ["agent:main:sibling", "agent:main:root", "agent:main:sibling"],
      }),
    ).toEqual(["agent:main:sibling", "agent:main:root"]);
  });

  it("resolves fanoutMode=tree to all ancestors in the chain", () => {
    expect(
      resolveContinuationReturnTargetSessionKeys({
        defaultSessionKey: "agent:main:depth-2",
        fanoutMode: "tree",
        treeSessionKeys: ["agent:main:depth-2", "agent:main:depth-1", "agent:main:root"],
      }),
    ).toEqual(["agent:main:depth-2", "agent:main:depth-1", "agent:main:root"]);
  });

  it("resolves fanoutMode=all to every known host session", () => {
    expect(
      resolveContinuationReturnTargetSessionKeys({
        defaultSessionKey: "agent:main:parent",
        fanoutMode: "all",
        allSessionKeys: ["agent:main:root", "agent:main:sibling", "agent:main:parent"],
      }),
    ).toEqual(["agent:main:root", "agent:main:sibling", "agent:main:parent"]);
  });

  it("queues byte-identical return payloads for each target session", async () => {
    const enqueued: QueuedSessionDeliveryPayload[] = [];
    const systemEvents: Array<{ text: string; sessionKey: string }> = [];
    const enqueueSessionDelivery = vi.fn(async (payload: QueuedSessionDeliveryPayload) => {
      enqueued.push(payload);
      return `delivery-${enqueued.length}`;
    });
    const ackSessionDelivery = vi.fn(async () => undefined);
    const enqueueSystemEvent = vi.fn<EnqueueSystemEvent>((text, opts) => {
      systemEvents.push({ text, sessionKey: opts.sessionKey });
      return true;
    });
    const requestHeartbeatNow = vi.fn();

    const result = await enqueueContinuationReturnDeliveries(
      {
        targetSessionKeys: ["agent:main:root", "agent:main:sibling"],
        text: "[continuation:enrichment-return] byte-identical payload",
        idempotencyKeyBase: "continuation-return:test-run",
        wakeRecipients: true,
        childRunId: "run-123",
      },
      {
        enqueueSessionDelivery,
        ackSessionDelivery,
        enqueueSystemEvent,
        requestHeartbeatNow,
      },
    );

    expect(result).toMatchObject({ enqueued: 2, delivered: 2 });
    expect(enqueued.map((payload) => payload.kind)).toEqual(["systemEvent", "systemEvent"]);
    expect(enqueued.map((payload) => (payload.kind === "systemEvent" ? payload.text : ""))).toEqual(
      [
        "[continuation:enrichment-return] byte-identical payload",
        "[continuation:enrichment-return] byte-identical payload",
      ],
    );
    expect(enqueued.map((payload) => payload.sessionKey)).toEqual([
      "agent:main:root",
      "agent:main:sibling",
    ]);
    expect(systemEvents).toEqual([
      {
        text: "[continuation:enrichment-return] byte-identical payload",
        sessionKey: "agent:main:root",
      },
      {
        text: "[continuation:enrichment-return] byte-identical payload",
        sessionKey: "agent:main:sibling",
      },
    ]);
    expect(requestHeartbeatNow).toHaveBeenCalledTimes(2);
    expect(ackSessionDelivery).toHaveBeenCalledTimes(2);
  });
});
