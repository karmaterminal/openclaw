// Custody writes for owners whose legacy TaskFlow rows are not imported yet
// (RFC docs/design/continue-work-signal-v2.md §5.4.5, "Update behavior").
// Gateway startup runs the Doctor import, then installs the owners that still
// have un-imported live rows as a prepared boot fact. Until an import commits
// for such an owner, its elections and delegate enqueues are refused with a
// visible hint: an election would otherwise bypass the owner condition over
// rows the custody store cannot see. The fact is replaced only by the next
// boot; a Doctor run in between takes effect at the next Gateway start.
import { resolveGlobalSingleton } from "../../shared/global-singleton.js";
import { resolveContinuationCustodyDatabasePath } from "./custody/custody-store.js";

const CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE =
  "continuation custody for this session is waiting on legacy import; run `openclaw doctor --fix`";

class ContinuationCustodyImportPendingError extends Error {
  constructor() {
    super(CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE);
    this.name = "ContinuationCustodyImportPendingError";
  }
}

const awaitingImportByDatabase = resolveGlobalSingleton(
  Symbol.for("openclaw.continuationCustodyAwaitingImport"),
  () => new Map<string, ReadonlySet<string>>(),
);

/** Install the boot fact: owners whose legacy rows the startup import left behind. */
export function installContinuationCustodyImportGate(
  owners: readonly string[],
  databasePath = resolveContinuationCustodyDatabasePath(),
): void {
  if (owners.length === 0) {
    awaitingImportByDatabase.delete(databasePath);
    return;
  }
  awaitingImportByDatabase.set(databasePath, new Set(owners));
}

export function isContinuationCustodyOwnerAwaitingImport(ownerSessionKey: string): boolean {
  return (
    awaitingImportByDatabase.get(resolveContinuationCustodyDatabasePath())?.has(ownerSessionKey) ===
    true
  );
}

/** Refuse a custody write for an owner that is still waiting on the legacy import. */
export function assertContinuationCustodyOwnerImported(ownerSessionKey: string): void {
  if (isContinuationCustodyOwnerAwaitingImport(ownerSessionKey)) {
    throw new ContinuationCustodyImportPendingError();
  }
}

export function resetContinuationCustodyImportGateForTests(): void {
  awaitingImportByDatabase.clear();
}
