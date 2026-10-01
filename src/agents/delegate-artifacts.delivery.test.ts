import { afterEach, expect, it, vi, describe } from "vitest";
import {
  closeOpenClawStateDatabaseAsync,
  openOpenClawStateDatabase,
} from "../state/openclaw-state-db.js";
import {
  DELEGATE_ARTIFACT_RETENTION_MS,
  createDelegateArtifactPolicy,
  hasRecordedDelegateArtifactCompletionForProducer,
  inspectDelegateArtifactForRecipient,
  listDelegateArtifactsForRecipient,
  prepareDelegateArtifactDelivery,
  purgeExpiredDelegateArtifacts,
} from "./delegate-artifacts.js";
import {
  finalize,
  policy,
  publish,
  recordDelivery,
  stateOptions,
} from "./delegate-artifacts.test-helpers.js";

afterEach(async () => {
  vi.restoreAllMocks();
  await closeOpenClawStateDatabaseAsync();
});

describe("managed delegate artifact claims", () => {
  it("preserves expired claimless policy and terminal provenance records", async () => {
    const options = stateOptions();
    const statuses = ["active", "staged", "completed", "failed"] as const;
    for (const [index, status] of statuses.entries()) {
      await createDelegateArtifactPolicy(
        policy({
          flowId: `flow-${status}`,
          producerRunId: `run-${status}`,
          dispatchRevision: index,
        }),
        options,
      );
      if (status !== "active") {
        openOpenClawStateDatabase(options)
          .db.prepare(
            "UPDATE delegate_artifact_policies SET status = ?, completion_id = ?, completion_finalization_key = ?, completed_at = ?, completion_status = ?, completion_disposition = ? WHERE flow_id = ?",
          )
          .run(
            status,
            `completion-${status}`,
            `finalization-${status}`,
            9_000,
            "ok",
            status === "staged" ? null : `terminal-${status}`,
            `flow-${status}`,
          );
      }
    }
    openOpenClawStateDatabase(options)
      .db.prepare(
        "INSERT INTO delegate_artifact_recipient_outcomes (flow_id, recipient_session_key, recipient_session_id, recipient_relation, purpose, outcome, unavailable_reason, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "flow-failed",
        "agent:main:target",
        "target-session-1",
        "inter_session",
        null,
        "unavailable",
        "policy-failed",
        9_000,
      );

    expect(
      await purgeExpiredDelegateArtifacts(31_100 + DELEGATE_ARTIFACT_RETENTION_MS, options),
    ).toBe(0);
    expect(
      await purgeExpiredDelegateArtifacts(31_100 + DELEGATE_ARTIFACT_RETENTION_MS, options),
    ).toBe(0);
    expect(
      openOpenClawStateDatabase(options)
        .db.prepare("SELECT flow_id, status FROM delegate_artifact_policies ORDER BY flow_id")
        .all(),
    ).toEqual([
      { flow_id: "flow-active", status: "active" },
      { flow_id: "flow-completed", status: "completed" },
      { flow_id: "flow-failed", status: "failed" },
      { flow_id: "flow-staged", status: "staged" },
    ]);
    expect(
      openOpenClawStateDatabase(options)
        .db.prepare(
          "SELECT outcome, unavailable_reason FROM delegate_artifact_recipient_outcomes WHERE flow_id = ?",
        )
        .get("flow-failed"),
    ).toEqual({ outcome: "unavailable", unavailable_reason: "policy-failed" });
  });

  it("terminalizes a finalized binding when its recipient incarnation changes before delivery", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);
    const finalized = await finalize(options);
    if (finalized.status !== "finalized") {
      throw new Error("expected finalized claims");
    }
    const projection = finalized.projections.get("agent:main:parent")!;
    expect(
      await prepareDelegateArtifactDelivery({
        projection,
        runtimeEnabled: true,
        crossSessionEnabled: true,
        currentRecipientSessionId: "replacement-session",
        now: 10_100,
        options,
      }),
    ).toEqual({ status: "unavailable" });
    expect(
      openOpenClawStateDatabase(options)
        .db.prepare(
          "SELECT status, unavailable_reason, arrived_at FROM delegate_artifact_bindings WHERE recipient_session_key = ?",
        )
        .get("agent:main:parent"),
    ).toEqual({
      status: "unavailable",
      unavailable_reason: "recipient-incarnation-changed",
      arrived_at: null,
    });
    expect(
      await inspectDelegateArtifactForRecipient({
        claimId: projection.artifacts[0]!.id,
        recipientSessionKey: "agent:main:parent",
        recipientSessionId: "parent-session-1",
        runtimeEnabled: true,
        crossSessionEnabled: true,
        now: 10_200,
        options,
      }),
    ).toEqual({ outcome: "unauthorized" });
  });

  it("terminalizes a finalized binding that expires before its initial delivery", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);
    const finalized = await finalize(options);
    if (finalized.status !== "finalized") {
      throw new Error("expected finalized claims");
    }
    const projection = finalized.projections.get("agent:main:parent")!;

    expect(
      await prepareDelegateArtifactDelivery({
        projection,
        runtimeEnabled: true,
        crossSessionEnabled: true,
        currentRecipientSessionId: "parent-session-1",
        now: 31_100 + DELEGATE_ARTIFACT_RETENTION_MS,
        options,
      }),
    ).toEqual({ status: "unavailable" });
    expect(
      openOpenClawStateDatabase(options)
        .db.prepare(
          "SELECT outcome, delivery_terminal_reason FROM delegate_artifact_recipient_outcomes WHERE flow_id = ? AND recipient_session_key = ?",
        )
        .get("flow-1", "agent:main:parent"),
    ).toEqual({
      outcome: "available",
      delivery_terminal_reason: "delivery-state-unavailable",
    });
  });

  it("persists the first policy creation as dispatch acceptance across crash replay", async () => {
    const options = stateOptions();
    const { dispatchAcceptedAt: _ignored, ...replayedPolicy } = policy();
    const now = vi.spyOn(Date, "now").mockReturnValue(5_000);
    await createDelegateArtifactPolicy({ ...replayedPolicy, scheduledAt: 1_000 }, options);
    now.mockReturnValue(9_000);
    await createDelegateArtifactPolicy({ ...replayedPolicy, scheduledAt: 1_000 }, options);

    expect(
      openOpenClawStateDatabase(options)
        .db.prepare(
          "SELECT dispatch_accepted_at, scheduled_at, retention_deadline FROM delegate_artifact_policies",
        )
        .get(),
    ).toEqual({
      dispatch_accepted_at: 5_000,
      scheduled_at: 1_000,
      retention_deadline: 31_100 + DELEGATE_ARTIFACT_RETENTION_MS,
    });
  });

  it("does not let an unrelated malformed policy break an acknowledged recipient list", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);
    const finalized = await finalize(options);
    if (finalized.status !== "finalized") {
      throw new Error("expected finalized claims");
    }
    const projection = finalized.projections.get("agent:main:parent")!;
    await recordDelivery({
      projection,
      phase: "attempt",
      now: 10_100,
      options,
    });
    await recordDelivery({
      projection,
      phase: "acknowledged",
      now: 10_200,
      options,
    });
    await createDelegateArtifactPolicy(
      {
        ...policy(),
        flowId: "unrelated-flow",
        producerRunId: "unrelated-run",
      },
      options,
    );
    openOpenClawStateDatabase(options)
      .db.prepare(
        "UPDATE delegate_artifact_policies SET recipients_json = ? WHERE flow_id = 'unrelated-flow'",
      )
      .run('{"recipient":"file:///private"}');

    expect(
      await listDelegateArtifactsForRecipient({
        recipientSessionKey: "agent:main:parent",
        recipientSessionId: "parent-session-1",
        runtimeEnabled: true,
        crossSessionEnabled: true,
        now: 10_300,
        options,
      }),
    ).toMatchObject({ outcome: "available", artifacts: [{ id: projection.artifacts[0]!.id }] });
  });

  it("reports a recorded completion for the producer across every post-completion policy state", async () => {
    const producerSessionKey = "agent:main:subagent:continuation-child";
    const recorded = async (options: ReturnType<typeof stateOptions>) =>
      await hasRecordedDelegateArtifactCompletionForProducer(
        { flowId: "flow-1", producerSessionKey },
        options,
      );

    // Accepted but not yet completed: the child may still need driving.
    const activeOptions = stateOptions();
    await createDelegateArtifactPolicy(policy(), activeOptions);
    await publish(activeOptions);
    expect(await recorded(activeOptions)).toBe(false);

    // Runtime disabled between child completion and finalization leaves the
    // policy `staged`. The child still ran, so a re-drive must not respawn it
    // or report a spawn failure.
    const stagedOptions = stateOptions();
    await createDelegateArtifactPolicy(policy(), stagedOptions);
    await publish(stagedOptions);
    expect(await finalize(stagedOptions, { runtimeEnabled: false })).toEqual({
      status: "deferred",
    });
    expect(await recorded(stagedOptions)).toBe(true);

    // Ordinary finalization.
    const completedOptions = stateOptions();
    await createDelegateArtifactPolicy(policy(), completedOptions);
    await publish(completedOptions);
    await finalize(completedOptions);
    expect(await recorded(completedOptions)).toBe(true);

    // A completion recorded for a different producer is not evidence for this one.
    expect(
      await hasRecordedDelegateArtifactCompletionForProducer(
        { flowId: "flow-1", producerSessionKey: "agent:main:subagent:someone-else" },
        completedOptions,
      ),
    ).toBe(false);
    // An unknown flow has no evidence at all.
    expect(
      await hasRecordedDelegateArtifactCompletionForProducer(
        { flowId: "flow-absent", producerSessionKey },
        completedOptions,
      ),
    ).toBe(false);
  });

  it("stages while disabled and resumes the same completion without exposing claims", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);

    expect(await finalize(options, { runtimeEnabled: false })).toEqual({ status: "deferred" });
    expect(
      await listDelegateArtifactsForRecipient({
        recipientSessionKey: "agent:main:parent",
        recipientSessionId: "parent-session-1",
        runtimeEnabled: true,
        crossSessionEnabled: true,
        options,
      }),
    ).toEqual({ outcome: "unauthorized" });

    const resumed = await finalize(options, { now: 11_000 });
    expect(resumed.status).toBe("finalized");
    if (resumed.status !== "finalized") {
      throw new Error("expected resumed finalization");
    }
    expect(resumed.projections.get("agent:main:parent")?.artifacts).toHaveLength(1);

    await closeOpenClawStateDatabaseAsync();
    const mismatchOptions = stateOptions();
    await createDelegateArtifactPolicy(policy(), mismatchOptions);
    await publish(mismatchOptions);
    expect(await finalize(mismatchOptions, { runtimeEnabled: false })).toEqual({
      status: "deferred",
    });
    expect(
      await finalize(mismatchOptions, {
        runtimeEnabled: false,
        completionId: "replacement-completion",
        finalizationKey: "replacement-finalization",
      }),
    ).toEqual({ status: "deferred" });
    expect(
      await finalize(mismatchOptions, {
        completionId: "replacement-completion",
        finalizationKey: "replacement-finalization",
      }),
    ).toEqual({
      status: "failed",
      disposition: "global-failed(completion-integrity)",
    });
    expect(
      openOpenClawStateDatabase(mismatchOptions)
        .db.prepare(
          "SELECT completion_id, completion_finalization_key, completion_disposition FROM delegate_artifact_policies",
        )
        .get(),
    ).toEqual({
      completion_id: "completion-1",
      completion_finalization_key: "finalization-1",
      completion_disposition: "global-failed(completion-integrity)",
    });
  });

  it("applies the cross-session gate to explicit and host-wide routes, not tree ancestry", async () => {
    const treeOptions = stateOptions();
    await createDelegateArtifactPolicy(
      policy({ route: { kind: "fanout", fanoutMode: "tree" } }),
      treeOptions,
    );
    await publish(treeOptions);
    expect((await finalize(treeOptions, { crossSessionEnabled: false })).status).toBe("finalized");

    await closeOpenClawStateDatabaseAsync();
    const allOptions = stateOptions();
    await createDelegateArtifactPolicy(
      policy({ route: { kind: "fanout", fanoutMode: "all" } }),
      allOptions,
    );
    await publish(allOptions);
    expect(await finalize(allOptions, { crossSessionEnabled: false })).toEqual({
      status: "deferred",
    });
  });

  it("isolates mixed recipient incarnation failures and preserves unavailable tombstones", async () => {
    const options = stateOptions();
    await createDelegateArtifactPolicy(policy(), options);
    await publish(options);
    const finalized = await finalize(options, {
      resolveSessionId: (sessionKey) =>
        sessionKey === "agent:main:parent" ? "parent-session-1" : "target-session-rebound",
    });
    expect(finalized.status).toBe("finalized");
    if (finalized.status !== "finalized") {
      throw new Error("expected mixed-recipient finalization");
    }
    expect([...finalized.projections.keys()]).toEqual(["agent:main:parent"]);

    const row = openOpenClawStateDatabase(options)
      .db.prepare(
        "SELECT outcome, unavailable_reason FROM delegate_artifact_recipient_outcomes WHERE recipient_session_key = ?",
      )
      .get("agent:main:target");
    expect(row).toEqual({
      outcome: "unavailable",
      unavailable_reason: "recipient-incarnation-changed",
    });
    expect(
      await listDelegateArtifactsForRecipient({
        recipientSessionKey: "agent:main:target",
        recipientSessionId: "target-session-1",
        runtimeEnabled: true,
        crossSessionEnabled: true,
        now: 10_000,
        options,
      }),
    ).toEqual({ outcome: "unauthorized" });
    expect(
      await purgeExpiredDelegateArtifacts(31_100 + DELEGATE_ARTIFACT_RETENTION_MS, options),
    ).toBe(1);
    expect(
      await purgeExpiredDelegateArtifacts(31_100 + DELEGATE_ARTIFACT_RETENTION_MS, options),
    ).toBe(0);
    expect(
      openOpenClawStateDatabase(options)
        .db.prepare(
          "SELECT outcome, unavailable_reason FROM delegate_artifact_recipient_outcomes WHERE recipient_session_key = ?",
        )
        .get("agent:main:target"),
    ).toEqual(row);
  });

  it("records one mode-specific terminal outcome when no claim or recipient is eligible", async () => {
    const optionalOptions = stateOptions();
    await createDelegateArtifactPolicy(
      policy({
        recipients: [
          {
            sessionKey: "agent:main:target",
            sessionId: "target-session-1",
            relation: "inter_session",
            purpose: "Use the artifact in the target session.",
          },
        ],
        route: { kind: "target", targetSessionKey: "agent:main:target" },
        recipientContext: "Use the artifact in the target session.",
      }),
      optionalOptions,
    );
    const optional = await finalize(optionalOptions);
    expect(optional).toMatchObject({
      status: "finalized",
      disposition: "optional-no-artifacts",
    });
    if (optional.status !== "finalized") {
      throw new Error("expected optional artifact-free completion");
    }
    expect(optional.projections.get("agent:main:target")?.arrivalContext.availability).toBe(
      "unavailable",
    );
    const optionalProjection = optional.projections.get("agent:main:target")!;
    const optionalDelivery = await prepareDelegateArtifactDelivery({
      projection: optionalProjection,
      runtimeEnabled: true,
      crossSessionEnabled: true,
      currentRecipientSessionId: "target-session-1",
      now: 10_100,
      options: optionalOptions,
    });
    expect(optionalDelivery.status).toBe("ready");
    if (optionalDelivery.status !== "ready") {
      throw new Error("expected optional artifact-free delivery");
    }
    await recordDelivery({
      projection: optionalDelivery.projection,
      phase: "attempt",
      now: 10_100,
      options: optionalOptions,
    });
    await recordDelivery({
      projection: optionalDelivery.projection,
      phase: "replay",
      now: 10_150,
      options: optionalOptions,
    });
    const optionalReplay = await prepareDelegateArtifactDelivery({
      projection: optionalProjection,
      runtimeEnabled: true,
      crossSessionEnabled: true,
      currentRecipientSessionId: "target-session-1",
      now: 10_175,
      options: optionalOptions,
    });
    expect(optionalReplay).toMatchObject({
      status: "ready",
      projection: {
        arrivalContext: {
          deliveredAt: 10_100,
          replayedAt: 10_150,
        },
      },
    });
    if (optionalReplay.status !== "ready") {
      throw new Error("expected optional artifact-free replay");
    }
    await recordDelivery({
      projection: optionalReplay.projection,
      phase: "acknowledged",
      now: 10_200,
      options: optionalOptions,
    });
    expect(
      await prepareDelegateArtifactDelivery({
        projection: optionalProjection,
        runtimeEnabled: true,
        crossSessionEnabled: true,
        currentRecipientSessionId: "target-session-1",
        now: 20_000,
        options: optionalOptions,
      }),
    ).toEqual({ status: "acknowledged" });

    await closeOpenClawStateDatabaseAsync();
    const failedOptionalOptions = stateOptions();
    await createDelegateArtifactPolicy(policy(), failedOptionalOptions);
    await publish(failedOptionalOptions);
    const failedOptional = await finalize(failedOptionalOptions, { completionStatus: "error" });
    expect(failedOptional).toMatchObject({
      status: "finalized",
      disposition: "optional-no-artifacts",
    });
    if (failedOptional.status !== "finalized") {
      throw new Error("expected failed optional artifact-free completion");
    }
    expect(failedOptional.projections.get("agent:main:parent")).toMatchObject({
      artifacts: [],
      arrivalContext: { availability: "unavailable" },
    });

    await closeOpenClawStateDatabaseAsync();
    const requiredOptions = stateOptions();
    await createDelegateArtifactPolicy(
      policy({
        artifactMode: "required",
        recipients: [
          {
            sessionKey: "agent:main:target",
            sessionId: "target-session-1",
            relation: "inter_session",
            purpose: "Use the artifact in the target session.",
          },
        ],
        route: { kind: "target", targetSessionKey: "agent:main:target" },
        recipientContext: "Use the artifact in the target session.",
      }),
      requiredOptions,
    );
    const required = await finalize(requiredOptions);
    expect(required).toMatchObject({
      status: "failed",
      disposition: "required-failed",
    });
    if (required.status !== "failed") {
      throw new Error("expected required artifact failure");
    }
    expect(required.projections?.get("agent:main:target")).toMatchObject({
      artifacts: [],
      arrivalContext: { availability: "unavailable" },
    });
    const requiredProjection = required.projections?.get("agent:main:target");
    if (!requiredProjection) {
      throw new Error("expected required failure projection");
    }
    expect(
      await prepareDelegateArtifactDelivery({
        projection: requiredProjection,
        runtimeEnabled: true,
        crossSessionEnabled: true,
        currentRecipientSessionId: "target-session-1",
        now: 10_100,
        options: requiredOptions,
      }),
    ).toMatchObject({
      status: "ready",
      projection: { arrivalContext: { availability: "unavailable" } },
    });

    await closeOpenClawStateDatabaseAsync();
    const optionalZeroOptions = stateOptions();
    await createDelegateArtifactPolicy(
      policy({
        recipients: [
          {
            sessionKey: "agent:main:target",
            sessionId: "target-session-1",
            relation: "inter_session",
            purpose: "Use the artifact in the target session.",
          },
        ],
        route: { kind: "target", targetSessionKey: "agent:main:target" },
        recipientContext: "Use the artifact in the target session.",
      }),
      optionalZeroOptions,
    );
    await publish(optionalZeroOptions);
    const optionalZero = await finalize(optionalZeroOptions, {
      resolveSessionId: (sessionKey) =>
        sessionKey === "agent:main:parent" ? "parent-session-1" : "replacement-session",
    });
    expect(optionalZero).toMatchObject({
      status: "finalized",
      disposition: "optional-zero-eligible",
    });
    if (optionalZero.status !== "finalized") {
      throw new Error("expected optional zero-eligible completion");
    }
    expect(optionalZero.projections.size).toBe(0);
    expect(
      openOpenClawStateDatabase(optionalZeroOptions)
        .db.prepare("SELECT outcome, unavailable_reason FROM delegate_artifact_recipient_outcomes")
        .get(),
    ).toEqual({
      outcome: "unavailable",
      unavailable_reason: "recipient-incarnation-changed",
    });

    await closeOpenClawStateDatabaseAsync();
    const requiredZeroOptions = stateOptions();
    await createDelegateArtifactPolicy(
      policy({
        artifactMode: "required",
        recipients: [
          {
            sessionKey: "agent:main:target",
            sessionId: "target-session-1",
            relation: "inter_session",
            purpose: "Use the artifact in the target session.",
          },
        ],
        route: { kind: "target", targetSessionKey: "agent:main:target" },
        recipientContext: "Use the artifact in the target session.",
      }),
      requiredZeroOptions,
    );
    await publish(requiredZeroOptions);
    const requiredZero = await finalize(requiredZeroOptions, {
      resolveSessionId: (sessionKey) =>
        sessionKey === "agent:main:parent" ? "parent-session-1" : "replacement-session",
    });
    expect(requiredZero).toMatchObject({
      status: "failed",
      disposition: "required-failed",
    });
    expect(
      openOpenClawStateDatabase(requiredZeroOptions)
        .db.prepare("SELECT count(*) AS count FROM delegate_artifact_bindings")
        .get(),
    ).toEqual({ count: 0 });
  });
});
