const TELEGRAM_CALLBACK_QUERY_ANSWER_PROMISE = Symbol.for(
  "openclaw.telegram.callbackQueryAnswerPromise",
);
const TELEGRAM_CALLBACK_QUERY_ANSWERS = Symbol.for("openclaw.telegram.callbackQueryAnswers");
type CallbackQueryAnswer = {
  promise: Promise<unknown>;
  pending: boolean;
  retention: "transient" | "retained" | "consumed";
};
type CallbackQueryAnswerOwner = object & {
  [TELEGRAM_CALLBACK_QUERY_ANSWERS]?: Map<string, CallbackQueryAnswer>;
};
// Admission and dispatch can observe the same in-flight answer in either order.
// Bot-owned state keeps isolated module graphs together; only unconsumed new-row
// answers survive settlement, while duplicate tombstones never dispatch.
function readTelegramCallbackQueryAnswers(
  bot: CallbackQueryAnswerOwner,
): Map<string, CallbackQueryAnswer> | undefined {
  return bot[TELEGRAM_CALLBACK_QUERY_ANSWERS];
}

export function startTelegramCallbackQueryAnswer(
  bot: CallbackQueryAnswerOwner & {
    api: { answerCallbackQuery: (id: string) => Promise<unknown> };
  },
  callbackQueryId: string,
  mode: "admission-retained" | "admission-transient" | "consumer",
): Promise<unknown> {
  let answers = readTelegramCallbackQueryAnswers(bot);
  if (!answers) {
    answers = new Map();
    Object.defineProperty(bot, TELEGRAM_CALLBACK_QUERY_ANSWERS, { value: answers });
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
  bot: CallbackQueryAnswerOwner,
  callbackQueryId: string,
): Promise<unknown> | undefined {
  const answers = readTelegramCallbackQueryAnswers(bot);
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
