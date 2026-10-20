// Continuation return metadata across restart (split from
// subagent-registry.persistence.test.ts under its line cap): the recorded return
// fields survive the registry row and reach the replayed announce. Mocks, fixture and
// restart wiring are that suite's.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSubagentRegistryRuntimeLoadersForTests } from "./subagent-registry-deps.js";
import "./subagent-registry.mocks.shared.js";
import "./subagent-registry.persistence.mocks.test-support.js";
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { announceSpy, createSubagentPersistenceRuntime, useSubagentPersistenceFixture } from "./subagent-registry.persistence-fixture.test-support.js";
import { callGateway } from "../../../gateway/call.js";
import type { ChatAbortControllerEntry } from "../../../gateway/chat-abort.types.js";
import { loadSubagentRegistryFromSqlite } from "./subagent-registry-state.fixture.test-support.js";
import { writeSubagentSessionEntry } from "./subagent-registry.persistence.test-support.js";
import {
  activateSubagentRegistry,
  initSubagentRegistry,
  registerSubagentRun,
  resetSubagentRegistryForTests,
} from "./subagent-registry.test-helpers.js";

describe("subagent registry persistence: continuation return", () => {
  const fixture = useSubagentPersistenceFixture();

  beforeEach(() => {
    // The registry reaches announce through a lazy loader cache that survives
    // resetSubagentRegistryForTests; reset it so this file's announce mock is used.
    resetSubagentRegistryRuntimeLoadersForTests();
  });

  const restartRegistry = async () => {
    await resetSubagentRegistryForTests({ persist: false });
    await initSubagentRegistry();
    const recoveryRuntime = createSubagentPersistenceRuntime(callGateway);
    const gateway = {
      recoveryRuntime,
      chatAbortControllers: new Map<string, ChatAbortControllerEntry>(),
      resolveGatewayContext: () => gateway as never,
    };
    await activateSubagentRegistry(() => gateway as never);
  };

  it("persists continuation return metadata and replays it after restart", async () => {
    await fixture.allocateStateDir();
    let releaseInitialWait:
      | ((value: { status: "ok"; startedAt: number; endedAt: number }) => void)
      | undefined;
    vi.mocked(callGateway)
      .mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            releaseInitialWait = resolve as typeof releaseInitialWait;
          }),
      )
      .mockResolvedValueOnce({
        status: "ok",
        startedAt: 111,
        endedAt: 222,
      });
    await registerSubagentRun({
      runId: "run-silent",
      childSessionKey: "agent:main:subagent:silent-test",
      childAgentId: "main",
      sessionEntry: { sessionId: "sess-silent" },
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "quiet enrichment",
      cleanup: "keep",
      silentAnnounce: true,
      wakeOnReturn: true,
      continuationTargetSessionKeys: ["agent:main:subagent:silent-test", "agent:main:main"],
      continuationFanoutMode: "tree",
      continuationRecipientAuthorityBinding: {
        version: 1,
        selection: "selected",
        recipients: [
          {
            sessionKey: "agent:main:subagent:silent-test",
            authority: { state: "bound", epoch: "11111111-1111-4111-8111-111111111111" },
          },
          {
            sessionKey: "agent:main:main",
            authority: { state: "bound", epoch: "22222222-2222-4222-8222-222222222222" },
          },
        ],
      },
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    });
    await writeSubagentSessionEntry({
      stateDir: fixture.stateDir,
      agentId: "main",
      sessionKey: "agent:main:subagent:silent-test",
      sessionId: "sess-silent",
      defaultSessionId: "sess-silent",
    });
    const run = loadSubagentRegistryFromSqlite().get("run-silent") as
      | {
          silentAnnounce?: boolean;
          wakeOnReturn?: boolean;
          continuationTargetSessionKeys?: string[];
          continuationFanoutMode?: "tree" | "all";
          continuationRecipientAuthorityBinding?: unknown;
          traceparent?: string;
        }
      | undefined;
    expect(run).toMatchObject({
      silentAnnounce: true,
      wakeOnReturn: true,
      continuationTargetSessionKeys: ["agent:main:subagent:silent-test", "agent:main:main"],
      continuationFanoutMode: "tree",
      continuationRecipientAuthorityBinding: {
        version: 1,
        selection: "selected",
        recipients: [
          {
            sessionKey: "agent:main:subagent:silent-test",
            authority: { state: "bound", epoch: "11111111-1111-4111-8111-111111111111" },
          },
          {
            sessionKey: "agent:main:main",
            authority: { state: "bound", epoch: "22222222-2222-4222-8222-222222222222" },
          },
        ],
      },
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    });
    const restarted = restartRegistry();
    releaseInitialWait?.({
      status: "ok",
      startedAt: 111,
      endedAt: 222,
    });
    await restarted;
    // Wait on the DURABLE OUTCOME, not on the spy. Under the retired injection seam
    // the announce dependency was reached with no intervening async hop, so polling
    // the spy doubled as the trigger. The lazy module boundary adds hops, which made
    // that poll a timing artefact rather than a behaviour check -- measured: at the
    // 2s mark baseline and port are byte-identical (execution terminal, metadata
    // intact, delivery pending, spy 0); given enough turns BOTH reach delivered.
    // So gate on replay driving delivery terminal, then keep the original
    // enriched-params assertion, which still holds once announce is reached.
    await vi.waitFor(
      () => {
        const replayed = loadSubagentRegistryFromSqlite().get("run-silent") as
          | { delivery?: { status?: string } }
          | undefined;
        expect(replayed?.delivery?.status).toBe("delivered");
      },
      { interval: 25, timeout: 20_000 },
    );
    await vi.waitFor(() => {
      expect(announceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          childRunId: "run-silent",
          silentAnnounce: true,
          wakeOnReturn: true,
          continuationTargetSessionKeys: ["agent:main:subagent:silent-test", "agent:main:main"],
          continuationFanoutMode: "tree",
          continuationRecipientAuthorityBinding: {
            version: 1,
            selection: "selected",
            recipients: [
              {
                sessionKey: "agent:main:subagent:silent-test",
                authority: {
                  state: "bound",
                  epoch: "11111111-1111-4111-8111-111111111111",
                },
              },
              {
                sessionKey: "agent:main:main",
                authority: {
                  state: "bound",
                  epoch: "22222222-2222-4222-8222-222222222222",
                },
              },
            ],
          },
          traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        }),
      );
    });
  });
});
