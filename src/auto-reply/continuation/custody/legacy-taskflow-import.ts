// Doctor state migrations that move continuation custody off the retired
// TaskFlow `flow_runs` rows (RFC docs/design/continue-work-signal-v2.md
// §5.4.5; decision record Decisions 3 and 4). Continuation owns them; the
// Doctor state-migration owner runs them, in Doctor and at startup, and
// custody phase A runs them in the Gateway for owners still awaiting import.
//
// This module orchestrates and owns the attachment payload files; every SQL
// statement runs in the shared-state worker (legacy-taskflow-import.worker.ts).
// Each owner session commits in one worker transaction. Attachment payloads
// move copy-first: the new-root file is written before the commit and the
// legacy file is deleted after it, so a crash at any point leaves either the
// untouched source or a complete import.
import { createSqliteWorkerWriteAdmission } from "../../../infra/sqlite-worker-store.js";
import type { MigrationMessages } from "../../../infra/state-migrations.types.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.types.js";
import { runOpenClawStateWorkerOperation } from "../../../state/openclaw-state-worker-store.js";
import { ContinuationCustodyLifetimeEndedError } from "./custody-lifetime.js";
import type { ContinuationCustodyWorkerOperations } from "./custody-store.worker-contract.js";
import type { LegacyImportOwnerResult } from "./legacy-taskflow-import.worker-contract.js";
import { preparePayloads, releaseLegacyPayload } from "./legacy-taskflow-payloads.js";

type MigrationOptions = {
  env: NodeJS.ProcessEnv;
  now?: () => number;
  /**
   * Gateway phase A binds the import to one database lifetime: this throws
   * `ContinuationCustodyLifetimeEndedError` once that lifetime has ended, and
   * the import then stops before its next write rather than writing old-lifetime
   * facts into a replacement database. Doctor runs without it.
   */
  assertCurrent?: () => void;
};

type Operations = ContinuationCustodyWorkerOperations;

/**
 * Options for every import command in the shared-state worker. The worker asks
 * for authority after BEGIN and again before COMMIT, and both the captured
 * database admission and the caller's lifetime must still hold each time, so a
 * database closed or replaced mid-import receives no write from this run.
 */
function importCommandOptions(context: OpenClawStateWorkerContext, assertCurrent: () => void) {
  return {
    assertCurrent,
    createAdmission: createSqliteWorkerWriteAdmission(() => {
      context.admission.assertCurrent();
      assertCurrent();
    }, [context.admission.databasePath]),
  };
}

/** Our errors and SQLite's are structural; neither echoes stored content. */
function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * `continuation-taskflow-custody-import`: import live and obligation-bearing
 * continuation rows, retire-receipt terminal ones, and settle pre-cutover
 * post-compaction queue entries. A failed owner is a recorded warning; its
 * rows and legacy files stay for the next run, and the runtime keeps refusing
 * its custody writes until an import commits.
 */
export async function migrateContinuationTaskFlowCustody(
  options: MigrationOptions,
): Promise<MigrationMessages> {
  const { env } = options;
  const now = options.now ?? Date.now;
  const assertCurrent = options.assertCurrent ?? (() => {});
  const context = captureOpenClawStateWorkerContext({ env });
  const commandOptions = importCommandOptions(context, assertCurrent);
  const run = <Key extends keyof Operations>(type: Key, input: Operations[Key]["input"]) =>
    runOpenClawStateWorkerOperation(
      context,
      (scope) => scope.execute({ type, input }),
      commandOptions,
    );
  // An absent state database has nothing to import, and the import never creates one.
  const snapshot = await runOpenClawStateWorkerOperation(
    context,
    (scope) => scope.execute({ type: "continuationCustody.readLegacySnapshot", input: {} }),
    { ...commandOptions, existingOnly: true },
  );
  if (!snapshot) {
    return { changes: [], warnings: [] };
  }
  const { owners, anomalies } = snapshot;
  const totals = { imported: 0, retired: 0, settledEntries: 0, notices: 0, failed: 0 };
  const warnings: string[] = [];
  for (const owner of owners) {
    assertCurrent();
    let result: LegacyImportOwnerResult;
    try {
      const payloads = await preparePayloads(env, owner.rows, assertCurrent);
      result = await run("continuationCustody.importLegacyOwner", {
        snapshot: owner,
        payloads: [...payloads],
        now: now(),
      });
    } catch (error) {
      // An ended lifetime aborts the whole import; it is not an owner failure.
      // A refused admission may surface as the broker's own error, so the
      // lifetime is asked directly rather than inferred from the error type.
      assertCurrent();
      if (error instanceof ContinuationCustodyLifetimeEndedError) {
        throw error;
      }
      totals.failed += 1;
      warnings.push(
        `Continuation custody import failed for one session and will be retried: ${describeFailure(error)}`,
      );
      continue;
    }
    for (const release of result.releaseLegacyAttachments) {
      try {
        await releaseLegacyPayload(env, release, assertCurrent);
      } catch (error) {
        if (error instanceof ContinuationCustodyLifetimeEndedError) {
          throw error;
        }
        // The receipt records the owed delete; the next import pass retries it.
      }
    }
    totals.imported += result.imported;
    totals.retired += result.retired;
    totals.settledEntries += result.settledEntries;
    totals.notices += result.notices;
    warnings.push(...result.warnings);
  }
  // Retry legacy deletes that an earlier commit owed but a crash or failure left behind.
  assertCurrent();
  for (const release of await run("continuationCustody.readOwedLegacyReleases", {})) {
    try {
      await releaseLegacyPayload(env, release, assertCurrent);
    } catch (error) {
      if (error instanceof ContinuationCustodyLifetimeEndedError) {
        throw error;
      }
      warnings.push(
        `A legacy continuation payload could not be deleted: ${describeFailure(error)}`,
      );
    }
  }
  if (anomalies > 0) {
    warnings.push(
      `${plural(anomalies, "continuation TaskFlow row")} had scrubbed attachment bytes but no import receipt; left untouched.`,
    );
  }
  const awaiting = (await run("continuationCustody.listAwaitingImportOwners", {})).length;
  if (awaiting > 0) {
    warnings.push(
      `Continuation custody for ${plural(awaiting, "session")} is waiting on legacy import; run \`openclaw doctor --fix\`.`,
    );
  }
  const changes: string[] = [];
  if (totals.imported > 0) {
    changes.push(
      `Imported ${plural(totals.imported, "continuation custody record")} from TaskFlow rows.`,
    );
  }
  if (totals.retired > 0) {
    changes.push(
      `Recorded ${plural(totals.retired, "terminal continuation TaskFlow row")} as retired.`,
    );
  }
  if (totals.settledEntries > 0) {
    changes.push(
      `Settled ${plural(totals.settledEntries, "pre-cutover post-compaction delegate entry")} without spawning.`,
    );
  }
  if (totals.notices > 0) {
    changes.push(`Queued ${plural(totals.notices, "delegate-spawn-interrupted notice")}.`);
  }
  return { changes, warnings };
}
