import { describe, expect, it } from "vitest";
import { createDeferred } from "../../../../test/helpers/promise.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import {
  captureSubagentRunMutationSnapshot,
  publishSubagentRunPostimages,
  SubagentRegistryWriteError,
} from "./subagent-registry-persistence.js";
import { annotateSubagentRunRollbackCustody } from "./subagent-registry-rollback-custody.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

const runId = "run-staged-kill";
const rollback = { gatewayRunId: "gateway-run", requestedAt: 2, reason: "start lost to Stop" };
const claim = { requestedAt: 3, reason: "killed" };

function createRow(id = runId): SubagentRunRecord {
  return {
    runId: id,
    childSessionKey: "agent:main:subagent:staged-kill",
    requesterSessionKey: "agent:main:main",
    requesterDisplayKey: "main",
    task: "staged kill",
    cleanup: "keep",
    generation: 1,
    createdAt: 1,
    collect: true,
    execution: { status: "queued" },
    completion: { required: false, resultText: null },
    delivery: { status: "not_required" },
  };
}

/**
 * Mirrors the native writer: bytes are captured when the write is staged, and
 * the preimage fence runs again before commit. `commitFirst` models a write
 * whose commit was granted before the custody annotation superseded it.
 */
function stageKillClaim(options: { commitFirst?: boolean; sibling?: boolean } = {}) {
  const entry = createRow();
  const runs = new Map([[runId, entry]]);
  const rows = [entry];
  if (options.sibling) {
    // A multi-row Stop also stages the same session's other row.
    const sibling = createRow("run-staged-sibling");
    runs.set(sibling.runId, sibling);
    rows.push(sibling);
  }
  const durable = new Map<string, SubagentRunRecord>();
  const firstWrite = createDeferred();
  let writes = 0;
  const previous = new Map(rows.map((row) => [row, captureSubagentRunMutationSnapshot(row)]));
  for (const row of rows) {
    row.killIntent = claim;
  }
  const publication = publishSubagentRunPostimages({
    runs,
    previous,
    context: captureOpenClawStateWorkerContext(),
    assertCurrent: () => {},
    persist: async (_context, callbacks, ...runIds) => {
      writes += 1;
      const bytes = runIds.map((id) => structuredClone(runs.get(id)!));
      // Native commits always settle after staging restores the live preimage.
      await (writes === 1 ? firstWrite.promise : Promise.resolve());
      let current = true;
      try {
        callbacks.assertCurrent();
      } catch (error) {
        if (!options.commitFirst) {
          throw new SubagentRegistryWriteError("not-committed", error);
        }
        current = false;
      }
      for (const row of bytes) {
        durable.set(row.runId, row);
      }
      // The custody writer overwrote this commit, so it never publishes.
      if (current) {
        callbacks.onCommitted?.();
      } else {
        durable.set(runId, structuredClone(entry));
      }
    },
  });
  return {
    entry,
    runs,
    durable,
    publication,
    release: firstWrite.resolve,
    writes: () => writes,
  };
}

describe("staged registry writes and rollback custody", () => {
  it.each([false, true])(
    "rebases a staged kill onto custody recorded while it was pending (commitFirst=%s)",
    async (commitFirst) => {
      const staged = stageKillClaim({ commitFirst });
      expect(staged.entry.killIntent).toBeUndefined();
      annotateSubagentRunRollbackCustody(staged.entry, rollback);
      staged.release();

      await expect(staged.publication).resolves.toEqual({
        outcome: "committed",
        publication: "published",
      });
      expect(staged.writes()).toBe(2);
      // The Stop's exact claim object stays the live owner, beside the custody.
      expect(staged.entry.killIntent).toBe(claim);
      expect(staged.entry.acceptedSpawnRollback).toBe(rollback);
      expect(staged.entry.execution.suppressSessionEffects).toBe(true);
      expect(staged.durable.get(runId)).toMatchObject({
        killIntent: claim,
        acceptedSpawnRollback: rollback,
        suppressCompletionDelivery: true,
      });
    },
  );

  it("rebases a multi-row write whose sibling row is unchanged", async () => {
    const staged = stageKillClaim({ sibling: true });
    annotateSubagentRunRollbackCustody(staged.entry, rollback);
    staged.release();

    await expect(staged.publication).resolves.toMatchObject({ publication: "published" });
    expect(staged.writes()).toBe(2);
    expect(staged.durable.get(runId)).toMatchObject({
      killIntent: claim,
      acceptedSpawnRollback: rollback,
    });
    const sibling = staged.durable.get("run-staged-sibling");
    expect(sibling).toMatchObject({ killIntent: claim });
    expect(sibling?.acceptedSpawnRollback).toBeUndefined();
    expect(staged.runs.get("run-staged-sibling")?.killIntent).toBe(claim);
  });

  it("keeps the supersession when the row changed beyond the custody annotation", async () => {
    const staged = stageKillClaim();
    annotateSubagentRunRollbackCustody(staged.entry, rollback);
    staged.entry.label = "changed by another owner";
    staged.release();

    await expect(staged.publication).rejects.toMatchObject({ outcome: "not-committed" });
    expect(staged.writes()).toBe(1);
    expect(staged.entry.killIntent).toBeUndefined();
    expect(staged.durable.has(runId)).toBe(false);
  });

  it("keeps the supersession when no custody was recorded", async () => {
    const staged = stageKillClaim();
    staged.entry.label = "changed by another owner";
    staged.release();

    await expect(staged.publication).rejects.toMatchObject({ outcome: "not-committed" });
    expect(staged.writes()).toBe(1);
  });
});
