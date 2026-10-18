import { expect, it, type Mock } from "vitest";
import type { InternalSessionEntry as SessionEntry } from "../../config/sessions.js";
import type { GatewayRecoveryRuntime } from "../../gateway/server-instance-runtime.types.js";
import { persistGatewaySessionLifecycleEvent } from "../../gateway/session-lifecycle-state.js";
import { getAgentEventLifecycleGeneration } from "../../infra/agent-events.js";
import { withEnvAsync } from "../../test-utils/env.js";
import type { SessionEntryFixture } from "../subagent-test-fixtures.test-helpers.js";
import { isMainSessionRecoveryPending } from "./main-session-recovery-state.js";
import { claimMainSessionRecoveryOwner } from "./main-session-recovery-store.js";
import { markOrphanedMainSessionForRecovery } from "./main-session-restart-recovery-marking.js";

type MessageToolOnlyRecoveryFixture = {
  prepareRoot: () => void;
  tmpDir: () => string;
  makeMainSessionFixture: (overrides?: SessionEntryFixture & { sessionKey?: string }) => Promise<{
    sessionsDir: string;
    storePath: string;
    sessionKey: string;
    readEntry: () => SessionEntry | undefined;
  }>;
  writeTranscript: (
    sessionsDir: string,
    sessionId: string,
    messages: readonly unknown[],
  ) => Promise<void>;
  expectRecovery: (expected: {
    started: number;
    settled: number;
    failed: number;
    skipped: number;
  }) => Promise<void>;
  sendRecoveryNotice: Mock<GatewayRecoveryRuntime["sendRecoveryNotice"]>;
  retryRecovery: (params: {
    agentId: string;
    expectedSessionId: string;
    sessionKey: string;
    storePath: string;
    stateDir: string;
  }) => Promise<unknown>;
};

// Message-tool-only sessions can only be recovered with their delivery authority;
// these cases pin when that loss tombstones the session and when it must not.
export function registerMessageToolOnlyRecoveryCases(
  harness: MessageToolOnlyRecoveryFixture,
): void {
  const {
    prepareRoot,
    tmpDir,
    makeMainSessionFixture,
    writeTranscript,
    expectRecovery,
    sendRecoveryNotice,
    retryRecovery,
  } = harness;

  it("tombstones when message-tool-only authority cannot be reconstructed", async () => {
    prepareRoot();
    const { sessionsDir, readEntry } = await makeMainSessionFixture({
      restartRecoveryDeliveryRunId: "recovery-main",
      restartRecoverySourceIngress: "channel",
      restartRecoverySourceReplyDeliveryMode: "message_tool_only",
      restartRecoveryDeliveryContext: {
        channel: "discord",
        to: "discord:dm:main",
        accountId: "work",
      },
    });
    await writeTranscript(sessionsDir, "main-session", [
      { role: "user", content: "recover only with delivery authority" },
    ]);

    await expectRecovery({ started: 0, settled: 0, failed: 0, skipped: 1 });
    expect(sendRecoveryNotice).toHaveBeenCalledOnce();
    expect(sendRecoveryNotice).toHaveBeenCalledWith({
      accountId: "work",
      channel: "discord",
      to: "discord:dm:main",
      threadId: undefined,
      idempotencyKey: "main-session-restart-recovery:recovery-main:failed-notice",
      text: expect.stringContaining("Resume in new session"),
    });
    const failedEntry = readEntry();
    expect(failedEntry).toMatchObject({
      abortedLastRun: false,
      status: "failed",
      mainRestartRecovery: { tombstone: expect.any(Object) },
    });
    expect(failedEntry?.restartRecoveryDeliveryRunId).toBe("recovery-main");
    expect(failedEntry?.restartRecoverySourceReplyDeliveryMode).toBe("message_tool_only");
  });

  it("does not tombstone a live message-tool-only session after a superseded turn", async () => {
    // openclaw#1462: a newer writer superseded a message-tool-only room turn without a
    // restart. Its successor's admission must not open a restart-recovery cycle that
    // tombstones the live session once the successor releases ownership.
    await withEnvAsync({ OPENCLAW_STATE_DIR: tmpDir() }, async () => {
      const lifecycleGeneration = getAgentEventLifecycleGeneration();
      const { sessionsDir, sessionKey, storePath, readEntry } = await makeMainSessionFixture({
        status: undefined,
        abortedLastRun: false,
        mainRestartRecovery: undefined,
        lifecycleRunId: "room-run",
        restartRecoveryRuns: [{ runId: "room-run", lifecycleGeneration }],
        restartRecoveryDeliveryRunId: "room-run",
        restartRecoverySourceIngress: "channel",
        restartRecoverySourceReplyDeliveryMode: "message_tool_only",
        restartRecoveryDeliveryContext: {
          channel: "discord",
          to: "discord:channel:room",
          accountId: "work",
        },
      });
      await writeTranscript(sessionsDir, "main-session", [
        { role: "user", content: "a room turn a newer writer supersedes" },
      ]);

      await persistGatewaySessionLifecycleEvent({
        sessionKey,
        agentId: "main",
        event: {
          ts: Date.now(),
          sessionId: "main-session",
          runId: "room-run",
          lifecycleGeneration,
          data: { phase: "end", stopReason: "superseded", aborted: true },
        },
      });
      const superseded = readEntry();
      expect(superseded?.status).toBe("killed");
      expect(superseded && isMainSessionRecoveryPending(superseded, sessionKey)).toBe(false);

      const successor = await claimMainSessionRecoveryOwner({
        lifecycleGeneration,
        sessionId: "main-session",
        runId: "successor-run",
        target: { agentId: "main", sessionKey, storePath },
      });
      expect(successor.kind).toBe("not_required");
      expect(readEntry()?.mainRestartRecovery).toBeUndefined();

      await expect(
        retryRecovery({
          agentId: "main",
          expectedSessionId: "main-session",
          sessionKey,
          storePath,
          stateDir: tmpDir(),
        }),
      ).resolves.toEqual({ started: 0, settled: 0, failed: 0, skipped: 0 });
      expect(sendRecoveryNotice).not.toHaveBeenCalled();
      expect(readEntry()?.mainRestartRecovery).toBeUndefined();
    });
  });
  it.each([
    { gateway: "the live Gateway", restart: false },
    { gateway: "an earlier Gateway generation", restart: true },
  ] as const)(
    "tombstones a message-tool-only room only for restart work: turn failed before reply on $gateway",
    async (variant) => {
      // openclaw#1475/#1473: a background turn on a live room session failed before
      // replying, with no Gateway restart. Its error terminal never settled the fence,
      // so reconciliation marks the row interrupted. Its claim carries no channel
      // authority, but only restart work may tombstone the session over that.
      await withEnvAsync({ OPENCLAW_STATE_DIR: tmpDir() }, async () => {
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
        });
        await writeTranscript(sessionsDir, "main-session", [
          { role: "user", content: "a room message the background turn raced" },
        ]);
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

        await expect(
          retryRecovery({
            agentId: "main",
            expectedSessionId: "main-session",
            sessionKey,
            storePath,
            stateDir: tmpDir(),
          }),
        ).resolves.toEqual({ started: 0, settled: 0, failed: 0, skipped: 1 });
        const settled = readEntry();
        if (variant.restart) {
          expect(settled?.mainRestartRecovery?.tombstone).toEqual({
            reason: "message-tool-only recovery authority is unavailable",
          });
          return;
        }
        expect(settled?.mainRestartRecovery).toBeUndefined();
        expect(settled).toMatchObject({ abortedLastRun: false, status: "failed" });
        expect(settled?.restartRecoveryDeliveryRunId).toBeUndefined();
        expect(settled?.restartRecoveryRuns).toBeUndefined();
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
  it.each([
    { gateway: "the live Gateway", restart: false },
    { gateway: "an earlier Gateway generation", restart: true },
  ] as const)(
    "tombstones a message-tool-only room only for restart work: failed turn retires its fence after marking on $gateway",
    async (variant) => {
      // #1477 review of #1475 D3b: reconciliation marks the row while the failed turn
      // is still settling. The turn's own error terminal then lands and retires its
      // fence, so the recovery pass observes a marked row with no open fence.
      await withEnvAsync({ OPENCLAW_STATE_DIR: tmpDir() }, async () => {
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
        });
        await writeTranscript(sessionsDir, "main-session", [
          { role: "user", content: "a room message the background turn raced" },
        ]);
        await expect(
          markOrphanedMainSessionForRecovery({
            target: { agentId: "main", sessionKey, storePath },
            expectedSessionId: "main-session",
          }),
        ).resolves.toEqual({ marked: 1, skipped: 0 });
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
            },
          },
        });
        if (variant.restart) {
          // A late terminal from the interrupted generation retires only its own fence.
          expect(readEntry()).toMatchObject({ abortedLastRun: true, status: "interrupted" });
          expect(readEntry()?.restartRecoveryRuns).toBeUndefined();
        }

        await retryRecovery({
          agentId: "main",
          expectedSessionId: "main-session",
          sessionKey,
          storePath,
          stateDir: tmpDir(),
        });
        const settled = readEntry();
        if (variant.restart) {
          expect(settled?.mainRestartRecovery?.tombstone).toEqual({
            reason: "message-tool-only recovery authority is unavailable",
          });
          return;
        }
        expect(settled?.mainRestartRecovery?.tombstone).toBeUndefined();
        expect(settled).toMatchObject({ abortedLastRun: false, status: "failed" });
        expect(sendRecoveryNotice).not.toHaveBeenCalled();
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
}
