import { once } from "node:events";
import type { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
import { openNodeSqliteDatabase } from "../../infra/node-sqlite.js";
import { SQLITE_IDLE_HANDLE_TTL_MS } from "../../infra/sqlite-handle-lifecycle.js";
import { readOpenClawAgentDatabaseIdentity } from "../../state/openclaw-agent-db-identity.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { deleteSessionEntryLifecycle } from "./session-accessor.js";
import * as sqliteArchive from "./session-accessor.sqlite-archive.js";
import { replaceSessionEntrySync } from "./session-accessor.sqlite-entry.js";
import { seedUnindexedTranscriptForTest } from "./session-accessor.sqlite-import.test-support.js";
import type { SessionActorAuthority } from "./session-actor-contract.js";
import { createDurableSessionActorFactory } from "./session-actor-durable.js";
import { createSessionCompoundWorkerFixture } from "./session-compound-worker.test-support.js";

// Thirty minutes after `sessions delete`, two idle owners fire together: the retained
// reclamation Worker retires, and the agent execution worker's own WAL timer finds the
// deleted pages. Neither may wedge the room's next turn (#1475 D5).
const clocks = vi.hoisted(() => new Map<Worker, SharedArrayBuffer>());

// Fake timers cannot reach a Worker's event loop, so each SQLite store carrier gets a
// virtual clock: the test raises its offset and the carrier fires the timers now due.
vi.mock("../../infra/worker-cpu.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../infra/worker-cpu.js")>();
  const preload = `
    import { performance } from "node:perf_hooks";
    import { workerData } from "node:worker_threads";
    // [0] requested generation, [1] offset seconds, [2] acknowledged generation
    const cell = new Int32Array(workerData.idleClock);
    const offset = () => Atomics.load(cell, 1) * 1000;
    const now = Date.now;
    const monotonic = performance.now.bind(performance);
    Date.now = () => now() + offset();
    performance.now = () => monotonic() + offset();
    const set = globalThis.setTimeout;
    const clear = globalThis.clearTimeout;
    const armed = new Map();
    globalThis.setTimeout = (callback, delay, ...args) => {
      const ms = Math.max(0, Number(delay) || 0);
      const handle = set(() => {
        armed.delete(handle);
        callback(...args);
      }, ms);
      armed.set(handle, { due: performance.now() + ms, fire: () => callback(...args) });
      return handle;
    };
    globalThis.clearTimeout = (handle) => {
      armed.delete(handle);
      return clear(handle);
    };
    const advance = async (seen) => {
      await Atomics.waitAsync(cell, 0, seen).value;
      const generation = Atomics.load(cell, 0);
      for (let round = 0; round < 20; round++) {
        const at = performance.now();
        const due = [...armed].filter(([, timer]) => timer.due <= at);
        if (due.length === 0) break;
        for (const [handle, timer] of due.sort(([, a], [, b]) => a.due - b.due)) {
          if (armed.delete(handle)) {
            clear(handle);
            try {
              timer.fire();
            } catch (error) {
              setImmediate(() => {
                throw error;
              });
            }
          }
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      Atomics.store(cell, 2, generation);
      Atomics.notify(cell, 2);
      void advance(generation);
    };
    void advance(0);
  `;
  return {
    ...actual,
    createCpuTrackedWorker(
      filename: string | URL,
      options: ConstructorParameters<typeof Worker>[1],
    ) {
      if (!String(filename).includes("sqlite-store")) {
        return actual.createCpuTrackedWorker(filename, options);
      }
      const idleClock = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT);
      const worker = actual.createCpuTrackedWorker(filename, {
        ...options,
        execArgv: [
          ...(options?.execArgv ?? []),
          "--import",
          `data:text/javascript,${encodeURIComponent(preload)}`,
        ],
        workerData: { ...options?.workerData, idleClock },
      });
      clocks.set(worker, idleClock);
      worker.once("exit", () => clocks.delete(worker));
      return worker;
    },
  };
});
// mock-isolation: this transport proof does not schedule unrelated maintenance.
vi.mock("./session-accessor.sqlite-maintenance-kick.js", () => ({
  kickSessionEntryMaintenanceAfterWrite() {},
}));
// mock-isolation: Keep background disk-budget eviction out of the fixture's transport proof.
vi.mock("./session-history-eviction.js", () => ({ kickSessionHistoryDiskBudgetMaintenance() {} }));

const authority: SessionActorAuthority = { assertCurrent() {}, authorize() {} };

/** Let every live SQLite store carrier observe `seconds` more of its own idle time. */
async function advanceWorkerClocks(seconds: number) {
  for (const [worker, buffer] of clocks) {
    const cell = new Int32Array(buffer);
    Atomics.add(cell, 1, seconds);
    const generation = Atomics.add(cell, 0, 1) + 1;
    Atomics.notify(cell, 0);
    const exited = once(worker, "exit");
    while (Atomics.load(cell, 2) < generation && clocks.has(worker)) {
      await Promise.race([Atomics.waitAsync(cell, 2, Atomics.load(cell, 2)).value, exited]);
    }
  }
}

it.each(["retires on idle", "stays retained"] as const)(
  "keeps the room's next turn live when a deletion's reclamation Worker %s and its pages are reclaimed",
  async (reclamation) => {
    // Host idle owners share the thirty-minute TTL, so fake time owns them all.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await withOpenClawTestState({ scenario: "minimal" }, async (state) => {
      const fixture = createSessionCompoundWorkerFixture();
      const identity = readOpenClawAgentDatabaseIdentity(fixture.database);
      if (typeof identity.identity !== "string") {
        throw new Error("Fixture requires durable storage");
      }
      const target = {
        sessionKey: fixture.scope.sessionKey,
        database: {
          kind: "file" as const,
          physicalIdentity: identity.identity,
          birthtime: identity.birthtime,
          nativeLocation: fixture.database.path,
        },
      };
      const options = { agentId: "main", path: fixture.database.path, env: state.env };
      const turn = async (updatedAt: number) => {
        const actor = await createDurableSessionActorFactory(options).acquire(target, {
          assertCurrent() {},
          assertReadable() {},
        });
        if ("kind" in actor) {
          throw new Error("Durable session must be actor-owned");
        }
        try {
          return await actor
            .patch(
              {
                commandId: `turn-${updatedAt}`,
                phaseId: `turn-${updatedAt}`,
                reducers: [{ kind: "activity", updatedAt }],
              },
              authority,
            )
            .then(
              (outcome) => ({
                kind: outcome.kind,
                ...("error" in outcome ? { error: outcome.error } : {}),
              }),
              (error: unknown) => ({ kind: "thrown", error: String(error) }),
            );
        } finally {
          await actor.release();
        }
      };
      const reclamationWorkers: Worker[] = [];
      const spawn = sqliteArchive.createSqliteTranscriptArchiveWorker;
      vi.spyOn(sqliteArchive, "createSqliteTranscriptArchiveWorker").mockImplementation(
        (data, nativeLocations) => {
          const worker = spawn(data, nativeLocations);
          reclamationWorkers.push(worker);
          return worker;
        },
      );
      try {
        expect(await turn(10)).toEqual({ kind: "committed" });
        // `sessions delete` archives the room transcript and frees its pages.
        await seedUnindexedTranscriptForTest({
          agentId: "main",
          storePath: fixture.database.path,
          sessionKey: fixture.scope.sessionKey,
          entry: { sessionId: "deleted-room", updatedAt: 11 },
          events: Array.from({ length: 64 }, (_, seq) => ({
            session_id: "deleted-room",
            seq,
            created_at: seq + 1,
            event_json: JSON.stringify({ type: "message", id: `m${seq}`, text: "x".repeat(8192) }),
          })),
        });
        await expect(
          deleteSessionEntryLifecycle({
            agentId: "main",
            storePath: fixture.database.path,
            archiveTranscript: true,
            target: fixture.target,
          }),
        ).resolves.toMatchObject({ deleted: true });
        // The next inbound message rebinds the room key to a replacement session.
        replaceSessionEntrySync(fixture.scope, { sessionId: "replacement", updatedAt: 12 });
        expect(reclamationWorkers).toHaveLength(1);
        // Room turns keep the agent execution worker warm while the reclamation Worker idles.
        await vi.advanceTimersByTimeAsync(SQLITE_IDLE_HANDLE_TTL_MS - 10 * 60_000);
        expect(await turn(20)).toEqual({ kind: "committed" });
        if (reclamation === "retires on idle") {
          const exited = once(reclamationWorkers[0]!, "exit");
          await vi.advanceTimersByTimeAsync(10 * 60_000);
          await exited;
        }
        {
          using reader = openNodeSqliteDatabase(fixture.database.path);
          const free = reader.prepare("PRAGMA freelist_count").get()?.freelist_count;
          expect(Number(free)).toBeGreaterThan(0);
        }
        // The execution worker's periodic pass sets a page budget that its next tick spends.
        await advanceWorkerClocks(31 * 60);
        await advanceWorkerClocks(11);
        expect(await turn(30)).toEqual({ kind: "committed" });
        expect(await turn(40)).toEqual({ kind: "committed" });
      } finally {
        vi.restoreAllMocks();
      }
    }).finally(() => vi.useRealTimers());
  },
);
