# Independent review: karmaterminal/openclaw#1310 v2

**Verdict: PASS**

Candidate `617ddddc62dcfcb116959786743c7bdbd33b1d80` is the correct, minimal test-owner repair over accepted assembly `1517ba1a0e30b4ea39b1c4d7db8ba9540cf937e0`. It restores the owned announce drain/parity/commit/rejection-observation paths to their existing exactly-once `spawnSubagentDirect` assertions by seeding canonical persisted child-session owners. It does not alter production code, call-count assertions, timeout budgets, skips, or accepted #1275/#1276/#1280 surfaces.

## Named refs

| Category | Named ref | Full SHA | Local / tracking / server |
|---|---|---|---|
| Product candidate | `origin/codeagent/fix-1310-announce-drain-v2` | `617ddddc62dcfcb116959786743c7bdbd33b1d80` | equal / equal / equal |
| Product base | `origin/codeagent/accepted-1275-1276-1280-assembly` | `1517ba1a0e30b4ea39b1c4d7db8ba9540cf937e0` | equal / equal / equal |
| Safe review lane | `origin/codeagent/review-1310-announce-drain-v2` | `617ddddc62dcfcb116959786743c7bdbd33b1d80` at evidence start | equal / equal / equal |
| CI/workflow ref | N/A | N/A | No Actions permitted or used |
| Presentation ref | N/A | N/A | Not applicable |
| Docs/proof ref | N/A | N/A | This report is the only requested lane artifact |

## Review evidence

- **Invariant and owner boundary:** `registerContinuationDelegateDispatchClaim` must load a current persisted source-session owner before it grants spawn admission (`src/auto-reply/continuation/delegate-spawn-authority.ts:26`, `src/agents/subagent-announce.continuation.runtime.ts:506`). The rejected fixtures mocked legacy/session-chain reads but had no row in the authoritative accessor store, so dispatch stopped before `spawnSubagentDirect` (`src/agents/subagent-announce.continuation.runtime.ts:566`).
- **Canonical repair:** each affected suite now creates isolated state, writes the child owner through `replaceSessionEntry`, and removes the state after the suite case (`src/agents/subagent-announce.continuation-drain.test.ts:321`, `src/agents/subagent-announce.continuation-parity-gate.test.ts:162`, `src/agents/subagent-announce.continuation-tool-delegate-commit.test.ts:143`, `src/agents/subagent-announce.spawn-reject-obs.test.ts:152`). The three mocked-store drain suites retain the real `loadSessionEntry` export and only replace `updateSessionEntry`, so the production owner-loader remains exercised.
- **Exact negative control:** on `1517ba1a0e30b4ea39b1c4d7db8ba9540cf937e0`, the six changed suites produced **22 expected failures / 21 passes**. Every failure was the missing owner consequence: spawn/dispatch/rollback assertions observed zero calls.
- **Exact positive control:** on `617ddddc62dcfcb116959786743c7bdbd33b1d80`, the same six suites passed **43/43**.
- **Partial-failure and alternate paths:** the passing owner tests retain cancellation fencing, rejected/accepted sibling dispatch, stale source-acceptance rollback, durable delayed hedges, failed/no-op persistence, post-compaction staging, rejection diagnostics, and restart-survival coverage.
- **Assertions/timeouts:** diff audit found no modified `spawnSubagentDirect` call-count assertion, no timeout increase, and no skip/todo addition. Candidate delta is test-only: **+176/-29 across 6 files**; production **+0/-0**.
- **Accepted behavior:** candidate and base are byte-identical under `src/auto-reply/**`, `src/gateway/**`, the announce production owner, and `src/agents/subagent-announce.crosssession-gate.test.ts`. #1275 continuation siblings passed **60 tests** (plus one unrelated pre-existing TODO). #1276 ACP/runtime timeout siblings passed **227/227**, including ordinary and suppressed timeout classification exactly once. #1280’s formerly slow accepted-WORK and cross-session case 7 tests passed in **6.110s** and **5.957s**, respectively, with the 120-second budget unchanged.
- **Independent review:** repository `$autoreview`, branch mode against the accepted assembly, P2 threshold: `scoped-clean`, patch correct with 0.91 confidence, no actionable findings.

## Commands and receipts

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1 \
  <six changed announce test files>
# base: 6 files failed; 22 failed | 21 passed
# candidate: 6 files passed; 43 passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-core.config.ts --maxWorkers=1 \
  <66 includePatterns from createNodeTestShards().find(shardName == agentic-agents-core-subagents)>
# 55 files passed; 1008 tests passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.auto-reply-reply.config.ts --maxWorkers=1 \
  <11 tracked continuation sibling files>
# 10 files passed; 60 passed | 1 pre-existing todo

node scripts/run-vitest.mjs run --config test/vitest/vitest.gateway-server.config.ts --maxWorkers=1 \
  src/gateway/server.chat.acp-completion.test.ts src/gateway/server-chat.agent-events.test.ts
# 2 files passed; 227 tests passed
```

The first linked-worktree launch failed before collection because the prior shared dependency tree was stale. Per worktree policy, no install ran in a worktree: dependencies were installed once in a same-host normal clone at the exact candidate/base manifest and lock hashes, and all credited controls above ran successfully there. Acceptance path: **focused-only**; no Actions, Mode-B, Gate 3g, PR, integration, presentation, or deployment was run.
