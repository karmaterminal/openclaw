// Clean Gateway shutdown clears the delegate artifact cleanup interval.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalHookEvent } from "../hooks/internal-hooks.js";
import { resetPluginRuntimeStateForTest } from "../plugins/runtime.js";
import {
  createGatewayCloseTestDepsFactory,
  createGatewayCloseTestHandlerFactory,
} from "./server-close.test-support.js";

type TriggerInternalHookMock = (event: InternalHookEvent) => Promise<void>;

const mocks = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  listChannelPlugins: vi.fn((): Array<{ id: "telegram" | "discord" }> => []),
  disposeAllCodeModeRuns: vi.fn(),
  disposeAgentHarnesses: vi.fn<() => Promise<void>>(async () => undefined),
  closeProviderTransportDispatcherPool: vi.fn(async () => undefined),
  disposeAllSessionMcpRuntimes: vi.fn<() => Promise<void>>(async () => undefined),
  triggerInternalHook: vi.fn<TriggerInternalHookMock>(async (_eventValue) => undefined),
  disposeAllBundleLspRuntimes: vi.fn<() => Promise<void>>(async () => undefined),
  drainRetainedEmbeddingProviders: vi.fn<() => Promise<void>>(async () => undefined),
  stopGmailWatcher: vi.fn(async () => undefined),
  disposeAcpSessionManager: vi.fn(async (_reason: string) => undefined),
  fenceSessionSuspensionWritesForGatewayShutdown: vi.fn(),
  closePluginStateDatabaseAsync: vi.fn<() => Promise<void>>(async () => undefined),
}));

vi.mock("../channels/plugins/index.js", async () => ({
  ...(await vi.importActual<typeof import("../channels/plugins/index.js")>(
    "../channels/plugins/index.js",
  )),
  listChannelPlugins: mocks.listChannelPlugins,
}));

vi.mock("../hooks/gmail-watcher.js", () => ({
  stopGmailWatcher: mocks.stopGmailWatcher,
}));

vi.mock("../hooks/internal-hooks.js", async () => {
  const actual = await vi.importActual<typeof import("../hooks/internal-hooks.js")>(
    "../hooks/internal-hooks.js",
  );
  return {
    ...actual,
    triggerInternalHook: mocks.triggerInternalHook,
  };
});

vi.mock("../agents/harness/registry.js", () => ({
  disposeRegisteredAgentHarnesses: mocks.disposeAgentHarnesses,
}));

vi.mock("../agents/code-mode-state.js", () => ({
  disposeAllCodeModeRuns: mocks.disposeAllCodeModeRuns,
}));

vi.mock("../agents/provider-transport-dispatcher-pool.js", () => ({
  closeProviderTransportDispatcherPool: mocks.closeProviderTransportDispatcherPool,
}));

vi.mock("../agents/agent-bundle-mcp-tools.js", async () => ({
  ...(await vi.importActual<typeof import("../agents/agent-bundle-mcp-tools.js")>(
    "../agents/agent-bundle-mcp-tools.js",
  )),
  disposeAllSessionMcpRuntimes: mocks.disposeAllSessionMcpRuntimes,
}));

vi.mock("../agents/agent-bundle-lsp-runtime.js", async () => ({
  ...(await vi.importActual<typeof import("../agents/agent-bundle-lsp-runtime.js")>(
    "../agents/agent-bundle-lsp-runtime.js",
  )),
  disposeAllBundleLspRuntimes: mocks.disposeAllBundleLspRuntimes,
}));

vi.mock("./embeddings-provider-lifetime.js", () => ({
  drainRetainedOpenAiEmbeddingProviders: mocks.drainRetainedEmbeddingProviders,
}));

vi.mock("../agents/session-suspension.js", () => ({
  fenceSessionSuspensionWritesForGatewayShutdown:
    mocks.fenceSessionSuspensionWritesForGatewayShutdown,
}));

vi.mock("../acp/control-plane/manager.js", () => ({
  disposeAcpSessionManager: mocks.disposeAcpSessionManager,
}));

vi.mock("../plugin-state/plugin-state-store.js", async () => ({
  ...(await vi.importActual<typeof import("../plugin-state/plugin-state-store.js")>(
    "../plugin-state/plugin-state-store.js",
  )),
  closePluginStateDatabaseAsync: mocks.closePluginStateDatabaseAsync,
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: mocks.logInfo,
    warn: mocks.logWarn,
  })),
}));

const createGatewayCloseHandler = createGatewayCloseTestHandlerFactory(
  await import("./server-close.js"),
);
const { finishGatewayRestartTrace } = await import("./restart-trace.js");
const originalRestartTraceEnv = process.env.OPENCLAW_GATEWAY_RESTART_TRACE;

const createGatewayCloseTestDeps = createGatewayCloseTestDepsFactory(mocks);

describe("createGatewayCloseHandler", () => {
  beforeEach(() => {
    resetPluginRuntimeStateForTest();
    vi.useRealTimers();
    mocks.logInfo.mockClear();
    mocks.logWarn.mockClear();
    mocks.listChannelPlugins.mockReset();
    mocks.listChannelPlugins.mockReturnValue([]);
    mocks.disposeAllCodeModeRuns.mockReset();
    mocks.disposeAgentHarnesses.mockClear();
    mocks.disposeAgentHarnesses.mockResolvedValue(undefined);
    mocks.disposeAllSessionMcpRuntimes.mockClear();
    mocks.disposeAllSessionMcpRuntimes.mockResolvedValue(undefined);
    mocks.triggerInternalHook.mockReset();
    mocks.triggerInternalHook.mockResolvedValue(undefined);
    mocks.disposeAllBundleLspRuntimes.mockClear();
    mocks.disposeAllBundleLspRuntimes.mockResolvedValue(undefined);
    mocks.drainRetainedEmbeddingProviders.mockClear();
    mocks.drainRetainedEmbeddingProviders.mockResolvedValue(undefined);
    mocks.stopGmailWatcher.mockClear();
    mocks.stopGmailWatcher.mockResolvedValue(undefined);
    mocks.closeProviderTransportDispatcherPool.mockClear();
    mocks.closeProviderTransportDispatcherPool.mockResolvedValue(undefined);
    mocks.disposeAcpSessionManager.mockReset();
    mocks.disposeAcpSessionManager.mockResolvedValue(undefined);
    mocks.fenceSessionSuspensionWritesForGatewayShutdown.mockReset();
    mocks.closePluginStateDatabaseAsync.mockReset();
    mocks.closePluginStateDatabaseAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    finishGatewayRestartTrace("test.finish");
    resetPluginRuntimeStateForTest();
    vi.useRealTimers();
    if (originalRestartTraceEnv === undefined) {
      delete process.env.OPENCLAW_GATEWAY_RESTART_TRACE;
    } else {
      process.env.OPENCLAW_GATEWAY_RESTART_TRACE = originalRestartTraceEnv;
    }
  });

  it("completes a clean shutdown with a ShutdownResult", async () => {
    const delegateArtifactCleanup = setInterval(() => undefined, 60_000);
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const deps = createGatewayCloseTestDeps({ delegateArtifactCleanup });
    const close = createGatewayCloseHandler(deps);

    try {
      const result = await close({ reason: "test" });

      expect(result.warnings).toStrictEqual([]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(deps.cron.stop).toHaveBeenCalledTimes(1);
      expect(deps.heartbeatRunner.stop).toHaveBeenCalledTimes(1);
      expect(deps.stopMediaCleanup).toHaveBeenCalledTimes(1);
      expect(deps.chatRunState.clear).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(delegateArtifactCleanup);
    } finally {
      clearIntervalSpy.mockRestore();
      clearInterval(delegateArtifactCleanup);
    }
  });
});
