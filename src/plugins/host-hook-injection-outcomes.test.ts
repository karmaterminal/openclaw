import { expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { pruneOutcomes, retainInjection } from "./host-hook-injection-outcomes.js";

it("prunes malformed tombstones without breaking prompt preparation", () => {
  const entry = {
    pluginNextTurnInjectionOutcomes: {
      owner: {
        corrupt: null,
        live: { state: "consumed", settledAt: 1, retainUntil: 100 },
      },
    },
  } as unknown as SessionEntry;
  pruneOutcomes(entry, "owner", 10);
  expect(entry.pluginNextTurnInjectionOutcomes?.owner).toEqual({
    live: { state: "consumed", settledAt: 1, retainUntil: 100 },
  });
});

it("retains records under a prototype-named owner as an own key", () => {
  const queues: NonNullable<SessionEntry["pluginNextTurnInjections"]> = {};
  retainInjection(queues, "__proto__", {
    id: "one",
    pluginId: "__proto__",
    text: "ready",
    createdAt: 1,
    placement: "prepend_context",
  });
  expect(Object.hasOwn(queues, "__proto__")).toBe(true);
  expect(JSON.stringify(queues)).toContain('"__proto__"');
});
