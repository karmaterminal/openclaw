import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import { executeOpenClawStateWorker } from "../state/openclaw-state-worker-store.js";
import type { DelegateArtifactWorkerOperations } from "./delegate-artifacts.worker-contract.js";

/** Which state database a delegate-artifact command runs against; defaults to the Gateway's. */
export type DelegateArtifactStateOptions = { path?: string; env?: NodeJS.ProcessEnv };

/** Run one delegate-artifact command in the shared-state worker and await its committed result. */
export function runDelegateArtifactOperation<Key extends keyof DelegateArtifactWorkerOperations>(
  type: Key,
  input: DelegateArtifactWorkerOperations[Key]["input"],
  target: DelegateArtifactStateOptions | OpenClawStateWorkerContext = {},
): Promise<DelegateArtifactWorkerOperations[Key]["output"]> {
  const context = "admission" in target ? target : captureOpenClawStateWorkerContext(target);
  return executeOpenClawStateWorker(context, { type, input });
}
