// Distinguishes the three identical "changed while starting work" producers.
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import {
  loadSessionEntry,
  replaceSessionEntry,
  replaceSessionEntrySync,
} from "../../config/sessions/session-accessor.js";
import { runExclusiveSessionStoreWrite } from "../../config/sessions/store-writer.js";
import type { InternalSessionEntry as SessionEntry } from "../../config/sessions/types.js";
import {
  interruptSessionWorkAdmissions,
  isSessionWorkAdmissionActive,
  runExclusiveSessionLifecycleMutation,
} from "../../sessions/session-lifecycle-admission.js";
import { createReplyOperation, replyRunRegistry } from "./reply-run-registry.js";
import { testing } from "./reply-run-registry.test-support.js";
import { admitReplyTurn } from "./reply-turn-admission.js";

const SESSION_CHANGED_WHILE_STARTING_WORK = (sessionKey: string) =>
  `Session "${sessionKey}" changed while starting work. Retry.`;

const LIFECYCLE_INVALIDATION_REASONS = [
  "expected-session-mismatch",
  "recovery-owner-invalidated",
  "pre-operation-interrupted",
] as const;

type LifecycleInvalidationReason = (typeof LIFECYCLE_INVALIDATION_REASONS)[number];

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

function createSessionStore(entries: Record<string, object>): string {
  const root = tempDirs.make("openclaw-reply-admission-reasons-");
  const storePath = path.join(root, "sessions.json");
  for (const [sessionKey, entry] of Object.entries(entries)) {
    replaceSessionEntrySync({ sessionKey, storePath }, entry as SessionEntry);
  }
  return storePath;
}

function admitVisibleReplyTurn(
  overrides: Omit<Parameters<typeof admitReplyTurn>[0], "kind" | "resetTriggered"> &
    Partial<Pick<Parameters<typeof admitReplyTurn>[0], "resetTriggered">>,
) {
  return admitReplyTurn({ kind: "visible", resetTriggered: false, ...overrides });
}

function readReplyTurnLifecycleInvalidationReason(
  error: unknown,
): LifecycleInvalidationReason | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const reason = Reflect.get(error, "replyTurnLifecycleInvalidationReason");
  return LIFECYCLE_INVALIDATION_REASONS.find((candidate) => candidate === reason);
}

async function rejectVisibleAdmission(
  admission: Promise<unknown>,
): Promise<{ error: Error; reason: LifecycleInvalidationReason | undefined }> {
  const error = await admission.then(
    () => {
      throw new Error("expected lifecycle invalidation");
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(TypeError);
  return {
    error: error as Error,
    reason: readReplyTurnLifecycleInvalidationReason(error),
  };
}

async function triggerExpectedSessionMismatch(sessionKey: string) {
  const sessionId = "session-before-reset";
  const storePath = createSessionStore({
    [sessionKey]: { sessionId, updatedAt: Date.now() },
  });
  const mutationStarted = createDeferred();
  const releaseMutation = createDeferred();
  const mutation = runExclusiveSessionLifecycleMutation({
    scope: storePath,
    identities: [sessionKey, sessionId],
    run: async () => {
      mutationStarted.resolve();
      await releaseMutation.promise;
      await replaceSessionEntry({ sessionKey, storePath }, {
        sessionId: "session-after-reset",
        updatedAt: Date.now(),
      } as SessionEntry);
    },
  });
  await mutationStarted.promise;
  const admission = admitVisibleReplyTurn({
    sessionKey,
    sessionId,
    expectedSessionId: sessionId,
    storePath,
  });
  releaseMutation.resolve();
  await mutation;
  return admission;
}

async function triggerRecoveryOwnerInvalidated(sessionKey: string) {
  const sessionId = "tombstoned-session";
  const storePath = createSessionStore({
    [sessionKey]: {
      sessionId,
      updatedAt: 100,
      status: "failed",
      abortedLastRun: false,
      mainRestartRecovery: {
        cycleId: "cycle-1",
        revision: 4,
        chargedAttempts: 3,
        tombstone: { reason: "automatic recovery exhausted" },
      },
    },
  });
  return admitVisibleReplyTurn({
    sessionKey,
    sessionId,
    expectedSessionId: sessionId,
    storePath,
  });
}

async function triggerPreOperationInterrupted(sessionKey: string) {
  const sessionId = "session-before-interrupt";
  const storePath = createSessionStore({
    [sessionKey]: { sessionId, updatedAt: Date.now() },
  });
  const writerHold = createDeferred();
  const writerStarted = createDeferred();
  const heldWriter = runExclusiveSessionStoreWrite(storePath, async () => {
    writerStarted.resolve();
    await writerHold.promise;
  });
  await writerStarted.promise;

  const admission = admitVisibleReplyTurn({
    sessionKey,
    sessionId,
    expectedSessionId: sessionId,
    storePath,
  });
  await vi.waitFor(() => {
    expect(isSessionWorkAdmissionActive(storePath, [sessionKey, sessionId])).toBe(true);
  });

  const interrupt = interruptSessionWorkAdmissions({
    scope: storePath,
    identities: [sessionKey, sessionId],
  });
  writerHold.resolve();
  await heldWriter;
  const rejected = rejectVisibleAdmission(admission);
  await interrupt;
  return rejected;
}

describe("reply turn lifecycle invalidation reasons", () => {
  afterEach(() => {
    testing.resetReplyRunRegistry();
  });

  it.each([
    {
      name: "expected-session-mismatch",
      reason: "expected-session-mismatch" as const,
      sessionKey: "agent:main:telegram:topic:reason-row-mismatch",
      trigger: triggerExpectedSessionMismatch,
    },
    {
      name: "recovery-owner-invalidated",
      reason: "recovery-owner-invalidated" as const,
      sessionKey: "agent:main:telegram:topic:reason-row-recovery",
      trigger: triggerRecoveryOwnerInvalidated,
    },
  ] satisfies Array<{
    name: LifecycleInvalidationReason;
    reason: LifecycleInvalidationReason;
    sessionKey: string;
    trigger: (sessionKey: string) => Promise<unknown>;
  }>)(
    "$name keeps the visible message and attaches $reason",
    async ({ reason, sessionKey, trigger }) => {
      const { error, reason: actualReason } = await rejectVisibleAdmission(trigger(sessionKey));

      expect(error.message).toBe(SESSION_CHANGED_WHILE_STARTING_WORK(sessionKey));
      expect(error.name).toBe("Error");
      expect(actualReason).toBe(reason);
      expect(Object.keys(error)).not.toContain("replyTurnLifecycleInvalidationReason");
      expect(error.message).not.toContain(reason);
    },
  );

  it("pre-operation-interrupted keeps the visible message and attaches its reason", async () => {
    const sessionKey = "agent:main:telegram:topic:reason-row-interrupt";
    const { error, reason } = await triggerPreOperationInterrupted(sessionKey);

    expect(error.message).toBe(SESSION_CHANGED_WHILE_STARTING_WORK(sessionKey));
    expect(error.name).toBe("Error");
    expect(reason).toBe("pre-operation-interrupted");
    expect(Object.keys(error)).not.toContain("replyTurnLifecycleInvalidationReason");
    expect(error.message).not.toContain("pre-operation-interrupted");
  });

  it("assigns a distinct closed reason to each producer", async () => {
    const mismatchKey = "agent:main:telegram:topic:reason-matrix:mismatch";
    const recoveryKey = "agent:main:telegram:topic:reason-matrix:recovery";
    const interruptKey = "agent:main:telegram:topic:reason-matrix:interrupt";

    const mismatch = await rejectVisibleAdmission(triggerExpectedSessionMismatch(mismatchKey));
    const recovery = await rejectVisibleAdmission(triggerRecoveryOwnerInvalidated(recoveryKey));
    const interrupted = await triggerPreOperationInterrupted(interruptKey);

    const reasons = [mismatch.reason, recovery.reason, interrupted.reason];
    expect(reasons).toEqual([
      "expected-session-mismatch",
      "recovery-owner-invalidated",
      "pre-operation-interrupted",
    ]);
    expect(new Set(reasons).size).toBe(3);
  });

  it("does not attach a closed reason to successful admission", async () => {
    const sessionKey = "agent:main:telegram:topic:reason-success";
    const sessionId = "healthy-session";
    const storePath = createSessionStore({
      [sessionKey]: { sessionId, updatedAt: Date.now() },
    });

    const admission = await admitVisibleReplyTurn({
      sessionKey,
      sessionId,
      expectedSessionId: sessionId,
      storePath,
    });

    expect(admission.status).toBe("owned");
    if (admission.status === "owned") {
      expect(admission.operation.sessionId).toBe(sessionId);
      expect(readReplyTurnLifecycleInvalidationReason(admission)).toBeUndefined();
      admission.operation.complete();
    }
    expect(loadSessionEntry({ sessionKey, storePath })).toMatchObject({
      sessionId,
    });
  });

  it("does not change active-run deferral", async () => {
    const sessionKey = "agent:main:telegram:topic:reason-active-run";
    const sessionId = "active-session";
    const active = createReplyOperation({
      sessionKey,
      sessionId,
      resetTriggered: false,
    });
    active.setPhase("running");

    const admission = await admitVisibleReplyTurn({
      sessionKey,
      sessionId: "later-session",
      waitForActive: false,
    });

    expect(admission).toMatchObject({
      status: "skipped",
      reason: "active-run",
      activeOperation: active,
    });
    expect(readReplyTurnLifecycleInvalidationReason(admission)).toBeUndefined();
    expect(replyRunRegistry.get(sessionKey)).toBe(active);
    active.complete();
  });
});
