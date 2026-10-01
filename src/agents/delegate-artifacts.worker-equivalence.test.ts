// Behavior equivalence for the shared-state worker cutover of delegate
// artifacts (#1417 step 5). Every case uses only the public facade, so the
// same assertions also hold against the synchronous main-thread store.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeOpenClawStateDatabaseAsync,
  openOpenClawStateDatabase,
} from "../state/openclaw-state-db.js";
import {
  DELEGATE_ARTIFACT_MAX_BYTES,
  DELEGATE_ARTIFACT_MAX_TOTAL_BYTES,
  createDelegateArtifactPolicy,
  hasRecordedDelegateArtifactCompletionForProducer,
  publishDelegateArtifactCandidates,
  purgeExpiredDelegateArtifacts,
} from "./delegate-artifacts.js";
import { finalize, policy, publish, stateOptions } from "./delegate-artifacts.test-helpers.js";

type Options = ReturnType<typeof stateOptions>;

const PRODUCER = {
  producerSessionKey: "agent:main:subagent:continuation-child",
  producerSessionId: "child-session-1",
  producerRunId: "continuation-delegate-run-1",
};

afterEach(async () => {
  await closeOpenClawStateDatabaseAsync();
});

function rows(options: Options, sql: string): unknown[] {
  return openOpenClawStateDatabase(options).db.prepare(sql).all();
}

function publishBytes(options: Options, publicationKey: string, sizes: number[]) {
  return publishDelegateArtifactCandidates({
    ...PRODUCER,
    publicationKey,
    candidates: sizes.map((size) => ({
      bytes: new Uint8Array(size).fill(0x41),
      mimeType: "text/plain",
    })),
    runtimeEnabled: true,
    crossSessionEnabled: true,
    now: 2_000,
    options,
  });
}

describe("delegate artifacts across the worker boundary", () => {
  it("converges after a restart between publication and finalization", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    expect(await publish(options)).toEqual({ status: "published", count: 1 });

    // Restart: the publication is durable and finalization resumes from it.
    await closeOpenClawStateDatabaseAsync();
    const finalized = await finalize(options);
    expect(finalized.status).toBe("finalized");
    expect(
      rows(options, "SELECT status, size_bytes FROM delegate_artifact_claims ORDER BY ordinal"),
    ).toEqual([{ status: "available", size_bytes: Buffer.byteLength("%PDF-1.7 delegate report") }]);

    // Restart again and replay the same completion: no second decision.
    await closeOpenClawStateDatabaseAsync();
    const replayed = await finalize(options);
    expect(replayed).toEqual(finalized);
    expect(
      rows(options, "SELECT count(*) AS count FROM delegate_artifact_recipient_outcomes"),
    ).toEqual([{ count: 2 }]);
    expect(rows(options, "SELECT count(*) AS count FROM delegate_artifact_bindings")).toEqual([
      { count: 2 },
    ]);
  });

  it("records exactly one completion when two completions race for one policy", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);

    const [first, second] = await Promise.all([
      finalize(options, { completionId: "completion-a", finalizationKey: "finalization-a" }),
      finalize(options, { completionId: "completion-b", finalizationKey: "finalization-b" }),
    ]);
    const outcomes = [first, second].map((result) =>
      result.status === "failed" ? result.disposition : result.status,
    );
    expect(outcomes.toSorted()).toEqual(["completion-integrity-mismatch", "finalized"]);
    expect(rows(options, "SELECT status, completion_id FROM delegate_artifact_policies")).toEqual([
      {
        status: "completed",
        completion_id: first.status === "finalized" ? "completion-a" : "completion-b",
      },
    ]);
    expect(
      rows(options, "SELECT count(*) AS count FROM delegate_artifact_recipient_outcomes"),
    ).toEqual([{ count: 2 }]);
    expect(
      await hasRecordedDelegateArtifactCompletionForProducer(
        { flowId: "flow-1", producerSessionKey: PRODUCER.producerSessionKey },
        options,
      ),
    ).toBe(true);
    expect(
      await hasRecordedDelegateArtifactCompletionForProducer(
        { flowId: "flow-1", producerSessionKey: "agent:main:subagent:other" },
        options,
      ),
    ).toBe(false);
  });

  it("never purges a live policy that a publication or finalization is racing", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    const live = 10_000;
    const [published, purgedDuringPublish] = await Promise.all([
      publish(options),
      purgeExpiredDelegateArtifacts(live, options),
    ]);
    expect(published).toEqual({ status: "published", count: 1 });
    expect(purgedDuringPublish).toBe(0);

    const [finalized, purgedDuringFinalize] = await Promise.all([
      finalize(options),
      purgeExpiredDelegateArtifacts(live, options),
    ]);
    expect(finalized.status).toBe("finalized");
    expect(purgedDuringFinalize).toBe(0);
    expect(
      rows(
        options,
        "SELECT status, backing IS NOT NULL AS backed FROM delegate_artifact_claims ORDER BY ordinal",
      ),
    ).toEqual([{ status: "available", backed: 1 }]);
  });

  it("refuses publication against a policy a purge already expired", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(
      policy({ notBefore: undefined, scheduledAt: undefined }),
      options,
    );
    await publish(options, "tool-call-early");
    const deadline = (
      rows(options, "SELECT retention_deadline FROM delegate_artifact_policies")[0] as {
        retention_deadline: number;
      }
    ).retention_deadline;
    expect(await purgeExpiredDelegateArtifacts(deadline, options)).toBe(1);
    expect(
      await publishDelegateArtifactCandidates({
        ...PRODUCER,
        publicationKey: "tool-call-late",
        candidates: [{ bytes: Buffer.from("late"), mimeType: "text/plain" }],
        runtimeEnabled: true,
        crossSessionEnabled: true,
        now: deadline,
        options,
      }),
    ).toEqual({ status: "rejected", reason: "policy_expired" });
    expect(
      rows(
        options,
        "SELECT publication_key, status FROM delegate_artifact_claims ORDER BY ordinal",
      ),
    ).toEqual([{ publication_key: "tool-call-early", status: "purged" }]);
  });

  it("accepts exactly the aggregate byte limit and persists nothing one byte over", async () => {
    expect(DELEGATE_ARTIFACT_MAX_TOTAL_BYTES).toBe(2 * DELEGATE_ARTIFACT_MAX_BYTES);
    const atLimit = stateOptions();
    await createDelegateArtifactPolicy(policy(), atLimit);
    expect(
      await publishBytes(atLimit, "at-limit", [
        DELEGATE_ARTIFACT_MAX_BYTES,
        DELEGATE_ARTIFACT_MAX_BYTES,
      ]),
    ).toEqual({ status: "published", count: 2 });
    const digest = createHash("sha256")
      .update(new Uint8Array(DELEGATE_ARTIFACT_MAX_BYTES).fill(0x41))
      .digest("hex");
    expect(
      rows(
        atLimit,
        "SELECT size_bytes, length(backing) AS stored, sha256 FROM delegate_artifact_claims ORDER BY ordinal",
      ),
    ).toEqual([
      {
        size_bytes: DELEGATE_ARTIFACT_MAX_BYTES,
        stored: DELEGATE_ARTIFACT_MAX_BYTES,
        sha256: digest,
      },
      {
        size_bytes: DELEGATE_ARTIFACT_MAX_BYTES,
        stored: DELEGATE_ARTIFACT_MAX_BYTES,
        sha256: digest,
      },
    ]);
    // The policy is full: one more byte is the aggregate limit, not a new claim.
    expect(await publishBytes(atLimit, "one-more", [1])).toEqual({
      status: "rejected",
      reason: "policy_limit",
    });

    const overLimit = stateOptions();
    await createDelegateArtifactPolicy(policy(), overLimit);
    expect(
      await publishBytes(overLimit, "over-limit", [
        DELEGATE_ARTIFACT_MAX_BYTES,
        DELEGATE_ARTIFACT_MAX_BYTES,
        1,
      ]),
    ).toEqual({ status: "rejected", reason: "policy_limit" });
    expect(
      await publishBytes(overLimit, "over-artifact", [DELEGATE_ARTIFACT_MAX_BYTES + 1]),
    ).toEqual({ status: "rejected", reason: "invalid_candidate" });
    expect(rows(overLimit, "SELECT count(*) AS count FROM delegate_artifact_claims")).toEqual([
      { count: 0 },
    ]);
  });
});
