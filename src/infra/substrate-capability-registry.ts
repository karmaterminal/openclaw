export const SUBSTRATE_CAPABILITIES = [
  "ack-gc",
  "audit-trail",
  "cancellation",
  "chain-budget-at-spawn",
  "compaction-return",
  "cross-session-addressable-enrichment",
  "exp-backoff-retry",
  "failed-record-quarantine",
  "fan-out",
  "lifecycle-tracking",
  "managed-workflow",
  "owner-scoped-query",
  "restart-survival",
  "session-scoped-delegate-queue",
  "sha256-idempotency",
] as const;

export type SubstrateCapability = (typeof SUBSTRATE_CAPABILITIES)[number];

export type SubstrateTransportClass =
  | "continuation-delegate-store"
  | "filesystem-queue"
  | "sqlite-managed-workflow";

export type SubstrateCapabilityEntry = {
  readonly name: string;
  readonly "transport-class": SubstrateTransportClass;
  readonly capabilities: readonly SubstrateCapability[];
  readonly "runtime-symbol": string;
  readonly "descriptor-symbol": string;
  readonly "cite-pin": string;
  readonly "symbol-aliases"?: readonly string[];
};

const substrateCapabilityRegistry: readonly SubstrateCapabilityEntry[] = [
  {
    name: "session-delivery-queue",
    "transport-class": "filesystem-queue",
    capabilities: [
      "ack-gc",
      "chain-budget-at-spawn",
      "cross-session-addressable-enrichment",
      "exp-backoff-retry",
      "failed-record-quarantine",
      "restart-survival",
      "sha256-idempotency",
    ],
    "runtime-symbol": "enqueueSessionDelivery",
    "descriptor-symbol": "QueuedSessionDeliveryPayloadMetadata",
    "cite-pin":
      "karmaterminal/openclaw@c96e2d7955ab36ff281fedb68437b6c638eb1e0d src/infra/session-delivery-queue-storage.ts:34,154; src/infra/session-delivery-queue-recovery.ts:64; #332 issuecomment-4322708542",
    "symbol-aliases": [
      "ackSessionDelivery",
      "buildPostCompactionDelegateDeliveryPayload",
      "computeSessionDeliveryBackoffMs",
      "drainPendingSessionDeliveries",
      "deliverQueuedPostCompactionDelegate",
      "enqueuePostCompactionDelegateDelivery",
      "QueuedSessionDeliveryPayload",
      "recoverPendingSessionDeliveries",
    ],
  },
  {
    name: "TaskFlow",
    "transport-class": "sqlite-managed-workflow",
    capabilities: [
      "audit-trail",
      "cancellation",
      "lifecycle-tracking",
      "managed-workflow",
      "owner-scoped-query",
      "restart-survival",
    ],
    "runtime-symbol": "createManagedTaskFlow",
    "descriptor-symbol": "TaskFlowRecord",
    "cite-pin":
      "karmaterminal/openclaw@c96e2d7955ab36ff281fedb68437b6c638eb1e0d src/tasks/task-flow-registry.types.ts:24; src/tasks/task-flow-runtime-internal.ts:1",
    "symbol-aliases": [
      "BoundTaskFlowRuntime",
      "ManagedTaskFlowRecord",
      "PluginRuntimeTaskFlow",
      "TaskFlowStatus",
    ],
  },
  {
    name: "continuation-delegate-store",
    "transport-class": "continuation-delegate-store",
    capabilities: [
      "compaction-return",
      "fan-out",
      "lifecycle-tracking",
      "restart-survival",
      "session-scoped-delegate-queue",
    ],
    "runtime-symbol": "taskFlowEnqueuePendingDelegate",
    "descriptor-symbol": "PendingContinuationDelegate",
    "cite-pin":
      "karmaterminal/openclaw@c96e2d7955ab36ff281fedb68437b6c638eb1e0d src/auto-reply/continuation-delegate-store-taskflow.ts:67; src/auto-reply/continuation-delegate-store.ts:63",
    "symbol-aliases": [
      "consumePendingDelegates",
      "enqueuePendingDelegate",
      "setTaskFlowDelegatesEnabled",
      "stagePostCompactionDelegate",
      "taskFlowConsumePendingDelegates",
    ],
  },
];

export function listSubstrateCapabilityEntries(): readonly SubstrateCapabilityEntry[] {
  return substrateCapabilityRegistry;
}

export function getSubstrateCapabilityEntry(name: string): SubstrateCapabilityEntry | undefined {
  const normalized = name.trim().toLowerCase();
  return substrateCapabilityRegistry.find((entry) => entry.name.toLowerCase() === normalized);
}

export function findSubstratesByCapability(
  capability: SubstrateCapability,
): readonly SubstrateCapabilityEntry[] {
  return substrateCapabilityRegistry.filter((entry) => entry.capabilities.includes(capability));
}

export function listSubstrateRegistrySymbols(): readonly string[] {
  const symbols: string[] = [];
  for (const entry of substrateCapabilityRegistry) {
    symbols.push(entry["runtime-symbol"], entry["descriptor-symbol"]);
    for (const alias of entry["symbol-aliases"] ?? []) {
      symbols.push(alias);
    }
  }
  return symbols;
}
