// Continuation (karmaterminal): restart custody for accepted delegates, on upstream #185730's
// restart semantics (🌊's ruling, karmaterminal/openclaw-bootstrap#1727). A continuation
// delegate hands custody to its `subagent_runs` row at admission (RFC
// docs/design/continue-work-signal-v2.md §5.4.4), so that row is the per-child custody receipt.
// 1. A graceful kill of an accepted delegate is terminal with a recorded interruption, and is
//    never a successful return. After restart its delivery is a terminal intentional
//    non-delivery, not a pending result the requester waits for; a child that already handed
//    its result to the requester keeps that handoff.
// 2. A delegate row the previous Gateway lifecycle left running has no execution owner; the
//    next activation settles it to an explicit interrupted outcome. It is never relaunched and
//    carries no completion text.
// 3. The root's generic resume input is not a substitute for that per-child receipt.
// 4. The parent can inspect that row itself: its `subagents` tool and its next turn's runtime
//    facts show the child ended, and a run snapshot names the restart interruption. This is an
//    inspection path, not a completion return: nothing is delivered to the parent.
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { useSubagentControlFixture } from "./subagent-control.test-support.js";
import fs from "node:fs/promises";
import path from "node:path";
import { expect, it, vi } from "vitest";
import * as sessionEventHandoff from "../../../auto-reply/reply/session-event-handoff.js";
import { getRuntimeConfig } from "../../../config/config.js";
import { loadExactSessionEntry } from "../../../config/sessions/session-accessor.js";
import { resolveContextEngine } from "../../../context-engine/registry.js";
import type { GatewayRequestContext } from "../../../gateway/server-methods/types.js";
import { createContext } from "../../../gateway/server-plugin-in-process-dispatch.test-support.js";
import {
  persistRunningSessionsForRestart,
  resumeMarkedSessions,
} from "../../../gateway/session-restart-resume.js";
import {
  emitAgentEvent,
  getAgentEventLifecycleGeneration,
  rotateAgentEventLifecycleGeneration,
} from "../../../infra/agent-events.js";
import { claimAgentRunContext, releaseAgentRunContext } from "../../../infra/agent-run-registry.js";
import { bindGatewayContextResolver } from "../../../plugins/runtime/gateway-request-scope.js";
import { buildRuntimeFactsContext } from "../../runtime-facts-prompt.js";
import { createSubagentsTool } from "../../tools/subagents-tool.js";
import { resolveSubagentSessionAttachmentRootDir } from "../subagent-attachment-paths.js";
import { PROVISIONAL_KILL_RECONCILIATION_MS } from "./subagent-registry-helpers.js";
import { subagentRuns } from "./subagent-registry-memory.js";
import { loadSubagentRegistryFromSqlite } from "./subagent-registry-state.fixture.test-support.js";
import { writeSubagentSessionEntry } from "./subagent-registry.persistence.test-support.js";
import {
  activateSubagentRegistry,
  addSubagentRunForTests,
  isSubagentRunLive,
  listUnsettledRequesterChildren,
  markSubagentRunTerminated,
  registerSubagentRun,
  resetSubagentRegistryForTests,
  terminateLiveSubagentsForShutdown,
  testing,
} from "./subagent-registry.test-helpers.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

const fixture = useSubagentControlFixture();
const parent = "agent:main:main";
const gatewayContext = {
  resolveGatewayContext: () => gatewayContext,
} as unknown as GatewayRequestContext;
const resolveGateway = () => gatewayContext;

/** An accepted `continue_delegate` child, as its spawn owner registers it. */
async function addRunningChild(
  runId: string,
  overrides: Partial<Omit<SubagentRunRecord, "runId">> = {},
): Promise<SubagentRunRecord> {
  const childSessionKey = `agent:main:subagent:${runId}`;
  await writeSubagentSessionEntry({
    stateDir: fixture.stateDir,
    agentId: "main",
    sessionKey: childSessionKey,
    defaultSessionId: `sess-${runId}`,
  });
  const startedAt = Date.now() - 1_000;
  await addSubagentRunForTests({
    runId,
    childSessionKey,
    childAgentId: "main",
    requesterSessionKey: parent,
    requesterDisplayKey: "main",
    task: `[continuation:chain-hop:1] Delegated task (turn 1/5): ${runId}`,
    cleanup: "keep",
    expectsCompletionMessage: true,
    drainsContinuationDelegateQueue: true,
    createdAt: startedAt,
    execution: {
      status: "running",
      startedAt,
      lifecycleGeneration: getAgentEventLifecycleGeneration(),
    },
    ...overrides,
  });
  const row = subagentRuns.get(runId)!;
  // The spawn owner registers under the Gateway that admitted the child.
  bindGatewayContextResolver(row, resolveGateway);
  return row;
}

/** Graceful shutdown of the current lifecycle, with `live` holding a running execution. */
async function shutDownGracefully(live: SubagentRunRecord[]) {
  const claims = live.map((row) =>
    claimAgentRunContext(
      row.runId,
      { sessionKey: row.childSessionKey },
      { trackOwner: true, ownsContext: true },
    ),
  );
  try {
    for (const row of live) {
      expect(isSubagentRunLive(row)).toBe(true);
    }
    await persistRunningSessionsForRestart({ cfg: {} });
    await terminateLiveSubagentsForShutdown(resolveGateway);
  } finally {
    live.forEach((row, index) => releaseAgentRunContext(row.runId, claims[index]));
  }
}

/** A new Gateway lifecycle on the same state: nothing in memory, a rotated generation. */
async function restartGateway() {
  await fixture.settle();
  await resetSubagentRegistryForTests({ persist: false });
  rotateAgentEventLifecycleGeneration();
  await activateSubagentRegistry(resolveGateway);
  await fixture.settle();
}

function expectInterrupted(row: SubagentRunRecord | undefined) {
  expect(row?.execution).toMatchObject({
    status: "terminal",
    endedAt: expect.any(Number),
    outcome: { status: "error", error: expect.stringContaining("interrupted") },
  });
  expect(row?.completion?.resultText ?? undefined).toBeUndefined();
  // Recorded as intentionally not delivered: nothing wakes or notifies the requester.
  expect(row?.delivery).toMatchObject({ disposition: "intentional_non_delivery" });
}

function expectGracefullyKilled(row: SubagentRunRecord | undefined) {
  expect(row?.execution).toMatchObject({
    status: "terminal",
    outcome: { status: "error", error: "Gateway stopped" },
  });
  expect(row?.endedReason).toBe("subagent-killed");
  expect(row?.completion?.resultText ?? undefined).toBeUndefined();
}

it("1: a graceful kill of an accepted delegate is terminal with its interruption, never a success return", async () => {
  const child = await addRunningChild("graceful-delegate");
  // A plain (non-continuation) child the same shutdown kills keeps upstream's restart semantics.
  const plain = await addRunningChild("graceful-plain", {
    drainsContinuationDelegateQueue: undefined,
  });
  await shutDownGracefully([child, plain]);
  const killed = loadSubagentRegistryFromSqlite().get("graceful-delegate");
  expectGracefullyKilled(killed);

  await restartGateway();
  // The next lifecycle reconciles the kill, including after its reconciliation window passes.
  vi.spyOn(Date, "now").mockReturnValue(
    killed!.killReconciliation!.killedAt + PROVISIONAL_KILL_RECONCILIATION_MS + 1,
  );
  await testing.sweepOnceForTests();
  await fixture.settle();
  // A second restart restores that receipt as written: nothing reopens or relaunches it.
  await restartGateway();
  await testing.sweepOnceForTests();
  await fixture.settle();

  // Still the same interruption, inspectable by the parent, and its delivery is a terminal,
  // recorded intentional non-delivery rather than a returned or a pending result.
  const reconciled = loadSubagentRegistryFromSqlite().get("graceful-delegate");
  expectGracefullyKilled(reconciled);
  expect(reconciled?.killReconciliation).toBeUndefined();
  expect(reconciled?.delivery).toMatchObject({
    status: "not_required",
    disposition: "intentional_non_delivery",
  });
  const plainRow = loadSubagentRegistryFromSqlite().get("graceful-plain");
  expectGracefullyKilled(plainRow);
  expect(plainRow?.delivery?.status).toBe("pending");
  expect(plainRow?.delivery?.disposition).toBeUndefined();
  // The requester does not wait for it, and nothing announces, wakes, or relaunches it.
  const unsettled = await listUnsettledRequesterChildren({ requesterSessionKey: parent });
  expect(unsettled.map((entry) => entry.runId)).not.toContain("graceful-delegate");
  expect(fixture.announce).not.toHaveBeenCalled();
  expect(fixture.gateway).not.toHaveBeenCalled();
  expect(fixture.wake).not.toHaveBeenCalled();
});

it("1: a killed delegate that a yielded requester's cohort holds keeps the cohort as its owner", async () => {
  const child = await addRunningChild("cohort-delegate", {
    requesterSettleWake: {
      status: "pending",
      attemptCount: 0,
      batchRunIds: ["cohort-delegate"],
      requesterYieldBatch: true,
      requesterRunId: "yielded-requester-turn",
      yieldedFinalDeliverable: true,
      rearmGeneration: 1,
    },
  });

  await shutDownGracefully([child]);
  await restartGateway();
  await testing.sweepOnceForTests();
  await fixture.settle();

  // The cohort, not the restart, settles what the requester hears about this child.
  const held = loadSubagentRegistryFromSqlite().get("cohort-delegate");
  expectGracefullyKilled(held);
  expect(held?.requesterSettleWake).toMatchObject({ requesterYieldBatch: true });
  expect(held?.delivery?.status).toBe("pending");
  expect(held?.delivery?.disposition).toBeUndefined();
});

it("1: an abort the restart caught before its kill was confirmed settles the same, without child-session effects", async () => {
  const child = await addRunningChild("aborted-delegate");
  const claim = claimAgentRunContext(
    child.runId,
    { sessionKey: child.childSessionKey },
    { trackOwner: true, ownsContext: true },
  );
  try {
    // The requester's abort cascade: no notice to the requester, but the child's session
    // effects stay with the kill.
    await markSubagentRunTerminated({
      runId: child.runId,
      reason: "killed by requester",
      suppressTaskDelivery: true,
    });
  } finally {
    releaseAgentRunContext(child.runId, claim);
  }
  expect(loadSubagentRegistryFromSqlite().get("aborted-delegate")).toMatchObject({
    endedReason: "subagent-killed",
    killReconciliation: { suppressTaskDelivery: true },
    delivery: { status: "pending" },
  });
  await fixture.settle();
  fixture.cleanup.mockClear();
  vi.mocked(resolveContextEngine).mockClear();

  await restartGateway();

  const settled = loadSubagentRegistryFromSqlite().get("aborted-delegate");
  expect(settled?.execution).toMatchObject({
    status: "terminal",
    suppressSessionEffects: true,
    outcome: { status: "error", error: "killed by requester" },
  });
  expect(settled?.completion?.resultText ?? undefined).toBeUndefined();
  expect(settled?.killReconciliation).toBeUndefined();
  expect(settled?.delivery).toMatchObject({
    status: "not_required",
    disposition: "intentional_non_delivery",
  });
  // The restarted Gateway does not own the earlier lifecycle's child-session effects: retired
  // completion authority suppresses them, though the abort's kill left them on.
  expect(fixture.cleanup).not.toHaveBeenCalled();
  expect(resolveContextEngine).not.toHaveBeenCalled();
  expect(fixture.announce).not.toHaveBeenCalled();
  expect(fixture.gateway).not.toHaveBeenCalled();
  expect(fixture.wake).not.toHaveBeenCalled();
});

it.each([
  ["an ordinary child", undefined],
  ["an accepted delegate", true],
] as const)(
  "1: %s that handed its result to the requester keeps that pending handoff across a restart",
  async (_name, drainsContinuationDelegateQueue) => {
    const childSessionKey = "agent:main:subagent:handoff-child";
    const sessionEntry = { sessionId: "sess-handoff-child", lifecycleRevision: "handoff-child" };
    await writeSubagentSessionEntry({
      stateDir: fixture.stateDir,
      agentId: "main",
      sessionKey: parent,
      defaultSessionId: "sess-parent",
    });
    await writeSubagentSessionEntry({
      stateDir: fixture.stateDir,
      agentId: "main",
      sessionKey: childSessionKey,
      defaultSessionId: sessionEntry.sessionId,
      lifecycleRevision: sessionEntry.lifecycleRevision,
    });
    await registerSubagentRun({
      runId: "handoff-child",
      childSessionKey,
      sessionEntry,
      childAgentId: "main",
      requesterSessionKey: parent,
      requesterAgentId: "main",
      requesterDisplayKey: "main",
      task: "[continuation:chain-hop:1] Delegated task (turn 1/5): handoff-child",
      cleanup: "keep",
      expectsCompletionMessage: true,
      drainsContinuationDelegateQueue,
      gatewayContextResolver: resolveGateway,
    });
    // The requester accepted the result and will consume it on its own turn.
    fixture.announce.mockImplementation(async (params) => {
      await params.onDeliveryResult?.({
        delivered: false,
        path: "none",
        reason: "completion_handoff_pending",
        terminal: true,
      });
      return "requester_waiting";
    });
    emitAgentEvent({
      runId: "handoff-child",
      sessionKey: childSessionKey,
      stream: "lifecycle",
      data: {
        phase: "end",
        endedAt: Date.now(),
        terminalReply: { disposition: "visible", text: "Synthetic child result." },
      },
    });
    await fixture.settle();
    const expectRequesterHandoff = (row: SubagentRunRecord | undefined) => {
      expect(row?.delivery).toMatchObject({
        status: "pending",
        requesterDelivery: { state: "waiting" },
      });
      expect(row?.delivery?.disposition).toBeUndefined();
    };
    expectRequesterHandoff(loadSubagentRegistryFromSqlite().get("handoff-child"));

    await restartGateway();
    await testing.sweepOnceForTests();
    await fixture.settle();

    // The requester still owns this result; a restart does not stamp it as not delivered.
    expectRequesterHandoff(loadSubagentRegistryFromSqlite().get("handoff-child"));
    expect(fixture.announce).toHaveBeenCalledOnce();
  },
);

it("2: a crash-restored delegate with no execution owner settles interrupted, never relaunched", async () => {
  await addRunningChild("crashed-delegate");
  // A plain (non-continuation) child keeps upstream's restored-history semantics.
  await addRunningChild("crashed-plain", { drainsContinuationDelegateQueue: undefined });
  // The process dies here: no shutdown kill, no resume marker.

  await restartGateway();
  await testing.sweepOnceForTests();
  await fixture.settle();

  const durable = loadSubagentRegistryFromSqlite();
  expectInterrupted(durable.get("crashed-delegate"));
  expectInterrupted(subagentRuns.get("crashed-delegate"));
  // The lifecycle owner finished cleanup without a requester delivery.
  expect(durable.get("crashed-delegate")).toMatchObject({
    cleanupCompletedAt: expect.any(Number),
    delivery: { status: "not_required" },
  });
  expect(durable.get("crashed-plain")?.execution.status).toBe("running");
  expect(durable.get("crashed-plain")?.execution.endedAt).toBeUndefined();
  // Not relaunched or waited on, and no completion is announced to the parent.
  expect(fixture.gateway).not.toHaveBeenCalled();
  expect(fixture.announce).not.toHaveBeenCalled();
  expect(fixture.wake).not.toHaveBeenCalled();
  // The requester no longer counts a dead child as running work it must wait for.
  const unsettled = await listUnsettledRequesterChildren({ requesterSessionKey: parent });
  expect(unsettled.map((child) => child.runId)).not.toContain("crashed-delegate");
});

it("2: a crash-restored delegate whose kill never finished settles interrupted", async () => {
  // The kill owner committed its intent, then the process died before termination.
  await addRunningChild("crashed-killing", {
    killIntent: {
      requestedAt: Date.now() - 500,
      reason: "killed by requester",
      lifecycleGeneration: getAgentEventLifecycleGeneration(),
    },
  });

  await restartGateway();
  await testing.sweepOnceForTests();
  await fixture.settle();

  const settled = loadSubagentRegistryFromSqlite().get("crashed-killing");
  expectInterrupted(settled);
  expect(settled?.killIntent).toBeUndefined();
  expect(fixture.gateway).not.toHaveBeenCalled();
  expect(fixture.announce).not.toHaveBeenCalled();
});

it("2: an interrupted delegate's materialized attachments are released", async () => {
  const attachmentId = "6f9c1a52-3b7d-4e8a-9c21-0d4e5f6a7b8c";
  const childSessionKey = "agent:main:subagent:crashed-attachments";
  const attachmentDir = path.join(
    resolveSubagentSessionAttachmentRootDir({ agentId: "main", childSessionKey }),
    attachmentId,
  );
  await fs.mkdir(attachmentDir, { recursive: true });
  await fs.writeFile(path.join(attachmentDir, "input.txt"), "input", "utf8");
  await addRunningChild("crashed-attachments", { attachmentId });

  await restartGateway();

  expectInterrupted(loadSubagentRegistryFromSqlite().get("crashed-attachments"));
  await expect(fs.stat(attachmentDir)).rejects.toMatchObject({ code: "ENOENT" });
});

it("2: an in-process restart settles the earlier lifecycle's delegate and keeps the current one", async () => {
  await addRunningChild("earlier-lifecycle");
  const killIntent = {
    requestedAt: Date.now() - 500,
    reason: "killed by requester",
    lifecycleGeneration: getAgentEventLifecycleGeneration(),
  };
  await addRunningChild("earlier-lifecycle-killing", { killIntent });
  // An in-process restart keeps module state; only the lifecycle generation rotates.
  rotateAgentEventLifecycleGeneration();
  // A delegate this lifecycle admitted before activation keeps its execution owner.
  await addRunningChild("current-lifecycle");

  await activateSubagentRegistry(resolveGateway);
  await fixture.settle();

  const durable = loadSubagentRegistryFromSqlite();
  expectInterrupted(durable.get("earlier-lifecycle"));
  expect(durable.get("current-lifecycle")?.execution.status).toBe("running");
  expect(durable.get("current-lifecycle")?.execution.endedAt).toBeUndefined();
  // A retained row's pending kill still has its owner: the sweeper's durable kill reconcile.
  expect(durable.get("earlier-lifecycle-killing")).toMatchObject({
    killIntent,
    execution: { status: "running" },
  });
  expect(fixture.gateway).not.toHaveBeenCalled();
});

it("4: the parent inspects a crash-settled delegate as interrupted by the restart", async () => {
  await addRunningChild("inspected-delegate");
  // Another requester's delegate settles too, but never reaches this parent's view.
  await addRunningChild("other-parent-delegate", {
    requesterSessionKey: "agent:main:other",
    requesterDisplayKey: "other",
  });

  await restartGateway();

  // The parent's own tool: the list names the child as ended, never active or done...
  const subagents = createSubagentsTool({ agentSessionKey: parent });
  const list = (await subagents.execute("list", { action: "list" })).details as {
    active: Array<{ runId: string }>;
    recent: Array<{ runId: string }>;
  };
  expect(list.active).toEqual([]);
  expect(list.recent).toEqual([
    expect.objectContaining({
      runId: "inspected-delegate",
      status: "failed",
      deliveryStatus: "not_required",
      endedAt: expect.any(Number),
    }),
  ]);
  // ...and a snapshot of that run shows why it ended.
  const snapshot = await subagents.execute("wait", {
    action: "wait",
    runIds: ["inspected-delegate"],
    timeoutSeconds: 0,
  });
  expect(snapshot.details).toMatchObject({
    runs: [
      {
        runId: "inspected-delegate",
        status: "terminal",
        outcome: {
          status: "error",
          error: "subagent run interrupted: the Gateway restarted before it ended",
        },
        deliveryStatus: "not_required",
        endedAt: expect.any(Number),
      },
    ],
    attention: [],
  });
  expect(snapshot.details).not.toHaveProperty("unavailable");

  // The parent's next turn carries the same ended row, and no result awaiting delivery.
  const facts = (
    await buildRuntimeFactsContext({
      cfg: getRuntimeConfig(),
      executionHost: false,
      capabilityToolNames: new Set(["sessions_spawn", "subagents", "continue_delegate"]),
      sessionKey: parent,
      agentId: "main",
    })
  )
    .map((fragment) => fragment.text)
    .join("\n\n");
  expect(facts).toContain("## Recently Completed Subagents");
  expect(facts).toMatch(/run=inspected-delegate; status=failed; .*delivery=not_required;/);
  expect(facts).not.toContain("## Active Subagents");
  expect(facts).not.toContain("## Child results awaiting delivery");
  expect(facts).not.toContain("other-parent-delegate");
  expect(fixture.announce).not.toHaveBeenCalled();
  expect(fixture.wake).not.toHaveBeenCalled();
});

it("3: the root's resume input does not stand in for a delegate's custody receipt", async () => {
  const parentStorePath = await writeSubagentSessionEntry({
    stateDir: fixture.stateDir,
    agentId: "main",
    sessionKey: parent,
    defaultSessionId: "sess-parent",
  });
  const reached = await addRunningChild("resume-reached");
  // Accepted, but the bounded shutdown kill never reaches it: no execution was live for it in
  // this lifecycle (its run had not registered yet, or the kill did not settle in time).
  await addRunningChild("resume-unreached");

  await shutDownGracefully([reached]);
  expect(
    loadExactSessionEntry({ agentId: "main", sessionKey: parent, storePath: parentStorePath })
      ?.entry.resumeAfterRestart,
  ).toEqual({ queuedInputIds: [] });

  const enqueue = vi
    .spyOn(sessionEventHandoff, "enqueueSessionEventForHost")
    .mockImplementation(() => ({
      id: "resume-event",
      accepted: Promise.resolve({ ok: true as const }),
      cancel: () => true,
      settled: Promise.resolve({
        status: "completed" as const,
        executionStarted: true,
        delivered: true,
      }),
    }));
  await restartGateway();
  const warn = vi.fn();
  await resumeMarkedSessions({
    context: createContext(),
    signal: new AbortController().signal,
    log: { warn },
  });
  await fixture.settle();

  // The root got its one generic resume input (its text is private to the resume owner)...
  expect(enqueue.mock.calls.filter(([, options]) => options.source === "restart")).toEqual([
    [expect.any(String), expect.objectContaining({ sessionKey: parent, source: "restart" })],
  ]);
  expect(warn).not.toHaveBeenCalled();
  // ...and every accepted delegate still has its own terminal custody receipt.
  const durable = loadSubagentRegistryFromSqlite();
  expectGracefullyKilled(durable.get("resume-reached"));
  expectInterrupted(durable.get("resume-unreached"));
  // On its resume turn the root reads each delegate's own outcome.
  const snapshot = await createSubagentsTool({ agentSessionKey: parent }).execute("wait", {
    action: "wait",
    runIds: ["resume-reached", "resume-unreached"],
    timeoutSeconds: 0,
  });
  expect(snapshot.details).toMatchObject({
    runs: [
      {
        runId: "resume-reached",
        status: "terminal",
        outcome: { status: "error", error: "Gateway stopped" },
      },
      {
        runId: "resume-unreached",
        status: "terminal",
        outcome: {
          status: "error",
          error: "subagent run interrupted: the Gateway restarted before it ended",
        },
      },
    ],
  });
  expect(fixture.gateway).not.toHaveBeenCalled();
  expect(fixture.announce).not.toHaveBeenCalled();
});
