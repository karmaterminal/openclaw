// Memory Core tests cover the #1536 worker-OOM reindex loop and crash-left reindex shadows.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { HealthCheck, HealthCheckContext } from "openclaw/plugin-sdk/health";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMemoryCoreDoctorChecks } from "../doctor-health.js";
import { MemoryIndexDatabase } from "./manager-database-context.js";
import {
  createManagerIndexFixture,
  memoryIndexFixtureWriter,
} from "./manager-index.test-support.js";
import type { MemoryIndexManager } from "./manager.js";

const memory = await import("./index.js");

const HOUR_MS = 60 * 60_000;
const oldChunking =
  "UPDATE memory_index_meta SET value = json_set(value, '$.chunkingVersion', 0) WHERE key = 'memory_index_meta_v1'";

// The SQLite broker reports a Worker killed at its heap limit in this shape
// (src/infra/sqlite-worker-broker-reply.ts): the Node error survives as the cause.
function workerHeapOutOfMemory(): Error {
  const cause = Object.assign(
    new Error("Worker terminated due to reaching memory limit: JS heap out of memory"),
    { code: "ERR_WORKER_OUT_OF_MEMORY" },
  );
  return Object.assign(
    new Error(`SQLite worker stopped before its result was received: ${cause.message}`, { cause }),
    { name: "SqliteWorkerError", code: "outcome-unknown" },
  );
}

function failShadowWritesWithWorkerOom() {
  // oxlint-disable-next-line typescript/unbound-method -- Called with the intercepted owner.
  const replaceSource = MemoryIndexDatabase.prototype.replaceSource;
  return vi.spyOn(MemoryIndexDatabase.prototype, "replaceSource").mockImplementation(function (
    this: MemoryIndexDatabase,
    ...args
  ) {
    return this.isShadow
      ? Promise.reject(workerHeapOutOfMemory())
      : replaceSource.apply(this, args);
  });
}

function readPersistedFailure(manager: MemoryIndexManager): unknown {
  const row = memoryIndexFixtureWriter(manager)
    .prepare("SELECT value FROM memory_index_meta WHERE key = 'memory_reindex_failure_v1'")
    .get();
  return typeof row?.value === "string" ? JSON.parse(row.value) : null;
}

/** Shadow base names; journal-mode sidecars belong to their shadow. */
async function listShadowNames(databasePath: string): Promise<string[]> {
  const prefix = `${path.basename(databasePath)}.memory-reindex-`;
  const names = (await fs.readdir(path.dirname(databasePath)))
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.replace(/-(?:wal|shm|journal)$/, ""));
  return [...new Set(names)].toSorted();
}

describe("memory reindex worker memory failures", () => {
  const fixture = createManagerIndexFixture(memory);
  afterEach(() => vi.restoreAllMocks());

  async function failingRebuild() {
    const cfg = fixture.createConfig({
      provider: "openai",
      sources: ["memory"],
      minScore: 0,
      cacheEnabled: false,
    });
    const manager = await fixture.getPersistentManager(cfg);
    await manager.sync({ reason: "baseline", force: true });
    // An older chunking identity makes every automatic sync request a full shadow rebuild.
    memoryIndexFixtureWriter(manager).exec(oldChunking);
    const time = { now: Date.now() };
    vi.spyOn(Date, "now").mockImplementation(() => time.now);
    const openShadow = vi.spyOn(MemoryIndexDatabase, "openShadow");
    const oom = failShadowWritesWithWorkerOom();
    return { cfg, manager, time, openShadow, oom };
  }

  it("persists one failed attempt and opens no shadow during its cooldown, even after restart", async () => {
    const { cfg, manager, time, openShadow } = await failingRebuild();

    await expect(manager.sync()).rejects.toThrow("JS heap out of memory");
    expect(openShadow).toHaveBeenCalledTimes(1);
    const failure = {
      kind: "worker-out-of-memory",
      sources: ["memory"],
      attempts: 1,
      failedAt: time.now,
      retryAt: time.now + HOUR_MS,
    };

    // The generic 30s rebuild backoff has elapsed; only the persisted cooldown remains.
    time.now += 30_001;
    const deferred = await manager.sync().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(openShadow).toHaveBeenCalledTimes(1);
    expect(deferred).toBeUndefined();
    expect(readPersistedFailure(manager)).toEqual(failure);

    const databasePath = manager.status().dbPath!;
    await manager.close();
    const restarted = await fixture.getFreshManager(cfg);
    await restarted.sync();
    expect(openShadow).toHaveBeenCalledTimes(1);
    expect(await listShadowNames(databasePath)).toEqual([]);
    const status = await fixture.getFreshManager(cfg, "status");
    expect(status.status().custom?.reindexFailure).toEqual(failure);
  });

  it("retries after each cooldown, stops after the last attempt, and resumes on an explicit index", async () => {
    const { cfg, manager, time, openShadow, oom } = await failingRebuild();

    for (const [attempts, cooldown] of [
      [1, HOUR_MS],
      [2, 6 * HOUR_MS],
    ] as const) {
      await expect(manager.sync()).rejects.toThrow("JS heap out of memory");
      expect(readPersistedFailure(manager)).toEqual({
        kind: "worker-out-of-memory",
        sources: ["memory"],
        attempts,
        failedAt: time.now,
        retryAt: time.now + cooldown,
      });
      time.now += cooldown - 1;
      await manager.sync();
      expect(openShadow).toHaveBeenCalledTimes(attempts);
      time.now += 1;
    }
    await expect(manager.sync()).rejects.toThrow("JS heap out of memory");
    const stopped = {
      kind: "worker-out-of-memory",
      sources: ["memory"],
      attempts: 3,
      failedAt: time.now,
    };
    expect(readPersistedFailure(manager)).toEqual(stopped);
    time.now += 7 * 24 * HOUR_MS;
    await manager.sync();
    expect(openShadow).toHaveBeenCalledTimes(3);

    expect(manager.status().custom?.reindexFailure).toEqual(stopped);
    const checks = new Map<string, HealthCheck>();
    registerMemoryCoreDoctorChecks({
      registerHealthCheck: (check) => checks.set(check.id, check),
      getHealthCheck: (id) => checks.get(id),
      inspectEmbeddingProviderSetup: async () => undefined,
      memoryCoreActive: true,
    });
    const doctor = checks.get("memory-core/reindex-resource-failure");
    expect(doctor).toBeDefined();
    const context: HealthCheckContext = {
      mode: "lint",
      runtime: {} as HealthCheckContext["runtime"],
      cfg,
      env: { ...process.env, OPENCLAW_STATE_DIR: fixture.paths.stateDir },
    };
    expect(await doctor!.detect(context)).toEqual([
      expect.objectContaining({
        severity: "warning",
        target: "main/memory-index",
        message: expect.stringContaining(
          "automatic rebuilds stopped after 3 worker out-of-memory failures",
        ),
        fixHint: expect.stringContaining("openclaw memory index --force --agent main"),
      }),
    ]);

    oom.mockRestore();
    await manager.sync({ reason: "cli", force: true });
    expect(openShadow).toHaveBeenCalledTimes(4);
    expect(readPersistedFailure(manager)).toBeNull();
    expect(manager.status().custom?.reindexFailure).toBeUndefined();
    expect(await doctor!.detect(context)).toEqual([]);
  });

  async function writeCrashLeftShadow(databasePath: string): Promise<string> {
    // A crash leaves fresh files behind; their age proves nothing about ownership.
    const name = `${path.basename(databasePath)}.memory-reindex-${randomUUID()}`;
    for (const suffix of ["", "-wal", "-shm"]) {
      await fs.writeFile(path.join(path.dirname(databasePath), `${name}${suffix}`), "crash");
    }
    return name;
  }

  it("removes a crashed run's shadow when the next owner starts", async () => {
    const cfg = fixture.createConfig({ provider: "none", sources: ["memory"] });
    const published = await fixture.getPersistentManager(cfg);
    await published.sync({ reason: "baseline", force: true });
    const databasePath = published.status().dbPath!;
    await published.close();
    await writeCrashLeftShadow(databasePath);

    await fixture.getFreshManager(cfg);
    await vi.waitFor(async () => {
      expect(await listShadowNames(databasePath)).toEqual([]);
    });
  });

  it("keeps a suspended rebuild's shadow while removing a crashed run's shadow", async () => {
    for (let index = 0; index < 10; index++) {
      await fixture.seedSessionTranscript({
        sessionId: `suspended-${index}`,
        messages: [{ role: "user", timestamp: Date.now(), content: `suspended marker ${index}` }],
      });
    }
    fixture.provider.forceNoProvider = true;
    const cfg = fixture.createConfig({
      provider: "none",
      sources: ["sessions"],
      sessionMemory: true,
      vectorEnabled: false,
    });
    const owner = await fixture.getFreshManager(cfg);
    let suspended = false;
    // oxlint-disable-next-line typescript/unbound-method -- Called with the intercepted owner.
    const replaceSource = MemoryIndexDatabase.prototype.replaceSource;
    vi.spyOn(MemoryIndexDatabase.prototype, "replaceSource").mockImplementation(async function (
      this: MemoryIndexDatabase,
      ...args
    ) {
      const result = await replaceSource.apply(this, args);
      if (this.isShadow && !suspended) {
        // A foreground turn after the first durable group suspends the rebuild with its shadow.
        suspended = true;
        Reflect.set(owner, "sessionAgentBusy", true);
      }
      return result;
    });
    await (owner as unknown as { syncBackground(params: object): Promise<void> }).syncBackground({
      reason: "session-startup-catchup",
    });
    const databasePath = owner.status().dbPath!;
    const suspendedShadows = await listShadowNames(databasePath);
    expect(suspendedShadows).toHaveLength(1);
    await writeCrashLeftShadow(databasePath);

    // Another owner's full rebuild sweeps orphans before opening its own shadow.
    const cli = await fixture.getFreshManager(cfg, "cli");
    await cli.sync({ reason: "cli", force: true });
    expect(await listShadowNames(databasePath)).toEqual(suspendedShadows);

    await owner.close();
    expect(await listShadowNames(databasePath)).toEqual([]);
  });
});
