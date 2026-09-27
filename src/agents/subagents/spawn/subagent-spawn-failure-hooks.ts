/** Emits the subagent_ended presentation hook when a thread-bound spawn fails to dispatch. */
import type { SubagentLifecycleHookRunner } from "../../../plugins/hooks.js";

/** Returns whether spawn cleanup should still emit lifecycle hooks itself. */
export async function resolveSubagentSpawnFailureLifecycleHooks(params: {
  phase: "dispatch" | "register";
  threadBindingReady: boolean;
  hookRunner: SubagentLifecycleHookRunner | null;
  childSessionKey: string;
  accountId: string | undefined;
  runId: string;
  requesterSessionKey: string;
}): Promise<boolean> {
  const { phase, threadBindingReady, hookRunner, childSessionKey, runId } = params;
  let emitLifecycleHooks = threadBindingReady;
  if (phase === "dispatch" && threadBindingReady) {
    let endedHookEmitted = false;
    if (hookRunner?.hasHooks("subagent_ended")) {
      try {
        await hookRunner.runSubagentEnded(
          {
            targetSessionKey: childSessionKey,
            targetKind: "subagent",
            reason: "spawn-failed",
            sendFarewell: true,
            accountId: params.accountId,
            runId,
            outcome: "error",
            error: "Session failed to start",
          },
          {
            runId,
            childSessionKey,
            requesterSessionKey: params.requesterSessionKey,
          },
        );
        endedHookEmitted = true;
      } catch {
        // Spawn cleanup continues even when presentation hooks fail.
      }
    }
    emitLifecycleHooks = !endedHookEmitted;
  }
  return emitLifecycleHooks;
}
