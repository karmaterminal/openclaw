// Contracts the shared-state worker boundary adds to delegate artifacts: a lost
// finalization receipt replays, host-resolved session incarnations are rechecked
// after the receipt, and overlapping purges join one in-flight command.
import { afterEach, describe, expect, it } from "vitest";
import {
  closeOpenClawStateDatabaseAsync,
  openOpenClawStateDatabase,
} from "../state/openclaw-state-db.js";
import { runDelegateArtifactOperation } from "./delegate-artifact-operation.js";
import {
  createDelegateArtifactPolicy,
  prepareDelegateArtifactDelivery,
  purgeExpiredDelegateArtifacts,
} from "./delegate-artifacts.js";
import { finalize, policy, publish, stateOptions } from "./delegate-artifacts.test-helpers.js";

type Options = ReturnType<typeof stateOptions>;

const SESSION_IDS = {
  "agent:main:parent": "parent-session-1",
  "agent:main:target": "target-session-1",
};

afterEach(async () => {
  await closeOpenClawStateDatabaseAsync();
});

function rows(options: Options, sql: string): unknown[] {
  return openOpenClawStateDatabase(options).db.prepare(sql).all();
}

describe("delegate artifact worker boundary", () => {
  it("replays a finalization whose commit landed but whose receipt was lost", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);

    // The command commits in the worker; the host dies before using the receipt.
    const lost = await runDelegateArtifactOperation(
      "delegateArtifacts.finalize",
      {
        producerSessionKey: "agent:main:subagent:continuation-child",
        producerSessionId: "child-session-1",
        producerRunId: "continuation-delegate-run-1",
        completionId: "completion-1",
        finalizationKey: "finalization-1",
        completionStatus: "ok",
        completedAt: 9_000,
        silent: true,
        runtimeEnabled: true,
        crossSessionEnabled: true,
        sessionIds: SESSION_IDS,
        now: 10_000,
      },
      options,
    );
    expect(lost.status).toBe("finalized");
    await closeOpenClawStateDatabaseAsync();

    // The restarted announce retries the same completion and gets the same facts.
    const retried = await finalize(options);
    expect(retried).toEqual(lost);
    expect(
      rows(
        options,
        "SELECT recipient_session_key, outcome FROM delegate_artifact_recipient_outcomes ORDER BY recipient_session_key",
      ),
    ).toEqual([
      { recipient_session_key: "agent:main:parent", outcome: "available" },
      { recipient_session_key: "agent:main:target", outcome: "available" },
    ]);
    expect(rows(options, "SELECT count(*) AS count FROM delegate_artifact_bindings")).toEqual([
      { count: 2 },
    ]);
  });

  it("asks for session incarnations before deciding and commits nothing until it has them", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);
    const input = {
      producerSessionKey: "agent:main:subagent:continuation-child",
      producerSessionId: "child-session-1",
      producerRunId: "continuation-delegate-run-1",
      completionId: "completion-1",
      finalizationKey: "finalization-1",
      completionStatus: "ok" as const,
      completedAt: 9_000,
      silent: true,
      runtimeEnabled: true,
      crossSessionEnabled: true,
      now: 10_000,
    };
    expect(
      await runDelegateArtifactOperation(
        "delegateArtifacts.finalize",
        { ...input, sessionIds: { "agent:main:parent": "parent-session-1" } },
        options,
      ),
    ).toEqual({
      status: "needs-session-ids",
      sessionKeys: ["agent:main:parent", "agent:main:target"],
    });
    expect(rows(options, "SELECT status FROM delegate_artifact_policies")).toEqual([
      { status: "active" },
    ]);
    expect(
      rows(options, "SELECT count(*) AS count FROM delegate_artifact_recipient_outcomes"),
    ).toEqual([{ count: 0 }]);
  });

  it("never leaves a recipient deliverable when its session rotates inside the read window", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);
    let targetSessionId = "target-session-1";
    const finalized = await finalize(options, {
      resolveSessionId: (sessionKey) => {
        const resolved =
          sessionKey === "agent:main:target"
            ? targetSessionId
            : SESSION_IDS[sessionKey as keyof typeof SESSION_IDS];
        // The target session rotates right after the host resolved it for the decision.
        if (sessionKey === "agent:main:target") {
          targetSessionId = "target-session-2";
        }
        return resolved;
      },
    });

    expect(finalized.status).toBe("finalized");
    if (finalized.status !== "finalized") {
      throw new Error("expected a finalized policy");
    }
    expect([...finalized.projections.keys()]).toEqual(["agent:main:parent"]);
    expect(
      rows(
        options,
        "SELECT recipient_session_key, outcome, delivery_terminal_reason FROM delegate_artifact_recipient_outcomes ORDER BY recipient_session_key",
      ),
    ).toEqual([
      {
        recipient_session_key: "agent:main:parent",
        outcome: "available",
        delivery_terminal_reason: null,
      },
      {
        recipient_session_key: "agent:main:target",
        outcome: "available",
        delivery_terminal_reason: "recipient-incarnation-changed",
      },
    ]);
    // A replay of the stale binding cannot be prepared for delivery.
    const staleView = (sessionKey: string) => SESSION_IDS[sessionKey as keyof typeof SESSION_IDS];
    const replay = await finalize(options, { resolveSessionId: staleView });
    if (replay.status !== "finalized") {
      throw new Error("expected the recorded completion to replay");
    }
    const staleProjection = replay.projections.get("agent:main:target");
    expect(staleProjection).toBeDefined();
    expect(
      await prepareDelegateArtifactDelivery({
        projection: staleProjection!,
        runtimeEnabled: true,
        crossSessionEnabled: true,
        currentRecipientSessionId: "target-session-1",
        now: 10_100,
        options,
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("joins an overlapping purge instead of queueing a second one", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    const first = purgeExpiredDelegateArtifacts(10_000, options);
    const second = purgeExpiredDelegateArtifacts(10_000, options);
    expect(second).toBe(first);
    expect(await first).toBe(0);
    const later = purgeExpiredDelegateArtifacts(10_000, options);
    expect(later).not.toBe(first);
    expect(await later).toBe(0);
  });
});
