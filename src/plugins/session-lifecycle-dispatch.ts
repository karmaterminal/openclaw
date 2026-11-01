import { runWithGatewayDetachedWorkContinuation } from "../process/gateway-work-admission.js";
import { runWithSessionControllerCleanup } from "../sessions/session-controller.owner-context.js";
import { runOutsideStoreWriterContext } from "../shared/store-writer-queue.js";

// Publication order is the lifecycle order for a key. A failed plugin must not
// prevent later notifications, and unrelated keys must not block one another.
const tails = new Map<string, Promise<void>>();

export function dispatchSessionLifecycleHook(
  sessionKey: string,
  label: string,
  run: () => Promise<void>,
): Promise<void> {
  const previous = tails.get(sessionKey);
  const current = runWithSessionControllerCleanup(() =>
    runWithGatewayDetachedWorkContinuation(async () => {
      await previous;
      await runOutsideStoreWriterContext(run);
    }, label),
  );
  const settled = current.then(
    () => {},
    () => {},
  );
  tails.set(sessionKey, settled);
  void settled.then(() => {
    if (tails.get(sessionKey) === settled) {
      tails.delete(sessionKey);
    }
  });
  return current;
}
