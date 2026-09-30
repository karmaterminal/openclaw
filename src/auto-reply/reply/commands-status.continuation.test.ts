// Tests the /status continuation line (chain depth, delegates, post-compaction, volitional counts).
import { afterEach, describe, expect, it, vi } from "vitest";
import { testing as cliBackendsTesting } from "../../agents/cli-backends.test-support.js";
import { clearAgentHarnesses } from "../../agents/harness/registry.js";
import {
  _resetVolitionalCounts,
  incrementVolitionalCompactionCount,
} from "../../agents/tools/request-compaction-tool.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { ProviderThinkingProfile } from "../../plugins/provider-thinking.types.js";
import { useContinuationCustodyTestState } from "../continuation/custody/custody.test-support.js";
import { stagePostCompactionDelegate } from "../continuation/delegate-store-post-compaction.js";
import { enqueuePendingDelegate } from "../continuation/delegate-store.js";
import { buildStatusText } from "./commands-status.js";
import { baseCommandTestConfig } from "./commands.test-harness.js";

// Harness mirrored from commands-status.test.ts so these cases run under identical mocks.
type LoadProviderUsageSummary =
  typeof import("../../infra/provider-usage.js").loadProviderUsageSummary;

const providerUsageMock = vi.hoisted(() => ({
  loadProviderUsageSummary: vi.fn<LoadProviderUsageSummary>(async () => ({
    updatedAt: Date.now(),
    providers: [],
  })),
}));
const activeProviderThinkingMock = vi.hoisted(() => ({
  resolveThinkingProfile: vi.fn<
    (params: {
      provider: string;
      context: { modelId: string };
    }) => ProviderThinkingProfile | null | undefined
  >(() => undefined),
}));
type StatusPluginHealthSnapshot =
  import("../../status/status-plugin-health.js").StatusPluginHealthSnapshot;

const pluginHealthRuntimeMock = vi.hoisted(() => ({
  collectInstalledPluginHealthSnapshot: vi.fn(async (): Promise<StatusPluginHealthSnapshot> => ({
    plugins: [],
    diagnostics: [],
    contextEngineQuarantines: [],
    runtimeToolQuarantines: [],
    channelPluginFailures: [],
  })),
  collectRuntimePluginHealthSnapshot: vi.fn((): StatusPluginHealthSnapshot => ({
    plugins: [],
    diagnostics: [],
    contextEngineQuarantines: [],
    runtimeToolQuarantines: [],
    channelPluginFailures: [],
  })),
}));

vi.mock("../../infra/provider-usage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../infra/provider-usage.js")>();
  return {
    ...actual,
    loadProviderUsageSummary: providerUsageMock.loadProviderUsageSummary,
  };
});

vi.mock("../../plugins/provider-thinking-active.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../plugins/provider-thinking-active.js")>()),
  resolveActiveProviderThinkingProfile: activeProviderThinkingMock.resolveThinkingProfile,
}));

vi.mock("../../status/status-plugin-health.runtime.js", () => pluginHealthRuntimeMock);

vi.mock("../../agents/harness/builtin-openclaw.js", () => ({
  createOpenClawAgentHarness: () => ({
    id: "openclaw",
    label: "OpenClaw Default",
    supports: () => ({ supported: true, priority: 0 }),
    runAttempt: async () => {
      throw new Error("not used in status tests");
    },
  }),
}));

const baseCfg = baseCommandTestConfig;

afterEach(() => {
  cliBackendsTesting.resetDepsForTest();
  clearAgentHarnesses();
  providerUsageMock.loadProviderUsageSummary.mockReset();
  providerUsageMock.loadProviderUsageSummary.mockResolvedValue({
    updatedAt: Date.now(),
    providers: [],
  });
  activeProviderThinkingMock.resolveThinkingProfile.mockReset();
  activeProviderThinkingMock.resolveThinkingProfile.mockReturnValue(undefined);
  pluginHealthRuntimeMock.collectInstalledPluginHealthSnapshot.mockReset();
  pluginHealthRuntimeMock.collectInstalledPluginHealthSnapshot.mockResolvedValue({
    plugins: [],
    diagnostics: [],
    contextEngineQuarantines: [],
    runtimeToolQuarantines: [],
    channelPluginFailures: [],
  });
  pluginHealthRuntimeMock.collectRuntimePluginHealthSnapshot.mockReset();
  pluginHealthRuntimeMock.collectRuntimePluginHealthSnapshot.mockReturnValue({
    plugins: [],
    diagnostics: [],
    contextEngineQuarantines: [],
    runtimeToolQuarantines: [],
    channelPluginFailures: [],
  });
});

describe("buildStatusText continuation line", () => {
  const continuationSessionKey = "agent:main:cont-test";

  // Each test gets its own custody state; status reads the hydrated projection.
  useContinuationCustodyTestState();

  afterEach(() => {
    _resetVolitionalCounts(continuationSessionKey);
  });

  const cfgWithContinuation = {
    ...baseCfg,
    agents: {
      defaults: {
        continuation: {
          enabled: true,
          maxChainLength: 100,
        },
      },
    },
  } as OpenClawConfig;

  it("shows continuation line when continuation is enabled", async () => {
    incrementVolitionalCompactionCount(continuationSessionKey);

    const text = await buildStatusText({
      cfg: cfgWithContinuation,
      sessionEntry: {
        sessionId: "cont-test",
        updatedAt: 0,
        totalTokens: 0,
        continuationChainCount: 3,
        compactionCount: 1,
      },
      sessionKey: continuationSessionKey,
      parentSessionKey: continuationSessionKey,
      sessionScope: "per-sender",
      statusChannel: "whatsapp",
      provider: "anthropic",
      model: "claude-opus-4-6",
      contextTokens: 0,
      resolvedFastMode: false,
      resolvedVerboseLevel: "off",
      resolvedReasoningLevel: "off",
      resolveDefaultThinkingLevel: async () => undefined,
      isGroup: false,
      defaultGroupActivation: () => "mention",
    });

    expect(text).toContain("🔄 Continuation: chain 3/100");
    expect(text).toContain("volitional: 1");
  });

  it("does not show continuation line when continuation is disabled", async () => {
    const text = await buildStatusText({
      cfg: baseCfg,
      sessionEntry: {
        sessionId: "cont-test",
        updatedAt: 0,
        totalTokens: 0,
      },
      sessionKey: continuationSessionKey,
      parentSessionKey: continuationSessionKey,
      sessionScope: "per-sender",
      statusChannel: "whatsapp",
      provider: "anthropic",
      model: "claude-opus-4-6",
      contextTokens: 0,
      resolvedFastMode: false,
      resolvedVerboseLevel: "off",
      resolvedReasoningLevel: "off",
      resolveDefaultThinkingLevel: async () => undefined,
      isGroup: false,
      defaultGroupActivation: () => "mention",
    });

    expect(text).not.toContain("Continuation:");
  });

  it("renders delegate and post-compaction counts correctly", async () => {
    incrementVolitionalCompactionCount(continuationSessionKey);
    incrementVolitionalCompactionCount(continuationSessionKey);
    await enqueuePendingDelegate(continuationSessionKey, { task: "task-a" });
    await enqueuePendingDelegate(continuationSessionKey, { task: "task-b" });
    await stagePostCompactionDelegate(continuationSessionKey, {
      task: "compaction-task",
      createdAt: Date.now(),
      silent: false,
    });

    const text = await buildStatusText({
      cfg: cfgWithContinuation,
      sessionEntry: {
        sessionId: "cont-test",
        updatedAt: 0,
        totalTokens: 0,
        continuationChainCount: 5,
        compactionCount: 2,
      },
      sessionKey: continuationSessionKey,
      parentSessionKey: continuationSessionKey,
      sessionScope: "per-sender",
      statusChannel: "whatsapp",
      provider: "anthropic",
      model: "claude-opus-4-6",
      contextTokens: 0,
      resolvedFastMode: false,
      resolvedVerboseLevel: "off",
      resolvedReasoningLevel: "off",
      resolveDefaultThinkingLevel: async () => undefined,
      isGroup: false,
      defaultGroupActivation: () => "mention",
    });

    expect(text).toContain("chain 5/100");
    expect(text).toContain("2 delegates pending");
    expect(text).toContain("1 post-compaction staged");
    expect(text).toContain("volitional: 2");
  });
});
