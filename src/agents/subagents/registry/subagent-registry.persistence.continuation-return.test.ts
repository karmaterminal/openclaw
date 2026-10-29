// Continuation return metadata (split from subagent-registry.persistence.test.ts under its
// line cap): the recorded return fields persist on the registry row and reach the announce.
// Mocks and fixture are that suite's.
import { describe, expect, it, vi } from "vitest";
import "./subagent-registry.mocks.shared.js";
import "./subagent-registry.persistence.mocks.test-support.js";
// Preserve module setup before modules that consume it.
// oxfmt-ignore
import { announceSpy, useSubagentPersistenceFixture } from "./subagent-registry.persistence-fixture.test-support.js";
import { callGateway } from "../../../gateway/call.js";
import { loadSubagentRegistryFromSqlite } from "./subagent-registry-state.fixture.test-support.js";
import { writeSubagentSessionEntry } from "./subagent-registry.persistence.test-support.js";
import { registerSubagentRun } from "./subagent-registry.test-helpers.js";

describe("subagent registry persistence: continuation return", () => {
  const fixture = useSubagentPersistenceFixture();

  it("persists completion-time all-recipient authority selection on the authoritative run", async () => {
    await fixture.allocateStateDir();
    const stateDir = fixture.stateDir;
    // Continuation wakes need the requester session to exist.
    await writeSubagentSessionEntry({
      stateDir,
      agentId: "main",
      sessionKey: "agent:main:main",
      sessionId: "requester-main",
      defaultSessionId: "requester-main",
    });
    const childSessionKey = "agent:main:subagent:all-authority";
    await writeSubagentSessionEntry({
      stateDir,
      agentId: "main",
      sessionKey: childSessionKey,
      sessionId: "sess-all-authority",
      defaultSessionId: "sess-all-authority",
    });
    await registerSubagentRun({
      runId: "run-all-authority",
      childSessionKey,
      childAgentId: "main",
      sessionEntry: { sessionId: "sess-all-authority" },
      requesterSessionKey: "agent:main:main",
      requesterDisplayKey: "main",
      task: "fan out at completion",
      cleanup: "keep",
      silentAnnounce: true,
      continuationFanoutMode: "all",
      continuationRecipientAuthorityBinding: {
        version: 1,
        selection: "pending",
        fanoutMode: "all",
      },
    });

    await vi.waitFor(
      () =>
        expect(
          announceSpy.mock.calls.some(([params]) => params.childRunId === "run-all-authority"),
        ).toBe(true),
      { timeout: 5_000, interval: 10 },
    );
    const announceParams = announceSpy.mock.calls.find(
      ([params]) => params.childRunId === "run-all-authority",
    )?.[0];
    expect(announceParams).toBeDefined();
    const selectedBinding = {
      version: 1 as const,
      selection: "selected" as const,
      recipients: [
        {
          sessionKey: "agent:main:main",
          authority: { state: "bound" as const, epoch: "11111111-1111-4111-8111-111111111111" },
        },
      ],
    };

    expect(
      await announceParams?.persistContinuationRecipientAuthorityBinding?.(selectedBinding),
    ).toBe(true);
    expect(
      loadSubagentRegistryFromSqlite().get("run-all-authority")
        ?.continuationRecipientAuthorityBinding,
    ).toEqual(selectedBinding);
  });

  it("persists continuation return metadata and carries it to the announce", async () => {
    await fixture.allocateStateDir();
    let releaseInitialWait:
      | ((value: { status: "ok"; startedAt: number; endedAt: number }) => void)
      | undefined;
    vi.mocked(callGateway).mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          releaseInitialWait = resolve as typeof releaseInitialWait;
        }),
    );
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
    // Upstream #185730 restores rows as history and replays no completion after restart; a
    // graceful shutdown kills live children and resumes their root instead. The persisted
    // metadata still reaches the announce when the child completes in this process.
    releaseInitialWait?.({
      status: "ok",
      startedAt: 111,
      endedAt: 222,
    });
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
