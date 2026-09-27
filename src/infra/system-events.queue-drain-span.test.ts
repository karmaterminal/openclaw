// Covers continuation.queue.drain span emission when draining formatted system events.

import { expectDefined } from "@openclaw/normalization-core";
import { beforeEach, describe, expect, it } from "vitest";
import { drainFormattedSystemEvents } from "../auto-reply/reply/session-system-events.js";
import type { OpenClawConfig } from "../config/config.js";
import { enqueueSystemEvent, resetSystemEventsForTest } from "./system-events.js";

const cfg = {} as unknown as OpenClawConfig;

async function drainFormattedEvents(
  sessionKey: string,
  params?: Partial<Parameters<typeof drainFormattedSystemEvents>[0]>,
) {
  return await drainFormattedSystemEvents({
    cfg,
    agentId: "main",
    sessionKey,
    isMainSession: false,
    isNewSession: false,
    ...params,
  });
}

describe("drainFormattedSystemEvents :: continuation.queue.drain span emission", () => {
  beforeEach(() => {
    resetSystemEventsForTest();
  });

  type RecordedSpan = {
    name: string;
    attributes?: Record<string, unknown>;
  };

  async function captureSpansDuringDrain(
    sessionKey: string,
    enqueueFn: () => void,
  ): Promise<RecordedSpan[]> {
    const tracer = await import("./continuation-tracer.js");
    const recorded: RecordedSpan[] = [];
    tracer.setContinuationTracer({
      startSpan: (name, opts) => {
        recorded.push({
          name,
          attributes: opts?.attributes as Record<string, unknown> | undefined,
        });
        return tracer.noopTracer.startSpan(name, opts);
      },
    });
    try {
      enqueueFn();
      await drainFormattedEvents(sessionKey);
    } finally {
      tracer.resetContinuationTracer();
    }
    return recorded.filter((s) => s.name === "continuation.queue.drain");
  }

  it("emits exactly one continuation.queue.drain span per drain call", async () => {
    const key = "agent:main:test-queue-drain-span-emit";
    const drainSpans = await captureSpansDuringDrain(key, () => {
      enqueueSystemEvent("Node connected", { sessionKey: key });
    });
    expect(drainSpans).toHaveLength(1);
  });

  it("populates queue.drained_count + queue.drained_continuation_count attrs", async () => {
    const key = "agent:main:test-queue-drain-attrs";
    const drainSpans = await captureSpansDuringDrain(key, () => {
      enqueueSystemEvent("[continuation:wake] Turn 1/100. Reason: x", { sessionKey: key });
      enqueueSystemEvent("Node connected", { sessionKey: key });
      enqueueSystemEvent("[continuation:delegate-spawned] Tool delegate turn 2", {
        sessionKey: key,
      });
    });
    expect(drainSpans).toHaveLength(1);
    const drainSpan = expectDefined(drainSpans.at(0), "queue drain span");
    expect(drainSpan.attributes?.["queue.drained_count"]).toBe(3);
    expect(drainSpan.attributes?.["queue.drained_continuation_count"]).toBe(2);
  });

  it("emits a 0/0 span on empty drain (absence-of-work, not rejection)", async () => {
    const key = "agent:main:test-queue-drain-empty";
    const drainSpans = await captureSpansDuringDrain(key, () => {
      // intentionally enqueue nothing
    });
    expect(drainSpans).toHaveLength(1);
    const drainSpan = expectDefined(drainSpans.at(0), "queue drain span");
    expect(drainSpan.attributes?.["queue.drained_count"]).toBe(0);
    expect(drainSpan.attributes?.["queue.drained_continuation_count"]).toBe(0);
  });
});
