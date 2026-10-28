// A live /stop, then the room's next turn or a Gateway restart (#1468, #1475 D3b).
//
// 🕯's F2 ordering: the stop writes its abort marker first, then the stopped run's terminal
// lands. A later restart runs the startup orphan scan and restart recovery over that row: the
// user's stop must neither be resumed nor tombstone the session. A run a restart genuinely
// interrupted must still resume. 🕯's negative control: the next turn after a stop in this
// generation is admitted as ordinary work.
import { expectDefined } from "@openclaw/normalization-core/expect";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDeferred, nextEventLoopTurn } from "../../../test/helpers/promise.js";
import { persistAbortTargetEntry } from "../../auto-reply/reply/commands-session-store.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/io.js";
import { assertNoRetainedSessionSharingReads } from "../../config/sessions/session-accessor.sqlite-diagnostics.test-support.js";
import type { callGateway as gatewayCall } from "../../gateway/call.js";
import type { GatewayRecoveryRuntime } from "../../gateway/server-instance-runtime.types.js";
import { persistGatewaySessionLifecycleEvent } from "../../gateway/session-lifecycle-state.js";
import {
  getAgentEventLifecycleGeneration,
  resetAgentEventsForTest,
  rotateAgentEventLifecycleGeneration,
} from "../../infra/agent-events.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import { withEnvAsync } from "../../test-utils/env.js";
import { createOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { createRecoveryRuntimeFixture } from "./main-session-recovery-runtime.test-support.js";
import { claimMainSessionRecoveryOwner } from "./main-session-recovery-store.js";
import { createRestartRecoveryStoreFixture } from "./main-session-restart-recovery-fixture.test-support.js";
import {
  markStartupOrphanedMainSessionsForRecovery,
  recoverRestartAbortedMainSessions,
} from "./main-session-restart-recovery.js";

let state: Awaited<ReturnType<typeof createOpenClawTestState>>;
let tmpDir: string;
const callGateway = vi.fn<(params: Parameters<typeof gatewayCall>[0]) => Promise<unknown>>();
const sendRecoveryNotice = vi.fn<GatewayRecoveryRuntime["sendRecoveryNotice"]>(async () => ({
  suppressed: false,
}));
let dispatchSettlement = createDeferred();
const gatewayRuntime = createRecoveryRuntimeFixture({
  callGateway,
  getDispatchSettlement: () => dispatchSettlement.promise,
  sendRecoveryNotice,
});
const { makeMainSessionFixture, writeTranscript } = createRestartRecoveryStoreFixture(() => tmpDir);

beforeEach(async () => {
  vi.clearAllMocks();
  dispatchSettlement = createDeferred();
  callGateway.mockReset();
  callGateway.mockImplementation(async () => ({ runId: "run-resumed" }));
  resetAgentEventsForTest();
  resetGatewayWorkAdmission();
  state = await createOpenClawTestState({ scenario: "minimal" });
  tmpDir = state.root;
  setRuntimeConfigSnapshot({});
});

afterEach(async () => {
  // A started recovery run keeps its prepared session read until its dispatch settles.
  dispatchSettlement.resolve();
  await nextEventLoopTurn();
  try {
    assertNoRetainedSessionSharingReads();
  } finally {
    resetGatewayWorkAdmission();
    clearRuntimeConfigSnapshot();
    await state.cleanup();
  }
});

const roomDelivery = {
  restartRecoveryDeliveryRunId: "room-run",
  restartRecoverySourceIngress: "channel",
  restartRecoveryDeliveryContext: {
    channel: "discord",
    to: "discord:channel:room",
    accountId: "work",
  },
} as const;

/** A room turn in flight on this Gateway generation, holding its fence and delivery claim. */
async function liveRoomRow(messageToolOnly: boolean) {
  const lifecycleGeneration = getAgentEventLifecycleGeneration();
  const fixture = await makeMainSessionFixture({
    status: undefined,
    abortedLastRun: false,
    mainRestartRecovery: undefined,
    lifecycleRunId: "room-run",
    startedAt: Date.now() - 1_000,
    restartRecoveryRuns: [{ runId: "room-run", lifecycleGeneration }],
    ...roomDelivery,
    ...(messageToolOnly ? { restartRecoverySourceReplyDeliveryMode: "message_tool_only" } : {}),
  });
  await writeTranscript(fixture.sessionsDir, "main-session", [
    { role: "user", content: "a room turn" },
  ]);
  return { ...fixture, lifecycleGeneration };
}

/** The Gateway restarts: a new lifecycle generation, the startup orphan scan, then recovery. */
async function restartGateway() {
  rotateAgentEventLifecycleGeneration();
  await markStartupOrphanedMainSessionsForRecovery({ stateDir: tmpDir });
  return await recoverRestartAbortedMainSessions({ stateDir: tmpDir, gatewayRuntime });
}

function resumedRuns() {
  return callGateway.mock.calls.filter(([request]) => request.method === "agent").length;
}

it.for([
  { room: "message-tool-only room", messageToolOnly: true },
  { room: "channel-reply room", messageToolOnly: false },
])(
  "neither resumes nor tombstones a marker-first /stop on a $room after a restart",
  async ({ messageToolOnly }) => {
    await withEnvAsync({ OPENCLAW_STATE_DIR: tmpDir }, async () => {
      const row = await liveRoomRow(messageToolOnly);
      const { sessionKey, storePath, lifecycleGeneration, readEntry } = row;
      // /stop writes its abort marker while the run's fence and delivery claim are still live.
      const stopped = expectDefined(readEntry(), "live room row");
      await expect(
        persistAbortTargetEntry({
          entry: stopped,
          key: sessionKey,
          sessionStore: { [sessionKey]: stopped },
          storePath,
        }),
      ).resolves.toBe(true);
      await persistGatewaySessionLifecycleEvent({
        sessionKey,
        agentId: "main",
        event: {
          ts: Date.now(),
          sessionId: "main-session",
          runId: "room-run",
          lifecycleGeneration,
          data: { phase: "end", stopReason: "aborted", aborted: true },
        },
      });

      await restartGateway();

      const settled = readEntry();
      expect(settled?.mainRestartRecovery?.tombstone).toBeUndefined();
      expect(resumedRuns()).toBe(0);
      expect(sendRecoveryNotice).not.toHaveBeenCalled();
    });
  },
);

it("still resumes a channel-reply room turn a restart genuinely interrupted", async () => {
  await withEnvAsync({ OPENCLAW_STATE_DIR: tmpDir }, async () => {
    const row = await liveRoomRow(false);

    const recovery = await restartGateway();

    expect(recovery).toMatchObject({ started: 1, failed: 0 });
    expect(resumedRuns()).toBe(1);
    expect(row.readEntry()?.mainRestartRecovery?.tombstone).toBeUndefined();
  });
});

it("admits the next room turn over a current-generation stop as ordinary work", async () => {
  await withEnvAsync({ OPENCLAW_STATE_DIR: tmpDir }, async () => {
    // A stop in this generation: abortedLastRun beside a live message-tool claim, with no fence,
    // recovery aggregate or restart mark.
    const row = await liveRoomRow(true);
    const { sessionKey, storePath, lifecycleGeneration, readEntry } = row;
    const stopped = expectDefined(readEntry(), "live room row");
    await persistAbortTargetEntry({
      entry: stopped,
      key: sessionKey,
      sessionStore: { [sessionKey]: stopped },
      storePath,
    });
    await persistGatewaySessionLifecycleEvent({
      sessionKey,
      agentId: "main",
      event: {
        ts: Date.now(),
        sessionId: "main-session",
        runId: "room-run",
        lifecycleGeneration,
        data: { phase: "end", stopReason: "aborted", aborted: true },
      },
    });
    expect(readEntry()).toMatchObject({
      abortedLastRun: true,
      restartRecoveryDeliveryRunId: "room-run",
      restartRecoverySourceReplyDeliveryMode: "message_tool_only",
    });
    expect(readEntry()?.restartRecoveryRuns).toBeUndefined();
    expect(readEntry()?.mainRestartRecovery).toBeUndefined();

    await expect(
      claimMainSessionRecoveryOwner({
        lifecycleGeneration,
        sessionId: "main-session",
        runId: "next-room-run",
        target: { agentId: "main", sessionKey, storePath },
      }),
    ).resolves.toMatchObject({ kind: "not_required" });
    expect(readEntry()?.mainRestartRecovery).toBeUndefined();
  });
});
