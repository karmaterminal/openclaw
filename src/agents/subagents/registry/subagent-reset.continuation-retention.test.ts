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
import { loadSessionEntry } from "../../../config/sessions/session-accessor.js";
import { createChatAbortContext } from "../../../gateway/server-methods/chat.abort.test-helpers.js";
import { sessionDeleteHandlers } from "../../../gateway/server-methods/sessions-delete.js";
import { sessionMutationHandlers } from "../../../gateway/server-methods/sessions-mutations.js";
import { registerInternalHook, unregisterInternalHook } from "../../../hooks/internal-hooks.js";
import { killSubagentRunAdmin } from "./subagent-control-kill.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import {
  childKey,
  createResetRetentionFixture,
  parentKey,
} from "./subagent-reset.continuation-retention.test-support.js";
import { resolveSubagentDisplayStatus } from "./subagent-session-metrics.js";

const fixture = useSubagentControlFixture();
beforeEach(async () => captureRuntimeConfigAsyncReader()());
const {
  writeSession,
  addChild,
  returnFrom,
  returnRows,
  replay,
  queuedEvents,
  leavePendingRetention,
} = createResetRetentionFixture(() => fixture.stateDir);
const WAITING = "waiting for external continuation";

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

it("delete stops a pending-retained run and its held return never reaches a new head on the key", async () => {
  // The main session cannot be deleted; a direct session can.
  const requester = "agent:main:telegram:default:direct:delete-me";
  const storePath = await writeSession(requester, "parent", "before-reset");
  await addChild("elected", true, requester);
  const text = "elected result before delete";
  await leavePendingRetention(storePath, {
    requester,
    during: async () => {
      await returnFrom("elected", text, requester);
    },
  });
  expect(retentionState("elected")).toBe("pending");
  expect(await returnRows("elected")).toHaveLength(1);

  const deletion = adminCall({ key: requester });
  await sessionDeleteHandlers["sessions.delete"]!(deletion.request);
  expect(deletion.respond).toHaveBeenCalledWith(true, expect.anything(), undefined);
  expect(displayStatus("elected")).toBe("killed");

  await writeSession(requester, "new-head", "new-head-revision");
  // Delete advanced the recipient authority epoch: replay skips the row without queueing it.
  const [held] = await returnRows("elected");
  expect(await replay(held!)).toBe("returned");
  expect(queuedEvents(text, requester)).toEqual([]);
  await resolveContinuationResetRetentions({
    cfg: getRuntimeConfig(),
    markedBefore: Date.now() + 1,
  });

  expect(retentionState("elected")).toBe("orphaned");
  expect(await returnRows("elected")).toEqual([]);
  expect(queuedEvents(text, requester)).toEqual([]);
});
