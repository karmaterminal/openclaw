// Continuation (karmaterminal): F4 option 1. /new and /reset replace the head and keep the
// continuation-elected delegate tree; ordinary children stay upstream-governed. Real reset entry
// points, registry, SQLite state and delivery rows; only the fixture's gateway/announce edges are
// doubles.
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { useSubagentControlFixture } from "./subagent-control.test-support.js";
import { beforeEach, expect, it, vi } from "vitest";
import { captureContinuationRecipientAuthorities } from "../../../auto-reply/continuation/recipient-authority-binding.js";
import {
  prepareContinuationResetRetention,
  resolveContinuationResetRetentions,
} from "../../../auto-reply/continuation/session-reset-retention.js";
import { finalizeInboundContext } from "../../../auto-reply/reply/inbound-context.js";
import { stopSessionResetSubagents } from "../../../auto-reply/reply/session-reset-cleanup.js";
import { initSessionState } from "../../../auto-reply/reply/session.js";
import { captureRuntimeConfigAsyncReader, getRuntimeConfig } from "../../../config/config.js";
import { loadSessionEntry } from "../../../config/sessions/session-accessor.js";
import { createChatAbortContext } from "../../../gateway/server-methods/chat.abort.test-helpers.js";
import { sessionDeleteHandlers } from "../../../gateway/server-methods/sessions-delete.js";
import { sessionMutationHandlers } from "../../../gateway/server-methods/sessions-mutations.js";
import { deliverQueuedSessionDeliveryCore } from "../../../gateway/server-restart-sentinel-delivery.js";
import { registerInternalHook, unregisterInternalHook } from "../../../hooks/internal-hooks.js";
import {
  loadPendingSessionDeliveries,
  SessionDeliveryDeferredError,
} from "../../../infra/session-delivery-queue-storage.js";
import { resolveSystemEventQueueKey } from "../../../infra/system-event-ownership.js";
import { peekSystemEventEntries } from "../../../infra/system-events.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import { routeSubagentContinuationReturn } from "../../subagent-announce.continuation-return.js";
import { killSubagentRunAdmin } from "./subagent-control-kill.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { mutateSubagentRuns } from "./subagent-registry-persistence.js";
import { markSubagentRunPausedAfterYield } from "./subagent-registry-run-pause.js";
import { registerSubagentRun } from "./subagent-registry.js";
import { writeChildSession } from "./subagent-registry.persistence.test-support.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { resolveSubagentDisplayStatus } from "./subagent-session-metrics.js";

const fixture = useSubagentControlFixture();
beforeEach(async () => captureRuntimeConfigAsyncReader()());
const parentKey = "agent:main:main";
const childKey = (id: string) => "agent:main:subagent:" + id;
const WAITING = "waiting for external continuation";

const writeSession = (sessionKey: string, sessionId: string, lifecycleRevision?: string) =>
  writeChildSession(fixture.stateDir, sessionKey, sessionId, lifecycleRevision);
const displayStatus = (id: string) => resolveSubagentDisplayStatus(subagentRuns.get(id)!);
const readParent = (storePath: string) => loadSessionEntry({ storePath, sessionKey: parentKey });

async function updateRun(runId: string, update: (draft: SubagentRunRecord) => void): Promise<void> {
  await mutateSubagentRuns([runId], (rows) => {
    const current = rows.get(runId);
    if (!current) {
      throw new Error("Retention fixture run missing");
    }
    const draft = structuredClone(current);
    update(draft);
    return { value: undefined, postimages: new Map([[runId, draft]]) };
  });
}

/** A paused child of the parent; `elected` gives it a continuation recipient binding. */
async function addChild(runId: string, elected: boolean, requester = parentKey): Promise<void> {
  await writeSession(childKey(runId), runId);
  await registerSubagentRun({
    runId,
    childSessionKey: childKey(runId),
    childAgentId: "main",
    sessionEntry: { sessionId: runId },
    requesterSessionKey: requester,
    requesterAgentId: "main",
    requesterDisplayKey: requester,
    task: runId,
    cleanup: "keep",
    expectsCompletionMessage: true,
  });
  const binding = elected ? await captureContinuationRecipientAuthorities([requester]) : undefined;
  await updateRun(runId, (entry) => {
    expect(markSubagentRunPausedAfterYield({ entry })).toBe(true);
    if (binding) {
      entry.continuationRecipientAuthorityBinding = binding;
    }
  });
}

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

/** The elected child's continuation return through the real router and producer. */
async function returnFromElected(text: string, requester = parentKey) {
  return await routeSubagentContinuationReturn({
    cfg: getRuntimeConfig(),
    continuationEnabled: true,
    isContinuationChainDelegate: true,
    maxChainLength: 10,
    task: "elected",
    taskLabel: "elected",
    triggerMessage: text,
    announceId: `announce:${text}`,
    childSessionKey: childKey("elected"),
    childAgentId: "main",
    childRunId: "elected",
    targetRequesterSessionKey: requester,
    targetRequesterAgentId: "main",
    continuationRecipientAuthorityBinding:
      subagentRuns.get("elected")?.continuationRecipientAuthorityBinding,
  });
}

async function returnRows() {
  return (await loadPendingSessionDeliveries(captureOpenClawStateWorkerContext())).filter(
    (row) => row.kind === "systemEvent" && row.continuationSourceRunId === "elected",
  );
}

/** Replays one row through the real restart-sentinel delivery; returns how it settled. */
async function replay(row: Awaited<ReturnType<typeof returnRows>>[number]) {
  try {
    await deliverQueuedSessionDeliveryCore({
      deps: {} as never,
      entry: row,
      queueContext: captureOpenClawStateWorkerContext(),
    });
    return "returned";
  } catch (error) {
    if (error instanceof SessionDeliveryDeferredError) {
      return error.heldByOwner ? "held" : error.awaitingAdoptionInMemory ? "queued" : "deferred";
    }
    throw error;
  }
}

const parentEvents = (text: string, requester = parentKey) =>
  peekSystemEventEntries(resolveSystemEventQueueKey(requester, "main")).filter(
    (event) => event.text === text,
  );

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
    inFlight.handled = (await returnFromElected(text)).handled;
    inFlight.queuedAtProducer = parentEvents(text).length;
    const rows = await returnRows();
    inFlight.rows = rows.length;
    inFlight.replay = rows[0] ? await replay(rows[0]) : "missing";
    inFlight.queuedAfterReplay = parentEvents(text).length;
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
  const [row] = await returnRows();
  expect(row).toBeDefined();
  expect(await replay(row!)).toBe("queued");
  expect(await replay(row!)).toBe("queued");
  expect(parentEvents(text)).toEqual([expect.objectContaining({ sessionDeliveryAckId: row!.id })]);
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
      await returnFromElected(text);
      const [row] = await returnRows();
      replayInFlight = row ? await replay(row) : "missing";
      return killed;
    },
  );
  expect(replayInFlight).toBe("held");
  expect(parentEvents(text)).toEqual([]);
  await retention.resolve();

  expect(readParent(storePath)?.lifecycleRevision).toBe("before-reset");
  expect(displayStatus("ordinary")).toBe("killed");
  expect(displayStatus("elected")).toBe(WAITING);
  expect(subagentRuns.get("elected")?.continuationResetRetention?.state).toBe("aborted");
  const [row] = await returnRows();
  expect(await replay(row!)).toBe("queued");
  expect(await replay(row!)).toBe("queued");
  expect(parentEvents(text)).toEqual([expect.objectContaining({ sessionDeliveryAckId: row!.id })]);
});

/** A reset that marked its tree and then died: nothing in this process resolves the mark. */
async function leavePendingRetention(
  storePath: string,
  during?: () => Promise<void>,
  requester = parentKey,
) {
  const retention = prepareContinuationResetRetention({
    cfg: getRuntimeConfig(),
    sessionKey: requester,
    agentId: "main",
    storePath,
  });
  await retention.stopSubagents(
    { fromRevision: "before-reset", assertCurrent: () => {} },
    async () => {
      await during?.();
    },
  );
  expect(subagentRuns.get("elected")?.continuationResetRetention?.state).toBe("pending");
}

it("an explicit kill still stops a run a pending reset retained", async () => {
  const storePath = await writeSession(parentKey, "parent", "before-reset");
  await addChild("elected", true);
  await leavePendingRetention(storePath);

  const result = await killSubagentRunAdmin({
    cfg: getRuntimeConfig(),
    sessionKey: childKey("elected"),
    expectedRunId: "elected",
  });

  expect(result).toMatchObject({ found: true, killed: true });
  expect(displayStatus("elected")).toBe("killed");
});

it("delete stops a pending-retained run and its held return never reaches a new head on the key", async () => {
  // The main session cannot be deleted; a direct session can.
  const requester = "agent:main:telegram:default:direct:delete-me";
  const storePath = await writeSession(requester, "parent", "before-reset");
  await addChild("elected", true, requester);
  const text = "elected result before delete";
  await leavePendingRetention(
    storePath,
    async () => {
      await returnFromElected(text, requester);
    },
    requester,
  );
  expect(await returnRows()).toHaveLength(1);

  const deletion = adminCall({ key: requester });
  await sessionDeleteHandlers["sessions.delete"]!(deletion.request);
  expect(deletion.respond).toHaveBeenCalledWith(true, expect.anything(), undefined);
  expect(displayStatus("elected")).toBe("killed");

  await writeSession(requester, "new-head", "new-head-revision");
  // Delete advanced the recipient authority epoch: replay skips the row without queueing it.
  const [held] = await returnRows();
  expect(await replay(held!)).toBe("returned");
  expect(parentEvents(text, requester)).toEqual([]);
  await resolveContinuationResetRetentions({
    cfg: getRuntimeConfig(),
    markedBefore: Date.now() + 1,
  });

  expect(subagentRuns.get("elected")?.continuationResetRetention?.state).toBe("orphaned");
  expect(await returnRows()).toEqual([]);
  expect(parentEvents(text, requester)).toEqual([]);
});
