# PASS

Candidate `3f2e539d5dbd7dc3788589ea2216d3f86eb751d1` correctly repairs karmaterminal/openclaw#1308 against base `b3a572cd3ea0082679669baa80f0679332643cf8`. No blocking findings.

Production LOC: +5/-1 (net +4) | Tests: +0/-0

## Named refs

| Category | Named ref | Full SHA | Identity |
|---|---|---|---|
| Product/base ref | candidate `3f2e539d5d`; base `b3a572cd3e` | candidate `3f2e539d5dbd7dc3788589ea2216d3f86eb751d1`; base `b3a572cd3ea0082679669baa80f0679332643cf8` | Exact local commit objects; remote named-ref equality N/A |
| Safe lane branch ref | `codeagent/review-1308-locked-model` | `3f2e539d5dbd7dc3788589ea2216d3f86eb751d1` | Local = tracking = server before evidence |
| CI/workflow ref | N/A | N/A | No Actions authorized or run |
| Presentation ref | N/A | N/A | Not applicable |
| Docs/proof ref | N/A | N/A | This report is carried on the safe lane branch |

## Verdict

**Invariant and owner:** `resolveEmbeddedRunModelSetup` owns the pre-materialization decision. An admission-less native harness pin must use a structural runtime model and skip `resolveTieredModel`/`resolveModelAsync`; admitted persisted model chats and OpenClaw-owned transport must continue concrete route resolution.

The candidate adds that distinction at `src/agents/embedded-agent-runner/run/model-setup.ts:194`. The bypass requires all of:

- no durable `sessionAdmission`;
- `resolveSessionPinnedHarnessId(runParams)` matching the selected harness;
- plugin-owned transport.

`resolveSessionPinnedHarnessId` itself requires `modelSelectionLocked === true` and no plugin catalog owner at `src/sessions/agent-harness-session-key.ts:75-79`. Therefore unlocked selections and persisted plugin-owned model locks remain on concrete route materialization. The independent autoreview's P1 request for another explicit lock predicate was rejected as a verified false positive because that predicate is already enforced by the canonical resolver.

**Best-fix verdict:** best. The decision occurs immediately before `resolveTieredModel`, the first boundary that would incorrectly materialize the prepared route. Moving the exception into auth-plan preparation would be too late. Adding a second `modelSelectionLocked` check would duplicate the canonical pin contract without changing behavior.

## Regression and sibling proof

The deterministic negative control ran on exact base `b3a572cd3ea0082679669baa80f0679332643cf8`:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast-isolated.config.ts --maxWorkers=1 src/agents/embedded-agent-runner/run.continuation-integration.test.ts -t 'keeps a session-pinned native model out of prepared-route materialization'
```

It failed for the expected reason: `mockedResolveModelAsync` was called twice despite `expect(...).not.toHaveBeenCalled()`.

The identical command on exact candidate `3f2e539d5dbd7dc3788589ea2216d3f86eb751d1` passed: 1 passed, 52 skipped.

Candidate sibling coverage:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast-isolated.config.ts --maxWorkers=1 src/agents/embedded-agent-runner/run.continuation-integration.test.ts
# 53 passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-embedded-agent-run.config.ts --maxWorkers=1 src/agents/embedded-agent-runner/run/model-setup.ownership.test.ts
# 12 passed
```

The ownership suite preserves the alternate admitted path: concrete locked model resolution, plugin/catalog ownership across usage writes and subsequent turns, native/host auth ownership, missing ownership failure, stream-parameter rejection, harness replacement rejection, and lifecycle-generation replacement rejection. No schema or persistent representation changes occur. Reverting the candidate restores the exact base failure; restart/recovery state remains owned by existing session admission and lifecycle checks.

## Dependency contract and code read

Direct Codex source inspection used `openai/codex` fork checkout SHA `400ee190c30d5e4a88549c070a2335311f0baa91`. `../codex/codex-rs/app-server-protocol/src/protocol/v2/thread.rs:324-349` defines resumed-thread model/provider overrides; `../codex/codex-rs/app-server/src/request_processors/thread_processor.rs:29-52` detects mismatches against an active thread; `../codex/codex-rs/app-server/src/request_processors/thread_processor.rs:3082-3199` applies overrides when constructing a cold resumed thread; and `../codex/codex-rs/app-server/src/request_processors/thread_processor.rs:3434-3542` preserves the loaded thread when overrides cannot safely replace it. This supports keeping a native continuation's selected model with the native harness rather than rematerializing an outer OpenClaw route.

OpenClaw code read: `src/agents/embedded-agent-runner/run/model-setup.ts`, `src/agents/embedded-agent-runner/run/runtime-preparation.ts`, `src/agents/embedded-agent-runner/run/model-harness.ts`, `src/agents/embedded-agent-runner/run/setup.ts`, `src/agents/harness/selection.ts`, `src/sessions/agent-harness-session-key.ts`, `src/agents/command/attempt-execution.ts`, the continuation composition test, and the model-ownership suite.

**Provenance:** exact base behavior is proven failing and the candidate is its direct successor. Introduction before the pinned base was not attributed in this bounded review.

**Acceptance path:** focused-only. No Actions, integration, presentation, or deployment was run. Initial attempts using an incorrect shard and a stale inherited dependency tree were discarded and not credited; all receipts above used the repository runner with one worker from a separate same-host normal clone installed at the exact unchanged manifest/lock SHA.
