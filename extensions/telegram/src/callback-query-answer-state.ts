const TELEGRAM_CALLBACK_QUERY_ANSWER_PROMISE = Symbol.for(
  "openclaw.telegram.callbackQueryAnswerPromise",
);
type CallbackQueryAnswer = {
  promise: Promise<unknown>;
  pending: boolean;
  retention: "transient" | "retained" | "consumed";
};
// Admission and dispatch can observe the same in-flight answer in either order.
// Retain only unconsumed new-row answers; duplicate tombstones may never dispatch.
const telegramCallbackQueryAnswers = new WeakMap<object, Map<string, CallbackQueryAnswer>>();

export function startTelegramCallbackQueryAnswer(
  bot: { api: { answerCallbackQuery: (id: string) => Promise<unknown> } },
  callbackQueryId: string,
  mode: "admission-retained" | "admission-transient" | "consumer",
): Promise<unknown> {
  let answers = telegramCallbackQueryAnswers.get(bot);
  if (!answers) {
    answers = new Map();
    telegramCallbackQueryAnswers.set(bot, answers);
  }
  const existing = answers.get(callbackQueryId);
  if (existing) {
    if (mode === "consumer") {
      existing.retention = "consumed";
    } else if (mode === "admission-retained" && existing.retention === "transient") {
      existing.retention = "retained";
    }
    return existing.promise;
  }
  const answer: CallbackQueryAnswer = {
    promise: bot.api.answerCallbackQuery(callbackQueryId),
    pending: true,
    retention:
      mode === "admission-retained" ? "retained" : mode === "consumer" ? "consumed" : "transient",
  };
  answers.set(callbackQueryId, answer);
  void answer.promise.then(
    () => {
      answer.pending = false;
      if (answer.retention !== "retained") {
        answers.delete(callbackQueryId);
      }
    },
    () => answers.delete(callbackQueryId),
  );
  return answer.promise;
}

export function takeTelegramCallbackQueryAdmissionAnswer(
  bot: object,
  callbackQueryId: string,
): Promise<unknown> | undefined {
  const answers = telegramCallbackQueryAnswers.get(bot);
  const answer = answers?.get(callbackQueryId);
  if (answer) {
    answer.retention = "consumed";
    if (!answer.pending) {
      answers?.delete(callbackQueryId);
    }
  }
  return answer?.promise;
}

export function setTelegramCallbackQueryAnswerPromise(
  ctx: object,
  promise: Promise<unknown>,
): void {
  Object.defineProperty(ctx, TELEGRAM_CALLBACK_QUERY_ANSWER_PROMISE, {
    configurable: true,
    value: promise,
  });
}

export function getTelegramCallbackQueryAnswerPromise(ctx: object): Promise<unknown> | undefined {
  const promise = (ctx as Record<PropertyKey, unknown>)[TELEGRAM_CALLBACK_QUERY_ANSWER_PROMISE];
  return promise instanceof Promise ? promise : undefined;
}
