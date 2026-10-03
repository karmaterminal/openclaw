import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.types.js";

/**
 * Continuation events record only the state dir of the session delivery queue
 * that backs them; bind it to a state-worker context where the queue is used.
 */
export function captureContinuationQueueContext(stateDir?: string): OpenClawStateWorkerContext {
  return captureOpenClawStateWorkerContext({
    env: stateDir ? { ...process.env, OPENCLAW_STATE_DIR: stateDir } : process.env,
  });
}
