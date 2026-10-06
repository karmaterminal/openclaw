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
  /** Jitter source for capacity backoff and the pending sweep, in [0, 1). Injected by tests. */
  random?: () => number;
  /**
   * The periodic pending sweep (default on). Only a test that asserts the exact
   * timer its own row armed turns it off, because the sweep's timer is then the
   * scheduler's earliest wake.
   */
  pendingSweep?: boolean;
};

const RUNTIME_RELOAD_RETRY_MS = 1_000;
// A row the target's full system-event queue refused is retried without an
// attempt cap (a capped deferral would turn back into loss); it keeps custody
// until a prompt adopts it. The first retry comes after 1s; later retries back
// off exponentially toward this ceiling with "equal jitter" (each delay drawn
// from [d/2, d], never below 1s), so many saturated rows neither retry in
// lockstep nor cost more than one attempt per row per half-ceiling. The backoff
// resets when the queue admits a row.
const CAPACITY_RETRY_CEILING_MS = 30_000;
// Saturation must be visible: report a row still deferred after this long,
// then again at most once per interval while it stays deferred.
const CAPACITY_SATURATION_WARN_AFTER_MS = 60_000;
const CAPACITY_SATURATION_WARN_EVERY_MS = 5 * 60_000;
// Recovery inside a healthy process: a pending row that no runtime armed (it
// was written while no runtime owned this state database, by another process,
// or its arm was lost) is picked up by a low-frequency sweep that reuses the
// startup scan but arms only rows that are neither armed nor running. The
// period is jittered so processes sharing a database do not sweep in lockstep,
// and one sweep arms a bounded number of rows; the rest wait for the next one.
// Sweeps run every 45-75s (the producer's unarmed-row warning names this bound).
// A sweep resumes after the last row the previous sweep armed and wraps, so rows
// that stay pending after their attempt (delivered into memory, awaiting prompt
// adoption) cannot hold the head of the list and starve a later row: every
// unarmed row is armed within ceil(pending / PENDING_SWEEP_MAX_ARMED) sweeps.
const PENDING_SWEEP_INTERVAL_MS = 60_000;
const PENDING_SWEEP_JITTER = 0.25;
const PENDING_SWEEP_MAX_ARMED = 256;

type CapacityDeferralState = SessionDeliveryCapacityDeferral & {
  /** Durable enqueue time, for the row's age in the saturation warning. */
  enqueuedAt: number;
  firstDeferredAt: number;
  deferrals: number;
  lastWarnedAt?: number;
};

let runtime:
  | (Omit<SessionDeliveryRuntime, "scheduler"> & {
      scheduler: GatewaySchedulerScope;
      runningEntries: Set<string>;
      /** Rows with a scheduled attempt that has not started yet. */
      armedEntries: Set<string>;
      pendingSchedules: Set<Promise<void>>;
      /** Process-local: a restart starts every row at the base cadence again. */
      capacityDeferrals: Map<string, CapacityDeferralState>;
      /** Queue-order key of the last row a budget-limited sweep armed; the next sweep resumes after it. */
      sweepCursor?: PendingSweepCursor;
    })
  | undefined;
let runtimeGeneration = 0;

/** Pending rows are listed in (enqueuedAt, id) order. */
type PendingSweepCursor = { enqueuedAt: number; id: string };

function isAfterSweepCursor(entry: QueuedSessionDelivery, cursor: PendingSweepCursor): boolean {
  return (
    entry.enqueuedAt > cursor.enqueuedAt ||
    (entry.enqueuedAt === cursor.enqueuedAt && entry.id > cursor.id)
  );
}

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
  const activeRuntime = runtime;
  if (!activeRuntime || generation !== runtimeGeneration) {
    return;
  }
  activeRuntime.armedEntries.add(id);
  activeRuntime.scheduler.schedule({
    id: `session-delivery:${id}`,
    delayMs,
    mode: "earliest",
    run: () => {
      activeRuntime.armedEntries.delete(id);
      return runScheduledSessionDelivery(id, generation);
    },
  });
}

function armPendingSweep(generation: number): void {
  const activeRuntime = runtime;
  if (!activeRuntime || generation !== runtimeGeneration) {
    return;
  }
  const unit = Math.min(Math.max((activeRuntime.random ?? Math.random)(), 0), 1);
  activeRuntime.scheduler.schedule({
    id: "session-delivery:sweep",
    delayMs:
      PENDING_SWEEP_INTERVAL_MS * (1 - PENDING_SWEEP_JITTER + 2 * PENDING_SWEEP_JITTER * unit),
    run: async () => {
      try {
        await schedulePendingSessionDeliveries({ onlyUnarmed: true });
      } finally {
        armPendingSweep(generation);
      }
    },
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
  entry: QueuedSessionDelivery,
  deferral: SessionDeliveryCapacityDeferral,
  now: number,
): number {
  const id = entry.id;
  const state = activeRuntime.capacityDeferrals.get(id) ?? {
    ...deferral,
    enqueuedAt: entry.enqueuedAt,
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
      `session delivery: ${describeCapacityDeferral(id, state)} still deferred after ${Math.round(deferredMs / 1_000)}s (row age ${Math.round(Math.max(0, now - state.enqueuedAt) / 1_000)}s, ${state.deferrals} attempts): system event queue full; the session is not draining its pending events. The row stays pending until a prompt adopts it.`,
    );
  }
  return resolveCapacityRetryDelayMs(state.deferrals, activeRuntime.random ?? Math.random);
}

/** Delay before the attempt after the `deferrals`-th consecutive capacity refusal. */
function resolveCapacityRetryDelayMs(deferrals: number, random: () => number): number {
  if (deferrals <= 1) {
    return RUNTIME_RELOAD_RETRY_MS;
  }
  const ceilingMs = Math.min(
    CAPACITY_RETRY_CEILING_MS,
    RUNTIME_RELOAD_RETRY_MS * 2 ** Math.min(deferrals - 1, 16),
  );
  const unit = Math.min(Math.max(random(), 0), 1);
  return Math.max(RUNTIME_RELOAD_RETRY_MS, ceilingMs * (0.5 + 0.5 * unit));
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
  let awaitingAdoptionInMemory = false;
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
        awaitingAdoptionInMemory = false;
        attempted = true;
        try {
          await activeRuntime.deliver(entry, context);
        } catch (error) {
          if (error instanceof SessionDeliveryDeferredError && error.capacity) {
            capacityDeferral = error.capacity;
          }
          if (error instanceof SessionDeliveryDeferredError && error.awaitingAdoptionInMemory) {
            awaitingAdoptionInMemory = true;
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
      noteCapacityDeferral(activeRuntime, pending, capacityDeferral, now),
    );
    return;
  }
  if (drained && (attempted || !pending)) {
    clearCapacityDeferral(activeRuntime, id, now, generation);
  }
  if (pending && awaitingAdoptionInMemory) {
    // Delivered into memory; only prompt adoption is outstanding. Polling it
    // would only re-read the row, so the periodic pending sweep re-checks it
    // instead (and re-queues it if the in-memory copy was lost).
    return;
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
    armedEntries: new Set<string>(),
    pendingSchedules: new Set<Promise<void>>(),
    capacityDeferrals: new Map<string, CapacityDeferralState>(),
  };
  runtime = activeRuntime;
  if (params.pendingSweep !== false) {
    armPendingSweep(generation);
  }
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

/**
 * Schedule every pending entry after startup recovery installs the runtime
 * owner. The periodic sweep passes `onlyUnarmed`: a row that is already armed
 * (its backoff deadline stands) or running (its drain owns the re-arm) is left
 * alone, and at most a bounded number of rows is armed per sweep.
 */
export async function schedulePendingSessionDeliveries(options?: {
  onlyUnarmed?: boolean;
}): Promise<void> {
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
    if (!options?.onlyUnarmed) {
      for (const entry of entries) {
        armSessionDelivery(entry, generation);
      }
      return;
    }
    // Resume after the previous budget-limited sweep's last armed row, then wrap.
    const cursor = activeRuntime.sweepCursor;
    const ordered = cursor
      ? [
          ...entries.filter((entry) => isAfterSweepCursor(entry, cursor)),
          ...entries.filter((entry) => !isAfterSweepCursor(entry, cursor)),
        ]
      : entries;
    activeRuntime.sweepCursor = undefined;
    // Only rows actually armed count against the budget.
    let armed = 0;
    for (const entry of ordered) {
      if (activeRuntime.armedEntries.has(entry.id) || activeRuntime.runningEntries.has(entry.id)) {
        continue;
      }
      if (armed >= PENDING_SWEEP_MAX_ARMED) {
        break;
      }
      armSessionDelivery(entry, generation);
      armed += 1;
      if (armed >= PENDING_SWEEP_MAX_ARMED) {
        activeRuntime.sweepCursor = { enqueuedAt: entry.enqueuedAt, id: entry.id };
      }
    }
    if (armed > 0) {
      activeRuntime.log.info(
        `session delivery: periodic sweep armed ${armed} pending ${armed === 1 ? "entry" : "entries"} that no runtime had scheduled`,
      );
    }
  } finally {
    activeRuntime.pendingSchedules.delete(settled.promise);
    settled.resolve();
  }
}
