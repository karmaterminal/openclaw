// Turn-adoption lifecycle for a turn that carries managed (adoption-scoped)
// system-event deliveries, e.g. continuation returns.
//
// Adoption settles (acks) the deliveries. A turn that ends without adopting them
// returns the consumed events to the head of the queue, in their original order:
// otherwise the durable rows are re-read only at gateway restart. That covers
// abandonment, settlement without adoption, and an immediate run that returns
// before onAdopted without being handed to the followup queue.
import type { TurnAdoptionLifecycle } from "../get-reply-options.types.js";
import type { InternalGetReplyOptions } from "./get-reply.types.js";
import {
  settleManagedSystemEventsAfterTurnAdoption,
  type PreparedManagedSystemEventDelivery,
} from "./session-system-event-adoption.js";

export type ManagedDeliveryTurnLifecycle = {
  lifecycle: TurnAdoptionLifecycle | undefined;
  /** Call once the immediate run returns: restores unless adopted or handed off. */
  restoreIfNotHandedOff: () => void;
};

export function composeManagedDeliveryTurnLifecycle(params: {
  deliveries: ReadonlyMap<string, PreparedManagedSystemEventDelivery>;
  original: TurnAdoptionLifecycle | undefined;
  getPersistedMessage: () => unknown;
}): ManagedDeliveryTurnLifecycle {
  const { deliveries, original } = params;
  if (deliveries.size === 0) {
    return { lifecycle: original, restoreIfNotHandedOff: () => {} };
  }
  // This turn now owns the deliveries' adoption claims for as long as it is in
  // flight (running, or handed to the followup queue): a replay can never take a
  // row from under it, however long it runs. Every end of the turn ends the hold.
  for (const delivery of deliveries.values()) {
    delivery.turnHold?.bind();
  }
  const endHolds = () => {
    for (const delivery of deliveries.values()) {
      delivery.turnHold?.end();
    }
  };
  let adopted = false;
  let handedOff = false;
  let restored = false;
  const restore = () => {
    if (adopted || restored) {
      endHolds();
      return;
    }
    restored = true;
    endHolds();
    // Each restore prepends its own events; restoring the last delivery first
    // leaves the queue in the original order.
    for (const delivery of [...deliveries.values()].toReversed()) {
      delivery.restore?.();
    }
  };
  const lifecycle: TurnAdoptionLifecycle = {
    ...original,
    onAdopted: async () => {
      adopted = true;
      try {
        await settleManagedSystemEventsAfterTurnAdoption({
          deliveries: deliveries.values(),
          persistedMessage: params.getPersistedMessage(),
          onTurnAdopted: original?.onAdopted,
        });
      } finally {
        endHolds();
      }
    },
    onDeferred: () => {
      const accepted = original?.onDeferred?.();
      if (accepted !== false) {
        handedOff = true;
      }
      return accepted;
    },
    onAbandoned: () => {
      restore();
      original?.onAbandoned?.();
    },
    onSettled: () => {
      restore();
      original?.onSettled?.();
    },
  };
  return {
    lifecycle,
    restoreIfNotHandedOff: () => {
      if (!handedOff) {
        restore();
      }
    },
  };
}

/** Transcript ack ids for the managed deliveries a user turn adopts, when it carries any. */
export function resolveManagedDeliveryAckInput(
  deliveries: ReadonlyMap<string, PreparedManagedSystemEventDelivery>,
): { sessionDeliveryAckIds?: readonly string[] } {
  return deliveries.size > 0 ? { sessionDeliveryAckIds: [...deliveries.keys()] } : {};
}

/**
 * Binds an immediate reply turn to the managed deliveries its prompt carries. The
 * queued run and the runner opts carry one settle-on-adoption lifecycle, and the
 * immediate run restores the deliveries it neither adopted nor handed off.
 */
export function bindManagedDeliveryReplyTurn(params: {
  deliveries: ReadonlyMap<string, PreparedManagedSystemEventDelivery>;
  opts: InternalGetReplyOptions | undefined;
  getPersistedMessage: () => unknown;
}): {
  lifecycle: TurnAdoptionLifecycle | undefined;
  opts: InternalGetReplyOptions | undefined;
  run: <T>(execute: () => Promise<T>) => Promise<T>;
} {
  const { opts } = params;
  const turn = composeManagedDeliveryTurnLifecycle({
    deliveries: params.deliveries,
    original: opts?.turnAdoptionLifecycle,
    getPersistedMessage: params.getPersistedMessage,
  });
  return {
    lifecycle: turn.lifecycle,
    // The runner adopts an immediate turn through opts; it must carry the same
    // settle-on-adoption lifecycle the queued followupRun carries.
    opts:
      turn.lifecycle === opts?.turnAdoptionLifecycle
        ? opts
        : { ...opts, turnAdoptionLifecycle: turn.lifecycle },
    run: async <T>(execute: () => Promise<T>): Promise<T> => {
      try {
        return await execute();
      } finally {
        turn.restoreIfNotHandedOff();
      }
    },
  };
}
