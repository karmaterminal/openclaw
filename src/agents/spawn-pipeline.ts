import { isRecord } from "@openclaw/normalization-core/record-coerce";
import type { SubagentLifecycleHookRunner } from "../plugins/hooks.js";
import type {
  SubagentRegistrationIdentity,
  SubagentRegistrationOwnership,
} from "./subagents/registry/subagent-registry-run-launch.js";
import { registerSubagentRun } from "./subagents/registry/subagent-registry.js";
import type { SubagentRegistrationScope } from "./subagents/registry/subagent-registry.types.js";

type SpawnPipelinePhase = "initialize" | "dispatch" | "register";

export type SpawnBackendAdapter<TState> = {
  initialize(): Promise<TState>;
  retainRegistrationScope?(scope: SubagentRegistrationScope): void;
  dispatchTurn(state: TState): Promise<{ runId: string }>;
  cleanupOnFailure(params: {
    phase: SpawnPipelinePhase;
    state?: TState;
    error: unknown;
    registrationScope?: SubagentRegistrationScope;
  }): Promise<void>;
};

type RegisterSubagentRunInput = Parameters<typeof registerSubagentRun>[0];
type OwnedSubagentRegistration = RegisterSubagentRunInput & {
  expectedRegistration: SubagentRegistrationIdentity;
};
type AcceptedRollbackOwnerStatus =
  | { status: "persisted" }
  | { status: "pending-persistence"; error: unknown }
  | { status: "rejected" };

type SpawnProgressOrigin = {
  channel?: string;
  accountId?: string;
  to?: string;
  threadId?: string | number;
  channelId?: string;
  messageId?: string | number;
};

type SpawnPipelineResult<TState> =
  | {
      ok: true;
      state: TState;
      runId: string;
      rollbackAccepted: () => Promise<void>;
      registrationScope?: SubagentRegistrationScope;
    }
  | {
      ok: false;
      phase: SpawnPipelinePhase;
      error: unknown;
      state?: TState;
      runId?: string;
    };

function combineSpawnRollbackError(error: unknown, rollbackError: unknown, message: string): Error {
  const aggregate = new AggregateError([error, rollbackError], message);
  aggregate.cause = error;
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    Object.assign(aggregate, { code: error.code });
  }
  return aggregate;
}

function readRegistrationOwnership(error: unknown): SubagentRegistrationOwnership | undefined {
  if (!isRecord(error) || !isRegistrationOwnership(error.registrationOwnership)) {
    return undefined;
  }
  return error.registrationOwnership;
}

function isRegistrationIdentity(value: unknown): value is SubagentRegistrationIdentity {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.childSessionKey === "string" &&
    typeof value.generation === "number" &&
    typeof value.createdAt === "number"
  );
}

function isRegistrationOwnership(value: unknown): value is SubagentRegistrationOwnership {
  if (!isRecord(value) || !isRegistrationIdentity(value.attempted)) {
    return false;
  }
  if (
    value.status === "new-row-committed" ||
    value.status === "new-row-survived" ||
    value.status === "no-new-row" ||
    value.status === "unknown"
  ) {
    return true;
  }
  return value.status === "predecessor-restored" && isRegistrationIdentity(value.predecessor);
}

class SpawnRegistrationOwnershipError extends Error {
  constructor(
    readonly registrationOwnership: Exclude<
      SubagentRegistrationOwnership,
      { status: "new-row-committed" }
    >,
  ) {
    super(
      `Subagent registration did not commit a new row: ${registrationOwnership.attempted.runId}`,
    );
  }
}

export function summarizeSpawnError(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "error";
}

type SpawnPipelineParams<TState> = {
  adapter: SpawnBackendAdapter<TState>;
  assertActive?: () => void;
  admissionReservation?: { release: () => void };
  buildRegistration: (state: TState, runId: string) => RegisterSubagentRunInput;
  hookRunner?: SubagentLifecycleHookRunner | null;
  progressOrigin?: SpawnProgressOrigin;
  /** Session key the started-progress hook fires against. Backends differ on
      purpose: native passes the controller-side requester key, ACP its
      historical completion-owner key; do not collapse them. */
  progressSessionKey: string;
  assertRegistrationAdmission?: () => void;
  assertPostPublicationAdmission?: () => void;
  publishRegistration?: (registration: RegisterSubagentRunInput) => void | Promise<void>;
  afterRegistration?: (
    state: TState,
    runId: string,
    registrationScope?: SubagentRegistrationScope,
  ) => Promise<void>;
  recordAcceptedRollback?: (
    registration: OwnedSubagentRegistration,
    error: unknown,
  ) => AcceptedRollbackOwnerStatus | Promise<AcceptedRollbackOwnerStatus>;
  rollbackRegistration?: (registration: OwnedSubagentRegistration) => boolean | Promise<boolean>;
};

export async function runSpawnPipeline<TState>(
  params: SpawnPipelineParams<TState>,
): Promise<SpawnPipelineResult<TState>> {
  let phase: SpawnPipelinePhase = "initialize";
  let state: TState | undefined;
  let runId: string | undefined;
  let registrationScope: SubagentRegistrationScope | undefined;
  try {
    let registration: RegisterSubagentRunInput;
    let registrationOwnership: SubagentRegistrationIdentity | undefined;
    let rollbackPromise: Promise<void> | undefined;
    const rollbackAccepted = (
      error: unknown = new Error("Accepted subagent registration rolled back."),
    ): Promise<void> => {
      if (!registrationOwnership) {
        return rollbackPromise ?? Promise.resolve();
      }
      if (rollbackPromise) {
        return rollbackPromise;
      }
      rollbackPromise = (async () => {
        const failures: unknown[] = [];
        const ownership = registrationOwnership;
        const ownedRegistration = { ...registration, expectedRegistration: ownership };
        const rollbackOwner = await params.recordAcceptedRollback?.(ownedRegistration, error);
        if (rollbackOwner?.status === "rejected") {
          failures.push(
            new Error(`Accepted subagent rollback owner was rejected: ${ownership.runId}`),
          );
        } else if (rollbackOwner?.status === "pending-persistence") {
          failures.push(rollbackOwner.error);
        }
        let cleanupComplete = false;
        try {
          await params.adapter.cleanupOnFailure({
            phase: "register",
            state,
            error,
            ...(registrationScope ? { registrationScope } : {}),
          });
          cleanupComplete = true;
        } catch (cleanupError) {
          failures.push(cleanupError);
        }
        if (cleanupComplete) {
          try {
            if ((await params.rollbackRegistration?.(ownedRegistration)) === false) {
              throw new Error(
                `Accepted subagent registration rollback lost ownership: ${ownership.runId}`,
              );
            }
            registrationOwnership = undefined;
          } catch (rollbackError) {
            failures.push(rollbackError);
          }
        }
        if (failures.length > 0) {
          const aggregate = new AggregateError(
            failures,
            `Accepted subagent rollback incomplete: ${ownership.runId}`,
          );
          aggregate.cause = failures[0];
          throw aggregate;
        }
      })().finally(() => {
        rollbackPromise = undefined;
      });
      return rollbackPromise;
    };
    try {
      params.assertActive?.();
      state = await params.adapter.initialize();
      // Retain initialization's rollback handle before checking a parent that
      // may have closed while the backend was preparing its child.
      phase = "dispatch";
      params.assertActive?.();
      ({ runId } = await params.adapter.dispatchTurn(state));
      phase = "register";
      params.assertActive?.();
      registration = params.buildRegistration(state, runId);
      params.assertRegistrationAdmission?.();
      const registrationResult = await registerSubagentRun(registration, {
        assertCurrent: params.assertActive,
        retainOwnership: (scope) => {
          registrationScope = scope;
          params.adapter.retainRegistrationScope?.(scope);
        },
      });
      if (registrationResult.status !== "new-row-committed") {
        throw new SpawnRegistrationOwnershipError(registrationResult);
      }
      registrationOwnership = registrationResult.attempted;
      await params.publishRegistration?.(registration);
      // Release launch admission only after any authority preparation and registry acknowledgement.
      params.admissionReservation?.release();
    } catch (error) {
      const failedOwnership = readRegistrationOwnership(error);
      if (failedOwnership?.status === "new-row-survived") {
        registrationOwnership = failedOwnership.attempted;
      }
      if (registrationOwnership) {
        const ownedRunId = registrationOwnership.runId;
        try {
          await rollbackAccepted(error);
        } catch (rollbackError) {
          throw combineSpawnRollbackError(
            error,
            rollbackError,
            `Subagent registration and accepted-run rollback both failed: ${ownedRunId}`,
          );
        }
        return { ok: false, phase, state, runId, error };
      }
      await params.adapter.cleanupOnFailure({
        phase,
        state,
        error,
        ...(registrationScope ? { registrationScope } : {}),
      });
      return { ok: false, phase, state, runId, error };
    }

    if (params.hookRunner?.hasHooks("subagent_progress")) {
      try {
        await params.hookRunner.runSubagentProgress(
          {
            phase: "started",
            runId,
            childSessionKey: registration.childSessionKey,
            requester: params.progressOrigin,
          },
          {
            runId,
            childSessionKey: registration.childSessionKey,
            requesterSessionKey: params.progressSessionKey,
          },
        );
      } catch {
        // Presentation hooks are best-effort after the run is durably registered.
      }
      try {
        params.assertPostPublicationAdmission?.();
      } catch (error) {
        try {
          await rollbackAccepted(error);
          return { ok: false, phase, state, runId, error };
        } catch (rollbackError) {
          return {
            ok: false,
            phase,
            state,
            runId,
            error: combineSpawnRollbackError(
              error,
              rollbackError,
              `Subagent post-publication rollback incomplete: ${runId}`,
            ),
          };
        }
      }
    }

    if (params.afterRegistration) {
      try {
        await params.afterRegistration(state, runId, registrationScope);
        params.assertPostPublicationAdmission?.();
      } catch (error) {
        try {
          await rollbackAccepted(error);
          return { ok: false, phase, state, runId, error };
        } catch (rollbackError) {
          return {
            ok: false,
            phase,
            state,
            runId,
            error: combineSpawnRollbackError(
              error,
              rollbackError,
              `Subagent post-registration rollback incomplete: ${runId}`,
            ),
          };
        }
      }
    }
    return {
      ok: true,
      state,
      runId,
      rollbackAccepted: () => rollbackAccepted(),
      ...(registrationScope ? { registrationScope } : {}),
    };
  } finally {
    params.admissionReservation?.release();
  }
}
