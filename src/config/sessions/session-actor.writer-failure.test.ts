import type { Worker } from "node:worker_threads";
import { afterEach, expect, it, vi } from "vitest";
import { openNodeSqliteDatabase } from "../../infra/node-sqlite.js";
import { runSqliteImmediateTransactionSync } from "../../infra/sqlite-transaction.js";
import { readOpenClawAgentDatabaseIdentity } from "../../state/openclaw-agent-db-identity.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import type { SessionActor, SessionActorAuthority } from "./session-actor-contract.js";
import { createDurableSessionActorFactory } from "./session-actor-durable.js";
import { createSessionCompoundWorkerFixture } from "./session-compound-worker.test-support.js";

// A failed turn must not leave a writer fence that wedges later turns on the same
// session until a Gateway restart (#1475 D2). Faults run inside the real agent worker.
const fault = vi.hoisted(() => ({
  // [mode, hits]: 1 entry write throws, 2 COMMIT throws, 3 COMMIT and ROLLBACK throw,
  // 4 the worker exits while receiving the actor command.
  cell: new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT),
}));

vi.mock("../../infra/worker-cpu.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../infra/worker-cpu.js")>();
  const preload = `
    import { DatabaseSync } from "node:sqlite";
    import { MessagePort, workerData } from "node:worker_threads";
    const cell = () => new Int32Array(workerData.actorWriterFault);
    const ioerr = () => Object.assign(new Error("disk I/O error"), { code: "ERR_SQLITE_ERROR", errcode: 10, errstr: "disk I/O error" });
    const prepare = DatabaseSync.prototype.prepare;
    DatabaseSync.prototype.prepare = function (sql) {
      const statement = prepare.call(this, sql);
      if (/session_nodes/i.test(sql) && /^\\s*(insert|update)/i.test(sql)) {
        const run = statement.run.bind(statement);
        statement.run = (...args) => {
          if (Atomics.compareExchange(cell(), 0, 1, 0) === 1) {
            Atomics.add(cell(), 1, 1);
            throw ioerr();
          }
          return run(...args);
        };
      }
      return statement;
    };
    const exec = DatabaseSync.prototype.exec;
    DatabaseSync.prototype.exec = function (sql) {
      if (/^\\s*COMMIT\\b/i.test(sql) && (Atomics.compareExchange(cell(), 0, 2, 0) === 2 || Atomics.compareExchange(cell(), 0, 3, 5) === 3)) {
        Atomics.add(cell(), 1, 1);
        throw ioerr();
      }
      if (/^\\s*ROLLBACK\\b/i.test(sql) && Atomics.compareExchange(cell(), 0, 5, 0) === 5) {
        Atomics.add(cell(), 1, 1);
        throw ioerr();
      }
      return exec.call(this, sql);
    };
    const on = MessagePort.prototype.on;
    MessagePort.prototype.on = function (event, listener) {
      if (event !== "message") {
        return on.call(this, event, listener);
      }
      return on.call(this, event, function (message) {
        if (Atomics.load(cell(), 0) === 4) {
          let text = "";
          try {
            const input = message && message.input;
            text = input ? Buffer.from(input.buffer, input.byteOffset, input.byteLength).toString("latin1") : "";
          } catch {}
          if (text.includes("session.actor.patch")) {
            Atomics.store(cell(), 0, 0);
            Atomics.add(cell(), 1, 1);
            process.exit(3);
          }
        }
        return listener.call(this, message);
      });
    };
  `;
  return {
    ...actual,
    createCpuTrackedWorker(
      filename: string | URL,
      options: ConstructorParameters<typeof Worker>[1],
    ) {
      return actual.createCpuTrackedWorker(filename, {
        ...options,
        execArgv: [
          ...(options?.execArgv ?? []),
          "--import",
          `data:text/javascript,${encodeURIComponent(preload)}`,
        ],
        workerData: { ...options?.workerData, actorWriterFault: fault.cell },
      });
    },
  };
});
// mock-isolation: this transport proof does not schedule unrelated maintenance.
vi.mock("./session-accessor.sqlite-maintenance-kick.js", () => ({
  kickSessionEntryMaintenanceAfterWrite() {},
}));
// mock-isolation: Keep background disk-budget eviction out of the fixture's transport proof.
vi.mock("./session-history-eviction.js", () => ({ kickSessionHistoryDiskBudgetMaintenance() {} }));

afterEach(() => {
  Atomics.store(new Int32Array(fault.cell), 0, 0);
  Atomics.store(new Int32Array(fault.cell), 1, 0);
});

const authority: SessionActorAuthority = { assertCurrent() {}, authorize() {} };

/** Production turns acquire a fresh durable actor over the same real agent worker. */
async function withDurableActorTurns(
  run: (fixture: {
    path: string;
    read: () => number | undefined;
    acquire: () => Promise<SessionActor>;
    turn: (updatedAt: number, held?: SessionActor) => Promise<{ kind: string; error?: unknown }>;
  }) => Promise<void>,
) {
  await withOpenClawTestState({ scenario: "minimal" }, async ({ env }) => {
    const fixture = createSessionCompoundWorkerFixture();
    const identity = readOpenClawAgentDatabaseIdentity(fixture.database);
    if (typeof identity.identity !== "string") {
      throw new Error("Fixture requires durable storage");
    }
    const physicalIdentity = identity.identity;
    const acquire = async () => {
      const actor = await createDurableSessionActorFactory({
        agentId: "main",
        path: fixture.database.path,
        env,
      }).acquire(
        {
          sessionKey: fixture.scope.sessionKey,
          database: {
            kind: "file",
            physicalIdentity,
            birthtime: identity.birthtime,
            nativeLocation: fixture.database.path,
          },
        },
        { assertCurrent() {}, assertReadable() {} },
      );
      if ("kind" in actor) {
        throw new Error("Durable session must be actor-owned");
      }
      return actor;
    };
    const turn = async (updatedAt: number, held?: SessionActor) => {
      const actor = held ?? (await acquire());
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
        if (!held) {
          await actor.release();
        }
      }
    };
    await run({
      path: fixture.database.path,
      read: () => fixture.read()?.updatedAt,
      acquire,
      turn,
    });
  });
}

it.each(["failed transaction", "committed transaction", "autocommit write"] as const)(
  "keeps later turns live after a settled %s behind a parked read cursor",
  async (write) => {
    await withDurableActorTurns(async ({ path, read, turn }) => {
      expect(await turn(10)).toEqual({ kind: "committed" });
      // An errored or aborted turn can leave a read cursor parked on its connection.
      using sibling = openNodeSqliteDatabase(path);
      const rows = sibling.prepare("SELECT session_key FROM session_nodes").iterate();
      try {
        expect(rows.next().done).toBe(false);
        const update = () =>
          sibling.prepare("UPDATE session_nodes SET updated_at = updated_at").run();
        if (write === "failed transaction") {
          expect(() =>
            runSqliteImmediateTransactionSync(sibling, () => {
              update();
              throw new Error("synthetic mid-turn write failure");
            }),
          ).toThrow("synthetic mid-turn write failure");
        } else if (write === "committed transaction") {
          runSqliteImmediateTransactionSync(sibling, update);
        } else {
          update();
        }
        // The settled write must not keep fencing every session actor on this database.
        expect(await turn(20)).toEqual({ kind: "committed" });
        expect(await turn(30)).toEqual({ kind: "committed" });
        expect(read()).toBe(30);
      } finally {
        rows.return?.();
      }
      expect(await turn(40)).toEqual({ kind: "committed" });
    });
  },
);

it.each([
  { mode: 1, failure: "entry write" },
  { mode: 2, failure: "COMMIT" },
])("settles a native $failure failure so the same actor commits next", async (input) => {
  await withDurableActorTurns(async ({ acquire, read, turn }) => {
    const actor = await acquire();
    try {
      expect(await turn(10, actor)).toEqual({ kind: "committed" });
      Atomics.store(new Int32Array(fault.cell), 0, input.mode);
      expect(await turn(20, actor)).toMatchObject({
        kind: "rolled-back",
        error: { message: "disk I/O error" },
      });
      expect(Atomics.load(new Int32Array(fault.cell), 1)).toBe(1);
      expect(await turn(30, actor)).toEqual({ kind: "committed" });
      expect(read()).toBe(30);
    } finally {
      await actor.release();
    }
  });
});

it.each([
  { mode: 3, failure: "COMMIT and ROLLBACK", hits: 2 },
  { mode: 4, failure: "worker exit", hits: 1 },
])("recovers the next turn after a lost native $failure without replay", async (input) => {
  await withDurableActorTurns(async ({ read, turn }) => {
    expect(await turn(10)).toEqual({ kind: "committed" });
    Atomics.store(new Int32Array(fault.cell), 0, input.mode);
    expect(await turn(20)).toMatchObject({ kind: "unknown" });
    expect(Atomics.load(new Int32Array(fault.cell), 1)).toBe(input.hits);
    expect(await turn(30)).toEqual({ kind: "committed" });
    expect(read()).toBe(30);
  });
});
