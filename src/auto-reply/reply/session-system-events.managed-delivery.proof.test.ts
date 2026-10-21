// Continuation (karmaterminal): proves managed system-event deliveries are acked only after the adopting turn commits, stay owned by that turn, and never cross agent stores.
//
// Real: the continuation-return producer, the in-memory system-event queue, the
// SQLite session-delivery queue, session stores and transcripts in a temp state
// dir, the replay executor, prompt preparation, final adoption and the managed
// turn lifecycle. Observed only: a pass-through spy on the durable ack, which one
// case makes fail once.
import { expectDefined } from "@openclaw/normalization-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSessionStorePathCore } from "../../config/sessions.js";
import {
  appendTranscriptMessage,
  assignSessionOwner,
  captureSessionRecipientAuthority,
  upsertSessionEntryCore,
} from "../../config/sessions/session-accessor.js";
import { deliverQueuedSessionDelivery } from "../../gateway/server-restart-sentinel.js";
import {
  ackSessionDelivery,
  enqueueSessionDelivery,
  loadPendingSessionDeliveries,
} from "../../infra/session-delivery-queue-storage.js";
import {
  resolveSystemEventQueueKey,
  withSystemEventOwner,
} from "../../infra/system-event-ownership.js";
import {
  enqueueSystemEvent,
  peekSystemEventEntries,
  resetSystemEventsForTest,
} from "../../infra/system-events.js";
import { closeOpenClawAgentDatabasesAsync } from "../../state/openclaw-agent-db.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import { captureContinuationQueueContext } from "../continuation/queue-context.js";
import { enqueueContinuationReturnDeliveries } from "../continuation/targeting.js";
import { bindManagedDeliveryReplyTurn } from "./managed-delivery-turn-lifecycle.js";
import {
  resolveFinalSystemEventAdoption,
  type PreparedManagedSystemEventDelivery,
} from "./session-system-event-adoption.js";
import { prepareFormattedSystemEvents } from "./session-system-events.js";

vi.mock("../../infra/session-delivery-queue-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../infra/session-delivery-queue-storage.js")>();
  return { ...actual, ackSessionDelivery: vi.fn(actual.ackSessionDelivery) };
});

type Scope = { agentId: string; sessionKey: string };
type Deliveries = ReadonlyMap<string, PreparedManagedSystemEventDelivery>;

const ownerA = { type: "human" as const, source: "unknown" as const, id: "owner-a" };
const custody = useContinuationCustodyTestState();

afterEach(async () => {
  resetSystemEventsForTest();
  vi.mocked(ackSessionDelivery).mockClear();
  // Preparation reads through the worker-backed reader, which retains agent databases.
  await closeOpenClawAgentDatabasesAsync(custody.stateDir());
});

function storePath(scope: Scope): string {
  return resolveSessionStorePathCore(undefined, { agentId: scope.agentId });
}

function sessionId(scope: Scope): string {
  return `${scope.agentId}-${scope.sessionKey.replaceAll(":", "-")}-session`;
}

async function seedSession(scope: Scope): Promise<void> {
  await upsertSessionEntryCore(scope, {
    sessionId: sessionId(scope),
    updatedAt: Date.now(),
    createdActor: ownerA,
  });
}

/** The real continuation-return producer: a durable row plus its fast-path event. */
async function produce(scope: Scope, text: string): Promise<string> {
  const result = await enqueueContinuationReturnDeliveries({
    targetSessionKeys: [scope.sessionKey],
    recipientAgentIds: new Map([[scope.sessionKey, scope.agentId]]),
    text,
    idempotencyKeyBase: `continuation-return:${text}`,
    ownerAgentId: scope.agentId,
    stateDir: custody.stateDir(),
  });
  expect(result.delivered).toBe(1);
  return expectDefined(result.deliveryIds[0], "delivery id");
}

/**
 * What the producer writes for an authority-bound return: its own pre-check
 * cannot scope an unqualified key to its recipient agent, so write the row and
 * event directly for the global-scope cases.
 */
async function produceBound(scope: Scope, text: string): Promise<string> {
  const stateDir = custody.stateDir();
  const recipientAuthority = await captureSessionRecipientAuthority(scope);
  const id = await enqueueSessionDelivery(
    {
      kind: "systemEvent",
      sessionKey: scope.sessionKey,
      agentId: scope.agentId,
      text,
      idempotencyKey: `continuation-return:${text}:${scope.sessionKey}`,
      recipientAuthority,
      awaitPromptAdoption: true,
      returnWake: false,
    },
    captureContinuationQueueContext(stateDir),
  );
  expect(
    enqueueSystemEvent(
      text,
      withSystemEventOwner(
        {
          sessionKey: scope.sessionKey,
          trusted: true,
          recipientAuthority,
          sessionDeliveryAckId: id,
          sessionDeliveryAckStateDir: stateDir,
          sessionDeliveryAwaitsTurnAdoption: true,
        },
        scope.agentId,
      ),
    ),
  ).toBe(true);
  return id;
}

/** Production admission: prepare, then resolve final adoption as get-reply-run-admission does. */
async function prepareTurn(scope: Scope): Promise<{ prompt: string; deliveries: Deliveries }> {
  const prepared = await prepareFormattedSystemEvents({
    cfg: {},
    agentId: scope.agentId,
    sessionKey: scope.sessionKey,
    isMainSession: false,
    isNewSession: false,
  });
  let adoption = resolveFinalSystemEventAdoption({ prepared: [prepared] });
  while (adoption.kind === "settle-stale") {
    await adoption.settle();
    adoption = resolveFinalSystemEventAdoption({ prepared: [prepared] });
  }
  return {
    prompt: adoption.blocks.map((block) => block.text).join("\n"),
    deliveries: adoption.managedDeliveries,
  };
}

/** The turn's lifecycle takes the prepared deliveries, as get-reply-run-execute binds them. */
function bindTurn(deliveries: Deliveries, persisted: () => unknown = () => undefined) {
  return bindManagedDeliveryReplyTurn({
    deliveries,
    opts: { turnAdoptionLifecycle: { onAdopted: () => {} } },
    getPersistedMessage: persisted,
  });
}

/** The recorder's durable user turn: the transcript row carries the adopted ack ids. */
async function commitTurn(scope: Scope, ackIds: readonly string[]): Promise<unknown> {
  const message = {
    role: "user",
    content: "adopted turn",
    timestamp: Date.now(),
    __openclaw: { sessionDeliveryAckIds: [...ackIds] },
  };
  await appendTranscriptMessage(
    {
      sessionId: sessionId(scope),
      sessionKey: scope.sessionKey,
      agentId: scope.agentId,
      storePath: storePath(scope),
    } as never,
    { message } as never,
  );
  return message;
}

async function adoptNextTurn(scope: Scope, text: string, id: string): Promise<void> {
  const turn = await prepareTurn(scope);
  expect(turn.prompt).toContain(text);
  const message = await commitTurn(scope, [id]);
  await bindTurn(turn.deliveries, () => message).lifecycle?.onAdopted();
}

/** The real replay executor over the row, as a scheduler retry or pending sweep runs it. */
async function replay(id: string): Promise<string> {
  const queueContext = captureContinuationQueueContext(custody.stateDir());
  const entry = (await loadPendingSessionDeliveries(queueContext)).find((row) => row.id === id);
  return await deliverQueuedSessionDelivery({
    deps: {} as never,
    entry: expectDefined(entry, `pending row ${id}`),
    stateDir: custody.stateDir(),
  }).then(
    () => "settled",
    (error: Error) => error.message,
  );
}

async function pendingIds(): Promise<string[]> {
  const queueContext = captureContinuationQueueContext(custody.stateDir());
  return (await loadPendingSessionDeliveries(queueContext)).map((row) => row.id);
}

function queuedTexts(scope: Scope): string[] {
  return peekSystemEventEntries(resolveSystemEventQueueKey(scope.sessionKey, scope.agentId)).map(
    (event) => event.text,
  );
}

function ackCalls(id: string): number {
  return vi.mocked(ackSessionDelivery).mock.calls.filter(([ackId]) => ackId === id).length;
}

const AWAITING_ADOPTION = "system event is awaiting durable prompt adoption";

describe.each([
  { name: "default agent", scope: { agentId: "main", sessionKey: "agent:main:managed-proof" } },
  { name: "non-default agent", scope: { agentId: "ops", sessionKey: "agent:ops:managed-proof" } },
])("managed system-event delivery ($name)", ({ scope }) => {
  it("positive: acks the delivery once, only after the adopting turn commits", async () => {
    await seedSession(scope);
    const id = await produce(scope, "RETURN-COMMIT");

    const turn = await prepareTurn(scope);
    expect(turn.prompt).toContain("RETURN-COMMIT");
    expect([...turn.deliveries.keys()]).toEqual([id]);
    expect(ackCalls(id)).toBe(0);
    expect(await pendingIds()).toEqual([id]);
    expect(queuedTexts(scope)).toEqual([]);

    let persisted: unknown;
    const bound = bindTurn(turn.deliveries, () => persisted);
    persisted = await commitTurn(scope, [id]);
    // The transcript commit alone settles nothing; adoption does.
    expect(ackCalls(id)).toBe(0);
    await bound.lifecycle?.onAdopted();
    await bound.lifecycle?.onSettled?.();

    expect(ackCalls(id)).toBe(1);
    expect(await pendingIds()).toEqual([]);
    expect(queuedTexts(scope)).toEqual([]);
    expect((await prepareTurn(scope)).prompt).not.toContain("RETURN-COMMIT");
    expect(ackCalls(id)).toBe(1);
  });

  it("negative: a turn that fails before commit never acks; its delivery returns to the queue once", async () => {
    await seedSession(scope);
    const id = await produce(scope, "RETURN-FAILED-TURN");
    const turn = await prepareTurn(scope);
    const bound = bindTurn(turn.deliveries);

    await expect(
      bound.run(async () => {
        throw new Error("model failed before commit");
      }),
    ).rejects.toThrow("model failed before commit");
    await bound.lifecycle?.onSettled?.();

    expect(ackCalls(id)).toBe(0);
    expect(await pendingIds()).toEqual([id]);
    expect(queuedTexts(scope)).toEqual(["RETURN-FAILED-TURN"]);
    await adoptNextTurn(scope, "RETURN-FAILED-TURN", id);
    expect(ackCalls(id)).toBe(1);
    expect(await pendingIds()).toEqual([]);
  });

  it("interleaving: while a turn holds the delivery, a replay cannot re-queue it for a concurrent turn; abandonment returns it once", async () => {
    await seedSession(scope);
    const id = await produce(scope, "RETURN-HELD");
    const held = bindTurn((await prepareTurn(scope)).deliveries);

    expect(await replay(id)).toBe(AWAITING_ADOPTION);
    expect(queuedTexts(scope)).toEqual([]);
    const concurrent = await prepareTurn(scope);
    expect(concurrent.prompt).not.toContain("RETURN-HELD");
    expect(concurrent.deliveries.size).toBe(0);

    await held.lifecycle?.onAbandoned?.();
    expect(queuedTexts(scope)).toEqual(["RETURN-HELD"]);
    expect(await replay(id)).toBe(AWAITING_ADOPTION);
    expect(queuedTexts(scope)).toEqual(["RETURN-HELD"]);
    expect(ackCalls(id)).toBe(0);

    await adoptNextTurn(scope, "RETURN-HELD", id);
    expect(ackCalls(id)).toBe(1);
    expect(await pendingIds()).toEqual([]);
  });

  it("interleaving: an ack that fails after commit keeps the row pending, and replay settles it from the transcript without re-injecting it", async () => {
    await seedSession(scope);
    const id = await produce(scope, "RETURN-ACK-FAILS");
    const turn = await prepareTurn(scope);
    const persisted = await commitTurn(scope, [id]);
    const bound = bindTurn(turn.deliveries, () => persisted);
    vi.mocked(ackSessionDelivery).mockRejectedValueOnce(new Error("state database busy"));

    await expect(bound.lifecycle?.onAdopted()).rejects.toThrow("state database busy");
    await bound.lifecycle?.onSettled?.();
    expect(await pendingIds()).toEqual([id]);
    // Adopted turns never restore: the transcript already carries this outcome.
    expect(queuedTexts(scope)).toEqual([]);

    // The failed ack released the claim, so the pending row replays into the queue.
    expect(await replay(id)).toBe(AWAITING_ADOPTION);
    expect(queuedTexts(scope)).toEqual(["RETURN-ACK-FAILS"]);
    const next = await prepareTurn(scope);

    expect(next.prompt).not.toContain("RETURN-ACK-FAILS");
    expect(next.deliveries.size).toBe(0);
    expect(await pendingIds()).toEqual([]);
    expect(ackCalls(id)).toBe(2);
    expect((await prepareTurn(scope)).prompt).not.toContain("RETURN-ACK-FAILS");
    expect(ackCalls(id)).toBe(2);
  });
});

describe("managed system-event delivery (non-default agent, global scope)", () => {
  const ops = { agentId: "ops", sessionKey: "global" };
  const main = { agentId: "main", sessionKey: "global" };

  it("positive and negative: only the owning agent's turn admits the delivery, judged against its own store", async () => {
    await seedSession(ops);
    await seedSession(main);
    const id = await produceBound(ops, "OPS-GLOBAL-RETURN");
    enqueueSystemEvent(
      "MAIN-GLOBAL-NOTICE",
      withSystemEventOwner({ sessionKey: "global" }, "main"),
    );

    const mainTurn = await prepareTurn(main);
    expect(mainTurn.prompt).toContain("MAIN-GLOBAL-NOTICE");
    expect(mainTurn.prompt).not.toContain("OPS-GLOBAL-RETURN");
    expect(await pendingIds()).toEqual([id]);

    const opsTurn = await prepareTurn(ops);
    expect(opsTurn.prompt).toContain("OPS-GLOBAL-RETURN");
    expect(opsTurn.prompt).not.toContain("MAIN-GLOBAL-NOTICE");
    expect([...opsTurn.deliveries.keys()]).toEqual([id]);
    expect(ackCalls(id)).toBe(0);
    const persisted = await commitTurn(ops, [id]);
    await bindTurn(opsTurn.deliveries, () => persisted).lifecycle?.onAdopted();

    expect(ackCalls(id)).toBe(1);
    expect(await pendingIds()).toEqual([]);
  });

  it("interleaving: a writer on the default agent's same-named session cannot stale the held delivery, but its own owner change does", async () => {
    await seedSession(ops);
    await seedSession(main);
    const kept = await produceBound(ops, "OPS-KEPT-RETURN");
    const prepared = await prepareFormattedSystemEvents({
      cfg: {},
      ...ops,
      isMainSession: false,
      isNewSession: false,
    });
    const reassign = (scope: Scope) =>
      assignSessionOwner(scope, {
        owner: { type: "human", id: "owner-b" },
        assignedBy: ownerA,
        assignedAt: Date.now(),
      });

    expect(reassign(main)).not.toBeNull();
    const adoption = resolveFinalSystemEventAdoption({ prepared: [prepared] });
    if (adoption.kind !== "adopted") {
      throw new Error("a default-agent writer staled the non-default agent's delivery");
    }
    expect([...adoption.managedDeliveries.keys()]).toEqual([kept]);

    expect(reassign(ops)).not.toBeNull();
    const stale = resolveFinalSystemEventAdoption({ prepared: [prepared] });
    if (stale.kind !== "settle-stale") {
      throw new Error("the owning agent's owner change did not stale its delivery");
    }
    await stale.settle();
    const final = resolveFinalSystemEventAdoption({ prepared: [prepared] });
    expect(final).toMatchObject({ kind: "adopted", blocks: [] });
    expect(final.kind === "adopted" ? final.managedDeliveries.size : -1).toBe(0);
    // Stale authority retires the row instead of leaving it to replay into a new owner.
    expect(await pendingIds()).toEqual([]);
    expect(queuedTexts(ops)).toEqual([]);
  });
});
