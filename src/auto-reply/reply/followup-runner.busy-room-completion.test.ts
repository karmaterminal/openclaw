// A queued followup turn in a busy shared room: other members' prompts record participants on
// the same session while this turn settles, so the session actor advances around its terminal
// commit. The turn carries no continuation signal, yet the fork still runs scheduleContinuation
// (tool-queued delegate dispatch, chain-state writes, the trailing publish) after
// turnCompletion.complete(). The batch must settle once, as completed, with no "refusing replay"
// failure and no second model run. The 03de seats logged exactly that refusal: it is thrown by the
// terminal command inside complete() when its single stale-version rebase runs outside the writer
// FIFO (upstream #169107 moved it inside).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../test/helpers/temp-dir.js";
import * as subagentSpawn from "../../agents/subagents/spawn/subagent-spawn.js";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../../config/runtime-snapshot.js";
import * as sessionActors from "../../config/sessions/session-actor.js";
import { recordSessionParticipantInWorker } from "../../config/sessions/session-sharing-store.async.js";
import { drainSessionStoreWriterQueuesForTest } from "../../config/sessions/store-writer-state.test-support.js";
import { defaultRuntime } from "../../runtime.js";
import type { ReplyOperation } from "../../sessions/session-controller.js";
import { runOutsideStoreWriterContext } from "../../shared/store-writer-queue.js";
import { disposeOpenClawAgentDatabaseByPath } from "../../state/openclaw-agent-db-disposal.js";
import {
  closeOpenClawAgentDatabasesAsync,
  isOpenClawAgentDatabaseOpen,
  openOpenClawAgentDatabase,
} from "../../state/openclaw-agent-db.js";
import { enqueuePendingDelegate } from "../continuation/delegate-store.js";
import * as continuationSchedule from "./agent-runner-continuation-schedule.js";
import {
  agentAccountingPersistenceDiagnostic as diagnostic,
  createAgentAccountingPersistenceFixture,
  withAccountingProvider,
} from "./agent-runner-result-accounting.persistence.test-support.js";
import { createFollowupRunner } from "./followup-runner.js";
import * as followupExecution from "./followup-turn-execution.js";
import * as followupAdmission from "./reply-agent-turn-preparation.js";
import { createMockTypingController } from "./test-helpers.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const operations: ReplyOperation[] = [];
let suiteRoot: string;
let storePath: string;
let fixtureSequence = 0;
beforeAll(() => {
  // openclaw-temp-dir: allow suite database root drains before removal
  suiteRoot = fs.mkdtempSync(
    path.join(fs.realpathSync.native(os.tmpdir()), "openclaw-busy-room-followup-"),
  );
  storePath = path.join(suiteRoot, "openclaw-agent.sqlite");
  // One shared-state root for the suite: agent database execution stays bound to it.
  vi.stubEnv("OPENCLAW_STATE_DIR", path.join(suiteRoot, "state"));
  openOpenClawAgentDatabase({ agentId: "main", path: storePath });
});
afterAll(async () => {
  await drainSessionStoreWriterQueuesForTest();
  await disposeOpenClawAgentDatabaseByPath(storePath);
  await closeOpenClawAgentDatabasesAsync(suiteRoot);
  expect(isOpenClawAgentDatabaseOpen(storePath)).toBe(false);
  vi.unstubAllEnvs();
  fs.rmSync(suiteRoot, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  clearRuntimeConfigSnapshot();
  for (const operation of operations.splice(0)) {
    operation.complete();
  }
});

it.each([
  { when: "after the terminal commit", delegate: false },
  { when: "while the terminal command commits", delegate: false },
  { when: "after the terminal commit", delegate: true },
  { when: "while the terminal command commits", delegate: true },
] as const)(
  "settles a no-signal followup once when room participants advance the session $when (tool delegate: $delegate)",
  async ({ when, delegate }) => {
    const fixture = await createAgentAccountingPersistenceFixture({
      storePath,
      root: tempDirs.make("openclaw-busy-room-"),
      fixtureId: ++fixtureSequence,
      registerOperation: (operation) => operations.push(operation),
    });
    const { context, turn } = fixture;
    // Continuation is enabled on the seats, so the post-completion scheduler runs its dispatch.
    turn.config.agents = { defaults: { continuation: { enabled: true } } };
    // The Gateway publishes this config before any turn; continuation reads it live.
    setRuntimeConfigSnapshot(turn.config);
    fixture.setMeta({ usage: { input: 120, output: 8 } });
    const scope = { agentId: "main", storePath, sessionKey: context.sessionKey! };
    let promptedAt = 0;
    const recordRoomPrompt = (id: string) =>
      recordSessionParticipantInWorker(scope, {
        identity: {
          type: "observation",
          pluginId: null,
          accountId: null,
          senderKind: "unknown",
          id,
        },
        promptedAt: ++promptedAt,
        sessionAgentId: "main",
      });
    const order: string[] = [];
    // A continue_delegate tool call queues custody without a bracket signal; the post-commit
    // scheduler dispatches it and persists the advanced chain state on the same session.
    const spawn = vi.spyOn(subagentSpawn, "spawnSubagentDirect").mockImplementation(async () => {
      order.push("delegate-spawned");
      if (delegate) {
        await recordRoomPrompt("room-member-c");
      }
      return {
        status: "accepted",
        context: "isolated",
        childSessionKey: "agent:main:subagent:busy-room-child",
        runId: "run-busy-room-child",
      };
    });
    if (delegate) {
      await enqueuePendingDelegate(
        scope.sessionKey,
        { task: "summarize the room" },
        { attachmentConfig: turn.config },
      );
    }
    const competingWrites: Promise<unknown>[] = [];
    const createActor = sessionActors.createSessionActor;
    vi.spyOn(sessionActors, "createSessionActor").mockImplementation((params) => {
      const actor = createActor(params);
      if (params.target.sessionKey === scope.sessionKey) {
        const completeTurn = actor.completeTurn;
        let attempts = 0;
        vi.spyOn(actor, "completeTurn").mockImplementation(async (...command) => {
          // The room writes around the first attempt only; its single rebase owns the writer FIFO.
          if (++attempts > 1) {
            const outcome = await completeTurn(...command);
            order.push(`complete-turn:${outcome.kind}`);
            return outcome;
          }
          if (when === "while the terminal command commits") {
            await recordRoomPrompt("room-member-a");
            const pending = completeTurn(...command);
            competingWrites.push(
              runOutsideStoreWriterContext(() => recordRoomPrompt("room-member-b")),
            );
            const outcome = await pending;
            order.push(`complete-turn:${outcome.kind}`);
            return outcome;
          }
          const outcome = await completeTurn(...command);
          order.push(`complete-turn:${outcome.kind}`);
          await recordRoomPrompt("room-member-a");
          await recordRoomPrompt("room-member-b");
          order.push("room-advanced");
          return outcome;
        });
      }
      return actor;
    });
    const scheduleReplyContinuation = continuationSchedule.scheduleReplyContinuation;
    vi.spyOn(continuationSchedule, "scheduleReplyContinuation").mockImplementation(
      async (...args) => {
        order.push("schedule-continuation");
        return scheduleReplyContinuation(...args);
      },
    );
    const runtimeError = vi.spyOn(defaultRuntime, "error");
    const deliver = vi.fn(async () => {});
    turn.queued.queuedFollowupReplyDisposition = { kind: "deliver", deliver };
    vi.spyOn(followupAdmission, "prepareReplyAgentTurn").mockResolvedValue({
      kind: "admitted",
      configured: undefined,
      turn,
    });
    const execute = vi.spyOn(followupExecution, "executeFollowupTurn").mockResolvedValue({
      commentaryPayloadsEnabled: false,
      execution: { runId: turn.runId, outcome: context.execution },
      runStartedAt: context.runStartedAt,
      sessionCtx: {},
      pendingToolTasks: new Set(),
      progress: { drain: async () => {} },
    });

    try {
      await withAccountingProvider(() =>
        createFollowupRunner({
          defaultModel: diagnostic.model,
          typing: createMockTypingController(),
          typingMode: "never",
        })(turn.queued),
      );
      await Promise.all(competingWrites);

      expect(order).toContain("schedule-continuation");
      const scheduled = ["schedule-continuation", ...(delegate ? ["delegate-spawned"] : [])];
      if (when === "after the terminal commit") {
        // The scheduler runs against a session the room already advanced past the commit.
        expect(order).toEqual(["complete-turn:committed", "room-advanced", ...scheduled]);
      } else {
        // The queued member's write refuses the first attempt; the single rebase commits.
        expect(order).toEqual([
          "complete-turn:stale-version",
          "complete-turn:committed",
          ...scheduled,
        ]);
      }
      expect(spawn).toHaveBeenCalledTimes(delegate ? 1 : 0);
      expect(
        runtimeError.mock.calls.filter(([message]) => String(message).includes("refusing replay")),
      ).toEqual([]);
      expect(execute).toHaveBeenCalledOnce();
      expect(deliver).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ completion: expect.objectContaining({ kind: "completed" }) }),
      );
      expect(turn.operation.result).not.toMatchObject({ kind: "failed" });
      expect(fixture.read()).toMatchObject({
        inputTokens: 120,
        outputTokens: 8,
        ...(delegate ? { continuationChainCount: 1 } : {}),
      });
    } finally {
      await Promise.all(competingWrites);
    }
  },
);
