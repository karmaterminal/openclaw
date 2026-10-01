import {
  runDelegateArtifactOperation,
  type DelegateArtifactStateOptions,
} from "./delegate-artifact-operation.js";
import type { DelegateArtifactRecipientProjectionV1 } from "./delegate-artifact-store.js";
import type {
  DelegateArtifactDeliveryPreparation,
  DelegateArtifactWorkerOperations,
} from "./delegate-artifacts.worker-contract.js";

export async function prepareDelegateArtifactDelivery(params: {
  projection: DelegateArtifactRecipientProjectionV1;
  runtimeEnabled: boolean;
  crossSessionEnabled: boolean;
  currentRecipientSessionId?: string;
  now?: number;
  options?: DelegateArtifactStateOptions;
}): Promise<DelegateArtifactDeliveryPreparation> {
  const { runtimeEnabled, options, ...input } = params;
  if (!runtimeEnabled) {
    return { status: "deferred" };
  }
  return await runDelegateArtifactOperation(
    "delegateArtifacts.prepareDelivery",
    { ...input, now: input.now ?? Date.now() },
    options,
  );
}

export async function markDelegateArtifactDeliveryUnavailable(
  params: Omit<
    DelegateArtifactWorkerOperations["delegateArtifacts.markDeliveryUnavailable"]["input"],
    "now"
  > & {
    now?: number;
    options?: DelegateArtifactStateOptions;
  },
): Promise<void> {
  const { options, ...input } = params;
  await runDelegateArtifactOperation(
    "delegateArtifacts.markDeliveryUnavailable",
    { ...input, now: input.now ?? Date.now() },
    options,
  );
}

export async function recordDelegateArtifactDeliveryBinding(
  params: Omit<
    DelegateArtifactWorkerOperations["delegateArtifacts.recordDeliveryBinding"]["input"],
    "now"
  > & {
    now?: number;
    options?: DelegateArtifactStateOptions;
  },
): Promise<void> {
  const { options, ...input } = params;
  await runDelegateArtifactOperation(
    "delegateArtifacts.recordDeliveryBinding",
    { ...input, now: input.now ?? Date.now() },
    options,
  );
}
