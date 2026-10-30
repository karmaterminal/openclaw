import { publishTranscriptUpdate } from "../config/sessions/session-accessor.sqlite-events.js";
import {
  capturePreparedTranscriptModelPromptProjection,
  rewritePreparedTranscriptMessageAtAnchor,
} from "../config/sessions/session-message-rewrite.js";
import { getUserTurnTranscriptAdmissionOwner } from "./user-turn-transcript-admission.js";
import {
  isUserMessage,
  prepareModelPromptProjection,
  readModelPromptProjection,
} from "./user-turn-transcript.message.js";
import {
  normalizePersistedSteerTargetRunId,
  rewritePersistedSteerTargetRunId,
} from "./user-turn-transcript.metadata.js";
import type {
  PersistedUserTurnMessage,
  PreparedModelPromptProjection,
  UserTurnTranscriptAdmissionReceipt,
  UserTurnTranscriptRecorder,
} from "./user-turn-transcript.types.js";

export async function confirmPersistedSteerTargetRunId(params: {
  admission: UserTurnTranscriptAdmissionReceipt;
  targetRunId: string;
}): Promise<
  | {
      admission: UserTurnTranscriptAdmissionReceipt;
      message: PersistedUserTurnMessage;
    }
  | undefined
> {
  const rewritten = await rewritePreparedTranscriptMessageAtAnchor(params.admission, (message) => {
    if (!isUserMessage(message)) {
      return undefined;
    }
    const currentTarget = normalizePersistedSteerTargetRunId(
      message["__openclaw"]?.steerTargetRunId,
    );
    return currentTarget === params.targetRunId
      ? undefined
      : rewritePersistedSteerTargetRunId(message, params.targetRunId);
  });
  if (!rewritten) {
    return undefined;
  }
  const admission = { ...params.admission, generation: rewritten.generation };
  await publishTranscriptUpdate(admission, {
    message: rewritten.message,
    messageId: admission.entryId,
    messageSeq: admission.activeMessagePosition + 1,
  });
  return { admission, message: rewritten.message };
}

/**
 * Continuation (karmaterminal): stamps the run that committed an event input carrying delegate
 * returns. The input is staged before that run exists and accepted input commits its staged
 * bytes verbatim, so the stamp follows the commit inside its admission write, before dispatch.
 * A crash between the two leaves the row unstamped; the returns themselves are unaffected.
 */
export async function stampPersistedInputRunId(
  recorder: UserTurnTranscriptRecorder,
  runId: string | undefined,
): Promise<void> {
  const owner = getUserTurnTranscriptAdmissionOwner(recorder);
  const admission = owner?.receipt();
  if (!runId || !owner || !admission || !owner.message()?.["__openclaw"]?.inputDeliveries) {
    return;
  }
  // The first committing run consumed the input; a later replay of the same row keeps it.
  const rewritten = await rewritePreparedTranscriptMessageAtAnchor(admission, (message) =>
    isUserMessage(message) && message["__openclaw"]?.inputRunId === undefined
      ? { ...message, __openclaw: { ...message["__openclaw"], inputRunId: runId } }
      : undefined,
  );
  if (!rewritten) {
    return;
  }
  const stamped = { ...admission, generation: rewritten.generation };
  owner.refresh(stamped, rewritten.message);
  await publishTranscriptUpdate(stamped, {
    message: rewritten.message,
    messageId: stamped.entryId,
    messageSeq: stamped.activeMessagePosition + 1,
  });
}

type ModelPromptProjectionParams = {
  admission: UserTurnTranscriptAdmissionReceipt;
  message: PersistedUserTurnMessage;
  text: string;
  assertCurrent: () => void;
  assertWritable: () => void;
  onCommitted: (
    admission: UserTurnTranscriptAdmissionReceipt,
    message: PersistedUserTurnMessage,
  ) => void;
};

export function preparePersistedModelPromptProjection(
  params: ModelPromptProjectionParams,
): PreparedModelPromptProjection | undefined {
  if (readModelPromptProjection(params.message) !== undefined) {
    prepareModelPromptProjection(params.message, params.text);
    return undefined;
  }
  params.assertWritable();
  return {
    intent: { anchor: params.admission, text: params.text },
    async onCommitted(rewritten) {
      if (!rewritten || !isUserMessage(rewritten.message)) {
        throw new Error("Model prompt projection lost its canonical user turn");
      }
      const admission = { ...params.admission, generation: rewritten.generation };
      params.onCommitted(admission, rewritten.message);
      if (!rewritten.unchanged) {
        await publishTranscriptUpdate(admission, {
          message: rewritten.message,
          messageId: admission.entryId,
          messageSeq: admission.activeMessagePosition + 1,
        });
      }
      return rewritten.message;
    },
  };
}

export async function capturePersistedModelPromptProjection(
  params: ModelPromptProjectionParams,
): Promise<PersistedUserTurnMessage> {
  const prepared = preparePersistedModelPromptProjection(params);
  if (!prepared) {
    return params.message;
  }
  const rewritten = await capturePreparedTranscriptModelPromptProjection(
    prepared.intent.anchor,
    prepared.intent.text,
    params.assertWritable,
  );
  const message = await prepared.onCommitted(rewritten);
  params.assertCurrent();
  return message;
}
