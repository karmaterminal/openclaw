import { describe, expect, it } from "vitest";
import {
  createTelegramSpooledReplayParticipant,
  runWithTelegramSpooledReplayUpdate,
} from "./bot-processing-outcome.js";

type Lifecycle = NonNullable<Parameters<typeof runWithTelegramSpooledReplayUpdate>[2]>;

function lifecycle(name: string, calls: string[]): Lifecycle {
  return {
    abortSignal: new AbortController().signal,
    onAdoptionFinalizing: () => calls.push(name),
  } as unknown as Lifecycle;
}

describe("telegram spooled replay participant settlement hold", () => {
  it("pauses each participant's own claim, not the frame that holds them", async () => {
    // Media-group and debounce participants are created under separately admitted updates,
    // then held together during adoption from whichever frame is current.
    const calls: string[] = [];
    const a = lifecycle("A", calls);
    const b = lifecycle("B", calls);
    const { value: participantA } = await runWithTelegramSpooledReplayUpdate(
      {},
      async () => createTelegramSpooledReplayParticipant("a"),
      a,
    );
    await runWithTelegramSpooledReplayUpdate(
      {},
      async () => {
        const participantB = createTelegramSpooledReplayParticipant("b");
        participantA.beginSettlementHold();
        participantB.beginSettlementHold();
      },
      b,
    );
    expect(calls).toEqual(["A", "B"]);
  });

  it("follows its own owner's abort, not the holding frame's", async () => {
    const ownerA = new AbortController();
    const a = { abortSignal: ownerA.signal } as unknown as Lifecycle;
    const b = { abortSignal: new AbortController().signal } as unknown as Lifecycle;
    const { value: participantA } = await runWithTelegramSpooledReplayUpdate(
      {},
      async () => createTelegramSpooledReplayParticipant("a"),
      a,
    );
    await runWithTelegramSpooledReplayUpdate({}, async () => undefined, b);
    ownerA.abort(new Error("owner A cancelled"));
    expect(participantA.abortSignal.aborted).toBe(true);
    await expect(participantA.task).resolves.toMatchObject({ kind: "failed-retryable" });
  });
});
