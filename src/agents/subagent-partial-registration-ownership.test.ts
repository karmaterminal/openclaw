import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./subagents/registry/subagent-registry.mocks.shared.js";
import "./subagents/registry/subagent-registry.persistence.mocks.test-support.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import * as detachedTaskRuntime from "../tasks/detached-task-runtime.js";
import { captureEnv, setTestEnvValue } from "../test-utils/env.js";
import { runSpawnPipeline } from "./spawn-pipeline.js";
import {
  recordAcceptedSubagentSpawnRollback,
  rollbackSubagentRunRegistration,
} from "./subagents/registry/subagent-registry.js";
import {
  getSubagentRunByChildSessionKey,
  resetSubagentRegistryForTests,
  testing,
} from "./subagents/registry/subagent-registry.test-helpers.js";

// The registry imports its persistence entry points directly from this module, so
// a module mock is what actually reaches the runtime. `actual` is captured inside
// the factory so a test can delegate to the real implementation and only intercept
// the attempt it cares about.
type PersistOrThrow =
  typeof import("./subagents/registry/subagent-registry-state.js").persistSubagentRunsToDiskOrThrow;

// The override is handed the REAL implementation. It cannot import it: this module
// is mocked, so a top-level import of persistSubagentRunsToDiskOrThrow would resolve
// to the wrapper below and recurse.
let persistOrThrowOverride:
  | ((real: PersistOrThrow, ...args: Parameters<PersistOrThrow>) => void)
  | undefined;
vi.mock("./subagents/registry/subagent-registry-state.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./subagents/registry/subagent-registry-state.js")>();
  return {
    ...actual,
    persistSubagentRunsToDiskOrThrow: (...args: Parameters<PersistOrThrow>) =>
      persistOrThrowOverride
        ? persistOrThrowOverride(actual.persistSubagentRunsToDiskOrThrow, ...args)
        : actual.persistSubagentRunsToDiskOrThrow(...args),
  };
});

describe("partial subagent registration ownership", () => {
  const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
  let tempStateDir: string | undefined;

  beforeEach(async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-partial-registration-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);
  });

  afterEach(async () => {
    closeOpenClawStateDatabaseForTest();
    persistOrThrowOverride = undefined;
    resetSubagentRegistryForTests({ persist: false });
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true });
      tempStateDir = undefined;
    }
    envSnapshot.restore();
  });

  it("marks the exact durable row before cleaning up a partial registration", async () => {
    const runId = "run-partial-registration-negative-control";
    const childSessionKey = "agent:main:subagent:partial-registration-negative-control";
    const taskError = new Error("negative-control task row failure");
    const rollbackError = new Error("negative-control rollback persistence failure");
    let persistAttempt = 0;
    persistOrThrowOverride = (real, runs, changedRunIds) => {
      persistAttempt += 1;
      if (persistAttempt === 2) {
        throw rollbackError;
      }
      real(runs, changedRunIds);
    };
    const createTaskSpy = vi
      .spyOn(detachedTaskRuntime, "createRunningTaskRun")
      .mockImplementationOnce(() => {
        throw taskError;
      });
    const terminationAttempts: string[] = [];

    try {
      await expect(
        runSpawnPipeline({
          adapter: {
            initialize: async () => ({}),
            dispatchTurn: async () => ({ runId }),
            cleanupOnFailure: async () => {
              terminationAttempts.push(runId);
              expect(getSubagentRunByChildSessionKey(childSessionKey)).toMatchObject({
                runId,
                acceptedSpawnRollback: { gatewayRunId: runId },
                suppressCompletionDelivery: true,
                execution: { suppressSessionEffects: true },
              });
              throw new Error("negative-control termination incomplete");
            },
          },
          progressSessionKey: "agent:main:main",
          buildRegistration: () => ({
            runId,
            childSessionKey,
            requesterSessionKey: "agent:main:main",
            requesterDisplayKey: "main",
            task: "negative control partial registration",
            cleanup: "keep",
            taskRowOwnership: "required",
          }),
          recordAcceptedRollback: (registration, error) =>
            recordAcceptedSubagentSpawnRollback({
              runId: registration.runId,
              childSessionKey: registration.childSessionKey,
              gatewayRunId: registration.runId,
              reason: error instanceof Error ? error.message : String(error),
            }),
          rollbackRegistration: rollbackSubagentRunRegistration,
        }),
      ).rejects.toMatchObject({
        errors: [
          {
            registrationOwnership: {
              status: "new-row-survived",
              attempted: { runId, childSessionKey },
            },
          },
          expect.objectContaining({ message: expect.stringContaining("rollback incomplete") }),
        ],
      });
      expect(terminationAttempts).toEqual([runId]);
      await testing.sweepOnceForTests();
      expect(getSubagentRunByChildSessionKey(childSessionKey)).toMatchObject({
        acceptedSpawnRollback: { gatewayRunId: runId },
        suppressCompletionDelivery: true,
        execution: { suppressSessionEffects: true },
      });
    } finally {
      createTaskSpy.mockRestore();
    }
  });
});
