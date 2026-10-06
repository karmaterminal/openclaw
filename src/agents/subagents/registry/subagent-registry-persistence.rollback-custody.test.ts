import { describe, expect, it } from "vitest";
import { createDeferred } from "../../../../test/helpers/promise.js";
import { captureOpenClawStateWorkerContext } from "../../../state/openclaw-state-worker-context.js";
import type { SubagentRunMutation } from "./subagent-registry-mutation.types.js";
import { mutateSubagentRuns } from "./subagent-registry-persistence.js";
import { annotateSubagentRunRollbackCustody } from "./subagent-registry-rollback-custody.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";
import { copySubagentRunRuntimeOwner } from "./subagent-run-generation.js";

const runId = "run-staged-kill";
const siblingRunId = "run-staged-sibling";
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
 * Upstream 14fe10d01c replaced staged postimage publication (and the custody
 * rebase it needed) with one FIFO writer, `mutateSubagentRuns`. This fixture
 * stands in for the native store through the writer's `commit` seam: like the
 * real writer, durable bytes are copies of the planned postimages. The first
 * write (the Stop's kill claim) is held, either before its commit
 * (`commitFirst=false`) or after its bytes are durable but before the receipt
 * returns (`commitFirst=true`), while later writes on the same row queue behind it.
 */
function stageKillClaim(options: { commitFirst?: boolean; sibling?: boolean } = {}) {
  const runs = new Map<string, SubagentRunRecord>([[runId, createRow()]]);
  const rowIds = [runId];
  if (options.sibling) {
    // A multi-row Stop also stages the same session's other row.
    runs.set(siblingRunId, createRow(siblingRunId));
    rowIds.push(siblingRunId);
  }
  const context = captureOpenClawStateWorkerContext();
  const durable = new Map<string, SubagentRunRecord>();
  const firstWrite = createDeferred();
  const firstWriteEntered = createDeferred();
  let writes = 0;
  const commit = async <T>(planned: SubagentRunMutation<T>): Promise<SubagentRunMutation<T>> => {
    writes += 1;
    const first = writes === 1;
    if (first && !options.commitFirst) {
      firstWriteEntered.resolve();
      await firstWrite.promise;
    }
    const postimages = new Map(
      [...(planned.postimages ?? [])].map(
        ([id, row]) =>
          [id, row ? copySubagentRunRuntimeOwner(row, structuredClone(row)) : null] as const,
      ),
    );
    for (const [id, row] of postimages) {
      if (row) {
        durable.set(id, structuredClone(row));
      } else {
        durable.delete(id);
      }
    }
    if (first && options.commitFirst) {
      firstWriteEntered.resolve();
      await firstWrite.promise;
    }
    return { value: planned.value, postimages };
  };
  const mutate = <T>(
    ids: readonly string[],
    plan: (rows: ReadonlyMap<string, SubagentRunRecord>) => SubagentRunMutation<T>,
  ) => mutateSubagentRuns(ids, plan, { runs, context, commit });
  const publication = mutate(rowIds, (rows) => ({
    value: true,
    postimages: new Map(
      rowIds.flatMap((id) => {
        const row = rows.get(id);
        return row ? [[id, { ...row, killIntent: claim }] as const] : [];
      }),
    ),
  }));
  // Mirrors SubagentRunManager.recordAcceptedSubagentSpawnRollback: plan on a copy
  // of the current (frozen) row, so custody lands after any queued owner write.
  const recordCustody = () =>
    mutate([runId], (rows) => {
      const current = rows.get(runId);
      if (!current) {
        return { value: false };
      }
      const next = { ...current };
      annotateSubagentRunRollbackCustody(next, rollback);
      return { value: true, postimages: new Map([[runId, next]]) };
    });
  const changeLabel = () =>
    mutate([runId], (rows) => {
      const current = rows.get(runId);
      return current
        ? {
            value: true,
            postimages: new Map([[runId, { ...current, label: "changed by another owner" }]]),
          }
        : { value: false };
    });
  return {
    runs,
    durable,
    publication,
    recordCustody,
    changeLabel,
    entered: firstWriteEntered.promise,
    release: firstWrite.resolve,
    writes: () => writes,
  };
}

describe("staged registry writes and rollback custody", () => {
  it.each([false, true])(
    "rebases a staged kill onto custody recorded while it was pending (commitFirst=%s)",
    async (commitFirst) => {
      const staged = stageKillClaim({ commitFirst });
      await staged.entered;
      expect(staged.runs.get(runId)?.killIntent).toBeUndefined();
      // HIGH (absorb 14fe10d0): contract changed by upstream; needs frond decision:
      // custody used to be applied to the live row synchronously, superseding the
      // staged write, which then rebased onto it. Upstream's FIFO writer instead
      // queues custody BEHIND the pending owner write, so custody is neither live
      // nor durable until that write settles. The asserted end state (both the
      // kill claim and the custody survive, live and durable) is unchanged.
      const custody = staged.recordCustody();
      staged.release();

      await expect(staged.publication).resolves.toBe(true);
      await expect(custody).resolves.toBe(true);
      expect(staged.writes()).toBe(2);
      const live = staged.runs.get(runId);
      // HIGH (absorb 14fe10d0): rows are frozen copies upstream, so the Stop's
      // claim is matched by value (as releaseSubagentRunKillClaim does), not by
      // object identity.
      expect(live?.killIntent).toEqual(claim);
      expect(live?.acceptedSpawnRollback).toEqual(rollback);
      expect(live?.execution.suppressSessionEffects).toBe(true);
      expect(staged.durable.get(runId)).toMatchObject({
        killIntent: claim,
        acceptedSpawnRollback: rollback,
        suppressCompletionDelivery: true,
      });
    },
  );

  it("rebases a multi-row write whose sibling row is unchanged", async () => {
    const staged = stageKillClaim({ sibling: true });
    await staged.entered;
    const custody = staged.recordCustody();
    staged.release();

    await expect(staged.publication).resolves.toBe(true);
    await expect(custody).resolves.toBe(true);
    expect(staged.writes()).toBe(2);
    expect(staged.durable.get(runId)).toMatchObject({
      killIntent: claim,
      acceptedSpawnRollback: rollback,
    });
    const sibling = staged.durable.get(siblingRunId);
    expect(sibling).toMatchObject({ killIntent: claim });
    expect(sibling?.acceptedSpawnRollback).toBeUndefined();
    expect(staged.runs.get(siblingRunId)?.killIntent).toEqual(claim);
  });

  // H2 re-spec (🩸, absorb 14fe10d0 rollback-custody fix spec): upstream removed
  // staged-postimage supersession. Overlapping writes on a row are serialized and
  // each plans on its predecessor's postimage, so the contract is "no lost update":
  // every owner's write survives in the live AND the durable row. The `commit`
  // fixture proves FIFO ordering only; product custody recovery is H1's tests.
  it("serializes a staged kill, custody, and another owner's change with no lost update", async () => {
    const staged = stageKillClaim();
    await staged.entered;
    const custody = staged.recordCustody();
    const changed = staged.changeLabel();
    staged.release();

    await expect(staged.publication).resolves.toBe(true);
    await expect(custody).resolves.toBe(true);
    await expect(changed).resolves.toBe(true);
    expect(staged.writes()).toBe(3);
    for (const row of [staged.runs.get(runId), staged.durable.get(runId)]) {
      expect(row).toMatchObject({
        killIntent: claim,
        acceptedSpawnRollback: rollback,
        label: "changed by another owner",
      });
    }
  });

  // H2 re-spec: the same serialized "no lost update" contract without custody.
  it("serializes a staged kill and another owner's change with no lost update", async () => {
    const staged = stageKillClaim();
    await staged.entered;
    const changed = staged.changeLabel();
    staged.release();

    await expect(staged.publication).resolves.toBe(true);
    await expect(changed).resolves.toBe(true);
    expect(staged.writes()).toBe(2);
    for (const row of [staged.runs.get(runId), staged.durable.get(runId)]) {
      expect(row).toMatchObject({
        killIntent: claim,
        label: "changed by another owner",
      });
      expect(row?.acceptedSpawnRollback).toBeUndefined();
    }
  });
});
