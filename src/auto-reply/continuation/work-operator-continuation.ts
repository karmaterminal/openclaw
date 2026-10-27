import { captureOperatorToolGatewayContinuationContext } from "../../gateway/server-plugin-in-process-authority.js";
import { formatErrorMessage } from "../../infra/errors.js";
import type { ContinueWorkRequest } from "./types.js";
import { executePendingContinuationWork } from "./work-dispatch-execution.js";
import type { PendingContinuationWork } from "./work-flow-state.js";
import { markPendingWorkFailed } from "./work-store.js";

type OperatorContinuation = NonNullable<ContinueWorkRequest["operatorContinuation"]>;
const retained = new Map<string, { sessionKey: string; custody: OperatorContinuation }>();

export async function captureWorkOperatorContinuation(
  request: ContinueWorkRequest,
  sessionKey: string,
): Promise<OperatorContinuation | undefined> {
  if (request.operatorContinuation) {
    return request.operatorContinuation;
  }
  const preparation = captureOperatorToolGatewayContinuationContext({ sessionKey });
  const captured = preparation ? await preparation : undefined;
  if (captured?.operatorAuthority) {
    return captured;
  }
  captured?.release();
  return undefined;
}

export function retainWorkOperatorContinuation(
  flowId: string,
  sessionKey: string,
  custody: OperatorContinuation | undefined,
): void {
  if (custody) {
    retained.set(flowId, { sessionKey, custody });
  }
}

export function releaseWorkOperatorContinuation(flowId: string | undefined): void {
  if (!flowId) {
    return;
  }
  const custody = retained.get(flowId)?.custody;
  retained.delete(flowId);
  custody?.release();
}

export function releaseSessionWorkOperatorContinuations(sessionKey: string): void {
  for (const [flowId, entry] of retained) {
    if (entry.sessionKey === sessionKey) {
      releaseWorkOperatorContinuation(flowId);
    }
  }
}

export function resetWorkOperatorContinuationsForTests(): void {
  for (const flowId of retained.keys()) {
    releaseWorkOperatorContinuation(flowId);
  }
}

/** Refuse missing/revoked policy custody; never retry an operator wake as system work. */
export async function runWithWorkOperatorContinuation<T>(
  work: PendingContinuationWork,
  run: () => Promise<T>,
): Promise<T | undefined> {
  const custody = work.flowId ? retained.get(work.flowId)?.custody : undefined;
  if (work.operatorAuthorityRequired && !custody) {
    await markPendingWorkFailed(work, "Retained operator authority unavailable; wake refused.");
    return undefined;
  }
  try {
    custody?.assertCurrent();
    return await (custody ? custody.run(run) : run());
  } catch (error) {
    if (!work.operatorAuthorityRequired) {
      throw error;
    }
    // A product/provider failure inside a valid operator run is not a policy
    // revocation. Preserve the dispatcher's normal failure handling for it.
    try {
      custody?.assertCurrent();
    } catch {
      await markPendingWorkFailed(
        work,
        `Retained operator authority revoked: ${formatErrorMessage(error)}`,
      );
      return undefined;
    }
    throw error;
  }
}

export async function executePendingWorkWithOperatorContinuation(
  work: PendingContinuationWork,
  policy: Parameters<typeof executePendingContinuationWork>[1],
  signal: AbortSignal,
): ReturnType<typeof executePendingContinuationWork> {
  return (
    (await runWithWorkOperatorContinuation(work, () =>
      executePendingContinuationWork(work, policy, signal),
    )) ?? { kind: "failed" }
  );
}
