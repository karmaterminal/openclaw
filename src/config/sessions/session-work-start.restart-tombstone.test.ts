import { describe, expect, it } from "vitest";
import { resolveSessionWorkStartBlock } from "./session-work-start.js";

const entry = {
  sessionId: "retired",
  updatedAt: 1,
  mainRestartRecovery: {
    cycleId: "cycle-1",
    tombstone: { reason: "automatic replay refused" },
  },
};

describe("restart recovery tombstone work admission", () => {
  it("refuses ordinary work but permits an explicit replacement", () => {
    expect(resolveSessionWorkStartBlock("agent:main:retired", entry)?.reason).toBe(
      "restart_tombstone",
    );
    expect(
      resolveSessionWorkStartBlock("agent:main:retired", entry, {
        allowRestartTombstoneReplacement: true,
      }),
    ).toBeUndefined();
  });

  it("does not bypass provider review and gives locked-model guidance", () => {
    expect(
      resolveSessionWorkStartBlock(
        "agent:main:retired",
        {
          ...entry,
          providerReview: {} as NonNullable<
            import("./types.js").InternalSessionEntry["providerReview"]
          >,
        },
        { allowRestartTombstoneReplacement: true },
      )?.reason,
    ).toBe("provider_review");
    expect(
      resolveSessionWorkStartBlock("agent:main:retired", { ...entry, modelSelectionLocked: true })
        ?.message,
    ).toContain("Resume in new session");
  });
});
