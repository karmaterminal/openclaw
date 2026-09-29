// Admission evidence for a claimed continuation delegate (RFC
// docs/design/continue-work-signal-v2.md §5.4.4). The spawn owner uses each
// attempt's precomputed child run ID verbatim as the Gateway run ID, so a
// `subagent_runs` row under a recorded child run ID proves the Gateway admitted
// that attempt. Only a row whose requester is the delegate's owner is custody;
// a matching run ID under another requester is a collision and never adopted.
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { hasRecordedDelegateArtifactCompletionForProducer } from "../../agents/delegate-artifacts.js";
import { deriveContinuationDelegateChildSessionKeyFromParent } from "../../agents/subagent-continuation-ids.js";
import { prepareSubagentRunsByRunIds } from "../../agents/subagents/registry/subagent-registry.js";
import type { PendingContinuationDelegate } from "./types.js";

export type DelegateAdmissionEvidence =
  | { kind: "admitted"; runId: string; childSessionKey: string }
  | { kind: "collision"; runId: string }
  | { kind: "none" };

const REGISTRY_READ_ATTEMPTS = 8;

/** Read the registry under every recorded child run ID; throws when the read cannot settle. */
export async function readDelegateAdmissionEvidence(params: {
  runIds: readonly string[];
  requesterSessionKey: string;
}): Promise<DelegateAdmissionEvidence> {
  const runIds = [...new Set(params.runIds)];
  if (runIds.length === 0) {
    return { kind: "none" };
  }
  for (let attempt = 0; attempt < REGISTRY_READ_ATTEMPTS; attempt += 1) {
    // A prepared read can be superseded by a concurrent registry write before
    // it is consumed; re-prepare, bounded, as the spawn owner does.
    const prepared = await prepareSubagentRunsByRunIds(runIds);
    const read = prepared.consume((runs): DelegateAdmissionEvidence => {
      let collision: string | undefined;
      for (const runId of runIds) {
        const run = runs.get(runId);
        if (!run) {
          continue;
        }
        if (run.requesterSessionKey === params.requesterSessionKey) {
          return { kind: "admitted", runId, childSessionKey: run.childSessionKey };
        }
        collision ??= runId;
      }
      return collision ? { kind: "collision", runId: collision } : { kind: "none" };
    });
    if (read.ready) {
      return read.value;
    }
    await yieldToEventLoop();
  }
  throw new Error("subagent registry read for continuation admission evidence did not settle");
}

/**
 * Admission evidence for one claimed delegate: its recorded child run IDs, or,
 * for a managed delegate whose registry row was already archived, a recorded
 * artifact completion bound to this exact producer.
 */
export async function readClaimedDelegateAdmission(
  delegate: Pick<PendingContinuationDelegate, "flowId" | "recordedChildRunIds" | "returnOptions">,
  ownerSessionKey: string,
): Promise<DelegateAdmissionEvidence> {
  const evidence = await readDelegateAdmissionEvidence({
    runIds: delegate.recordedChildRunIds ?? [],
    requesterSessionKey: ownerSessionKey,
  });
  if (evidence.kind !== "none" || !delegate.flowId) {
    return evidence;
  }
  const managedArtifacts =
    delegate.returnOptions?.artifacts === "optional" ||
    delegate.returnOptions?.artifacts === "required";
  const childSessionKey = deriveContinuationDelegateChildSessionKeyFromParent(
    ownerSessionKey,
    delegate.flowId,
  );
  if (
    managedArtifacts &&
    hasRecordedDelegateArtifactCompletionForProducer({
      flowId: delegate.flowId,
      producerSessionKey: childSessionKey,
    })
  ) {
    return {
      kind: "admitted",
      runId: delegate.recordedChildRunIds?.at(-1) ?? delegate.flowId,
      childSessionKey,
    };
  }
  return evidence;
}
