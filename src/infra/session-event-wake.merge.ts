// Coalescing for pending session event wakes; split from session-event-wake.ts for its line cap.
import type { HeartbeatWakeRequest } from "./heartbeat-wake-contracts.js";
import type { PendingWake } from "./session-event-wake.types.js";

function priority(wake: HeartbeatWakeRequest): number {
  return wake.intent === "manual" || wake.intent === "immediate"
    ? 3
    : wake.source === "retry" || wake.reason === "retry"
      ? 0
      : wake.intent === "scheduled" || wake.source === "interval" || wake.reason === "interval"
        ? 1
        : 2;
}

/** Coalesces two pending wakes for one target slot into the wake that runs. */
export function mergePendingWake(previous: PendingWake, next: PendingWake): PendingWake {
  const preferred =
    (previous.intent === "task") !== (next.intent === "task")
      ? previous.intent === "task"
        ? previous
        : next
      : priority(next) > priority(previous) ||
          (priority(next) === priority(previous) && next.requestedAt >= previous.requestedAt)
        ? next
        : previous;
  const other = preferred === previous ? next : previous;
  const tasks = new Map(
    [...(previous.tasks ?? []), ...(next.tasks ?? [])].map((task) => [task.jobId, task]),
  );
  const bypass =
    (preferred.intent === "manual" || preferred.intent === "immediate") && !preferred.retainedWork;
  return {
    ...preferred,
    // A scheduled reason must not discard the event's guard-retry semantics.
    intent: preferred.intent === "scheduled" ? other.intent : preferred.intent,
    sequence: Math.min(previous.sequence, next.sequence),
    barrierSequence:
      previous.barrierSequence === undefined
        ? next.barrierSequence
        : Math.min(previous.barrierSequence, next.barrierSequence ?? Infinity),
    requestedAt:
      !bypass && (previous.notBefore || next.notBefore)
        ? Math.min(previous.requestedAt, next.requestedAt)
        : preferred.requestedAt,
    readyAt: Math.min(previous.readyAt, next.readyAt),
    notBefore: bypass ? 0 : Math.max(previous.notBefore, next.notBefore),
    channelRetryDelayMs: previous.channelRetryDelayMs ?? next.channelRetryDelayMs,
    heartbeat: preferred.heartbeat ?? other.heartbeat,
    scheduledEveryMs: preferred.scheduledEveryMs ?? other.scheduledEveryMs,
    tasks: tasks.size
      ? [...tasks.values()].toSorted((left, right) => left.jobId.localeCompare(right.jobId))
      : undefined,
    retainedWork: !bypass && (previous.retainedWork || next.retainedWork),
    settlements: [...previous.settlements, ...next.settlements].filter((entry) => entry.active),
    workStarted: previous.workStarted || next.workStarted,
    pureNativePoll: previous.pureNativePoll && next.pureNativePoll,
  };
}
