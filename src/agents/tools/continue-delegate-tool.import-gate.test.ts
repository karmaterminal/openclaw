// RFC docs/design/continue-work-signal-v2.md §5.4.5 "Update behavior": an owner
// whose legacy TaskFlow rows the startup import left behind gets no custody
// writes until Doctor imports it. (Split from continue-delegate-tool.test.ts,
// which sits at the max-lines budget.)
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE,
  installContinuationCustodyImportGate,
} from "../../auto-reply/continuation/custody-import-gate.js";
import {
  listCustodyRecordsForTest,
  useContinuationCustodyTestState,
} from "../../auto-reply/continuation/custody/custody.test-support.js";
import { resetContinueDelegateTurnAdmissionForTests } from "../../auto-reply/continuation/delegate-turn-admission.js";
import { clearRuntimeConfigSnapshot } from "../../config/config.js";
import { createContinueDelegateTool } from "./continue-delegate-tool.js";

describe("continue_delegate tool :: legacy import gate", () => {
  useContinuationCustodyTestState();

  beforeEach(() => {
    resetContinueDelegateTurnAdmissionForTests();
    clearRuntimeConfigSnapshot();
  });

  afterEach(() => {
    resetContinueDelegateTurnAdmissionForTests();
    clearRuntimeConfigSnapshot();
  });

  it("refuses to enqueue for an owner awaiting legacy import and names the doctor fix", async () => {
    installContinuationCustodyImportGate(["test-session"]);
    const gatedTool = createContinueDelegateTool({ agentSessionKey: "test-session" });

    await expect(gatedTool.execute("call-0", { task: "gated delegate" })).rejects.toThrow(
      CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE,
    );
    await expect(
      gatedTool.execute("call-1", {
        task: "gated post-compaction delegate",
        mode: "post-compaction",
      }),
    ).rejects.toThrow(CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE);
    expect(CONTINUATION_CUSTODY_IMPORT_PENDING_MESSAGE).toContain("openclaw doctor --fix");
    expect(await listCustodyRecordsForTest({ ownerSessionKey: "test-session" })).toEqual([]);

    const otherTool = createContinueDelegateTool({ agentSessionKey: "other-session" });
    expect(
      (await otherTool.execute("call-2", { task: "ungated delegate" }))?.details,
    ).toMatchObject({ status: "scheduled", delegatesThisTurn: 1 });
    expect(await listCustodyRecordsForTest({ ownerSessionKey: "other-session" })).toEqual([
      expect.objectContaining({ kind: "delegate", status: "queued" }),
    ]);
  });
});
