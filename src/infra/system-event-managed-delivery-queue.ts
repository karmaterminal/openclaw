// Continuation (karmaterminal): queue lookups and removals for managed deliveries (see
// system-event-managed-delivery.ts), built on the system-event queue's public operations.
import { isDeliveryAdoptionClaimed } from "./system-event-delivery-claims.js";
import {
  resolveSessionDeliveryAckStateDir,
  type ManagedSystemEventOptions,
} from "./system-event-managed-delivery.js";
import {
  consumeSelectedSystemEventEntries,
  peekSystemEventEntries,
  type SystemEvent,
} from "./system-events.js";

/**
 * Whether the queue already holds the in-memory copy of one durable delivery
 * row. Producers call it after `enqueueSystemEvent` returned `false`, with the
 * same options, to tell a de-duplicated re-enqueue (the row is still riding a
 * queued event, or a prepared turn is adopting it) from a capacity refusal
 * (nothing queued; the row must be retried).
 */
export function hasQueuedSystemEventDelivery(
  options: { sessionKey: string } & Pick<
    ManagedSystemEventOptions,
    "sessionDeliveryAckId" | "sessionDeliveryAckStateDir"
  >,
): boolean {
  if (!options.sessionDeliveryAckId) {
    return false;
  }
  const stateDir = resolveSessionDeliveryAckStateDir(options);
  if (isDeliveryAdoptionClaimed(options.sessionDeliveryAckId, stateDir)) {
    return true;
  }
  return peekSystemEventEntries(options.sessionKey).some(
    (event) =>
      event.sessionDeliveryAckId === options.sessionDeliveryAckId &&
      event.sessionDeliveryAckStateDir === stateDir,
  );
}

/**
 * Remove system events matching a predicate without draining the entire queue.
 * Returns the removed events; non-matching events stay queued.
 */
export function removeSystemEvents(
  sessionKey: string,
  predicate: (event: SystemEvent) => boolean,
): SystemEvent[] {
  const selected = peekSystemEventEntries(sessionKey).filter((event) => predicate(event));
  return selected.length === 0 ? [] : consumeSelectedSystemEventEntries(sessionKey, selected);
}
