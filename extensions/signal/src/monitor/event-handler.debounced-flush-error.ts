// Signal plugin helpers decide how a failed debounced inbound flush settles its drain claims.
import type { fanInChannelIngressLifecycles } from "openclaw/plugin-sdk/channel-ingress-runtime";

type FannedInIngressLifecycle = ReturnType<typeof fanInChannelIngressLifecycles>["lifecycle"];

export async function handleSignalDebouncedFlushError(params: {
  error: unknown;
  lifecycle: FannedInIngressLifecycle;
  abortSignal: AbortSignal | undefined;
  isRetryableError: (error: unknown) => boolean;
  retry: () => Promise<void>;
}): Promise<void> {
  const { error: err, lifecycle } = params;
  if (lifecycle?.abortSignal.aborted) {
    await lifecycle.onFailed?.(err);
    return;
  }
  if (!params.isRetryableError(err)) {
    throw err;
  }
  if (params.abortSignal?.aborted) {
    return;
  }
  // Retry only pre-admission session conflicts; admitted turns have already
  // released the debounce lane and own their normal completion lifecycle.
  await params.retry().catch(async (terminalError: unknown) => {
    // Exhausted retries: release the drain claims so queue retry policy
    // owns redelivery instead of the stall watchdog dead-lettering them.
    await lifecycle?.onAbandoned();
    throw terminalError;
  });
}
