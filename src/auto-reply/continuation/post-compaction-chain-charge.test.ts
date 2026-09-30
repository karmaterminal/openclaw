// "RFC §" references herein cite docs/design/continue-work-signal-v2.md (Agent Self-Elected Turn Continuation / CONTINUE_WORK).
/**
 * Real-store proof for the accepted post-compaction chain-charge marker.
 *
 * The queued-delivery suites inject this operation, so these tests run it
 * against the real continuation custody store to pin the two facts delivery
 * depends on: the marker write advances the record revision (acceptance must
 * commit against the new one), and a record that already carries an
 * `advanced` marker returns that same hop forever.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setRuntimeConfigSnapshot } from "../../config/config.js";
import { useContinuationCustodyTestState } from "./custody/custody.test-support.js";
import {
  claimStagedPostCompactionDelegates,
  releaseStagedPostCompactionDelegateToQueue,
  stagePostCompactionCustodyDelegate,
  toSessionPostCompactionDelegate,
} from "./delegate-store-post-compaction.js";
import { markPendingDelegateSpawnAccepted } from "./delegate-store.js";
import { reserveAcceptedPostCompactionChainHop } from "./post-compaction-chain-charge.js";
import type { ChainState } from "./types.js";

const SESSION_KEY = "channel:session-1198";

function plannedHop(count: number): ChainState {
  return {
    currentChainCount: count,
    chainStartedAt: 1_700_000_000_000,
    accumulatedChainTokens: 0,
    chainId: `chain-${count}`,
  };
}

useContinuationCustodyTestState();

async function claimOneStagedDelegate() {
  await stagePostCompactionCustodyDelegate(SESSION_KEY, {
    task: "carry working state",
    stagedAt: Date.now(),
    firstArmedAt: Date.now(),
  });
  const claimed = await claimStagedPostCompactionDelegates(SESSION_KEY);
  const delegate = claimed[0];
  if (!delegate?.flowId || delegate.expectedRevision === undefined) {
    throw new Error("expected a claimed post-compaction delegate");
  }
  return delegate;
}

beforeEach(() => {
  setRuntimeConfigSnapshot({
    tools: { sessions_spawn: { attachments: { enabled: true } } },
  });
});

describe("reserveAcceptedPostCompactionChainHop", () => {
  it("records the planned hop and returns the advanced revision acceptance must use", async () => {
    const delegate = await claimOneStagedDelegate();
    const claimedRevision = delegate.expectedRevision!;

    const reserved = await reserveAcceptedPostCompactionChainHop(delegate, plannedHop(3));

    expect(reserved.chainState).toMatchObject({ currentChainCount: 3, chainId: "chain-3" });
    expect(reserved.expectedRevision).toBe(claimedRevision + 1);
    // Acceptance commits against the post-marker revision; the stale claim
    // revision would be rejected by the revision fence.
    expect(
      await markPendingDelegateSpawnAccepted(
        { ...delegate, expectedRevision: reserved.expectedRevision },
        "agent:main:subagent:continuation-child",
      ),
    ).toBe(true);
  });

  it("returns the same hop on replay instead of advancing continuation depth again", async () => {
    const delegate = await claimOneStagedDelegate();

    const first = await reserveAcceptedPostCompactionChainHop(delegate, plannedHop(3));
    // A replayed delivery re-reads the row and plans the next hop from a session
    // entry that may already have been advanced; the marker wins.
    const replay = await reserveAcceptedPostCompactionChainHop(delegate, plannedHop(4));

    expect(replay.chainState).toEqual(first.chainState);
    expect(replay.chainState.currentChainCount).toBe(3);
    expect(replay.expectedRevision).toBe(first.expectedRevision);
  });

  it("retains metadata decoding after an attachment-bearing durable handoff", async () => {
    await stagePostCompactionCustodyDelegate(SESSION_KEY, {
      task: "carry private working state",
      stagedAt: Date.now(),
      firstArmedAt: Date.now(),
      attachments: [{ name: "state.md", content: "private compacted state" }],
      attachAs: { mountPath: "handoff" },
    });
    const delegate = (await claimStagedPostCompactionDelegates(SESSION_KEY))[0];
    if (!delegate?.flowId || delegate.expectedRevision === undefined) {
      throw new Error("expected an attachment-bearing post-compaction delegate");
    }
    // The release commits the queue entry and the permanent handoff together.
    expect(
      await releaseStagedPostCompactionDelegateToQueue({
        sessionKey: SESSION_KEY,
        delegate: toSessionPostCompactionDelegate(delegate),
        sequence: 0,
      }),
    ).toMatchObject({ released: true });

    const reserved = await reserveAcceptedPostCompactionChainHop(delegate, plannedHop(3));

    expect(reserved.expectedRevision).toBe(delegate.expectedRevision + 2);
    expect(
      await markPendingDelegateSpawnAccepted(
        { ...delegate, expectedRevision: reserved.expectedRevision },
        "agent:main:subagent:attachment-child",
      ),
    ).toBe(true);
    expect(
      (await reserveAcceptedPostCompactionChainHop(delegate, plannedHop(4))).chainState,
    ).toEqual(plannedHop(3));
  });

  it("passes the planned hop straight through when the entry has no source record", async () => {
    const reserved = await reserveAcceptedPostCompactionChainHop(
      { task: "sourceless queued delegate" },
      plannedHop(1),
    );

    expect(reserved.chainState).toMatchObject({ currentChainCount: 1 });
    expect(reserved.expectedRevision).toBeUndefined();
  });
});
