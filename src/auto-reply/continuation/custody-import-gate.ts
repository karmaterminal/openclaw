// Custody writes for owners whose legacy TaskFlow rows are not imported yet
// (RFC docs/design/continue-work-signal-v2.md §5.4.5, "Update behavior").
// Custody readiness (phase A, custody-store.ts) reads the owners that still
// have un-imported live rows together with the live set, and installs them
// before any custody mutation can run. Until an import commits for such an
// owner, its elections and delegate enqueues are refused with a visible hint:
// an election would otherwise bypass the owner condition over rows the custody
// store cannot see. The fact is re-read whenever the projection is hydrated.
import {
  clearContinuationCustodyAwaitingImport,
  isOwnerAwaitingContinuationCustodyImport,
} from "./custody/custody-import-gate-state.js";
import { resolveContinuationCustodyDatabasePath } from "./custody/custody-store.js";

const CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE =
  "continuation custody for this session is waiting on legacy import; run `openclaw doctor --fix`";

class ContinuationCustodyImportPendingError extends Error {
  constructor() {
    super(CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE);
    this.name = "ContinuationCustodyImportPendingError";
  }
}

export function isContinuationCustodyOwnerAwaitingImport(ownerSessionKey: string): boolean {
  return isOwnerAwaitingContinuationCustodyImport(
    resolveContinuationCustodyDatabasePath(),
    ownerSessionKey,
  );
}

/** Refuse a custody write for an owner that is still waiting on the legacy import. */
export function assertContinuationCustodyOwnerImported(ownerSessionKey: string): void {
  if (isContinuationCustodyOwnerAwaitingImport(ownerSessionKey)) {
    throw new ContinuationCustodyImportPendingError();
  }
}

export function resetContinuationCustodyImportGateForTests(): void {
  clearContinuationCustodyAwaitingImport();
}
