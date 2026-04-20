/**
 * ZkClient wraps a ZkDriver with:
 *   - AsyncIterable<ConnectionState> for recipe subscriptions
 *   - lifecycle helpers (close once, idempotent)
 *   - `.driver` escape hatch for recipes that need direct wire ops
 *
 * This file is runtime-level but deliberately small. `zk.ts` (the
 * plugin-sdk barrel) dynamic-imports it so a cold `import "openclaw/plugin-sdk/zk"`
 * stays type-only.
 */

import type { ConnectionState, ZkDriver, ZkDriverOptions } from "./driver.js";

export interface ZkClient {
  readonly state: ConnectionState;
  state$(signal?: AbortSignal): AsyncIterable<ConnectionState>;
  close(): Promise<void>;
  readonly driver: ZkDriver;
}

export type ZkClientOptions = ZkDriverOptions & {
  /**
   * Injected driver — tests pass the mock driver; production passes nothing
   * (the native driver is the implicit default, resolved by `zk.ts`).
   */
  driver?: ZkDriver;
};

type StateSubscriber = (state: ConnectionState) => void;

/**
 * Build a client from an already-constructed driver. This is the seam the
 * barrel (`zk.ts`) calls after it decides which driver to hand in.
 */
export function wrapDriver(driver: ZkDriver, onExternalStateChange?: StateSubscriber): ZkClient {
  const subscribers = new Set<StateSubscriber>();
  if (onExternalStateChange) {
    subscribers.add(onExternalStateChange);
  }
  let closed = false;

  const emit = (state: ConnectionState) => {
    for (const sub of Array.from(subscribers)) {
      try {
        sub(state);
      } catch {
        // Subscriber errors must not kill the fan-out.
      }
    }
  };

  // Drivers emit state via their onStateChange callback. We don't own that
  // callback here — it was wired up when the driver was constructed by the
  // barrel. This wrapDriver fan-out is for downstream consumers that want
  // to tap the same stream.
  void emit;

  return {
    get state() {
      return driver.state;
    },
    state$(signal) {
      return subscribeState(subscribers, () => driver.state, signal);
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      await driver.close();
    },
    get driver() {
      return driver;
    },
  };
}

/**
 * Produce an AsyncIterable that yields the current state, then every
 * future transition, until the signal aborts or the client closes.
 */
export function subscribeState(
  subscribers: Set<StateSubscriber>,
  getCurrent: () => ConnectionState,
  signal?: AbortSignal,
): AsyncIterable<ConnectionState> {
  return {
    [Symbol.asyncIterator]() {
      const queue: ConnectionState[] = [getCurrent()];
      let resolveNext: ((value: IteratorResult<ConnectionState>) => void) | null = null;
      let done = false;

      const drainOrEnqueue = (state: ConnectionState) => {
        if (done) {
          return;
        }
        if (resolveNext) {
          const fn = resolveNext;
          resolveNext = null;
          fn({ value: state, done: false });
        } else {
          queue.push(state);
        }
      };

      const sub: StateSubscriber = (state) => drainOrEnqueue(state);
      subscribers.add(sub);

      const abortHandler = () => {
        done = true;
        subscribers.delete(sub);
        if (resolveNext) {
          const fn = resolveNext;
          resolveNext = null;
          fn({ value: undefined, done: true });
        }
      };
      if (signal) {
        if (signal.aborted) {
          abortHandler();
        } else {
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      }

      return {
        next(): Promise<IteratorResult<ConnectionState>> {
          if (done) {
            return Promise.resolve({ value: undefined, done: true });
          }
          if (queue.length > 0) {
            const value = queue.shift()!;
            return Promise.resolve({ value, done: false });
          }
          return new Promise<IteratorResult<ConnectionState>>((resolve) => {
            resolveNext = resolve;
          });
        },
        return(): Promise<IteratorResult<ConnectionState>> {
          done = true;
          subscribers.delete(sub);
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

/**
 * Hook used by ZkClient builders to tee state-change events out of a
 * driver's lifetime into the subscriber fan-out. Wires cleanly with
 * both the native and mock drivers.
 */
export function buildStateDispatcher(): {
  subscribers: Set<StateSubscriber>;
  onStateChange: (state: ConnectionState) => void;
} {
  const subscribers = new Set<StateSubscriber>();
  const onStateChange: StateSubscriber = (state) => {
    for (const sub of Array.from(subscribers)) {
      try {
        sub(state);
      } catch {
        // Silence subscriber-side exceptions.
      }
    }
  };
  return { subscribers, onStateChange };
}
