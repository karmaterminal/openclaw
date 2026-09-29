// Private payload files for continuation delegate attachments (RFC §5.4.2,
// "Attachments"). The bytes live outside SQLite under
// `<stateDir>/attachments/continuation-custody/<attachmentId>/payload.json`;
// the custody record holds only the attachment ID. Each payload binds its
// record and owner, so a file is released or read only for the record that
// owns it. The format and 8 MiB cap are C's; the root is new, and the legacy
// root belongs to the Doctor import (§5.4.5).
import path from "node:path";
import { z } from "zod";
import {
  isSubagentAttachmentId,
  removeSubagentAttachmentTree,
} from "../../../agents/subagents/subagent-attachment-cleanup.js";
import { resolveStateDir } from "../../../config/state-dir.js";
import { hasErrnoCode } from "../../../infra/errno.js";
import { FsSafeError } from "../../../infra/fs-safe.js";
import { privateFileStore } from "../../../infra/private-file-store.js";

const PAYLOAD_VERSION = 1;
const PAYLOAD_MAX_BYTES = 8 * 1024 * 1024;

const InlineAttachmentSchema = z
  .object({
    name: z.string(),
    content: z.string(),
    encoding: z.enum(["utf8", "base64"]).optional(),
    mimeType: z.string().optional(),
  })
  .strict();

const PayloadSchema = z
  .object({
    version: z.literal(PAYLOAD_VERSION),
    recordId: z.string().min(1),
    ownerKey: z.string().min(1),
    attachments: z.array(InlineAttachmentSchema).min(1).max(50),
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

export type ContinuationCustodyPayload = z.infer<typeof PayloadSchema>;

type PayloadBinding = { recordId: string; ownerKey: string };

function payloadRoot(env: NodeJS.ProcessEnv): string {
  return path.join(resolveStateDir(env), "attachments", "continuation-custody");
}

function payloadPath(attachmentId: string): string {
  return path.posix.join(attachmentId, "payload.json");
}

/** Write the payload before the record that references it commits (crash boundary 0). */
export async function storeContinuationCustodyPayload(
  payload: Omit<ContinuationCustodyPayload, "version"> & { attachmentId: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const { attachmentId, ...binding } = payload;
  const parsed = PayloadSchema.safeParse({ version: PAYLOAD_VERSION, ...binding });
  if (!isSubagentAttachmentId(attachmentId) || !parsed.success) {
    throw new Error("invalid continuation custody payload");
  }
  await privateFileStore(payloadRoot(env)).writeJson(payloadPath(attachmentId), parsed.data, {
    maxBytes: PAYLOAD_MAX_BYTES,
    trailingNewline: true,
  });
}

/** Read a payload only when it is bound to the given record and owner. */
export async function loadContinuationCustodyPayload(
  attachmentId: string,
  binding: PayloadBinding,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ContinuationCustodyPayload | undefined> {
  if (!isSubagentAttachmentId(attachmentId)) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = await privateFileStore(payloadRoot(env)).readJsonIfExists(payloadPath(attachmentId), {
      maxBytes: PAYLOAD_MAX_BYTES,
    });
  } catch {
    return undefined;
  }
  const parsed = PayloadSchema.safeParse(raw);
  return parsed.success &&
    parsed.data.recordId === binding.recordId &&
    parsed.data.ownerKey === binding.ownerKey
    ? parsed.data
    : undefined;
}

/**
 * Delete a payload after its record's reference was scrubbed in a committed
 * write. A file bound to another record is left in place; an absent file is
 * already released.
 */
export async function releaseContinuationCustodyPayload(
  attachmentId: string,
  recordId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<"released" | "absent" | "foreign"> {
  if (!isSubagentAttachmentId(attachmentId)) {
    return "foreign";
  }
  const root = payloadRoot(env);
  let raw: unknown;
  try {
    raw = await privateFileStore(root).readJsonIfExists(payloadPath(attachmentId), {
      maxBytes: PAYLOAD_MAX_BYTES,
    });
  } catch {
    return "foreign";
  }
  if (raw === null) {
    return "absent";
  }
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success || parsed.data.recordId !== recordId) {
    return "foreign";
  }
  await removeSubagentAttachmentTree(root, attachmentId);
  return "released";
}

/**
 * Startup reconcile: delete payload directories that no live record references
 * and that are older than the cutoff, so an enqueue racing the scan survives.
 */
export async function reconcileContinuationCustodyPayloads(
  params: { retainedAttachmentIds: ReadonlySet<string>; orphanedBefore: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ removed: number; failed: number }> {
  const rootDir = payloadRoot(env);
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
