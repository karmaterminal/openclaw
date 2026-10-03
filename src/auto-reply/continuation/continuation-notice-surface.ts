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
import { withSystemEventOwner } from "../../infra/system-event-ownership.js";
import { enqueueSystemEventRaw as enqueueSystemEvent } from "../../infra/system-events.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { captureOpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.types.js";

const log = createSubsystemLogger("continuation/notice-surface");

export type ContinuationNoticeSurfaceDeps = {
  scheduleSessionDelivery: typeof scheduleSessionDelivery;
  enqueueSystemEvent: typeof enqueueSystemEvent;
  requestHeartbeatNow: typeof requestHeartbeatNow;
};

export const defaultContinuationNoticeSurfaceDeps: ContinuationNoticeSurfaceDeps = {
  // Resolved on first call, not at module evaluation: an eager binding forces
  // every test that mocks the runtime module to declare this export
  // (see work-terminal-notice.mock-surface.test.ts).
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
    /** Owning agent, when known; binds an unqualified owner key for the fast path. */
    ownerAgentId?: string;
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
  const fastPath = {
    sessionKey: params.sessionKey,
    trusted: true,
    sessionDeliveryAckId: params.entryId,
    // Prompt preparation is not adoption: settle only once the prepared turn is
    // durably adopted, so an admission failure or crash replays the notice.
    sessionDeliveryAwaitsTurnAdoption: true,
    ...(params.stateDir ? { sessionDeliveryAckStateDir: params.stateDir } : {}),
  };
  try {
    deps.enqueueSystemEvent(
      params.text,
      params.ownerAgentId ? withSystemEventOwner(fastPath, params.ownerAgentId) : fastPath,
    );
  } catch (err) {
    // The row is already committed and owns delivery; losing only the fast
    // path must not fail the turn or dispatch that settled it.
    log.warn(
      `[continuation:notice-fast-path-failed] deliveryId=${params.entryId} session=${params.sessionKey} error=${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Startup scans the delivery queue before continuation recovery runs, so a
  // row created now would otherwise wait for unrelated traffic.
  await scheduleCommittedContinuationNotice(params.entryId, params, deps);
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

/**
 * Arm the delivery timer for a notice row that is already committed. A row
 * that is missing or no longer pending makes this a no-op, so a caller that
 * cannot tell whether its settle committed may call it safely.
 */
export async function scheduleCommittedContinuationNotice(
  entryId: string,
  params: { queueContext?: OpenClawStateWorkerContext; stateDir?: string },
  deps: Pick<
    ContinuationNoticeSurfaceDeps,
    "scheduleSessionDelivery"
  > = defaultContinuationNoticeSurfaceDeps,
): Promise<void> {
  await deps.scheduleSessionDelivery(
    entryId,
    params.queueContext ??
      captureOpenClawStateWorkerContext({
        env: params.stateDir
          ? { ...process.env, OPENCLAW_STATE_DIR: params.stateDir }
          : process.env,
      }),
  );
}
