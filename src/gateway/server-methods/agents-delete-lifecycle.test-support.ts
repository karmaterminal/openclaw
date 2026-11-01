import { expect, it, vi, type Mock } from "vitest";
import type { purgeAgentSessionStoreEntries } from "../../config/sessions/cleanup-service.js";
import * as sessionHooks from "../session-lifecycle-plugin-hooks.js";
import {
  expectPendingDeletion,
  expectUncalled,
  mockCallArg,
} from "./agents-mutate.test-support.js";

export function registerAgentDeleteLifecycleTests(harness: {
  purge: Mock<typeof purgeAgentSessionStoreEntries>;
  runDelete: () => Promise<void>;
  runDeletePending: () => Promise<Mock>;
  movePathToTrash: Mock;
  beginAgentDeletionFinish: Mock;
}): void {
  it("reports failed session cleanup and retains its journal and files for retry", async () => {
    const failure = {
      path: "/agents/test-agent/openclaw-agent.sqlite",
      reason: "admit session-store cleanup: agent database is still open",
    };
    harness.purge.mockImplementationOnce(async (_cfg, _agentId, options) => {
      options?.onFailure?.(failure);
      return true;
    });
    const respond = await harness.runDeletePending();
    expectPendingDeletion(respond, { ok: true, purgeFailed: true, failed: [failure] });
    expect(mockCallArg(respond, 0, 2)).toMatchObject({
      message: expect.stringContaining(`${failure.path}: ${failure.reason}`),
    });
    expectUncalled(harness.movePathToTrash, harness.beginAgentDeletionFinish);
  });

  it("publishes deletion only for rows reported by a committed agent purge", async () => {
    const emitEnd = vi
      .spyOn(sessionHooks, "emitGatewaySessionEndPluginHook")
      .mockImplementation(() => {});
    harness.purge.mockImplementationOnce(async (_cfg, _agentId, options) => {
      options?.onPurged?.(
        [
          {
            sessionId: "removed-session",
            sessionKey: "agent:test-agent:chat",
            lifecycleRevision: "removed-generation",
          },
        ],
        "/agents/test-agent/sessions.sqlite",
      );
      return false;
    });
    await harness.runDelete();
    expect(emitEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "test-agent",
        sessionId: "removed-session",
        sessionKey: "agent:test-agent:chat",
        lifecycleRevision: "removed-generation",
        reason: "deleted",
      }),
    );
  });
}
