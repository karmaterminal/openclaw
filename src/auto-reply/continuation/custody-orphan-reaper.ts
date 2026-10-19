// Orphaned continuation custody (karmaterminal/openclaw#1469). A queued
// delegate or staged post-compaction record whose dispatcher is gone would
// otherwise stay `queued` forever: the retention prune only deletes terminal
// records. This is the one owner of the "nothing will ever dispatch this"
// decision. Gateway boot, the custody retention interval and delegate recovery
// all ask it. Records are failed through the delegate store, never deleted, and
// the owner (or its parent) gets one durable notice.
import { getRuntimeConfig } from "../../config/config.js";
import { collectCanonicalSessionLookupKeys } from "../../config/sessions/main-session-key.js";
import { resolveSessionStorePathCore } from "../../config/sessions/paths.js";
import { readResolvedSessionEntryInWorker } from "../../config/sessions/session-accessor.entry.js";
import { readExactSessionEntryAvailabilityInWorker } from "../../config/sessions/session-entry-presence-read.js";
import { isTerminalSessionStatus, type SessionEntry } from "../../config/sessions/types.js";
import { resolveSessionStoreIdentity } from "../../gateway/session-store-key.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { enqueueSessionDeliveryWithStatus } from "../../infra/session-delivery-queue-storage.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  isCronRunSessionKey,
  isSubagentSessionKey,
  parseAgentSessionKey,
} from "../../sessions/session-key-utils.js";
import { surfaceDurableContinuationNotice } from "./continuation-notice-surface.js";
import { hasDelegateDispatchHedge } from "./delegate-dispatch-hedge.js";
import {
  decodeDelegateState,
  delegateDueAt,
  type DelegateCustodyRecord,
  listDelegateRecords,
  updateDelegateRecord,
} from "./delegate-flow-store.js";
import { formatDelegateTaskForSystemEvent } from "./delegate-system-event.js";
import {
  classifyPostCompactionDelegateAge,
  formatPostCompactionStaleRejection,
} from "./post-compaction-staleness.js";
import { captureContinuationQueueContext } from "./queue-context.js";

const log = createSubsystemLogger("continuation/orphan-reaper");

/**
 * A queued delegate left this long past its due time while a dispatcher was
 * running is reaped even when its owner is alive: no dispatcher that still
 * exists would leave it that long. Policy proposed in #1469; it is not yet
 * confirmed.
 */
export const CONTINUATION_DELEGATE_ORPHAN_CUTOFF_MS = 24 * 60 * 60 * 1000;

/** Nothing is reaped until it has been due (or staged) at least this long. */
export const CONTINUATION_ORPHAN_REAP_GRACE_MS = 60 * 60 * 1000;

export const CONTINUATION_ORPHAN_REAPED_NOTICE_TAG = "[continuation:delegate-orphan-reaped]";
const REAPED_PHASE = "Reaped: no dispatcher";

/**
 * What the reaper may conclude about an owner session. Only `missing` (no
 * session row at all) and `ended` (a cron run or subagent in a terminal status)
 * count as gone. An unreadable row, including `entry_valid=-1`, is `unknown`
 * and never counts as gone; only the overdue cutoff can reap its rows.
 */
type OwnerState =
  | { kind: "live"; entry: SessionEntry }
  | { kind: "ended"; entry: SessionEntry; status: string }
  | { kind: "missing" }
  | { kind: "unknown" };

type OwnerFacts = { state: OwnerState; noticeTarget?: string };

async function readOwnerEntry(sessionKey: string): Promise<SessionEntry | undefined | "unknown"> {
  const cfg = getRuntimeConfig();
  const agentId = parseAgentSessionKey(sessionKey)?.agentId;
  try {
    const entry = await readResolvedSessionEntryInWorker({ cfg, sessionKey, agentId });
    if (entry) {
      return entry;
    }
    // The logical read cannot tell an absent row from an unreadable one; the
    // exact-key probe can, and only an absent row means the session is gone.
    // The probe must cover every row the logical read looked at. A templated
    // store also searches discovered per-agent targets the probe cannot see.
    if (cfg.session?.store?.includes("{agentId}")) {
      return "unknown";
    }
    const requestedKey = sessionKey.trim();
    const identity = resolveSessionStoreIdentity({ cfg, sessionKey: requestedKey, agentId });
    const storePath = resolveSessionStorePathCore(cfg.session?.store, {
      agentId: identity.agentId,
    });
    for (const lookupKey of collectCanonicalSessionLookupKeys({
      agentId: identity.agentId,
      canonicalKey: identity.canonicalKey,
      requestedKey,
      mainKey: cfg.session?.mainKey,
    })) {
      const exact = await readExactSessionEntryAvailabilityInWorker({
        agentId: identity.agentId,
        clone: false,
        sessionKey: lookupKey,
        storePath,
      });
      if (!exact.found) {
        return "unknown";
      }
      if (exact.value) {
        return exact.value.entry;
      }
    }
    return undefined;
  } catch (err) {
    log.warn(
      `[continuation:orphan-reap-owner-read-failed] session=${sessionKey} error=${formatErrorMessage(err)}`,
    );
    return "unknown";
  }
}

/**
 * Only a recorded end counts. Age is no evidence: a subagent with no timeout
 * may legitimately run for hours, and its queued delegates are still drained
 * by its announce.
 */
async function subagentRunEnded(sessionKey: string): Promise<boolean> {
  const [{ getLatestSubagentRunByChildSessionKey }, { hasSubagentRunEnded }] = await Promise.all([
    import("../../agents/subagents/registry/subagent-registry-read.js"),
    import("../../agents/subagents/registry/subagent-run-liveness.js"),
  ]);
  const run = await getLatestSubagentRunByChildSessionKey(sessionKey);
  return run ? hasSubagentRunEnded(run) : false;
}

async function resolveOwnerState(sessionKey: string): Promise<OwnerState> {
  const entry = await readOwnerEntry(sessionKey);
  if (entry === "unknown") {
    return { kind: "unknown" };
  }
  if (!entry) {
    return { kind: "missing" };
  }
  const isCronRun = isCronRunSessionKey(sessionKey);
  const isSubagent = isSubagentSessionKey(sessionKey);
  // `interrupted` can still be resumed by restart recovery, whose announce
  // would drain the queue, so it is not an ended owner, whatever its run says.
  if (entry.status === "interrupted") {
    return { kind: "live", entry };
  }
  if ((isCronRun || isSubagent) && isTerminalSessionStatus(entry.status)) {
    return { kind: "ended", entry, status: entry.status };
  }
  if (isSubagent && (await subagentRunEnded(sessionKey))) {
    return { kind: "ended", entry, status: "run-ended" };
  }
  return { kind: "live", entry };
}

async function resolveNoticeTarget(
  sessionKey: string,
  state: OwnerState,
): Promise<string | undefined> {
  if (state.kind === "live" || state.kind === "unknown") {
    return sessionKey;
  }
  if (state.kind === "ended") {
    return state.entry.parentSessionKey ?? state.entry.spawnedBy;
  }
  if (!isSubagentSessionKey(sessionKey)) {
    return undefined;
  }
  const { resolveRequesterForChildSession } =
    await import("../../agents/subagents/registry/subagent-registry-read.js");
  return (await resolveRequesterForChildSession(sessionKey))?.requesterSessionKey;
}

function describeOwnerGone(state: OwnerState): string | undefined {
  if (state.kind === "missing") {
    return "its owner session is missing";
  }
  if (state.kind === "ended") {
    return `its owner run has ended (${state.status})`;
  }
  return undefined;
}

/**
 * The earliest a record can be reaped: delegates start their grace at their
 * due time, staged records at staging. Owner-dependent rules may wait longer.
 */
function isPastGrace(record: DelegateCustodyRecord, now: number): boolean {
  const state = decodeDelegateState(record);
  const startedAt =
    record.kind === "delegate" && state ? delegateDueAt(record, state) : record.createdAt;
  return startedAt <= now - CONTINUATION_ORPHAN_REAP_GRACE_MS;
}

/**
 * Why a queued record past its grace can never be dispatched, or undefined to
 * leave it. `aliveSince` is when this process's dispatchers started: time the
 * Gateway was down never counts against a delegate a live owner, or boot
 * recovery, may still dispatch. A missing owner has no dispatcher in any
 * process, so only its due time matters.
 */
function orphanReason(
  record: DelegateCustodyRecord,
  owner: OwnerState,
  now: number,
  aliveSince: number,
): string | undefined {
  const state = decodeDelegateState(record);
  if (!state) {
    // Undecodable state belongs to the recovery classifier, which records why.
    return undefined;
  }
  if (record.kind === "delegate") {
    // An armed hedge is a live dispatcher for every queued row of its owner.
    if (hasDelegateDispatchHedge(record.ownerSessionKey)) {
      return undefined;
    }
    if (owner.kind === "missing") {
      return `Continuation delegate was never dispatched: ${describeOwnerGone(owner)}.`;
    }
    const overdueMs = now - Math.max(delegateDueAt(record, state), aliveSince);
    if (owner.kind === "ended" && overdueMs >= CONTINUATION_ORPHAN_REAP_GRACE_MS) {
      return `Continuation delegate was never dispatched: ${describeOwnerGone(owner)}.`;
    }
    return overdueMs > CONTINUATION_DELEGATE_ORPHAN_CUTOFF_MS
      ? `Continuation delegate was never dispatched: overdue by ${overdueMs}ms.`
      : undefined;
  }
  // A main session that ended a run still compacts later; only a missing owner
  // or a finished subagent has no later compaction seam to release this row.
  if (
    owner.kind === "missing" ||
    (owner.kind === "ended" && isSubagentSessionKey(record.ownerSessionKey))
  ) {
    return `Staged post-compaction delegate was never released: ${describeOwnerGone(owner)}.`;
  }
  const staleness = classifyPostCompactionDelegateAge(
    { firstArmedAt: state.firstArmedAt, createdAt: record.createdAt },
    now,
  );
  return staleness.stale ? formatPostCompactionStaleRejection(staleness.ageMs) : undefined;
}

function buildReapedNoticeText(params: {
  ownerSessionKey: string;
  task: string;
  reason: string;
}): string {
  return [
    CONTINUATION_ORPHAN_REAPED_NOTICE_TAG,
    `A continuation delegate queued by ${params.ownerSessionKey} was stopped without running. ${params.reason}`,
    `Task: ${formatDelegateTaskForSystemEvent(params.task)}`,
    "Issue a new continue_delegate if the work is still needed.",
  ].join("\n");
}

/**
 * The failed record and its notice are separate commits. A crash between them
 * loses only the notice; the record stays failed and the warn log remains.
 * Accepted rather than adding a notice obligation to the custody schema.
 */
async function deliverReapedNotice(params: {
  record: DelegateCustodyRecord;
  target: string;
  reason: string;
}): Promise<void> {
  const text = buildReapedNoticeText({
    ownerSessionKey: params.record.ownerSessionKey,
    task: decodeDelegateState(params.record)?.task ?? "",
    reason: params.reason,
  });
  const enqueued = await enqueueSessionDeliveryWithStatus(
    {
      kind: "systemEvent",
      sessionKey: params.target,
      text,
      idempotencyKey: `continuation-orphan-reaped:record:${params.record.recordId}`,
      awaitPromptAdoption: true,
    },
    captureContinuationQueueContext(),
  );
  const ownerAgentId = parseAgentSessionKey(params.target)?.agentId;
  await surfaceDurableContinuationNotice({
    entryId: enqueued.id,
    entryStatus: enqueued.status,
    sessionKey: params.target,
    ...(ownerAgentId ? { ownerAgentId } : {}),
    text,
    reason: "continuation-delegate-orphan-reaped",
  });
}

/**
 * Fail every queued delegate and staged post-compaction record that nothing
 * will dispatch. `aliveSince` is this Gateway's boot cutoff, so downtime never
 * counts as overdue. Running records are never touched: their claims are
 * settled by recovery from `subagent_runs`.
 */
export async function reapOrphanedContinuationCustody(options: {
  aliveSince: number;
  now?: number;
}): Promise<{ reaped: number }> {
  const now = options.now ?? Date.now();
  const queued = (await listDelegateRecords({ statuses: ["queued"] })).filter(
    (record) => record.cancelRequestedAt === undefined,
  );
  const owners = new Map<string, Promise<OwnerFacts>>();
  const factsFor = (sessionKey: string): Promise<OwnerFacts> => {
    let facts = owners.get(sessionKey);
    if (!facts) {
      facts = (async () => {
        try {
          const state = await resolveOwnerState(sessionKey);
          return { state, noticeTarget: await resolveNoticeTarget(sessionKey, state) };
        } catch (err) {
          // An owner that cannot be read is unknown, never gone: only the
          // overdue cutoff can reap its rows.
          log.warn(
            `[continuation:orphan-reap-owner-failed] session=${sessionKey} error=${formatErrorMessage(err)}`,
          );
          return { state: { kind: "unknown" }, noticeTarget: sessionKey };
        }
      })();
      owners.set(sessionKey, facts);
    }
    return facts;
  };
  let reaped = 0;
  for (const record of queued) {
    // A record inside its grace never costs an owner read.
    if (!isPastGrace(record, now)) {
      continue;
    }
    const owner = await factsFor(record.ownerSessionKey);
    const reason = orphanReason(record, owner.state, now, options.aliveSince);
    if (!reason) {
      continue;
    }
    // The write is fenced on the listed revision, so it applies only the
    // reaper's own queued -> failed transition. A row another path claimed or
    // failed meanwhile is that path's outcome: not counted, no reaped notice.
    let failed: Awaited<ReturnType<typeof updateDelegateRecord>>;
    try {
      failed = await updateDelegateRecord({
        record,
        patch: { status: "failed", phase: REAPED_PHASE, failureReason: reason },
      });
    } catch (err) {
      // The row stays queued for the next pass; the rest of the sweep goes on.
      log.warn(
        `[continuation:orphan-reap-record-failed] flowId=${record.recordId} session=${record.ownerSessionKey} error=${formatErrorMessage(err)}`,
      );
      continue;
    }
    if (!failed.applied) {
      continue;
    }
    reaped += 1;
    log.warn(
      `[continuation:delegate-orphan-reaped] flowId=${record.recordId} kind=${record.kind} session=${record.ownerSessionKey} owner=${owner.state.kind} notice=${owner.noticeTarget ?? "none"} reason=${reason}`,
    );
    if (!owner.noticeTarget) {
      continue;
    }
    try {
      await deliverReapedNotice({ record, target: owner.noticeTarget, reason });
    } catch (err) {
      log.warn(
        `[continuation:delegate-orphan-reaped-notice-failed] flowId=${record.recordId} target=${owner.noticeTarget} error=${formatErrorMessage(err)}`,
      );
    }
  }
  return { reaped };
}
