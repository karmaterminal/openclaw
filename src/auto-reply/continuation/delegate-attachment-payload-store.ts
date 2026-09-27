import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";
import {
  isSubagentAttachmentId,
  removeSubagentAttachmentTree,
  removeSubagentAttachmentTreeSync,
} from "../../agents/subagents/subagent-attachment-cleanup.js";
import { resolveStateDir } from "../../config/paths.js";
import { hasErrnoCode } from "../../infra/errno.js";
import { FsSafeError } from "../../infra/fs-safe.js";
import { privateFileStore, privateFileStoreSync } from "../../infra/private-file-store.js";
import type { TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import type { PendingContinuationDelegate } from "./types.js";

const DELEGATE_ATTACHMENT_PAYLOAD_VERSION = 1;
const DELEGATE_ATTACHMENT_PAYLOAD_MAX_BYTES = 8 * 1024 * 1024;

const StoredInlineAttachmentSchema = z
  .object({
    name: z.string(),
    content: z.string(),
    encoding: z.enum(["utf8", "base64"]).optional(),
    mimeType: z.string().optional(),
  })
  .strict();

const StoredDelegateAttachmentPayloadSchema = z
  .object({
    version: z.literal(DELEGATE_ATTACHMENT_PAYLOAD_VERSION),
    flowId: z.string().min(1),
    ownerKey: z.string().min(1),
    attachments: z.array(StoredInlineAttachmentSchema).min(1).max(50),
    attachAs: z
      .object({
        mountPath: z
          .string()
          .regex(/^[A-Za-z0-9._\-/]+$/)
          .refine(
            (value) =>
              !value.startsWith("/") &&
              !value.endsWith("/") &&
              !value.includes("//") &&
              !value.split("/").some((segment) => segment === "." || segment === ".."),
          ),
      })
      .strict()
      .optional(),
  })
  .strict();

type StoredDelegateState = PendingContinuationDelegate & {
  attachmentCount?: number;
  attachmentId?: string;
  childSessionKey?: string;
  postCompaction?: boolean;
  releasedAt?: number;
  silent?: boolean;
  silentWake?: boolean;
  traceparentProvenance?: "internal";
};

function resolveDelegateAttachmentRootDir(): string {
  return path.join(resolveStateDir(), "attachments", "continuation");
}

function payloadRelativePath(attachmentId: string): string {
  return path.posix.join(attachmentId, "payload.json");
}

export function createDelegateAttachmentId(): string {
  return crypto.randomUUID();
}

export function readDelegateAttachmentId(stateJson: unknown): string | undefined {
  if (!stateJson || typeof stateJson !== "object" || Array.isArray(stateJson)) {
    return undefined;
  }
  const attachmentId = (stateJson as { attachmentId?: unknown }).attachmentId;
  return typeof attachmentId === "string" && isSubagentAttachmentId(attachmentId)
    ? attachmentId
    : undefined;
}

export function storeDelegateAttachmentPayload(params: {
  attachmentId: string;
  flowId: string;
  ownerKey: string;
  state: Pick<PendingContinuationDelegate, "attachments" | "attachAs">;
}): void {
  if (!isSubagentAttachmentId(params.attachmentId) || !params.state.attachments?.length) {
    throw new Error("invalid continuation delegate attachment custody");
  }
  privateFileStoreSync(resolveDelegateAttachmentRootDir()).writeJson(
    payloadRelativePath(params.attachmentId),
    {
      version: DELEGATE_ATTACHMENT_PAYLOAD_VERSION,
      flowId: params.flowId,
      ownerKey: params.ownerKey,
      attachments: params.state.attachments,
      ...(params.state.attachAs ? { attachAs: params.state.attachAs } : {}),
    },
    { maxBytes: DELEGATE_ATTACHMENT_PAYLOAD_MAX_BYTES, trailingNewline: true },
  );
}

function loadDelegateAttachmentPayload(attachmentId: string) {
  if (!isSubagentAttachmentId(attachmentId)) {
    return undefined;
  }
  try {
    const raw = privateFileStoreSync(resolveDelegateAttachmentRootDir()).readJsonIfExists(
      payloadRelativePath(attachmentId),
      { maxBytes: DELEGATE_ATTACHMENT_PAYLOAD_MAX_BYTES },
    );
    const parsed = StoredDelegateAttachmentPayloadSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function discardDelegateAttachmentPayload(attachmentId: string): boolean {
  try {
    removeSubagentAttachmentTreeSync(resolveDelegateAttachmentRootDir(), attachmentId);
    return true;
  } catch {
    return false;
  }
}

export function releaseDelegateAttachmentPayload(
  attachmentId: string | undefined,
  flowId: string,
): boolean {
  if (!attachmentId) {
    return true;
  }
  const payload = loadDelegateAttachmentPayload(attachmentId);
  if (!payload || payload.flowId !== flowId) {
    return false;
  }
  return discardDelegateAttachmentPayload(attachmentId);
}

export async function reconcileDelegateAttachmentPayloads(params: {
  retainedAttachmentIds: ReadonlySet<string>;
  orphanedBefore: number;
}): Promise<{ removed: number; failed: number }> {
  const rootDir = resolveDelegateAttachmentRootDir();
  let entries;
  try {
    entries = await (await privateFileStore(rootDir).root()).list("", { withFileTypes: true });
  } catch (error) {
    if (
      hasErrnoCode(error, "ENOENT") ||
      (error instanceof FsSafeError && error.code === "not-found")
    ) {
      return { removed: 0, failed: 0 };
    }
    return { removed: 0, failed: 1 };
  }

  let removed = 0;
  let failed = 0;
  for (const entry of entries) {
    if (
      !entry.isDirectory ||
      !isSubagentAttachmentId(entry.name) ||
      params.retainedAttachmentIds.has(entry.name) ||
      entry.mtimeMs > params.orphanedBefore
    ) {
      continue;
    }
    try {
      await removeSubagentAttachmentTree(rootDir, entry.name);
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}

export function projectDelegateFlow(
  flow: TaskFlowRecord,
  state: StoredDelegateState,
  options: { requireAttachmentPayload: boolean },
): PendingContinuationDelegate | undefined {
  const payload = state.attachmentId
    ? loadDelegateAttachmentPayload(state.attachmentId)
    : undefined;
  const payloadMatchesFlow =
    payload?.flowId === flow.flowId && payload.ownerKey === flow.ownerKey ? payload : undefined;
  const attachments = state.attachments ?? payloadMatchesFlow?.attachments;
  const attachAs = state.attachAs ?? payloadMatchesFlow?.attachAs;
  if (
    options.requireAttachmentPayload &&
    state.attachmentCount !== undefined &&
    (!attachments || attachments.length !== state.attachmentCount)
  ) {
    return undefined;
  }

  const mode =
    state.postCompaction === true
      ? "post-compaction"
      : state.silentWake === true
        ? "silent-wake"
        : state.silent === true
          ? "silent"
          : undefined;
  return {
    task: state.task,
    ...(state.delayMs !== undefined ? { delayMs: state.delayMs } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(state.firstArmedAt !== undefined ? { firstArmedAt: state.firstArmedAt } : {}),
    ...(attachments ? { attachments: structuredClone(attachments) } : {}),
    ...(attachAs ? { attachAs: { ...attachAs } } : {}),
    ...(state.targetSessionKey ? { targetSessionKey: state.targetSessionKey } : {}),
    ...(state.targetSessionKeys?.length ? { targetSessionKeys: state.targetSessionKeys } : {}),
    ...(state.fanoutMode ? { fanoutMode: state.fanoutMode } : {}),
    ...(state.recipientAuthorityBinding
      ? { recipientAuthorityBinding: state.recipientAuthorityBinding }
      : {}),
    ...(state.returnOptions ? { returnOptions: state.returnOptions } : {}),
    ...(state.recipientContext ? { recipientContext: state.recipientContext } : {}),
    ...(state.traceparent && state.traceparentProvenance === "internal"
      ? { traceparent: state.traceparent }
      : {}),
    ...(state.model ? { model: state.model } : {}),
    ...(state.chainTokensFold !== undefined ? { chainTokensFold: state.chainTokensFold } : {}),
    ...(state.persistedChainState ? { persistedChainState: state.persistedChainState } : {}),
    ...(state.persistedChainStateKind
      ? { persistedChainStateKind: state.persistedChainStateKind }
      : {}),
    ...(state.inheritedSilent ? { inheritedSilent: true } : {}),
    ...(state.inheritedWake ? { inheritedWake: true } : {}),
    ...(state.originRunId ? { originRunId: state.originRunId } : {}),
    flowId: flow.flowId,
    expectedRevision: flow.revision,
  };
}
