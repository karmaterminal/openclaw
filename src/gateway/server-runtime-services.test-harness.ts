import { vi } from "vitest";

type StartSessionDeliveryRuntime =
  typeof import("../infra/session-delivery-queue-runtime.js").startSessionDeliveryRuntime;
type StartHeartbeatRunner = typeof import("../infra/heartbeat-runner.js").startHeartbeatRunner;
type DrainPendingDeliveries =
  typeof import("../infra/outbound/delivery-queue-recovery.js").drainPendingDeliveriesCore;
type RecoverPendingDeliveries =
  typeof import("../infra/outbound/delivery-queue-recovery.js").recoverPendingDeliveries;
type MigrateLegacyPendingOutboundDeliveries =
  typeof import("../infra/outbound/delivery-queue-migration.js").migrateLegacyPendingOutboundDeliveries;

const runtimeServiceMocks = vi.hoisted(() => {
  const heartbeatRunner = {
    stop: vi.fn(),
    updateConfig: vi.fn(),
  };
  const stopSessionUpstreamMonitor = vi.fn();
  const stopSessionDeliveryRuntime = vi.fn(async () => {});
  return {
    heartbeatRunner,
    startHeartbeatRunner: vi.fn<StartHeartbeatRunner>(() => heartbeatRunner),
    runHeartbeatOnce: vi.fn(async () => ({ status: "ran" as const, durationMs: 1 })),
    startChannelHealthMonitor: vi.fn(() => ({
      stop: vi.fn(),
      shutdown: vi.fn(),
      waitForIdle: vi.fn(async () => {}),
    })),
    stopSessionUpstreamMonitor,
    stopSessionDeliveryRuntime,
    startSessionDeliveryRuntime: vi.fn<StartSessionDeliveryRuntime>(
      () => stopSessionDeliveryRuntime,
    ),
    schedulePendingSessionDeliveries: vi.fn(async () => undefined),
    startSessionUpstreamMonitor: vi.fn(() => ({ stop: stopSessionUpstreamMonitor })),
    recoverPendingDeliveries: vi.fn<RecoverPendingDeliveries>(async () => ({
      recovered: 0,
      failed: 0,
      skippedMaxRetries: 0,
      deferredBackoff: 0,
    })),
    migrateLegacyPendingOutboundDeliveries: vi.fn<MigrateLegacyPendingOutboundDeliveries>(
      async () => ({ moved: 0, skipped: 0, remaining: 0 }),
    ),
    drainPendingDeliveries: vi.fn<DrainPendingDeliveries>(async () => undefined),
    recoverPendingRestartContinuationDeliveries: vi.fn(async () => undefined),
    recoverPendingContinuationDelegates: vi.fn(async () => ({
      sessions: 0,
      dispatched: 0,
      rejected: 0,
    })),
    requeueAwaitingNextCompactionDelegates: vi.fn(async () => ({ requeued: 0 })),
    recoverAndReleaseStagedPostCompactionDelegates: vi.fn(async () => ({
      sessions: 0,
      dispatched: 0,
      failed: 0,
    })),
    recoverPendingContinuationWork: vi.fn(async () => ({
      sessions: 0,
      dispatched: 0,
      failed: 0,
      reaped: 0,
      terminalNotices: 0,
    })),
    deliverQueuedSessionDelivery: vi.fn(async () => undefined),
    settleQueuedSessionDelivery: vi.fn(async () => undefined),
    deliverOutboundPayloads: vi.fn(),
    assertQueuedConversationDeliveryAttemptAuthorized: vi.fn(),
  };
});

vi.mock("../infra/heartbeat-runner.js", () => ({
  resolveHeartbeatAgents: (cfg: { agents?: { defaults?: { heartbeat?: unknown } } }) => [
    { agentId: "main", heartbeat: cfg.agents?.defaults?.heartbeat },
  ],
  startHeartbeatRunner: runtimeServiceMocks.startHeartbeatRunner,
  runHeartbeatOnce: runtimeServiceMocks.runHeartbeatOnce,
}));

vi.mock("../sessions/session-upstream-monitor.js", () => ({
  startSessionUpstreamMonitor: runtimeServiceMocks.startSessionUpstreamMonitor,
}));

vi.mock("../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: runtimeServiceMocks.deliverOutboundPayloads,
  deliverOutboundPayloadsInternal: runtimeServiceMocks.deliverOutboundPayloads,
}));

vi.mock("../infra/outbound/delivery-queue-recovery.js", () => ({
  recoverPendingDeliveries: runtimeServiceMocks.recoverPendingDeliveries,
  drainPendingDeliveriesCore: runtimeServiceMocks.drainPendingDeliveries,
}));

vi.mock("../infra/outbound/delivery-queue-migration.js", () => ({
  migrateLegacyPendingOutboundDeliveries:
    runtimeServiceMocks.migrateLegacyPendingOutboundDeliveries,
}));

vi.mock("./conversation-route-ownership.js", () => ({
  assertQueuedConversationDeliveryAttemptAuthorized:
    runtimeServiceMocks.assertQueuedConversationDeliveryAttemptAuthorized,
}));

vi.mock("../infra/session-delivery-queue-runtime.js", () => ({
  startSessionDeliveryRuntime: runtimeServiceMocks.startSessionDeliveryRuntime,
  schedulePendingSessionDeliveries: runtimeServiceMocks.schedulePendingSessionDeliveries,
}));

vi.mock("./server-restart-sentinel.js", () => ({
  deliverQueuedSessionDelivery: runtimeServiceMocks.deliverQueuedSessionDelivery,
  recoverPendingRestartContinuationDeliveries:
    runtimeServiceMocks.recoverPendingRestartContinuationDeliveries,
  settleQueuedSessionDelivery: runtimeServiceMocks.settleQueuedSessionDelivery,
}));

vi.mock("../auto-reply/continuation/delegate-dispatch-recovery.js", () => ({
  recoverPendingContinuationDelegates: runtimeServiceMocks.recoverPendingContinuationDelegates,
  requeueAwaitingNextCompactionDelegates:
    runtimeServiceMocks.requeueAwaitingNextCompactionDelegates,
  recoverAndReleaseStagedPostCompactionDelegates:
    runtimeServiceMocks.recoverAndReleaseStagedPostCompactionDelegates,
}));

vi.mock("../auto-reply/continuation/work-dispatch.js", () => ({
  recoverPendingContinuationWork: runtimeServiceMocks.recoverPendingContinuationWork,
}));

vi.mock("./channel-health-monitor.js", () => ({
  startChannelHealthMonitor: runtimeServiceMocks.startChannelHealthMonitor,
}));

// Vitest moves the declaration before imports; it rejects an exported hoisted declaration.
export { runtimeServiceMocks };
