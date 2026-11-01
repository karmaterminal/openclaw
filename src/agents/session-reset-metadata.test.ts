import { expect, it } from "vitest";
import { clearRotatedSessionMetadata } from "./session-reset-metadata.js";

it("discards pending injections while preserving their settled outcomes on rollover", () => {
  const original = {
    sessionId: "old",
    updatedAt: 1,
    pluginNextTurnInjections: {
      fixture: [
        {
          id: "one",
          pluginId: "fixture",
          idempotencyKey: "one",
          text: "payload",
          placement: "prepend_context" as const,
          createdAt: 1,
        },
      ],
    },
  };
  const rotated = clearRotatedSessionMetadata(original);
  expect(rotated.pluginNextTurnInjections).toBeUndefined();
  expect(rotated.pluginNextTurnInjectionOutcomes?.fixture?.one?.state).toBe("discarded");
  expect(original.pluginNextTurnInjections.fixture).toHaveLength(1);
});
