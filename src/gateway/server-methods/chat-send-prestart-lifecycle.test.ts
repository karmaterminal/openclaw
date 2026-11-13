import assert from "node:assert/strict";
import { expect, it, vi } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import { isAgentRunRestartAbortReason } from "../../agents/run-termination.js";
import type { dispatchInboundMessage as DispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { getRuntimeConfig } from "../../config/config.js";
import {
  listSessionPendingInputs,
  loadSessionEntry,
  patchSessionEntryCore,
  readSessionPendingInput,
} from "../../config/sessions/session-accessor.js";
import { readSessionQueuedInputPage } from "../../config/sessions/session-pending-input-history.js";
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
import { persistRunningSessionsForRestart } from "../session-restart-resume.js";
import { dispatchInboundMessageMock, installGatewayTestHooks } from "../test-helpers.js";
import { handleChatSendWithStorage } from "./chat-send-input-dispatch.js";
import {
  setClientProfile,
  useBrowserFollowupFixture,
} from "./chat-send-pending-inputs.test-support.js";

installGatewayTestHooks();
const createFixture = useBrowserFollowupFixture();

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

/** Queue a send behind the active run; its dispatch, like the real one, returns on cancellation. */
async function sendQueuedInput(fixture: QueuedFixture) {
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
  const response = await fixture.send();
  const input = [...sessionControllerMailboxes()]
    .flatMap((mailbox) => mailbox.entries)
    .find((entry) => entry.protocolRunId === fixture.params.idempotencyKey);
  return { response, input, recorder: recorder.promise, release: release.resolve };
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
    reserved = [...sessionControllerMailboxes()]
      .flatMap((mailbox) => mailbox.entries)
      .find((entry) => entry.protocolRunId === fixture.params.idempotencyKey);
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
