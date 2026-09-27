import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskFlowRecord } from "../../tasks/task-flow-registry.types.js";
import {
  createDelegateAttachmentId,
  projectDelegateFlow,
  reconcileDelegateAttachmentPayloads,
  releaseDelegateAttachmentPayload,
  storeDelegateAttachmentPayload,
} from "./delegate-attachment-payload-store.js";

let stateDir = "";

function createFlow(flowId: string, ownerKey: string): TaskFlowRecord {
  return {
    flowId,
    ownerKey,
    syncMode: "managed",
    controllerId: "core/continuation-delegate",
    revision: 0,
    status: "queued",
    notifyPolicy: "silent",
    goal: "attachment test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function attachmentTree(attachmentId: string): string {
  return path.join(stateDir, "attachments", "continuation", attachmentId);
}

function storePayload(params: { flow: TaskFlowRecord; name: string; content: string }): string {
  const attachmentId = createDelegateAttachmentId();
  storeDelegateAttachmentPayload({
    attachmentId,
    flowId: params.flow.flowId,
    ownerKey: params.flow.ownerKey,
    state: { attachments: [{ name: params.name, content: params.content }] },
  });
  return attachmentId;
}

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-delegate-custody-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe("delegate attachment payload store", () => {
  it("fails closed for missing, mismatched, or incomplete durable custody", () => {
    const missingFlow = createFlow("missing-flow", "missing-owner");
    expect(
      projectDelegateFlow(
        missingFlow,
        {
          task: "missing custody",
          attachmentId: createDelegateAttachmentId(),
          attachmentCount: 1,
        },
        { requireAttachmentPayload: true },
      ),
    ).toBeUndefined();

    const targetFlow = createFlow("target-flow", "target-owner");
    const targetId = storePayload({
      flow: targetFlow,
      name: "target.txt",
      content: "target",
    });
    const wrongFlow = createFlow("wrong-flow", "wrong-owner");
    expect(
      projectDelegateFlow(
        wrongFlow,
        { task: "wrong custody", attachmentId: targetId, attachmentCount: 1 },
        { requireAttachmentPayload: true },
      ),
    ).toBeUndefined();
    expect(releaseDelegateAttachmentPayload(targetId, wrongFlow.flowId)).toBe(false);
    expect(fs.existsSync(attachmentTree(targetId))).toBe(true);
    expect(
      projectDelegateFlow(
        targetFlow,
        { task: "right custody", attachmentId: targetId, attachmentCount: 1 },
        { requireAttachmentPayload: true },
      )?.attachments,
    ).toEqual([{ name: "target.txt", content: "target" }]);

    expect(
      projectDelegateFlow(
        targetFlow,
        { task: "count mismatch", attachmentId: targetId, attachmentCount: 2 },
        { requireAttachmentPayload: true },
      ),
    ).toBeUndefined();
  });

  it("reaps old orphaned custody while retaining an active identity", async () => {
    const activeFlow = createFlow("active-flow", "active-owner");
    const orphanedFlow = createFlow("orphaned-flow", "orphaned-owner");
    const activeId = storePayload({ flow: activeFlow, name: "active.txt", content: "active" });
    const orphanedId = storePayload({
      flow: orphanedFlow,
      name: "orphaned.txt",
      content: "orphaned",
    });

    await expect(
      reconcileDelegateAttachmentPayloads({
        retainedAttachmentIds: new Set([activeId]),
        orphanedBefore: Date.now(),
      }),
    ).resolves.toEqual({ removed: 1, failed: 0 });
    expect(fs.existsSync(attachmentTree(activeId))).toBe(true);
    expect(fs.existsSync(attachmentTree(orphanedId))).toBe(false);
  });
});
