// Event-driven lane-idle waits for same-session continuation wakes.
import {
  notifyAllCommandLaneIdleWaitersForState,
  notifyCommandLaneIdleWaitersForState,
  waitForCommandLaneIdleState,
} from "./command-queue-waiters.js";
import { getQueueState, normalizeLane } from "./command-queue.state.js";
import { CommandLane } from "./lanes.js";

function isCommandLaneIdle(lane: string): boolean {
  const state = getQueueState().lanes.get(lane);
  // Same depth as command-queue's getLaneDepth: queued plus active tasks.
  return !state || state.queue.length + state.activeTaskIds.size === 0;
}

export function notifyCommandLaneIdleWaiters(lane: string): void {
  notifyCommandLaneIdleWaitersForState(lane, isCommandLaneIdle);
}

export function notifyAllCommandLaneIdleWaiters(): void {
  notifyAllCommandLaneIdleWaitersForState(isCommandLaneIdle);
}

/**
 * Wait for one command lane to become completely idle: no active task and no
 * queued task. Same-session continuation wakes use this event-driven boundary
 * so they cannot cut ahead of already admitted work.
 */
export function waitForCommandLaneIdle(
  lane: string = CommandLane.Main,
  timeoutMs?: number,
  opts?: { signal?: AbortSignal },
): Promise<{ idle: boolean }> {
  return waitForCommandLaneIdleState({
    lane: normalizeLane(lane),
    isLaneIdle: isCommandLaneIdle,
    timeoutMs,
    signal: opts?.signal,
  });
}
