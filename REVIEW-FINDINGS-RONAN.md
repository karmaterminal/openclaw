## Correctness

### 1. Chain-hop counting is still path-dependent between parent/tool dispatch and announce-side chaining

- `src/auto-reply/reply/agent-runner.ts:1102` allows a new continuation when `currentChainCount === maxChainLength - 1`.
- `src/auto-reply/reply/agent-runner.ts:1163` and `src/auto-reply/reply/agent-runner.ts:1336` then stamp the spawned child with `[continuation:chain-hop:${nextChainCount}]`, so parent/tool-origin children can legitimately be created at hop `N = maxChainLength`.
- `src/agents/subagent-announce.ts:1351` computes `nextChainHop = childChainHop + 1`, but `src/agents/subagent-announce.ts:1399` rejects when `nextChainHop >= maxChainLength`.

That leaves the autonomous bracket-chain path one hop stricter than the parent/tool path. Example: with `maxChainLength = 2`, the parent/tool path can create a child tagged hop `2`, but a child tagged hop `1` cannot autonomously chain onward to hop `2` at the announce boundary.

The new test suite currently locks in that mismatch rather than catching it:

- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts:2292` treats `count = 2 = maxChainLength` as still allowed on the parent path.
- `src/agents/subagent-announce.chain-guard.test.ts:135` treats `nextChainHop = 10 = maxChainLength` as blocked on the announce path.

This conflicts with the work-order / findings expectation that `maxChainLength: 10` should allow 10 total delegates/shards and reject the 11th. The P0 fix is therefore not fully correct for bracket-origin autonomous chains.

### 2. `maxDelegatesPerTurn` still falls back to stale construction-time state instead of the canonical runtime default

- `src/agents/tools/continue-delegate-tool.ts:108` reads raw `loadConfig()` at execute time, but if the live config omits `maxDelegatesPerTurn` it falls back to `opts.maxDelegatesPerTurn`, then to `5`.
- `src/agents/openclaw-tools.ts:196` still passes a construction-time `maxDelegatesPerTurn` into the tool.
- `src/auto-reply/reply/continuation-runtime.ts:60` already exposes `resolveMaxDelegatesPerTurn()`, and `src/auto-reply/reply/agent-runner.ts:1267` uses that canonical live value only for secondary trimming after the tool has already accepted work.

Result: if the deployment removes the setting and intends to return to the default of `5`, the tool can still report extra delegates as `scheduled` based on stale construction-time state, and only the runner later rejects them. That means the P2 fix is partial: the actual dispatch cap is defended, but primary enforcement and user-visible tool behavior are still inconsistent with the single-authority default.

`src/agents/tools/continue-delegate-tool.test.ts:86` explicitly codifies this stale fallback behavior, so the current tests preserve the inconsistency instead of catching it.

## Regressions

- I did not confirm a non-continuation regression in the reviewed runtime paths.
- The main residual regression risk is hot-reload behavior outside the specific P1/P2 fixes: there is still no focused regression test proving that `generationGuardTolerance` changes between timer schedule and fire are honored for bracket-path delegates, tool-path delegates, and announce-side chain-hop timers.

## Cleanliness

### RFC is materially stale / internally contradictory

`docs/design/continue-work-signal-v2.md` still describes pre-fix behavior in several key places:

- It shows bracket-origin tasks as `[continuation] Delegated task ...` at `docs/design/continue-work-signal-v2.md:158` and `docs/design/continue-work-signal-v2.md:218`, but the code now stamps canonical `[continuation:chain-hop:N]` prefixes.
- It repeatedly describes `[continuation:delegate-pending]` system-event queue markers as the wake detector at `docs/design/continue-work-signal-v2.md:141`, `docs/design/continue-work-signal-v2.md:149`, `docs/design/continue-work-signal-v2.md:181`, `docs/design/continue-work-signal-v2.md:702`, and `docs/design/continue-work-signal-v2.md:1018`.
- The implementation now uses a dedicated in-memory flag map in `src/auto-reply/reply/agent-runner.ts:77` and structured `continuationTrigger` handling in `src/auto-reply/reply/get-reply-run.ts:250`.
- The RFC also documents the construction-time fallback chain for `maxDelegatesPerTurn` at `docs/design/continue-work-signal-v2.md:274`, which bakes the P2 inconsistency into the design doc.

This document should not be treated as implementation-accurate in its current form.

### Coordination artifacts are still in the PR diff

`git diff --name-only origin/main...HEAD` includes:

- `FINDINGS.md`
- `CODEWALK.md`
- `WORKORDER6-codex54.md`

These read as branch-local coordination notes, not upstream docs. They should be excluded from the upstream PR unless the goal is explicitly to publish the internal review trail.

## Recommendations

1. Unify the chain-hop contract before upstreaming. Either:
   - keep child hop numbers 1-based and change the announce-side guard so hop `N = maxChainLength` is allowed and only the next hop is rejected, or
   - change the initial child prefix semantics so all paths count from hop `0`.

2. Make primary `continue_delegate` enforcement use `resolveMaxDelegatesPerTurn()` directly, and stop passing `maxDelegatesPerTurn` into `createContinueDelegateTool()` as captured state.

3. Add one true P1 regression test that changes `generationGuardTolerance` after scheduling but before timer fire for:
   - bracket-path delayed delegate
   - tool-path delayed delegate
   - announce-side delayed chain hop

4. Rewrite or trim the RFC sections that still describe queue-marker wake detection and pre-canonical task prefixes.

## Verification

- Focused test run passed:
  - `./node_modules/.bin/vitest run src/agents/tools/continue-delegate-tool.test.ts src/agents/subagent-announce.chain-guard.test.ts src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts src/config/zod-schema.continuation.test.ts`
