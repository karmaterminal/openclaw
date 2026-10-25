// Continuation fleet carry (D3b): live interruptions are not restart work. Kept beside the
// restart recovery store, which sits at its line cap, so that store only calls this owner.
import type { InternalSessionEntry as SessionEntry } from "../../config/sessions.js";
import { hasMainSessionRestartEvidence } from "./main-session-recovery-restart-evidence.js";
import {
  commitMainSessionRecovery,
  type MainSessionRecoveryStoreTarget,
} from "./main-session-recovery-store.js";
import type { MainSessionRecoveryView } from "./main-session-recovery-types.js";

/**
 * A turn that failed before replying on this live Gateway is not restart work. Declining its
 * replay already withholds message-tool authority, so the session is kept and only the
 * recovery claim retires. Returns the skip reason, or undefined when the row stays on the
 * restart path: an exhausted claim, or one with restart evidence.
 */
export async function retireMainSessionLiveInterruptionWithoutRestartEvidence(params: {
  entry: SessionEntry;
  lifecycleGeneration: string;
  recoveryView: Extract<MainSessionRecoveryView, { status: "recoverable" | "exhausted" }>;
  target: MainSessionRecoveryStoreTarget;
}): Promise<"live_interruption_retired" | "state_changed" | undefined> {
  if (
    params.recoveryView.status === "exhausted" ||
    hasMainSessionRestartEvidence(params.entry, params.lifecycleGeneration)
  ) {
    return undefined;
  }
  const retired = await commitMainSessionRecovery({
    command: {
      kind: "retire_live_interruption",
      lifecycleGeneration: params.lifecycleGeneration,
      now: Date.now(),
      observation: params.recoveryView.observation,
    },
    requireWriteSuccess: true,
    target: params.target,
  });
  return retired.transition.kind === "applied" ? "live_interruption_retired" : "state_changed";
}
