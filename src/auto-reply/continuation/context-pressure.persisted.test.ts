// The persisted context-pressure owner (emitPersistedContextPressure) against a real session
// store: the band and the trusted event belong to the transcript whose usage was measured.
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { SESSION_TOTAL_TOKENS_VERSION } from "../../config/sessions.js";
import { loadSessionEntry, replaceSessionEntry } from "../../config/sessions/session-accessor.js";
import { resolveSystemEventQueueKey } from "../../infra/system-event-ownership.js";
import { peekSystemEventEntries, resetSystemEventsForTest } from "../../infra/system-events.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { emitPersistedContextPressure } from "./context-pressure.js";

const sessionKey = "agent:main:context-pressure-persisted";
const queueKey = resolveSystemEventQueueKey(sessionKey, "main");

afterEach(() => {
  resetSystemEventsForTest();
});

it("commits the band and the event only for the transcript whose usage was measured", () =>
  withOpenClawTestState({ scenario: "minimal" }, async (state) => {
    const storePath = path.join(state.sessionsDir(), "sessions.json");
    const scope = { storePath, sessionKey };
    await replaceSessionEntry(scope, { sessionId: "successor", updatedAt: 1 });
    const emit = (measuredSessionId: string) =>
      emitPersistedContextPressure({
        agentId: "main",
        sessionKey,
        storePath,
        continuationEnabled: true,
        expectedSessionId: measuredSessionId,
        sessionEntry: {
          sessionId: measuredSessionId,
          updatedAt: 1,
          totalTokens: 90_000,
          totalTokensFresh: true,
          totalTokensVersion: SESSION_TOTAL_TOKENS_VERSION,
        },
        contextPressureThreshold: 0.8,
        contextWindowTokens: 100_000,
      });
    const band = () =>
      loadSessionEntry({ ...scope, readConsistency: "latest" })?.lastContextPressureBand;

    // Usage measured on a transcript a reset replaced says nothing about the successor.
    await expect(emit("retired")).resolves.toEqual({ fired: false, band: 0 });
    expect(peekSystemEventEntries(queueKey)).toEqual([]);
    expect(band()).toBeUndefined();

    await expect(emit("successor")).resolves.toMatchObject({ fired: true, band: 90 });
    // The trusted event names its transcript, so a later reset drops it before the prompt.
    expect(peekSystemEventEntries(queueKey)).toEqual([
      expect.objectContaining({ expectedSessionId: "successor" }),
    ]);
    expect(band()).toBe(90);
  }));
