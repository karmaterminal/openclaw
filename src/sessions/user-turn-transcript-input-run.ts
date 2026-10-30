// Continuation (karmaterminal): names the run that consumed an event input carrying delegate
// returns (#1504). The input is staged before that run exists, and accepted input commits its
// staged bytes verbatim, so the run is stamped on the committed row afterwards: a correlation-
// only rewrite that keeps the transcript generation. A crash between commit and stamp leaves the
// row unstamped; the returns themselves are unaffected.
import { publishTranscriptUpdate } from "../config/sessions/session-accessor.sqlite-events.js";
import { rewritePreparedTranscriptMessageAtAnchor } from "../config/sessions/session-message-rewrite.js";
import { runInDetachedAsyncContext } from "../shared/detached-async-context.js";
import { getUserTurnTranscriptAdmissionOwner } from "./user-turn-transcript-admission.js";
import { isUserMessage } from "./user-turn-transcript.message.js";
import type { UserTurnTranscriptRecorder } from "./user-turn-transcript.types.js";

const inputRunIds = new WeakMap<UserTurnTranscriptRecorder, string>();

/** The executing run binds itself before it commits; a later preparation's run replaces it. */
export function bindUserTurnInputRunId(recorder: UserTurnTranscriptRecorder, runId: string): void {
  inputRunIds.set(recorder, runId);
}

/**
 * Schedules the stamp after the admission write, outside its async context: the commit that
 * awaits the admission write never waits on this second write, while dispatch does.
 */
export function scheduleUserTurnInputRunIdStamp(
  recorder: UserTurnTranscriptRecorder,
  admissionWrite: Promise<void>,
  onError: (error: unknown) => void,
): Promise<void> | undefined {
  const runId = inputRunIds.get(recorder);
  return runId
    ? admissionWrite
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
