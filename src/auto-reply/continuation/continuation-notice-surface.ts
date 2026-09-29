// Surfacing for continuation notices that already live as durable session
// delivery rows (the work retry-exhausted notice and the delegate
// interrupted-spawn notice, RFC docs/design/continue-work-signal-v2.md §5.4.2).
// The row owns delivery; the in-memory event is only the fast path and carries
// the row's ack id, so the row settles only once a prompt adopts it and a
// restart before that replays the row instead of losing the notice.
import {
  markTrustedContinuationHeartbeatWake,
  requestHeartbeatNow,
} from "../../infra/heartbeat-wake.js";
import type { scheduleSessionDelivery } from "../../infra/session-delivery-queue-runtime.js";
import { enqueueSystemEventRaw as enqueueSystemEvent } from "../../infra/system-events.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.types.js";

export type ContinuationNoticeSurfaceDeps = {
  scheduleSessionDelivery: typeof scheduleSessionDelivery;
  enqueueSystemEvent: typeof enqueueSystemEvent;
  requestHeartbeatNow: typeof requestHeartbeatNow;
};

export const defaultContinuationNoticeSurfaceDeps: ContinuationNoticeSurfaceDeps = {
  // Resolved on first call, not at module evaluation: an eager binding forces
  // every test that mocks the runtime module to declare this export
  // (karmaterminal/openclaw#1361).
  scheduleSessionDelivery: async (...args) =>
    await (
      await import("../../infra/session-delivery-queue-runtime.js")
    ).scheduleSessionDelivery(...args),
  enqueueSystemEvent,
  requestHeartbeatNow,
};

/**
 * Surface a durable notice row: fast-path event, armed delivery timer, and a
 * wake for the owning session. A `completed` row was already delivered and
 * adopted, so surfacing it again would duplicate a settled outcome.
 */
export async function surfaceDurableContinuationNotice(
  params: {
    entryId: string;
    entryStatus: string;
    sessionKey: string;
    text: string;
    reason: string;
    queueContext?: OpenClawStateWorkerContext;
    stateDir?: string;
  },
  deps: ContinuationNoticeSurfaceDeps = defaultContinuationNoticeSurfaceDeps,
): Promise<boolean> {
  if (params.entryStatus === "completed") {
    return false;
  }
  deps.enqueueSystemEvent(params.text, {
    sessionKey: params.sessionKey,
    trusted: true,
    sessionDeliveryAckId: params.entryId,
    // Prompt preparation is not adoption: settle only once the prepared turn is
    // durably adopted, so an admission failure or crash replays the notice.
    sessionDeliveryAwaitsTurnAdoption: true,
    ...(params.stateDir ? { sessionDeliveryAckStateDir: params.stateDir } : {}),
  });
  // Startup scans the delivery queue before continuation recovery runs, so a
  // row created now would otherwise wait for unrelated traffic.
  await deps.scheduleSessionDelivery(
    params.entryId,
    params.queueContext ??
      captureOpenClawStateWorkerContext({
        env: params.stateDir
          ? { ...process.env, OPENCLAW_STATE_DIR: params.stateDir }
          : process.env,
      }),
  );
  deps.requestHeartbeatNow(
    markTrustedContinuationHeartbeatWake({
      sessionKey: params.sessionKey,
      source: "other" as const,
      intent: "immediate" as const,
      reason: params.reason,
    }),
  );
  return true;
}
