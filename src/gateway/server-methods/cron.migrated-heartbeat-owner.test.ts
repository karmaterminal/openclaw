import path from "node:path";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import { recordInboundSession } from "../../channels/session.js";
import { ensureHeartbeatMonitorJobs } from "../../commands/doctor-heartbeat-cadence-migration.js";
import {
  maybeMigrateHeartbeatCadenceToCron,
  retireHeartbeatWithDoctor,
} from "../../commands/doctor-heartbeat-retirement.js";
import { maybeRepairLegacyCronStore } from "../../commands/doctor/cron/index.js";
import type { OpenClawConfigWithLegacyRoster } from "../../config/legacy.roster.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import {
  loadCronStore,
  resolveCronJobsStorePathFromConfig,
  saveCronStore,
} from "../../cron/store.js";
import type { CronJob, CronJobPatch } from "../../cron/types.js";
import { resetPluginRuntimeStateForTest } from "../../plugins/runtime.js";
import { closeOpenClawAgentDatabasesForTest } from "../../state/openclaw-agent-db.js";
import {
  closeOpenClawStateDatabaseAsync,
  closeOpenClawStateDatabaseForTest,
} from "../../state/openclaw-state-db.js";
import { readCronCallerScope } from "./cron-caller-scope.js";
import { resolveCronScopedToolEditRefusal } from "./cron-job-access.js";
import { createReadService } from "./cron-read.test-support.js";
import {
  createCronCallerClient,
  createCronTestContext,
  createCronTestInvoker,
  setCronValidationTestRegistry,
} from "./cron.validation.test-support.js";

const getRuntimeConfig = vi.hoisted(() =>
  vi.fn<() => OpenClawConfig>(() => ({}) as OpenClawConfig),
);
vi.mock("../../config/config.js", async () => ({
  ...(await vi.importActual<typeof import("../../config/config.js")>("../../config/config.js")),
  getRuntimeConfig,
}));
vi.mock("../../cron/inference-binding.runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../cron/inference-binding.runtime.js")>()),
  captureCronInferenceBinding: async () => undefined,
}));
vi.mock("../../cron/delivery-preview.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../cron/delivery-preview.js")>()),
  resolveCronDeliveryFailurePreview: async () => undefined,
  resolveCronDeliveryPreview: async () => ({ label: "x", detail: "x" }),
  resolveCronDeliveryPreviews: async ({ jobs }: { jobs: Array<{ id: string }> }) =>
    Object.fromEntries(jobs.map((job) => [job.id, { label: "x", detail: "x" }])),
}));

import { cronHandlers } from "./cron.js";

const invokeCron = createCronTestInvoker(cronHandlers, getRuntimeConfig);
const ROOM_ID = "1466192485440164011";
const ROOM = `agent:main:discord:channel:${ROOM_ID}`;
const OTHER_ROOM = "agent:main:discord:channel:2";
const PROMPT: CronJobPatch = { payload: { kind: "agentTurn", message: "Check the queue." } };
const TOOLS: CronJobPatch = {
  payload: {
    kind: "agentTurn",
    toolsAllow: ["read", "write", "continue_work", "continue_delegate"],
  },
};
const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    resetPluginRuntimeStateForTest();
    closeOpenClawAgentDatabasesForTest();
    await closeOpenClawStateDatabaseAsync();
    closeOpenClawStateDatabaseForTest();
    vi.unstubAllEnvs();
    cleanup();
  }),
);

beforeEach(() => {
  getRuntimeConfig.mockReset().mockReturnValue({ agents: { entries: { main: {} } } });
  setCronValidationTestRegistry();
});

/** A seat cut over before owner stamping, whose prince has since spoken in his room. */
async function migratedSeat() {
  const root = tempDirs.make("openclaw-migrated-heartbeat-owner-");
  const env = { ...process.env, HOME: path.join(root, "home"), OPENCLAW_STATE_DIR: root };
  vi.stubEnv("HOME", env.HOME);
  vi.stubEnv("OPENCLAW_STATE_DIR", root);
  const cfg: OpenClawConfigWithLegacyRoster = {
    agents: {
      defaults: { heartbeat: { every: "30m", session: `discord:channel:${ROOM_ID}` } },
      list: [{ id: "main", workspace: path.join(root, "workspace") }],
    },
  };
  await ensureHeartbeatMonitorJobs(cfg, resolveCronJobsStorePathFromConfig(cfg, env), env);
  const retired = await retireHeartbeatWithDoctor(cfg, env);
  // The real inbound recorder writes the turn's ctx.AccountId, which also becomes the room
  // turn's turnSourceAccountId (agentAccountId = replyRoute.accountId = ctx.AccountId).
  const to = `channel:${ROOM_ID}`;
  await recordInboundSession({
    storePath: resolveSessionStorePathCore(undefined, { agentId: "main", env }),
    sessionKey: ROOM,
    ctx: {
      SessionKey: ROOM,
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      OriginatingTo: to,
      To: to,
      AccountId: "default",
      ChatType: "channel",
    },
    updateLastRoute: { sessionKey: ROOM, channel: "discord", to, accountId: "default" },
    onRecordError: (error) => {
      throw error;
    },
  });
  const storePath = resolveCronJobsStorePathFromConfig(retired, env);
  const [job] = (await loadCronStore(storePath)).jobs;
  expect(job).toMatchObject({ sessionTarget: `session:${ROOM}`, sessionKey: ROOM });
  return { env, retired, storePath, jobId: job!.id };
}

function serve(storePath: string) {
  const cron = createReadService({
    storePath,
    cronEnabled: false,
    defaultAgentId: "main",
    enqueueSystemEvent: vi.fn(),
    runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" as const })),
  });
  onTestFinished(() => cron.stop());
  const context = createCronTestContext(undefined, getRuntimeConfig);
  context.cron.readJob.mockImplementation((id) => cron.readJob(id));
  context.cron.getJob.mockImplementation((id) => cron.getJob(id));
  context.cron.getDefaultAgentId.mockImplementation(() => "main");
  context.cron.updateWithPrecondition.mockImplementation((...args) =>
    cron.updateWithPrecondition(...args),
  );
  return context;
}

/** A Discord room turn's automations tool call, as the Gateway authenticates it. */
function roomTurn(sessionKey: string, accountId: string) {
  const client = createCronCallerClient("main", accountId, sessionKey);
  client.internal!.agentRuntimeIdentity!.turnSourceChannel = "discord";
  return client;
}

async function update(
  context: ReturnType<typeof serve>,
  id: string,
  patch: CronJobPatch,
  client: ReturnType<typeof roomTurn>,
) {
  const { respond } = await invokeCron("cron.update", { id, patch }, { context, client });
  const [ok, , error] = respond.mock.calls[0] ?? [];
  return { ok: ok === true, message: String(error?.message ?? "") };
}

function refusal(job: CronJob, patch: CronJobPatch, client: ReturnType<typeof roomTurn>) {
  const nextJob = { ...job, payload: { ...job.payload, ...patch.payload } } as CronJob;
  return resolveCronScopedToolEditRefusal({
    job,
    nextJob,
    patch,
    callerScope: readCronCallerScope(client),
  });
}

it("lets only the prince's own room turn edit his heartbeat once Doctor records its owner", async () => {
  const { env, retired, storePath, jobId } = await migratedSeat();
  const own = roomTurn(ROOM, "default");

  // Today's seats: the room turn is refused because the migrated job has no owner.
  expect(await update(serve(storePath), jobId, PROMPT, own)).toEqual({
    ok: false,
    message: expect.stringContaining("no recorded owner"),
  });

  await maybeMigrateHeartbeatCadenceToCron({ cfg: retired, env, shouldRepair: true });
  const backfilled = (await loadCronStore(storePath)).jobs.find((job) => job.id === jobId)!;
  expect(backfilled.owner).toEqual({ agentId: "main", sessionKey: ROOM, accountId: "default" });

  const context = serve(storePath);
  for (const [stranger, expected] of [
    [roomTurn(ROOM, "work"), "belongs to another conversation or account"],
    [roomTurn(OTHER_ROOM, "default"), "belongs to another conversation or account"],
  ] as const) {
    for (const patch of [PROMPT, TOOLS]) {
      expect(refusal(backfilled, patch, stranger)).toContain(expected);
      expect((await update(context, jobId, patch, stranger)).ok).toBe(false);
    }
  }
  expect((await loadCronStore(storePath)).jobs.find((job) => job.id === jobId)).toEqual(backfilled);

  for (const patch of [PROMPT, TOOLS]) {
    expect(refusal(backfilled, patch, own)).toBeUndefined();
    expect(await update(context, jobId, patch, own)).toEqual({ ok: true, message: "" });
  }
  const edited = (await loadCronStore(storePath)).jobs.find((job) => job.id === jobId)!;
  expect(edited.payload).toMatchObject({
    kind: "agentTurn",
    message: "Check the queue.",
    toolsAllow: ["read", "write", "continue_work", "continue_delegate"],
  });
  expect(edited.owner).toEqual(backfilled.owner);
});

it("keeps a tool-capped heartbeat editable by its room after Doctor scopes its authority", async () => {
  const { env, retired, storePath, jobId } = await migratedSeat();
  const store = await loadCronStore(storePath);
  const heartbeat = store.jobs.find((job) => job.id === jobId)!;
  // Seats whose legacy monitor carried a tool cap: unset policy, cap kept, no owner.
  expect(heartbeat.payload.kind).toBe("agentTurn");
  Object.assign(heartbeat.payload, { toolsAllow: ["read", "continue_work"] });
  await saveCronStore(storePath, store);

  await maybeMigrateHeartbeatCadenceToCron({ cfg: retired, env, shouldRepair: true });
  await maybeRepairLegacyCronStore({
    cfg: retired,
    options: { repair: true, yes: true },
    prompter: { confirm: async () => true },
  });
  const scoped = (await loadCronStore(storePath)).jobs.find((job) => job.id === jobId)!;
  expect(scoped).toMatchObject({
    owner: { agentId: "main", sessionKey: ROOM, accountId: "default" },
    scheduledToolPolicy: {
      version: 1,
      mode: "account",
      ownerSessionKey: ROOM,
      ownerAccountId: "default",
    },
  });

  const context = serve(storePath);
  for (const stranger of [roomTurn(ROOM, "work"), roomTurn(OTHER_ROOM, "default")]) {
    expect((await update(context, jobId, TOOLS, stranger)).ok).toBe(false);
  }
  expect(await update(context, jobId, TOOLS, roomTurn(ROOM, "default"))).toEqual({
    ok: true,
    message: "",
  });
  expect(
    (await loadCronStore(storePath)).jobs.find((job) => job.id === jobId)?.payload,
  ).toMatchObject({ toolsAllow: ["read", "write", "continue_work", "continue_delegate"] });
});
