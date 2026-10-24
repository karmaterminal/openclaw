// Continuation (karmaterminal): F4 option 1. /new and /reset replace the head and keep the
// continuation-elected delegate tree; ordinary children stay upstream-governed. Real reset entry
// points, registry, SQLite state and delivery rows; only the fixture's gateway/announce edges are
// doubles. Fresh-process recovery: subagent-reset.continuation-retention.restart.test.ts.
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { useSubagentControlFixture } from "./subagent-control.test-support.js";
import { beforeEach, expect, it, vi } from "vitest";
import {
  prepareContinuationResetRetention,
  resolveContinuationResetRetentions,
} from "../../../auto-reply/continuation/session-reset-retention.js";
import { finalizeInboundContext } from "../../../auto-reply/reply/inbound-context.js";
import { stopSessionResetSubagents } from "../../../auto-reply/reply/session-reset-cleanup.js";
import { initSessionState } from "../../../auto-reply/reply/session.js";
import { captureRuntimeConfigAsyncReader, getRuntimeConfig } from "../../../config/config.js";
import {
  loadSessionEntry,
  patchSessionEntryCore,
} from "../../../config/sessions/session-accessor.js";
import { createChatAbortContext } from "../../../gateway/server-methods/chat.abort.test-helpers.js";
import { sessionDeleteHandlers } from "../../../gateway/server-methods/sessions-delete.js";
import { sessionMutationHandlers } from "../../../gateway/server-methods/sessions-mutations.js";
import { registerInternalHook, unregisterInternalHook } from "../../../hooks/internal-hooks.js";
import { createDeferredCore } from "../../../shared/deferred.js";
import { CONTINUATION_RESET_HOLD_MAX_MS } from "./subagent-continuation-reset-retention.js";
import { killSubagentRunAdmin } from "./subagent-control-kill.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { mutateSubagentRuns } from "./subagent-registry-persistence.js";
import {
  childKey,
  createResetRetentionFixture,
  parentKey,
} from "./subagent-reset.continuation-retention.test-support.js";
import { resolveSubagentDisplayStatus } from "./subagent-session-metrics.js";

// Runs a sweep at the two edges of mark settlement inside resolution (sweep-vs-resolution probe).
const settleInterleave = vi.hoisted(
  () => ({}) as { before?: () => Promise<void>; after?: () => Promise<void> },
);
vi.mock("./subagent-continuation-reset-retention.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./subagent-continuation-reset-retention.js")>();
  return {
    ...actual,
    settleContinuationResetRetentions: async (
      ...args: Parameters<typeof actual.settleContinuationResetRetentions>
    ) => {
      await settleInterleave.before?.();
      const settled = await actual.settleContinuationResetRetentions(...args);
      await settleInterleave.after?.();
      return settled;
    },
  };
});

const fixture = useSubagentControlFixture();
beforeEach(async () => captureRuntimeConfigAsyncReader()());
const {
  writeSession,
  addChild,
  returnFrom,
  returnRows,
  replay,
  drain,
  removeSessionRow,
  rehomeSessionRow,
  enqueueReturnWithoutAuthority,
  queuedEvents,
  leavePendingRetention,
} = createResetRetentionFixture(() => fixture.stateDir);
const WAITING = "waiting for external continuation";
// Where a rehome moves the parent's session (as alias adoption moves an old key's session).
const liveKey = "agent:main:work";

const displayStatus = (id: string) => resolveSubagentDisplayStatus(subagentRuns.get(id)!);
const retentionState = (id: string) => subagentRuns.get(id)?.continuationResetRetention?.state;
const readParent = (storePath: string) => loadSessionEntry({ storePath, sessionKey: parentKey });

function adminCall<P>(params: P) {
  const respond = vi.fn();
  return {
    respond,
    request: {
      params,
      context: createChatAbortContext({
        getRuntimeConfig,
        getSessionEventSubscriberConnIds: () => new Set(),
      }) as never,
      respond,
      client: { connect: { scopes: ["operator.admin"] } } as never,
      req: { type: "req" as const, id: "retention", method: "sessions" },
      isWebchatConnect: () => false,
    },
  };
}

async function reset(boundary: "chat" | "rpc"): Promise<void> {
  if (boundary === "chat") {
    const result = await initSessionState({
      ctx: finalizeInboundContext({
        Body: "/reset",
        From: "telegram:123",
        To: "telegram:123",
        ChatType: "direct",
        SessionKey: parentKey,
        Provider: "telegram",
      }),
      cfg: getRuntimeConfig(),
      commandAuthorized: true,
    });
    expect(result.resetTriggered).toBe(true);
    return;
  }
  const { respond, request } = adminCall({ key: parentKey });
  await sessionMutationHandlers["sessions.reset"]!(request);
  expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ ok: true }), undefined);
}

it.each(["chat", "rpc"] as const)(
  "%s reset retains the continuation-elected child and still kills the ordinary child",
  async (boundary) => {
    const storePath = await writeSession(parentKey, "parent", "before-reset");
    await addChild("elected", true);
    await addChild("ordinary", false);

    await reset(boundary);

    const committed = readParent(storePath)?.lifecycleRevision;
    expect(committed).not.toBe("before-reset");
    expect(displayStatus("ordinary")).toBe("killed");
    expect(subagentRuns.get("ordinary")?.continuationResetRetention).toBeUndefined();
    expect(displayStatus("elected")).toBe(WAITING);
    expect(subagentRuns.get("elected")).toMatchObject({
      requesterSessionKey: parentKey,
      continuationResetRetention: {
        state: "adopted",
        sessionKey: parentKey,
        fromRevision: "before-reset",
        toRevision: committed,
      },
    });
    expect(subagentRuns.get("elected")?.killIntent).toBeUndefined();
  },
);

it("a return produced across the reset commit is held, then released once to the proven successor", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  const text = "elected result during reset";
  // command:reset runs after the reset's kill marked the tree and before its commit.
  const inFlight: Record<string, unknown> = {};
  const produceInFlight = async () => {
    inFlight.handled = (await returnFrom("elected", text)).handled;
    inFlight.queuedAtProducer = queuedEvents(text).length;
    const rows = await returnRows("elected");
    inFlight.rows = rows.length;
    inFlight.replay = rows[0] ? await replay(rows[0]) : "missing";
    inFlight.queuedAfterReplay = queuedEvents(text).length;
    inFlight.revision = readParent(storePath)?.lifecycleRevision;
  };
  registerInternalHook("command:reset", produceInFlight);
  try {
    await reset("rpc");
  } finally {
    unregisterInternalHook("command:reset", produceInFlight);
  }
  expect(inFlight).toEqual({
    handled: true,
    queuedAtProducer: 0,
    rows: 1,
    replay: "held",
    queuedAfterReplay: 0,
    revision: "before-reset",
  });

  const committed = readParent(storePath)?.lifecycleRevision;
  expect(committed).not.toBe("before-reset");
  expect(subagentRuns.get("elected")?.continuationResetRetention).toMatchObject({
    state: "adopted",
    toRevision: committed,
  });
  const [row] = await returnRows("elected");
  expect(row).toBeDefined();
  expect(await replay(row!)).toBe("queued");
  expect(await replay(row!)).toBe("queued");
  expect(queuedEvents(text)).toEqual([expect.objectContaining({ sessionDeliveryAckId: row!.id })]);
});

it("a reset that kills but never commits releases its held return once to the unchanged head", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  await addChild("ordinary", false);
  const cfg = getRuntimeConfig();
  const text = "elected result during aborted reset";
  const retention = prepareContinuationResetRetention({
    cfg,
    sessionKey: parentKey,
    agentId: "main",
    storePath,
  });
  let replayInFlight: string | undefined;
  // The reset paths' own sequence: mark, upstream kill, then a failure before the commit.
  await retention.stopSubagents(
    { fromRevision: "before-reset", assertCurrent: () => {} },
    async () => {
      const killed = await stopSessionResetSubagents({
        cfg,
        sessionKey: parentKey,
        agentId: "main",
        assertCurrent: () => {},
      });
      await returnFrom("elected", text);
      const [row] = await returnRows("elected");
      replayInFlight = row ? await replay(row) : "missing";
      return killed;
    },
  );
  expect(replayInFlight).toBe("held");
  expect(queuedEvents(text)).toEqual([]);
  await retention.resolve();

  expect(readParent(storePath)?.lifecycleRevision).toBe("before-reset");
  expect(displayStatus("ordinary")).toBe("killed");
  expect(displayStatus("elected")).toBe(WAITING);
  expect(retentionState("elected")).toBe("aborted");
  const [row] = await returnRows("elected");
  expect(await replay(row!)).toBe("queued");
  expect(await replay(row!)).toBe("queued");
  expect(queuedEvents(text)).toEqual([expect.objectContaining({ sessionDeliveryAckId: row!.id })]);
});

it("an explicit kill still stops a run a pending reset retained", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  await leavePendingRetention(storePath);
  expect(retentionState("elected")).toBe("pending");

  const result = await killSubagentRunAdmin({
    cfg: getRuntimeConfig(),
    sessionKey: childKey("elected"),
    expectedRunId: "elected",
  });

  expect(result).toMatchObject({ found: true, killed: true });
  expect(displayStatus("elected")).toBe("killed");
});

it("delete orphans a pending-retained run; a sweep on either side of resolution never hands its held returns to a new head", async () => {
  // The main session cannot be deleted; a direct session can.
  const requester = "agent:main:telegram:default:direct:delete-me";
  const storePath = await writeSession(requester, "parent", "before-reset");
  await addChild("elected", true, requester);
  const text = "elected result before delete";
  const legacy = "legacy result before delete";
  await leavePendingRetention(storePath, {
    requester,
    during: async () => {
      await returnFrom("elected", text, requester);
    },
  });
  // A row with no captured recipient authority: replay's own authority check is vacuous for it.
  await enqueueReturnWithoutAuthority("elected", legacy, requester);
  expect(retentionState("elected")).toBe("pending");
  expect(await returnRows("elected")).toHaveLength(2);

  const deletion = adminCall({ key: requester });
  await sessionDeleteHandlers["sessions.delete"]!(deletion.request);
  expect(deletion.respond).toHaveBeenCalledWith(true, expect.anything(), undefined);
  expect(displayStatus("elected")).toBe("killed");
  await writeSession(requester, "new-head", "new-head-revision");

  const late = "legacy result after orphaning";
  // One pending sweep: every held row through the real drain, plus anything queued to the head.
  const sweep = async () => {
    const outcomes: string[] = [];
    for (const row of await returnRows("elected")) {
      outcomes.push(await drain(row));
    }
    const queued = [text, legacy, late].flatMap((result) => queuedEvents(result, requester));
    return { mark: retentionState("elected"), outcomes, queued };
  };
  // Before resolution both rows stay held: pending, nothing queued, neither acked.
  expect(await sweep()).toEqual({ mark: "pending", outcomes: ["pending", "pending"], queued: [] });

  // A sweep at each step of resolution: the rows are already failed before the mark leaves
  // pending, so neither sweep finds one to deliver or ack.
  const sweeps: Array<Awaited<ReturnType<typeof sweep>>> = [];
  settleInterleave.before = async () => void sweeps.push(await sweep());
  settleInterleave.after = async () => void sweeps.push(await sweep());
  try {
    await resolveContinuationResetRetentions({
      cfg: getRuntimeConfig(),
      markedBefore: Date.now() + 1,
    });
  } finally {
    settleInterleave.before = settleInterleave.after = undefined;
  }
  expect(sweeps).toEqual([
    { mark: "pending", outcomes: [], queued: [] },
    { mark: "orphaned", outcomes: [], queued: [] },
  ]);

  // A no-authority row written after resolution meets the durable orphan fence.
  await enqueueReturnWithoutAuthority("elected", late, requester);
  expect(await sweep()).toEqual({ mark: "orphaned", outcomes: ["moved-to-failed"], queued: [] });
  expect(await returnRows("elected")).toEqual([]);
});

it("a return held seven days by an unresolved reset expires to failed, never delivered, and its run keeps running", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  const text = "elected result held for a week";
  await leavePendingRetention(storePath, {
    during: async () => {
      await returnFrom("elected", text);
    },
  });
  // The session moves to another key through the legacy-replacement projection, which is not a
  // deletion edge: the old head is missing under unchanged recipient authority, so boot cannot
  // prove an outcome (owner ruling 🩸 1563546185942179871).
  await rehomeSessionRow(storePath, parentKey, liveKey);
  expect(readParent(storePath)).toBeUndefined();
  expect(loadSessionEntry({ storePath, sessionKey: liveKey })?.sessionId).toBe("parent");
  await resolveContinuationResetRetentions({
    cfg: getRuntimeConfig(),
    markedBefore: Date.now() + 1,
  });
  expect(retentionState("elected")).toBe("pending");
  const [row] = await returnRows("elected");
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(row!.enqueuedAt + CONTINUATION_RESET_HOLD_MAX_MS - 1);
    expect(await drain(row!)).toBe("pending");
    vi.setSystemTime(row!.enqueuedAt + CONTINUATION_RESET_HOLD_MAX_MS);
    expect(await drain(row!)).toBe("moved-to-failed");
  } finally {
    vi.useRealTimers();
  }
  expect(await returnRows("elected")).toEqual([]);
  expect(queuedEvents(text)).toEqual([]);
  // The handover stays unresolved and visible; age alone never stops a valid child.
  expect(retentionState("elected")).toBe("pending");
  expect(subagentRuns.get("elected")?.killIntent).toBeUndefined();
});

it("a reset whose head is deleted through the deletion edge resolves orphaned", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  await leavePendingRetention(storePath, {
    during: async () => {
      await returnFrom("elected", "elected result before deletion");
    },
  });
  // Every deletion owner advances recipient authority at the shared edge, so the binding is stale.
  removeSessionRow(parentKey);
  expect(readParent(storePath)).toBeUndefined();
  await resolveContinuationResetRetentions({
    cfg: getRuntimeConfig(),
    markedBefore: Date.now() + 1,
  });
  expect(retentionState("elected")).toBe("orphaned");
});

it("a retained chain-hop delegate survives when the reset stops the sibling that controls it", async () => {
  await writeSession(parentKey, "parent", "before-reset");
  await addChild("ordinary", false);
  // A chain hop returns to the parent session but is controlled by the child that spawned it.
  await addChild("hop", true, parentKey, childKey("ordinary"));

  await reset("rpc");

  expect(displayStatus("ordinary")).toBe("killed");
  expect(displayStatus("hop")).toBe(WAITING);
  expect(retentionState("hop")).toBe("adopted");
});

it("a mark whose row moved on to a later lifecycle releases its held return once to that head", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  const text = "elected result before a later rollover";
  await leavePendingRetention(storePath, {
    during: async () => {
      await returnFrom("elected", text);
    },
  });
  await patchSessionEntryCore({ storePath, sessionKey: parentKey }, (entry) => ({
    ...entry,
    lifecycleRevision: "later-rollover",
  }));
  const [row] = await returnRows("elected");
  expect(await replay(row!)).toBe("held");

  await resolveContinuationResetRetentions({
    cfg: getRuntimeConfig(),
    markedBefore: Date.now() + 1,
  });

  expect(retentionState("elected")).toBe("superseded");
  expect(await replay(row!)).toBe("queued");
  expect(await replay(row!)).toBe("queued");
  expect(queuedEvents(text)).toEqual([expect.objectContaining({ sessionDeliveryAckId: row!.id })]);
});

it("resolution waits for a reset stop still running after its mutation gave up", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  await addChild("ordinary", false);
  const cfg = getRuntimeConfig();
  const retention = prepareContinuationResetRetention({
    cfg,
    sessionKey: parentKey,
    agentId: "main",
    storePath,
  });
  const marked = createDeferredCore();
  const proceed = createDeferredCore();
  const stop = retention.stopSubagents(
    { fromRevision: "before-reset", assertCurrent: () => {} },
    async () => {
      marked.resolve();
      await proceed.promise;
      return await stopSessionResetSubagents({
        cfg,
        sessionKey: parentKey,
        agentId: "main",
        assertCurrent: () => {},
      });
    },
  );
  await marked.promise;
  // A preemption timeout finalized the mutation while its stop still runs.
  await retention.resolve();
  expect(retentionState("elected")).toBe("pending");

  proceed.resolve();
  await stop;

  expect(displayStatus("ordinary")).toBe("killed");
  expect(displayStatus("elected")).toBe(WAITING);
  expect(retentionState("elected")).toBe("aborted");
});

it("a retained run with suppressed session effects keeps its completion obligation through the reset", async () => {
  await writeSession(parentKey, "parent", "before-reset");
  for (const [runId, elected] of [
    ["elected", true],
    ["ordinary", false],
  ] as const) {
    await addChild(runId, elected);
    await mutateSubagentRuns([runId], (rows) => {
      const draft = structuredClone(rows.get(runId)!);
      draft.pauseReason = undefined;
      draft.execution = {
        status: "terminal",
        endedAt: 1_000,
        outcome: { status: "error", error: "original session incarnation changed" },
        suppressSessionEffects: true,
      };
      draft.completion = { required: false, capturedAt: 1_000, resultText: "stopped" };
      draft.requesterSettleWake = { status: "pending", attemptCount: 0 };
      return { value: undefined, postimages: new Map([[runId, draft]]) };
    });
  }

  await reset("rpc");

  expect(subagentRuns.get("ordinary")?.requesterSettleWake).toBeUndefined();
  expect(subagentRuns.get("elected")?.requesterSettleWake).toBeDefined();
  expect(retentionState("elected")).toBe("adopted");
});
