// Per-row decisions of the continuation TaskFlow custody import (RFC
// docs/design/continue-work-signal-v2.md §5.4.5, per-state table; Q3, Q6, Q7).
// Planning is pure: the owner transaction supplies the facts it reread
// (queue entries, registry rows, existing custody records) and applies the
// returned plan. Receipt reports carry structure, counts and hashes only;
// they never hold task text, reasons, routing values or attachment bytes.
import { createHash } from "node:crypto";
import { safeParseJsonRecord } from "@openclaw/normalization-core";
import { decodeDelegateStateJson } from "../delegate-flow-state.js";
import { decodeWorkStateJson } from "../work-flow-state.js";
import type { ContinuationHandoff, ContinuationRecord } from "./custody-store.types.js";
import type { LegacyContinuationFlowRow } from "./legacy-taskflow-migration-source.js";
import { isTerminalLegacyStatus } from "./legacy-taskflow-migration-source.js";

export type InlineAttachment = {
  name: string;
  content: string;
  encoding?: "utf8" | "base64";
  mimeType?: string;
};

/** The attachment payload a live imported record needs in the new root before commit. */
export type PayloadIntent =
  | { source: "legacy-file"; attachmentId: string }
  | {
      source: "inline";
      attachmentId: string;
      attachments: InlineAttachment[];
      attachAs?: { mountPath: string };
    };

/** Facts the owner transaction reads before it plans a row. */
export type RowFacts = {
  /** Pending session-queue entry C enqueued for this row (C's source key). */
  queueEntryId?: string;
  /** `subagent_runs` rows under C's derived child session key. */
  registry: readonly { runId: string; childSessionKey: string; requesterSessionKey: string }[];
  /** The owner already has live custody-store work (a rollback-era row would be a second election). */
  ownerHasLiveCustodyWork: boolean;
  /** Payload copy result, known before the transaction. */
  payload?: "copied" | "missing";
  now: number;
};

export type ReceiptReport = Record<string, string | number | boolean | readonly string[]>;

export type RowPlan = {
  disposition: "imported" | "retired-terminal";
  record?: ContinuationRecord;
  /** Q3: exactly one interrupted notice, enqueued in the owner transaction. */
  interruptedNotice?: { task: string };
  /** Q6: replacement source `state_json` with inline attachment content removed. */
  scrubbedStateJson?: string;
  /** Q7: fence the imported non-terminal source row. */
  fence: boolean;
  /** Legacy payload file to delete after the commit. */
  releaseLegacyAttachmentId?: string;
  report: ReceiptReport;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Deterministic, so a retried import rewrites the same payload file (a write-once no-op). */
export function inlineImportAttachmentId(flowId: string): string {
  const hex = sha256(`continuation-custody-import-inline\0${flowId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function inlineAttachments(state: Record<string, unknown>): InlineAttachment[] | undefined {
  const { attachments } = state;
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }
  // SAFETY: callers pass state that already decoded through the strict delegate codec.
  return attachments as InlineAttachment[];
}

/**
 * Q6 evidence: count, byte size and SHA-256 per scrubbed attachment. A source
 * whose every inline attachment is already empty was scrubbed by a committed
 * import, so a receipt-less one is a structural anomaly.
 */
export function describeInlineScrub(state: Record<string, unknown> | undefined) {
  const attachments = state ? inlineAttachments(state) : undefined;
  if (!attachments || !attachments.every((item) => typeof item?.content === "string")) {
    return undefined;
  }
  return {
    count: attachments.length,
    bytes: attachments.reduce((total, item) => total + Buffer.byteLength(item.content), 0),
    sha256: attachments.map((item) => sha256(item.content)),
    alreadyScrubbed: attachments.every((item) => item.content === ""),
    scrubbedStateJson: JSON.stringify({
      ...state,
      attachments: attachments.map(({ content: _content, ...rest }) =>
        Object.assign(rest, { content: "" }),
      ),
    }),
  };
}

function legacyAttachmentId(state: Record<string, unknown> | undefined): string | undefined {
  return typeof state?.attachmentId === "string" ? state.attachmentId : undefined;
}

function withoutAttachmentBytes(state: Record<string, unknown>): Record<string, unknown> {
  const { attachments: _attachments, attachAs: _attachAs, attachmentId: _id, ...rest } = state;
  return rest;
}

function baseRecord(row: LegacyContinuationFlowRow): ContinuationRecord {
  return {
    recordId: row.flow_id,
    kind: row.kind,
    ownerSessionKey: row.owner_key,
    revision: row.revision,
    status: "queued",
    ...(row.current_step !== null ? { phase: row.current_step } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stateJson: row.state_json ?? "{}",
    spawnAttempts: [],
  };
}

function terminal(
  record: ContinuationRecord,
  status: "succeeded" | "failed" | "cancelled",
  now: number,
  extra: Partial<ContinuationRecord> = {},
): ContinuationRecord {
  return { ...record, ...extra, status, updatedAt: now, endedAt: now };
}

/** Structural-only diagnostics for a row whose state does not decode (C's rejectCorrupt). */
function corruptPlan(row: LegacyContinuationFlowRow, facts: RowFacts): RowPlan {
  const parsed = row.state_json === null ? undefined : safeParseJsonRecord(row.state_json);
  const scrub = describeInlineScrub(parsed);
  const diagnostics = {
    legacyImport: {
      corrupt: true,
      sourceStatus: row.status,
      stateBytes: Buffer.byteLength(row.state_json ?? ""),
      stateShape: row.state_json === null ? "null" : parsed ? "object" : "invalid",
    },
  };
  return {
    disposition: "imported",
    record: terminal(baseRecord(row), "failed", facts.now, {
      stateJson: JSON.stringify(diagnostics),
      failureReason: "corrupt-legacy-state",
    }),
    ...(scrub && !scrub.alreadyScrubbed ? { scrubbedStateJson: scrub.scrubbedStateJson } : {}),
    fence: !isTerminalLegacyStatus(row.status) && row.cancel_requested_at === null,
    ...(legacyAttachmentId(parsed)
      ? { releaseLegacyAttachmentId: legacyAttachmentId(parsed) }
      : {}),
    report: { corrupt: true },
  };
}

function planWork(row: LegacyContinuationFlowRow, facts: RowFacts): RowPlan {
  const parsed = row.state_json === null ? undefined : safeParseJsonRecord(row.state_json);
  const state = parsed ? decodeWorkStateJson(parsed) : undefined;
  if (row.status === "succeeded" || row.status === "cancelled") {
    return { disposition: "retired-terminal", fence: false, report: {} };
  }
  if (row.status === "failed") {
    // Only a decodable obligation is owed; anything else was pruneable at C.
    if (state?.terminalNoticePending !== "retry-exhausted") {
      return { disposition: "retired-terminal", fence: false, report: {} };
    }
    return {
      disposition: "imported",
      record: {
        ...baseRecord(row),
        status: "failed",
        ...(row.blocked_summary !== null ? { failureReason: row.blocked_summary } : {}),
        endedAt: row.ended_at ?? row.updated_at,
        terminalNoticePending: "retry-exhausted",
      },
      fence: false,
      report: { obligation: "retry-exhausted" },
    };
  }
  if (!state || (row.status !== "queued" && row.status !== "running")) {
    return corruptPlan(row, facts);
  }
  const chainId = row.chain_id ?? state.chainId;
  const record: ContinuationRecord = {
    ...baseRecord(row),
    status: row.status,
    ...(chainId ? { chainId } : {}),
    dueAt: Math.max(state.dueAt, state.recoveryDueAt ?? 0),
  };
  if (facts.ownerHasLiveCustodyWork) {
    // A C-era build created this during a rollback; importing it live would give
    // the owner a second election, so it becomes one visible notice instead.
    return {
      disposition: "imported",
      record: terminal(record, "failed", facts.now, {
        failureReason: "rollback-election-conflict",
        terminalNoticePending: "rollback-election-conflict",
      }),
      fence: true,
      report: { rollbackElectionConflict: true },
    };
  }
  return { disposition: "imported", record, fence: true, report: {} };
}

function registryHandoff(
  row: LegacyContinuationFlowRow,
  facts: RowFacts,
): { handoff?: ContinuationHandoff; collision: boolean } {
  const owned = facts.registry.find((entry) => entry.requesterSessionKey === row.owner_key);
  if (owned) {
    return {
      handoff: {
        target: "subagent_runs",
        childRunId: owned.runId,
        childSessionKey: owned.childSessionKey,
        handedOffAt: facts.now,
      },
      collision: false,
    };
  }
  return { collision: facts.registry.length > 0 };
}

function planDelegate(row: LegacyContinuationFlowRow, facts: RowFacts): RowPlan {
  const parsed = row.state_json === null ? undefined : safeParseJsonRecord(row.state_json);
  const state = parsed ? decodeDelegateStateJson(parsed) : undefined;
  const postCompaction = row.kind === "post_compaction";
  if (isTerminalLegacyStatus(row.status)) {
    // A handed-off post-compaction row with a still-pending queue entry stays
    // visible to session reset through its handoff; every other terminal row
    // carries no obligation.
    if (
      postCompaction &&
      row.status === "succeeded" &&
      state &&
      state.childSessionKey === undefined &&
      facts.queueEntryId !== undefined
    ) {
      return {
        disposition: "imported",
        record: {
          ...baseRecord(row),
          status: "succeeded",
          endedAt: row.ended_at ?? row.updated_at,
          handoff: {
            target: "session_delivery_queue",
            queueEntryId: facts.queueEntryId,
            handedOffAt: row.ended_at ?? row.updated_at,
          },
        },
        fence: false,
        report: { handoff: "session_delivery_queue" },
      };
    }
    return { disposition: "retired-terminal", fence: false, report: {} };
  }
  if (!parsed || !state || (row.status !== "queued" && row.status !== "running")) {
    return corruptPlan(row, facts);
  }
  const scrub = describeInlineScrub(parsed);
  const scrubbed = scrub ? { scrubbedStateJson: scrub.scrubbedStateJson } : {};
  const legacyFile = legacyAttachmentId(parsed);
  const release = legacyFile ? { releaseLegacyAttachmentId: legacyFile } : {};
  const staged = row.status === "queued" || state.awaitingNextCompaction === true;
  if (staged) {
    const attachmentId = scrub ? inlineImportAttachmentId(row.flow_id) : legacyFile;
    const stateJson = scrub
      ? JSON.stringify({
          ...withoutAttachmentBytes(parsed),
          attachmentId,
          attachmentCount: scrub.count,
        })
      : (row.state_json ?? "{}");
    // A live record keeps needing its bytes: the source loses them (Q6 scrub,
    // legacy delete) only once the new-root copy is confirmed.
    const copied = facts.payload === "copied";
    return {
      disposition: "imported",
      record: {
        ...baseRecord(row),
        status: row.status,
        stateJson,
        ...(postCompaction ? {} : { dueAt: row.created_at + (state.delayMs ?? 0) }),
        ...(attachmentId ? { attachmentId } : {}),
      },
      ...(copied ? scrubbed : {}),
      fence: true,
      ...(copied ? release : {}),
      report: attachmentId ? { payload: facts.payload ?? "missing" } : {},
    };
  }
  // Claimed at C: C stored no child run key, so admission can never be proven.
  const evidence = JSON.stringify({
    ...withoutAttachmentBytes(parsed),
    legacyClaim: { sourceUpdatedAt: row.updated_at },
  });
  if (postCompaction && facts.queueEntryId !== undefined) {
    return {
      disposition: "imported",
      record: terminal(baseRecord(row), "succeeded", facts.now, {
        stateJson: evidence,
        handoff: {
          target: "session_delivery_queue",
          queueEntryId: facts.queueEntryId,
          handedOffAt: facts.now,
        },
      }),
      ...scrubbed,
      fence: true,
      ...release,
      report: { handoff: "session_delivery_queue" },
    };
  }
  const { handoff, collision } = registryHandoff(row, facts);
  if (handoff) {
    return {
      disposition: "imported",
      record: terminal(baseRecord(row), "succeeded", facts.now, { stateJson: evidence, handoff }),
      ...scrubbed,
      fence: true,
      ...release,
      report: { handoff: "subagent_runs" },
    };
  }
  return {
    disposition: "imported",
    record: terminal(baseRecord(row), "failed", facts.now, {
      stateJson: evidence,
      failureReason: "spawn-interrupted",
    }),
    interruptedNotice: { task: state.task },
    ...scrubbed,
    fence: true,
    ...release,
    report: { spawnInterrupted: true, ...(collision ? { registryCollision: true } : {}) },
  };
}

/** Plan one receipt-less candidate row. Cancel-fenced live rows honor the fence. */
export function planLegacyRow(row: LegacyContinuationFlowRow, facts: RowFacts): RowPlan {
  const parsed = row.state_json === null ? undefined : safeParseJsonRecord(row.state_json);
  let plan: RowPlan;
  if (!isTerminalLegacyStatus(row.status) && row.cancel_requested_at !== null) {
    const scrub = describeInlineScrub(parsed);
    plan = {
      disposition: "imported",
      record: terminal(baseRecord(row), "cancelled", facts.now, {
        cancelRequestedAt: row.cancel_requested_at,
        ...(parsed ? { stateJson: JSON.stringify(withoutAttachmentBytes(parsed)) } : {}),
      }),
      ...(scrub && !scrub.alreadyScrubbed ? { scrubbedStateJson: scrub.scrubbedStateJson } : {}),
      // The source already carries its own fence; its timestamp is kept.
      fence: false,
      ...(legacyAttachmentId(parsed)
        ? { releaseLegacyAttachmentId: legacyAttachmentId(parsed) }
        : {}),
      report: {},
    };
  } else {
    plan = row.kind === "work" ? planWork(row, facts) : planDelegate(row, facts);
  }
  const scrub = plan.scrubbedStateJson !== undefined ? describeInlineScrub(parsed) : undefined;
  plan.report = {
    disposition: plan.disposition,
    kind: row.kind,
    sourceStatus: row.status,
    sourceRevision: row.revision,
    stateBytes: Buffer.byteLength(row.state_json ?? ""),
    ...(plan.record ? { importedStatus: plan.record.status } : {}),
    ...(typeof parsed?.attachmentCount === "number"
      ? { attachmentCount: parsed.attachmentCount }
      : {}),
    ...(scrub
      ? { scrubbedCount: scrub.count, scrubbedBytes: scrub.bytes, scrubbedSha256: scrub.sha256 }
      : {}),
    fenced: plan.fence,
    interruptedNotice: plan.interruptedNotice !== undefined,
    // The import pass retries this post-commit delete until the file is gone.
    legacyRelease: plan.releaseLegacyAttachmentId !== undefined,
    ...plan.report,
  };
  return plan;
}

/** Whether a live imported row needs its payload in the new root before commit. */
export function payloadIntentFor(row: LegacyContinuationFlowRow): PayloadIntent | undefined {
  if (
    row.kind === "work" ||
    (row.status !== "queued" && row.status !== "running") ||
    row.cancel_requested_at !== null ||
    row.state_json === null
  ) {
    return undefined;
  }
  const parsed = safeParseJsonRecord(row.state_json);
  const state = parsed ? decodeDelegateStateJson(parsed) : undefined;
  if (!parsed || !state || (row.status === "running" && state.awaitingNextCompaction !== true)) {
    return undefined;
  }
  const inline = inlineAttachments(parsed);
  if (inline && !inline.every((item) => item.content === "")) {
    return {
      source: "inline",
      attachmentId: inlineImportAttachmentId(row.flow_id),
      attachments: inline,
      ...(state.attachAs ? { attachAs: state.attachAs } : {}),
    };
  }
  const attachmentId = legacyAttachmentId(parsed);
  return attachmentId ? { source: "legacy-file", attachmentId } : undefined;
}
