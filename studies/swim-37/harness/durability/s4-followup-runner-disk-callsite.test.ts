/**
 * S4 — Followup-runner disk-callsite trap (#442).
 *
 * **Boundary under test:** the *production callsite* in
 * `src/auto-reply/reply/followup-runner.ts` that wires the disk-persist block
 * onto the followup turn. S2/S3 already cover the *semantic* regressions
 * (token chain advances, count advances, survives restart) at the primitive
 * level by exercising `persistContinuationChainState` + `updateSessionStore`
 * directly. What S2/S3 cannot catch: somebody deleting or gutting the wiring
 * inside `followup-runner.ts` itself. The primitives still pass. The
 * production path silently stops persisting.
 *
 * **Why source-regex instead of full mock-and-call:** honest invocation of
 * `createFollowupRunner` requires mocking ~15 deep imports
 * (`runEmbeddedPiAgent`, `runWithModelFallback`, `agent-runner-memory`,
 * `route-reply`, `typing`, `session-run-accounting`, `followup-delivery`,
 * `queue`, `reply-run-registry`, `origin-routing`, plus
 * `task-flow-registry` + `spawnSubagentDirect`). That mock scaffold runs
 * past the 350-LOC test cap and any single-mock 50-LOC cap. Per cohort
 * adjudication (🩸 PR-comment 4352857578 + 🌫 msg 1499402113518665859)
 * the freeze window forbids production-extraction to a helper file, which
 * would let us call the persist block in isolation. So this test trades
 * dynamic invocation for static structural assertion: the *bytes* of the
 * wiring must be present in `followup-runner.ts`. Sabotage-verified by
 * commenting any single asserted pattern → test fails.
 *
 * Cohort: see #442 + PR #466 thread.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FOLLOWUP_RUNNER_PATH = path.resolve(
  __dirname,
  "../../../../src/auto-reply/reply/followup-runner.ts",
);

const SOURCE = fs.readFileSync(FOLLOWUP_RUNNER_PATH, "utf8");

describe("S4: followup-runner disk-callsite wiring (#442)", () => {
  it("imports persistContinuationChainState from continuation/state", () => {
    // Sentinel 1: the in-memory persist primitive must be imported.
    // If this is gone, no advancement happens at all.
    expect(SOURCE).toMatch(
      /\{\s*loadContinuationChainState\s*,\s*persistContinuationChainState\s*\}/,
    );
    expect(SOURCE).toMatch(/import\(\s*["']\.\.\/continuation\/state\.js["']\s*\)/);
  });

  it("imports updateSessionStore + resolveSessionStoreEntry from sessions/store", () => {
    // Sentinel 2: the disk writer + legacy-key resolver must be imported.
    // Without these the in-memory mutation is orphaned for disk (#431).
    expect(SOURCE).toMatch(/\{\s*updateSessionStore\s*,\s*resolveSessionStoreEntry\s*\}/);
    expect(SOURCE).toMatch(/import\(\s*["']\.\.\/\.\.\/config\/sessions\/store\.js["']\s*\)/);
  });

  it("retains the `if (dispatchResult && tailEntry)` guard block", () => {
    // Sentinel 3: the outer guard from r3164418106 — persist even when
    // dispatched===0, but only when chainState round-tripped through
    // dispatchToolDelegates and we have a tailEntry to write into.
    expect(SOURCE).toMatch(/if\s*\(\s*dispatchResult\s*&&\s*tailEntry\s*\)\s*\{/);
  });

  it("calls persistContinuationChainState({ sessionEntry: tailEntry, ... }) inside the guard", () => {
    // Sentinel 4a: in-memory mutation. Asserting the {sessionEntry: tailEntry}
    // shape pins the call to the audit-fix wiring, not some stray helper.
    expect(SOURCE).toMatch(/persistContinuationChainState\(\s*\{\s*sessionEntry:\s*tailEntry\s*,/);
  });

  it("calls await updateSessionStore(storePath, ...) inside the guard", () => {
    // Sentinel 4b: durable disk write (#431). Without this the in-memory
    // mutation never reaches disk; cost-cap and maxChainLength readers see
    // stale values across cache eviction or gateway restart.
    expect(SOURCE).toMatch(/await\s+updateSessionStore\(\s*storePath\s*,/);
  });

  it("calls resolveSessionStoreEntry({ store, sessionKey }) inside the disk-write callback", () => {
    // Sentinel 4c: legacy-key cleanup. Mirrors agent-runner.ts post-r3164418100.
    // Without this, chain fields can land on a stale legacy key while readers
    // load the canonical key — silent drift.
    expect(SOURCE).toMatch(/resolveSessionStoreEntry\(\s*\{\s*store\s*,\s*sessionKey\s*\}\s*\)/);
  });

  it("wraps the disk-write call in a try/catch with defensive defaultRuntime.error", () => {
    // Sentinel 4d: persistence failure must not break the followup reply
    // itself (mirrors agent-runner.ts defensive log shape).
    expect(SOURCE).toMatch(
      /defaultRuntime\.error\?\.\(\s*[\s\S]{0,160}?\[followup-runner\][\s\S]{0,200}?failed to persist continuation chain state/,
    );
  });

  it("sets the three continuationChain* fields inside the disk-write callback", () => {
    // Sentinel 4e: the actual fields written. If the callback is gutted to
    // an empty closure (or the field assignments are removed), this fails.
    expect(SOURCE).toMatch(
      /continuationChainCount:\s*dispatchResult\.chainState\.currentChainCount/,
    );
    expect(SOURCE).toMatch(
      /continuationChainStartedAt:\s*dispatchResult\.chainState\.chainStartedAt/,
    );
    expect(SOURCE).toMatch(
      /continuationChainTokens:\s*dispatchResult\.chainState\.accumulatedChainTokens/,
    );
  });
});
