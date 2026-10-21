// Continuation (karmaterminal): proves reply-session resets close exactly the retiring incarnation's continuation custody, fail visibly when it cannot close, and never touch another session or agent.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadSessionEntry } from "../../config/sessions/session-accessor.js";
import { testing as sessionBindingTesting } from "../../infra/outbound/session-binding-service.js";
import { withSystemEventOwner } from "../../infra/system-event-ownership.js";
import {
  enqueueSystemEvent,
  peekSystemEvents,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import { testing as controllerTesting } from "../../sessions/session-controller.test-support.js";
import {
  registerContinuationDispatchClaim,
  resetContinuationDispatchClaimsForTests,
} from "../continuation/continuation-dispatch-claims.js";
import {
  readCustodyRecordForTest,
  useContinuationCustodyTestState,
} from "../continuation/custody/custody.test-support.js";
import { enqueuePendingDelegate } from "../continuation/delegate-store.js";
import { SessionContinuationResetError } from "../continuation/session-reset.js";
import {
  hasLiveContinuationTimerRefs,
  registerContinuationTimerHandle,
  releaseContinuationTimerRef,
  retainContinuationTimerRef,
} from "../continuation/state.js";
import { enqueuePendingWorkReplacing } from "../continuation/work-replacement-store.js";
import { clearReplacedSessionRuntimeState } from "./session-init-reset-cleanup.js";
import { SessionResetCleanupError } from "./session-reset-cleanup.js";
import { initSessionState, writeSessionStore } from "./test/session.test-support.js";

const sessionInitWarn = vi.hoisted(() => vi.fn());
// Timing and failure seam over the real custody store; unarmed calls run the real owner.
const custody = vi.hoisted(() => ({
  beforeWrite: undefined as (() => Promise<void>) | undefined,
  failWrite: undefined as string | undefined,
}));

// Committed-reset cleanup reports best-effort failures through the session-init warn log.
vi.mock("../../logging/subsystem.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../logging/subsystem.js")>();
  return {
    ...actual,
    createSubsystemLogger: (...args: Parameters<typeof actual.createSubsystemLogger>) => {
      const logger = actual.createSubsystemLogger(...args);
      return args[0] === "session-init" ? { ...logger, warn: sessionInitWarn } : logger;
    },
  };
});

vi.mock("../continuation/custody/custody-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../continuation/custody/custody-store.js")>();
  return {
    ...actual,
    updateContinuationRecords: async (
      ...args: Parameters<typeof actual.updateContinuationRecords>
    ) => {
      const before = custody.beforeWrite;
      custody.beforeWrite = undefined;
      await before?.();
      if (custody.failWrite) {
        throw new Error(custody.failWrite);
      }
      return await actual.updateContinuationRecords(...args);
    },
  };
});

// mock-isolation: Tab cleanup is recorded without loading the browser plugin facade.
vi.mock("../../plugin-sdk/browser-maintenance.js", () => ({
  closeTrackedBrowserTabsForSessions: vi.fn(async () => 0),
}));

// mock-isolation: No global hook runner is installed, so plugin hooks never run.
vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => null,
}));

// mock-isolation: Channel summaries come from the test; the real builder inspects channel plugin accounts.
vi.mock("../../infra/channel-summary.js", () => ({
  buildChannelSummary: vi.fn(async () => [] as string[]),
}));

// mock-isolation: A fixed model catalog replaces the prepared runtime catalog, which reads config and auth.
vi.mock("../../agents/prepared-model-catalog.js", () => ({
  loadProviderScopedThinkingCatalog: vi.fn(async () => []),
  readPreparedModelCatalog: vi.fn(async () => [
    { provider: "openai", id: "gpt-4o-mini", name: "GPT-4o mini" },
  ]),
}));

useContinuationCustodyTestState();

let suiteRoot = "";
let suiteCase = 0;
const timers: Array<ReturnType<typeof setTimeout>> = [];
const timerKeys: string[] = [];

beforeAll(async () => {
  suiteRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-reset-custody-proof-"));
});

afterAll(async () => {
  await fs.rm(suiteRoot, { recursive: true, force: true });
});

afterEach(() => {
  custody.beforeWrite = undefined;
  custody.failWrite = undefined;
  sessionInitWarn.mockReset();
  for (const timer of timers.splice(0)) {
    clearTimeout(timer);
  }
  for (const key of timerKeys.splice(0)) {
    releaseContinuationTimerRef(key);
  }
  resetContinuationDispatchClaimsForTests();
  controllerTesting.resetSessionControllerForTest();
  resetSystemEventsForTest();
  sessionBindingTesting.resetSessionBindingAdaptersForTests();
});

// A is reset; B shares A's agent; C shares A's key under another agent.
const A = "agent:main:telegram:dm:reset-custody";
const B = "agent:main:telegram:dm:bystander";
const C = "agent:ops:telegram:dm:reset-custody";

async function seedStore(updatedAt: number) {
  const dir = path.join(suiteRoot, `case-${++suiteCase}`);
  await fs.mkdir(dir);
  const storePath = path.join(dir, "sessions.json");
  await writeSessionStore(storePath, { [A]: { sessionId: "a-session", updatedAt } });
  return storePath;
}

/** Durable work and delegate custody plus the live claim, timer and event one session owns. */
async function seedCustody(sessionKey: string) {
  const now = Date.now();
  const elected = await enqueuePendingWorkReplacing({
    work: {
      sessionKey,
      hop: 1,
      delayMs: 60_000,
      electedAt: now,
      dueAt: now + 60_000,
      maxChainLength: 8,
    },
    summary: "seeded reset proof work",
    maxPendingWork: Number.MAX_SAFE_INTEGER,
    replaceParkedWork: false,
    expectedRunningFlowIds: [],
  });
  if (!elected.applied || !elected.work.flowId) {
    throw new Error("expected seeded continuation work");
  }
  const delegate = await enqueuePendingDelegate(sessionKey, { task: "proof", delayMs: 60_000 });
  const claim = registerContinuationDispatchClaim({ sessionKey, flowId: delegate.recordId });
  retainContinuationTimerRef(sessionKey);
  timerKeys.push(sessionKey);
  const timer = setTimeout(() => {}, 60_000);
  timers.push(timer);
  registerContinuationTimerHandle(sessionKey, timer);
  const agentId = sessionKey.split(":")[1] ?? "main";
  enqueueSystemEvent(`${sessionKey} event`, withSystemEventOwner({ sessionKey }, agentId));
  return { sessionKey, recordIds: [elected.work.flowId, delegate.recordId], claim };
}

type Seeded = Awaited<ReturnType<typeof seedCustody>>;

async function statuses(seeded: Seeded) {
  return await Promise.all(
    seeded.recordIds.map(async (id) => (await readCustodyRecordForTest(id))?.status),
  );
}

async function expectLive(seeded: Seeded) {
  expect(await statuses(seeded), seeded.sessionKey).toEqual(["queued", "queued"]);
  expect(seeded.claim.controller.signal.aborted, seeded.sessionKey).toBe(false);
  expect(hasLiveContinuationTimerRefs(seeded.sessionKey), seeded.sessionKey).toBe(true);
  expect(peekSystemEvents(seeded.sessionKey), seeded.sessionKey).toEqual([
    `${seeded.sessionKey} event`,
  ]);
}

async function expectInterrupted(seeded: Seeded) {
  expect(await statuses(seeded), seeded.sessionKey).toEqual(["cancelled", "cancelled"]);
  expect(seeded.claim.controller.signal.aborted, seeded.sessionKey).toBe(true);
  expect(hasLiveContinuationTimerRefs(seeded.sessionKey), seeded.sessionKey).toBe(false);
  expect(peekSystemEvents(seeded.sessionKey), seeded.sessionKey).toEqual([]);
}

function turn(
  storePath: string,
  body: string,
  opts: { reset?: object; signal?: AbortSignal } = {},
) {
  return initSessionState({
    ctx: { Body: body, RawBody: body, CommandBody: body, SessionKey: A },
    cfg: {
      session: { store: storePath, idleMinutes: 999, ...(opts.reset ? { reset: opts.reset } : {}) },
    } as OpenClawConfig,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
}

it("P1 negative: a same-incarnation turn keeps custody, claims, timers and events", async () => {
  const storePath = await seedStore(Date.now());
  const seeded = [await seedCustody(A), await seedCustody(B), await seedCustody(C)];

  const result = await turn(storePath, "hello");

  expect(result.isNewSession).toBe(false);
  for (const session of seeded) {
    await expectLive(session);
  }
});

it.each(["/new", "/reset"])(
  "P1/P4 positive: %s closes only the retiring incarnation's custody",
  async (body) => {
    const storePath = await seedStore(Date.now());
    const [a, b, c] = [await seedCustody(A), await seedCustody(B), await seedCustody(C)];

    const result = await turn(storePath, body);

    expect(result.resetTriggered).toBe(true);
    expect(sessionInitWarn).not.toHaveBeenCalled();
    await expectInterrupted(a);
    await expectLive(b);
    await expectLive(c);
  },
);

it("P1 positive: a pending-reset tombstone replacement closes the retiring custody", async () => {
  const storePath = await seedStore(0);
  const [a, b] = [await seedCustody(A), await seedCustody(B)];

  const result = await turn(storePath, "hello");

  expect(result).toMatchObject({ isNewSession: true, resetTriggered: false });
  await expectInterrupted(a);
  await expectLive(b);
});

it("P1 contract: an idle rollover keeps continuation custody, claims and timers", async () => {
  const storePath = await seedStore(Date.now() - 2 * 60 * 60_000);
  const a = await seedCustody(A);

  const result = await turn(storePath, "hello", { reset: { mode: "idle", idleMinutes: 30 } });

  expect(result).toMatchObject({ isNewSession: true, resetTriggered: false });
  expect(await statuses(a)).toEqual(["queued", "queued"]);
  expect(a.claim.controller.signal.aborted).toBe(false);
  expect(hasLiveContinuationTimerRefs(A)).toBe(true);
  // Upstream runtime state still clears on rollover.
  expect(peekSystemEvents(A)).toEqual([]);
});

it("P4 interleaving: work another session or agent elects mid-cancellation survives", async () => {
  const storePath = await seedStore(Date.now());
  const a = await seedCustody(A);
  let late: Seeded[] = [];
  custody.beforeWrite = async () => {
    late = [await seedCustody(B), await seedCustody(C)];
  };

  await turn(storePath, "/new");

  await expectInterrupted(a);
  expect(late).toHaveLength(2);
  for (const session of late) {
    await expectLive(session);
  }
});

it("P2 interleaving: a turn that loses authority mid-cancellation keeps the transient state", async () => {
  const storePath = await seedStore(Date.now());
  const a = await seedCustody(A);
  const authority = new AbortController();
  custody.beforeWrite = async () => {
    authority.abort(new Error("superseded by a newer reset"));
  };

  await expect(turn(storePath, "/new", { signal: authority.signal })).rejects.toThrow(
    "superseded by a newer reset",
  );

  expect(sessionInitWarn).toHaveBeenCalledWith(
    expect.stringContaining("failed to clear reset runtime state"),
  );
  expect(a.claim.controller.signal.aborted).toBe(false);
  expect(hasLiveContinuationTimerRefs(A)).toBe(true);
  expect(peekSystemEvents(A)).toEqual([`${A} event`]);
});

it("P2 interleaving: a second reset waits for the first cleanup instead of overtaking it", async () => {
  const storePath = await seedStore(Date.now());
  const a = await seedCustody(A);
  const firstWriteReached = createDeferred();
  const releaseFirstWrite = createDeferred();
  custody.beforeWrite = async () => {
    firstWriteReached.resolve();
    await releaseFirstWrite.promise;
  };

  const first = turn(storePath, "/new");
  await firstWriteReached.promise;
  const revisionDuringCleanup = loadSessionEntry({ storePath, sessionKey: A })?.lifecycleRevision;
  let secondSettled = false;
  const second = turn(storePath, "/reset").finally(() => {
    secondSettled = true;
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 250);
  });

  expect(secondSettled).toBe(false);
  expect(loadSessionEntry({ storePath, sessionKey: A })?.lifecycleRevision).toBe(
    revisionDuringCleanup,
  );
  releaseFirstWrite.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  expect(firstResult.sessionEntry.lifecycleRevision).toBe(revisionDuringCleanup);
  expect(secondResult.sessionEntry.lifecycleRevision).not.toBe(revisionDuringCleanup);
  expect(loadSessionEntry({ storePath, sessionKey: A })?.lifecycleRevision).toBe(
    secondResult.sessionEntry.lifecycleRevision,
  );
  await expectInterrupted(a);
});

it("P3: a custody write failure fails the reset visibly, keeps transient state, and a retry completes", async () => {
  const storePath = await seedStore(Date.now());
  const a = await seedCustody(A);
  custody.failWrite = "SQLITE_FULL: database or disk is full";

  const failure = await turn(storePath, "/new").then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(failure).toBeInstanceOf(SessionResetCleanupError);
  expect((failure as Error).message).toContain("could not cancel continuation record");
  expect((failure as Error).cause).toBeInstanceOf(SessionContinuationResetError);
  await expectLive(a);

  custody.failWrite = undefined;
  const retry = await turn(storePath, "/new");

  expect(retry.resetTriggered).toBe(true);
  await expectInterrupted(a);
});

it("P3 negative: other cleanup errors keep upstream's warn-and-continue and clear nothing", async () => {
  const a = await seedCustody(A);
  const authority = new AbortController();
  authority.abort(new Error("superseded by a newer reset"));

  await expect(
    clearReplacedSessionRuntimeState({
      previousSessionEntry: { sessionId: "a-session" },
      previousSessionEndReason: "new",
      storePath: "/synthetic/warn-continue.sqlite",
      agentId: "main",
      sessionKey: A,
      signal: authority.signal,
    }),
  ).resolves.toBeUndefined();

  expect(sessionInitWarn).toHaveBeenCalledWith(
    expect.stringContaining("superseded by a newer reset"),
  );
  await expectLive(a);
});
