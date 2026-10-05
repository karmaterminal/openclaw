// Turn-adoption lifecycle for a turn that carries managed (adoption-scoped)
// system-event deliveries, e.g. continuation returns.
//
// Adoption settles (acks) the deliveries. A turn that ends without adopting them
// returns the consumed events to the head of the queue, in their original order:
// otherwise the durable rows are re-read only at gateway restart. That covers
// abandonment, settlement without adoption, and an immediate run that returns
// before onAdopted without being handed to the followup queue.
import type { TurnAdoptionLifecycle } from "../get-reply-options.types.js";
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
  let adopted = false;
  let handedOff = false;
  let restored = false;
  const restore = () => {
    if (adopted || restored) {
      return;
    }
    restored = true;
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
      await settleManagedSystemEventsAfterTurnAdoption({
        deliveries: deliveries.values(),
        persistedMessage: params.getPersistedMessage(),
        onTurnAdopted: original?.onAdopted,
      });
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
