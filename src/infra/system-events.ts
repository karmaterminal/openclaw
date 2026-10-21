// "RFC §" references herein cite docs/design/continue-work-signal-v2.md (Agent Self-Elected Turn Continuation / CONTINUE_WORK).
// Lightweight in-memory queue for human-readable system events that should be
// prefixed to the next prompt. We intentionally avoid persistence to keep
// events ephemeral. Events are session-scoped and require an explicit key.

import { estimateStringChars } from "@openclaw/normalization-core/cjk-chars";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "@openclaw/normalization-core/string-coerce";
import type { SessionEntryCreationOperation } from "../config/sessions/session-accessor.sqlite-entry-cache.types.js";
import type { SessionRecipientAuthority } from "../config/sessions/session-recipient-authority-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { channelRouteDedupeKey } from "../plugin-sdk/channel-route.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { resolveGlobalMap, resolveGlobalSingleton } from "../shared/global-singleton.js";
import {
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "../utils/delivery-context.shared.js";
import type { DeliveryContext } from "../utils/delivery-context.types.js";
import { normalizeDiagnosticTraceparent } from "./diagnostic-trace-context.js";
import {
  execRequestMatches,
  readExecRequestOwners,
  withExecRequestOwners,
  type ExecRequestIdentity,
} from "./exec-request-context.js";
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
import type { SystemEvent } from "./system-events.types.js";

export type { SystemEvent } from "./system-events.types.js";

const MAX_EVENTS = 20;
const AUTOMATION_NOTICE_PROMPT_CHARS = 2000;
const AUTOMATION_NOTICE_PROMPT_LIMIT_ERROR =
  `Deferred automation notices for this scheduled occurrence exceed the prompt limit of ${AUTOMATION_NOTICE_PROMPT_CHARS} weighted characters. ` +
  'Shorten the notice or use mode "now".';
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

const receiptSettlements = resolveGlobalSingleton(
  Symbol.for("openclaw.systemEvents.receiptSettlements"),
  () => new WeakMap<SystemEvent, (adopted: boolean) => void>(),
);

function settleSystemEventReceipt(event: SystemEvent, adopted: boolean): void {
  const settle = receiptSettlements.get(event);
  receiptSettlements.delete(event);
  settle?.(adopted);
}

type PreparedAutomationNotice = {
  assertCurrent: () => void;
  bindCreation?: (operation: SessionEntryCreationOperation) => () => void;
  release: () => void;
};
type AutomationNoticeOwner = {
  jobId: string;
  /** The selected scheduled slot, independent of a later manual or early occurrence. */
  notBeforeRunAtMs?: number;
  assertCurrent: () => void;
  prepare?: () => Promise<PreparedAutomationNotice>;
  coalescing?: { key: string; assertCurrent: () => void };
};

const turnOwners = resolveGlobalSingleton(
  Symbol.for("openclaw.systemEvents.turnOwners"),
  () =>
    new WeakMap<
      SystemEvent,
      { cancel: () => void; started: boolean; automation?: AutomationNoticeOwner }
    >(),
  (owners) => {
    // Soft restart retires admitted turns; unmigrated passive notices retain their queue.
    for (const [key, entry] of queues) {
      const removed = entry.queue.filter((event) => owners.has(event));
      entry.queue = entry.queue.filter((event) => !owners.has(event));
      resetQueueState(key, entry);
      retireSystemEvents(removed);
    }
  },
);

function retireSystemEvents(events: readonly SystemEvent[]): void {
  for (const event of events) {
    settleSystemEventReceipt(event, false);
    const owner = turnOwners.get(event);
    if (owner && !owner.started) {
      owner.cancel();
    }
  }
}

function clearSystemEventQueues(value: Map<string, SessionQueue>) {
  const removed = [...value.values()].flatMap((entry) => entry.queue.splice(0));
  value.clear();
  retireSystemEvents(removed);
}

const queues = resolveGlobalMap<string, SessionQueue>(
  SYSTEM_EVENT_QUEUES_KEY,
  clearSystemEventQueues,
  "close-only",
);
registerSystemEventStoreOwner(SYSTEM_EVENT_QUEUES_KEY, () => {
  for (const [key, entry] of queues) {
    const removed = entry.queue.filter(
      (event) => !isSystemEventStoreCurrent(key, event.sessionStorePath),
    );
    const retained = entry.queue.filter((event) =>
      isSystemEventStoreCurrent(key, event.sessionStorePath),
    );
    if (retained.length === entry.queue.length) {
      continue;
    }
    entry.queue = retained;
    resetQueueState(key, entry);
    retireSystemEvents(removed);
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

function resolveSessionDeliveryAckStateDir(
  options: Pick<SystemEventOptions, "sessionDeliveryAckId" | "sessionDeliveryAckStateDir">,
): string | undefined {
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
  const key = requireSessionKey(sessionKey);
  const entry = queues.get(key);
  if (entry) {
    const cancelled = entry.queue.filter((event) =>
      readExecRequestOwners(event)?.some((owner) => owner.signal.aborted),
    );
    if (cancelled.length > 0) {
      entry.queue = entry.queue.filter((event) => !cancelled.includes(event));
      resetQueueState(key, entry);
      retireSystemEvents(cancelled);
    }
  }
  return queues.get(key);
}

function getOrCreateSessionQueue(key: string): SessionQueue {
  const existing = getSessionQueue(key);
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
  // Deferred automation notices belong to one scheduled job, so ordinary text never coalesces into them.
  const duplicate = (event: SystemEvent | undefined) =>
    event !== undefined &&
    !turnOwners.get(event)?.automation &&
    isDuplicateSystemEvent(event, incoming);
  return contextKey === null ? duplicate(queue.at(-1)) : queue.some(duplicate);
}

function applyContextKeyPolicy(entry: SessionQueue, incomingContextKey: string | null): void {
  if (incomingContextKey !== null) {
    entry.lastContextKey = incomingContextKey;
  }
}

export function enqueueSystemEventEntry(
  text: string,
  options: SystemEventOptions,
  receiptOptions?: ReceiptOptions,
): SystemEvent | null {
  const event = enqueueOwnedSystemEventEntry(text, options, receiptOptions);
  return event ? cloneSystemEvent(event) : null;
}

/** Host-owned admission must report capacity refusal before claiming the occurrence. */
export function enqueueRequiredSystemEventEntry(
  text: string,
  options: SystemEventOptions,
  receiptOptions?: ReceiptOptions,
): SystemEvent | null {
  const event = enqueueOwnedSystemEventEntry(text, options, {
    ...receiptOptions,
    throwOnFull: true,
  });
  return event ? cloneSystemEvent(event) : null;
}

function enqueueOwnedSystemEventEntry(
  text: string,
  options: SystemEventOptions,
  receiptOptions?: ReceiptOptions & { throwOnFull?: boolean },
): SystemEvent | null {
  const key = requireSessionKey(options.sessionKey);
  if (readExecRequestOwners(options)?.some((owner) => owner.signal.aborted)) {
    return null;
  }
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
  const event: SystemEvent = withExecRequestOwners(
    {
      id: generateSecureUuid(),
      text: cleaned,
      ts: Date.now(),
      ...(sessionStorePath === undefined ? {} : { sessionStorePath }),
      contextKey: normalizedContextKey,
      deliveryContext: normalizedDeliveryContext,
      ...(options.sessionDeliveryAckId
        ? { sessionDeliveryAckId: options.sessionDeliveryAckId }
        : {}),
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
    },
    readExecRequestOwners(options),
  );
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
      // Install the replacement before cancellation callbacks can enqueue more work.
      retireSystemEvents([existing]);
      // The live queued object: receipt settlement and automation ownership key on it.
      return event;
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
  const stateDir = resolveSessionDeliveryAckStateDir(options);
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

/** Transfer one bounded set of exact occurrences to ordinary session admission. */
export function claimSystemEventTurn(
  sessionKey: string,
  occurrences: readonly SystemEvent[],
  cancel: () => void,
  agentId?: string,
) {
  const key = requireSessionKey(sessionKey);
  if (agentId && parseAgentSessionKey(key)?.agentId !== agentId) {
    return undefined;
  }
  const queue = getSessionQueue(key)?.queue;
  const ids = new Set(occurrences.map((occurrence) => occurrence.id));
  if (
    !queue ||
    ids.size === 0 ||
    ids.size > MAX_EVENTS ||
    ids.size !== occurrences.length ||
    ids.has(undefined)
  ) {
    return undefined;
  }
  const events: SystemEvent[] = [];
  for (const occurrence of occurrences) {
    const event = queue.find((entry) => entry.id === occurrence.id);
    if (!event || turnOwners.has(event)) {
      return undefined;
    }
    events.push(event);
  }
  let cancelled = false;
  const owner = {
    cancel: () => {
      if (!cancelled) {
        cancelled = true;
        cancel();
      }
    },
    started: false,
  };
  for (const event of events) {
    turnOwners.set(event, owner);
  }
  const currentEvents = () => {
    const current = getSessionQueue(key)?.queue;
    return owner.started
      ? []
      : events.filter((event) => turnOwners.get(event) === owner && current?.includes(event));
  };
  return {
    start() {
      if (currentEvents().length !== events.length) {
        throw new Error("Session event occurrence was cancelled before admission");
      }
      owner.started = true;
      adoptSelectedSystemEventEntries(key, events);
    },
    // A member can already be gone; settle every surviving claim without touching replacements.
    cancel: () => consumeSelectedSystemEventEntries(key, currentEvents()).length > 0,
    /** Rejected adoption returns the surviving originals to passive custody. */
    release() {
      const current = currentEvents();
      for (const event of current) {
        turnOwners.delete(event);
      }
      return current.length > 0;
    },
  };
}

export function isSystemEventTurnOwned(sessionKey: string, occurrence: SystemEvent): boolean {
  const event = getSessionQueue(sessionKey)?.queue.find((entry) => entry.id === occurrence.id);
  return event !== undefined && turnOwners.has(event);
}

/** Legacy deferred wakes attach notices to one ordinary job, never a later user message. */
export function enqueueAutomationSystemEvent(
  text: string,
  options: SystemEventOptions,
  automation: AutomationNoticeOwner,
): "queued" | "coalesced" {
  automation.assertCurrent();
  const coalescing = automation.coalescing;
  let coalesced = false;
  if (coalescing) {
    coalescing.assertCurrent();
    for (const event of getSessionQueue(requireSessionKey(options.sessionKey))?.queue ?? []) {
      const owner = turnOwners.get(event);
      const previous = owner?.automation;
      if (
        owner?.started ||
        event.text !== text.trim() ||
        previous?.jobId !== automation.jobId ||
        previous.notBeforeRunAtMs !== automation.notBeforeRunAtMs ||
        previous.coalescing?.key !== coalescing.key
      ) {
        continue;
      }
      try {
        previous.coalescing.assertCurrent();
      } catch {
        // Matching text cannot redeem a retired scheduled receiver.
        continue;
      }
      coalescing.assertCurrent();
      coalesced = true;
      break;
    }
  }
  let pendingChars = coalesced ? 0 : estimateStringChars(text.trim());
  let separatorChars = coalesced ? 0 : 1;
  for (const pending of getSessionQueue(options.sessionKey)?.queue ?? []) {
    const owner = turnOwners.get(pending)?.automation;
    if (
      owner?.jobId === automation.jobId &&
      owner.notBeforeRunAtMs === automation.notBeforeRunAtMs
    ) {
      pendingChars += separatorChars + estimateStringChars(pending.text);
      separatorChars = 1;
    }
  }
  if (pendingChars > AUTOMATION_NOTICE_PROMPT_CHARS) {
    throw new Error(AUTOMATION_NOTICE_PROMPT_LIMIT_ERROR);
  }
  if (coalesced) {
    return "coalesced";
  }
  const event = enqueueOwnedSystemEventEntry(text, options, {
    allowDuplicate: true,
    throwOnFull: true,
  });
  if (!event) {
    throw new Error("Deferred automation event was not accepted");
  }
  turnOwners.set(event, { cancel: () => {}, started: false, automation });
  return "queued";
}

export async function prepareAutomationSystemEvents(
  sessionKey: string,
  jobId: string,
  runAtMs?: number,
) {
  let selected: SystemEvent[] = [];
  let promptChars = 0;
  for (const event of getSessionQueue(sessionKey)?.queue ?? []) {
    const owner = turnOwners.get(event)?.automation;
    if (
      owner?.jobId !== jobId ||
      (owner.notBeforeRunAtMs !== undefined &&
        (runAtMs === undefined || runAtMs < owner.notBeforeRunAtMs))
    ) {
      continue;
    }
    const nextChars = promptChars + (selected.length ? 1 : 0) + estimateStringChars(event.text);
    if (nextChars > AUTOMATION_NOTICE_PROMPT_CHARS) {
      if (selected.length === 0) {
        throw new Error(AUTOMATION_NOTICE_PROMPT_LIMIT_ERROR);
      }
      break;
    }
    selected.push(event);
    promptChars = nextChars;
  }
  const leases: PreparedAutomationNotice[] = [];
  let creationChecks: Array<() => void> | undefined;
  let released = false;
  const release = () => {
    released = true;
    for (const lease of leases.splice(0)) {
      lease.release();
    }
  };
  const assertCurrent = () => {
    if (released) {
      throw new Error("Deferred automation notice preparation was released");
    }
    for (const assertLeaseCurrent of creationChecks ?? leases.map((lease) => lease.assertCurrent)) {
      assertLeaseCurrent();
    }
    for (const event of selected) {
      if (!getSessionQueue(sessionKey)?.queue.includes(event)) {
        throw new Error("Deferred automation notice was cancelled before execution");
      }
      turnOwners.get(event)!.automation!.assertCurrent();
    }
  };
  try {
    for (const event of selected) {
      let lease: PreparedAutomationNotice | undefined;
      try {
        const owner = turnOwners.get(event)?.automation;
        owner?.assertCurrent();
        lease = await owner?.prepare?.();
        lease?.assertCurrent();
        owner?.assertCurrent();
      } catch (error) {
        lease?.release();
        const { isSessionDeliveryGenerationRevokedError } =
          await import("../config/sessions/session-delivery-generation.js");
        if (!isSessionDeliveryGenerationRevokedError(error)) {
          throw error;
        }
        // Confirmed replacement retires only this occurrence; unknown currentness stays retryable.
        consumeSelectedSystemEventEntries(sessionKey, [event]);
        selected = selected.filter((candidate) => candidate !== event);
        continue;
      }
      if (lease) {
        leases.push(lease);
      }
    }
    // A later preparation may retire an earlier lease; no selected notice is used before this check.
    assertCurrent();
  } catch (error) {
    release();
    throw error;
  }
  return {
    events: selected.map(cloneSystemEvent),
    assertCurrent,
    release,
    bindCreation(operation: SessionEntryCreationOperation) {
      assertCurrent();
      if (creationChecks) {
        throw new Error("Deferred automation notices already belong to a creation operation");
      }
      creationChecks = leases.map(
        (lease) => lease.bindCreation?.(operation) ?? lease.assertCurrent,
      );
      return assertCurrent;
    },
    start() {
      assertCurrent();
      for (const event of selected) {
        turnOwners.get(event)!.started = true;
      }
      adoptSelectedSystemEventEntries(sessionKey, selected);
      release();
    },
  };
}

/** Enqueues one occurrence and returns one-use removal ownership for its UUID. */
export function enqueueSystemEventWithReceipt(
  text: string,
  options: SystemEventOptions,
  receiptOptions?: ReceiptOptions & {
    /** Reports exact-occurrence adoption separately from cancellation or removal. */
    onSettled?: (adopted: boolean) => void;
  },
): (() => boolean) | null {
  const event = enqueueOwnedSystemEventEntry(text, options, {
    ...receiptOptions,
    throwOnFull: true,
  });
  if (!event) {
    return null;
  }
  const sessionKey = requireSessionKey(options.sessionKey);
  if (receiptOptions?.onSettled) {
    receiptSettlements.set(event, receiptOptions.onSettled);
  }
  return () => consumeSelectedSystemEventEntries(sessionKey, [event]).length > 0;
}

export function drainSystemEventEntries(sessionKey: string): SystemEvent[] {
  return drainSystemEventsWith(sessionKey, cloneSystemEvent);
}

function drainSystemEventsWith<T>(sessionKey: string, project: (event: SystemEvent) => T): T[] {
  const key = requireSessionKey(sessionKey);
  const entry = getSessionQueue(key);
  if (!entry || entry.queue.length === 0) {
    return [];
  }
  const removed = entry.queue.splice(0);
  entry.lastContextKey = null;
  queues.delete(key);
  retireSystemEvents(removed);
  return removed.map(project);
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
  const replacement: SystemEvent = withExecRequestOwners(
    {
      id: generateSecureUuid(),
      text: cleaned,
      ts: Date.now(),
      ...(sessionStorePath === undefined ? {} : { sessionStorePath }),
      contextKey: normalizedContextKey,
      deliveryContext: normalizedDeliveryContext,
      ...(options.sessionDeliveryAckId
        ? { sessionDeliveryAckId: options.sessionDeliveryAckId }
        : {}),
      ...(sessionDeliveryAckStateDir ? { sessionDeliveryAckStateDir } : {}),
      ...(options.trusted === true && options.expectedSessionId
        ? { expectedSessionId: options.expectedSessionId }
        : {}),
      ...(options.trusted === true && options.recipientAuthority
        ? { recipientAuthority: { ...options.recipientAuthority } }
        : {}),
      ...(normalizedTraceparent ? { traceparent: normalizedTraceparent } : {}),
      ...(options.fromConversationTurn ? { fromConversationTurn: true as const } : {}),
    },
    readExecRequestOwners(options),
  );

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
  // Install the replacement before cancellation callbacks can enqueue more work.
  retireSystemEvents(matching);
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
  const evicted: SystemEvent[] = [];
  entry.queue = entry.queue.filter((event) => {
    if (overflow > 0 && !event.sessionDeliveryAckId) {
      overflow -= 1;
      evicted.push(event);
      return false;
    }
    return true;
  });
  retireSystemEvents(evicted);
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
  return consumeSelectedSystemEventEntriesCore(sessionKey, consumedEntries, options, false);
}

/** Core session admission acknowledges adoption; the SDK only exposes queue consumption. */
export function adoptSelectedSystemEventEntries(
  sessionKey: string,
  consumedEntries: readonly SystemEvent[],
  options?: { deferredEventIds?: readonly string[] },
): SystemEvent[] {
  return consumeSelectedSystemEventEntriesCore(sessionKey, consumedEntries, options, true);
}

function consumeSelectedSystemEventEntriesCore(
  sessionKey: string,
  consumedEntries: readonly SystemEvent[],
  options: { deferredEventIds?: readonly string[] } | undefined,
  adopted: boolean,
): SystemEvent[] {
  const key = requireSessionKey(sessionKey);
  const entry = getSessionQueue(key);
  if (!entry || entry.queue.length === 0 || consumedEntries.length === 0) {
    return [];
  }
  // Prompt admission can defer captured occurrences to a delivery owner. Selection
  // still resolves against the live queue, in captured order, never late arrivals.
  const deferredIds = new Set(options?.deferredEventIds);
  const selected: SystemEvent[] = [];
  const retired: SystemEvent[] = [];
  for (const consumed of consumedEntries) {
    const index = entry.queue.findIndex((event) => matchesConsumedSystemEvent(event, consumed));
    if (index === -1) {
      continue;
    }
    const event = entry.queue[index];
    if (event) {
      if (adopted) {
        settleSystemEventReceipt(event, true);
      }
      if (!event.id || !deferredIds.has(event.id)) {
        entry.queue.splice(index, 1);
        retired.push(event);
      }
      selected.push(cloneSystemEvent(event));
    }
  }
  resetQueueState(key, entry);
  retireSystemEvents(retired);
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
  retireSystemEvents(removed);
  return removed;
}

export function peekSystemEventEntries(sessionKey: string): SystemEvent[] {
  return getSessionQueue(sessionKey)?.queue.map(cloneSystemEvent) ?? [];
}

/** Routed completions retain request ownership after process output expires. Stop is a cold path. */
export function peekExecRequestSystemEventEntries(
  target: ExecRequestIdentity,
): Array<{ sessionKey: string; events: SystemEvent[] }> {
  const selected = [];
  for (const sessionKey of queues.keys()) {
    const events = peekSystemEventEntries(sessionKey).filter((event) =>
      readExecRequestOwners(event)?.some((owner) => execRequestMatches(owner, target)),
    );
    if (events.length > 0) {
      selected.push({ sessionKey, events });
    }
  }
  return selected;
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
  clearSystemEventQueues(queues);
  resetSystemEventDeliveryAdoptionClaimsForTest();
}

export function peekDeliverableSystemEventEntries(sessionKey: string): SystemEvent[] {
  return peekSystemEventEntries(sessionKey).filter(
    (event) => !event.deliveryHeld && !isSystemEventTurnOwned(sessionKey, event),
  );
}
export function holdSystemEventDelivery(
  sessionKey: string,
  attempted: readonly SystemEvent[],
): void {
  for (const event of getSessionQueue(sessionKey)?.queue ?? []) {
    if (attempted.some((candidate) => matchesConsumedSystemEvent(event, candidate))) {
      event.deliveryHeld = true;
    }
  }
}
