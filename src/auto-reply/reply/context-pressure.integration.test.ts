import { beforeEach, describe, expect, it } from "vitest";
import type { SessionEntry } from "../../config/sessions/types.js";
import { drainSystemEventEntries, peekSystemEventEntries } from "../../infra/system-events.js";
import { checkContextPressure } from "./context-pressure.js";

const TEST_SESSION_KEY = "phase2-integration-test";

function makeEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    totalTokens: 8000,
    lastContextPressureBand: undefined,
    ...overrides,
  } as SessionEntry;
}

describe("context-pressure queue integration", () => {
  beforeEach(() => {
    drainSystemEventEntries(TEST_SESSION_KEY);
  });

  it("event is available before drain", () => {
    const entry = makeEntry({ totalTokens: 8500, totalTokensFresh: true });

    const { fired, band } = checkContextPressure({
      sessionEntry: entry,
      sessionKey: TEST_SESSION_KEY,
      contextPressureThreshold: 0.8,
      contextWindowTokens: 10_000,
    });

    expect(fired).toBe(true);
    expect(band).toBe(80);

    const peeked = peekSystemEventEntries(TEST_SESSION_KEY);
    const pressureEvent = peeked.find((event) => event.text.includes("[system:context-pressure]"));
    expect(pressureEvent?.text).toContain("85%");

    const drained = drainSystemEventEntries(TEST_SESSION_KEY);
    expect(drained.some((event) => event.text.includes("[system:context-pressure]"))).toBe(true);
    expect(peekSystemEventEntries(TEST_SESSION_KEY)).toEqual([]);
  });
});
