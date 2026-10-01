import {
  runDelegateArtifactOperation,
  type DelegateArtifactStateOptions,
} from "./delegate-artifact-operation.js";
import type { DelegateArtifactWorkerOperations } from "./delegate-artifacts.worker-contract.js";

type RecipientCall = {
  recipientSessionKey: string;
  recipientSessionId: string;
  runtimeEnabled: boolean;
  crossSessionEnabled: boolean;
  now?: number;
  options?: DelegateArtifactStateOptions;
};
type ClaimCall = RecipientCall & { claimId: string };
type Output<Key extends keyof DelegateArtifactWorkerOperations> = Promise<
  DelegateArtifactWorkerOperations[Key]["output"]
>;

/** A disabled runtime refuses every recipient action without touching state. */
function recipientScope(params: RecipientCall) {
  return params.runtimeEnabled
    ? {
        recipientSessionKey: params.recipientSessionKey,
        recipientSessionId: params.recipientSessionId,
        crossSessionEnabled: params.crossSessionEnabled,
        now: params.now ?? Date.now(),
      }
    : undefined;
}

export async function listDelegateArtifactsForRecipient(
  params: RecipientCall,
): Output<"delegateArtifacts.listForRecipient"> {
  const scope = recipientScope(params);
  return scope
    ? await runDelegateArtifactOperation(
        "delegateArtifacts.listForRecipient",
        scope,
        params.options,
      )
    : { outcome: "unauthorized" };
}

export async function inspectDelegateArtifactForRecipient(
  params: ClaimCall,
): Output<"delegateArtifacts.inspectForRecipient"> {
  const scope = recipientScope(params);
  return scope
    ? await runDelegateArtifactOperation(
        "delegateArtifacts.inspectForRecipient",
        { ...scope, claimId: params.claimId },
        params.options,
      )
    : { outcome: "unauthorized" };
}

export async function readDelegateArtifactForMaterialization(
  params: ClaimCall,
): Output<"delegateArtifacts.readForMaterialization"> {
  const scope = recipientScope(params);
  return scope
    ? await runDelegateArtifactOperation(
        "delegateArtifacts.readForMaterialization",
        { ...scope, claimId: params.claimId },
        params.options,
      )
    : { outcome: "unauthorized" };
}

export async function markDelegateArtifactMaterialized(
  params: ClaimCall & { destination: string },
): Output<"delegateArtifacts.markMaterialized"> {
  const scope = recipientScope(params);
  return scope
    ? await runDelegateArtifactOperation(
        "delegateArtifacts.markMaterialized",
        { ...scope, claimId: params.claimId, destination: params.destination },
        params.options,
      )
    : { outcome: "unauthorized" };
}

export async function discardDelegateArtifactForRecipient(
  params: ClaimCall,
): Output<"delegateArtifacts.discardForRecipient"> {
  const scope = recipientScope(params);
  return scope
    ? await runDelegateArtifactOperation(
        "delegateArtifacts.discardForRecipient",
        { ...scope, claimId: params.claimId },
        params.options,
      )
    : { outcome: "unauthorized" };
}
