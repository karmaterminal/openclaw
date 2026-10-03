// Custody readiness belongs to one database lifetime, not to a path (RFC
// §5.4.5): a database closed and replaced at the same path may hold different
// rows. Each path keeps an epoch and phase A's in-flight promise. Ending a
// lifetime advances the epoch and drops the projection and any in-flight
// readiness together, so the next custody command runs phase A against the
// current database, and a phase A that began in the ended lifetime cannot
// publish.
import { resolveGlobalSingleton } from "../../../shared/global-singleton.js";
import { resetContinuationCustodyProjection } from "./custody-projection.js";

type DatabaseLifetime = {
  epoch: number;
  /** Unregisters the close watcher for this lifetime, once one is installed. */
  unwatch?: () => void;
  /** Phase A in flight for this lifetime; only the pending read is shared. */
  readiness?: Promise<void>;
};

const lifetimes = resolveGlobalSingleton(
  Symbol.for("openclaw.continuationCustodyLifetimes"),
  () => new Map<string, DatabaseLifetime>(),
);

/** The current lifetime record for a custody database path. */
export function continuationCustodyLifetime(databasePath: string): DatabaseLifetime {
  let lifetime = lifetimes.get(databasePath);
  if (!lifetime) {
    lifetime = { epoch: 0 };
    lifetimes.set(databasePath, lifetime);
  }
  return lifetime;
}

/**
 * End the custody lifetime of a database: the state database closed (or, in
 * the epoch-backstop test, ended without a close).
 */
export function invalidateContinuationCustodyLifetime(databasePath: string): void {
  const lifetime = lifetimes.get(databasePath);
  if (lifetime) {
    lifetime.epoch += 1;
    lifetime.unwatch?.();
    lifetime.unwatch = undefined;
    lifetime.readiness = undefined;
  }
  resetContinuationCustodyProjection(databasePath);
}

/** Thrown when work started in a custody database lifetime that has since ended. */
export class ContinuationCustodyLifetimeEndedError extends Error {
  constructor() {
    super("continuation custody database closed during readiness; retry");
    this.name = "ContinuationCustodyLifetimeEndedError";
  }
}

/** Refuse to continue work begun in `epoch` once that lifetime has ended. */
export function assertContinuationCustodyLifetime(databasePath: string, epoch: number): void {
  if (continuationCustodyLifetime(databasePath).epoch !== epoch) {
    throw new ContinuationCustodyLifetimeEndedError();
  }
}
