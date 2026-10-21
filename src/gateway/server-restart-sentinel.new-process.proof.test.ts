// Continuation (karmaterminal): durable restart rows recover in a new process, once, only from the state dir that owns them.
import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { runNodeScript } from "../../test/helpers/run-node-script.js";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";

const temporary = useAutoCleanupTempDirTracker(afterAll);
const child = fileURLToPath(
  new URL("./server-restart-sentinel.new-process.child.test-support.ts", import.meta.url),
);
const LIFETIME_TIMEOUT_MS = 150_000;
const sessionKey = "agent:main:main";

type Row = { id: string; kind: string; deliveryStartedAt: number | null; retryCount: number };
type Lifetime = {
  ids?: string[];
  pending?: Row[];
  before?: Row[];
  after?: Row[];
  capturedStateDir?: string;
  crashed?: boolean;
  events?: Array<{ text: string; sessionKey: string; contextKey?: string; sessionId?: string }>;
  dispatches?: Array<{ sessionKey: string; messageSid?: string }>;
  queued?: Record<string, Array<Record<string, unknown>>>;
  logs?: string[];
  output: string;
};

/** One gateway lifetime in a fresh Node process, run as production (no test-mode env). */
async function lifetime(
  stateDir: string,
  mode: "seed" | "recover",
  args: Record<string, unknown> = {},
  expectCrash = false,
): Promise<Lifetime> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_DISABLE_BUNDLED_PLUGINS: "1",
    NO_COLOR: "1",
  };
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITEST") || key === "NODE_ENV") {
      delete env[key];
    }
  }
  const result = await runNodeScript(
    ["--import", "tsx", child, mode, JSON.stringify(args)],
    env,
    LIFETIME_TIMEOUT_MS,
    { requireProcessTreeExit: true },
  );
  const output = `${result.stdout}\n${result.stderr}`;
  if (expectCrash) {
    expect(result.status, output).not.toBe(0);
  } else {
    expect(result.error, output).toBeUndefined();
    expect(result.status, output).toBe(0);
  }
  const report = result.stdout.split("\n").findLast((line) => line.startsWith('{"mode"'));
  expect(report, output).toBeDefined();
  return { ...(JSON.parse(report!) as Omit<Lifetime, "output">), output };
}

/** Raw queue rows, read without any owner code; null when the state database was never created. */
function storedRows(stateDir: string) {
  const databasePath = path.join(stateDir, "state", "openclaw.sqlite");
  if (!existsSync(databasePath)) {
    return null;
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database
      .prepare("SELECT id, status FROM delivery_queue_entries WHERE queue_name = 'session'")
      .all() as Array<{ id: string; status: string }>;
    return Object.fromEntries(rows.map((row) => [row.id, row.status]));
  } finally {
    database.close();
  }
}

const wakeEvent = (id: string, revision: number, sessionId: string) => ({
  text: `restart wake ${revision}`,
  sessionKey,
  contextKey: `task:restart-sentinel:${id}`,
  sessionId,
});
const turnDispatch = (revision: number) => ({
  sessionKey,
  messageSid: `restart-sentinel:${sessionKey}:agentTurn:${revision}`,
});
const ids = (rows: Row[] | undefined) => rows?.map((row) => row.id);

describe("restart recovery across process lifetimes (shared with upstream)", () => {
  const owner = temporary.make("openclaw-restart-owner-");
  const stranger = temporary.make("openclaw-restart-stranger-");
  let seeded: string[] = [];

  it(
    "negative: a process whose state dir is another one neither sees, delivers nor settles the rows",
    { timeout: 2 * LIFETIME_TIMEOUT_MS },
    async () => {
      const seed = await lifetime(owner, "seed", {
        rows: [
          { kind: "wake", revision: 1 },
          { kind: "turn", revision: 2, expectedSessionId: "session-1" },
        ],
      });
      seeded = seed.ids!;
      expect(ids(seed.pending)).toEqual(seeded);

      const elsewhere = await lifetime(stranger, "recover");
      expect(elsewhere.capturedStateDir).toBe(stranger);
      expect(elsewhere).toMatchObject({ before: [], after: [], events: [], dispatches: [] });
      expect(storedRows(stranger)).toEqual({});
      expect(storedRows(owner)).toEqual(Object.fromEntries(seeded.map((id) => [id, "pending"])));
    },
  );

  it(
    "positive: a new process recovers the wake and the turn from the owning dir and settles both",
    { timeout: LIFETIME_TIMEOUT_MS },
    async () => {
      const [wakeId, turnId] = seeded;
      // Two recovery passes in one lifetime: the second finds nothing left to deliver.
      const recovered = await lifetime(owner, "recover", { passes: 2 });
      expect(recovered.before).toEqual([
        { id: wakeId, kind: "systemEvent", deliveryStartedAt: null, retryCount: 0 },
        { id: turnId, kind: "agentTurn", deliveryStartedAt: null, retryCount: 0 },
      ]);
      expect(recovered.events).toEqual([wakeEvent(wakeId!, 1, "session-1")]);
      expect(recovered.dispatches).toEqual([turnDispatch(2)]);
      expect(recovered.after).toEqual([]);
      expect(recovered.logs).toEqual([
        `info: Recovered session delivery ${wakeId}`,
        `info: Recovered session delivery ${turnId}`,
      ]);
      expect(storedRows(owner)).toEqual(Object.fromEntries(seeded.map((id) => [id, "completed"])));
    },
  );

  it(
    "exactly-once: a later process finds the settled rows and delivers nothing",
    { timeout: LIFETIME_TIMEOUT_MS },
    async () => {
      const again = await lifetime(owner, "recover");
      expect(again).toMatchObject({ before: [], after: [], events: [], dispatches: [], logs: [] });
      expect(storedRows(owner)).toEqual(Object.fromEntries(seeded.map((id) => [id, "completed"])));
    },
  );

  it(
    "interleaving: a queue owner captured for the owning dir delivers there while process.env names a dir it never opens",
    { timeout: 2 * LIFETIME_TIMEOUT_MS },
    async () => {
      const captured = temporary.make("openclaw-restart-captured-");
      const environment = temporary.make("openclaw-restart-env-");
      const [wakeId] = (await lifetime(captured, "seed", { rows: [{ kind: "wake", revision: 1 }] }))
        .ids!;
      const recovered = await lifetime(environment, "recover", { captureStateDir: captured });
      expect(recovered.capturedStateDir).toBe(captured);
      expect(recovered.events).toEqual([wakeEvent(wakeId!, 1, "session-1")]);
      expect(recovered.after).toEqual([]);
      expect(storedRows(captured)).toEqual({ [wakeId!]: "completed" });
      // The process env dir never gained a state database.
      expect(storedRows(environment)).toBeNull();
    },
  );

  it(
    "crash: a row whose attempt started but never settled is dead-lettered by the next process, never delivered again",
    { timeout: 4 * LIFETIME_TIMEOUT_MS },
    async () => {
      const stateDir = temporary.make("openclaw-restart-crash-");
      const [wakeId, turnId] = (
        await lifetime(stateDir, "seed", {
          rows: [
            { kind: "wake", revision: 1 },
            { kind: "turn", revision: 2 },
          ],
        })
      ).ids!;

      // Lifetime 1 dies after the wake's attempt marker commits, before settlement.
      const first = await lifetime(stateDir, "recover", { crashOnAdoption: true }, true);
      expect(first).toMatchObject({ crashed: true, dispatches: [] });
      expect(first.events).toEqual([wakeEvent(wakeId!, 1, "session-1")]);

      // Lifetime 2 dead-letters the started wake without handing it over again, then
      // dies after the turn's attempt marker commits.
      const second = await lifetime(stateDir, "recover", { crashOnAdoption: true }, true);
      expect(second.before?.[0]).toMatchObject({
        id: wakeId,
        deliveryStartedAt: expect.any(Number),
      });
      expect(second.before?.[1]).toMatchObject({ id: turnId, deliveryStartedAt: null });
      expect(second.events).toEqual([]);
      expect(second.dispatches).toEqual([turnDispatch(2)]);
      expect(second.logs).toContain(
        `warn: Session delivery: entry ${wakeId} was dead-lettered and moved to failed`,
      );

      // Lifetime 3 dead-letters the started turn without dispatching it again.
      const third = await lifetime(stateDir, "recover");
      expect(third.before).toEqual([
        { id: turnId, kind: "agentTurn", deliveryStartedAt: expect.any(Number), retryCount: 0 },
      ]);
      expect(third).toMatchObject({ after: [], events: [], dispatches: [] });
      expect(third.logs).toEqual([
        `warn: Session delivery: dead-letter decision for entry ${turnId}: queued agent turn dead-lettered after an interrupted unproven attempt`,
        `warn: Session delivery: entry ${turnId} was dead-lettered and moved to failed`,
      ]);
      expect(storedRows(stateDir)).toEqual({
        [wakeId!]: "failed",
        [turnId!]: "failed",
      });
    },
  );

  it(
    "ownership loss: a turn bound to a session replaced before restart never runs; its text reaches the new incarnation only as a passive event",
    { timeout: 2 * LIFETIME_TIMEOUT_MS },
    async () => {
      const stateDir = temporary.make("openclaw-restart-reset-");
      const [turnId] = (
        await lifetime(stateDir, "seed", {
          rows: [{ kind: "turn", revision: 1, expectedSessionId: "session-1" }],
          resetTo: "session-2",
        })
      ).ids!;
      const recovered = await lifetime(stateDir, "recover");
      expect(recovered.dispatches).toEqual([]);
      expect(recovered.events).toEqual([
        {
          text: "continue 1",
          sessionKey,
          contextKey: `task:restart-sentinel:${turnId}`,
          sessionId: "session-2",
        },
      ]);
      expect(recovered.output).toContain("restart continuation skipped: session changed");
      expect(recovered.after).toEqual([]);
      expect(storedRows(stateDir)).toEqual({ [turnId!]: "completed" });
    },
  );
});

describe("fork-only: recipient-bound continuation rows across process lifetimes", () => {
  it(
    "ownership loss: a revoked recipient's row retires without an event; a current one is queued for adoption bound to its owning dir, not process.env's",
    { timeout: 2 * LIFETIME_TIMEOUT_MS },
    async () => {
      const stateDir = temporary.make("openclaw-restart-authority-");
      const environment = temporary.make("openclaw-restart-authority-env-");
      const [revokedId, keptId] = (
        await lifetime(stateDir, "seed", {
          rows: [
            { kind: "authority", revision: 1, sessionKey: "agent:main:revoked", revoke: true },
            { kind: "authority", revision: 2, sessionKey: "agent:main:kept", revoke: false },
          ],
        })
      ).ids!;
      const recovered = await lifetime(environment, "recover", {
        captureStateDir: stateDir,
        peekSessionKeys: ["agent:main:revoked", "agent:main:kept"],
      });
      expect(recovered.output).toContain(
        `session event delivery skipped: recipient authority changed sessionKey=agent:main:revoked queueId=${revokedId}`,
      );
      expect(recovered.queued?.["agent:main:revoked"]).toEqual([]);
      expect(recovered.queued?.["agent:main:kept"]).toEqual([
        expect.objectContaining({
          text: "delegate result 2",
          sessionDeliveryAckId: keptId,
          sessionDeliveryAckStateDir: stateDir,
        }),
      ]);
      // The kept row stays pending until a prompt adopts its in-memory event.
      expect(ids(recovered.after)).toEqual([keptId]);
      expect(recovered.logs).toEqual([`info: Recovered session delivery ${revokedId}`]);
      expect(storedRows(stateDir)).toEqual({
        [revokedId!]: "completed",
        [keptId!]: "pending",
      });
      expect(storedRows(environment)).toBeNull();
    },
  );
});
