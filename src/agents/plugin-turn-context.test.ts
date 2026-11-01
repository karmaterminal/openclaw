import { describe, expect, it, vi } from "vitest";
import { drainPluginNextTurnInjectionContext } from "../plugins/host-hook-state.js";
import {
  forgetPromptBuildDrainCacheForRun,
  resolvePluginTurnContext,
} from "./plugin-turn-context.js";

vi.mock("../plugins/host-hook-state.js", () => ({ drainPluginNextTurnInjectionContext: vi.fn() }));

describe("plugin turn context", () => {
  it("reuses rendered provenance bytes on retry", async () => {
    const runId = "provenance-retry";
    const drain = vi.mocked(drainPluginNextTurnInjectionContext);
    drain.mockResolvedValueOnce({
      queuedInjections: [
        {
          id: "one",
          pluginId: "fixture",
          text: "external",
          placement: "prepend_context",
          createdAt: 1,
          provenance: { source: "peer" },
        },
      ],
      prependContext: "rendered-once-boundary",
    });
    const params = {
      config: {},
      prompt: "request",
      messages: [],
      hookCtx: { runId, sessionKey: "agent:main:main", agentId: "main" },
    };
    try {
      expect(await resolvePluginTurnContext(params)).toMatchObject({
        prependContext: "rendered-once-boundary",
      });
      expect(await resolvePluginTurnContext(params)).toMatchObject({
        prependContext: "rendered-once-boundary",
      });
      expect(drain).toHaveBeenCalledTimes(1);
    } finally {
      forgetPromptBuildDrainCacheForRun(runId);
      drain.mockReset();
    }
  });
  it("omits expired injections from a cached retry", async () => {
    const runId = "expired-retry";
    const drain = vi.mocked(drainPluginNextTurnInjectionContext);
    drain.mockResolvedValueOnce({
      queuedInjections: [
        {
          id: "one",
          pluginId: "fixture",
          text: "expired",
          placement: "prepend_context",
          createdAt: 1,
          expiresAt: Date.now() + 50,
        },
      ],
      prependContext: "rendered-once-boundary",
    });
    const params = {
      config: {},
      prompt: "request",
      messages: [],
      hookCtx: { runId, sessionKey: "agent:main:main", agentId: "main" },
    };
    try {
      expect((await resolvePluginTurnContext(params)).prependContext).toContain(
        "rendered-once-boundary",
      );
      await new Promise((resolve) => {
        setTimeout(() => resolve(undefined), 60);
      });
      expect((await resolvePluginTurnContext(params)).prependContext).toBeUndefined();
      expect(drain).toHaveBeenCalledTimes(1);
    } finally {
      forgetPromptBuildDrainCacheForRun(runId);
      drain.mockReset();
    }
  });
  it("does not repeat turn-start work on a refresh continuation", async () => {
    const runAgentTurnPrepare = vi.fn(async () => ({ prependContext: "again" }));

    const result = await resolvePluginTurnContext({
      config: {},
      prompt: "original request",
      messages: [],
      hookCtx: { runId: "run-1", sessionKey: "agent:main:main", agentId: "main" },
      hookRunner: { hasHooks: () => true, runAgentTurnPrepare },
      refreshContinuation: true,
    });

    expect(result).toEqual({});
    expect(runAgentTurnPrepare).not.toHaveBeenCalled();
  });
});
