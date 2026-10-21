// Continuation (karmaterminal): proves awaited reset cleanup leaves a newer incarnation's and another agent's runtime state and continuation custody alone.
import { afterEach, expect, it, vi } from "vitest";
import {
  clearEmbeddedSessionPromptStates,
  retainEmbeddedSessionPromptState,
} from "../../agents/embedded-agent-runner/session-prompt-state.js";
import { captureRuntimeConfigAsyncReader } from "../../config/io.runtime.js";
import { replaceSessionEntry } from "../../config/sessions/session-accessor.sqlite-entry.js";
import { withSystemEventOwner } from "../../infra/system-event-ownership.js";
import {
  enqueueSystemEvent,
  peekSystemEvents,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import { resolveOpenClawAgentSqlitePath } from "../../state/openclaw-agent-db.paths.js";
import { withOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import {
  registerContinuationDispatchClaim,
  resetContinuationDispatchClaimsForTests,
} from "../continuation/continuation-dispatch-claims.js";
import { hydrateContinuationCustody } from "../continuation/custody/custody-store.js";
import { readCustodyRecordForTest } from "../continuation/custody/custody.test-support.js";
import { enqueuePendingDelegate } from "../continuation/delegate-store.js";
import {
  hasLiveContinuationTimerRefs,
  registerContinuationTimerHandle,
  releaseContinuationTimerRef,
  retainContinuationTimerRef,
} from "../continuation/state.js";
import {
  clearSessionResetRuntimeState,
  prepareSessionResetCleanupGuard,
} from "./session-reset-cleanup.js";

// Timing seam over the real custody store: the hook runs after the real write.
const custodyWrites = vi.hoisted(() => ({
  afterWrite: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("../continuation/custody/custody-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../continuation/custody/custody-store.js")>();
  return {
    ...actual,
    updateContinuationRecords: async (
      ...args: Parameters<typeof actual.updateContinuationRecords>
    ) => {
      const result = await actual.updateContinuationRecords(...args);
      const after = custodyWrites.afterWrite;
      custodyWrites.afterWrite = undefined;
      await after?.();
      return result;
    },
  };
});

const timers: Array<ReturnType<typeof setTimeout>> = [];
const promptHandles: Array<ReturnType<typeof retainEmbeddedSessionPromptState>> = [];
const retainedTimerKeys: string[] = [];

afterEach(() => {
  custodyWrites.afterWrite = undefined;
  for (const timer of timers.splice(0)) {
    clearTimeout(timer);
  }
  for (const handle of promptHandles.splice(0)) {
    handle[Symbol.dispose]();
  }
  for (const key of retainedTimerKeys.splice(0)) {
    releaseContinuationTimerRef(key);
  }
  clearEmbeddedSessionPromptStates(["incarnation"]);
  resetContinuationDispatchClaimsForTests();
  controllerTesting.resetSessionControllerForTest();
  resetSystemEventsForTest();
});

function armTimer(sessionKey: string) {
  retainContinuationTimerRef(sessionKey);
  retainedTimerKeys.push(sessionKey);
  const timer = setTimeout(() => {}, 60_000);
  timers.push(timer);
  registerContinuationTimerHandle(sessionKey, timer);
}

/** Live transient continuation and reply state one incarnation owns. */
function seedLiveRuntime(sessionKey: string, agentId: string, event: string) {
  enqueueSystemEvent(event, withSystemEventOwner({ sessionKey }, agentId));
  const claim = registerContinuationDispatchClaim({ sessionKey });
  armTimer(sessionKey);
  return claim;
}

async function withResetState(
  fn: (scope: { agentId: string; sessionKey: string; storePath: string }) => Promise<void>,
) {
  await withOpenClawTestState({ scenario: "minimal" }, async () => {
    await captureRuntimeConfigAsyncReader()();
    await hydrateContinuationCustody();
    const agentId = "main";
    await fn({
      agentId,
      sessionKey: "agent:main:stale-reset",
      storePath: resolveOpenClawAgentSqlitePath({ agentId }),
    });
  });
}

const retiring = { sessionId: "incarnation", lifecycleRevision: "retiring", updatedAt: 1 };
// Durable resets keep the transcript id and rotate only the lifecycle revision.
const replacement = { sessionId: "incarnation", lifecycleRevision: "replacement", updatedAt: 2 };

async function resetWithGuard(scope: { agentId: string; sessionKey: string; storePath: string }) {
  const guard = await prepareSessionResetCleanupGuard({ ...scope, expectedSession: retiring });
  try {
    await clearSessionResetRuntimeState([scope.sessionKey, retiring.sessionId], {
      agentId: scope.agentId,
      reason: "reset",
      sessionKey: scope.sessionKey,
      activeReplySessionId: retiring.sessionId,
      assertCurrent: guard.assertCurrent,
    });
  } finally {
    guard.release();
  }
}

it("negative: a replacement committed before cleanup keeps every runtime and custody path", async () => {
  await withResetState(async (scope) => {
    await replaceSessionEntry(scope, retiring);
    const delegate = await enqueuePendingDelegate(scope.sessionKey, {
      task: "owned by whichever incarnation is current",
      delayMs: 60_000,
    });
    const guard = await prepareSessionResetCleanupGuard({ ...scope, expectedSession: retiring });
    try {
      await replaceSessionEntry(scope, replacement);
      const claim = seedLiveRuntime(scope.sessionKey, scope.agentId, "replacement work");

      await expect(
        clearSessionResetRuntimeState([scope.sessionKey, retiring.sessionId], {
          agentId: scope.agentId,
          reason: "reset",
          sessionKey: scope.sessionKey,
          activeReplySessionId: retiring.sessionId,
          assertCurrent: guard.assertCurrent,
        }),
      ).rejects.toThrow("session changed before cleanup");

      expect((await readCustodyRecordForTest(delegate.recordId))?.status).toBe("queued");
      expect(claim.controller.signal.aborted).toBe(false);
      expect(hasLiveContinuationTimerRefs(scope.sessionKey)).toBe(true);
      expect(peekSystemEvents(scope.sessionKey)).toEqual(["replacement work"]);
    } finally {
      guard.release();
    }
  });
});

it("positive: a current reset cancels custody and clears the retiring transient state", async () => {
  await withResetState(async (scope) => {
    await replaceSessionEntry(scope, retiring);
    const delegate = await enqueuePendingDelegate(scope.sessionKey, {
      task: "retiring incarnation work",
      delayMs: 60_000,
    });
    const claim = seedLiveRuntime(scope.sessionKey, scope.agentId, "retiring event");

    await resetWithGuard(scope);

    expect((await readCustodyRecordForTest(delegate.recordId))?.status).toBe("cancelled");
    expect(claim.controller.signal.aborted).toBe(true);
    expect(hasLiveContinuationTimerRefs(scope.sessionKey)).toBe(false);
    expect(peekSystemEvents(scope.sessionKey)).toEqual([]);
  });
});

it("interleaving: a replacement winning after the durable write keeps its prompt state, events, claims and timers", async () => {
  await withResetState(async (scope) => {
    await replaceSessionEntry(scope, retiring);
    const delegate = await enqueuePendingDelegate(scope.sessionKey, {
      task: "retiring incarnation work",
      delayMs: 60_000,
    });
    let claim: ReturnType<typeof registerContinuationDispatchClaim> | undefined;
    let newerPromptState: object | undefined;
    custodyWrites.afterWrite = async () => {
      // The retiring record is already cancelled; now the newer incarnation wins.
      await replaceSessionEntry(scope, replacement);
      const retained = retainEmbeddedSessionPromptState(replacement.sessionId);
      promptHandles.push(retained);
      newerPromptState = retained.state;
      claim = seedLiveRuntime(scope.sessionKey, scope.agentId, "replacement work");
    };

    await expect(resetWithGuard(scope)).rejects.toThrow("session changed before cleanup");

    expect((await readCustodyRecordForTest(delegate.recordId))?.status).toBe("cancelled");
    expect(claim?.controller.signal.aborted).toBe(false);
    expect(hasLiveContinuationTimerRefs(scope.sessionKey)).toBe(true);
    expect(peekSystemEvents(scope.sessionKey)).toEqual(["replacement work"]);
    using current = retainEmbeddedSessionPromptState(replacement.sessionId);
    expect(current.state).toBe(newerPromptState);
  });
});
