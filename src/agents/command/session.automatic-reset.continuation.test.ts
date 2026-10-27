// Continuation (karmaterminal): agent-command's automatic reset (#184157) settles continuation
// custody through the reply-session reset owner. A legacy pending-reset marker (`reset`) cancels
// pending work; an idle or daily expiry keeps it (bootstrap#1727 ruling 6434991502).
import { expectDefined } from "@openclaw/normalization-core/expect";
import { beforeEach, expect, it } from "vitest";
import {
  createContinuationRecord,
  listContinuationRecords,
} from "../../auto-reply/continuation/custody/custody-store.js";
import { useContinuationCustodyTestState } from "../../auto-reply/continuation/custody/custody.test-support.js";
import {
  agentCommand,
  compactionTestRuntime,
  compactionTestState as state,
  makeCompactionResult,
  registerAgentCommandCompactionTestHooks,
  requireCompactionStorePath,
} from "../agent-command.compaction.test-support.js";

const { loadSessionEntry, replaceSessionEntry } = compactionTestRuntime;
registerAgentCommandCompactionTestHooks();
useContinuationCustodyTestState();

const SESSION_KEY = "agent:main:main";

beforeEach(() => {
  state.runAgentAttemptMock.mockImplementation(async (params) => {
    await expectDefined(
      params.userTurnTranscriptRecorder,
      "command user recorder",
    ).persistApproved();
    return makeCompactionResult({
      sessionId: params.sessionId,
      text: "The new turn completed.",
      runner: "embedded",
    });
  });
});

async function seedResetSession(mode: "marker" | "idle" | "daily") {
  const cfg = expectDefined(state.cfg, "command config");
  if (mode !== "marker") {
    cfg.session = {
      ...cfg.session,
      reset: mode === "idle" ? { mode, idleMinutes: 1 } : { mode, atHour: 4 },
    };
  }
  const target = {
    agentId: "main",
    sessionKey: SESSION_KEY,
    sessionId: "before-reset",
    storePath: requireCompactionStorePath(),
  };
  const expiredAt = Date.now() - 2 * 24 * 60 * 60_000;
  await replaceSessionEntry(target, {
    sessionId: target.sessionId,
    lifecycleRevision: "before-reset",
    // Older releases persisted updatedAt=0 as an explicit pending reset marker.
    updatedAt: mode === "marker" ? 0 : expiredAt,
    sessionStartedAt: expiredAt,
    lastInteractionAt: expiredAt,
  });
  const created = await createContinuationRecord({
    recordId: `pending-work-${mode}`,
    kind: "work",
    ownerSessionKey: SESSION_KEY,
    status: "queued",
    phase: "Queued for same-session continuation wake",
    createdAt: expiredAt,
    dueAt: Date.now() + 60_000,
    stateJson: JSON.stringify({ reason: "finish the pending work" }),
  });
  expect(created.outcome).toBe("created");
  return target;
}

async function pendingWorkStatus(mode: string) {
  const [record] = await listContinuationRecords({ recordIds: [`pending-work-${mode}`] });
  return { status: record?.status, phase: record?.phase };
}

it("cancels pending continuation work when agent-command resets a session marked for reset", async () => {
  const target = await seedResetSession("marker");

  await agentCommand({ message: "Start over after the marker.", sessionKey: SESSION_KEY });

  expect(loadSessionEntry(target)?.lifecycleRevision).not.toBe("before-reset");
  expect(await pendingWorkStatus("marker")).toEqual({
    status: "cancelled",
    phase: "Cancelled by session reset",
  });
});

it.each(["idle", "daily"] as const)(
  "keeps pending continuation work across an agent-command %s reset",
  async (mode) => {
    const target = await seedResetSession(mode);

    await agentCommand({ message: `Resume after the ${mode} expiry.`, sessionKey: SESSION_KEY });

    expect(loadSessionEntry(target)?.lifecycleRevision).not.toBe("before-reset");
    expect(await pendingWorkStatus(mode)).toEqual({
      status: "queued",
      phase: "Queued for same-session continuation wake",
    });
  },
);
