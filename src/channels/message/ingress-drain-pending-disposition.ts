import { resolveLaneKey } from "./ingress-drain-state.js";
import type { ChannelIngressQueue, ChannelIngressQueueRecord } from "./ingress-queue.js";

export type ChannelIngressPendingDisposition = {
  kind: "fail";
  reason: string;
  message: string;
};

export type ChannelIngressPendingDispositionContext = {
  laneKey: string;
  now: number;
};

export type ResolveChannelIngressPendingDisposition<TPayload, TMetadata> = (
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  context: ChannelIngressPendingDispositionContext,
) =>
  | ChannelIngressPendingDisposition
  | null
  | undefined
  | Promise<ChannelIngressPendingDisposition | null | undefined>;

type ApplyPendingDispositionsParams<TPayload, TMetadata, TCompletedMetadata> = {
  pending: Array<ChannelIngressQueueRecord<TPayload, TMetadata>>;
  dispositionNow: number;
  queue: Pick<ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>, "fail">;
  resolvePendingDisposition?: ResolveChannelIngressPendingDisposition<TPayload, TMetadata>;
  deriveLaneKey?: (record: ChannelIngressQueueRecord<TPayload, TMetadata>) => string | undefined;
  reconcileStoredLaneKey?: (
    record: ChannelIngressQueueRecord<TPayload, TMetadata>,
    storedLaneKey: string,
    derivedLaneKey: string,
  ) => boolean;
  log: (message: string) => void;
};

async function failPendingRecord<TPayload, TMetadata, TCompletedMetadata>(
  queue: Pick<ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>, "fail">,
  record: ChannelIngressQueueRecord<TPayload, TMetadata>,
  disposition: ChannelIngressPendingDisposition,
  failedAt: number,
): Promise<boolean> {
  const reason = disposition.reason.trim() || "pending-disposition";
  const message = disposition.message.trim() || reason;
  return await queue.fail(record.id, { reason, message, failedAt });
}

export async function applyIngressPendingDispositions<TPayload, TMetadata, TCompletedMetadata>(
  params: ApplyPendingDispositionsParams<TPayload, TMetadata, TCompletedMetadata>,
): Promise<Array<ChannelIngressQueueRecord<TPayload, TMetadata>>> {
  if (!params.resolvePendingDisposition) {
    return params.pending;
  }
  const retained: Array<ChannelIngressQueueRecord<TPayload, TMetadata>> = [];
  for (const event of params.pending) {
    const laneKey = resolveLaneKey(event, params.deriveLaneKey, params.reconcileStoredLaneKey);
    const disposition = await params.resolvePendingDisposition(event, {
      laneKey,
      now: params.dispositionNow,
    });
    if (!disposition) {
      retained.push(event);
      continue;
    }
    if (disposition.kind === "fail") {
      const failed = await failPendingRecord(
        params.queue,
        event,
        disposition,
        params.dispositionNow,
      );
      if (!failed) {
        params.log(`ingress drain: pending disposition lost race for event ${event.id}`);
      }
    }
  }
  return retained;
}
