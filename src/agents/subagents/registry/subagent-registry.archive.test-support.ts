// Fixture task rows returned by the archive e2e finalizeTaskRunByRunId mock.
import type { DetachedTaskLifecycleRuntime } from "../../../tasks/detached-task-runtime-contract.js";

type FinalizeTaskRunByRunId = NonNullable<DetachedTaskLifecycleRuntime["finalizeTaskRunByRunId"]>;

export const finalizeArchiveFixtureTaskRun: FinalizeTaskRunByRunId = (params) => [
  {
    taskId: params.taskId ?? `task-${params.runId}`,
    runtime: params.runtime ?? "subagent",
    runId: params.runId,
    childSessionKey: params.sessionKey,
    requesterSessionKey: "agent:main:main",
    ownerKey: "agent:main:main",
    scopeKind: "session",
    task: "Finalized archive fixture task",
    status: params.status,
    deliveryStatus: "not_applicable",
    notifyPolicy: "silent",
    createdAt: 0,
    endedAt: params.endedAt,
    error: params.error,
  },
];
