// Process-local retry scheduler for the durable session delivery queue.
import { createDeferredCore } from "../shared/deferred.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import { computeBackoffMs } from "./delivery-recovery.shared.js";
import type { GatewayScheduler, GatewaySchedulerScope } from "./gateway-scheduler.js";
import {
  drainPendingSessionDelivery,
  type DeliverSessionDeliveryFn,
  type SessionDeliveryRecoveryLogger,
  type SettleSessionDeliveryFn,
} from "./session-delivery-queue-recovery.js";
import {
  loadPendingSessionDeliveries,
  loadPendingSessionDelivery,
} from "./session-delivery-queue-storage.js";
import {
  SessionDeliveryDeferredError,
  type QueuedSessionDelivery,
  type SessionDeliveryCapacityDeferral,
} from "./session-delivery-queue.records.js";

type SessionDeliveryRuntime = {
  scheduler: GatewayScheduler;
  queueContext: OpenClawStateWorkerContext;
  deliver: DeliverSessionDeliveryFn;
  drain?: typeof drainPendingSessionDelivery;
  log: SessionDeliveryRecoveryLogger;
  reloadPending?: typeof loadPendingSessionDelivery;
  listPending?: typeof loadPendingSessionDeliveries;
  onSettled?: SettleSessionDeliveryFn;
};

const RUNTIME_RELOAD_RETRY_MS = 1_000;
// A row the target's full system-event queue refused is retried without an
// attempt cap (a capped deferral would turn back into loss). Each row backs off
// from 1s to this ceiling, so many saturated rows cost at most one attempt per
// row per ceiling. The backoff resets when the queue admits a row.
const CAPACITY_RETRY_CEILING_MS = 30_000;
// Saturation must be visible: report a row still deferred after this long,
// then again at most once per interval while it stays deferred.
const CAPACITY_SATURATION_WARN_AFTER_MS = 60_000;
const CAPACITY_SATURATION_WARN_EVERY_MS = 5 * 60_000;

type CapacityDeferralState = SessionDeliveryCapacityDeferral & {
  firstDeferredAt: number;
  deferrals: number;
  lastWarnedAt?: number;
};

let runtime:
  | (Omit<SessionDeliveryRuntime, "scheduler"> & {
      scheduler: GatewaySchedulerScope;
      runningEntries: Set<string>;
      pendingSchedules: Set<Promise<void>>;
      /** Process-local: a restart starts every row at the base cadence again. */
      capacityDeferrals: Map<string, CapacityDeferralState>;
    })
  | undefined;
let runtimeGeneration = 0;

function armPendingScan(generation: number): void {
  if (!runtime || generation !== runtimeGeneration) {
    return;
  }
  runtime.scheduler.schedule({
    id: "session-delivery:scan",
    delayMs: RUNTIME_RELOAD_RETRY_MS,
    mode: "earliest",
    run: () => schedulePendingSessionDeliveries(),
  });
}

function resolveRetryDelayMs(entry: QueuedSessionDelivery, now: number): number {
  const claimDelayMs = Math.max(0, (entry.availableAt ?? 0) - now);
  if (entry.kind === "agentTurn" && entry.owner?.kind === "subagent_completion") {
    return Math.min(claimDelayMs, Math.max(0, entry.owner.deadlineAt - now));
  }
  if (entry.retryCount <= 0) {
    return claimDelayMs;
  }
  const attemptedAt = entry.lastAttemptAt ?? entry.enqueuedAt;
  return Math.max(claimDelayMs, attemptedAt + computeBackoffMs(entry.retryCount) - now);
}

function armSessionDeliveryId(id: string, delayMs: number, generation: number): void {
  if (!runtime || generation !== runtimeGeneration) {
    return;
  }
  runtime.scheduler.schedule({
    id: `session-delivery:${id}`,
    delayMs,
    mode: "earliest",
    run: () => runScheduledSessionDelivery(id, generation),
  });
}

function armSessionDelivery(
  entry: QueuedSessionDelivery,
  generation: number,
  minimumDelayMs = 0,
): void {
  // The active drain owns rearming after its authoritative reload. Coalesce
  // duplicate schedules so they cannot poll the same due row in a timer loop.
  if (!runtime || runtime.runningEntries.has(entry.id)) {
    return;
  }
  armSessionDeliveryId(
    entry.id,
    Math.max(minimumDelayMs, resolveRetryDelayMs(entry, runtime.scheduler.now())),
    generation,
  );
}

function describeCapacityDeferral(id: string, state: CapacityDeferralState): string {
  return `${state.continuationReturn ? "continuation return" : "session event"} ${id} for session ${state.sessionKey}`;
}

/** Record one capacity refusal; returns the backoff before the next attempt. */
function noteCapacityDeferral(
  activeRuntime: NonNullable<typeof runtime>,
  id: string,
  deferral: SessionDeliveryCapacityDeferral,
  now: number,
): number {
  const state = activeRuntime.capacityDeferrals.get(id) ?? {
    ...deferral,
    firstDeferredAt: now,
    deferrals: 0,
  };
  state.deferrals += 1;
  activeRuntime.capacityDeferrals.set(id, state);
  if (state.deferrals === 1) {
    activeRuntime.log.info(
      `session delivery: ${describeCapacityDeferral(id, state)} deferred: system event queue full; retrying with backoff`,
    );
  }
  const deferredMs = now - state.firstDeferredAt;
  if (
    deferredMs >= CAPACITY_SATURATION_WARN_AFTER_MS &&
    (state.lastWarnedAt === undefined ||
      now - state.lastWarnedAt >= CAPACITY_SATURATION_WARN_EVERY_MS)
  ) {
    state.lastWarnedAt = now;
    activeRuntime.log.warn(
      `session delivery: ${describeCapacityDeferral(id, state)} still deferred after ${Math.round(deferredMs / 1_000)}s (${state.deferrals} attempts): system event queue full; the session is not draining its pending events`,
    );
  }
  return Math.min(
    CAPACITY_RETRY_CEILING_MS,
    RUNTIME_RELOAD_RETRY_MS * 2 ** Math.min(state.deferrals - 1, 16),
  );
}

/** The row left the capacity wait (admitted, settled, or deferred for another reason). */
function clearCapacityDeferral(
  activeRuntime: NonNullable<typeof runtime>,
  id: string,
  now: number,
  generation: number,
): void {
  const state = activeRuntime.capacityDeferrals.get(id);
  if (!state) {
    return;
  }
  activeRuntime.capacityDeferrals.delete(id);
  if (state.lastWarnedAt !== undefined) {
    activeRuntime.log.info(
      `session delivery: ${describeCapacityDeferral(id, state)} admitted after ${Math.round((now - state.firstDeferredAt) / 1_000)}s of capacity deferral`,
    );
  }
  // The queue admitted one row for this session; let its other waiting rows
  // try again at the base cadence instead of sitting out their backoff.
  for (const [otherId, other] of activeRuntime.capacityDeferrals) {
    if (other.sessionKey === state.sessionKey) {
      other.deferrals = 0;
      armSessionDeliveryId(otherId, RUNTIME_RELOAD_RETRY_MS, generation);
    }
  }
}

async function runScheduledSessionDelivery(id: string, generation: number): Promise<void> {
  const activeRuntime = runtime;
  if (!activeRuntime || generation !== runtimeGeneration) {
    return;
  }
  if (activeRuntime.runningEntries.has(id)) {
    return;
  }
  activeRuntime.runningEntries.add(id);
  let pending: QueuedSessionDelivery | null = null;
  let capacityDeferral: SessionDeliveryCapacityDeferral | undefined;
  // Backoff state moves only on evidence: an attempt that ran, or a row gone.
  let attempted = false;
  let drained = false;
  try {
    pending = await (activeRuntime.drain ?? drainPendingSessionDelivery)({
      id,
      queueContext: activeRuntime.queueContext,
      now: () => activeRuntime.scheduler.now(),
      logLabel: "session delivery",
      log: activeRuntime.log,
      deliver: async (entry, context) => {
        capacityDeferral = undefined;
        attempted = true;
        try {
          await activeRuntime.deliver(entry, context);
        } catch (error) {
          if (error instanceof SessionDeliveryDeferredError && error.capacity) {
            capacityDeferral = error.capacity;
          }
          throw error;
        }
      },
      onSettled: activeRuntime.onSettled,
    });
    drained = true;
  } catch (error) {
    activeRuntime.log.error(`session delivery: runtime drain failed for ${id}: ${String(error)}`);
    if (runtime && generation === runtimeGeneration) {
      // The durable row may still be pending. Retry the exact drain so one
      // transient database error cannot orphan it until the next restart.
      armSessionDeliveryId(id, RUNTIME_RELOAD_RETRY_MS, generation);
    }
  } finally {
    activeRuntime.runningEntries.delete(id);
  }
  if (!runtime || generation !== runtimeGeneration) {
    return;
  }
  const now = activeRuntime.scheduler.now();
  if (pending && capacityDeferral) {
    armSessionDelivery(
      pending,
      generation,
      noteCapacityDeferral(activeRuntime, id, capacityDeferral, now),
    );
    return;
  }
  if (drained && (attempted || !pending)) {
    clearCapacityDeferral(activeRuntime, id, now, generation);
  }
  if (pending) {
    // Any still-pending row means the drain deferred, failed, or was owned
    // elsewhere. Never poll an unchanged immediately-due row at timer speed.
    armSessionDelivery(pending, generation, RUNTIME_RELOAD_RETRY_MS);
  }
}

/** Register callbacks; stop fences scheduling and joins admitted reads and drains. */
export function startSessionDeliveryRuntime(params: SessionDeliveryRuntime): () => Promise<void> {
  runtimeGeneration += 1;
  const generation = runtimeGeneration;
  runtime?.scheduler.beginClose();
  const activeRuntime = {
    ...params,
    scheduler: params.scheduler.scope(),
    runningEntries: new Set<string>(),
    pendingSchedules: new Set<Promise<void>>(),
    capacityDeferrals: new Map<string, CapacityDeferralState>(),
  };
  runtime = activeRuntime;
  let stopPromise: Promise<void> | undefined;
  return () => {
    if (runtimeGeneration === generation) {
      runtimeGeneration += 1;
      runtime = undefined;
    }
    // Public scheduling reads begin outside scheduler callbacks and must also
    // settle before this owner's queue database or environment is disposed.
    stopPromise ??= Promise.all([
      activeRuntime.scheduler.stop(),
      ...activeRuntime.pendingSchedules,
    ]).then(() => {});
    return stopPromise;
  };
}

/** Schedule one durable entry when a gateway runtime is available. */
export async function scheduleSessionDelivery(
  id: string,
  queueContext: OpenClawStateWorkerContext,
): Promise<boolean> {
  const generation = runtimeGeneration;
  const activeRuntime = runtime;
  if (!activeRuntime) {
    return false;
  }
  try {
    queueContext.admission.assertCurrent();
    activeRuntime.queueContext.admission.assertCurrent();
    if (queueContext.admission.identity.key !== activeRuntime.queueContext.admission.identity.key) {
      activeRuntime.log.error(`session delivery: ${id} belongs to another state database`);
      return false;
    }
  } catch (error) {
    activeRuntime.log.error(
      `session delivery: cannot schedule ${id} for a retired state owner: ${String(error)}`,
    );
    return false;
  }
  const settled = createDeferredCore();
  activeRuntime.pendingSchedules.add(settled.promise);
  try {
    let entry: QueuedSessionDelivery | null;
    try {
      entry = await (activeRuntime.reloadPending ?? loadPendingSessionDelivery)(
        id,
        activeRuntime.queueContext,
      );
    } catch (error) {
      activeRuntime.log.error(`session delivery: failed to load ${id}: ${String(error)}`);
      armSessionDeliveryId(id, RUNTIME_RELOAD_RETRY_MS, generation);
      return true;
    }
    if (!entry || !runtime || generation !== runtimeGeneration) {
      return !entry;
    }
    armSessionDelivery(entry, generation);
    return true;
  } finally {
    activeRuntime.pendingSchedules.delete(settled.promise);
    settled.resolve();
  }
}

/** Schedule every pending entry after startup recovery installs the runtime owner. */
export async function schedulePendingSessionDeliveries(): Promise<void> {
  const generation = runtimeGeneration;
  const activeRuntime = runtime;
  if (!activeRuntime) {
    return;
  }
  const settled = createDeferredCore();
  activeRuntime.pendingSchedules.add(settled.promise);
  try {
    let entries: QueuedSessionDelivery[];
    try {
      entries = await (activeRuntime.listPending ?? loadPendingSessionDeliveries)(
        activeRuntime.queueContext,
      );
    } catch (error) {
      activeRuntime.log.error(`session delivery: failed to scan pending entries: ${String(error)}`);
      armPendingScan(generation);
      return;
    }
    if (!runtime || generation !== runtimeGeneration) {
      return;
    }
    for (const entry of entries) {
      armSessionDelivery(entry, generation);
    }
  } finally {
    activeRuntime.pendingSchedules.delete(settled.promise);
    settled.resolve();
  }
}
