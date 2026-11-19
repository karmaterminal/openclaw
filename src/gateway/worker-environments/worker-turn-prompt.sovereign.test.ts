// A worker turn ships its rendered prompt to the worker, possibly another host. For a
// sovereign prompt agent it is refused before anything renders (#1321, design § 5.4).
import { describe, expect, it } from "vitest";
import { prepareWorkerTurnPrompt } from "./worker-turn-prompt.js";

describe("worker turn prompts for a sovereign prompt agent", () => {
  it("refuse route_unconverted before preparing or rendering", async () => {
    const turn = {
      config: { agents: { entries: { main: { sovereignPrompts: { mode: "enforce" } } } } },
    };
    // Only the refusal is reached; every other input would be read after it.
    await expect(
      prepareWorkerTurnPrompt({ turn, agentId: "main" } as unknown as Parameters<
        typeof prepareWorkerTurnPrompt
      >[0]),
    ).rejects.toMatchObject({
      name: "SovereignPromptRefusal",
      code: "route_unconverted",
      details: { route: "worker-environment" },
    });
  });
});
