// Attachment payload moves for the continuation TaskFlow custody import (RFC
// docs/design/continue-work-signal-v2.md §5.4.5, "Idempotency"). After the
// cutover the import owns C's legacy root, `attachments/continuation/`; the
// custody payload store owns the new root. Files move copy-first: the new-root
// file is written before the owner commit and the legacy file is deleted
// after it, so a crash never strands a committed record without its bytes.
import path from "node:path";
import { z } from "zod";
import {
  isSubagentAttachmentId,
  removeSubagentAttachmentTree,
} from "../../../agents/subagents/subagent-attachment-cleanup.js";
import { resolveStateDir } from "../../../config/state-dir.js";
import { privateFileStore } from "../../../infra/private-file-store.js";
import {
  ContinuationCustodyPayloadRejectedError,
  storeContinuationCustodyPayload,
} from "./custody-payload-store.js";
import { payloadIntentFor } from "./legacy-taskflow-import-plan.js";
import type { LegacyContinuationFlowRow } from "./legacy-taskflow-migration-source.js";

const LEGACY_PAYLOAD_MAX_BYTES = 8 * 1024 * 1024;

function legacyPayloadRoot(env: NodeJS.ProcessEnv): string {
  return path.join(resolveStateDir(env), "attachments", "continuation");
}

// C's payload format under the legacy root, which the import owns after the cutover.
const LegacyPayloadSchema = z
  .object({
    version: z.literal(1),
    flowId: z.string().min(1),
    ownerKey: z.string().min(1),
    attachments: z
      .array(
        z
          .object({
            name: z.string(),
            content: z.string(),
            encoding: z.enum(["utf8", "base64"]).optional(),
            mimeType: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    attachAs: z.object({ mountPath: z.string() }).strict().optional(),
  })
  .strict();

/**
 * The legacy payload, or undefined when it is absent or not a valid C payload.
 * I/O failures propagate: an unreadable file is not proof that it is gone.
 */
async function readLegacyPayload(env: NodeJS.ProcessEnv, attachmentId: string) {
  if (!isSubagentAttachmentId(attachmentId)) {
    return undefined;
  }
  const text = await privateFileStore(legacyPayloadRoot(env)).readTextIfExists(
    path.posix.join(attachmentId, "payload.json"),
    { maxBytes: LEGACY_PAYLOAD_MAX_BYTES },
  );
  if (text === null) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = LegacyPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Delete a legacy payload after the commit that made it unreferenced; a foreign file stays. */
export async function releaseLegacyPayload(
  env: NodeJS.ProcessEnv,
  release: { attachmentId: string; flowId: string },
  /** Throws once the database lifetime this import began in has ended. */
  assertCurrent: () => void = () => {},
): Promise<void> {
  const payload = await readLegacyPayload(env, release.attachmentId);
  if (payload?.flowId === release.flowId) {
    // Checked again by the remove itself, immediately before it mutates.
    await removeSubagentAttachmentTree(legacyPayloadRoot(env), release.attachmentId, assertCurrent);
  }
}

/**
 * Copy-first payload preparation, before the owner transaction. A crash after
 * this leaves only an unreferenced new-root file, which the custody reconcile
 * removes, and the legacy file stays for the retry.
 */
export async function preparePayloads(
  env: NodeJS.ProcessEnv,
  rows: readonly LegacyContinuationFlowRow[],
  /** Throws once the database lifetime this import began in has ended. */
  assertCurrent: () => void = () => {},
): Promise<Map<string, "copied" | "missing">> {
  const results = new Map<string, "copied" | "missing">();
  for (const row of rows) {
    const intent = payloadIntentFor(row);
    if (!intent) {
      continue;
    }
    const legacy =
      intent.source === "legacy-file"
        ? await readLegacyPayload(env, intent.attachmentId)
        : undefined;
    // A legacy file counts only when bound to this flow and owner, as C's projection required.
    const bytes =
      intent.source === "inline"
        ? intent
        : legacy?.flowId === row.flow_id && legacy.ownerKey === row.owner_key
          ? legacy
          : undefined;
    if (!bytes) {
      // The record keeps its reference and fails as a corrupt payload at
      // dispatch, as C did when the legacy file was missing.
      results.set(row.flow_id, "missing");
      continue;
    }
    let stored: Awaited<ReturnType<typeof storeContinuationCustodyPayload>>;
    try {
      stored = await storeContinuationCustodyPayload(
        {
          attachments: bytes.attachments,
          ...(bytes.attachAs ? { attachAs: bytes.attachAs } : {}),
          attachmentId: intent.attachmentId,
          recordId: row.flow_id,
          ownerKey: row.owner_key,
        },
        env,
        { assertBeforeMutation: assertCurrent },
      );
    } catch (error) {
      // Only a rejection of the bytes themselves is final: C failed such a
      // record as corrupt at dispatch, and so will the new runtime. Any I/O
      // failure fails the owner, leaving the source and legacy file for a retry.
      if (!(error instanceof ContinuationCustodyPayloadRejectedError)) {
        throw error;
      }
      results.set(row.flow_id, "missing");
      continue;
    }
    if (stored === "conflict") {
      throw new Error(
        `continuation custody payload ${intent.attachmentId} already holds different bytes`,
      );
    }
    results.set(row.flow_id, "copied");
  }
  return results;
}
