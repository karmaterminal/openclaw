import { describe, expect, it, vi } from "vitest";
import type { bindSubagentSpawnCleanup } from "./subagent-spawn-cleanup.js";
import { cleanupAcceptedSubagentSpawnFailure } from "./subagent-spawn-rollback.js";

type CleanupOwner = ReturnType<typeof bindSubagentSpawnCleanup>;
type Termination = Awaited<ReturnType<NonNullable<CleanupOwner["terminateAcceptedRun"]>>>;

function createRetainedOwner(termination: Termination) {
  const releaseAdmission = vi.fn();
  const retainAdmission = vi.fn(() => releaseAdmission);
  const terminateAcceptedRun = vi.fn(async (_retain: () => () => void) => termination);
  const cleanupOwner: CleanupOwner = {
    isCurrent: () => true,
    callGateway: vi.fn(),
    terminateAcceptedRun,
    bindAcceptedRun: vi.fn(),
  };
  return { cleanupOwner, retainAdmission, releaseAdmission, terminateAcceptedRun };
}

function failRetainedRegistration(owner: ReturnType<typeof createRetainedOwner>) {
  const cleanupCreatedSession = vi.fn(async () => undefined);
  const result = cleanupAcceptedSubagentSpawnFailure({
    phase: "register",
    error: new Error("ordinary child registry outcome is unknown"),
    runId: "spawn-idem",
    childSessionKey: "agent:main:subagent:child",
    acceptedChildRunId: "accepted-run",
    registrationRequired: true,
    emitLifecycleHooks: false,
    cleanupCreatedSession,
    // The registry retains the row: the spawn no longer owns session cleanup,
    // but the retained owner may still abort the accepted run.
    isCurrent: () => false,
    isAbortCurrent: () => true,
    cleanupOwner: owner.cleanupOwner,
    retainAdmission: owner.retainAdmission,
  });
  return { result, cleanupCreatedSession };
}

describe("cleanupAcceptedSubagentSpawnFailure retained-owner termination", () => {
  it("reports a pending retained termination as upstream's error text without throwing", async () => {
    const owner = createRetainedOwner({
      status: "pending",
      error: new Error("first accepted-child abort failed"),
    });
    const { result, cleanupCreatedSession } = failRetainedRegistration(owner);

    const message = await result;

    expect(message).toBe(
      "Child termination is not confirmed: first accepted-child abort failed. " +
        "Its session is retained, and Gateway cleanup is pending.",
    );
    expect(owner.terminateAcceptedRun).toHaveBeenCalledExactlyOnceWith(owner.retainAdmission);
    // The admission handed to the owner stays with the owner's retry.
    expect(owner.releaseAdmission).not.toHaveBeenCalled();
    expect(cleanupCreatedSession).toHaveBeenCalledOnce();
  });

  it("keeps termination that could not be scheduled a thrown cleanup failure, not pending", async () => {
    const owner = createRetainedOwner({
      status: "failed",
      error: new Error("Subagent cleanup requires its Gateway work lifetime"),
    });
    const { result, cleanupCreatedSession } = failRetainedRegistration(owner);

    const failure = await result.then(
      () => undefined,
      (error: unknown) => error,
    );

    if (!(failure instanceof AggregateError)) {
      throw new Error("expected a cleanup-incomplete AggregateError", { cause: failure });
    }
    const errors = failure.errors.map((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Accepted child termination was not confirmed: accepted-run");
    expect(errors[0]).toContain("Gateway cleanup could not be scheduled.");
    expect(errors[0]).not.toContain("pending");
    expect(cleanupCreatedSession).toHaveBeenCalledOnce();
  });

  it("returns no termination text once the retained owner settles termination", async () => {
    const owner = createRetainedOwner({ status: "settled" });
    const { result } = failRetainedRegistration(owner);

    await expect(result).resolves.toBeUndefined();
    expect(owner.terminateAcceptedRun).toHaveBeenCalledOnce();
  });
});
