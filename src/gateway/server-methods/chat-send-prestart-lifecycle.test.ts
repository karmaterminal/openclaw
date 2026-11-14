import assert from "node:assert/strict";
import { expect, it, vi } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import { isAgentRunRestartAbortReason } from "../../agents/run-termination.js";
import type { dispatchInboundMessage as DispatchInboundMessage } from "../../auto-reply/dispatch.js";
import type { executeAgentTurn } from "../../auto-reply/reply/agent-runner-execution.js";
import { withFullRuntimeReplyConfig } from "../../auto-reply/reply/get-reply-fast-path.js";
import { getRuntimeConfig } from "../../config/config.js";
import {
  listSessionPendingInputs,
  loadSessionEntry,
  patchSessionEntryCore,
  readSessionPendingInput,
} from "../../config/sessions/session-accessor.js";
import { readSessionQueuedInputPage } from "../../config/sessions/session-pending-input-history.js";
import { withPluginRuntimeGatewayRequestScope } from "../../plugins/runtime/gateway-request-scope.js";
import {
  markGatewayRestartDraining,
  resetGatewayWorkAdmission,
} from "../../process/gateway-work-admission.js";
import { sessionControllerMailboxes } from "../../sessions/session-controller.mailbox.js";
import { activeSessionOperations } from "../../sessions/session-controller.state.js";
import {
  captureSessionControllerStop,
  stopSession,
} from "../../sessions/session-controller.stop.js";
import type { UserTurnTranscriptRecorder } from "../../sessions/user-turn-transcript.js";
import { ensureGatewayOwnerProfile } from "../../state/user-profiles.js";
import { captureGatewayAuthPolicy } from "../auth-policy.js";
import { prepareGatewayRunShutdown } from "../server-run-shutdown.js";
import { persistRunningSessionsForRestart } from "../session-restart-resume.js";
import { dispatchInboundMessageMock, installGatewayTestHooks } from "../test-helpers.js";
import { loadRealChatDispatch, successfulChatTurn } from "./chat-send-authority.test-support.js";
import { handleChatSend } from "./chat-send-handler.js";
import { handleChatSendWithStorage } from "./chat-send-input-dispatch.js";
import {
  setClientProfile,
  useBrowserFollowupFixture,
} from "./chat-send-pending-inputs.test-support.js";
import type { GatewayContextResolver } from "./types.js";

installGatewayTestHooks();
const createFixture = useBrowserFollowupFixture();
// Drained inputs never run; the stand-in only keeps a failed case off a real model.
const runtime = vi.hoisted(() => ({ execute: vi.fn<typeof executeAgentTurn>() }));
vi.mock("../../auto-reply/reply/agent-runner-execution.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auto-reply/reply/agent-runner-execution.js")>()),
  executeAgentTurn: runtime.execute,
}));

type QueuedFixture = Awaited<ReturnType<typeof createFixture>>;

/** A token-authenticated owner socket stages a restart-recoverable Gateway operator source. */
function bindRecoverableOwner(fixture: QueuedFixture) {
  const owner = ensureGatewayOwnerProfile("Gateway Owner");
  setClientProfile(fixture.client, owner, owner.displayName);
  fixture.client.internal = { authenticatedOperator: true, operatorRoleActor: { kind: "system" } };
  fixture.client.authPolicy = captureGatewayAuthPolicy(getRuntimeConfig(), {
    role: "operator",
    authMethod: "token",
  });
}

function findInput(fixture: QueuedFixture) {
  return [...sessionControllerMailboxes()]
    .flatMap((mailbox) => mailbox.entries)
    .find((entry) => entry.protocolRunId === fixture.params.idempotencyKey);
}

/** Live requests bind their admitting Gateway; shutdown captures only that Gateway's work. */
function admittingGateway(fixture: QueuedFixture) {
  const resolveGatewayContext: GatewayContextResolver = () => fixture.context;
  let closing: ReturnType<typeof prepareGatewayRunShutdown> | undefined;
  /** The Gateway close path: snapshot running owners, write markers, then cancel captured work. */
  const close = () =>
    (closing ??= prepareGatewayRunShutdown({
      resolveGatewayContext,
      warnings: [],
      persistRunningSessionsForRestart: (signal) =>
        persistRunningSessionsForRestart({ cfg: {}, signal }),
    }));
  return {
    send: () =>
      fixture.send(undefined, undefined, fixture.params, (options) =>
        withPluginRuntimeGatewayRequestScope(
          { context: fixture.context, isWebchatConnect: () => true, resolveGatewayContext },
          () => handleChatSend(options),
        ),
      ),
    shutdown: async () => {
      const { failure, released } = await close();
      expect(failure).toBeUndefined();
      await released;
    },
    // A drain-held input never settles on its own. A case that failed before shutdown still
    // cancels it here; its assertion, not this cleanup's outcome, is that case's failure.
    [Symbol.asyncDispose]: async () => {
      await (await close()).released.catch(() => {});
    },
  };
}

/** Queue a send behind the active run; its dispatch, like the real one, returns on cancellation. */
async function sendQueuedInput(fixture: QueuedFixture, send = () => fixture.send()) {
  const release = createDeferred();
  const recorder = createDeferred<UserTurnTranscriptRecorder>();
  dispatchInboundMessageMock.mockImplementation(
    async ({ replyOptions }: Parameters<typeof DispatchInboundMessage>[0]) => {
      if (replyOptions?.userTurnTranscriptRecorder) {
        recorder.resolve(replyOptions.userTurnTranscriptRecorder);
      }
      await new Promise<void>((resolve) => {
        void release.promise.then(() => resolve());
        replyOptions?.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
      });
      return {};
    },
  );
  const response = await send();
  return {
    response,
    input: findInput(fixture),
    recorder: recorder.promise,
    release: release.resolve,
  };
}

/** Real dispatch admits the send to the followup queue behind the active run (the B1 probe's shape). */
async function sendFollowupInput(
  fixture: QueuedFixture,
  gateway: ReturnType<typeof admittingGateway>,
  queueDebounceMs?: number,
) {
  bindRecoverableOwner(fixture);
  const cfg = withFullRuntimeReplyConfig(fixture.context.getRuntimeConfig());
  fixture.context.getRuntimeConfig = () => cfg;
  fixture.params.queueMode = "followup";
  await patchSessionEntryCore(fixture.scope, () => ({
    queueMode: "followup",
    ...(queueDebounceMs === undefined ? {} : { queueDebounceMs }),
  }));
  const dispatch = await loadRealChatDispatch();
  runtime.execute
    .mockReset()
    .mockImplementation(async ({ opts }) => successfulChatTurn(opts?.runId ?? "", "Answered."));
  const enqueued = createDeferred();
  dispatchInboundMessageMock.mockImplementation(
    (params: Parameters<typeof DispatchInboundMessage>[0]) => {
      const lifecycle = params.replyOptions?.turnAdoptionLifecycle;
      const onDeferred = lifecycle?.onDeferred;
      assert(lifecycle && onDeferred);
      lifecycle.onDeferred = () => {
        const result = onDeferred();
        enqueued.resolve();
        return result;
      };
      return dispatch({ ...params, cfg });
    },
  );
  expect((await gateway.send()).mock.calls[0]?.[0]).toBe(true);
  const row = await stagedRow(fixture);
  await enqueued.promise;
  const input = findInput(fixture);
  assert(input);
  expect(input).toMatchObject({ phase: "waiting", custody: { enqueued: true } });
  return { input, row };
}

/** The running turn ends, leaving restart capture no owner to enumerate for the session. */
function endOwner(fixture: QueuedFixture, outcome: "completed" | "aborted") {
  const run = fixture.activeRun;
  assert(run);
  if (outcome === "aborted") {
    run.abortByUser();
  }
  run.complete();
  expect(
    [...activeSessionOperations()].some((operation) => operation.key === fixture.scope.sessionKey),
  ).toBe(false);
}

/** Terminal chat frames broadcast to the sender for this send's runId. */
function senderTerminals(fixture: QueuedFixture) {
  return vi.mocked(fixture.context.broadcast).mock.calls.flatMap(([event, payload]) => {
    const frame = payload as { runId?: string; state?: string; stopReason?: string };
    return event === "chat" &&
      frame.runId === fixture.params.idempotencyKey &&
      ["final", "aborted", "error"].includes(frame.state ?? "")
      ? [{ state: frame.state, ...(frame.stopReason ? { stopReason: frame.stopReason } : {}) }]
      : [];
  });
}

/** Shutdown cancelled the spared input and nothing marked it: the next boot has nothing to resume. */
async function expectCancelledWithoutMarker(
  fixture: QueuedFixture,
  input: { abortSignal: AbortSignal },
  rowId: string,
) {
  expect(isAgentRunRestartAbortReason(input.abortSignal.reason)).toBe(true);
  expect(loadSessionEntry(fixture.scope)?.resumeAfterRestart).toBeUndefined();
  await vi.waitFor(async () =>
    expect(await readSessionPendingInput(fixture.scope, rowId)).toMatchObject({
      state: "cancelled",
    }),
  );
  const { rows } = await readSessionQueuedInputPage(fixture.scope, { queuedInputIds: [rowId] });
  expect(rows).toEqual([]);
}

async function stagedRow(fixture: QueuedFixture) {
  const { items } = await listSessionPendingInputs(fixture.scope);
  expect(items).toMatchObject([{ state: "queued", runId: fixture.params.idempotencyKey }]);
  return items[0]!;
}

it("retains accepted restart intent after pre-runtime dispatch fully settles", async () => {
  await using fixture = await createFixture({ active: false });
  const { dispatchInboundMessage } = await vi.importActual<
    typeof import("../../auto-reply/dispatch.js")
  >("../../auto-reply/dispatch.js");
  dispatchInboundMessageMock.mockImplementation(
    (params: Parameters<typeof dispatchInboundMessage>[0]) =>
      dispatchInboundMessage({
        ...params,
        replyResolver: async (_ctx, options) => {
          const operation = options?.replyOperation;
          assert(operation);
          markGatewayRestartDraining();
          operation.abortForRestart();
          return {};
        },
      }),
  );
  try {
    const response = await fixture.send();
    expect(response.mock.calls[0]?.[0]).toBe(true);
    await fixture.finishDispatch();
    expect(
      [...activeSessionOperations()].some(
        (operation) => operation.key === fixture.scope.sessionKey,
      ),
    ).toBe(false);
    await persistRunningSessionsForRestart({ cfg: {} });
    expect(loadSessionEntry(fixture.scope)?.resumeAfterRestart).toEqual({ queuedInputIds: [] });
  } finally {
    resetGatewayWorkAdmission();
  }
});

it.for(["held", "setup-error"] as const)(
  "preserves accepted input before runtime start (%s)",
  async (outcome) => {
    await using fixture = await createFixture({ active: false });
    const runId = `prestart-${outcome}`;
    fixture.params.idempotencyKey = runId;
    await patchSessionEntryCore(fixture.scope, () => ({
      status: "done",
      lifecycleRevision: "prior-lifecycle",
      lastRunId: "prior-run",
      activeWriterRunId: "prior-run",
      startedAt: 10,
      endedAt: 30,
      runtimeMs: 20,
    }));
    const response = await fixture.send(undefined, undefined, fixture.params, (options) =>
      handleChatSendWithStorage(options, undefined, undefined, {
        beforeDispatch: async () => {
          if (outcome === "setup-error") {
            throw new Error("Accepted input setup failed");
          }
        },
      }),
    );
    const entry = loadSessionEntry(fixture.scope);
    if (outcome === "held") {
      await fixture.dispatchedRecorder;
      expect(response.mock.calls[0]?.[0]).toBe(true);
      expect(entry).toMatchObject({
        lifecycleRunId: runId,
        activeWriterRunId: runId,
      });
      expect(entry?.status).toBeUndefined();
      expect(entry?.endedAt).toBeUndefined();
    } else {
      expect(response.mock.calls[0]?.[0]).toBe(false);
      expect(entry).toMatchObject({
        status: "failed",
        lastRunId: runId,
        lastRunError: expect.stringContaining("Accepted input setup failed"),
      });
      expect(entry?.lifecycleRunId).toBeUndefined();
      expect(fixture.readTranscript()).toContainEqual(
        expect.objectContaining({
          type: "custom_message",
          customType: "run-failed-before-reply",
          display: true,
          details: expect.objectContaining({ runId }),
        }),
      );
    }
    expect(fixture.readTranscript()).toContainEqual(
      expect.objectContaining({
        type: "message",
        message: expect.objectContaining({
          role: "user",
          content: fixture.params.message,
          idempotencyKey: `${runId}:user`,
        }),
      }),
    );
    expect(fixture.context.logGateway.warn).not.toHaveBeenCalled();
  },
);

it("leaves a recoverable queued chat.send to restart capture when drain begins", async () => {
  await using fixture = await createFixture({ preserveContent: true });
  bindRecoverableOwner(fixture);
  const queued = await sendQueuedInput(fixture);
  try {
    expect(queued.response.mock.calls[0]?.[0]).toBe(true);
    assert(queued.input);
    // The dispatch is still preparing: the staged row exists but no queue owns the input yet.
    expect(queued.input.phase).toBe("preparing");
    const row = await stagedRow(fixture);
    markGatewayRestartDraining();
    expect(queued.input.abortSignal.aborted).toBe(false);
    await persistRunningSessionsForRestart({ cfg: {} });
    expect(loadSessionEntry(fixture.scope)?.resumeAfterRestart).toMatchObject({
      queuedInputIds: [row.id],
      queuedInputSources: {
        [row.id]: { runId: fixture.params.idempotencyKey, source: { kind: "gateway" } },
      },
    });
    await stopSession({
      source: "restart",
      capture: captureSessionControllerStop({ inputs: [queued.input] }),
    }).completed;
    expect(isAgentRunRestartAbortReason(queued.input.abortSignal.reason)).toBe(true);
    await fixture.finishDispatch();
    // Shutdown cancellation keeps the captured row for the next boot's continuation.
    const { rows } = await readSessionQueuedInputPage(fixture.scope, { queuedInputIds: [row.id] });
    expect(rows).toMatchObject([
      { input_id: row.id, run_id: fixture.params.idempotencyKey, state: "queued" },
    ]);
  } finally {
    queued.release();
    resetGatewayWorkAdmission();
  }
});

it("cancels a queued chat.send without a recoverable operator source when drain begins", async () => {
  await using fixture = await createFixture({ preserveContent: true });
  const queued = await sendQueuedInput(fixture);
  try {
    assert(queued.input);
    const row = await stagedRow(fixture);
    markGatewayRestartDraining();
    expect(isAgentRunRestartAbortReason(queued.input.abortSignal.reason)).toBe(true);
    await vi.waitFor(async () =>
      expect(await readSessionPendingInput(fixture.scope, row.id)).toMatchObject({
        state: "cancelled",
      }),
    );
    await persistRunningSessionsForRestart({ cfg: {} });
    expect(loadSessionEntry(fixture.scope)?.resumeAfterRestart?.queuedInputIds).toEqual([]);
  } finally {
    queued.release();
    resetGatewayWorkAdmission();
  }
});

it("cancels a reserved chat.send whose input is not yet staged when drain begins", async () => {
  await using fixture = await createFixture({ preserveContent: true });
  bindRecoverableOwner(fixture);
  let reserved: { abortSignal: AbortSignal } | undefined;
  // Approval runs before the pending row commits, while only the reservation exists.
  fixture.beforeApprove.mockImplementationOnce(() => {
    reserved = findInput(fixture);
    markGatewayRestartDraining();
  });
  const queued = await sendQueuedInput(fixture);
  try {
    expect(isAgentRunRestartAbortReason(reserved?.abortSignal.reason)).toBe(true);
    // The sender gets a visible retryable failure instead of an acknowledgment.
    expect(queued.response.mock.calls[0]?.slice(0, 3)).toEqual([
      false,
      expect.objectContaining({ status: "error" }),
      expect.objectContaining({ code: "UNAVAILABLE" }),
    ]);
    await persistRunningSessionsForRestart({ cfg: {} });
    expect(loadSessionEntry(fixture.scope)?.resumeAfterRestart?.queuedInputIds).toEqual([]);
    expect((await listSessionPendingInputs(fixture.scope)).items).toEqual([]);
  } finally {
    queued.release();
    resetGatewayWorkAdmission();
  }
});

it("cancels a queued chat.send whose pending owner is settling when drain begins", async () => {
  await using fixture = await createFixture({ preserveContent: true });
  bindRecoverableOwner(fixture);
  const queued = await sendQueuedInput(fixture);
  try {
    assert(queued.input);
    const row = await stagedRow(fixture);
    // Disposition settles the owner; the mailbox input still waits for its source cleanup.
    (await queued.recorder).finishPendingInput?.("cancelled");
    expect(queued.input.abortSignal.aborted).toBe(false);
    markGatewayRestartDraining();
    expect(isAgentRunRestartAbortReason(queued.input.abortSignal.reason)).toBe(true);
    await persistRunningSessionsForRestart({ cfg: {} });
    expect(loadSessionEntry(fixture.scope)?.resumeAfterRestart?.queuedInputIds).toEqual([]);
    await vi.waitFor(async () =>
      expect(await readSessionPendingInput(fixture.scope, row.id)).toMatchObject({
        state: "cancelled",
      }),
    );
  } finally {
    queued.release();
    resetGatewayWorkAdmission();
  }
});

it("cancels at shutdown, without a marker, a recoverable queued chat.send whose owner ended before drain", async () => {
  await using fixture = await createFixture({ preserveContent: true });
  await using gateway = admittingGateway(fixture);
  // The B1 probe's 45 s session debounce keeps the input queued after its owner's turn ends.
  const { input, row } = await sendFollowupInput(fixture, gateway, 45_000);
  try {
    endOwner(fixture, "completed");
    expect(input.phase).toBe("waiting");
    markGatewayRestartDraining();
    // The drain hook spares the recoverable input for restart capture.
    expect(input.abortSignal.aborted).toBe(false);
    expect(findInput(fixture)).toBe(input);
    await gateway.shutdown();
    await expectCancelledWithoutMarker(fixture, input, row.id);
    expect(senderTerminals(fixture)).toEqual([{ state: "aborted", stopReason: "restart" }]);
  } finally {
    resetGatewayWorkAdmission();
  }
});

it.for(["completed", "aborted"] as const)(
  "cancels at shutdown, without a marker, a recoverable queued chat.send whose owner %s between drain and capture",
  async (outcome) => {
    await using fixture = await createFixture({ preserveContent: true });
    await using gateway = admittingGateway(fixture);
    const { input, row } = await sendFollowupInput(fixture, gateway);
    try {
      markGatewayRestartDraining();
      expect(input.abortSignal.aborted).toBe(false);
      endOwner(fixture, outcome);
      // Drain keeps the queued followup unclaimed once its owner is gone.
      expect(input.phase).toBe("waiting");
      expect(input.claim).toBeUndefined();
      await gateway.shutdown();
      await expectCancelledWithoutMarker(fixture, input, row.id);
      expect(senderTerminals(fixture)).toEqual([{ state: "aborted", stopReason: "restart" }]);
    } finally {
      resetGatewayWorkAdmission();
    }
  },
);

it("marks a recoverable queued chat.send whose owner is still running at shutdown capture", async () => {
  await using fixture = await createFixture({ preserveContent: true });
  await using gateway = admittingGateway(fixture);
  const { input, row } = await sendFollowupInput(fixture, gateway);
  try {
    markGatewayRestartDraining();
    expect(input.abortSignal.aborted).toBe(false);
    await gateway.shutdown();
    expect(loadSessionEntry(fixture.scope)?.resumeAfterRestart).toMatchObject({
      queuedInputIds: [row.id],
      queuedInputSources: {
        [row.id]: { runId: fixture.params.idempotencyKey, source: { kind: "gateway" } },
      },
    });
    expect(isAgentRunRestartAbortReason(input.abortSignal.reason)).toBe(true);
    const { rows } = await readSessionQueuedInputPage(fixture.scope, { queuedInputIds: [row.id] });
    expect(rows).toMatchObject([
      { input_id: row.id, run_id: fixture.params.idempotencyKey, state: "queued" },
    ]);
    // The next boot answers this runId again; that second terminal is the A1 shape (#1567).
    expect(senderTerminals(fixture)).toEqual([{ state: "aborted", stopReason: "restart" }]);
  } finally {
    resetGatewayWorkAdmission();
  }
});

it("cancels at shutdown, without a marker, a recoverable chat.send still dispatching when its owner ends", async () => {
  await using fixture = await createFixture({ preserveContent: true });
  bindRecoverableOwner(fixture);
  await using gateway = admittingGateway(fixture);
  const queued = await sendQueuedInput(fixture, gateway.send);
  try {
    assert(queued.input);
    expect(queued.input.phase).toBe("preparing");
    const row = await stagedRow(fixture);
    markGatewayRestartDraining();
    expect(queued.input.abortSignal.aborted).toBe(false);
    endOwner(fixture, "completed");
    await gateway.shutdown();
    await expectCancelledWithoutMarker(fixture, queued.input, row.id);
    // The cancelled dispatch reports a content-free final, the A1 frame (#1567), with no resume.
    expect(senderTerminals(fixture)).toEqual([{ state: "final" }]);
  } finally {
    queued.release();
    resetGatewayWorkAdmission();
  }
});
