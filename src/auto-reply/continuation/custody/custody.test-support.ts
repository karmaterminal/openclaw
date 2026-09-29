// Real continuation custody for suites that exercise continuation behavior
// (RFC docs/design/continue-work-signal-v2.md §9.2.2): every test gets its own
// state directory, custody commands run through the real shared-state worker,
// and the hot-path projection is hydrated from committed rows, as Gateway boot
// hydrates it. Suites that use this run in the database-worker test lane.
import { afterEach, beforeEach, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import { closeOpenClawStateDatabaseAsync } from "../../../state/openclaw-state-db.js";
import { resetContinuationCustodyImportGateForTests } from "../custody-import-gate.js";
import { resetContinuationCustodyProjection } from "./custody-projection.js";
import { hydrateContinuationCustody, listContinuationRecords } from "./custody-store.js";
import type { ContinuationRecord, ContinuationRecordQuery } from "./custody-store.types.js";

/**
 * Register per-test custody state. Call once at suite scope; the returned
 * accessor names the current test's state directory.
 */
export function useContinuationCustodyTestState(): { stateDir: () => string } {
  let stateDir: string | undefined;
  const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
    afterEach(async () => {
      resetContinuationCustodyProjection();
      resetContinuationCustodyImportGateForTests();
      await closeOpenClawStateDatabaseAsync();
      vi.unstubAllEnvs();
      stateDir = undefined;
      cleanup();
    }),
  );
  beforeEach(async () => {
    stateDir = tempDirs.make("openclaw-continuation-custody-test-");
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    await hydrateContinuationCustody();
  });
  return {
    stateDir: () => {
      if (!stateDir) {
        throw new Error("continuation custody test state is only available inside a test");
      }
      return stateDir;
    },
  };
}

/** Custody records, FIFO by creation. */
export async function listCustodyRecordsForTest(
  query: ContinuationRecordQuery = {},
): Promise<ContinuationRecord[]> {
  return await listContinuationRecords(query);
}

/** One custody record by ID. */
export async function readCustodyRecordForTest(
  recordId: string,
): Promise<ContinuationRecord | undefined> {
  return (await listContinuationRecords({ recordIds: [recordId] }))[0];
}

/** A record's state JSON, parsed. */
export function custodyStateForTest(record: ContinuationRecord): Record<string, unknown> {
  const parsed: unknown = JSON.parse(record.stateJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`custody record ${record.recordId} state is not an object`);
  }
  // SAFETY: narrowed to a non-array object above.
  return parsed as Record<string, unknown>;
}
