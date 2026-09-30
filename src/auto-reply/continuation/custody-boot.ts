// Gateway boot for continuation custody (RFC docs/design/continue-work-signal-v2.md
// §5.4.4 crash-boundary table, §5.4.5 "Update behavior", §5.4.6). The order is
// fixed: custody readiness (phase A: import gate and projection from one read),
// then subagent registry activation, then custody recovery (phase B). Phase A
// also runs on demand under the first custody mutation, so a turn admitted
// before this boot runs cannot outrun the gate. Recovery handles ordinary
// post-cutover custody only; every legacy claim was already decided inside its
// owner's import transaction.
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  listContinuationOwnersAwaitingLegacyImport,
  pruneContinuationRecords,
  whenContinuationCustodyReady,
} from "./custody/custody-store.js";

const log = createSubsystemLogger("continuation/custody-boot");

/** Terminal records are retained this long unless they still owe a notice (§5.4.6). */
const CONTINUATION_CUSTODY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type BootLogger = { info: (message: string) => void; warn: (message: string) => void };

export type ContinuationCustodyBootSummary = {
  awaitingImportOwners: number;
  pruned: number;
  delegates: { sessions: number; dispatched: number; rejected: number };
  awaitingNextCompactionRequeued: number;
  postCompaction: { sessions: number; dispatched: number; failed: number };
  work: {
    sessions: number;
    dispatched: number;
    failed: number;
    reaped: number;
    terminalNotices: number;
  };
};

/** Retention: prune terminal records past the window that owe no notice. */
export async function pruneExpiredContinuationCustody(now = Date.now()): Promise<number> {
  const { deletedRecordIds } = await pruneContinuationRecords({
    endedBefore: now - CONTINUATION_CUSTODY_RETENTION_MS,
  });
  return deletedRecordIds.length;
}

/**
 * Run continuation custody recovery for one Gateway boot.
 *
 * `armedAt` is the boot-time cutoff captured before any live dispatch could
 * claim a record: only records claimed at or before it belonged to the
 * previous process.
 */
export async function runContinuationCustodyBoot(params: {
  armedAt: number;
  whenSubagentRegistryActivated: () => Promise<void>;
  /**
   * Runs one custody step under the caller's work admission. The registry
   * activation wait is deliberately outside it, so an activation that never
   * comes cannot hold an admission open.
   */
  admit?: <T>(step: () => Promise<T>) => Promise<T>;
  log?: BootLogger;
}): Promise<ContinuationCustodyBootSummary> {
  const bootLog = params.log ?? log;
  const admit = params.admit ?? (<T>(step: () => Promise<T>) => step());
  // 1. Phase A: install the import gate and hydrate the projection from one
  //    committed read, unless a custody mutation already ran it. Owners whose
  //    legacy rows are not imported keep refusing custody writes (§5.4.5).
  await admit(() => whenContinuationCustodyReady());
  const awaitingImport = await admit(listContinuationOwnersAwaitingLegacyImport);
  if (awaitingImport.length > 0) {
    bootLog.warn(
      `continuation custody for ${awaitingImport.length} session(s) is waiting on legacy import; run \`openclaw doctor --fix\``,
    );
  }
  // 2. Upstream restart recovery owns interrupted children first.
  await params.whenSubagentRegistryActivated();
  // 3. Phase B: custody recovery. It never re-hydrates: phase A's projection
  //    has been kept current by every commit since, and a late re-read would
  //    overwrite newer committed facts.
  return await admit(async () => ({
    awaitingImportOwners: awaitingImport.length,
    ...(await recoverContinuationCustody(params.armedAt)),
  }));
}

async function recoverContinuationCustody(
  armedAt: number,
): Promise<Omit<ContinuationCustodyBootSummary, "awaitingImportOwners">> {
  await whenContinuationCustodyReady();
  const pruned = await pruneExpiredContinuationCustody();
  const [delegateRecovery, workModule] = await Promise.all([
    import("./delegate-dispatch-recovery.js"),
    import("./work-dispatch.js"),
  ]);
  // Delegate recovery runs before same-session work recovery to preserve the
  // normal post-turn order when both were queued in the same turn.
  const delegates = await delegateRecovery.recoverPendingContinuationDelegates({
    queuedCreatedAtOrBefore: armedAt,
    includeRunningUpdatedAtOrBefore: armedAt,
  });
  const { requeued: awaitingNextCompactionRequeued } =
    await delegateRecovery.requeueAwaitingNextCompactionDelegates({
      runningUpdatedAtOrBefore: armedAt,
    });
  const postCompaction = await delegateRecovery.recoverAndReleaseStagedPostCompactionDelegates({
    runningUpdatedAtOrBefore: armedAt,
  });
  const work = await workModule.recoverPendingContinuationWork();
  return {
    pruned,
    delegates,
    awaitingNextCompactionRequeued,
    postCompaction,
    work,
  };
}
