// Shared-state worker dispatch for managed delegate-artifact returns: the only
// caller of the delegate-artifact SQL. One command is one state write
// transaction, so reads observe every earlier committed command in FIFO order.
import type { SqliteWorkerCommand } from "../infra/sqlite-worker-contract.js";
import type { OpenClawStateDatabase } from "../state/openclaw-state-db-contract.js";
import {
  runOpenClawStateWriteTransaction,
  type OpenClawStateDatabaseOptions,
} from "../state/openclaw-state-db.js";
import {
  markDelegateArtifactDeliveryUnavailableInDatabase,
  prepareDelegateArtifactDeliveryInDatabase,
  recordDelegateArtifactDeliveryBindingInDatabase,
} from "./delegate-artifact-delivery.worker.js";
import {
  finalizeDelegateArtifactsInDatabase,
  publishDelegateArtifactCandidatesInDatabase,
} from "./delegate-artifact-lifecycle.worker.js";
import {
  createDelegateArtifactPolicyInDatabase,
  hasRecordedDelegateArtifactCompletionInDatabase,
  isDelegateArtifactReturnConfiguredInDatabase,
  purgeExpiredDelegateArtifactsInDatabase,
  readDelegateArtifactPolicyStateInDatabase,
  removeUnacceptedDelegateArtifactPolicyInDatabase,
} from "./delegate-artifact-policy-store.worker.js";
import {
  discardDelegateArtifactForRecipientInDatabase,
  inspectDelegateArtifactForRecipientInDatabase,
  listDelegateArtifactsForRecipientInDatabase,
  markDelegateArtifactMaterializedInDatabase,
  readDelegateArtifactForMaterializationInDatabase,
} from "./delegate-artifact-recipient.worker.js";
import { ensureDelegateArtifactsSchema } from "./delegate-artifact-store.kernel.js";
import type { DelegateArtifactWorkerOperations } from "./delegate-artifacts.worker-contract.js";

type Command = SqliteWorkerCommand<DelegateArtifactWorkerOperations>;
type Output = DelegateArtifactWorkerOperations[keyof DelegateArtifactWorkerOperations]["output"];

export function isDelegateArtifactCommand(command: { type: string }): command is Command {
  return command.type.startsWith("delegateArtifacts.");
}

export function executeDelegateArtifactCommand(
  command: Command,
  databaseOptions: OpenClawStateDatabaseOptions,
): Output {
  ensureDelegateArtifactsSchema(databaseOptions);
  return runOpenClawStateWriteTransaction(
    (database) => executeInTransaction(database, command),
    databaseOptions,
    { operationLabel: command.type },
  );
}

function executeInTransaction(database: OpenClawStateDatabase, command: Command): Output {
  const { db } = database;
  switch (command.type) {
    case "delegateArtifacts.publish":
      return publishDelegateArtifactCandidatesInDatabase(db, command.input);
    case "delegateArtifacts.finalize":
      return finalizeDelegateArtifactsInDatabase(db, command.input);
    case "delegateArtifacts.createPolicy":
      return createDelegateArtifactPolicyInDatabase(db, command.input.policy);
    case "delegateArtifacts.readPolicyState":
      return readDelegateArtifactPolicyStateInDatabase(db, command.input);
    case "delegateArtifacts.hasRecordedCompletion":
      return hasRecordedDelegateArtifactCompletionInDatabase(db, command.input);
    case "delegateArtifacts.isReturnConfigured":
      return isDelegateArtifactReturnConfiguredInDatabase(db, command.input);
    case "delegateArtifacts.removeUnacceptedPolicy":
      return removeUnacceptedDelegateArtifactPolicyInDatabase(db, command.input);
    case "delegateArtifacts.purgeExpired":
      return purgeExpiredDelegateArtifactsInDatabase(db, command.input);
    case "delegateArtifacts.listForRecipient":
      return listDelegateArtifactsForRecipientInDatabase(db, command.input);
    case "delegateArtifacts.inspectForRecipient":
      return inspectDelegateArtifactForRecipientInDatabase(db, command.input);
    case "delegateArtifacts.readForMaterialization":
      return readDelegateArtifactForMaterializationInDatabase(db, command.input);
    case "delegateArtifacts.markMaterialized":
      return markDelegateArtifactMaterializedInDatabase(db, command.input);
    case "delegateArtifacts.discardForRecipient":
      return discardDelegateArtifactForRecipientInDatabase(db, command.input);
    case "delegateArtifacts.prepareDelivery":
      return prepareDelegateArtifactDeliveryInDatabase(db, command.input);
    case "delegateArtifacts.markDeliveryUnavailable":
      return markDelegateArtifactDeliveryUnavailableInDatabase({
        db,
        ...command.input,
        now: command.input.now ?? Date.now(),
      });
    case "delegateArtifacts.recordDeliveryBinding":
      return recordDelegateArtifactDeliveryBindingInDatabase(db, command.input);
  }
  throw new Error("Unknown delegate artifact command");
}
