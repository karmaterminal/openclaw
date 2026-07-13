# #1172 divergence-minimization audit

Status: complete.

## Executive recommendation

Do not split the former 71-file set. The removed LOC ratchet eliminates the only
size-only reason for that work, and the largest shared runners cannot be divided
without moving upstream-owned ordering and error semantics into fork-only files.

Two bounded overlay extractions pass all ten qualification checks:

1. move continuation parsing/stripping out of the upstream-owned
   `src/auto-reply/tokens.ts` and into the existing feature-owned
   `src/auto-reply/continuation/signal.ts`;
2. move the three request-compaction completion/release functions out of
   `src/auto-reply/reply/agent-runner-execution.ts` and into a new
   feature-owned `src/auto-reply/reply/post-compaction-release.ts`, which calls
   the existing live dispatch owner without absorbing its implementation.

No implementation should run on the current candidate. Either extraction
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

The required frond GitNexus fork is exact at
`3c1e686edfc1acaac882927cada121ddd7c47bcc` and reports version `1.6.5`.
The host exposed approximately 121 GiB physical RAM and the monitor used an
89,320,526 KiB stop threshold. The sequential borderline-seat index completed
successfully in 5,605 seconds with a peak recursive RSS of 16,687,648 KiB:

- 22,721 files;
- 526,802 symbols/nodes;
- 1,800,136 edges;
- 16,831 clusters;
- 300 flows;
- 1.8 GiB ignored worktree-local index.

`gitnexus status` records indexed commit `3727db1`; that commit differs from the
audit base only by the first report WIP. It first reported stale against the
post-index checkpoint `550f997`, and later report commits necessarily keep that
status, because every subsequent commit also changes reports only. Production,
test, config, and generated bytes are identical across the audit base, indexed
commit, and report commits, so the graph is exact for every code surface judged
here. No status metadata was rewritten to hide the report-only advancement.

Index command:

```bash
exclude_file="$(git rev-parse --git-path info/exclude)"
grep -qxF '/.gitnexus/' "$exclude_file" || printf '/.gitnexus/\n' >> "$exclude_file"
export GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1
gitnexus analyze --index-only --skip-git --workers 0
```

The process-tree monitor sampled recursive RSS every ten seconds. The first
monitor watched only the wrapper parent; it was stopped safely before analysis
completed, the partial worktree `.gitnexus/` was removed, and the required
command was restarted under a recursive monitor. That correction did not alter
a tracked file. Optional Swift grammars were deliberately skipped by the
required environment setting; 872 Swift files were reported skipped. No
embeddings were generated and no index was published.

### Graph conclusions

The six shared hosts are broad orchestration surfaces, not hidden small owners.
Exact-symbol depth-2 impact reports 20 impacted nodes for `runReplyAgent`, 13
for `runSubagentAnnounceFlow`, 2 for `runAgentTurnWithFallbackInternal`, 14 for
`createFollowupRunner`, 12 for `runAgentAttempt`, and 9 for `runLoop`. Narrow
Cypher counts on exact file/name pairs find respectively 143, 63, 71, 2, 37,
and 8 `CALLS` edges (plus 90, 13, 37, 0, 1, and 0 `ACCESSES` edges). The parser
and compaction families are materially smaller and have existing downstream
owners:

- `parseContinuationSignal` has four direct and eight depth-2 impacted nodes;
  `stripContinuationSignal` has seven direct and 25 depth-2 nodes across three
  modules. The exact filtered walk contains 13 `CALLS|ACCESSES` rows: four
  production callers, three test files, the parser-to-stripper edge, and parser
  internals. `continuation/signal.ts -> tokens.ts` is one direct `IMPORTS` edge;
  the reverse path is absent at depth 1-2. Moving the family therefore removes,
  rather than creates, a cycle edge.
- The three compaction release functions each have LOW depth-2 impact (2-3
  nodes). Their exact filtered walk contains eight call edges, with only the
  two request-compaction `triggerCompaction` closures entering the tolerant
  wrapper. Whole-source inspection adds the Gateway manual-compaction dynamic
  caller that function-level resolution cannot see. The current execution host
  imports the live dispatch file directly and the attempt host reaches it at
  import depth 2; there is no reverse `IMPORTS` path from the dispatch file to
  either host at depth 1-5. A new release orchestrator can preserve those lazy
  directions without a cycle.

GitNexus also proves that the similarly named
`src/auto-reply/continuation/post-compaction-release.ts` is not a live owner:
`context` and `impact` find exactly two test callers and no production caller.
It must not be promoted as a second runtime path. The post-absorb implementation
should delete that stale internal abstraction, preserve any still-relevant
invariant test against the new canonical release owner, and avoid a re-export.

Function-call resolution is conservative around dynamic imports and very large
closures. File-level `IMPORTS`, exact source reads, and exact-SHA byte diffs are
used to close those named gaps; they supplement the completed graph rather than
replace it.

## Evidence map for the six deep hotspots

| Shared surface                                   | Entry point / owner boundary                                                  | Caller and callee evidence                                                                                                                                                 | Sibling / test evidence                                                                                                                                                                                                                                                                            | Frozen-upstream result                                                                                      | Byte-level decision before graph                                                                                                                                                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/subagent-announce.ts`                | `runSubagentAnnounceFlow`; upstream completion/announce host                  | Registry lifecycle calls the announce flow; #1172 branches drain continuation queues and call feature dispatch/delivery owners                                             | `subagent-announce.continuation*.test.ts`, silent-wake, chain-guard, post-compaction, and spawn-reject suites pin ordering. `subagent-announce.continuation.runtime.ts` exists specifically to avoid `delegate-dispatch -> subagent-spawn -> subagent-registry -> subagent-announce` static cycles | Upstream file unchanged from `d9623bd46f3`; no frozen textual conflict                                      | Do not split. The overlay crosses completion selection, delivery, durable queue claims, wake policy, and finalization. Another extracted path would overlap the existing runtime seam and reopen the known cycle.                                    |
| `src/auto-reply/reply/agent-runner.ts`           | `runReplyAgent`; upstream main-reply orchestrator                             | `get-reply-run.ts` enters it; it calls the upstream execution runner plus feature-owned signal, delegate dispatch, chain state, pressure, and post-compaction owners       | Continuation delegate/work/span, post-compaction staging, finally-drain, direct-runtime-config, and run-reply suites pin cross-branch order                                                                                                                                                        | Four upstream commits change the same main function; virtual merge conflicts                                | Do not split. #1172 admission reset, post-turn signal parsing, accounting, compaction release, bracket/tool dispatch, chain persistence, silence, and finally preservation are ordering hooks, not a separable owner.                                |
| `src/auto-reply/reply/agent-runner-execution.ts` | `runAgentTurnWithFallbackInternal`; upstream provider/fallback execution host | Main runner calls it; it calls embedded/CLI runtimes, compaction, outcome mapping, and feature continuation callbacks                                                      | `agent-runner-execution.*` context-usage, release, fallback, failure, delivery, and progress suites pin behavior                                                                                                                                                                                   | Upstream file unchanged from `d9623bd46f3`; no frozen textual conflict                                      | Preserve the main function. Only the three top-level post-compaction completion/release helpers qualify for a new feature-owned release orchestrator; keep `computeRequestCompactionContextUsage` with the execution-side injected-context decision. |
| `src/auto-reply/reply/followup-runner.ts`        | `createFollowupRunner`; upstream queued-turn orchestrator                     | Queue drain calls the returned runner; #1172 captures tool requests, dispatches queued delegates, schedules durable work, persists chain state, and records no-op outcomes | `followup-runner.test.ts` plus work-dispatch/no-op/delegate tests cover the same flow                                                                                                                                                                                                              | Three upstream commits change the same function but do not conflict textually                               | Do not split. The overlay depends on fallback winner, usage, delivery evidence, replay safety, no-op recording, queue ordering, and persistence locals from the enclosing turn.                                                                      |
| `src/agents/command/attempt-execution.ts`        | `runAgentAttempt`; upstream spawn-init/turn-1 execution host                  | Agent command entry calls it; continuation callbacks call compact/release and `scheduleSpawnInitContinueWorkWake`                                                          | Continue-work opts/token and request-compaction opts suites cover turn-1 parity                                                                                                                                                                                                                    | Upstream changes the same function; virtual merge conflicts                                                 | Reassess after absorb; do not extract now. The bottom scheduling helper is feature-owned but moving it alone does not remove the conflicting callback/ordering overlay in `runAgentAttempt`, while a larger extraction needs a broad closure.        |
| `packages/agent-core/src/agent-loop.ts`          | `runLoop`; upstream package loop                                              | Public `agentLoop*` functions enter it; it executes tools and emits terminal messages                                                                                      | Added `agent-loop.test.ts` cases pin two-strike failure termination, normalization, redaction, multi-tool ordering, and retry behavior. Upstream already owns configurable outcome-aware loop policy in `src/agents/tool-loop-detection.ts` and `agent-tools.before-tool-call.ts`                  | Newer upstream changes `runLoop` for turn interruption and removes none of its pre-existing tool-loop owner | Do not split. After absorb, compare the two-strike requirement against the canonical upstream loop-policy owner; do not create a second fork-only agent-core policy module.                                                                          |

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
dispatch and durable handoff invoked by these helpers, but it should remain the
callee rather than absorb trigger-side session accounting. The qualified owner
is a new `src/auto-reply/reply/post-compaction-release.ts`: a real orchestration
module containing the three functions, not a wrapper. Callers must import it
directly or lazily, and it must call the existing dispatch owner lazily. The
similarly named `continuation/post-compaction-release.ts` has exactly two test
callers and no production caller; the implementation workorder retires that
stale parallel abstraction rather than promoting it. GitNexus reports 2-3
depth-2 impacted nodes per moved function and no reverse import path from the
live dispatch module to the execution or attempt hosts at depth 1-5. The
remainder of the shared execution file should not be split.

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

## Candidate gate

| Check                           | Continuation parser -> existing `continuation/signal.ts`                                                           | Compaction completion -> new `reply/post-compaction-release.ts`                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. #1172-owned behavior only    | Pass: +312-line continuation block, imports, constant, and type re-export are absent from absorbed/frozen upstream | Pass: all three functions are inside a #1172-only hunk and absent upstream                                                                                        |
| 2. Shrinks shared overlay       | Pass: removes all 312 added lines from `tokens.ts`                                                                 | Pass: removes exactly 120 physical lines plus now-unused imports from execution host                                                                              |
| 3. No re-export wrapper         | Pass: workorder requires every production/test import to target the owner directly                                 | Pass: the new module owns accounting, release, and failure isolation; old-host re-export is forbidden                                                             |
| 4. No second runtime path       | Pass: move implementation/tests and delete token-host definitions                                                  | Pass: move and delete execution-host definitions; retire test-only `continuation/post-compaction-release.ts`                                                      |
| 5. No compatibility shim        | Pass: internal imports change atomically                                                                           | Pass: internal imports change atomically                                                                                                                          |
| 6. Bounded graph                | Pass: 7 direct/25 depth-2 impacted nodes; 13 exact filtered edges, 4 production callers and 3 test files           | Pass: 2-3 depth-2 impacted nodes per function; 8 exact call edges plus one source-proven Gateway dynamic caller                                                   |
| 7. Low cycle risk               | Pass: removes direct `signal.ts -> tokens.ts`; no reverse depth-1/2 import path                                    | Pass: current callers reach live dispatch at depth 1/2; dispatch has no reverse import path to execution/attempt at depth 1-5; workorder preserves lazy direction |
| 8. No incompatible frozen owner | Pass: frozen upstream leaves `tokens.ts` at upstream shape and has no continuation module                          | Pass: frozen upstream has no continuation release owner                                                                                                           |
| 9. Lower future merge burden    | Pass: shared token host becomes upstream-aligned                                                                   | Pass: shared execution host loses a complete feature side-effect boundary; new file carries no upstream symbols                                                   |
| 10. Independently reversible    | Pass: one symbol family and direct import/test move                                                                | Pass: three functions, three entry surfaces, direct tests, and one stale test-only module removal                                                                 |

## Exact commands

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

exclude_file="$(git rev-parse --git-path info/exclude)"
grep -qxF '/.gitnexus/' "$exclude_file" || printf '/.gitnexus/\n' >> "$exclude_file"
export GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1
gitnexus analyze --index-only --skip-git --workers 0
gitnexus status
gitnexus list

gitnexus query 'continuation signal parsing stripping' -r . -l 8
gitnexus query 'post compaction delegate release session accounting' -r . -l 8
gitnexus query 'subagent announce continuation completion delivery' -r . -l 5
gitnexus query 'reply agent continuation dispatch compaction' -r . -l 5
gitnexus query 'agent fallback execution request compaction' -r . -l 5
gitnexus query 'followup runner durable work delegate' -r . -l 5
gitnexus query 'agent attempt spawn init continuation' -r . -l 5
gitnexus query 'agent loop repeated tool error termination' -r . -l 5

gitnexus context runReplyAgent -r . -f src/auto-reply/reply/agent-runner.ts
gitnexus context runSubagentAnnounceFlow -r . -f src/agents/subagent-announce.ts
gitnexus context runAgentTurnWithFallbackInternal -r . \
  -f src/auto-reply/reply/agent-runner-execution.ts
gitnexus context createFollowupRunner -r . -f src/auto-reply/reply/followup-runner.ts
gitnexus context runAgentAttempt -r . -f src/agents/command/attempt-execution.ts
gitnexus context runLoop -r . -f packages/agent-core/src/agent-loop.ts

gitnexus impact 'Function:src/auto-reply/reply/agent-runner.ts:runReplyAgent' \
  -r . --depth 2 --include-tests --summary-only
gitnexus impact 'Function:src/agents/subagent-announce.ts:runSubagentAnnounceFlow' \
  -r . --depth 2 --include-tests --summary-only
gitnexus impact \
  'Function:src/auto-reply/reply/agent-runner-execution.ts:runAgentTurnWithFallbackInternal' \
  -r . --depth 2 --include-tests --summary-only
gitnexus impact 'Function:src/auto-reply/reply/followup-runner.ts:createFollowupRunner' \
  -r . --depth 2 --include-tests --summary-only
gitnexus impact 'Function:src/agents/command/attempt-execution.ts:runAgentAttempt' \
  -r . --depth 2 --include-tests --summary-only
gitnexus impact 'Function:packages/agent-core/src/agent-loop.ts:runLoop' \
  -r . --depth 2 --include-tests --summary-only

# The same exact-name/file predicate was executed for all six hotspots; this is
# the runReplyAgent form. Substitute the five name/path pairs above verbatim.
gitnexus cypher -r . \
  "MATCH (a)-[r:CodeRelation]->(b)
   WHERE r.type IN ['CALLS','IMPORTS','ACCESSES']
     AND ((a.name='runReplyAgent'
           AND a.filePath='src/auto-reply/reply/agent-runner.ts')
       OR (b.name='runReplyAgent'
           AND b.filePath='src/auto-reply/reply/agent-runner.ts'))
   RETURN r.type, count(*) ORDER BY r.type"

gitnexus impact 'Function:src/auto-reply/tokens.ts:parseContinuationSignal' \
  -r . --depth 2 --include-tests --limit 50
gitnexus impact 'Function:src/auto-reply/tokens.ts:stripContinuationSignal' \
  -r . --depth 2 --include-tests --limit 50
gitnexus impact \
  'Function:src/auto-reply/reply/agent-runner-execution.ts:releaseQueuedCompactionCompletion' \
  -r . --depth 2 --include-tests --limit 50
gitnexus impact \
  'Function:src/auto-reply/reply/agent-runner-execution.ts:releasePostCompactionDelegatesAfterCompaction' \
  -r . --depth 2 --include-tests --limit 50
gitnexus impact \
  'Function:src/auto-reply/reply/agent-runner-execution.ts:releaseQueuedCompactionTolerant' \
  -r . --depth 2 --include-tests --limit 50

gitnexus cypher -r . \
  "MATCH (a)-[r:CodeRelation]->(b)
   WHERE r.type IN ['CALLS','IMPORTS','ACCESSES']
     AND (a.name IN ['parseContinuationSignal','stripContinuationSignal']
       OR b.name IN ['parseContinuationSignal','stripContinuationSignal'])
   RETURN r.type, a.name, a.filePath, b.name, b.filePath
   ORDER BY r.type, a.filePath, b.filePath LIMIT 100"
gitnexus cypher -r . \
  "MATCH (a)-[r:CodeRelation]->(b)
   WHERE r.type IN ['CALLS','IMPORTS','ACCESSES']
     AND (a.name IN ['releaseQueuedCompactionCompletion',
                     'releasePostCompactionDelegatesAfterCompaction',
                     'releaseQueuedCompactionTolerant']
       OR b.name IN ['releaseQueuedCompactionCompletion',
                     'releasePostCompactionDelegatesAfterCompaction',
                     'releaseQueuedCompactionTolerant'])
   RETURN r.type, a.name, a.filePath, b.name, b.filePath
   ORDER BY r.type, a.filePath, b.filePath LIMIT 100"
gitnexus cypher -r . \
  "MATCH p=(a:File)-[:CodeRelation*1..5]->(b:File)
   WHERE a.filePath = 'src/auto-reply/reply/post-compaction-delegate-dispatch.ts'
     AND b.filePath IN ['src/auto-reply/reply/agent-runner-execution.ts',
                        'src/agents/command/attempt-execution.ts']
     AND ALL(r IN relationships(p) WHERE r.type = 'IMPORTS')
   RETURN a.filePath, b.filePath, length(p) LIMIT 20"
```

## Go/no-go

The 71-file size refactor is a **no-go**. The two qualified overlay extractions
are a **go only after** absorbing frozen upstream `35fb5ee81ac6`, recording the
new exact base, rerunning the graph/byte gates there, and executing the separate
workorders in this audit. Final verdict: **bounded overlay extraction after
absorb**.
