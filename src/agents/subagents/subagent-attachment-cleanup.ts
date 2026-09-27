/** Removes host-owned subagent attachment artifacts by generated identity. */
import fsSync from "node:fs";
import path from "node:path";
import { hasErrnoCode } from "../../infra/errno.js";
import { FsSafeError, isPathInside, root } from "../../infra/fs-safe.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { resolveSubagentSessionAttachmentRootDir } from "./subagent-attachment-paths.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSubagentAttachmentId(value: string): boolean {
  return UUID_RE.test(value);
}

export async function removeSubagentAttachmentTree(
  rootDir: string,
  attachmentId: string,
  assertBeforeMutation?: () => void,
): Promise<void> {
  if (!isSubagentAttachmentId(attachmentId)) {
    throw new Error("invalid subagent attachment identity");
  }
  assertBeforeMutation?.();
  try {
    await (
      await root(rootDir)
    ).remove(attachmentId, {
      recursive: true,
      force: true,
      ...(assertBeforeMutation ? { assertBeforeMutation } : {}),
    });
  } catch (error) {
    if (!(error instanceof FsSafeError && error.code === "not-found")) {
      throw error;
    }
  }
}

function resolveSessionAttachmentRootDir(childSessionKey: string): string {
  return resolveSubagentSessionAttachmentRootDir({
    agentId: resolveAgentIdFromSessionKey(childSessionKey),
    childSessionKey,
  });
}

function realpathOrNull(targetPath: string): string | null {
  try {
    return fsSync.realpathSync.native(targetPath);
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

export function removeSubagentAttachmentTreeSync(rootDir: string, attachmentId: string): void {
  if (!isSubagentAttachmentId(attachmentId)) {
    throw new Error("invalid subagent attachment identity");
  }
  const resolvedTarget = realpathOrNull(path.join(rootDir, attachmentId));
  if (!resolvedTarget) {
    return;
  }
  // Compare real paths so a swapped symlink cannot redirect removal outside the
  // attachment root, matching the async path's fs-safe root confinement.
  const confinementRoot = realpathOrNull(rootDir) ?? path.resolve(rootDir);
  if (!isPathInside(confinementRoot, resolvedTarget)) {
    return;
  }
  fsSync.rmSync(resolvedTarget, { recursive: true, force: true });
}

/**
 * Synchronous mirror of `cleanupMaterializedSubagentAttachments`.
 *
 * Orphan pruning deletes the run record synchronously, and that record is the only
 * handle on the attachment tree, so identity-owned storage has to be retired in the
 * same deterministic step or it leaks with no owner left to find it. Identity,
 * root derivation, and root confinement stay owned here; only the transport differs.
 */
export function cleanupMaterializedSubagentAttachmentsSync(params: {
  childSessionKey: string;
  attachmentId: string;
}): void {
  const rootDir = resolveSessionAttachmentRootDir(params.childSessionKey);
  removeSubagentAttachmentTreeSync(rootDir, params.attachmentId);
}

export async function cleanupMaterializedSubagentAttachments(params: {
  childSessionKey: string;
  attachmentId: string;
  isCurrent?: () => boolean;
}): Promise<void> {
  const rootDir = resolveSessionAttachmentRootDir(params.childSessionKey);
  const isCurrent = params.isCurrent;
  await removeSubagentAttachmentTree(
    rootDir,
    params.attachmentId,
    isCurrent
      ? () => {
          if (!isCurrent()) {
            throw new Error("subagent attachment cleanup owner is no longer current");
          }
        }
      : undefined,
  );
}
