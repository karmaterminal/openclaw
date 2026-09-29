import type {
  DiagnosticContinuationQueueHistoryPoint,
  DiagnosticContinuationQueueMetrics,
  DiagnosticContinuationQueueOwnerSample,
} from "../../infra/diagnostic-events.js";
import type { readContinuationCustodySnapshot } from "./custody/custody-projection.js";

const CONTINUATION_QUEUE_HISTORY_LIMIT = 8;

export function describeDelegateState(stateJson: unknown): string {
  if (!stateJson || typeof stateJson !== "object" || Array.isArray(stateJson)) {
    return `stateType=${Array.isArray(stateJson) ? "array" : typeof stateJson}`;
  }
  return `stateType=object keyCount=${Object.keys(stateJson).length}`;
}

type ContinuationQueueSnapshot = ReturnType<typeof readContinuationCustodySnapshot>;

type ContinuationQueueDiagnosticDeps = {
  readSnapshot: () => ContinuationQueueSnapshot;
};

function createEmptyOwnerQueueSample(sessionKey: string): DiagnosticContinuationQueueOwnerSample {
  return {
    sessionKey,
    pendingQueued: 0,
    pendingRunnable: 0,
    pendingScheduled: 0,
    stagedPostCompaction: 0,
    invalidQueued: 0,
    totalQueued: 0,
  };
}

function noteOwnerQueuedRecord(
  owner: DiagnosticContinuationQueueOwnerSample,
  createdAt: number,
  now: number,
): void {
  owner.totalQueued += 1;
  const queuedAgeMs = Math.max(0, now - createdAt);
  owner.oldestQueuedAgeMs = Math.max(owner.oldestQueuedAgeMs ?? 0, queuedAgeMs);
  owner.newestQueuedAgeMs =
    owner.newestQueuedAgeMs === undefined
      ? queuedAgeMs
      : Math.min(owner.newestQueuedAgeMs, queuedAgeMs);
}

export function createContinuationQueueDiagnostics(deps: ContinuationQueueDiagnosticDeps): {
  sample: (now?: number) => DiagnosticContinuationQueueMetrics | undefined;
  reset: () => void;
} {
  let lastSampleAt: number | undefined;
  const history: DiagnosticContinuationQueueHistoryPoint[] = [];

  const sample = (now = Date.now()): DiagnosticContinuationQueueMetrics | undefined => {
    const snapshot = deps.readSnapshot();
    if (snapshot.state !== "known") {
      return undefined;
    }
    const isDelegateKind = (kind: string) => kind === "delegate" || kind === "post_compaction";
    const intervalMs = lastSampleAt !== undefined ? Math.max(0, now - lastSampleAt) : undefined;
    const previousSampleAt = lastSampleAt;
    const ended = snapshot.ended.filter((fact) => isDelegateKind(fact.kind));
    const live = [...snapshot.owners.entries()].flatMap(([ownerSessionKey, facts]) =>
      facts.filter((fact) => isDelegateKind(fact.kind)).map((fact) => ({ fact, ownerSessionKey })),
    );
    const inWindow = (at: number) =>
      previousSampleAt !== undefined && at > previousSampleAt && at <= now;
    const enqueuedSinceLastSample =
      live.filter(({ fact }) => inWindow(fact.createdAt)).length +
      ended.filter((fact) => inWindow(fact.createdAt)).length;
    const drainedSinceLastSample = ended.filter(
      (fact) => fact.status === "succeeded" && inWindow(fact.endedAt),
    ).length;
    const failedSinceLastSample = ended.filter(
      (fact) => fact.status === "failed" && inWindow(fact.endedAt),
    ).length;

    const owners = new Map<string, DiagnosticContinuationQueueOwnerSample>();
    let pendingQueued = 0;
    let pendingRunnable = 0;
    let pendingScheduled = 0;
    let stagedPostCompaction = 0;
    // Undecodable records are failed at claim time; the projection holds none.
    const invalidQueued = 0;

    for (const { fact, ownerSessionKey } of live) {
      if (fact.status !== "queued" || fact.cancelRequested) {
        continue;
      }
      const owner = owners.get(ownerSessionKey) ?? createEmptyOwnerQueueSample(ownerSessionKey);
      owners.set(ownerSessionKey, owner);
      noteOwnerQueuedRecord(owner, fact.createdAt, now);

      if (fact.kind === "post_compaction") {
        stagedPostCompaction += 1;
        owner.stagedPostCompaction += 1;
        continue;
      }

      pendingQueued += 1;
      owner.pendingQueued += 1;
      if ((fact.dueAt ?? fact.createdAt) <= now) {
        pendingRunnable += 1;
        owner.pendingRunnable += 1;
      } else {
        pendingScheduled += 1;
        owner.pendingScheduled += 1;
      }
    }

    const totalQueued = pendingQueued + stagedPostCompaction;
    history.push({
      sampledAt: now,
      ...(intervalMs !== undefined ? { intervalMs } : {}),
      totalQueued,
      pendingRunnable,
      pendingScheduled,
      stagedPostCompaction,
      invalidQueued,
      enqueued: enqueuedSinceLastSample,
      drained: drainedSinceLastSample,
      failed: failedSinceLastSample,
    });
    if (history.length > CONTINUATION_QUEUE_HISTORY_LIMIT) {
      history.splice(0, history.length - CONTINUATION_QUEUE_HISTORY_LIMIT);
    }
    lastSampleAt = now;

    if (
      live.length === 0 &&
      totalQueued === 0 &&
      enqueuedSinceLastSample === 0 &&
      drainedSinceLastSample === 0 &&
      failedSinceLastSample === 0
    ) {
      return undefined;
    }

    const rateFields =
      intervalMs !== undefined && intervalMs > 0
        ? {
            enqueueRatePerMinute: (enqueuedSinceLastSample * 60_000) / intervalMs,
            drainRatePerMinute: (drainedSinceLastSample * 60_000) / intervalMs,
            failedRatePerMinute: (failedSinceLastSample * 60_000) / intervalMs,
          }
        : {};

    return {
      sampledAt: now,
      ...(intervalMs !== undefined ? { intervalMs } : {}),
      totalQueued,
      pendingQueued,
      pendingRunnable,
      pendingScheduled,
      stagedPostCompaction,
      invalidQueued,
      enqueuedSinceLastSample,
      drainedSinceLastSample,
      failedSinceLastSample,
      ...rateFields,
      topQueues: [...owners.values()]
        .toSorted(
          (a, b) => b.totalQueued - a.totalQueued || a.sessionKey.localeCompare(b.sessionKey),
        )
        .slice(0, 8),
      queueDepthHistory: [...history],
    };
  };

  return {
    sample,
    reset: () => {
      lastSampleAt = undefined;
      history.length = 0;
    },
  };
}
