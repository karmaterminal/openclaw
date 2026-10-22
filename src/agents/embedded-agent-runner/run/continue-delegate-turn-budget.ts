// Continuation (karmaterminal): an embedded run is the provider-turn boundary for continue_delegate's
// per-turn admission budget (auto-reply/continuation/delegate-turn-admission.ts).
import { resetContinueDelegateTurnBudget } from "../../../auto-reply/continuation/delegate-turn-admission.js";

/**
 * Starts the run with a fresh budget for its session. The orchestrator calls the wrapped run on
 * the session's lane, so a reset never lands while another run of the session is in flight.
 */
export function withContinueDelegateTurnBudget<T>(
  sessionKey: string | undefined,
  run: () => Promise<T>,
): () => Promise<T> {
  return async () => {
    resetContinueDelegateTurnBudget(sessionKey);
    return await run();
  };
}
