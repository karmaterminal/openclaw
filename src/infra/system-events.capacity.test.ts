import { afterEach, expect, it } from "vitest";
import {
  consumeSelectedSystemEventEntries,
  enqueueSystemEvent,
  enqueueSystemEventEntry,
  enqueueSystemEventWithReceipt,
  isSystemEventContextChanged,
  peekSystemEventEntries,
  resetSystemEventsForTest,
} from "./system-events.js";

afterEach(resetSystemEventsForTest);

it("refuses overflow without invalidating pending occurrences or removal receipts", () => {
  const sessionKey = "agent:main:capacity";
  const remove = enqueueSystemEventWithReceipt("Exec completed", {
    sessionKey,
    contextKey: "exec:first",
  });
  for (let index = 1; index < 20; index++) {
    expect(
      enqueueSystemEvent(`Reminder ${index}`, {
        sessionKey,
        contextKey: `cron:${index}`,
      }),
    ).toBe(true);
  }
  const pending = peekSystemEventEntries(sessionKey);
  const overflow = { sessionKey, contextKey: "cron:overflow" };
  expect(enqueueSystemEvent("Unadmitted notice", overflow)).toBe(false);
  expect(enqueueSystemEventEntry("Unadmitted notification", overflow)).toBeNull();
  expect(() => enqueueSystemEventWithReceipt("Unadmitted reminder", overflow)).toThrow(
    "queue is full",
  );
  expect(peekSystemEventEntries(sessionKey)).toEqual(pending);
  expect(isSystemEventContextChanged(sessionKey, "cron:19")).toBe(false);
  expect(enqueueSystemEvent("Reminder 19", { sessionKey, contextKey: "cron:19" })).toBe(false);
  expect(
    enqueueSystemEvent("Revised reminder", {
      sessionKey,
      contextKey: "cron:19",
      replace: true,
    }),
  ).toBe(true);
  expect(remove?.()).toBe(true);
  expect(remove?.()).toBe(false);
  expect(enqueueSystemEvent("Admitted after consumption", overflow)).toBe(true);
  expect(consumeSelectedSystemEventEntries(sessionKey, pending).map(({ text }) => text)).toEqual(
    Array.from({ length: 18 }, (_, index) => `Reminder ${index + 1}`),
  );
  expect(peekSystemEventEntries(sessionKey).map(({ text }) => text)).toEqual([
    "Revised reminder",
    "Admitted after consumption",
  ]);
});

it("does not record a refused keyed event as the session's last context", () => {
  const sessionKey = "agent:main:capacity-context";
  for (let index = 0; index < 20; index++) {
    expect(
      enqueueSystemEvent(`Reminder ${index}`, { sessionKey, contextKey: `cron:${index}` }),
    ).toBe(true);
  }
  expect(isSystemEventContextChanged(sessionKey, "cron:19")).toBe(false);

  // Refused at capacity: the queue never held this context, so it must not
  // become the last context a later change check compares against.
  expect(enqueueSystemEvent("Refused", { sessionKey, contextKey: "cron:refused" })).toBe(false);
  expect(isSystemEventContextChanged(sessionKey, "cron:refused")).toBe(true);
  expect(isSystemEventContextChanged(sessionKey, "cron:19")).toBe(false);

  // A refused durable re-enqueue with a new context behaves the same.
  expect(
    enqueueSystemEvent("Refused durable", {
      sessionKey,
      contextKey: "task:refused-durable",
      sessionDeliveryAckId: "refused-durable",
    }),
  ).toBe(false);
  expect(isSystemEventContextChanged(sessionKey, "cron:19")).toBe(false);
});
