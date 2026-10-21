// Continuation (karmaterminal): queued media completions recover through the captured queue owner, never process.env's state dir or a retired admission.
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRuntimeConfigAsyncReader } from "../config/io.js";
import { replaceSessionEntry } from "../config/sessions/session-accessor.js";
import * as sessionRead from "../config/sessions/session-entry-read-runtime.js";
import * as queue from "../infra/session-delivery-queue-storage.js";
import { isStateDatabaseReadAdmissionInvalidatedError } from "../state/openclaw-state-db-async-lifecycle.js";
import { closeOpenClawStateDatabaseAsync } from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import {
  withOpenClawTestState,
  type OpenClawTestState,
} from "../test-utils/openclaw-test-state.js";
import * as recoveryRuntime from "./server-recovery-runtime-context.js";
import { recoverPendingRestartContinuationDeliveries } from "./server-restart-sentinel.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const route = { channel: "discord", to: "channel:queue-context", chatType: "channel" as const };
const completion = {
  route,
  inputProvenance: { kind: "inter_session" as const, sourceTool: "image_generate" },
  sourceReplyDeliveryMode: "automatic" as const,
  expectedMediaUrls: [],
};

async function withRequester(run: (fixture: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  await withOpenClawTestState({ prefix: "queue-context-proof-" }, async (state) => {
    await run(await setup(state));
  });
}

async function setup(state: OpenClawTestState) {
  await state.writeConfig({ agents: { ownership: "explicit", entries: { main: {} } } });
  await captureRuntimeConfigAsyncReader()();
  const scope = {
    agentId: "main",
    sessionKey: "agent:main:discord:channel:queue-context",
    storePath: state.statePath("agents", "main", "sessions", "sessions.json"),
  };
  const original = { sessionId: "original-requester", lifecycleRevision: "original-lifecycle" };
  await replaceSessionEntry(scope, { ...original, updatedAt: 1 });
  // The model turn is the external edge; the queue, session store and admission are real.
  const dispatch = vi.spyOn(recoveryRuntime, "dispatchGatewayLifecycleMethod").mockResolvedValue({
    status: "ok",
    result: { payloads: [{ text: "checked" }], deliveryStatus: { status: "sent" } },
  });
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const enqueue = (
    messageId: string,
    bound: boolean,
    queueContext = captureOpenClawStateWorkerContext(),
  ) =>
    queue.enqueueSessionDelivery(
      {
        kind: "agentTurn",
        sessionKey: scope.sessionKey,
        message: "generated image ready",
        messageId,
        ...completion,
        ...(bound ? { requesterBinding: { ...scope, ...original } } : {}),
      },
      queueContext,
    );
  return { state, scope, dispatch, log, enqueue };
}

/** Raw rows of the session queue, read without owner code; null when the database never existed. */
function storedRows(stateDir: string) {
  const databasePath = path.join(stateDir, "state", "openclaw.sqlite");
  if (!existsSync(databasePath)) {
    return null;
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database
      .prepare("SELECT id, status FROM delivery_queue_entries WHERE queue_name = 'session'")
      .all() as Array<{ id: string; status: string }>;
    return Object.fromEntries(rows.map((row) => [row.id, row.status]));
  } finally {
    database.close();
  }
}

function dispatchedTurns(dispatch: { mock: { calls: unknown[][] } }) {
  return dispatch.mock.calls.map(([method, params]) => {
    const turn = params as { sessionKey?: string; expectedExistingSessionId?: string };
    return {
      method,
      sessionKey: turn.sessionKey,
      expectedExistingSessionId: turn.expectedExistingSessionId,
    };
  });
}

async function expectRetiredAdmission(recovery: Promise<unknown>) {
  const error = await recovery.then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(isStateDatabaseReadAdmissionInvalidatedError(error), String(error)).toBe(true);
}

describe("queued media completion queue owner", () => {
  it("delivers and settles in the captured state dir while process.env names a dir it never opens", () =>
    withRequester(async ({ state, scope, dispatch, log, enqueue }) => {
      const owning = captureOpenClawStateWorkerContext();
      const boundId = await enqueue("image:queue-context-bound:agent-loop", true, owning);
      const unboundId = await enqueue("image:queue-context-unbound:agent-loop", false, owning);
      const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), "queue-context-elsewhere-"));
      const previous = process.env.OPENCLAW_STATE_DIR;
      try {
        // The runtime captured its owner at start; the process env moved afterwards.
        process.env.OPENCLAW_STATE_DIR = elsewhere;
        await recoverPendingRestartContinuationDeliveries({ deps: {}, queueContext: owning, log });
      } finally {
        process.env.OPENCLAW_STATE_DIR = previous;
      }

      expect(dispatchedTurns(dispatch)).toEqual([
        {
          method: "agent",
          sessionKey: scope.sessionKey,
          expectedExistingSessionId: "original-requester",
        },
        { method: "agent", sessionKey: scope.sessionKey, expectedExistingSessionId: undefined },
      ]);
      expect(log.warn).not.toHaveBeenCalled();
      expect(await queue.loadPendingSessionDeliveries(owning)).toEqual([]);
      expect(storedRows(state.stateDir)).toEqual({
        [boundId]: "completed",
        [unboundId]: "completed",
      });
      expect(storedRows(elsewhere)).toBeNull();
      await fs.rm(elsewhere, { recursive: true, force: true });
    }));

  it("rejects recovery through a retired admission and leaves the row intact for the next owner", () =>
    withRequester(async ({ dispatch, log, enqueue }) => {
      const retired = captureOpenClawStateWorkerContext();
      const id = await enqueue("image:queue-context-retired:agent-loop", true, retired);
      // A state-database generation change (shutdown, Doctor maintenance) retires the owner.
      await closeOpenClawStateDatabaseAsync();

      await expectRetiredAdmission(
        recoverPendingRestartContinuationDeliveries({ deps: {}, queueContext: retired, log }),
      );
      expect(dispatch).not.toHaveBeenCalled();

      const current = captureOpenClawStateWorkerContext();
      const [row] = await queue.loadPendingSessionDeliveries(current);
      expect(row).toMatchObject({ id, retryCount: 0 });
      expect(row?.deliveryStartedAt).toBeUndefined();
      await recoverPendingRestartContinuationDeliveries({ deps: {}, queueContext: current, log });
      expect(dispatch).toHaveBeenCalledOnce();
      expect(await queue.loadPendingSessionDeliveries(current)).toEqual([]);
    }));

  it("stops before the attempt marker when the admission retires between the requester read and the turn", () =>
    withRequester(async ({ dispatch, log, enqueue }) => {
      const owning = captureOpenClawStateWorkerContext();
      const id = await enqueue("image:queue-context-interleaved:agent-loop", true, owning);
      const read = sessionRead.withSessionEntryReadOnlyInWorker;
      const markAttempt = vi.spyOn(queue, "markSessionDeliveryAttemptStarted");
      vi.spyOn(sessionRead, "withSessionEntryReadOnlyInWorker").mockImplementationOnce(
        async (...args) => {
          const value = await read(...args);
          // The generation changes after the owner read the requester and before its effect.
          await closeOpenClawStateDatabaseAsync();
          return value;
        },
      );

      await expectRetiredAdmission(
        recoverPendingRestartContinuationDeliveries({ deps: {}, queueContext: owning, log }),
      );
      expect(markAttempt).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();

      const current = captureOpenClawStateWorkerContext();
      const [row] = await queue.loadPendingSessionDeliveries(current);
      expect(row).toMatchObject({ id });
      expect(row?.deliveryStartedAt).toBeUndefined();
    }));
});
