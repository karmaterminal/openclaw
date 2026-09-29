// Custody readiness (phase A, RFC docs/design/continue-work-signal-v2.md §5.4.5):
// the production path from surviving legacy TaskFlow rows to a gated, hydrated
// custody store. No test here calls the importer directly: every legacy import
// must happen because a real custody mutation, or Gateway startup, ran phase A.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../../test/helpers/temp-dir.js";
import { closeOpenClawStateDatabaseAsync } from "../../../state/openclaw-state-db.js";
import { runContinuationCustodyBoot } from "../custody-boot.js";
import { resetContinuationCustodyImportGateForTests } from "../custody-import-gate.js";
import {
  enqueuePendingDelegate,
  pendingDelegateCount,
  resolveQueuedDelegateCounts,
} from "../delegate-store.js";
import {
  invalidateContinuationCustodyOwners,
  resetContinuationCustodyProjection,
} from "./custody-projection.js";
import {
  listContinuationRecords,
  resolveContinuationCustodyDatabasePath,
  whenContinuationCustodyReady,
} from "./custody-store.js";
import {
  OWNER_A,
  OWNER_B,
  delegateState,
  readReceipts,
  seedFlow,
  writeLegacyPayload,
  type Options,
} from "./legacy-taskflow-import.test-support.js";

const importControl = vi.hoisted(() => ({ calls: 0, throwNext: false }));

vi.mock("./legacy-taskflow-import.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./legacy-taskflow-import.js")>();
  return {
    ...actual,
    migrateContinuationTaskFlowCustody: async (
      options: Parameters<typeof actual.migrateContinuationTaskFlowCustody>[0],
    ) => {
      importControl.calls += 1;
      if (importControl.throwNext) {
        importControl.throwNext = false;
        throw new Error("injected import failure");
      }
      return await actual.migrateContinuationTaskFlowCustody(options);
    },
  };
});

const IMPORT_PENDING = "waiting on legacy import";

let options: Options;
const tempDirs = useAutoCleanupTempDirTracker((cleanup) =>
  afterEach(async () => {
    resetContinuationCustodyProjection();
    resetContinuationCustodyImportGateForTests();
    await closeOpenClawStateDatabaseAsync();
    vi.unstubAllEnvs();
    cleanup();
  }),
);

beforeEach(() => {
  // Deliberately no hydration: each test starts as a Gateway that has not
  // run custody boot yet.
  const stateDir = tempDirs.make("openclaw-continuation-readiness-");
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  options = { env: { ...process.env, OPENCLAW_STATE_DIR: stateDir } };
  importControl.calls = 0;
  importControl.throwNext = false;
});

function seedLegacyQueuedDelegate(flowId: string, owner = OWNER_A): void {
  seedFlow(options, {
    flowId,
    owner,
    controller: "delegate",
    status: "queued",
    state: delegateState(),
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 60_000,
  });
}

const STUCK_ATTACHMENT_ID = "0b6f5d7e-8c1a-4b2f-9e3d-5a6b7c8d9e0f";

/**
 * Seeds a legacy delegate whose payload file cannot be copied into the new
 * root (a file sits where the directory goes): the L3 per-owner import fault.
 * That owner's import fails and it stays awaiting import; others import.
 */
function seedUncopyableLegacyDelegate(flowId: string, owner: string): void {
  seedFlow(options, {
    flowId,
    owner,
    controller: "delegate",
    status: "queued",
    state: delegateState({ attachmentId: STUCK_ATTACHMENT_ID, attachmentCount: 1 }),
  });
  writeLegacyPayload(options, { attachmentId: STUCK_ATTACHMENT_ID, flowId, owner });
  fs.writeFileSync(
    path.join(options.env.OPENCLAW_STATE_DIR!, "attachments", "continuation-custody"),
    "blocked",
  );
}

async function recordIds(): Promise<string[]> {
  return (await listContinuationRecords()).map((record) => record.recordId).toSorted();
}

describe("continuation custody readiness (phase A)", () => {
  it("imports surviving legacy rows before the first custody write commits", async () => {
    seedLegacyQueuedDelegate("legacy-queued");

    const created = await enqueuePendingDelegate(OWNER_B, { task: "fresh work" });

    expect(importControl.calls).toBe(1);
    expect(await recordIds()).toEqual(["legacy-queued", created.recordId].toSorted());
    expect(readReceipts(options).some((row) => row.source_key.endsWith(":legacy-queued"))).toBe(
      true,
    );
    // The projection describes post-import state for both owners.
    expect(pendingDelegateCount(OWNER_A)).toBe(1);
    expect(pendingDelegateCount(OWNER_B)).toBe(1);
  });

  it("refuses a startup-window write for an owner whose import failed, and admits others", async () => {
    seedUncopyableLegacyDelegate("legacy-stuck", OWNER_A);

    await expect(enqueuePendingDelegate(OWNER_A, { task: "would bypass" })).rejects.toThrow(
      IMPORT_PENDING,
    );
    const admitted = await enqueuePendingDelegate(OWNER_B, { task: "unaffected owner" });

    expect(await recordIds()).toEqual([admitted.recordId]);
  });

  it("shares one phase A between concurrent first writes", async () => {
    seedLegacyQueuedDelegate("legacy-shared");

    const [first, second] = await Promise.all([
      enqueuePendingDelegate(OWNER_B, { task: "first" }),
      enqueuePendingDelegate(OWNER_B, { task: "second" }),
    ]);

    expect(importControl.calls).toBe(1);
    expect(await recordIds()).toEqual(
      ["legacy-shared", first.recordId, second.recordId].toSorted(),
    );
  });

  it("admits no write when the import throws, and the next write retries phase A", async () => {
    seedLegacyQueuedDelegate("legacy-retry");
    importControl.throwNext = true;

    await expect(enqueuePendingDelegate(OWNER_B, { task: "blocked" })).rejects.toThrow(
      "injected import failure",
    );
    expect(await recordIds()).toEqual([]);

    const created = await enqueuePendingDelegate(OWNER_B, { task: "after retry" });

    expect(importControl.calls).toBe(2);
    expect(await recordIds()).toEqual(["legacy-retry", created.recordId].toSorted());
  });

  it("lets startup's phase A finish while a concurrent first write waits for it (no deadlock)", async () => {
    seedLegacyQueuedDelegate("legacy-startup");
    const order: string[] = [];

    const startup = whenContinuationCustodyReady().then(() => order.push("ready"));
    const write = enqueuePendingDelegate(OWNER_B, { task: "admitted during startup" }).then(
      (record) => {
        order.push("write");
        return record;
      },
    );
    const created = await write;
    await startup;

    expect(order).toEqual(["ready", "write"]);
    expect(importControl.calls).toBe(1);
    expect(await recordIds()).toEqual(["legacy-startup", created.recordId].toSorted());
  });

  it("never reads an unresolved owner as zero queued delegates for a decision", async () => {
    await enqueuePendingDelegate(OWNER_A, { task: "committed" });
    // An unknown write outcome leaves the owner unknown in the projection.
    invalidateContinuationCustodyOwners(resolveContinuationCustodyDatabasePath(), [OWNER_A]);

    expect(pendingDelegateCount(OWNER_A)).toBe(0);
    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 1,
      stagedPostCompaction: 0,
    });
  });

  it("counts legacy work a decision would otherwise miss before hydration", async () => {
    seedLegacyQueuedDelegate("legacy-counted");

    // The sync projection read is unknown here, so a decision must not use it.
    expect(pendingDelegateCount(OWNER_A)).toBe(0);
    expect(await resolveQueuedDelegateCounts(OWNER_A)).toEqual({
      pending: 1,
      stagedPostCompaction: 0,
    });
    expect(importControl.calls).toBe(1);
  });

  it("does not re-run phase A in the late boot (phase B), so it cannot overwrite newer facts", async () => {
    // A stuck owner makes every phase A attempt the import, so the import count
    // shows whether phase B re-read and re-installed custody state.
    seedUncopyableLegacyDelegate("legacy-stuck", OWNER_A);
    await whenContinuationCustodyReady();
    await enqueuePendingDelegate(OWNER_B, { task: "committed after readiness" });
    expect(importControl.calls).toBe(1);

    await runContinuationCustodyBoot({
      // Before the record was created, so recovery leaves it queued.
      armedAt: 0,
      whenSubagentRegistryActivated: async () => {},
    });

    expect(importControl.calls).toBe(1);
    expect(pendingDelegateCount(OWNER_B)).toBe(1);
  });
});
