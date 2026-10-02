import { markDelegateArtifactDeliveryUnavailable } from "./delegate-artifact-delivery.js";
import {
  runDelegateArtifactOperation,
  type DelegateArtifactStateOptions,
} from "./delegate-artifact-operation.js";
import type {
  DelegateArtifactFinalizeInput,
  DelegateArtifactFinalizeResult,
  DelegateArtifactPublicationResult,
} from "./delegate-artifacts.worker-contract.js";

/** Bounds the resolve-and-retry loop if accepted recipients were replaced mid-finalization. */
const FINALIZE_SESSION_RESOLUTION_ATTEMPTS = 3;

export async function publishDelegateArtifactCandidates(params: {
  producerSessionKey: string;
  producerSessionId: string;
  producerRunId: string;
  publicationKey: string;
  candidates: Array<{ bytes: Uint8Array; mimeType: string }>;
  runtimeEnabled: boolean;
  crossSessionEnabled: boolean;
  now?: number;
  options?: DelegateArtifactStateOptions;
}): Promise<DelegateArtifactPublicationResult> {
  if (!params.runtimeEnabled) {
    return { status: "rejected", reason: "runtime_disabled" };
  }
  const { runtimeEnabled: _runtimeEnabled, options, ...input } = params;
  return await runDelegateArtifactOperation(
    "delegateArtifacts.publish",
    { ...input, now: input.now ?? Date.now() },
    options,
  );
}

/**
 * Finalize the producer run's managed artifacts. Session incarnations live in
 * agent databases the state transaction cannot read, so they are resolved on
 * the host before the command and every recipient left available is
 * re-resolved after the receipt: a recipient whose incarnation changed in
 * between is made terminally unavailable before any delivery can bind it.
 */
export async function finalizeDelegateArtifacts(
  params: Omit<DelegateArtifactFinalizeInput, "sessionIds" | "now"> & {
    now?: number;
    resolveSessionId: (sessionKey: string) => Promise<string | undefined> | string | undefined;
    options?: DelegateArtifactStateOptions;
  },
): Promise<DelegateArtifactFinalizeResult> {
  const { resolveSessionId, options, ...rest } = params;
  const input = { ...rest, now: rest.now ?? Date.now() };
  const resolve = async (sessionKeys: readonly string[]): Promise<Record<string, string | null>> =>
    Object.fromEntries(
      await Promise.all(
        sessionKeys.map(async (sessionKey): Promise<[string, string | null]> => [
          sessionKey,
          (await resolveSessionId(sessionKey)) ?? null,
        ]),
      ),
    );
  let sessionIds: Record<string, string | null> = {};
  for (let attempt = 0; attempt < FINALIZE_SESSION_RESOLUTION_ATTEMPTS; attempt += 1) {
    const result = await runDelegateArtifactOperation(
      "delegateArtifacts.finalize",
      { ...input, sessionIds },
      options,
    );
    if (result.status !== "needs-session-ids") {
      return await dropRecipientsWithChangedIncarnation(result, resolveSessionId, options);
    }
    sessionIds = await resolve(result.sessionKeys);
  }
  throw new Error("delegate artifact recipients changed during finalization");
}

async function dropRecipientsWithChangedIncarnation(
  result: DelegateArtifactFinalizeResult,
  resolveSessionId: (sessionKey: string) => Promise<string | undefined> | string | undefined,
  options: DelegateArtifactStateOptions | undefined,
): Promise<DelegateArtifactFinalizeResult> {
  if (!("projections" in result) || !result.projections) {
    return result;
  }
  for (const [sessionKey, projection] of result.projections) {
    const { arrivalContext } = projection;
    if (arrivalContext.availability !== "available") {
      continue;
    }
    if ((await resolveSessionId(sessionKey)) === arrivalContext.binding.recipientSessionId) {
      continue;
    }
    await markDelegateArtifactDeliveryUnavailable({
      dispatchId: arrivalContext.dispatchId,
      recipientSessionKey: arrivalContext.binding.recipientSessionKey,
      recipientSessionId: arrivalContext.binding.recipientSessionId,
      reason: "recipient-incarnation-changed",
      ...(options ? { options } : {}),
    });
    result.projections.delete(sessionKey);
  }
  return result;
}
