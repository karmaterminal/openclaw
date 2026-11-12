// Memory Core plugin module owns the persisted record of reindexes stopped by worker memory limits.
// Index workers read it with the other index facts, so it stays free of main-thread runtime imports.
import type { EngineConnection } from "openclaw/plugin-sdk/database-engine-worker-runtime";
import type { MemorySource } from "openclaw/plugin-sdk/memory-core-host-engine-storage";
import {
  executeSqliteQuerySync,
  getNodeSqliteKysely,
} from "openclaw/plugin-sdk/sqlite-worker-runtime";

export const MEMORY_REINDEX_FAILURE_META_KEY = "memory_reindex_failure_v1";

// A worker heap OOM repeats on the same corpus, and each attempt costs a full rebuild.
// Retry it rarely, then stop automatic rebuilds until an explicit CLI index succeeds.
const RESOURCE_RETRY_DELAYS_MS = [60 * 60_000, 6 * 60 * 60_000];
const MEMORY_REINDEX_RESOURCE_MAX_ATTEMPTS = RESOURCE_RETRY_DELAYS_MS.length + 1;

export type MemoryReindexResourceFailure = {
  kind: "worker-out-of-memory";
  /** Indexed sources of the failed rebuild; a different source set is a different corpus. */
  sources: MemorySource[];
  attempts: number;
  failedAt: number;
  /** Absent once the attempt budget is spent. */
  retryAt?: number;
};

type MetadataDatabase = { memory_index_meta: { key: string; value: string } };

/** Accept only the shape this module writes; another release's record reads as absent. */
export function readMemoryReindexFailure(value: unknown): MemoryReindexResourceFailure | null {
  const record = value as Partial<MemoryReindexResourceFailure> | null | undefined;
  return record?.kind === "worker-out-of-memory" &&
    Array.isArray(record.sources) &&
    Number.isSafeInteger(record.attempts) &&
    Number.isFinite(record.failedAt) &&
    (record.retryAt === undefined || Number.isFinite(record.retryAt))
    ? (record as MemoryReindexResourceFailure)
    : null;
}

export function parseMemoryReindexFailure(value: unknown): MemoryReindexResourceFailure | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return readMemoryReindexFailure(JSON.parse(value));
  } catch {
    return null;
  }
}

function appliesToSources(failure: MemoryReindexResourceFailure, sources: MemorySource[]): boolean {
  return failure.sources.join(",") === sources.join(",");
}

export function nextMemoryReindexResourceFailure(
  previous: MemoryReindexResourceFailure | null,
  sources: MemorySource[],
  now: number,
): MemoryReindexResourceFailure {
  const attempts = (previous && appliesToSources(previous, sources) ? previous.attempts : 0) + 1;
  const delay = RESOURCE_RETRY_DELAYS_MS[attempts - 1];
  return {
    kind: "worker-out-of-memory",
    sources,
    attempts,
    failedAt: now,
    ...(delay === undefined ? {} : { retryAt: now + delay }),
  };
}

/** Automatic rebuilds of the failed corpus wait for the cooldown and stop after the last attempt. */
export function isMemoryReindexResourceFailureBlocking(
  failure: MemoryReindexResourceFailure | null,
  sources: MemorySource[],
  now: number,
): boolean {
  return Boolean(
    failure &&
    appliesToSources(failure, sources) &&
    (failure.retryAt === undefined || now < failure.retryAt),
  );
}

/** A null failure clears the record; successful publication clears it in its own transaction. */
export function writeMemoryReindexFailure(
  database: EngineConnection,
  failure: MemoryReindexResourceFailure | null,
): void {
  const query = getNodeSqliteKysely<MetadataDatabase>(database);
  if (!failure) {
    executeSqliteQuerySync(
      database,
      query.deleteFrom("memory_index_meta").where("key", "=", MEMORY_REINDEX_FAILURE_META_KEY),
    );
    return;
  }
  const value = JSON.stringify(failure);
  executeSqliteQuerySync(
    database,
    query
      .insertInto("memory_index_meta")
      .values({ key: MEMORY_REINDEX_FAILURE_META_KEY, value })
      .onConflict((conflict) => conflict.column("key").doUpdateSet({ value })),
  );
}

export function describeMemoryReindexResourceFailure(
  failure: MemoryReindexResourceFailure,
  agentId: string,
): { state: string; fix: string } {
  const at = (ms: number) => new Date(ms).toISOString();
  return {
    state:
      failure.retryAt === undefined
        ? `automatic rebuilds stopped after ${failure.attempts} worker out-of-memory failures (last ${at(failure.failedAt)})`
        : `worker out-of-memory failure ${failure.attempts}/${MEMORY_REINDEX_RESOURCE_MAX_ATTEMPTS}; next automatic rebuild after ${at(failure.retryAt)}`,
    fix:
      `Index fewer sources (memory.search.rememberAcrossConversations: false stops transcript indexing) ` +
      `or give the Gateway more memory, then run: openclaw memory index --force --agent ${agentId}`,
  };
}
