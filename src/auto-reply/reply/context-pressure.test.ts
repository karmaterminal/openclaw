import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import { peekSystemEvents, resetSystemEventsForTest } from "../../infra/system-events.js";
import { checkContextPressure } from "./context-pressure.js";

function makeSessionEntry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    totalTokens: 0,
    totalTokensFresh: true,
    lastContextPressureBand: undefined,
    ...overrides,
  } as SessionEntry;
}

const SESSION_KEY = "test:context-pressure";
const CONTEXT_WINDOW = 100_000;

beforeEach(() => {
  resetSystemEventsForTest();
});

afterEach(() => {
  resetSystemEventsForTest();
});

describe("checkContextPressure", () => {
  it("does not fire when contextPressureThreshold is undefined", () => {
    const entry = makeSessionEntry({ totalTokens: 90_000, totalTokensFresh: true });
    const result = checkContextPressure({
      sessionEntry: entry,
      sessionKey: SESSION_KEY,
      contextPressureThreshold: undefined as unknown as number,
      contextWindowTokens: CONTEXT_WINDOW,
    });
    expect(result.fired).toBe(false);
    expect(result.band).toBe(0);
    expect(peekSystemEvents(SESSION_KEY)).toHaveLength(0);
  });

  it("fires at 80% when threshold is 0.8", () => {
    const entry = makeSessionEntry({ totalTokens: 80_000, totalTokensFresh: true });
    const result = checkContextPressure({
      sessionEntry: entry,
      sessionKey: SESSION_KEY,
      contextPressureThreshold: 0.8,
      contextWindowTokens: CONTEXT_WINDOW,
    });
    expect(result.fired).toBe(true);
    expect(result.band).toBe(80);
    expect(entry.lastContextPressureBand).toBe(80);
  });

  it("deduplicates within the same band", () => {
    const entry = makeSessionEntry({
      totalTokens: 88_000,
      totalTokensFresh: true,
      lastContextPressureBand: 80,
    });
    const result = checkContextPressure({
      sessionEntry: entry,
      sessionKey: SESSION_KEY,
      contextPressureThreshold: 0.8,
      contextWindowTokens: CONTEXT_WINDOW,
    });
    expect(result).toEqual({ fired: false, band: 80 });
  });

  it("fires again when a higher band is crossed", () => {
    const entry = makeSessionEntry({
      totalTokens: 96_000,
      totalTokensFresh: true,
      lastContextPressureBand: 90,
    });
    const result = checkContextPressure({
      sessionEntry: entry,
      sessionKey: SESSION_KEY,
      contextPressureThreshold: 0.8,
      contextWindowTokens: CONTEXT_WINDOW,
    });
    expect(result).toEqual({ fired: true, band: 95 });
  });

  it("does not fire when totalTokensFresh is false", () => {
    const entry = makeSessionEntry({
      totalTokens: 90_000,
      totalTokensFresh: false,
    });
    const result = checkContextPressure({
      sessionEntry: entry,
      sessionKey: SESSION_KEY,
      contextPressureThreshold: 0.8,
      contextWindowTokens: CONTEXT_WINDOW,
    });
    expect(result).toEqual({ fired: false, band: 0 });
  });
});
