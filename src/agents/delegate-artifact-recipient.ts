import {
  runDelegateArtifactOperation,
  type DelegateArtifactStateOptions,
} from "./delegate-artifact-operation.js";
import type { DelegateArtifactWorkerOperations } from "./delegate-artifacts.worker-contract.js";

type RecipientOperation = Extract<
  keyof DelegateArtifactWorkerOperations,
  | "delegateArtifacts.listForRecipient"
  | "delegateArtifacts.inspectForRecipient"
  | "delegateArtifacts.readForMaterialization"
  | "delegateArtifacts.markMaterialized"
  | "delegateArtifacts.discardForRecipient"
>;

type RecipientParams<Key extends RecipientOperation> =
  DelegateArtifactWorkerOperations[Key]["input"] & {
    runtimeEnabled: boolean;
    options?: DelegateArtifactStateOptions;
  };

/** A disabled runtime refuses every recipient action without touching state. */
async function runRecipientOperation<Key extends RecipientOperation>(
  type: Key,
  params: RecipientParams<Key>,
): Promise<DelegateArtifactWorkerOperations[Key]["output"] | { outcome: "unauthorized" }> {
  const { runtimeEnabled, options, ...input } = params;
  if (!runtimeEnabled) {
    return { outcome: "unauthorized" };
  }
  return await runDelegateArtifactOperation(type, input, options);
}

export function listDelegateArtifactsForRecipient(
  params: RecipientParams<"delegateArtifacts.listForRecipient">,
) {
  return runRecipientOperation("delegateArtifacts.listForRecipient", params);
}

export function inspectDelegateArtifactForRecipient(
  params: RecipientParams<"delegateArtifacts.inspectForRecipient">,
) {
  return runRecipientOperation("delegateArtifacts.inspectForRecipient", params);
}

export function readDelegateArtifactForMaterialization(
  params: RecipientParams<"delegateArtifacts.readForMaterialization">,
) {
  return runRecipientOperation("delegateArtifacts.readForMaterialization", params);
}

export function markDelegateArtifactMaterialized(
  params: RecipientParams<"delegateArtifacts.markMaterialized">,
) {
  return runRecipientOperation("delegateArtifacts.markMaterialized", params);
}

export function discardDelegateArtifactForRecipient(
  params: RecipientParams<"delegateArtifacts.discardForRecipient">,
) {
  return runRecipientOperation("delegateArtifacts.discardForRecipient", params);
}
