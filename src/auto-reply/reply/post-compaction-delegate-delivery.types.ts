// Continuation (karmaterminal): the post-compaction delegate delivery contract, a type leaf
// shared by delivery and acceptance so neither imports the other's types.
import type {
  spawnSubagentDirect,
  SpawnSubagentContext,
  SpawnSubagentParams,
} from "../../agents/subagents/spawn/subagent-spawn.js";
import type { patchSessionEntryCore } from "../../config/sessions/session-accessor.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { QueuedSessionDelivery } from "../../infra/session-delivery-queue-storage.js";
import type { OpenClawStateWorkerContext } from "../../state/openclaw-state-worker-context.types.js";
import type { DelegateAdmissionEvidence } from "../continuation/delegate-dispatch-accepted-children.js";
import type { DelegateSpawnFenceResult } from "../continuation/delegate-store.js";
import type { ChainState, ContinuationRuntimeConfig } from "../continuation/types.js";

export type QueuedPostCompactionDelegateDelivery = Extract<
  QueuedSessionDelivery,
  { kind: "postCompactionDelegate" }
>;

type PostCompactionDelegateSpawnResult = Awaited<ReturnType<typeof spawnSubagentDirect>>;

export type PostCompactionDelegateSpawn = (
  params: SpawnSubagentParams,
  context: SpawnSubagentContext,
) => Promise<PostCompactionDelegateSpawnResult>;

export type PostCompactionDelegateDeliveryDeps = {
  enqueueSystemEvent(
    text: string,
    options: { sessionKey: string; traceparent?: string; trusted?: boolean },
  ): void;
  getRuntimeConfig(): OpenClawConfig;
  loadSessionEntry(params: { storePath: string; sessionKey: string }): SessionEntry | undefined;
  log(message: string): void;
  now(): number;
  patchSessionEntryCore: typeof patchSessionEntryCore;
  resolveContinuationRuntimeConfig(cfg: OpenClawConfig): ContinuationRuntimeConfig;
  resolveSessionAgentId(params: { sessionKey?: string; config?: OpenClawConfig }): string;
  resolveSessionStorePathCore(
    store?: string,
    opts?: { agentId?: string; env?: NodeJS.ProcessEnv },
  ): string;
  spawnSubagentDirect: PostCompactionDelegateSpawn;
  revalidatePendingDelegateForSpawn(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    controller: "post-compaction",
  ): Promise<DelegateSpawnFenceResult>;
  markPendingDelegateSpawnAccepted(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    childSessionKey: string,
  ): Promise<boolean>;
  failReleasedPostCompactionDelegate(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    failureReason: string,
    phase?: string,
  ): Promise<boolean>;
  reserveAcceptedPostCompactionChainHop(
    delegate: { flowId?: string; expectedRevision?: number; task: string },
    plannedChainState: ChainState,
  ): Promise<{ chainState: ChainState; expectedRevision: number | undefined }>;
  /** Registry evidence under the entry's attempt keys (RFC §5.4.4). */
  readAdmissionEvidence(params: {
    runIds: readonly string[];
    requesterSessionKey: string;
  }): Promise<DelegateAdmissionEvidence>;
  /** Persist attempt ownership on the entry before any spawn begins. */
  markAttemptStarted(
    entry: QueuedPostCompactionDelegateDelivery,
    queueContext: OpenClawStateWorkerContext,
  ): Promise<void>;
  /** Enqueue the entry's interrupted notice and surface it (idempotent per entry). */
  enqueueInterruptedNotice(params: {
    entry: QueuedPostCompactionDelegateDelivery;
    queueContext?: OpenClawStateWorkerContext;
  }): Promise<void>;
};
