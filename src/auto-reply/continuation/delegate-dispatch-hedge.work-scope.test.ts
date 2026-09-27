// A hedge timer inherits the async work scope of whichever caller armed it.
// That scope has usually closed before the hedge fires, so the delayed dispatch
// must own a fresh scope or every spawn it attempts is refused.
import { AsyncResource } from "node:async_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncWorkScope, trackAsyncWork } from "../../shared/async-work-scope.js";
import type {
  DelegateDispatchParams,
  DelegateDispatchResult,
} from "./delegate-dispatch-contract.js";
import {
  armDelegateDispatchHedge,
  resetDelegateDispatchHedgesForTests,
} from "./delegate-dispatch-hedge.js";

const sessionKey = "agent:main:subagent:hedge-work-scope";
const chainState = { currentChainCount: 1, chainStartedAt: 1, accumulatedChainTokens: 0 };

describe("delegate dispatch hedge work ownership", () => {
  afterEach(() => {
    resetDelegateDispatchHedgesForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("dispatches in its own work scope after the arming scope has closed", async () => {
    vi.useFakeTimers();
    // Node timers run in the async context that created them; fake timers run in
    // the advancing caller's. Restore the real inheritance under test.
    const fakeSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) =>
      fakeSetTimeout(AsyncResource.bind(callback), delay),
    );
    const tracked: Array<PromiseSettledResult<string>> = [];
    const dispatch = vi.fn(
      async (params: DelegateDispatchParams): Promise<DelegateDispatchResult> => {
        // Spawn preparation tracks its async work on the current scope.
        const [outcome] = await Promise.allSettled([trackAsyncWork(async () => "tracked")]);
        if (outcome) {
          tracked.push(outcome);
        }
        return { dispatched: 0, rejected: 0, chainState: params.chainState };
      },
    );

    const armingScope = new AsyncWorkScope();
    armingScope.run(() =>
      armDelegateDispatchHedge(
        sessionKey,
        Date.now() + 25,
        { chainState, ctx: { sessionKey }, maxChainLength: 10 },
        dispatch,
      ),
    );
    await armingScope.drain();

    await vi.advanceTimersByTimeAsync(25);
    await vi.waitFor(() => expect(tracked).toHaveLength(1));

    expect(dispatch).toHaveBeenCalledOnce();
    expect(tracked).toEqual([{ status: "fulfilled", value: "tracked" }]);
  });
});
