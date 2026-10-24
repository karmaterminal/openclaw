// Continuation (karmaterminal): a vi.mock factory body for ./system-events.js. The fork's
// enqueueSystemEventRaw is the same function as enqueueSystemEvent, and the continuation
// modules a real run path loads import it by that name. One mock function serves both names,
// so a suite's "not called" assertions on enqueueSystemEvent cover every enqueue.
import { vi } from "vitest";

export function mockSystemEventEnqueue() {
  const enqueueSystemEvent = vi.fn();
  return { enqueueSystemEvent, enqueueSystemEventRaw: enqueueSystemEvent };
}
