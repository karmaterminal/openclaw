import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "./subagents/registry/subagent-registry.mocks.shared.js";
import "./subagents/registry/subagent-registry.persistence.mocks.test-support.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
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

describe("partial subagent registration ownership", () => {
  const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
  let tempStateDir: string | undefined;

  beforeEach(async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-partial-registration-"));
    setTestEnvValue("OPENCLAW_STATE_DIR", tempStateDir);
  });

  afterEach(async () => {
    closeOpenClawStateDatabaseForTest();
    await resetSubagentRegistryForTests({ persist: false });
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true });
      tempStateDir = undefined;
    }
    envSnapshot.restore();
  });

  it("marks the exact durable row before cleaning up a partial registration", async () => {
    const runId = "run-partial-registration-negative-control";
    const childSessionKey = "agent:main:subagent:partial-registration-negative-control";
    // Upstream removed the Tasks runtime (6652f7eac8), so the post-persist
    // task-row failure is gone. A committed registration still fails after
    // persistence when publication throws, which drives the same rollback.
    const publishError = new Error("negative-control publication failure");
    const terminationAttempts: string[] = [];

    await expect(
      runSpawnPipeline({
        adapter: {
          initialize: async () => ({}),
          dispatchTurn: async () => ({ runId }),
          cleanupOnFailure: async () => {
            terminationAttempts.push(runId);
            expect(await getSubagentRunByChildSessionKey(childSessionKey)).toMatchObject({
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
        }),
        publishRegistration: () => {
          throw publishError;
        },
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
        publishError,
        expect.objectContaining({ message: expect.stringContaining("rollback incomplete") }),
      ],
    });
    expect(terminationAttempts).toEqual([runId]);
    await testing.sweepOnceForTests();
    expect(await getSubagentRunByChildSessionKey(childSessionKey)).toMatchObject({
      acceptedSpawnRollback: { gatewayRunId: runId },
      suppressCompletionDelivery: true,
      execution: { suppressSessionEffects: true },
    });
  });
});
