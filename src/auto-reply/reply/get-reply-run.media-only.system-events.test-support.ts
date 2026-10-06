// Continuation mocks for get-reply-run.media-only.test.ts. Only vitest and
// type imports here: the parent loads this module inside vi.hoisted, before its mocks apply.
import { vi } from "vitest";
import type { PreparedFormattedSystemEvents } from "./session-system-event-adoption.js";

// Continuation modules that the prepared-reply path consults; mocked for every parent case.
vi.mock("../continuation/context-pressure.js", () => ({
  checkContextPressure: vi.fn().mockReturnValue({ fired: false, band: 0 }),
}));

// System-event preparation reads the current session through the worker-backed
// reader; route it to the parent's mocked session accessor so cases that drive
// the actual preparation keep their seeded entry and touch no real store.
vi.mock("../../config/sessions/session-entry-read-runtime.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../config/sessions/session-entry-read-runtime.js")>();
  return {
    ...actual,
    readSessionEntryReadOnlyInWorker: vi.fn(async (scope: { sessionKey: string }) => {
      const accessor = await import("../../config/sessions/session-accessor.js");
      return accessor.loadSessionEntry(scope);
    }),
  };
});

function createSessionSystemEventsMocks() {
  const drainFormattedSystemEventsMock = vi.fn(
    async (_params: unknown): Promise<string | undefined> => undefined,
  );
  const state: {
    prepared?: PreparedFormattedSystemEvents;
    preparedQueue: PreparedFormattedSystemEvents[];
  } = { preparedQueue: [] };
  return {
    state,
    drainFormattedSystemEvents: drainFormattedSystemEventsMock,
    prepareFormattedSystemEvents: vi.fn(async (params: unknown) => {
      const queued = state.preparedQueue.shift();
      if (queued) {
        return queued;
      }
      if (state.prepared) {
        return state.prepared;
      }
      const text = await drainFormattedSystemEventsMock(params);
      return {
        blocks: text ? [{ text }] : [],
        managedDeliveries: [],
      };
    }),
  };
}

export const sessionSystemEventsMocks = createSessionSystemEventsMocks();
export const recipientAuthorityCurrentMock = vi.fn(() => true);

export function resetContinuationMocks(): void {
  const mocks = sessionSystemEventsMocks;
  mocks.state.prepared = undefined;
  mocks.state.preparedQueue.length = 0;
  mocks.drainFormattedSystemEvents.mockResolvedValue(undefined);
  mocks.prepareFormattedSystemEvents.mockImplementation(async (params: unknown) => {
    const queued = mocks.state.preparedQueue.shift();
    if (queued) {
      return queued;
    }
    if (mocks.state.prepared) {
      return mocks.state.prepared;
    }
    const text = await mocks.drainFormattedSystemEvents(params);
    return {
      blocks: text ? [{ text }] : [],
      managedDeliveries: [],
    };
  });
  recipientAuthorityCurrentMock.mockReturnValue(true);
}
