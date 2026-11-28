import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { recordInboundSession } from "../channels/session.js";
import type { OpenClawConfigWithLegacyRoster } from "../config/legacy.roster.js";
import { resolveSessionStorePathCore } from "../config/sessions/paths.js";
import { upsertSessionEntryCore } from "../config/sessions/session-accessor.sqlite-entry.js";
import type { LegacyHeartbeatConfig } from "../config/types.agent-defaults.js";
import { resolveCronRunAdmissionSource } from "../cron/run-authority.js";
import { resolveCronJobsStorePathFromConfig } from "../cron/store.js";
import { resolveCronStoreKeyInDatabase } from "../cron/store/paths.js";
import {
  loadCronRows,
  loadedCronStoreFromRows,
  updateCronRuntimeRow,
  upsertCronJobRow,
} from "../cron/store/row-codec.js";
import type { CronStoredJob } from "../cron/types.js";
import { closeOpenClawAgentDatabasesForTest } from "../state/openclaw-agent-db.js";
import { withExistingOpenClawStateDatabaseReadOnly } from "../state/openclaw-state-db-readonly.js";
import {
  closeOpenClawStateDatabaseAsync,
  closeOpenClawStateDatabaseForTest,
  runOpenClawStateWriteTransaction,
} from "../state/openclaw-state-db.js";
import { normalizeSessionDeliveryState } from "../utils/delivery-context.shared.js";
import {
  collectHeartbeatCadenceMigrationFindings,
  ensureHeartbeatMonitorJobs,
} from "./doctor-heartbeat-cadence-migration.js";
import {
  maybeMigrateHeartbeatCadenceToCron,
  retireHeartbeatWithDoctor,
} from "./doctor-heartbeat-retirement.js";

// A pass-through room read that can land an edit between a plan's row snapshot and its write.
const roomRead = vi.hoisted(() => ({
  onRead: undefined as ((sessionKey: string) => void) | undefined,
}));
vi.mock("../config/sessions/session-entry-read-runtime.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../config/sessions/session-entry-read-runtime.js")>();
  return {
    ...actual,
    readSessionEntryReadOnlyInWorker: async (
      ...args: Parameters<typeof actual.readSessionEntryReadOnlyInWorker>
    ) => {
      const entry = await actual.readSessionEntryReadOnlyInWorker(...args);
      roomRead.onRead?.(args[0].sessionKey);
      return entry;
    },
  };
});

const NOW = Date.parse("2026-11-28T03:00:00Z");
const ROOM_ID = "1466192485440164011";
const ROOM = `agent:main:discord:channel:${ROOM_ID}`;
const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    roomRead.onRead = undefined;
    closeOpenClawAgentDatabasesForTest();
    await closeOpenClawStateDatabaseAsync();
    closeOpenClawStateDatabaseForTest();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    cleanup();
  }),
);

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

function fixture(
  heartbeat: LegacyHeartbeatConfig = { every: "30m", session: `discord:channel:${ROOM_ID}` },
) {
  const root = tempDirs.make("openclaw-heartbeat-owner-");
  const env = { ...process.env, HOME: path.join(root, "home"), OPENCLAW_STATE_DIR: root };
  vi.stubEnv("HOME", env.HOME);
  vi.stubEnv("OPENCLAW_STATE_DIR", root);
  const cfg: OpenClawConfigWithLegacyRoster = {
    agents: {
      defaults: { heartbeat },
      list: [{ id: "main", workspace: path.join(root, "workspace") }],
    },
  };
  return { env, cfg, storePath: resolveCronJobsStorePathFromConfig(cfg, env) };
}
type Fixture = ReturnType<typeof fixture>;

/** A Discord room turn through the real inbound recorder, as the channel plugin records it. */
async function recordRoomTurn(f: Fixture, accountId = "default", sessionKey = ROOM) {
  const to = `channel:${ROOM_ID}`;
  await recordInboundSession({
    storePath: resolveSessionStorePathCore(undefined, { agentId: "main", env: f.env }),
    sessionKey,
    ctx: {
      SessionKey: sessionKey,
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      OriginatingTo: to,
      To: to,
      AccountId: accountId,
      ChatType: "channel",
    },
    updateLastRoute: { sessionKey, channel: "discord", to, accountId },
    onRecordError: (error) => {
      throw error;
    },
  });
}

/** A room session state the recorder does not produce on its own. */
async function writeRoomDelivery(
  f: Fixture,
  delivery: Parameters<typeof normalizeSessionDeliveryState>[0],
) {
  await upsertSessionEntryCore(
    {
      agentId: "main",
      sessionKey: ROOM,
      storePath: resolveSessionStorePathCore(undefined, { agentId: "main", env: f.env }),
      env: f.env,
    },
    {
      sessionId: "room-session",
      updatedAt: NOW,
      delivery: normalizeSessionDeliveryState(delivery),
    },
  );
}

/** Every physical column of this store's cron rows. */
function readRows(f: Fixture) {
  return withExistingOpenClawStateDatabaseReadOnly(
    ({ db }) =>
      db
        .prepare("SELECT * FROM cron_jobs WHERE store_key = ? ORDER BY job_id")
        .all(resolveCronStoreKeyInDatabase(db, f.storePath, f.env)) as Array<
        Record<string, unknown> & { job_id: string; job_json: string }
      >,
    { env: f.env },
  )!;
}

function readJobs(f: Fixture) {
  return withExistingOpenClawStateDatabaseReadOnly(
    ({ db }) =>
      loadedCronStoreFromRows(
        loadCronRows(db, resolveCronStoreKeyInDatabase(db, f.storePath, f.env)),
      ).store.jobs,
    { env: f.env },
  )!;
}

function writeJob(f: Fixture, job: CronStoredJob) {
  runOpenClawStateWriteTransaction(
    ({ db }) => {
      const storeKey = resolveCronStoreKeyInDatabase(db, f.storePath, f.env);
      const row = loadCronRows(db, storeKey).find((candidate) => candidate.job_id === job.id);
      upsertCronJobRow(db, storeKey, job, row?.sort_order ?? 1);
    },
    { env: f.env },
  );
}

/** The six seats' state: cut over before stamping, so the receipt job has no owner. */
async function migrateWithoutOwner(f: Fixture) {
  await ensureHeartbeatMonitorJobs(f.cfg, f.storePath, f.env);
  const retired = await retireHeartbeatWithDoctor(f.cfg, f.env);
  const [job] = readJobs(f);
  expect(job?.owner).toBeUndefined();
  return { retired, job: job! };
}

describe("migrated heartbeat owner", () => {
  it.each([
    ["default", "default"],
    ["Work", "work"],
  ])(
    "records the room turn's identity on a fresh conversion (account %s)",
    async (raw, accountId) => {
      const f = fixture();
      await recordRoomTurn(f, raw);

      const job = (await ensureHeartbeatMonitorJobs(f.cfg, f.storePath, f.env)).get("main");

      expect(job?.sessionTarget).toBe(`session:${ROOM}`);
      expect(readJobs(f)[0]?.owner).toEqual({ agentId: "main", sessionKey: ROOM, accountId });
    },
  );

  it("backfills an already-migrated room heartbeat once and keeps every other field", async () => {
    const f = fixture();
    const { retired, job } = await migrateWithoutOwner(f);
    const foreign: CronStoredJob = {
      ...structuredClone(job),
      id: "prince-made",
      name: "prince-made",
      owner: { agentId: "main", sessionKey: "agent:main:discord:channel:2", accountId: "work" },
    };
    const unrelated: CronStoredJob = {
      ...structuredClone(job),
      id: "unrelated",
      name: "unrelated",
    };
    writeJob(f, foreign);
    writeJob(f, unrelated);
    // A scheduler run between cutover and this Doctor pass must survive the stamp.
    const ran = {
      ...job,
      state: { ...job.state, lastRunAtMs: NOW - 1_000, lastRunStatus: "ok" as const },
    };
    runOpenClawStateWriteTransaction(
      ({ db }) =>
        updateCronRuntimeRow(db, resolveCronStoreKeyInDatabase(db, f.storePath, f.env), ran),
      { env: f.env },
    );
    await recordRoomTurn(f);
    const before = readRows(f);
    const beforeJobs = readJobs(f);

    expect(await collectHeartbeatCadenceMigrationFindings(retired, f.env)).toEqual([
      expect.objectContaining({
        severity: "warning",
        requirement: "heartbeat-owner-backfill",
        message: "1 migrated heartbeat automation can record its room as owner.",
      }),
    ]);
    // Nothing is converted, so the cutover's own change line stays silent.
    expect(
      await maybeMigrateHeartbeatCadenceToCron({ cfg: retired, env: f.env, shouldRepair: true }),
    ).toEqual({ changes: [], warnings: [] });

    const owner = { agentId: "main", sessionKey: ROOM, accountId: "default" };
    const after = readRows(f);
    const afterJobs = readJobs(f);
    const others = (jobs: CronStoredJob[]) => jobs.filter((candidate) => candidate.id !== job.id);
    expect(afterJobs.find((candidate) => candidate.id === job.id)).toEqual({
      ...beforeJobs.find((candidate) => candidate.id === job.id),
      owner,
    });
    expect(others(afterJobs)).toEqual(others(beforeJobs));
    // The room now owns the job, so its runs carry the room's authority, not operator scheduling.
    expect(
      [beforeJobs, afterJobs].map((jobs) =>
        resolveCronRunAdmissionSource(jobs.find((candidate) => candidate.id === job.id)!),
      ),
    ).toEqual(["operator-schedule", "requester-schedule"]);
    for (const row of after) {
      const previous = before.find((candidate) => candidate.job_id === row.job_id)!;
      if (row.job_id !== job.id) {
        expect(row).toEqual(previous);
        continue;
      }
      // Owner is part of the definition, so only its codec-derived columns move with it.
      const {
        job_json: json,
        owner_agent_id: ownerAgentId,
        grant_definition_revision: _revision,
        grant_definition_generation: _generation,
        ...rest
      } = row;
      const {
        job_json: previousJson,
        grant_definition_revision: _previousRevision,
        grant_definition_generation: _previousGeneration,
        owner_agent_id: previousOwnerAgentId,
        ...previousRest
      } = previous;
      expect(rest).toEqual(previousRest);
      expect([previousOwnerAgentId, ownerAgentId]).toEqual([null, "main"]);
      expect(JSON.parse(json)).toEqual({ ...JSON.parse(previousJson), owner });
    }

    // Repeat Doctor runs find nothing to do and leave the rows byte-identical.
    expect(await collectHeartbeatCadenceMigrationFindings(retired, f.env)).toEqual([]);
    await maybeMigrateHeartbeatCadenceToCron({ cfg: retired, env: f.env, shouldRepair: true });
    await retireHeartbeatWithDoctor(retired, f.env);
    expect(readRows(f)).toEqual(after);
  });

  it("keeps an existing owner record", async () => {
    const f = fixture();
    const { retired, job } = await migrateWithoutOwner(f);
    writeJob(f, { ...job, owner: { agentId: "main" } });
    await recordRoomTurn(f);
    const before = readRows(f);

    expect(await collectHeartbeatCadenceMigrationFindings(retired, f.env)).toEqual([]);
    await retireHeartbeatWithDoctor(retired, f.env);
    expect(readRows(f)).toEqual(before);
  });

  it.each([
    [
      "no recorded account",
      (f: Fixture) =>
        writeRoomDelivery(f, { context: { channel: "discord", to: `channel:${ROOM_ID}` } }),
      "that room's session has no recorded discord account",
    ],

    [
      "another channel's route",
      (f: Fixture) =>
        writeRoomDelivery(f, {
          context: { channel: "slack", to: "channel:C1", accountId: "default" },
        }),
      "that room's session has no recorded discord account",
    ],
    ["no session record", async () => {}, "that room's session has no recorded discord account"],
  ] as const)("refuses a room with %s and writes nothing", async (_name, record, reason) => {
    const f = fixture();
    const { retired, job } = await migrateWithoutOwner(f);
    await record(f);
    const before = readRows(f);

    expect(await collectHeartbeatCadenceMigrationFindings(retired, f.env)).toEqual([
      expect.objectContaining({
        severity: "warning",
        requirement: "heartbeat-owner-unproven",
        message: expect.stringContaining(
          `Automation ${job.id} runs in room ${ROOM}, but ${reason}`,
        ),
      }),
    ]);
    await maybeMigrateHeartbeatCadenceToCron({ cfg: retired, env: f.env, shouldRepair: true });
    await retireHeartbeatWithDoctor(retired, f.env);
    expect(readRows(f)).toEqual(before);
  });

  // The room record keeps only its latest turn's account, so other account evidence must agree.
  it.each([
    [
      "a second configured account",
      { default: {}, work: {} },
      undefined,
      "more than one configured account",
    ],
    ["a different configured account", { work: {} }, undefined, "name more than one account"],
    ["a different delivery account", undefined, "work", "name more than one account"],
  ] as const)(
    "refuses a room turn whose account meets %s",
    async (_name, accounts, delivery, reason) => {
      const f = fixture();
      const { retired, job } = await migrateWithoutOwner(f);
      if (delivery) {
        writeJob(f, {
          ...job,
          delivery: { ...job.delivery, mode: "announce", accountId: delivery },
        });
      }
      await recordRoomTurn(f, "default");
      const cfg = accounts ? { ...retired, channels: { discord: { accounts } } } : retired;

      expect(await collectHeartbeatCadenceMigrationFindings(cfg, f.env)).toEqual([
        expect.objectContaining({
          requirement: "heartbeat-owner-unproven",
          message: expect.stringContaining(reason),
        }),
      ]);
    },
  );

  it("reports an unreadable room session instead of failing the cutover check", async () => {
    const f = fixture();
    const { retired, job } = await migrateWithoutOwner(f);
    roomRead.onRead = (sessionKey) => {
      if (sessionKey === ROOM) {
        throw new Error("fixture: agent database unreadable");
      }
    };

    expect(await collectHeartbeatCadenceMigrationFindings(retired, f.env)).toEqual([
      expect.objectContaining({
        severity: "warning",
        requirement: "heartbeat-owner-unproven",
        message: expect.stringContaining(
          `Automation ${job.id} runs in room ${ROOM}, but that room's session could not be read (fixture: agent database unreadable)`,
        ),
      }),
    ]);
  });

  it.each([
    ["the agent main session", { every: "30m" }, "session:agent:main:main"],
    [
      "an isolated run",
      { every: "30m", session: `discord:channel:${ROOM_ID}`, isolatedSession: true },
      "isolated",
    ],
    [
      "a direct conversation",
      { every: "30m", session: "discord:direct:42" },
      "session:agent:main:discord:direct:42",
    ],
  ] as const)(
    "leaves a heartbeat in %s ownerless, with its reason",
    async (_name, heartbeat, target) => {
      const f = fixture(heartbeat);
      await recordRoomTurn(f);
      await recordRoomTurn(f, "default", "agent:main:discord:direct:42");
      const { retired, job } = await migrateWithoutOwner(f);
      expect(job.sessionTarget).toBe(target);
      const before = readRows(f);

      const { planHeartbeatOwnerBackfill } = await import("./doctor-heartbeat-owner.js");
      expect(await planHeartbeatOwnerBackfill(retired, f.storePath, f.env)).toEqual({
        stamps: [],
        refusals: [
          {
            jobId: job.id,
            room: false,
            reason: expect.stringContaining(`runs in ${target}, not one room conversation`),
          },
        ],
      });
      expect(await collectHeartbeatCadenceMigrationFindings(retired, f.env)).toEqual([]);
      await retireHeartbeatWithDoctor(retired, f.env);
      expect(readRows(f)).toEqual(before);
    },
  );

  it("refuses a current-conversation target", async () => {
    const f = fixture();
    const { retired, job } = await migrateWithoutOwner(f);
    writeJob(f, { ...job, sessionTarget: "current" });
    await recordRoomTurn(f);

    const { planHeartbeatOwnerBackfill } = await import("./doctor-heartbeat-owner.js");
    expect((await planHeartbeatOwnerBackfill(retired, f.storePath, f.env)).refusals).toEqual([
      expect.objectContaining({ jobId: job.id, room: false }),
    ]);
  });

  it("refuses the stamp when the heartbeat is edited while Doctor reads its room", async () => {
    const f = fixture();
    const { retired, job } = await migrateWithoutOwner(f);
    await recordRoomTurn(f);
    let edits = 0;
    // Every room read lands an operator edit, so each plan is stale by its write.
    roomRead.onRead = (sessionKey) => {
      if (sessionKey === ROOM && job.payload.kind === "agentTurn") {
        writeJob(f, { ...job, payload: { ...job.payload, message: `edit ${++edits}` } });
      }
    };

    await expect(retireHeartbeatWithDoctor(retired, f.env)).rejects.toThrow(
      `Automation ${job.id} changed while Doctor was proving its owner; no owner was recorded.`,
    );
    roomRead.onRead = undefined;
    const [after] = readJobs(f);
    expect(after?.owner).toBeUndefined();
    expect(after?.payload).toMatchObject({ message: `edit ${edits}` });
  });
});
