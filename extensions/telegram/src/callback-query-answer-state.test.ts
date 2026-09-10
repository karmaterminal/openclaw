import { createDeferred } from "openclaw/plugin-sdk/extension-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const answerStateModule = () => import("./callback-query-answer-state.js");

describe("Telegram callback query answer state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("retains a settled admission answer across module graph replacement", async () => {
    const answerCallbackQuery = vi.fn(async () => true);
    const bot = { api: { answerCallbackQuery } };
    const firstState = await answerStateModule();
    const answer = firstState.startTelegramCallbackQueryAnswer(
      bot,
      "callback-retained",
      "admission-retained",
    );
    await answer;

    vi.resetModules();
    const replacementState = await answerStateModule();

    expect(
      replacementState.takeTelegramCallbackQueryAdmissionAnswer(bot, "callback-retained"),
    ).toBe(answer);
    expect(answerCallbackQuery).toHaveBeenCalledOnce();
    expect(
      firstState.takeTelegramCallbackQueryAdmissionAnswer(bot, "callback-retained"),
    ).toBeUndefined();
  });

  it("upgrades a pending transient answer across module graph replacement", async () => {
    const pendingAnswer = createDeferred<true>();
    const answerCallbackQuery = vi.fn(() => pendingAnswer.promise);
    const bot = { api: { answerCallbackQuery } };
    const firstState = await answerStateModule();
    const answer = firstState.startTelegramCallbackQueryAnswer(
      bot,
      "callback-upgraded",
      "admission-transient",
    );

    vi.resetModules();
    const replacementState = await answerStateModule();
    expect(
      replacementState.startTelegramCallbackQueryAnswer(
        bot,
        "callback-upgraded",
        "admission-retained",
      ),
    ).toBe(answer);
    pendingAnswer.resolve(true);
    await answer;

    expect(firstState.takeTelegramCallbackQueryAdmissionAnswer(bot, "callback-upgraded")).toBe(
      answer,
    );
    expect(answerCallbackQuery).toHaveBeenCalledOnce();
    expect(
      replacementState.takeTelegramCallbackQueryAdmissionAnswer(bot, "callback-upgraded"),
    ).toBeUndefined();
  });
});
