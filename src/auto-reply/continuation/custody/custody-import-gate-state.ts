// Boot-fact state for the legacy-import write gate (RFC §5.4.5), kept in a leaf
// module so custody readiness can install it without an import cycle.
import { resolveGlobalSingleton } from "../../../shared/global-singleton.js";

const awaitingImportByDatabase = resolveGlobalSingleton(
  Symbol.for("openclaw.continuationCustodyAwaitingImport"),
  () => new Map<string, ReadonlySet<string>>(),
);

/** Install the boot fact: owners whose legacy rows the import left behind. */
export function installContinuationCustodyAwaitingImport(
  databasePath: string,
  owners: readonly string[],
): void {
  if (owners.length === 0) {
    awaitingImportByDatabase.delete(databasePath);
    return;
  }
  awaitingImportByDatabase.set(databasePath, new Set(owners));
}

export function isOwnerAwaitingContinuationCustodyImport(
  databasePath: string,
  ownerSessionKey: string,
): boolean {
  return awaitingImportByDatabase.get(databasePath)?.has(ownerSessionKey) === true;
}

export function clearContinuationCustodyAwaitingImport(): void {
  awaitingImportByDatabase.clear();
}
