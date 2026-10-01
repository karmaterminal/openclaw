import { createSubsystemLogger } from "../logging/subsystem.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import {
  runDelegateArtifactOperation,
  type DelegateArtifactStateOptions,
} from "./delegate-artifact-operation.js";
import {
  RecipientsSchema,
  RouteSchema,
  type DelegateArtifactPolicyV1,
} from "./delegate-artifact-store.js";

const log = createSubsystemLogger("delegate-artifacts");

export async function createDelegateArtifactPolicy(
  policy: DelegateArtifactPolicyV1,
  options: DelegateArtifactStateOptions = {},
): Promise<void> {
  // Validate on the host so a malformed dispatch is refused before any command.
  const recipients = RecipientsSchema.parse(policy.recipients);
  const route = RouteSchema.parse(policy.route);
  await runDelegateArtifactOperation(
    "delegateArtifacts.createPolicy",
    { policy: { ...policy, recipients, route }, now: Date.now() },
    options,
  );
}

export async function isDelegateArtifactReturnConfigured(
  producerRunId: string,
  options: DelegateArtifactStateOptions = {},
): Promise<boolean> {
  return await runDelegateArtifactOperation(
    "delegateArtifacts.isReturnConfigured",
    { producerRunId },
    options,
  );
}

export class MissingDelegateArtifactPolicyError extends Error {
  constructor() {
    super("artifact-capable continuation dispatch has no accepted policy");
    this.name = "MissingDelegateArtifactPolicyError";
  }
}

export class UnavailableDelegateArtifactPolicyError extends Error {
  constructor() {
    super("artifact-capable continuation dispatch policy is inactive or expired");
    this.name = "UnavailableDelegateArtifactPolicyError";
  }
}

export async function assertDelegateArtifactPolicyPrepared(
  flowId: string,
  options: DelegateArtifactStateOptions = {},
): Promise<void> {
  const state = await runDelegateArtifactOperation(
    "delegateArtifacts.readPolicyState",
    { flowId, now: Date.now() },
    options,
  );
  if (state === "missing") {
    throw new MissingDelegateArtifactPolicyError();
  }
  if (state === "unavailable") {
    throw new UnavailableDelegateArtifactPolicyError();
  }
}

/**
 * Whether a completion has been recorded for the managed child bound to this
 * flow under the expected producer session. The live subagent registry cannot
 * answer once the child has ended or the process restarted, so this durable
 * binding is what keeps a re-drive from reporting a genuinely completed child
 * as a spawn failure. `completed_at` is written by the same statement that
 * leaves a policy `completed`, `failed`, or (finalization deferred by a runtime
 * disable) `staged`, and an `active` policy has none.
 */
export async function hasRecordedDelegateArtifactCompletionForProducer(
  params: { flowId: string; producerSessionKey: string },
  options: DelegateArtifactStateOptions = {},
): Promise<boolean> {
  return await runDelegateArtifactOperation(
    "delegateArtifacts.hasRecordedCompletion",
    params,
    options,
  );
}

export async function removeUnacceptedDelegateArtifactPolicy(
  flowId: string,
  options: DelegateArtifactStateOptions = {},
): Promise<void> {
  await runDelegateArtifactOperation(
    "delegateArtifacts.removeUnacceptedPolicy",
    { flowId },
    options,
  );
}

const purgesInFlight = new Map<string, Promise<number>>();

/**
 * Purge one batch of expired artifact backing. Callers that overlap on the
 * same database join the purge already in flight instead of queueing another.
 */
export function purgeExpiredDelegateArtifacts(
  now?: number,
  options: DelegateArtifactStateOptions = {},
): Promise<number> {
  const context = captureOpenClawStateWorkerContext(options);
  const databasePath = context.admission.databasePath;
  const inFlight = purgesInFlight.get(databasePath);
  if (inFlight) {
    return inFlight;
  }
  const purge = runDelegateArtifactOperation(
    "delegateArtifacts.purgeExpired",
    { now: now ?? Date.now() },
    context,
  ).finally(() => {
    purgesInFlight.delete(databasePath);
  });
  purgesInFlight.set(databasePath, purge);
  return purge;
}

/** Timer and boot callers do not wait for retention; a failed batch retries on the next tick. */
export function startExpiredDelegateArtifactPurge(): void {
  purgeExpiredDelegateArtifacts().catch((error: unknown) => {
    log.warn(
      `expired delegate artifact purge failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
