/**
 * Recovery of ingress claims left behind by drains that are no longer live.
 */
import {
  isIngressClaimOwnedByOtherLiveProcess,
  isIngressCorruptClaimOwnedByOtherLiveProcess,
  isLiveLocalIngressDrainOwner,
} from "./ingress-claim-owner.js";
import { activeClaimKey } from "./ingress-drain-state.js";
import type { ChannelIngressQueue } from "./ingress-queue.js";

type RecoverStaleIngressClaimsOptions<TPayload, TMetadata, TCompletedMetadata> = {
  queue: ChannelIngressQueue<TPayload, TMetadata, TCompletedMetadata>;
  now: number;
  claimLeaseMs: number;
  /** Claim keys this drain is currently running; never recovered from itself. */
  activeClaimKeys: ReadonlySet<string>;
  /** Lanes this drain owns; guards corrupt-claim recovery against live work. */
  activeLaneKeys: ReadonlySet<string>;
};

export async function recoverStaleIngressClaims<TPayload, TMetadata, TCompletedMetadata>(
  options: RecoverStaleIngressClaimsOptions<TPayload, TMetadata, TCompletedMetadata>,
): Promise<number> {
  const { now, claimLeaseMs, activeClaimKeys, activeLaneKeys } = options;
  return await options.queue.recoverStaleClaims({
    staleMs: 0,
    now,
    shouldRecover: (claim) => {
      if (activeClaimKeys.has(activeClaimKey(claim))) {
        return false;
      }
      // Same-PID multi-drain: only recover when the owner instance is not live.
      if (isLiveLocalIngressDrainOwner(claim.claim.ownerId)) {
        return false;
      }
      return !isIngressClaimOwnedByOtherLiveProcess(claim, { maxAgeMs: claimLeaseMs, now });
    },
    shouldRecoverCorrupt: (claim) => {
      if (claim.laneKey && activeLaneKeys.has(claim.laneKey)) {
        return false;
      }
      if (isLiveLocalIngressDrainOwner(claim.claim.ownerId)) {
        return false;
      }
      return !isIngressCorruptClaimOwnedByOtherLiveProcess(claim, { maxAgeMs: claimLeaseMs, now });
    },
  });
}
