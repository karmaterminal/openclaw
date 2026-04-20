import type { DeliveryContext } from "../utils/delivery-context.types.js";
import type { TaskNotifyPolicy } from "./task-registry.types.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TaskFlowSyncMode = "task_mirrored" | "managed";

export type TaskFlowStatus =
  | "queued"
  | "running"
  | "waiting"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "lost";

/**
 * Ownership model for a managed TaskFlow.
 *
 * - `host-local` (default): flow state lives on a single gateway. Two
 *   gateways on different boxes can each "win" a revision race because
 *   they're looking at separate per-host state. This preserves
 *   pre-v1.1 behavior for any code that doesn't opt in.
 *
 * - `cluster`: flow ownership is mediated by a ZK `LeaderElection` at
 *   `ownershipPath` (defaults to `/openclaw/<env>/taskflow/<flowId>`).
 *   Only the elected leader's gateway is allowed to advance the flow;
 *   every other gateway sees `not_owner` on mutation attempts. On
 *   leadership loss (session expiry, manual cancel), the flow
 *   transitions to `queued` so the next elected leader picks up from
 *   the last persisted revision. See `docs/plugins/zk.md` (quorum
 *   degradation) + `docs/plugins/zk-parity.md` (evidence template).
 *
 * Schema addition is additive; existing records read back as
 * `ownership === undefined`, which consumers treat as `host-local`.
 */
export type TaskFlowOwnership = "host-local" | "cluster";

export type TaskFlowRecord = {
  flowId: string;
  syncMode: TaskFlowSyncMode;
  ownerKey: string;
  requesterOrigin?: DeliveryContext;
  controllerId?: string;
  revision: number;
  status: TaskFlowStatus;
  notifyPolicy: TaskNotifyPolicy;
  goal: string;
  currentStep?: string;
  blockedTaskId?: string;
  blockedSummary?: string;
  stateJson?: JsonValue;
  waitJson?: JsonValue;
  cancelRequestedAt?: number;
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
  /**
   * v1.1 addition. See `TaskFlowOwnership`. Default (absent) = host-local.
   * Cluster-scoped ownership requires `openclaw/plugin-sdk/zk` to be
   * wired — see PR 4b follow-up. Until that wiring lands, setting
   * `ownership: "cluster"` persists the field but does not yet enforce
   * cross-host exclusivity; the enforcement seam is scaffolded in
   * `src/plugins/runtime/runtime-taskflow-zk.ts`.
   */
  ownership?: TaskFlowOwnership;
  /**
   * v1.1 addition. ZK path used for the per-flow `LeaderElection`. If
   * absent, the default is `/openclaw/<env>/taskflow/<flowId>`
   * (resolved at apply time so `env` can change per deployment).
   */
  ownershipPath?: string;
};
