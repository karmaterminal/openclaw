# #1172 divergence-minimization audit

Status: byte/authorship and full owner-boundary reads complete; GitNexus graph evidence pending.

## Executive recommendation

Do not split the former 71-file set. The removed LOC ratchet eliminates the only
size-only reason for that work, and the largest shared runners cannot be divided
without moving upstream-owned ordering and error semantics into fork-only files.

Two bounded overlay extractions remain candidates pending GitNexus proof:

1. move continuation parsing/stripping out of the upstream-owned
   `src/auto-reply/tokens.ts` and into the existing feature-owned
   `src/auto-reply/continuation/signal.ts`;
2. move the three request-compaction completion/release functions out of
   `src/auto-reply/reply/agent-runner-execution.ts` and into the existing live
   feature-owned `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`.

No implementation should run on the current candidate. Any qualified extraction
must follow absorption of frozen upstream `35fb5ee81ac6d0caedf624171d755957b8911543`
and a fresh exact-SHA recheck.

## Exact comparison set

| Role                  | SHA                                        |
| --------------------- | ------------------------------------------ |
| Feature/fix parent    | `0305546aa97247d344c92f3527022dccb0842b25` |
| Absorbed upstream     | `d9623bd46f3de8bfcc4045859dddf2bbc2865507` |
| Candidate/audit base  | `69a8d2beeafa39b4cbea45303e9dd695cfdc8a65` |
| Frozen newer upstream | `35fb5ee81ac6d0caedf624171d755957b8911543` |
| LOC-ratchet removal   | `3375e30d9c467e51550a67451367579215015b71` |

HEAD was clean and exact at `69a8d2beeafa39b4cbea45303e9dd695cfdc8a65`. Both `origin` and `upstream` were fetched without changing HEAD. All immutable workorder SHAs resolve as commits.

## Phase 0 instruction notes

The required path `.github/copilot-instructions.md` is absent at the candidate, absorbed-upstream, feature-parent, and frozen-newer-upstream SHAs. The tracked repository instruction is `.github/instructions/copilot.instructions.md`; it was read, but it is not presented as an exact-path substitute.

`pnpm docs:list` attempted linked-worktree dependency reconciliation and stopped with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. No module purge or install was allowed. Its declared underlying command, `node scripts/docs-list.js`, completed for documentation routing.

## Blocker inversion

Commit `3375e30d9c467e51550a67451367579215015b71` is `chore(ci): remove TypeScript LOC ratchet (#106096)`. Exact inspection shows:

- `check:loc` and `check:loc:update` removed from `package.json`;
- `scripts/check-ts-max-loc.ts` deleted;
- `scripts/ts-max-loc-baseline-v2.json` deleted.

The candidate still contains the earlier accounting artifacts because it predates absorption of that removal. They are historical diagnostics, not a current upstream topology requirement.

## Inventory and authorship method

The historical command exits 1 with exactly 71 rows: 63 `grew` and 8 `baseline-missing`. Ownership is based on byte comparison, not on “changed in the feature diff” or commit-label inference:

1. `git cat-file -e d9623bd46f3:<path>` proves whether the upstream path exists.
2. `git diff --unified=0 d9623bd46f3..69a8d2beeaf -- <path>` isolates the net feature-side overlay after the upstream absorb and identifies its hunk symbols.
3. `git diff --unified=0 d9623bd46f3..35fb5ee81ac6 -- <path>` identifies frozen-upstream work in the same named symbol or neighboring content.
4. The read-only `git merge-tree --write-tree 69a8d2beeaf 35fb5ee81ac6` identifies actual textual conflict.

The ratchet's eight `baseline-missing` rows are not eight new paths. `src/auto-reply/tokens.ts` already exists at `d9623bd46f3` with 332 physical lines; it is class A. Seven paths are truly absent at both upstream comparison SHAs and are provisionally class B.

Current counts are A=62, B=7, C=0, D=2. No file qualifies as class C:
newer upstream changes several shared hosts, but it does not introduce a new
implementation of a #1172-owned continuation module or responsibility. In
particular, upstream's canonical `src/agents/tool-loop-detection.ts` predates
the absorbed-upstream SHA; the repeated-error breaker added inside
`packages/agent-core/src/agent-loop.ts` is therefore class-A overlay against an
already-existing sibling owner, not a newer-upstream class-C shape.

## Frozen drift proof

`git rev-list --count d9623bd46f3..35fb5ee81ac6` returns 259.

The workorder's “49 commits touch 73 files” metric cannot be independently reproduced because its 73-file path manifest is not supplied. The exact feature-parent/upstream intersection yields 96 paths and 60 touching commits. Excluding 23 Android localization paths yields 73 paths but 57 touching commits. This report will not silently invent a filter; the supplied 49/73 remains an unverified workorder input.

The read-only virtual merge reproduces exactly 13 conflicts:

1. `extensions/codex/src/app-server/dynamic-tools.ts`
2. `extensions/codex/src/app-server/run-attempt.dynamic-tools.test.ts`
3. `extensions/copilot/src/compaction-bridge.ts`
4. `scripts/deadcode-unused-files.allowlist.mjs`
5. `scripts/plugin-sdk-surface-report.mjs`
6. `scripts/ts-max-loc-baseline-v2.json`
7. `src/agents/command/attempt-execution.ts`
8. `src/agents/embedded-agent-runner/run/attempt.ts`
9. `src/agents/subagent-spawn.ts`
10. `src/auto-reply/reply/agent-runner.ts`
11. `src/auto-reply/reply/followup-runner.test.ts`
12. `src/infra/state-migrations.ts`
13. `src/plugins/openai-compatible-embedding-provider.test.ts`

## Direct Codex dependency contract

The Codex-related conflict was checked against sibling `../codex` at exact SHA
`bdd282f3bbd55df3a869a5438519cd948c134d4d`, not inferred from the OpenClaw
wrapper. Codex protocol `codex-rs/protocol/src/dynamic_tools.rs:10-73` defines
the tagged function/namespace specifications, call request, and response item
contract; `:88-173` owns legacy-to-canonical normalization. App-server
`codex-rs/app-server/src/outgoing_message.rs:286-350` registers the one-shot
callback before broadcasting or targeting the request, and `:373-410` resolves
client response/error into that waiter. App-server
`codex-rs/app-server/src/dynamic_tools.rs:16-54` converts the result to
`Op::DynamicToolResponse`; `:57-92` rejects remote images and turns decode or
ordinary client failures into a failed text response, while a turn-transition
error returns without fallback. This contract confirms that the newer-upstream
dynamic-tool conflict is protocol/runtime adaptation, not evidence for a
#1172 file-size extraction.

## GitNexus evidence

The required sequential borderline-seat index is in progress. Final status,
repository counts, reproducible `query`/`context`/`impact` commands, and bounded
`CALLS|IMPORTS|ACCESSES` walks will be added after it finishes. No grep-only
fallback is used.

Index command:

```bash
exclude_file="$(git rev-parse --git-path info/exclude)"
grep -qxF '/.gitnexus/' "$exclude_file" || printf '/.gitnexus/\n' >> "$exclude_file"
export GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1
gitnexus analyze --index-only --skip-git --workers 0
```

The process-tree monitor samples recursive RSS every ten seconds and stops the
index if it approaches 89,320,526 KiB (70% of physical RAM). The first monitor
watched only the wrapper parent; it was stopped safely before analysis completed,
the partial worktree `.gitnexus/` was removed, and the required command was
restarted under a recursive monitor. That monitoring correction did not alter a
tracked file.

## Evidence map for the six deep hotspots

| Shared surface                                   | Entry point / owner boundary                                                  | Caller and callee evidence                                                                                                                                                 | Sibling / test evidence                                                                                                                                                                                                                                                                            | Frozen-upstream result                                                                                      | Byte-level decision before graph                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/subagent-announce.ts`                | `runSubagentAnnounceFlow`; upstream completion/announce host                  | Registry lifecycle calls the announce flow; #1172 branches drain continuation queues and call feature dispatch/delivery owners                                             | `subagent-announce.continuation*.test.ts`, silent-wake, chain-guard, post-compaction, and spawn-reject suites pin ordering. `subagent-announce.continuation.runtime.ts` exists specifically to avoid `delegate-dispatch -> subagent-spawn -> subagent-registry -> subagent-announce` static cycles | Upstream file unchanged from `d9623bd46f3`; no frozen textual conflict                                      | Do not split. The overlay crosses completion selection, delivery, durable queue claims, wake policy, and finalization. Another extracted path would overlap the existing runtime seam and reopen the known cycle.                                                       |
| `src/auto-reply/reply/agent-runner.ts`           | `runReplyAgent`; upstream main-reply orchestrator                             | `get-reply-run.ts` enters it; it calls the upstream execution runner plus feature-owned signal, delegate dispatch, chain state, pressure, and post-compaction owners       | Continuation delegate/work/span, post-compaction staging, finally-drain, direct-runtime-config, and run-reply suites pin cross-branch order                                                                                                                                                        | Four upstream commits change the same main function; virtual merge conflicts                                | Do not split. #1172 admission reset, post-turn signal parsing, accounting, compaction release, bracket/tool dispatch, chain persistence, silence, and finally preservation are ordering hooks, not a separable owner.                                                   |
| `src/auto-reply/reply/agent-runner-execution.ts` | `runAgentTurnWithFallbackInternal`; upstream provider/fallback execution host | Main runner calls it; it calls embedded/CLI runtimes, compaction, outcome mapping, and feature continuation callbacks                                                      | `agent-runner-execution.*` context-usage, release, fallback, failure, delivery, and progress suites pin behavior                                                                                                                                                                                   | Upstream file unchanged from `d9623bd46f3`; no frozen textual conflict                                      | Preserve the main function. Only the three top-level post-compaction completion/release helpers are a bounded candidate; keep `computeRequestCompactionContextUsage` with the execution-side injected-context decision unless a later owner audit proves a better home. |
| `src/auto-reply/reply/followup-runner.ts`        | `createFollowupRunner`; upstream queued-turn orchestrator                     | Queue drain calls the returned runner; #1172 captures tool requests, dispatches queued delegates, schedules durable work, persists chain state, and records no-op outcomes | `followup-runner.test.ts` plus work-dispatch/no-op/delegate tests cover the same flow                                                                                                                                                                                                              | Three upstream commits change the same function but do not conflict textually                               | Do not split. The overlay depends on fallback winner, usage, delivery evidence, replay safety, no-op recording, queue ordering, and persistence locals from the enclosing turn.                                                                                         |
| `src/agents/command/attempt-execution.ts`        | `runAgentAttempt`; upstream spawn-init/turn-1 execution host                  | Agent command entry calls it; continuation callbacks call compact/release and `scheduleSpawnInitContinueWorkWake`                                                          | Continue-work opts/token and request-compaction opts suites cover turn-1 parity                                                                                                                                                                                                                    | Upstream changes the same function; virtual merge conflicts                                                 | Reassess after absorb; do not extract now. The bottom scheduling helper is feature-owned but moving it alone does not remove the conflicting callback/ordering overlay in `runAgentAttempt`, while a larger extraction needs a broad closure.                           |
| `packages/agent-core/src/agent-loop.ts`          | `runLoop`; upstream package loop                                              | Public `agentLoop*` functions enter it; it executes tools and emits terminal messages                                                                                      | Added `agent-loop.test.ts` cases pin two-strike failure termination, normalization, redaction, multi-tool ordering, and retry behavior. Upstream already owns configurable outcome-aware loop policy in `src/agents/tool-loop-detection.ts` and `agent-tools.before-tool-call.ts`                  | Newer upstream changes `runLoop` for turn interruption and removes none of its pre-existing tool-loop owner | Do not split. After absorb, compare the two-strike requirement against the canonical upstream loop-policy owner; do not create a second fork-only agent-core policy module.                                                                                             |

## Shared-host decisions

### `src/auto-reply/reply/agent-runner.ts`

#1172 overlays continuation admission/reset, typed and bracket signal capture,
usage and chain accounting, preflight/post-compaction lifecycle release, bracket
and tool delegate dispatch, cap notices, TaskFlow persistence, silent-return
selection, and preservation of staged delegates in `finally`. Those steps are
interleaved with upstream fallback, delivery, session mutation, and error order.

The shared host already calls feature-owned modules at durable boundaries. A
second five-method/five-method runner topology would move upstream sequencing
into fork-only files and make future upstream patches harder to map. Verdict:
**do not split**.

### `src/agents/subagent-announce.ts`

#1172 overlays completion ownership, same/cross-session routing, durable delegate
queue drains, inherited silent/wake policy, chained findings, parent wakeup, and
TaskFlow terminalization. Static extraction is constrained by a documented
cycle; the existing tiny `.continuation.runtime.ts` loader is the deliberate
runtime boundary. A new announce path would duplicate that boundary. Verdict:
**do not split**.

### `src/auto-reply/reply/agent-runner-execution.ts`

The main fallback function must preserve upstream runtime selection, callback
start order, transcript persistence, lifecycle terminal precedence, compaction
events, and error mapping. The continuation callbacks close over these facts;
they must remain ordering hooks in this function.

The top-level request-compaction completion boundary is different. These three
symbols are wholly #1172-owned and collectively occupy exactly 120 physical
lines in the shared host:

- `releaseQueuedCompactionCompletion`;
- `releasePostCompactionDelegatesAfterCompaction`;
- `releaseQueuedCompactionTolerant`.

They own session accounting followed by post-compaction delegate release and
failure isolation. The live feature-owned
`src/auto-reply/reply/post-compaction-delegate-dispatch.ts` already owns the
dispatch and durable handoff invoked by these helpers. Moving the three
functions there, making callers load that heavy module lazily, and updating
tests directly is a bounded candidate pending GitNexus cycle/impact proof. The
similarly named `continuation/post-compaction-release.ts` has test callers only;
targeting that parallel abstraction would create an overlapping path, so it is
explicitly not the destination. The remainder of the shared execution file
should not be split.

### `src/auto-reply/reply/followup-runner.ts`

Continuation work is embedded in the queued-turn transaction: fallback winner,
replay safety, no-op classification, delegate dispatch, usage, chain
persistence, and delivery are all required facts. The existing feature modules
already own durable storage and dispatch. Verdict: **do not split**.

### `src/agents/command/attempt-execution.ts`

The turn-1 overlay creates continue-work/request-compaction callbacks and
post-processes the winning embedded result. Although
`scheduleSpawnInitContinueWorkWake` is locally feature-owned, extracting it
does not remove the conflict inside `runAgentAttempt`; extracting the whole
post-turn block would carry a broad session/config/result closure. Verdict:
**reassess after absorb; no current extraction**.

### `packages/agent-core/src/agent-loop.ts`

The 318-line overlay is a two-strike repeated failed-tool breaker with
continuation-specific argument normalization, redacted diagnostics, and
terminal message construction. The repository already has the canonical,
configurable tool-loop owner in `src/agents/tool-loop-detection.ts`, called by
the before-tool-call policy chain. Splitting the new agent-core block would
preserve duplicate policy in another topology. Verdict: **do not split; after
absorb, reassess the behavior against the canonical owner**.

### Other class-A files

The other 56 class-A rows are either 1-20-line overlays, shared schema/config
surfaces, or shared hosts whose frozen-upstream owner is already changing. No
micro-extraction has a demonstrated divergence benefit. Preserve topology.

## Feature-owned decisions

Seven—not eight—inventory paths are feature-owned. `src/auto-reply/tokens.ts`
is a 332-line absorbed-upstream host with a 312-line #1172 overlay and belongs
to class A.

| Feature-owned module                                        | Durable owner found by full read                                                                                            | Adjacent proof                                                                                                                 | Decision                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `src/auto-reply/continuation/delegate-dispatch.ts`          | Runtime side-effect/state-machine boundary for claiming, hedging, spawning, recovery, chain accounting, and terminalization | Delegate dispatch, recovery, cap, fanout, failure-isolation, post-compaction, and trace suites cover coupled state transitions | Keep whole. Splitting timers/recovery/spawn would widen invariants without reducing shared-host drift.   |
| `src/auto-reply/continuation/delegate-store.ts`             | TaskFlow persistence adapter and delegate state machine                                                                     | FIFO, revision race, corruption, delay, targeting, and post-compaction suites pin one storage lifecycle                        | Keep whole. Persistence transitions are one owner.                                                       |
| `src/auto-reply/continuation/work-dispatch.ts`              | Durable work delivery/retry/recovery state machine                                                                          | Busy/idle, restart, orphan, cap, dedupe, trace, and no-op suites pin timer and TaskFlow symmetry                               | Keep whole. Timer, recovery, and terminal state cannot be separated cleanly.                             |
| `src/auto-reply/reply/post-compaction-delegate-dispatch.ts` | Durable handoff from staged delegates through delivery queue to deterministic spawn/finalization                            | Persist/take, retry, trace, cap, policy, chain, and source-row tests cover the end-to-end transaction                          | Keep whole. It is long but is one independently testable side-effect boundary.                           |
| `src/infra/continuation-tracer.ts`                          | Trace/event adapter, registry, safe span builders, and privacy boundary                                                     | No-op, registry, traceparent, span-schema, privacy, and fail-safe suites pin a single adapter contract                         | Keep whole. Splitting span families would fragment one schema/privacy contract.                          |
| `src/auto-reply/continuation/work-store.ts`                 | TaskFlow persistence adapter for continuation work                                                                          | Work-dispatch and store tests cover the state transitions                                                                      | Keep whole. It is one persistence owner.                                                                 |
| `src/auto-reply/reply/no-op-rearm-guard.ts`                 | Pure wake/outcome classification plus its bounded expiring streak ledger                                                    | Classification, reset, cadence, dedupe, and trip tests pin the coupled guard                                                   | Keep whole. The 526-line module is below the current ~700-line guidance and already isolates the policy. |

The files exceed the extinct 500-line ratchet because their state machines and
tests are extensive, not because multiple durable owners were proven. None of
the seven feature-only splits would reduce adaptation of a shared upstream host.

## Candidate gate (pending graph cells)

| Check                           | Continuation parser -> existing `continuation/signal.ts`                                                           | Compaction completion -> live `reply/post-compaction-delegate-dispatch.ts`           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1. #1172-owned behavior only    | Pass: +312-line continuation block, imports, constant, and type re-export are absent from absorbed/frozen upstream | Pass: all three functions are inside a +169 #1172 hunk and absent upstream           |
| 2. Shrinks shared overlay       | Pass: removes all 312 added lines from `tokens.ts`                                                                 | Pass: removes exactly 120 physical lines plus now-unused imports from execution host |
| 3. No re-export wrapper         | Pass if all production/tests import the feature owner directly                                                     | Pass if all three callers/tests import the feature owner directly                    |
| 4. No second runtime path       | Pass: move implementation and tests; delete token-host definitions                                                 | Pass: move implementation; delete execution-host definitions                         |
| 5. No compatibility shim        | Pass: internal imports change in one implementation lane                                                           | Pass: internal imports change in one implementation lane                             |
| 6. Bounded graph                | Pending GitNexus                                                                                                   | Pending GitNexus                                                                     |
| 7. Low cycle risk               | Pending GitNexus; manually, removing `signal.ts -> tokens.ts` reduces an edge                                      | Pending GitNexus; preserve lazy imports for heavy dispatch                           |
| 8. No incompatible frozen owner | Pass: frozen upstream leaves `tokens.ts` at upstream shape and has no continuation module                          | Pass: frozen upstream has neither #1172 continuation owner                           |
| 9. Lower future merge burden    | Pass if graph confirms: shared token host becomes upstream-aligned                                                 | Pass if graph confirms: shared execution host loses a complete side-effect boundary  |
| 10. Independently reversible    | Pass: one symbol family and direct import/test move                                                                | Pass: three functions, direct callers, and their dedicated tests                     |

## Exact commands so far

```bash
git fetch origin
git fetch upstream
node --import tsx scripts/check-ts-max-loc.ts --max 500 \
  --base-ref d9623bd46f3de8bfcc4045859dddf2bbc2865507
git rev-list --count \
  d9623bd46f3de8bfcc4045859dddf2bbc2865507..35fb5ee81ac6d0caedf624171d755957b8911543
git merge-tree --write-tree \
  69a8d2beeafa39b4cbea45303e9dd695cfdc8a65 \
  35fb5ee81ac6d0caedf624171d755957b8911543
```

## Go/no-go

No implementation lane should fire until GitNexus fills the remaining gate
cells. Regardless of graph outcome, the 71-file size refactor is a **no-go**.
