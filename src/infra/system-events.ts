// "RFC §" references herein cite docs/design/continue-work-signal-v2.md (Agent Self-Elected Turn Continuation / CONTINUE_WORK).
// Lightweight in-memory queue for human-readable system events that should be
// prefixed to the next prompt. We intentionally avoid persistence to keep
// events ephemeral. Events are session-scoped and require an explicit key.

import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";
import type { SessionRecipientAuthority } from "../config/sessions/session-recipient-authority-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { channelRouteDedupeKey } from "../plugin-sdk/channel-route.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { resolveGlobalMap } from "../shared/global-singleton.js";
import {
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "../utils/delivery-context.shared.js";
import type { DeliveryContext } from "../utils/delivery-context.types.js";
import { normalizeDiagnosticTraceparent } from "./diagnostic-trace-context.js";
import { generateSecureUuid } from "./secure-random.js";
import {
  isDeliveryAdoptionClaimed,
  releaseSystemEventDeliveryAdoption,
  resetSystemEventDeliveryAdoptionClaimsForTest,
} from "./system-event-delivery-claims.js";
import {
  getSystemEventStorePath,
  isSystemEventStoreCurrent,
  registerSystemEventStoreOwner,
  recordSystemEventStoreReplaced,
} from "./system-event-ownership.js";

export type SystemEvent = {
  /**
   * OpenClaw-assigned opaque identity for one queued occurrence. Preserve it when returning a
   * snapshot to consume. It changes on replacement or re-enqueue; optional only for legacy
   * ID-less compatibility.
   */
  id?: string;
  text: string;
  ts: number;
  contextKey?: string | null;
  deliveryContext?: DeliveryContext;
  sessionDeliveryAckId?: string;
  sessionDeliveryAckStateDir?: string;
  /**
   * Acknowledge the durable row only once the prepared turn is durably adopted,
   * instead of during prompt preparation, for events whose producer cannot
   * reconstruct the notice after the durable row is gone.
   */
  sessionDeliveryAwaitsTurnAdoption?: boolean;
  expectedSessionId?: string;
  recipientAuthority?: SessionRecipientAuthority;
  /**
   * W3C `traceparent` captured at enqueue-time so the substrate-queue drain can
   * reconstruct the producer trace at announce/deliver time. Per RFC §6.7 the
   * substrate queue is an asynchronous boundary (enqueue turn != drain turn,
   * possibly across a gateway restart), so trace context rides on the payload
   * itself rather than on a runtime ambient. Optional and additive — invalid
   * traceparent values are silently dropped at enqueue-time so producers never
   * fail-the-write on a malformed header.
   */
  traceparent?: string;
  /** Queued by work a conversation turn started, not heartbeat or automation work. */
  fromConversationTurn?: true;
  sessionStorePath?: string | null;
};

const MAX_EVENTS = 20;
const log = createSubsystemLogger("system-events");

export class SystemEventQueueFullError extends Error {
  constructor() {
    super(
      `System event queue is full (${MAX_EVENTS} pending). Let the session process pending events before retrying the notification.`,
    );
    this.name = "SystemEventQueueFullError";
  }
}

type SessionQueue = {
  queue: SystemEvent[];
  lastContextKey: string | null;
};

const SYSTEM_EVENT_QUEUES_KEY = Symbol.for("openclaw.systemEvents.queues");

const queues = resolveGlobalMap<string, SessionQueue>(SYSTEM_EVENT_QUEUES_KEY, "close-only");
registerSystemEventStoreOwner(SYSTEM_EVENT_QUEUES_KEY, () => {
  for (const [key, entry] of queues) {
    const retained = entry.queue.filter((event) =>
      isSystemEventStoreCurrent(key, event.sessionStorePath),
    );
    if (retained.length === entry.queue.length) {
      continue;
    }
    entry.queue = retained;
    resetQueueState(key, entry);
    recordSystemEventStoreReplaced();
  }
});

type SystemEventOptions = {
  sessionKey: string;
  sessionStorePath?: string | null;
  contextKey?: string | null;
  deliveryContext?: DeliveryContext;
  sessionDeliveryAckId?: string;
  sessionDeliveryAckStateDir?: string;
  /** Defer the durable ack to turn adoption; see the SystemEvent field. */
  sessionDeliveryAwaitsTurnAdoption?: boolean;
  expectedSessionId?: string;
  recipientAuthority?: SessionRecipientAuthority;
  /**
   * Trusted-internal enrichment marker. Only core producers may attach managed
   * delivery provenance such as expectedSessionId and recipientAuthority.
   */
  trusted?: boolean;
  /**
   * Optional W3C `traceparent` to attach to the queued event for cross-boundary
   * trace correlation. Invalid values are silently dropped (additive contract:
   * a malformed traceparent never prevents an enqueue).
   */
  traceparent?: string;
  fromConversationTurn?: boolean;
  /** Replace the pending event for this context and delivery route. Requires contextKey. */
  replace?: boolean;
};

function normalizeTraceparent(traceparent?: string): string | undefined {
  return normalizeDiagnosticTraceparent(traceparent);
}

type ReceiptOptions = { allowDuplicate?: boolean };

function resolveSessionDeliveryAckStateDir(options: SystemEventOptions): string | undefined {
  if (!options.sessionDeliveryAckId) {
    return undefined;
  }
  // Explicit and ambient paths can name the same durable row across restart.
  // Normalize before dedupe so concurrent recovery cannot create two prompt slots.
  return options.sessionDeliveryAckStateDir ?? process.env.OPENCLAW_STATE_DIR;
}

function requireSessionKey(key?: string | null): string {
  const trimmed = normalizeOptionalString(key) ?? "";
  const parsed = parseAgentSessionKey(trimmed);
  if (!parsed) {
    throw new Error("system events require an agent-qualified sessionKey");
  }
  return `agent:${parsed.agentId}:${parsed.rest}`;
}

function normalizeContextKey(key?: string | null): string | null {
  return normalizeOptionalLowercaseString(key) ?? null;
}

function getSessionQueue(sessionKey: string): SessionQueue | undefined {
  return queues.get(requireSessionKey(sessionKey));
}

function getOrCreateSessionQueue(key: string): SessionQueue {
  const existing = queues.get(key);
  if (existing) {
    return existing;
  }
  const created: SessionQueue = {
    queue: [],
    lastContextKey: null,
  };
  queues.set(key, created);
  return created;
}

function cloneSystemEvent(event: SystemEvent): SystemEvent {
  return {
    ...event,
    ...(event.deliveryContext ? { deliveryContext: { ...event.deliveryContext } } : {}),
    ...(event.recipientAuthority ? { recipientAuthority: { ...event.recipientAuthority } } : {}),
  };
}

export function isSystemEventContextChanged(
  sessionKey: string,
  contextKey?: string | null,
): boolean {
  const existing = getSessionQueue(sessionKey);
  const normalized = normalizeContextKey(contextKey);
  return normalized !== (existing?.lastContextKey ?? null);
}

function findDuplicateInQueue(
  queue: readonly SystemEvent[],
  text: string,
  contextKey: string | null,
  deliveryContext: DeliveryContext | undefined,
  sessionDeliveryAckId: string | undefined,
  sessionDeliveryAckStateDir: string | undefined,
  expectedSessionId: string | undefined,
  recipientAuthority: SessionRecipientAuthority | undefined,
): boolean {
  const incoming = {
    text,
    contextKey,
    deliveryContext,
    sessionDeliveryAckId,
    sessionDeliveryAckStateDir,
    expectedSessionId,
    recipientAuthority,
  };
  if (contextKey === null) {
    const last = queue[queue.length - 1];
    return last ? isDuplicateSystemEvent(last, incoming) : false;
  }
  return queue.some((event) => isDuplicateSystemEvent(event, incoming));
}

function applyContextKeyPolicy(entry: SessionQueue, incomingContextKey: string | null): void {
  if (incomingContextKey !== null) {
    entry.lastContextKey = incomingContextKey;
  }
}

export function enqueueSystemEventEntry(
  text: string,
  options: SystemEventOptions,
): SystemEvent | null {
  const event = enqueueOwnedSystemEventEntry(text, options);
  return event ? cloneSystemEvent(event) : null;
}

function enqueueOwnedSystemEventEntry(
  text: string,
  options: SystemEventOptions,
  receiptOptions?: ReceiptOptions & { throwOnFull?: boolean },
): SystemEvent | null {
  const key = requireSessionKey(options.sessionKey);
  const sessionStorePath =
    options.sessionStorePath === undefined
      ? getSystemEventStorePath(key)
      : options.sessionStorePath;
  if (!isSystemEventStoreCurrent(key, sessionStorePath)) {
    recordSystemEventStoreReplaced();
    return null;
  }
  const entry = getOrCreateSessionQueue(key);
  if (options.replace) {
    return replaceSystemEventEntry(text, options, entry, sessionStorePath, key, receiptOptions);
  }
  const cleaned = text.trim();
  if (!cleaned) {
    return null;
  }
  const normalizedContextKey = normalizeContextKey(options.contextKey);
  const normalizedDeliveryContext = normalizeDeliveryContext(options.deliveryContext);
  const normalizedTraceparent = normalizeTraceparent(options.traceparent);
  const sessionDeliveryAckStateDir = resolveSessionDeliveryAckStateDir(options);
  const event: SystemEvent = {
    id: generateSecureUuid(),
    text: cleaned,
    ts: Date.now(),
    ...(sessionStorePath === undefined ? {} : { sessionStorePath }),
    contextKey: normalizedContextKey,
    deliveryContext: normalizedDeliveryContext,
    ...(options.sessionDeliveryAckId ? { sessionDeliveryAckId: options.sessionDeliveryAckId } : {}),
    ...(sessionDeliveryAckStateDir ? { sessionDeliveryAckStateDir } : {}),
    ...(options.trusted === true && options.sessionDeliveryAwaitsTurnAdoption
      ? { sessionDeliveryAwaitsTurnAdoption: true }
      : {}),
    ...(options.trusted === true && options.expectedSessionId
      ? { expectedSessionId: options.expectedSessionId }
      : {}),
    ...(options.trusted === true && options.recipientAuthority
      ? { recipientAuthority: { ...options.recipientAuthority } }
      : {}),
    ...(normalizedTraceparent ? { traceparent: normalizedTraceparent } : {}),
    ...(options.fromConversationTurn ? { fromConversationTurn: true as const } : {}),
  };
  if (
    event.sessionDeliveryAckId &&
    isDeliveryAdoptionClaimed(event.sessionDeliveryAckId, event.sessionDeliveryAckStateDir)
  ) {
    // A prepared turn is adopting (or already adopted) this row: re-queueing it
    // would surface the same delivery in a second prompt.
    return null;
  }
  if (event.sessionDeliveryAckId) {
    // An ack id + state dir identifies ONE persisted row, so the slot is located
    // by that identity alone: a re-enqueue of the same durable row replaces its
    // slot instead of double-queueing it.
    const durableIndex = entry.queue.findIndex(
      (queued) =>
        queued.sessionDeliveryAckId === event.sessionDeliveryAckId &&
        queued.sessionDeliveryAckStateDir === event.sessionDeliveryAckStateDir,
    );
    const existing = durableIndex >= 0 ? entry.queue[durableIndex] : undefined;
    if (durableIndex >= 0 && existing) {
      if (isDuplicateSystemEvent(existing, event)) {
        return null;
      }
      entry.queue[durableIndex] = event;
      applyContextKeyPolicy(entry, normalizedContextKey);
      return cloneSystemEvent(event);
    }
  }
  // Dedupe runs after the event is built so it can compare ack ids, expected
  // session and recipient authority, not only text, context and route.
  if (
    receiptOptions?.allowDuplicate !== true &&
    findDuplicateInQueue(
      entry.queue,
      cleaned,
      normalizedContextKey,
      normalizedDeliveryContext,
      event.sessionDeliveryAckId,
      event.sessionDeliveryAckStateDir,
      event.expectedSessionId,
      event.recipientAuthority,
    )
  ) {
    return null;
  }
  // A full queue refuses new work instead of silently dropping accepted events.
  // Durable producers keep their row pending and replay it once the queue drains.
  if (refuseWhenQueueFull(entry, key, receiptOptions)) {
    return null;
  }
  // Only an admitted event becomes the last context: a refused or de-duplicated
  // one never reached the queue, so a later change check must not compare to it.
  applyContextKeyPolicy(entry, normalizedContextKey);
  entry.queue.push(event);
  return event;
}

export function enqueueSystemEvent(text: string, options: SystemEventOptions) {
  return enqueueOwnedSystemEventEntry(text, options) !== null;
}

export const enqueueSystemEventRaw = enqueueSystemEvent;

/**
 * Whether the queue already holds the in-memory copy of one durable delivery
 * row. Producers call it after `enqueueSystemEvent` returned `false`, with the
 * same options, to tell a de-duplicated re-enqueue (the row is still riding a
 * queued event, or a prepared turn is adopting it) from a capacity refusal
 * (nothing queued; the row must be retried).
 */
export function hasQueuedSystemEventDelivery(
  options: Pick<
    SystemEventOptions,
    "sessionKey" | "sessionDeliveryAckId" | "sessionDeliveryAckStateDir"
  >,
): boolean {
  if (!options.sessionDeliveryAckId) {
    return false;
  }
  const stateDir = resolveSessionDeliveryAckStateDir(options as SystemEventOptions);
  if (isDeliveryAdoptionClaimed(options.sessionDeliveryAckId, stateDir)) {
    return true;
  }
  return (
    getSessionQueue(options.sessionKey)?.queue.some(
      (event) =>
        event.sessionDeliveryAckId === options.sessionDeliveryAckId &&
        event.sessionDeliveryAckStateDir === stateDir,
    ) ?? false
  );
}

/** Enqueues one occurrence and returns one-use removal ownership for its UUID. */
export function enqueueSystemEventWithReceipt(
  text: string,
  options: SystemEventOptions,
  receiptOptions?: ReceiptOptions,
): (() => boolean) | null {
  const event = enqueueOwnedSystemEventEntry(text, options, {
    ...receiptOptions,
    throwOnFull: true,
  });
  if (!event) {
    return null;
  }
  const sessionKey = requireSessionKey(options.sessionKey);
  return () => consumeSelectedSystemEventEntries(sessionKey, [event]).length > 0;
}

export function drainSystemEventEntries(sessionKey: string): SystemEvent[] {
  return drainSystemEventsWith(sessionKey, cloneSystemEvent);
}

function drainSystemEventsWith<T>(sessionKey: string, project: (event: SystemEvent) => T): T[] {
  const key = requireSessionKey(sessionKey);
  const entry = queues.get(key);
  if (!entry || entry.queue.length === 0) {
    return [];
  }
  const out = entry.queue.map(project);
  // Reentrant consumers may hold this array; clear it in place before removing the queue.
  entry.queue.length = 0;
  entry.lastContextKey = null;
  queues.delete(key);
  return out;
}

function areDeliveryContextsEqual(left?: DeliveryContext, right?: DeliveryContext): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return channelRouteDedupeKey(left) === channelRouteDedupeKey(right);
}

function areRecipientAuthoritiesEqual(
  left?: SessionRecipientAuthority,
  right?: SessionRecipientAuthority,
): boolean {
  return (
    left?.state === right?.state &&
    (left?.state !== "bound" || (right?.state === "bound" && left.epoch === right.epoch))
  );
}

function replaceSystemEventEntry(
  text: string,
  options: SystemEventOptions,
  entry: SessionQueue,
  sessionStorePath: string | null | undefined,
  sessionKey: string,
  receiptOptions?: { throwOnFull?: boolean },
): SystemEvent | null {
  const cleaned = text.trim();
  if (!cleaned) {
    return null;
  }
  const normalizedContextKey = normalizeContextKey(options.contextKey);
  if (normalizedContextKey === null) {
    throw new Error("replaced system events require a contextKey");
  }
  const normalizedDeliveryContext = normalizeDeliveryContext(options.deliveryContext);
  const normalizedTraceparent = normalizeTraceparent(options.traceparent);
  const sessionDeliveryAckStateDir = resolveSessionDeliveryAckStateDir(options);
  const replacement: SystemEvent = {
    id: generateSecureUuid(),
    text: cleaned,
    ts: Date.now(),
    ...(sessionStorePath === undefined ? {} : { sessionStorePath }),
    contextKey: normalizedContextKey,
    deliveryContext: normalizedDeliveryContext,
    ...(options.sessionDeliveryAckId ? { sessionDeliveryAckId: options.sessionDeliveryAckId } : {}),
    ...(sessionDeliveryAckStateDir ? { sessionDeliveryAckStateDir } : {}),
    ...(options.trusted === true && options.expectedSessionId
      ? { expectedSessionId: options.expectedSessionId }
      : {}),
    ...(options.trusted === true && options.recipientAuthority
      ? { recipientAuthority: { ...options.recipientAuthority } }
      : {}),
    ...(normalizedTraceparent ? { traceparent: normalizedTraceparent } : {}),
    ...(options.fromConversationTurn ? { fromConversationTurn: true as const } : {}),
  };
  const matches = (event: SystemEvent) =>
    (event.contextKey ?? null) === normalizedContextKey &&
    areDeliveryContextsEqual(event.deliveryContext, normalizedDeliveryContext);
  const matching = entry.queue.filter(matches);
  if (
    matching.length === 1 &&
    matching[0]?.text === replacement.text &&
    matching[0]?.sessionDeliveryAckId === replacement.sessionDeliveryAckId &&
    matching[0]?.sessionDeliveryAckStateDir === replacement.sessionDeliveryAckStateDir &&
    matching[0]?.expectedSessionId === replacement.expectedSessionId &&
    areRecipientAuthoritiesEqual(matching[0]?.recipientAuthority, replacement.recipientAuthority) &&
    matching[0]?.traceparent === replacement.traceparent
  ) {
    return null;
  }

  // A matching slot is reused at capacity; a new keyed source is refused when full.
  if (matching.length === 0 && refuseWhenQueueFull(entry, sessionKey, receiptOptions)) {
    return null;
  }
  // One keyed source owns one queue slot. Moving a replacement to the end keeps
  // event ordering current without allowing repeated updates to evict other sources.
  entry.queue = entry.queue.filter((event) => !matches(event));
  entry.queue.push(replacement);
  entry.lastContextKey = normalizedContextKey;
  return replacement;
}

function isDuplicateSystemEvent(
  existing: SystemEvent,
  incoming: Pick<
    SystemEvent,
    | "text"
    | "contextKey"
    | "deliveryContext"
    | "sessionDeliveryAckId"
    | "sessionDeliveryAckStateDir"
    | "expectedSessionId"
    | "recipientAuthority"
  >,
): boolean {
  return (
    existing.text === incoming.text &&
    (existing.contextKey ?? null) === (incoming.contextKey ?? null) &&
    existing.sessionDeliveryAckId === incoming.sessionDeliveryAckId &&
    existing.sessionDeliveryAckStateDir === incoming.sessionDeliveryAckStateDir &&
    existing.expectedSessionId === incoming.expectedSessionId &&
    areRecipientAuthoritiesEqual(existing.recipientAuthority, incoming.recipientAuthority) &&
    areDeliveryContextsEqual(existing.deliveryContext, incoming.deliveryContext)
  );
}

function matchesConsumedSystemEvent(queued: SystemEvent, consumed: SystemEvent): boolean {
  if (consumed.id !== undefined) {
    // Queue-owned IDs govern modern consumption; only legacy ID-less snapshots use structure.
    return queued.id === consumed.id;
  }
  return (
    queued.text === consumed.text &&
    queued.ts === consumed.ts &&
    (queued.contextKey ?? null) === (consumed.contextKey ?? null) &&
    queued.sessionDeliveryAckId === consumed.sessionDeliveryAckId &&
    queued.sessionDeliveryAckStateDir === consumed.sessionDeliveryAckStateDir &&
    queued.expectedSessionId === consumed.expectedSessionId &&
    areRecipientAuthoritiesEqual(queued.recipientAuthority, consumed.recipientAuthority) &&
    (queued.traceparent ?? undefined) === (consumed.traceparent ?? undefined) &&
    areDeliveryContextsEqual(queued.deliveryContext, consumed.deliveryContext)
  );
}

// Bring a queue back to MAX_EVENTS by evicting the oldest entries that have no
// durable row. Durable-backed entries (a managed return whose delivery row is
// still pending) are never evicted: dropping one from memory loses the return
// until gateway restart. The queue may exceed the cap only by such entries.
/** Upstream capacity contract: report a full queue instead of dropping an accepted event. */
function refuseWhenQueueFull(
  entry: SessionQueue,
  sessionKey: string,
  receiptOptions?: { throwOnFull?: boolean },
): boolean {
  if (entry.queue.length < MAX_EVENTS) {
    return false;
  }
  const error = new SystemEventQueueFullError();
  log.warn(error.message, { sessionKey });
  if (receiptOptions?.throwOnFull) {
    throw error;
  }
  return true;
}

function evictOverflow(entry: SessionQueue): void {
  let overflow = entry.queue.length - MAX_EVENTS;
  if (overflow <= 0) {
    return;
  }
  entry.queue = entry.queue.filter((event) => {
    if (overflow > 0 && !event.sessionDeliveryAckId) {
      overflow -= 1;
      return false;
    }
    return true;
  });
}

function resetQueueState(key: string, entry: SessionQueue) {
  if (entry.queue.length === 0) {
    entry.lastContextKey = null;
    queues.delete(key);
    return;
  }
  entry.lastContextKey =
    entry.queue.findLast((event) => event.contextKey != null)?.contextKey ?? null;
}

export function consumeSelectedSystemEventEntries(
  sessionKey: string,
  consumedEntries: readonly SystemEvent[],
  options?: { deferredEventIds?: readonly string[] },
): SystemEvent[] {
  const key = requireSessionKey(sessionKey);
  const entry = queues.get(key);
  if (!entry || entry.queue.length === 0 || consumedEntries.length === 0) {
    return [];
  }
  // Prompt admission can defer captured occurrences to a delivery owner. Selection
  // still resolves against the live queue, in captured order, never late arrivals.
  const deferredIds = new Set(options?.deferredEventIds);
  const selected: SystemEvent[] = [];
  for (const consumed of consumedEntries) {
    const index = entry.queue.findIndex((event) => matchesConsumedSystemEvent(event, consumed));
    if (index === -1) {
      continue;
    }
    const event = entry.queue[index];
    if (event) {
      if (!event.id || !deferredIds.has(event.id)) {
        entry.queue.splice(index, 1);
      }
      selected.push(cloneSystemEvent(event));
    }
  }
  resetQueueState(key, entry);
  return selected;
}

/**
 * Put consumed entries back at the head of the queue, in their original order,
 * when the consumer could not adopt them. An entry already queued again (same
 * id or durable delivery identity) is skipped; a replaced store drops it.
 */
export function restoreConsumedSystemEventEntries(
  sessionKey: string,
  events: readonly SystemEvent[],
): void {
  const key = requireSessionKey(sessionKey);
  const entry = getOrCreateSessionQueue(key);
  // The consuming turn gives these rows back: its claim ends whether or not
  // the entry is restored here (a replaced store leaves the row to replay).
  for (const event of events) {
    releaseSystemEventDeliveryAdoption(event, { settled: false });
  }
  const restored = events.filter(
    (event) =>
      isSystemEventStoreCurrent(key, event.sessionStorePath ?? getSystemEventStorePath(key)) &&
      !entry.queue.some(
        (queued) =>
          (event.id !== undefined && queued.id === event.id) ||
          (event.sessionDeliveryAckId !== undefined &&
            queued.sessionDeliveryAckId === event.sessionDeliveryAckId &&
            queued.sessionDeliveryAckStateDir === event.sessionDeliveryAckStateDir),
      ),
  );
  // Restored entries carry their durable row id, so evictOverflow never drops
  // them; it evicts the oldest durable-less entries instead.
  entry.queue.unshift(...restored.map(cloneSystemEvent));
  evictOverflow(entry);
  resetQueueState(key, entry);
}

export function drainSystemEvents(sessionKey: string): string[] {
  return drainSystemEventsWith(sessionKey, (event) => event.text);
}

/**
 * Remove system events matching a predicate without draining the entire queue.
 * Returns the removed events; non-matching events stay queued.
 */
export function removeSystemEvents(
  sessionKey: string,
  predicate: (event: SystemEvent) => boolean,
): SystemEvent[] {
  const key = requireSessionKey(sessionKey);
  const entry = queues.get(key);
  if (!entry || entry.queue.length === 0) {
    return [];
  }
  const removed: SystemEvent[] = [];
  entry.queue = entry.queue.filter((event) => {
    if (predicate(event)) {
      removed.push(event);
      return false;
    }
    return true;
  });
  if (removed.length > 0) {
    resetQueueState(key, entry);
  }
  return removed;
}

export function peekSystemEventEntries(sessionKey: string): SystemEvent[] {
  return getSessionQueue(sessionKey)?.queue.map(cloneSystemEvent) ?? [];
}

export function peekSystemEvents(sessionKey: string): string[] {
  return getSessionQueue(sessionKey)?.queue.map((event) => event.text) ?? [];
}

export function hasSystemEvents(sessionKey: string) {
  return (getSessionQueue(sessionKey)?.queue.length ?? 0) > 0;
}

export function resolveSystemEventDeliveryContext(
  events: readonly SystemEvent[],
): DeliveryContext | undefined {
  let resolved: DeliveryContext | undefined;
  for (const event of events) {
    resolved = mergeDeliveryContext(event.deliveryContext, resolved);
  }
  return resolved;
}

export function resetSystemEventsForTest() {
  queues.clear();
  resetSystemEventDeliveryAdoptionClaimsForTest();
}
