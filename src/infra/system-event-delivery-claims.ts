// Adoption claims for durable session deliveries carried by system events.
// Kept apart from system-events.ts so modules that settle or recover deliveries
// do not depend on (or need test doubles for) the whole event queue.
import { resolveGlobalMap } from "../shared/global-singleton.js";

// Durable deliveries that a prepared turn consumed into its prompt and has not
// yet adopted or put back. While a row is claimed, re-enqueueing its event
// (a scheduler retry or the periodic pending sweep) is a duplicate: the turn
// owns it. An acknowledged row stays claimed for the same lease as a tombstone,
// so a replay that read the row just before the ack cannot re-queue it.
// Claims expire after the lease so a turn path that neither adopts nor restores
// cannot strand the row in this process; past the lease, prompt preparation's
// transcript check still keeps an already-adopted id out of the next prompt.
// Claims belong to the gateway lifetime that prepared the turn: an in-process
// restart (or close) drops them, and startup recovery of a state database
// releases that database's claims before it replays the previous lifetime's rows.
const DELIVERY_ADOPTION_CLAIM_LEASE_MS = 10 * 60_000;
const DELIVERY_ADOPTION_CLAIM_PRUNE_AT = 1_024;
const deliveryAdoptionClaims = resolveGlobalMap<string, number>(
  Symbol.for("openclaw.systemEvents.deliveryAdoptionClaims"),
  "close-and-restart",
);

function deliveryAdoptionClaimKey(ackId: string, stateDir: string | undefined): string {
  return `${stateDir ?? ""}\u0000${ackId}`;
}

function pruneDeliveryAdoptionClaims(now: number): void {
  if (deliveryAdoptionClaims.size < DELIVERY_ADOPTION_CLAIM_PRUNE_AT) {
    return;
  }
  for (const [key, expiresAt] of deliveryAdoptionClaims) {
    if (expiresAt <= now) {
      deliveryAdoptionClaims.delete(key);
    }
  }
}

/** Whether a prepared turn (or a just-settled ack) currently owns this row. */
export function isDeliveryAdoptionClaimed(ackId: string, stateDir: string | undefined): boolean {
  const key = deliveryAdoptionClaimKey(ackId, stateDir);
  const expiresAt = deliveryAdoptionClaims.get(key);
  if (expiresAt === undefined) {
    return false;
  }
  if (expiresAt <= Date.now()) {
    deliveryAdoptionClaims.delete(key);
    return false;
  }
  return true;
}

/** The durable row an event carries: its ack id and the state dir that owns it. */
export type DeliveryAdoptionIdentity = {
  sessionDeliveryAckId?: string;
  sessionDeliveryAckStateDir?: string;
};

/**
 * Startup recovery: turns from an earlier lifetime can no longer adopt rows of
 * this state database, so their claims (and tombstones) must not hide the rows
 * from replay. Without a state dir, every claim is released.
 */
export function releaseSystemEventDeliveryAdoptionClaims(stateDir?: string): void {
  if (stateDir === undefined) {
    deliveryAdoptionClaims.clear();
    return;
  }
  const prefix = `${stateDir}\u0000`;
  for (const key of deliveryAdoptionClaims.keys()) {
    if (key.startsWith(prefix)) {
      deliveryAdoptionClaims.delete(key);
    }
  }
}

/** A prepared turn now owns this durable delivery until it adopts or restores it. */
export function claimSystemEventDeliveryAdoption(event: DeliveryAdoptionIdentity): void {
  if (!event.sessionDeliveryAckId) {
    return;
  }
  const now = Date.now();
  pruneDeliveryAdoptionClaims(now);
  deliveryAdoptionClaims.set(
    deliveryAdoptionClaimKey(event.sessionDeliveryAckId, event.sessionDeliveryAckStateDir),
    now + DELIVERY_ADOPTION_CLAIM_LEASE_MS,
  );
}

/**
 * End a turn's claim. `settled` keeps a lease-long tombstone (the row was
 * acknowledged); otherwise the row is free to be queued again.
 */
export function releaseSystemEventDeliveryAdoption(
  event: DeliveryAdoptionIdentity,
  options: { settled: boolean },
): void {
  if (!event.sessionDeliveryAckId) {
    return;
  }
  const key = deliveryAdoptionClaimKey(
    event.sessionDeliveryAckId,
    event.sessionDeliveryAckStateDir,
  );
  if (options.settled) {
    deliveryAdoptionClaims.set(key, Date.now() + DELIVERY_ADOPTION_CLAIM_LEASE_MS);
    return;
  }
  deliveryAdoptionClaims.delete(key);
}

/** Test reset (system-events' resetSystemEventsForTest calls it). */
export function resetSystemEventDeliveryAdoptionClaimsForTest(): void {
  deliveryAdoptionClaims.clear();
}
