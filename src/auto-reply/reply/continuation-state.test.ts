import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addDelayedContinuationReservation,
  cancelPendingDelegates,
  clearDelayedContinuationReservations,
  enqueuePendingDelegate,
  stagePostCompactionDelegate,
} from "../continuation-delegate-store.js";
import { hasDelegatePending, setDelegatePending } from "./continuation-state.js";

const sessionKey = "continuation-state-test-session";

beforeEach(() => {
  cancelPendingDelegates(sessionKey);
  clearDelayedContinuationReservations(sessionKey);
});

afterEach(() => {
  cancelPendingDelegates(sessionKey);
  clearDelayedContinuationReservations(sessionKey);
});

describe("reply continuation state", () => {
  it("derives delegate pending state from TaskFlow and timer reservations", () => {
    expect(hasDelegatePending(sessionKey)).toBe(false);

    setDelegatePending(sessionKey);
    expect(hasDelegatePending(sessionKey)).toBe(false);

    enqueuePendingDelegate(sessionKey, { task: "queued delegate" });
    expect(hasDelegatePending(sessionKey)).toBe(true);
    cancelPendingDelegates(sessionKey);
    expect(hasDelegatePending(sessionKey)).toBe(false);

    stagePostCompactionDelegate(sessionKey, {
      task: "post-compaction delegate",
      createdAt: Date.now(),
    });
    expect(hasDelegatePending(sessionKey)).toBe(true);
    cancelPendingDelegates(sessionKey);
    expect(hasDelegatePending(sessionKey)).toBe(false);

    addDelayedContinuationReservation(sessionKey, {
      id: "timer-reservation",
      source: "tool",
      task: "timer delegate",
      createdAt: Date.now(),
      fireAt: Date.now() + 60_000,
      plannedHop: 1,
    });
    expect(hasDelegatePending(sessionKey)).toBe(true);
    clearDelayedContinuationReservations(sessionKey);
    expect(hasDelegatePending(sessionKey)).toBe(false);
  });
});

describe("continuation volatile-map guard", () => {
  async function collectProdContinuationFiles(): Promise<string[]> {
    const continuationDir = path.join(process.cwd(), "src/auto-reply/continuation");
    const continuationEntries = await fs.readdir(continuationDir, { withFileTypes: true });
    const continuationFiles = continuationEntries
      .filter(
        (entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"),
      )
      .map((entry) => path.posix.join("src/auto-reply/continuation", entry.name));
    const replyDir = path.join(process.cwd(), "src/auto-reply/reply");
    const replyEntries = await fs.readdir(replyDir, { withFileTypes: true });
    const replyContinuationFiles = replyEntries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith("continuation") &&
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts"),
      )
      .map((entry) => path.posix.join("src/auto-reply/reply", entry.name));
    return [...continuationFiles, ...replyContinuationFiles].toSorted();
  }

  const allowedSessionKeyedMaps = new Map<string, Set<string>>([
    ["src/auto-reply/continuation/delegate-dispatch.ts", new Set(["hedgeTimers"])],
    ["src/auto-reply/continuation/delegate-store.ts", new Set(["delayedReservations"])],
    [
      "src/auto-reply/continuation/state.ts",
      new Set(["continuationTimerHandles", "continuationTimerRefs"]),
    ],
    ["src/auto-reply/continuation/context-pressure.ts", new Set(["lastFiredBand"])],
    [
      "src/auto-reply/reply/continuation-state.ts",
      new Set(["continuationGenerations", "continuationTimerRefs", "continuationTimerHandles"]),
    ],
  ]);

  it("allowlists every session-keyed volatile Map in continuation code", async () => {
    const unexpected: string[] = [];
    const mapDeclarationPattern = /\b(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*new Map<string\s*,/g;

    for (const relativePath of await collectProdContinuationFiles()) {
      const allowedNames = allowedSessionKeyedMaps.get(relativePath) ?? new Set<string>();
      const source = await fs.readFile(path.join(process.cwd(), relativePath), "utf8");
      for (const match of source.matchAll(mapDeclarationPattern)) {
        const name = match[1];
        if (!allowedNames.has(name)) {
          unexpected.push(`${relativePath}:${name}`);
        }
      }
    }

    expect(unexpected).toEqual([]);
  });
});
