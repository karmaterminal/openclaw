// Frond (karmaterminal, #1415): real durable ingress feeding the real session mailbox, shared by the
// room-event collect and ambient owner aggregate fixtures.
import { expect, vi } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import { resolveRequesterPrincipalKey } from "../../agents/requester-origin.js";
import type { InboundEventKind } from "../../channels/inbound-event/kind.js";
import {
  bindIngressLifecycleToReplyOptions,
  type ChannelIngressDispatchLifecycle,
} from "../../channels/message/ingress-drain-lifecycle.js";
import { createChannelIngressDrain } from "../../channels/message/ingress-drain.js";
import {
  createTestIngressQueue,
  withTempState,
} from "../../channels/message/ingress-drain.test-helpers.js";
import { createUserTurnTranscriptRecorder } from "../../sessions/user-turn-transcript.js";
import { createTestUserTurnTranscriptTarget } from "../../sessions/user-turn-transcript.test-support.js";
import {
  admitFollowupRunLifecycle,
  enqueueFollowupRun,
  scheduleFollowupDrain,
  type FollowupRun,
  type QueueSettings,
} from "./queue.js";
import { createQueueTestRun } from "./queue.test-helpers.js";
import { stageBundledDiscordGateway } from "./queue/room-aggregate-plugin-gate.test-support.js";
import { clearFollowupQueue, getExistingFollowupQueue } from "./queue/state.js";

export const COLLECT_TITLE = "[Queued messages while agent was busy]";
const ROOM_LANE = "discord:channel:room";

export type Row = {
  id: string;
  kind?: InboundEventKind;
  from?: Partial<FollowupRun["run"]>;
  /** Further source fields, built when the row is dispatched, as channel admission builds them. */
  source?: () => Partial<Omit<FollowupRun, "run">>;
};
export type Harness = Awaited<ReturnType<typeof openRoomIngress>>;

export function textOf(row: Row): string {
  return `${row.kind === "user_request" ? "mention" : "room"} message ${row.id}`;
}

/**
 * Real durable ingress (SQLite rows, drain, exclusive lifecycles) feeding the real
 * session mailbox. Only the model turn and the Discord transport are replaced.
 */
export async function openRoomIngress(
  stateDir: string,
  rows: readonly Row[],
  options: {
    settings?: Partial<QueueSettings>;
    supersedes?: (candidateId: string, pendingId: string) => boolean;
    now?: () => number;
    claimLeaseMs?: number;
    /** Give each source the transcript recorder a real admission carries. */
    transcripts?: boolean;
    enqueue?: (
      row: Row,
      lifecycle: ChannelIngressDispatchLifecycle,
    ) => FollowupRun | Promise<FollowupRun>;
  } = {},
) {
  stageBundledDiscordGateway();
  const key = `agent:main:discord:channel:room:${expect.getState().currentTestName}`;
  const settings: QueueSettings = {
    mode: "collect",
    debounceMs: 0,
    cap: 50,
    dropPolicy: "old",
    ...options.settings,
  };
  const queue = createTestIngressQueue(stateDir, options.now ? { now: options.now } : {});
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Durable commit and dead-letter writes, counted at the queue owner.
  const writes = { complete: new Map<string, number>(), fail: new Map<string, number>() };
  const record = (counts: Map<string, number>, ref: string | { id: string }) => {
    const id = typeof ref === "string" ? ref : ref.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  const complete = queue.complete.bind(queue);
  queue.complete = async (...args: Parameters<typeof complete>) => {
    record(writes.complete, args[0]);
    return await complete(...args);
  };
  const fail = queue.fail.bind(queue);
  queue.fail = async (...args: Parameters<typeof fail>) => {
    record(writes.fail, args[0]);
    return await fail(...args);
  };
  const addRow = async (row: Row) => {
    byId.set(row.id, row);
    await queue.enqueue(row.id, { text: textOf(row) }, { laneKey: ROOM_LANE });
  };
  for (const row of rows) {
    await addRow(row);
  }
  const runs = new Map<string, FollowupRun>();
  let dispatched = createDeferred();
  const enqueueRoomRun = (row: Row, lifecycle: ChannelIngressDispatchLifecycle) => {
    const { turnAdoptionLifecycle } = bindIngressLifecycleToReplyOptions(lifecycle);
    const run = createQueueTestRun(
      {
        prompt: textOf(row),
        messageId: row.id,
        originatingChannel: "discord",
        originatingTo: "channel:room",
        originatingChatType: "channel",
        currentInboundEventKind: row.kind ?? "room_event",
        turnAdoptionLifecycle,
        // Room events inherit the ingress admission fence as their queued cancel signal.
        abortSignal: turnAdoptionLifecycle.abortSignal,
        userTurnTranscriptRecorder: options.transcripts
          ? createUserTurnTranscriptRecorder({
              input: {
                text: textOf(row),
                senderIsOwner: row.from?.senderIsOwner,
                requesterOrigin: row.from?.requesterOrigin,
              },
              target: createTestUserTurnTranscriptTarget(),
              updateMode: "none",
            })
          : undefined,
        ...row.source?.(),
      },
      { sessionKey: key, senderId: "peer", messageProvider: "discord", ...row.from },
    );
    // A mid-turn source waits behind the active turn; the turn's end starts the drain.
    expect(enqueueFollowupRun(key, run, settings, "message-id", undefined, false)).toBe(true);
    return run;
  };
  const drain = createChannelIngressDrain({
    queue,
    deferredLaneOccupancy: "release",
    retryPolicy: { baseMs: 1, maxMs: 1 },
    ...(options.now ? { now: options.now } : {}),
    ...(options.claimLeaseMs ? { claimLeaseMs: options.claimLeaseMs } : {}),
    ...(options.supersedes
      ? {
          shouldSupersedePending: (candidate: { id: string }, pending: { id: string }): boolean =>
            options.supersedes!(candidate.id, pending.id),
        }
      : {}),
    dispatchClaimedEvent: async (event, lifecycle) => {
      const row = byId.get(event.id) ?? { id: event.id };
      runs.set(row.id, await (options.enqueue ?? enqueueRoomRun)(row, lifecycle));
      dispatched.resolve();
      dispatched = createDeferred();
      return { kind: "deferred" as const };
    },
  });
  /** Discord releases the lane at deferral, so each pass claims the next row. */
  const dispatchRows = async (count = rows.length) => {
    for (let index = 0; index < count; index += 1) {
      const next = dispatched.promise;
      expect(await drain.drainOnce()).toEqual({ started: 1 });
      await next;
    }
  };
  const calls: FollowupRun[] = [];
  /** Production adoption point: the turn adopts its sources before model work. */
  const adoptAndRecord = async (run: FollowupRun) => {
    calls.push(run);
    await admitFollowupRunLifecycle(run);
  };
  /** The active room turn ends; its successor drains the mailbox. */
  const endActiveTurn = async (execute = adoptAndRecord, onScheduled = () => {}) => {
    const settlements = (getExistingFollowupQueue(key)?.entries ?? []).map(
      (input) => input.settlement.promise,
    );
    scheduleFollowupDrain(key, execute);
    onScheduled();
    await Promise.allSettled(settlements);
    await vi.waitFor(() => expect(getExistingFollowupQueue(key)).toBeUndefined());
    await drain.waitForIdle();
  };
  return {
    key,
    queue,
    drain,
    addRow,
    writes,
    runs,
    calls,
    dispatchRows,
    adoptAndRecord,
    endActiveTurn,
    dispose: () => {
      drain.dispose();
      clearFollowupQueue(key);
    },
  };
}

export async function withRoomIngress(
  rows: readonly Row[],
  run: (harness: Harness) => Promise<void>,
  options?: Parameters<typeof openRoomIngress>[2],
): Promise<void> {
  await withTempState(async (stateDir) => {
    const harness = await openRoomIngress(stateDir, rows, options);
    try {
      await run(harness);
    } finally {
      harness.dispose();
    }
  });
}

export function collected(run: FollowupRun | undefined, rows: readonly Row[]) {
  expect(run?.prompt.startsWith(COLLECT_TITLE)).toBe(true);
  for (const [index, row] of rows.entries()) {
    expect(run?.prompt).toContain(`Queued #${index + 1} (from `);
    expect(run?.prompt).toContain(textOf(row));
  }
  expect(run?.prompt).not.toContain(`Queued #${rows.length + 1}`);
}

export async function expectSettledOnce(
  harness: Harness,
  completed: string[],
  failed: string[] = [],
) {
  expect(Object.fromEntries(harness.writes.complete)).toEqual(
    Object.fromEntries(completed.map((id) => [id, 1])),
  );
  expect(Object.fromEntries(harness.writes.fail)).toEqual(
    Object.fromEntries(failed.map((id) => [id, 1])),
  );
  expect(await harness.queue.listPending()).toEqual([]);
  expect(await harness.queue.listClaims()).toEqual([]);
}

export const ROOM_ORIGIN = {
  sessionKey: "agent:main:discord:channel:room",
  messageProvider: "discord",
  accountId: "default",
  chatType: "channel",
  conversationId: "channel:room",
  groupId: "room",
  groupChannel: "#room",
} as const;

/** A non-owner room participant as channel admission records it. */
export function sender(
  id: string,
  extra: Partial<FollowupRun["run"]> = {},
): Partial<FollowupRun["run"]> {
  return {
    senderId: id,
    senderName: id,
    senderUsername: `${id}-handle`,
    senderIsOwner: false,
    memberRoleIds: [`role-${id}`],
    requesterOrigin: {
      ...ROOM_ORIGIN,
      senderId: id,
      senderName: id,
      senderUsername: `${id}-handle`,
    },
    ...extra,
  };
}

export const owner = sender("owner", { senderIsOwner: true, traceAuthorized: true });

export type Shared = Pick<FollowupRun["run"], "execOverrides">;

/** One turn keeps every member's identity, order and content, and no member's authority. */
export function aggregated(
  run: FollowupRun | undefined,
  rows: readonly Row[],
  shared: Shared = {},
) {
  collected(run, rows);
  for (const [index, row] of rows.entries()) {
    expect(run?.prompt).toContain(`Queued #${index + 1} (from ${row.from?.senderName})`);
  }
  expectRoomBaseline(run, shared);
}

/**
 * A selector regression no production path has: the next selected claim reaches the drain
 * widened over the following waiting input, whatever its batch identity.
 */
export function widenNextClaim(key: string) {
  const mailbox = getExistingFollowupQueue(key)!;
  const dispatch = mailbox.dispatch!;
  mailbox.dispatch = async (claim) => {
    mailbox.dispatch = dispatch;
    const next = mailbox.entries.find((input) => input.phase === "waiting")!;
    next.phase = "claimed";
    next.claim = claim;
    claim.inputs = [...claim.inputs, next];
    claim.sources = [...claim.sources, next.source!];
    await dispatch(claim);
  };
}

/**
 * The turn runs as the senderless room: no principal, owner bit or sender-scoped authority.
 * `shared` names authority every member carries identically, such as the agent's exec defaults.
 */
export function expectRoomBaseline(run: FollowupRun | undefined, shared: Shared = {}) {
  expect(run?.currentInboundEventKind).toBe("room_event");
  expect(run?.operatorAuthority).toBeUndefined();
  expect(run?.createChannelCronAuthority).toBeUndefined();
  const execution = run!.run;
  expect({
    senderId: execution.senderId,
    senderName: execution.senderName,
    senderUsername: execution.senderUsername,
    senderE164: execution.senderE164,
    senderIsOwner: execution.senderIsOwner,
    traceAuthorized: execution.traceAuthorized,
    operatorProfileId: execution.operatorProfileId,
    memberRoleIds: execution.memberRoleIds,
    gitContributorProfileId: execution.gitContributorProfileId,
    execOverrides: execution.execOverrides,
    approvalReviewerDeviceId: execution.approvalReviewerDeviceId,
    conversationToolPolicy: execution.conversationToolPolicy,
    runtimePluginToolGrant: execution.runtimePluginToolGrant,
  }).toEqual({ senderIsOwner: false, traceAuthorized: false, ...shared });
  expect(execution.requesterOrigin).toEqual(ROOM_ORIGIN);
  expect(
    resolveRequesterPrincipalKey({ ...execution, messageChannel: run!.originatingChannel }),
  ).toBeUndefined();
}
