// A room turn that fails before replying on the live Gateway (#1475 D3b, fleet 30b1ae051a /
// 0285ed988b on this tree).
//
// Its error terminal leaves the current-generation fence, live orphan reconciliation marks the
// row interrupted, and exact-target recovery runs. Only restart work may tombstone a
// message-tool-only room over a missing channel authority: a live failure settles like any
// failed turn and the room stays usable.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDeferred } from "../../../test/helpers/promise.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../../config/io.js";
import type { callGateway as gatewayCall } from "../../gateway/call.js";
import type { GatewayRecoveryRuntime } from "../../gateway/server-instance-runtime.types.js";
import { persistGatewaySessionLifecycleEvent } from "../../gateway/session-lifecycle-state.js";
import {
  getAgentEventLifecycleGeneration,
  resetAgentEventsForTest,
} from "../../infra/agent-events.js";
import { resetGatewayWorkAdmission } from "../../process/gateway-work-admission.js";
import { withEnvAsync } from "../../test-utils/env.js";
import { createOpenClawTestState } from "../../test-utils/openclaw-test-state.js";
import { createRecoveryRuntimeFixture } from "./main-session-recovery-runtime.test-support.js";
import { claimMainSessionRecoveryOwner } from "./main-session-recovery-store.js";
import { createRestartRecoveryStoreFixture } from "./main-session-restart-recovery-fixture.test-support.js";
import { markOrphanedMainSessionForRecovery } from "./main-session-restart-recovery-marking.js";
import { mainSessionRecoveryLog } from "./main-session-restart-recovery-shared.js";
import { retryRestartAbortedMainSessionRecovery } from "./main-session-restart-recovery.js";

let state: Awaited<ReturnType<typeof createOpenClawTestState>>;
let tmpDir: string;
const callGateway = vi.fn<(params: Parameters<typeof gatewayCall>[0]) => Promise<unknown>>();
const sendRecoveryNotice = vi.fn<GatewayRecoveryRuntime["sendRecoveryNotice"]>(async () => ({
  suppressed: false,
}));
const gatewayRuntime = createRecoveryRuntimeFixture({
  callGateway,
  getDispatchSettlement: () => createDeferred().promise,
  sendRecoveryNotice,
});
const { makeMainSessionFixture, writeTranscript } = createRestartRecoveryStoreFixture(() => tmpDir);

beforeEach(async () => {
  vi.clearAllMocks();
  callGateway.mockReset();
  callGateway.mockImplementation(async () => ({ runId: "run-resumed" }));
  resetAgentEventsForTest();
  resetGatewayWorkAdmission();
  state = await createOpenClawTestState({ scenario: "minimal" });
  tmpDir = state.root;
  setRuntimeConfigSnapshot({});
});

afterEach(async () => {
  resetGatewayWorkAdmission();
  clearRuntimeConfigSnapshot();
  await state.cleanup();
});

const candidatePrefix = "main-session restart recovery candidate ";

it.for([
  { gateway: "the live Gateway", restart: false },
  { gateway: "the live Gateway, Control UI ingress", restart: false, ingress: "control-ui" },
  { gateway: "an earlier Gateway generation", restart: true },
] as const)(
  "tombstones a message-tool-only room only for restart work: turn failed before reply on $gateway",
  async (variant) => {
    await withEnvAsync({ OPENCLAW_STATE_DIR: tmpDir }, async () => {
      const lifecycleGeneration = getAgentEventLifecycleGeneration();
      const runGeneration = variant.restart ? "earlier-gateway-generation" : lifecycleGeneration;
      const { sessionsDir, sessionKey, storePath, readEntry } = await makeMainSessionFixture({
        sessionKey: "agent:main:discord:channel:room",
        status: undefined,
        abortedLastRun: false,
        mainRestartRecovery: undefined,
        lifecycleRunId: "background-run",
        restartRecoveryRuns: [{ runId: "background-run", lifecycleGeneration: runGeneration }],
        restartRecoveryDeliveryRunId: "background-run",
        restartRecoverySourceReplyDeliveryMode: "message_tool_only",
        ...("ingress" in variant
          ? {
              restartRecoverySourceIngress: variant.ingress,
              restartRecoveryDeliverySourceRunId: "background-client-run",
            }
          : {}),
      });
      await writeTranscript(sessionsDir, "main-session", [
        { role: "user", content: "a room message the background turn raced" },
      ]);
      // The turn failed before replying; its error terminal leaves the fence in place.
      await persistGatewaySessionLifecycleEvent({
        sessionKey,
        agentId: "main",
        event: {
          ts: Date.now(),
          sessionId: "main-session",
          runId: "background-run",
          lifecycleGeneration: runGeneration,
          data: {
            phase: "error",
            error:
              "SqliteTranscriptMutationConflictError: SQLite transcript changed while preparing rewrite for main-session",
            executionStarted: false,
          },
        },
      });
      await expect(
        markOrphanedMainSessionForRecovery({
          target: { agentId: "main", sessionKey, storePath },
          expectedSessionId: "main-session",
        }),
      ).resolves.toEqual({ marked: 1, skipped: 0 });
      expect(readEntry()).toMatchObject({ abortedLastRun: true, status: "interrupted" });

      const info = vi.spyOn(mainSessionRecoveryLog, "info");
      try {
        await expect(
          retryRestartAbortedMainSessionRecovery({
            gatewayRuntime,
            agentId: "main",
            expectedSessionId: "main-session",
            sessionKey,
            storePath,
            stateDir: tmpDir,
          }),
        ).resolves.toEqual({ started: 0, settled: 0, failed: 0, skipped: 1 });
        const decisions = info.mock.calls
          .map(([line]) => line)
          .filter((line) => line.startsWith(candidatePrefix))
          .map((line) => JSON.parse(line.slice(candidatePrefix.length)));
        // A retired live interruption is already settled; it names no owner to act next.
        expect(decisions).toEqual([
          expect.objectContaining(
            variant.restart
              ? {
                  sessionKey,
                  decision: "blocked",
                  reason: "message_action_authority_unavailable",
                  nextOwner: "operator",
                }
              : {
                  sessionKey,
                  decision: "settled",
                  reason: "live_interruption_retired",
                  nextOwner: "none",
                },
          ),
        ]);
      } finally {
        info.mockRestore();
      }
      const settled = readEntry();
      if (variant.restart) {
        // Restart work keeps the fail-closed tombstone.
        expect(settled?.mainRestartRecovery?.tombstone).toEqual({
          reason: "message-tool-only recovery authority is unavailable",
        });
        return;
      }
      expect(settled?.mainRestartRecovery).toBeUndefined();
      expect(settled).toMatchObject({ abortedLastRun: false, status: "failed" });
      expect(settled?.restartRecoveryDeliveryRunId).toBeUndefined();
      expect(settled?.restartRecoveryRuns).toBeUndefined();
      // Like the tombstone path, retirement records the terminal client run it settled.
      expect(settled?.lastRunId).toBe("ingress" in variant ? "background-client-run" : undefined);
      expect(sendRecoveryNotice).not.toHaveBeenCalled();
      // The next room turn is admitted as ordinary work.
      await expect(
        claimMainSessionRecoveryOwner({
          lifecycleGeneration,
          sessionId: "main-session",
          runId: "next-room-run",
          target: { agentId: "main", sessionKey, storePath },
        }),
      ).resolves.toMatchObject({ kind: "not_required" });
    });
  },
);
