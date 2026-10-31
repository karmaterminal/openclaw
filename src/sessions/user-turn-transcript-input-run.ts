// Continuation (karmaterminal): records which run consumed an event input carrying delegate
// returns (#1504). "Consumed" means durably adopted into that run's model input: after every
// pre-dispatch check, the run handed the committed row to its provider request (the recorder's
// sentToProvider boundary). It proves neither delivery to the provider nor that the model
// attended to or acted on it.
//
// The input is staged before its run exists, and accepted input commits its staged bytes
// verbatim, so the run is stamped on the committed row at that boundary: a correlation-only
// rewrite that keeps the transcript generation. A row without the stamp reads as unknown, never
// as consumed: its run was aborted or blocked before dispatch, or the process died first. A
// replay's run stamps only its own row, so recovering a return never moves an earlier run's
// stamp. Delivering and acknowledging the returns never wait on the stamp.
import { publishTranscriptUpdate } from "../config/sessions/session-accessor.sqlite-events.js";
import { rewritePreparedTranscriptMessageAtAnchor } from "../config/sessions/session-message-rewrite.js";
import { runInDetachedAsyncContext } from "../shared/detached-async-context.js";
import { getUserTurnTranscriptAdmissionOwner } from "./user-turn-transcript-admission.js";
import { isUserMessage } from "./user-turn-transcript.message.js";
import type { UserTurnTranscriptRecorder } from "./user-turn-transcript.types.js";

const inputRunIds = new WeakMap<UserTurnTranscriptRecorder, string>();

/** The executing run binds itself before it may dispatch; a later preparation's run replaces it. */
export function bindUserTurnInputRunId(recorder: UserTurnTranscriptRecorder, runId: string): void {
  inputRunIds.set(recorder, runId);
}

/**
 * Schedules the stamp when the bound run hands the input to its provider request: after the
 * admission write and outside the request's async context. Later persistence waits settle it.
 */
export function scheduleUserTurnInputRunIdStamp(
  recorder: UserTurnTranscriptRecorder,
  admissionWrite: Promise<void> | undefined,
  onError: (error: unknown) => void,
): Promise<void> | undefined {
  const runId = inputRunIds.get(recorder);
  return runId
    ? Promise.resolve(admissionWrite)
        .then(
          () => runInDetachedAsyncContext(() => stampUserTurnInputRunId(recorder, runId)),
          () => undefined,
        )
        .catch(onError)
    : undefined;
}

async function stampUserTurnInputRunId(
  recorder: UserTurnTranscriptRecorder,
  runId: string,
): Promise<void> {
  const owner = getUserTurnTranscriptAdmissionOwner(recorder);
  const admission = owner?.receipt();
  if (!owner || !admission || !owner.message()?.["__openclaw"]?.inputDeliveries) {
    return;
  }
  // The first run to dispatch the row consumed it; a later run handed the same row keeps that.
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
