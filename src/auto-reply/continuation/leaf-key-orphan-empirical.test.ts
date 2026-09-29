/**
 * Proves post-compaction delegates are strictly session-keyed. A one-shot leaf
 * that never compacts strands a leaf-keyed delegate, while staging under the
 * long-lived parent keeps the delegate consumable.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  stagePostCompactionDelegate,
  consumeStagedPostCompactionDelegates,
  stagedPostCompactionDelegateCount,
} from "../continuation/delegate-store-post-compaction.js";
import { useContinuationCustodyTestState } from "./custody/custody.test-support.js";

useContinuationCustodyTestState();

describe("leaf-key post-compaction staging", async () => {
  const leafKey = "leaf-session::oneshot-deny-tools";
  const parentKey = "parent-session::live-requester";

  beforeEach(async () => {
    await consumeStagedPostCompactionDelegates(leafKey);
    await consumeStagedPostCompactionDelegates(parentKey);
  });

  it("keeps a leaf-keyed delegate invisible to the parent's consume", async () => {
    await stagePostCompactionDelegate(leafKey, {
      task: "leaf-keyed delegate",
      createdAt: 1_700_000_000_000,
    });
    expect(stagedPostCompactionDelegateCount(leafKey)).toBe(1);

    expect(stagedPostCompactionDelegateCount(parentKey)).toBe(0);
    const parentConsumed = await consumeStagedPostCompactionDelegates(parentKey);
    expect(parentConsumed).toHaveLength(0);

    expect(stagedPostCompactionDelegateCount(leafKey)).toBe(1);
  });

  it("strands a leaf-keyed delegate when the leaf never compacts", async () => {
    await stagePostCompactionDelegate(leafKey, {
      task: "leaf-keyed delegate",
      createdAt: 1_700_000_000_000,
    });
    expect(stagedPostCompactionDelegateCount(leafKey)).toBe(1);

    // No leaf-key consume occurs before the one-shot leaf is removed.
    expect(stagedPostCompactionDelegateCount(leafKey)).toBe(1);
    expect(stagedPostCompactionDelegateCount(parentKey)).toBe(0);

    await stagePostCompactionDelegate(parentKey, {
      task: "parent-keyed delegate",
      createdAt: 1_700_000_000_000,
    });
    const parentFired = await consumeStagedPostCompactionDelegates(parentKey);
    expect(parentFired).toHaveLength(1);
    expect(parentFired[0]).toMatchObject({
      task: "parent-keyed delegate",
    });

    expect(stagedPostCompactionDelegateCount(leafKey)).toBe(1);
  });

  it("no migration: deleting/cleaning the leaf lane does NOT move its delegate to the parent", async () => {
    await stagePostCompactionDelegate(leafKey, {
      task: "leaf-keyed delegate",
      createdAt: 1_700_000_000_000,
    });
    // The parent stays empty unless the delegate is explicitly staged there.
    expect(stagedPostCompactionDelegateCount(parentKey)).toBe(0);

    await consumeStagedPostCompactionDelegates(leafKey);
    expect(stagedPostCompactionDelegateCount(parentKey)).toBe(0);
  });
});
