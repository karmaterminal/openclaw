// Completion cleanup calls the continuation coordinator from an untracked
// continuation of the completion's detached work scope. That scope closes once
// completion settles, so the coordinator's delegate drain must own a live scope
// or every child spawn it attempts is refused.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DelegateDispatchParams } from "../auto-reply/continuation/delegate-dispatch-contract.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { AsyncWorkScope, trackAsyncWork } from "../shared/async-work-scope.js";

const tracked: Array<PromiseSettledResult<string>> = [];

vi.mock("../auto-reply/continuation/delegate-dispatch.js", () => ({
  dispatchToolDelegates: vi.fn(async (params: DelegateDispatchParams) => {
    // Spawn preparation tracks its async work on the current scope.
    const [outcome] = await Promise.allSettled([trackAsyncWork(async () => "tracked")]);
    if (outcome) {
      tracked.push(outcome);
    }
    return { dispatched: 0, rejected: 0, chainState: params.chainState };
  }),
}));

vi.mock("./subagents/announce/subagent-announce-delivery.js", () => ({
  loadSessionEntryByKey: () => undefined,
}));

const { coordinateSubagentContinuation } =
  await import("./subagent-announce.continuation.runtime.js");

const cfg: OpenClawConfig = { agents: { defaults: { continuation: { enabled: true } } } };

describe("subagent continuation coordination work ownership", () => {
  afterEach(() => {
    tracked.length = 0;
  });

  it("drains child delegates in its own work scope after the caller's scope closed", async () => {
    let resumeCleanup!: () => void;
    const cleanupResumed = new Promise<void>((resolve) => {
      resumeCleanup = resolve;
    });
    const completionScope = new AsyncWorkScope();
    // Cleanup is launched without being tracked, then outlives its scope.
    const cleanup = completionScope.run(async () => {
      await cleanupResumed;
      return await coordinateSubagentContinuation({
        cfg,
        childSessionKey: "agent:main:subagent:work-scope-child",
        childRunId: "run-work-scope-child",
        targetRequesterSessionKey: "agent:main:main",
        task: "finish the child task",
        findings: "child findings",
        skipAnnounceDelivery: false,
        loadEntry: () => undefined,
        invalidateSessionEntry: () => undefined,
      });
    });
    await completionScope.drain();
    resumeCleanup();

    await expect(cleanup).resolves.toMatchObject({ continuationEnabled: true });
    expect(tracked).toEqual([{ status: "fulfilled", value: "tracked" }]);
  });
});
