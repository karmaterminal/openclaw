/**
 * Doctor-owned conversation owner for the heartbeat automations it generates. Only a job that
 * runs in one room conversation of its own agent, whose session recorded exactly one account,
 * gets an owner: that is the identity a room turn presents to `cron.update`.
 */
import { listAgentIds } from "../agents/agent-scope-config.js";
import { resolveSessionStorePathCore } from "../config/sessions/paths.js";
import { readSessionEntryReadOnlyInWorker } from "../config/sessions/session-entry-read-runtime.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveCronJobConfigRevision } from "../cron/config-revision.js";
import { readDefaultProactiveJobReceiptInDatabase } from "../cron/proactive-job-receipt.js";
import { publishCronJobsStoreMutation } from "../cron/store.js";
import { resolveCronStoreKeyInDatabase } from "../cron/store/paths.js";
import { loadCronRows, upsertCronJobRow } from "../cron/store/row-codec.js";
import type { CronStoredJob as CronJob } from "../cron/types.js";
import { normalizeOptionalAccountId } from "../routing/account-id.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { parseAgentSessionKey, parseSessionDeliveryRoute } from "../sessions/session-key-utils.js";
import { withExistingOpenClawStateDatabaseArtifactPreservingReadOnlyAsync } from "../state/openclaw-state-db-readonly.js";
import { runOpenClawStateWriteTransaction } from "../state/openclaw-state-db.js";
import {
  deliveryContextFromSession,
  sessionDeliveryOrigin,
  sessionDeliveryRoute,
} from "../utils/delivery-context.read.js";
import { decodeDoctorHeartbeatJobRows } from "./doctor-heartbeat-jobs.js";

type HeartbeatOwner = { agentId: string; sessionKey: string; accountId: string };

type HeartbeatOwnerProof =
  | { kind: "owner"; owner: HeartbeatOwner }
  | { kind: "refused"; room: boolean; reason: string };

export type HeartbeatOwnerBackfillPlan = {
  stamps: Array<{ job: CronJob; owner: HeartbeatOwner }>;
  refusals: Array<{ jobId: string; room: boolean; reason: string }>;
};

function resolveRoom(sessionKey: string | undefined) {
  const route = parseSessionDeliveryRoute(sessionKey);
  return route?.peerKind === "channel" || route?.peerKind === "group" ? route : undefined;
}

/** Reads only a room's session record; other targets cannot prove an owner. */
export async function readHeartbeatRoomSessionEntry(
  cfg: OpenClawConfig,
  agentId: string,
  sessionKey: string | undefined,
  env: NodeJS.ProcessEnv,
): Promise<SessionEntry | undefined> {
  if (!sessionKey || !resolveRoom(sessionKey)) {
    return undefined;
  }
  return await readSessionEntryReadOnlyInWorker({
    agentId,
    storePath: resolveSessionStorePathCore(cfg.session?.store, { agentId, env }),
    sessionKey,
    env,
    projection: "list",
  });
}

/**
 * `readCronCallerScope` takes a room turn's session key and `normalizeAccountId(ctx.AccountId)`;
 * inbound turns record that same account in the room's delivery route, context and origin.
 */
export function proveHeartbeatRoomOwner(
  job: Pick<CronJob, "id" | "agentId" | "sessionTarget" | "sessionKey">,
  entry: Pick<SessionEntry, "delivery"> | undefined,
): HeartbeatOwnerProof {
  const target = job.sessionTarget.trim();
  const sessionKey = target.startsWith("session:") ? target.slice(8).trim() : undefined;
  const sessionAgentId = parseAgentSessionKey(sessionKey)?.agentId;
  const room = resolveRoom(sessionKey);
  if (
    !sessionKey ||
    sessionKey !== job.sessionKey?.trim() ||
    !job.agentId ||
    !sessionAgentId ||
    normalizeAgentId(sessionAgentId) !== normalizeAgentId(job.agentId) ||
    !room
  ) {
    return {
      kind: "refused",
      room: false,
      reason: `Automation ${job.id} runs in ${target}, not one room conversation of agent ${job.agentId ?? "(none)"}, so Doctor leaves it without an owner; only a Gateway owner or an operator can change its prompt or tools.`,
    };
  }
  const route = sessionDeliveryRoute(entry);
  const accountIds = new Set(
    (route?.channel === room.channel
      ? [
          route.accountId,
          deliveryContextFromSession(entry)?.accountId,
          sessionDeliveryOrigin(entry)?.accountId,
        ]
      : []
    ).flatMap((value) => {
      const accountId = normalizeOptionalAccountId(value);
      return accountId ? [accountId] : [];
    }),
  );
  const [accountId] = accountIds;
  if (!accountId || accountIds.size !== 1) {
    return {
      kind: "refused",
      room: true,
      reason: `Automation ${job.id} runs in room ${sessionKey}, but that room's session ${accountIds.size > 1 ? "recorded more than one account" : `has no recorded ${room.channel} account`}, so Doctor cannot prove its owner.`,
    };
  }
  return {
    kind: "owner",
    owner: { agentId: normalizeAgentId(job.agentId), sessionKey, accountId },
  };
}

/** Ownerless default heartbeats named by a cutover receipt, with each room's proof. */
export async function planHeartbeatOwnerBackfill(
  cfg: OpenClawConfig,
  storePath: string,
  env: NodeJS.ProcessEnv,
): Promise<HeartbeatOwnerBackfillPlan> {
  const candidates =
    (await withExistingOpenClawStateDatabaseArtifactPreservingReadOnlyAsync(
      ({ db }) => {
        const storeKey = resolveCronStoreKeyInDatabase(db, storePath, env);
        const jobs = decodeDoctorHeartbeatJobRows(loadCronRows(db, storeKey));
        const agentIds = new Set([
          ...listAgentIds(cfg),
          ...jobs.flatMap((job) => (job.agentId ? [job.agentId] : [])),
        ]);
        return [...agentIds].flatMap((agentId): CronJob[] => {
          const jobId = readDefaultProactiveJobReceiptInDatabase(db, storeKey, agentId)?.jobId;
          const job = jobs.find((candidate) => candidate.id === jobId);
          // An existing owner, even a partial one, is the creator's record and stays.
          return job && job.owner === undefined && job.payload.kind === "agentTurn"
            ? [{ ...job, payload: job.payload }]
            : [];
        });
      },
      { env },
    )) ?? [];
  const plan: HeartbeatOwnerBackfillPlan = { stamps: [], refusals: [] };
  for (const job of candidates) {
    const sessionKey = job.sessionKey?.trim();
    const entry = job.agentId
      ? await readHeartbeatRoomSessionEntry(cfg, normalizeAgentId(job.agentId), sessionKey, env)
      : undefined;
    const proof = proveHeartbeatRoomOwner(job, entry);
    if (proof.kind === "owner") {
      plan.stamps.push({ job, owner: proof.owner });
    } else {
      plan.refusals.push({ jobId: job.id, room: proof.room, reason: proof.reason });
    }
  }
  return plan;
}

/** All or nothing: a definition edited after planning refuses every stamp. */
export function applyHeartbeatOwnerBackfill(
  plan: HeartbeatOwnerBackfillPlan,
  storePath: string,
  env: NodeJS.ProcessEnv,
): number {
  if (plan.stamps.length === 0) {
    return 0;
  }
  return runOpenClawStateWriteTransaction(
    ({ db }) => {
      const storeKey = resolveCronStoreKeyInDatabase(db, storePath, env);
      const rows = loadCronRows(db, storeKey);
      const jobs = decodeDoctorHeartbeatJobRows(rows);
      for (const { job, owner } of plan.stamps) {
        const current = jobs.find((candidate) => candidate.id === job.id);
        // The config revision ignores scheduler state, so a live run does not block the stamp.
        if (
          current?.payload.kind !== "agentTurn" ||
          resolveCronJobConfigRevision({ ...current, payload: current.payload }) !==
            resolveCronJobConfigRevision(job)
        ) {
          throw new Error(
            `Automation ${job.id} changed while Doctor was proving its owner; no owner was recorded. Rerun openclaw doctor --fix.`,
          );
        }
        upsertCronJobRow(
          db,
          storeKey,
          { ...current, payload: current.payload, owner },
          rows.find((row) => row.job_id === job.id)!.sort_order,
          { preserveRuntimeState: true },
        );
      }
      publishCronJobsStoreMutation(storeKey, db);
      return plan.stamps.length;
    },
    { env },
    { operationLabel: "doctor.heartbeat-owner-backfill" },
  );
}
