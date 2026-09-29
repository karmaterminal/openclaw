// The `[continuation:delegate-spawn-interrupted]` notice (RFC
// docs/design/continue-work-signal-v2.md §5.4.4, Q3). A claimed delegate whose
// admission cannot be proven is never spawned again; its owning session gets
// exactly one durable notice instead. The idempotency key is derived from the
// custody record or queue entry that owed the notice, so every writer (the
// Doctor import, recovery, the post-compaction drain) collapses onto one
// session-delivery row for the same source.
import type { QueuedSessionDeliveryPayload } from "../../../infra/session-delivery-queue-storage.js";
import { formatDelegateTaskForSystemEvent } from "../delegate-system-event.js";

export const CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG =
  "[continuation:delegate-spawn-interrupted]";

/** What owed the notice: a custody record, or a session-queue entry with no record. */
export type ContinuationSpawnInterruptedSource =
  | { kind: "record"; recordId: string; childRunIds: readonly string[] }
  | { kind: "queue-entry"; entryId: string };

function sourceIdempotencyKey(source: ContinuationSpawnInterruptedSource): string {
  return source.kind === "record"
    ? `continuation-spawn-interrupted:record:${source.recordId}`
    : `continuation-spawn-interrupted:queue-entry:${source.entryId}`;
}

function describeSource(source: ContinuationSpawnInterruptedSource): string {
  if (source.kind === "queue-entry") {
    return `Queued post-compaction delegate ${source.entryId} was enqueued before this build and records no spawn attempt.`;
  }
  const attempts =
    source.childRunIds.length > 0
      ? `Recorded child run IDs: ${source.childRunIds.join(", ")}.`
      : "It was claimed by an earlier build, which recorded no child run ID.";
  return `Delegate record ${source.recordId} was claimed for a spawn before a restart. ${attempts}`;
}

/** Session-queue payload for the notice; the caller enqueues it in its own commit. */
export function buildContinuationSpawnInterruptedNotice(params: {
  sessionKey: string;
  source: ContinuationSpawnInterruptedSource;
  task: string;
}): QueuedSessionDeliveryPayload {
  return {
    kind: "systemEvent",
    sessionKey: params.sessionKey,
    text: [
      CONTINUATION_SPAWN_INTERRUPTED_NOTICE_TAG,
      describeSource(params.source),
      "Its admission could not be proven, so it was not started again.",
      `Task: ${formatDelegateTaskForSystemEvent(params.task)}`,
      "Issue a new continue_delegate if the work is still needed.",
    ].join("\n"),
    idempotencyKey: sourceIdempotencyKey(params.source),
    // The row must outlive the in-memory event until the prompt adopts it.
    awaitPromptAdoption: true,
  };
}
