import { expect, it, vi } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import { dispatchResetInjectionSettlements } from "./host-hook-reset-settlements.js";
import { dispatchSettlements } from "./host-hook-settlement-dispatch.js";

vi.mock("./host-hook-settlement-dispatch.js", () => ({ dispatchSettlements: vi.fn() }));

it("dispatches only newly committed reset tombstones through the successor fence", () => {
  const previousEntry = {
    sessionId: "old",
    lifecycleRevision: "old-revision",
    pluginNextTurnInjections: {
      owner: [
        {
          id: "a",
          pluginId: "owner",
          text: "one",
          createdAt: 1,
          placement: "prepend_context",
          idempotencyKey: "a",
        },
        {
          id: "b",
          pluginId: "owner",
          text: "two",
          createdAt: 1,
          placement: "prepend_context",
          idempotencyKey: "b",
        },
        null,
      ],
    },
    pluginNextTurnInjectionOutcomes: {
      owner: { b: { state: "consumed", settledAt: 1, retainUntil: 99 } },
    },
  } as unknown as SessionEntry;
  const nextEntry = {
    sessionId: "new",
    lifecycleRevision: "new-revision",
    pluginNextTurnInjectionOutcomes: {
      owner: {
        a: { state: "discarded", settledAt: 2, retainUntil: 99 },
        b: { state: "consumed", settledAt: 1, retainUntil: 99 },
      },
    },
  } as SessionEntry;
  const cfg = {};
  dispatchResetInjectionSettlements({
    cfg,
    sessionKey: "agent:main:main",
    agentId: "main",
    previousEntry,
    nextEntry,
  });
  expect(dispatchSettlements).toHaveBeenCalledWith(
    [
      {
        pluginId: "owner",
        sessionId: "new",
        lifecycleRevision: "new-revision",
        event: { sessionKey: "", idempotencyKey: "a", state: "discarded", settledAt: 2 },
      },
    ],
    { cfg, sessionKey: "agent:main:main", agentId: "main" },
  );
});
