// Persists task-flow records through the global shared-state database owner.
import type { DatabaseSync } from "node:sqlite";
import type { AdmittedRunContext } from "../agents/admitted-run-context.js";
import {
  executionOwnerBindingFromAdmission,
  type ExecutionOwnerBindingResult,
} from "../audit/execution-owner-binding.js";
import {
  executeSqliteQuerySync,
  getNodeSqliteKysely,
} from "../infra/kysely-sync.js";
import { normalizeSqliteNumber } from "../infra/sqlite-number.js";
import { stageSqliteTransactionState } from "../infra/sqlite-post-commit.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { withExistingOpenClawStateDatabaseReadOnly } from "../state/openclaw-state-db-readonly.js";
import type { DB as OpenClawStateKyselyDatabase } from "../state/openclaw-state-db.generated.js";
import {
  closeOpenClawStateDatabase,
  openOpenClawStateDatabase,
  runOpenClawStateWriteTransaction,
  type OpenClawStateDatabase,
  type OpenClawStateDatabaseOptions,
} from "../state/openclaw-state-db.js";
import { captureOpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.js";
import type { OpenClawStateWorkerContext } from "../state/openclaw-state-worker-context.types.js";
import type { TaskFlowSyncInput } from "./task-flow-registry.records.js";
import {
  bindTaskFlowRecord,
  deleteTaskFlowRowInDatabase,
  readTaskFlowRecord,
  readTaskFlowRegistrySnapshot,
  syncTaskMirroredFlowRecordInDatabase,
  updateTaskFlowRecordInDatabase,
  upsertTaskFlowRowInDatabase,
} from "./task-flow-registry.store.kernel.js";
import type {
  TaskFlowRegistryAtomicWrite,
  TaskFlowRegistryMirroredSync,
  TaskFlowRegistryObservedUpdate,
  TaskFlowRegistryStoreSnapshot,
  TaskFlowRegistryUpdate,
  TaskFlowRegistryUpdatePublication,
  TaskFlowRegistryUpdateResult,
} from "./task-flow-registry.store.types.js";
import { parseTaskFlowStatus, type TaskFlowRecord } from "./task-flow-registry.types.js";

type FlowRegistryStoreDatabase = Pick<OpenClawStateKyselyDatabase, "flow_runs">;

const log = createSubsystemLogger("tasks/task-flow-registry");

function getFlowRegistryKysely(db: DatabaseSync) {
  return getNodeSqliteKysely<FlowRegistryStoreDatabase>(db);
}

function withWriteTransaction(write: (database: OpenClawStateDatabase) => void) {
  const database = openOpenClawStateDatabase();
  runOpenClawStateWriteTransaction(() => {
    write(database);
  });
}

export function loadTaskFlowRegistryStateFromSqlite(
  flowIds?: readonly string[],
): TaskFlowRegistryStoreSnapshot {
  return readTaskFlowRegistrySnapshot(openOpenClawStateDatabase().db, flowIds);
}

/** Loads task flows without creating or migrating shared state. */
export function loadTaskFlowRegistryStateFromSqliteReadOnly(): TaskFlowRegistryStoreSnapshot {
  return (
    withExistingOpenClawStateDatabaseReadOnly(({ db }) => readTaskFlowRegistrySnapshot(db)) ?? {
      flows: new Map(),
    }
  );
}

export function upsertTaskFlowRegistryRecordToSqlite(flow: TaskFlowRecord) {
  withWriteTransaction(({ db }) => {
    upsertTaskFlowRowInDatabase(db, bindTaskFlowRecord(flow));
  });
}

export function syncTaskMirroredFlowInSqlite(
  task: TaskFlowSyncInput,
  preparePublication: (result: TaskFlowRegistryMirroredSync) => TaskFlowRegistryUpdatePublication,
): TaskFlowRegistryMirroredSync {
  let committed: TaskFlowRegistryMirroredSync | undefined;
  try {
    return runOpenClawStateWriteTransaction(({ db }) => {
      const result = syncTaskMirroredFlowRecordInDatabase(db, task);
      const publication = preparePublication(result);
      stageSqliteTransactionState(db, {
        stage: publication.stage,
        rollback: publication.rollback,
        commit: () => {
          committed = result;
          publication.commit();
        },
      });
      return result;
    });
  } catch (error) {
    if (!committed) {
      throw error;
    }
    log.warn("Task-mirrored flow committed before cleanup failed", {
      taskId: task.taskId,
      flowId: task.parentFlowId,
      error,
    });
    return committed;
  }
}

export function updateTaskFlowRegistryRecordInSqlite(
  params: TaskFlowRegistryUpdate,
  preparePublication: (update: TaskFlowRegistryObservedUpdate) => TaskFlowRegistryUpdatePublication,
): TaskFlowRegistryUpdateResult {
  return runOpenClawStateWriteTransaction(({ db }) => {
    const result = updateTaskFlowRecordInDatabase(db, params);
    if (result.applied || result.reason !== "invalid_patch") {
      const publication = preparePublication(result);
      stageSqliteTransactionState(db, {
        stage: publication.stage,
        rollback: publication.rollback,
        commit: publication.commit,
      });
    }
    return result;
  });
}

export function upsertTaskFlowRegistryRecordsToSqlite(write: TaskFlowRegistryAtomicWrite): boolean {
  const { changes } = write;
  if (changes.length === 0) {
    return true;
  }
  let applied = false;
  withWriteTransaction(({ db }) => {
    if (write.ownerCondition) {
      let query = getFlowRegistryKysely(db)
        .selectFrom("flow_runs")
        .select(["flow_id", "revision", "status"])
        .where("owner_key", "=", write.ownerCondition.ownerKey)
        .where("controller_id", "=", write.ownerCondition.controllerId)
        .where("status", "in", write.ownerCondition.statuses);
      if (write.ownerCondition.excludeCancelRequested) {
        query = query.where("cancel_requested_at", "is", null);
      }
      const currentFlows = executeSqliteQuerySync(db, query)
        .rows.map((row) => ({
          flowId: row.flow_id,
          revision: normalizeSqliteNumber(row.revision) ?? 0,
          status: parseTaskFlowStatus(row.status),
        }))
        .toSorted((left, right) => left.flowId.localeCompare(right.flowId));
      const expectedFlows = [...write.ownerCondition.expectedFlows].toSorted((left, right) =>
        left.flowId.localeCompare(right.flowId),
      );
      if (
        currentFlows.length !== expectedFlows.length ||
        currentFlows.some((flow, index) => {
          const expected = expectedFlows[index];
          return (
            !expected ||
            flow.flowId !== expected.flowId ||
            flow.revision !== expected.revision ||
            flow.status !== expected.status
          );
        })
      ) {
        return;
      }
    }
    for (const change of changes) {
      const current = readTaskFlowRecord(db, change.flow.flowId);
      if (
        change.expectedRevision === undefined
          ? current !== undefined
          : current?.revision !== change.expectedRevision
      ) {
        return;
      }
    }
    for (const change of changes) {
      upsertTaskFlowRowInDatabase(db, bindTaskFlowRecord(change.flow));
    }
    applied = true;
  });
  return applied;
}

/** Binds only the exact flow selected before admission; lifecycle settlement stays owner-native. */
export async function bindTaskFlowExecution(params: {
  admitted: AdmittedRunContext;
  flowId: string;
  options?: Pick<OpenClawStateDatabaseOptions, "path" | "env">;
  context?: OpenClawStateWorkerContext;
  assertCurrent?: () => void;
}): Promise<ExecutionOwnerBindingResult> {
  const binding = executionOwnerBindingFromAdmission(params.admitted);
  if (!binding) {
    return "disabled";
  }
  const context = params.context ?? captureOpenClawStateWorkerContext(params.options);
  const input = { flowId: params.flowId, binding };
  const assertOwnerCurrent = params.assertCurrent;
  const assertCurrent = () => {
    context.admission.assertCurrent();
    assertOwnerCurrent?.();
  };
  const [{ runOpenClawStateWorkerOperation }, { createSqliteWorkerWriteAdmission }] =
    await Promise.all([
      import("../state/openclaw-state-worker-store.js"),
      import("../infra/sqlite-worker-store.js"),
    ]);
  return runOpenClawStateWorkerOperation(
    context,
    (scope) => scope.execute({ type: "flows.bindExecution", input }),
    {
      assertCurrent,
      createAdmission: createSqliteWorkerWriteAdmission(assertCurrent, [
        context.admission.databasePath,
      ]),
    },
  );
}

export function deleteTaskFlowRegistryRecordFromSqlite(flowId: string) {
  withWriteTransaction(({ db }) => {
    deleteTaskFlowRowInDatabase(db, flowId);
  });
}

export function closeTaskFlowRegistryDatabase() {
  closeOpenClawStateDatabase();
}
