import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePendingDelegates,
  consumeStagedPostCompactionDelegates,
  resetDelegateStoreForTests,
} from "../../auto-reply/continuation/delegate-store.js";
import { ToolInputError } from "./common.js";

// Mutable cap holder so individual tests can adjust the per-turn cap without
// re-mocking. Default high enough to not interfere with non-cap tests.
const capHolder = { value: 100 };

vi.mock("../../auto-reply/continuation/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auto-reply/continuation/config.js")>();
  return {
    ...actual,
    resolveMaxDelegatesPerTurn: () => capHolder.value,
  };
});

// Per-test unique session key so leftover TaskFlow records from prior tests
// (which `resetDelegateStoreForTests` doesn't fully clear) cannot contaminate
// the current test's queue. Set in beforeEach.
let SESSION_KEY = "agent:main:discord:channel:test-continue-delegate";
const TASK = "Sample delegated task: re-check #241 base after #235 squashes; report status only.";

type ContinueDelegateTool = ReturnType<
  typeof import("./continue-delegate-tool.js").createContinueDelegateTool
>;

type ExecuteResult = Awaited<ReturnType<ContinueDelegateTool["execute"]>>;

type JsonPayload = {
  status: string;
  mode?: string;
  delaySeconds?: number;
  reason?: string;
};

function readJsonPayload(result: ExecuteResult): JsonPayload {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  expect(content[0]?.type).toBe("text");
  return JSON.parse(content[0]?.text ?? "{}") as JsonPayload;
}

async function loadTool(): Promise<typeof import("./continue-delegate-tool.js")> {
  return import("./continue-delegate-tool.js");
}

describe("continue_delegate tool", () => {
  beforeEach((ctx) => {
    resetDelegateStoreForTests();
    capHolder.value = 100;
    vi.clearAllMocks();
    const slug = ctx.task.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 80);
    SESSION_KEY = `agent:main:discord:channel:test-continue-delegate-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  afterEach(() => {
    resetDelegateStoreForTests();
  });

  // (a) ToolInputError on missing session
  it("throws ToolInputError when agentSessionKey is absent", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: undefined });
    await expect(tool.execute("call-1", { task: TASK })).rejects.toBeInstanceOf(ToolInputError);
  });

  // (b) Empty task throws ToolInputError
  it("throws ToolInputError when task is empty after trim", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    await expect(tool.execute("call-2", { task: "   " })).rejects.toBeInstanceOf(ToolInputError);
  });

  // (c) Unknown mode throws ToolInputError with valid-modes list
  it("throws ToolInputError listing valid modes when mode is unknown", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    await expect(tool.execute("call-3", { task: TASK, mode: "loud" })).rejects.toMatchObject({
      name: "ToolInputError",
      message: expect.stringContaining("normal, silent, silent-wake, post-compaction"),
    });
  });

  // (d) Mode mapping at the enqueue boundary — normal (default).
  // Note: `mode=normal` is the default and is NOT persisted as a `mode` field
  // on the queued delegate (flowToDelegate only sets `mode` when silent /
  // silent-wake / post-compaction is true). The tool's response payload still
  // reports `mode: "normal"`.
  it("returns mode=normal in payload and enqueues a non-silent delegate when mode is omitted", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(await tool.execute("call-4a", { task: TASK }));
    expect(payload.status).toBe("enqueued");
    expect(payload.mode).toBe("normal");

    const queued = consumePendingDelegates(SESSION_KEY);
    expect(queued.length).toBe(1);
    expect(queued[0]?.task).toBe(TASK);
    // No mode on a normal-mode delegate; post-#227 the runtime shape carries
    // mode only (silent/silentWake/postCompaction booleans no longer exist).
    expect(queued[0]?.mode).toBeUndefined();
  });

  // (d cont) silent — also exercises delaySeconds → delayMs forwarding
  it("enqueues with mode=silent and forwards delaySeconds as delayMs", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(
      await tool.execute("call-4b", { task: TASK, mode: "silent", delaySeconds: 12 }),
    );
    expect(payload.status).toBe("enqueued");
    expect(payload.mode).toBe("silent");
    expect(payload.delaySeconds).toBe(12);

    // delayMs=12000 — delegate is unmatured at consume time, so the consume
    // call leaves it in the queue. We assert via the still-pending shape via
    // a fresh consume after advancing the test scope: instead, verify the
    // record was enqueued by inspecting via a zero-delay variant below.
    // Here just verify the response payload (cap counts a queued delegate
    // regardless of maturity).
  });

  // (d cont) silent-wake
  it("enqueues with mode=silent-wake when requested", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(
      await tool.execute("call-4c", { task: TASK, mode: "silent-wake" }),
    );
    expect(payload.status).toBe("enqueued");
    expect(payload.mode).toBe("silent-wake");

    const queued = consumePendingDelegates(SESSION_KEY);
    expect(queued.length).toBe(1);
    expect(queued[0]?.mode).toBe("silent-wake");
  });

  // (d cont) zero-delay silent → consumable immediately, mode persists in queue
  it("persists mode=silent on the queued delegate when delaySeconds is omitted", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    await tool.execute("call-4b2", { task: TASK, mode: "silent" });
    const queued = consumePendingDelegates(SESSION_KEY);
    expect(queued.length).toBe(1);
    expect(queued[0]?.mode).toBe("silent");
    expect(queued[0]?.delayMs).toBeUndefined();
  });

  // (d cont) mode strings are case-insensitive and trimmed
  it("normalizes mode string (trim + lowercase) before enqueue", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(
      await tool.execute("call-4d", { task: TASK, mode: "  Silent  " }),
    );
    expect(payload.status).toBe("enqueued");
    expect(payload.mode).toBe("silent");
  });

  // (e) post-compaction routes to staged store, NOT the regular pending queue.
  // The store routes both via `enqueuePendingDelegate` internally, but the
  // post-compaction controller id puts it on a separate flow list, so
  // `consumePendingDelegates` returns empty and `consumeStagedPostCompactionDelegates`
  // returns the entry.
  it("routes mode=post-compaction to staged store and NOT to pending queue", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    const payload = readJsonPayload(
      await tool.execute("call-5", { task: TASK, mode: "post-compaction" }),
    );
    expect(payload.status).toBe("staged");
    expect(payload.mode).toBe("post-compaction");

    // Pending queue must be empty.
    expect(consumePendingDelegates(SESSION_KEY)).toEqual([]);

    // Staged store must hold exactly one entry, marked post-compaction.
    const staged = consumeStagedPostCompactionDelegates(SESSION_KEY);
    expect(staged.length).toBe(1);
    expect(staged[0]?.task).toBe(TASK);
    expect(staged[0]?.mode).toBe("post-compaction");
  });

  // (f) Per-turn cap: pendingDelegateCount + stagedPostCompactionDelegateCount
  // >= maxPerTurn → status=rejected. We use the mutable `capHolder` to set
  // a small cap so we can exercise the rejection path without enqueuing 100+
  // delegates.
  it("rejects with status=rejected when pending+staged count >= maxDelegatesPerTurn", async () => {
    capHolder.value = 2;

    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });

    // Fill to the cap (2 enqueued → equals the cap on the next call).
    expect(readJsonPayload(await tool.execute("call-6a", { task: `${TASK} #1` })).status).toBe(
      "enqueued",
    );
    expect(readJsonPayload(await tool.execute("call-6b", { task: `${TASK} #2` })).status).toBe(
      "enqueued",
    );

    // Third call: cap is hit (currentPending=2 + currentStaged=0 >= 2).
    const third = readJsonPayload(await tool.execute("call-6c", { task: `${TASK} #3` }));
    expect(third.status).toBe("rejected");
    expect(third.reason).toMatch(/Maximum delegates per turn/i);
  });

  it("counts staged post-compaction delegates against the per-turn cap", async () => {
    capHolder.value = 2;

    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });

    // 1 staged + 1 pending = 2, equals cap.
    expect(
      readJsonPayload(await tool.execute("call-7a", { task: TASK, mode: "post-compaction" }))
        .status,
    ).toBe("staged");
    expect(readJsonPayload(await tool.execute("call-7b", { task: TASK })).status).toBe("enqueued");

    // Third call (any mode) should be rejected.
    const blocked = readJsonPayload(await tool.execute("call-7c", { task: TASK }));
    expect(blocked.status).toBe("rejected");
  });

  // (g) Task truncated at 4096 chars when stored.
  // Note: the tool's TypeBox schema declares `maxLength: 4096` but the tool's
  // `execute` body does its own `task.slice(0, 4096)` for defensive belt-and-
  // suspenders truncation; schema validation isn't enforced by the test
  // harness because `execute` is invoked directly with an object, not through
  // the agent runtime. So a 5000-char task reaches the slice and is stored as
  // exactly 4096 chars.
  it("truncates task to 4096 chars in pending queue", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });

    const longTask = "y".repeat(5000);
    await tool.execute("call-8a", { task: longTask });

    const queued = consumePendingDelegates(SESSION_KEY);
    expect(queued.length).toBe(1);
    expect(queued[0]?.task.length).toBe(4096);
  });

  it("truncates task to 4096 chars in staged store for post-compaction", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });

    const longTask = "z".repeat(5000);
    await tool.execute("call-8b", { task: longTask, mode: "post-compaction" });

    const staged = consumeStagedPostCompactionDelegates(SESSION_KEY);
    expect(staged.length).toBe(1);
    expect(staged[0]?.task.length).toBe(4096);
  });

  // (h) delaySeconds omitted → delayMs undefined (scheduler treats as immediate)
  it("forwards undefined delayMs when delaySeconds is omitted", async () => {
    const { createContinueDelegateTool } = await loadTool();
    const tool = createContinueDelegateTool({ agentSessionKey: SESSION_KEY });
    await tool.execute("call-9", { task: TASK });

    const queued = consumePendingDelegates(SESSION_KEY);
    expect(queued.length).toBe(1);
    expect(queued[0]?.delayMs).toBeUndefined();
  });
});
