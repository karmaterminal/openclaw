// A hedge timer inherits the async work scope of whichever caller armed it.
// That scope has usually closed before the hedge fires, so the delayed dispatch
// must own a fresh scope or every spawn it attempts is refused.
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
import {
  createPluginGenerationReload,
  CURRENT_PLUGIN_GENERATION,
  inheritArmingContextInFakeTimers,
  type ObservedPluginGeneration,
} from "./plugin-generation-reload.test-support.js";

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
    inheritArmingContextInFakeTimers();
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

  it.each([
    ["opted-in", true],
    ["non-opted-in", false],
  ])(
    "dispatches on the current plugin generation after a %s reload",
    async (_reload, generationOverlap) => {
      vi.useFakeTimers();
      inheritArmingContextInFakeTimers();
      const reload = createPluginGenerationReload(generationOverlap);
      const observed: ObservedPluginGeneration[] = [];
      const dispatch = vi.fn(
        async (params: DelegateDispatchParams): Promise<DelegateDispatchResult> => {
          observed.push(reload.observe());
          return { dispatched: 0, rejected: 0, chainState: params.chainState };
        },
      );
      try {
        reload.armInPredecessorTurn(() =>
          armDelegateDispatchHedge(
            sessionKey,
            Date.now() + 25,
            { chainState, ctx: { sessionKey }, maxChainLength: 10 },
            dispatch,
          ),
        );
        await reload.reload();
        await vi.advanceTimersByTimeAsync(25);
        await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
        expect(observed).toEqual([CURRENT_PLUGIN_GENERATION]);
      } finally {
        await reload.dispose();
      }
    },
  );
});
