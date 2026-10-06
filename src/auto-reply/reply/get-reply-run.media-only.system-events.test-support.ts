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

type ActualSessionSystemEvents = typeof import("./session-system-events.js");

// Production admission prepares system events and adopts them later. When a case
// switches the drain mock to the actual drain ("through production reply admission"),
// route preparation to the actual prepare instead of wrapping the drain, which would
// acknowledge immediately and skip the deferred adoption the case claims to cover.
async function resolveActualPreparation(
  drain: () => unknown,
): Promise<ActualSessionSystemEvents | undefined> {
  const actual = await vi.importActual<ActualSessionSystemEvents>("./session-system-events.js");
  return drain() === actual.drainFormattedSystemEvents ? actual : undefined;
}

function createSessionSystemEventsMocks() {
  const drainFormattedSystemEventsMock = vi.fn(
    async (_params: unknown): Promise<string | undefined> => undefined,
  );
  const state: {
    prepared?: PreparedFormattedSystemEvents;
    preparedQueue: PreparedFormattedSystemEvents[];
    actualPrepareCalls: number;
  } = { preparedQueue: [], actualPrepareCalls: 0 };
  const prepareDefault = async (params: unknown): Promise<PreparedFormattedSystemEvents> => {
    const queued = state.preparedQueue.shift();
    if (queued) {
      return queued;
    }
    if (state.prepared) {
      return state.prepared;
    }
    const actual = await resolveActualPreparation(() =>
      drainFormattedSystemEventsMock.getMockImplementation(),
    );
    if (actual) {
      state.actualPrepareCalls += 1;
      return await actual.prepareFormattedSystemEvents(
        params as Parameters<ActualSessionSystemEvents["prepareFormattedSystemEvents"]>[0],
      );
    }
    const text = await drainFormattedSystemEventsMock(params);
    return {
      blocks: text ? [{ text }] : [],
      managedDeliveries: [],
    };
  };
  return {
    state,
    prepareDefault,
    drainFormattedSystemEvents: drainFormattedSystemEventsMock,
    prepareFormattedSystemEvents: vi.fn(prepareDefault),
  };
}

export const sessionSystemEventsMocks = createSessionSystemEventsMocks();
export const recipientAuthorityCurrentMock = vi.fn(() => true);

export function resetContinuationMocks(): void {
  const mocks = sessionSystemEventsMocks;
  mocks.state.prepared = undefined;
  mocks.state.preparedQueue.length = 0;
  mocks.state.actualPrepareCalls = 0;
  // mockReset also drops a queued once-implementation a previous case left unconsumed.
  mocks.drainFormattedSystemEvents.mockReset().mockResolvedValue(undefined);
  mocks.prepareFormattedSystemEvents.mockImplementation(mocks.prepareDefault);
  recipientAuthorityCurrentMock.mockReturnValue(true);
}
