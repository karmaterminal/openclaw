// Adoption claims for durable session deliveries carried by system events.
// Kept apart from system-events.ts so modules that settle or recover deliveries
// do not depend on (or need test doubles for) the whole event queue.
import { resolveGlobalMap } from "../shared/global-singleton.js";

// Durable deliveries that a prepared turn consumed into its prompt and has not
// yet adopted or put back. While a row is claimed, re-enqueueing its event
// (a scheduler retry or the periodic pending sweep) is a duplicate: the turn
// owns it. An acknowledged row stays claimed for the same lease as a tombstone,
// so a replay that read the row just before the ack cannot re-queue it.
// A claim taken over by a turn's adoption lifecycle (bindDeliveryAdoptionTurnHold)
// lives as long as that turn: it is renewed whenever its lease is checked, so a
// turn of any length never has its row replayed under it, and it ends when the
// turn adopts, restores, or settles. Only a claim no turn lifecycle took over (a
// path that consumed the event, then neither adopted nor restored it) expires
// after the lease so it cannot strand the row in this process; past the lease,
// prompt preparation's transcript check still keeps an already-adopted id out of
// the next prompt. A crashed gateway drops every claim (see below).
// Claims belong to the gateway lifetime that prepared the turn: an in-process
// restart (or close) drops them, and startup recovery of a state database
// releases that database's claims before it replays the previous lifetime's rows.
const DELIVERY_ADOPTION_CLAIM_LEASE_MS = 10 * 60_000;
const DELIVERY_ADOPTION_CLAIM_PRUNE_AT = 1_024;
/**
 * The turn that owns a prepared delivery. Prompt preparation creates it unbound;
 * the turn's adoption lifecycle binds it while the turn is in flight (running or
 * handed to the followup queue) and ends it when the turn adopts, restores or
 * settles.
 */
export type DeliveryAdoptionTurnHold = {
  bind: () => void;
  end: () => void;
  readonly active: boolean;
};

export function createDeliveryAdoptionTurnHold(): DeliveryAdoptionTurnHold {
  let state: "prepared" | "bound" | "ended" = "prepared";
  return {
    bind: () => {
      if (state === "prepared") {
        state = "bound";
      }
    },
    end: () => {
      state = "ended";
    },
    get active() {
      return state === "bound";
    },
  };
}

type DeliveryAdoptionClaim = { expiresAt: number; hold?: DeliveryAdoptionTurnHold };

const deliveryAdoptionClaims = resolveGlobalMap<string, DeliveryAdoptionClaim>(
  Symbol.for("openclaw.systemEvents.deliveryAdoptionClaims"),
  "close-and-restart",
);

/** False once the claim lapsed; a claim whose turn is still in flight is renewed instead. */
function isClaimLive(claim: DeliveryAdoptionClaim, now: number): boolean {
  if (claim.expiresAt > now) {
    return true;
  }
  if (claim.hold?.active) {
    claim.expiresAt = now + DELIVERY_ADOPTION_CLAIM_LEASE_MS;
    return true;
  }
  return false;
}

function deliveryAdoptionClaimKey(ackId: string, stateDir: string | undefined): string {
  return `${stateDir ?? ""}\u0000${ackId}`;
}

function pruneDeliveryAdoptionClaims(now: number): void {
  if (deliveryAdoptionClaims.size < DELIVERY_ADOPTION_CLAIM_PRUNE_AT) {
    return;
  }
  for (const [key, claim] of deliveryAdoptionClaims) {
    if (!isClaimLive(claim, now)) {
      deliveryAdoptionClaims.delete(key);
    }
  }
}

/** Whether a prepared turn (or a just-settled ack) currently owns this row. */
export function isDeliveryAdoptionClaimed(ackId: string, stateDir: string | undefined): boolean {
  const key = deliveryAdoptionClaimKey(ackId, stateDir);
  const claim = deliveryAdoptionClaims.get(key);
  if (claim === undefined) {
    return false;
  }
  if (!isClaimLive(claim, Date.now())) {
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

/**
 * A prepared turn now owns this durable delivery until it adopts or restores it.
 * With `hold`, the claim lasts while the turn's lifecycle keeps the hold bound.
 */
export function claimSystemEventDeliveryAdoption(
  event: DeliveryAdoptionIdentity,
  hold?: DeliveryAdoptionTurnHold,
): void {
  if (!event.sessionDeliveryAckId) {
    return;
  }
  const now = Date.now();
  pruneDeliveryAdoptionClaims(now);
  deliveryAdoptionClaims.set(
    deliveryAdoptionClaimKey(event.sessionDeliveryAckId, event.sessionDeliveryAckStateDir),
    { expiresAt: now + DELIVERY_ADOPTION_CLAIM_LEASE_MS, ...(hold ? { hold } : {}) },
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
    // A tombstone belongs to no turn: it lapses with the lease.
    deliveryAdoptionClaims.set(key, { expiresAt: Date.now() + DELIVERY_ADOPTION_CLAIM_LEASE_MS });
    return;
  }
  deliveryAdoptionClaims.delete(key);
}

/** Test reset (system-events' resetSystemEventsForTest calls it). */
export function resetSystemEventDeliveryAdoptionClaimsForTest(): void {
  deliveryAdoptionClaims.clear();
}
