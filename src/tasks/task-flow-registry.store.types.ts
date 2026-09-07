// Defines storage contracts for managed task-flow records.
import type { TaskFlowRecord } from "./task-flow-registry.types.js";

/** Full task-flow registry snapshot used for persistence restore and replacement writes. */
export type TaskFlowRegistryStoreSnapshot = {
  flows: Map<string, TaskFlowRecord>;
};

export type TaskFlowRegistryAtomicChange = {
  flow: TaskFlowRecord;
  expectedRevision?: number;
};

export type TaskFlowRegistryAtomicOwnerCondition = {
  ownerKey: string;
  controllerId: string;
  status: TaskFlowRecord["status"];
  expectedFlowIds: readonly string[];
  excludeCancelRequested?: boolean;
};

export type TaskFlowRegistryAtomicWrite = {
  changes: readonly TaskFlowRegistryAtomicChange[];
  ownerCondition?: TaskFlowRegistryAtomicOwnerCondition;
};
