// Production startup path for continuation custody (RFC §5.4.5, "Update
// behavior"): after Gateway scheduled-service activation, a turn admitted
// before custody boot must not outrun the legacy import. Nothing here calls
// the importer or custody boot directly, and the 1.4 s recovery timer never
// fires, so the import can only come from phase A under the mutation fence.
import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import { resetContinuationCustodyImportGateForTests } from "../auto-reply/continuation/custody-import-gate.js";
import { resetContinuationCustodyProjection } from "../auto-reply/continuation/custody/custody-projection.js";
import {
  listContinuationRecords,
  whenContinuationCustodyReady,
} from "../auto-reply/continuation/custody/custody-store.js";
import {
  OWNER_A,
  OWNER_B,
  delegateState,
  readReceipts,
  seedFlow,
  writeLegacyPayload,
  type Options,
} from "../auto-reply/continuation/custody/legacy-taskflow-import.test-support.js";
import {
  enqueuePendingDelegate,
  pendingDelegateCount,
} from "../auto-reply/continuation/delegate-store.js";
import { clearRuntimeConfigSnapshot, setRuntimeConfigSnapshot } from "../config/config.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resetGatewayWorkAdmission } from "../process/gateway-work-admission.js";
import {
  closeOpenClawStateDatabaseAsync,
  closeOpenClawStateDatabaseForTest,
} from "../state/openclaw-state-db.js";
import { createTestGatewayScheduler } from "../test-utils/gateway-scheduler-clock.js";
import { activateGatewayScheduledServices } from "./server-runtime-services.js";

vi.mock("../infra/heartbeat-runner-scheduler.js", () => ({
  startHeartbeatRunner: () => ({ stop() {}, updateConfig() {} }),
}));
vi.mock("../sessions/session-upstream-monitor.js", () => ({
  startSessionUpstreamMonitor: () => ({ stop() {} }),
}));
vi.mock("../infra/session-delivery-queue-runtime.js", () => ({
  startSessionDeliveryRuntime: () => async () => {},
  schedulePendingSessionDeliveries: async () => {},
}));
vi.mock("./server-restart-sentinel.js", () => ({
  recoverPendingRestartContinuationDeliveries: async () => {},
  deliverQueuedSessionDelivery: async () => {},
  settleQueuedSessionDelivery: async () => {},
}));

const STUCK_ATTACHMENT_ID = "0b6f5d7e-8c1a-4b2f-9e3d-5a6b7c8d9e0f";

let services: ReturnType<typeof activateGatewayScheduledServices> | undefined;
let scheduler: ReturnType<typeof createTestGatewayScheduler> | undefined;
const tempDirs = useAutoCleanupTempDirTracker((cleanup) => {
  afterEach(async () => {
    await services?.stopDeliveryRecovery();
    services?.heartbeatRunner.stop();
    await scheduler?.stop();
    services = undefined;
    scheduler = undefined;
    resetContinuationCustodyProjection();
    resetContinuationCustodyImportGateForTests();
    await closeOpenClawStateDatabaseAsync();
    closeOpenClawStateDatabaseForTest();
    clearRuntimeConfigSnapshot();
    resetGatewayWorkAdmission();
    vi.unstubAllEnvs();
    cleanup();
  });
});

it("imports legacy continuation rows at Gateway startup and fences writes behind the import", async () => {
  resetGatewayWorkAdmission();
  const stateDir = tempDirs.make("openclaw-startup-continuation-readiness-");
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  vi.stubEnv("OPENCLAW_SUPERVISOR_MODE", "");
  const options: Options = { env: { ...process.env, OPENCLAW_STATE_DIR: stateDir } };
  // Owner A: a surviving queued legacy delegate the import carries over.
  seedFlow(options, {
    flowId: "legacy-queued",
    owner: OWNER_A,
    controller: "delegate",
    status: "queued",
    state: delegateState(),
  });
  // Owner B: a legacy delegate whose payload cannot be copied, so its import fails.
  seedFlow(options, {
    flowId: "legacy-stuck",
    owner: OWNER_B,
    controller: "delegate",
    status: "queued",
    state: delegateState({ attachmentId: STUCK_ATTACHMENT_ID, attachmentCount: 1 }),
  });
  writeLegacyPayload(options, {
    attachmentId: STUCK_ATTACHMENT_ID,
    flowId: "legacy-stuck",
    owner: OWNER_B,
  });
  fs.writeFileSync(path.join(stateDir, "attachments", "continuation-custody"), "blocked");
  const cfg: OpenClawConfig = { agents: { defaults: { heartbeat: { every: "0m" } } } };
  setRuntimeConfigSnapshot(cfg);
  scheduler = createTestGatewayScheduler();
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  services = activateGatewayScheduledServices({
    scheduler,
    minimalTestGateway: false,
    cfgAtStart: cfg,
    deps: {},
    sessionDeliveryRecoveryMaxEnqueuedAt: Date.now(),
    cronEnabled: false,
    log: { ...log, child: () => log },
  });
  // A turn admitted during startup writes custody before the recovery timer
  // (1.4 s) could have fired. The write runs phase A (import, then gate and
  // projection) and waits for it.
  const admitted = await enqueuePendingDelegate(OWNER_A, { task: "admitted during startup" });
  await expect(enqueuePendingDelegate(OWNER_B, { task: "would bypass" })).rejects.toThrow(
    "waiting on legacy import",
  );
  await whenContinuationCustodyReady();

  const records = (await listContinuationRecords({})).map((record) => record.recordId).toSorted();
  expect(records).toEqual(["legacy-queued", admitted.recordId].toSorted());
  expect(readReceipts(options).some((row) => row.source_key.endsWith(":legacy-queued"))).toBe(true);
  expect(pendingDelegateCount(OWNER_A)).toBe(2);
  expect(log.error).not.toHaveBeenCalled();
});
