# #1182 / #1172 LOC-policy reconciliation

Status: complete.

## Verdict

The exact staged candidate has **69** upstream-relative TypeScript LOC-policy
violations: 61 `grew`, seven `new-file`, and one `crossed-limit`. They reconcile
to A=62, B=7, C=0. The two historical class-D generated rows are excluded by
the current policy.

Only five paths have an implementation-ready, full-clearing disposition:

1. three overlays can be placed into topology already created by current
   upstream;
2. one shared host has exact safe same-file replacements and phase-owned
   destinations that make the host shrink;
3. one 312-line parser family has a natural existing feature owner.

The other 64 rows are **policy-induced shared-surface blockers**. No broad LOC
refactor may fire. In particular, the qualified 120-line compaction-release
move is still a blocker here: removing 120 lines from a +905 violation leaves
the shared host about +785 lines over its exact base before small import
cleanup. A topology-safe partial improvement is not policy compliance.

Disposition counts:

| Disposition                              | Rows |
| ---------------------------------------- | ---: |
| Already solved upstream                  |    3 |
| Safe net-zero reduction                  |    1 |
| Natural bounded extraction               |    1 |
| Policy-induced shared-surface blocker    |   64 |
| **Total**                                | **69** |

## Immutable comparison set

| Role                                    | SHA                                        |
| --------------------------------------- | ------------------------------------------ |
| Accepted #1172 fix parent               | `0305546aa97247d344c92f3527022dccb0842b25` |
| Pinned upstream                         | `e69df7ef22778f1bcd6224651c1af8aee27967ca` |
| Resolved staged candidate tree          | `c15743f18b6a2a7a40ed2cd016eb0eb43f389056` |
| Current-upstream decomposition snapshot | `cae29a079203a70461c87114b3a2e55d5d38a4a5` |
| Assembly target                         | `4afd560feb5102627a68a2f6a8bc545dabcfcfdc` |
| PR-presentation, excluded               | `d8b08c9c0a1f425f4cfff1b21bff4852deff823f` |
| Required report start                   | `23da733c67d017095dc0e485b558fe8cdabf1e06` |
| Prior audit base                        | `69a8d2beeafa39b4cbea45303e9dd695cfdc8a65` |

The report worktree began clean at the required detached HEAD. No launcher,
watchdog, console, brief, or other untracked file was present. Assembly,
PR-presentation, deploy, proofs, PR #1180, and production sources were not
changed.

## Policy contract and exact reproduction

Upstream issue [#106207](https://github.com/openclaw/openclaw/issues/106207)
defines a baseline-free, merge-base-aware changed-production-file ratchet.
Merged PR [#106387](https://github.com/openclaw/openclaw/pull/106387) implements
the following contract in `scripts/check-ts-max-loc.ts` at pinned upstream:

- new production TypeScript files must be at or below 500 physical lines;
- an existing file at or below 500 may not cross 500;
- an existing oversized file may stay equal or shrink, but may not grow;
- unchanged legacy, deleted, test, fixture, mock, and generated paths are
  excluded by the checker.

The required command was run with the checker bytes from pinned upstream and
the exact base/head objects in a disposable shared clone:

```bash
node --import tsx scripts/check-ts-max-loc.ts \
  --base e69df7ef22778f1bcd6224651c1af8aee27967ca \
  --head c15743f18b6a2a7a40ed2cd016eb0eb43f389056
```

It exits 1, as a policy failure should, and emits exactly 69 unique rows:
61 `grew`, seven `new-file`, and one `crossed-limit`. The disposable clone used
the already-installed `tsx` dependency from the read-only audit worktree and
was deleted immediately. Neither audit worktree changed.

The report HEAD contains the retired checker, which accepts `--base-ref` and
does not accept exact `--base`/`--head`; the report worktree also has no local
`tsx`. Attempting the required command there failed before comparison and was
reported as TROUBLE. It was not treated as evidence.

### Correction of the 206 claim

The earlier 206-row claim used worktree mode. In the current checker,
`collectChangedFileLocs` selects worktree mode when `--head` is absent, and
`resolveComparisonBase` resolves the requested base through `git merge-base`.
For this history, `--base e69df7...` therefore became common merge-base
`d962...`, not pinned upstream. Exact head mode uses the requested base commit
directly. The only valid staged-tree result is 69.

For comparison, candidate versus the old assembly target produces 161 rows:
119 `grew`, 29 `new-file`, and 13 `crossed-limit`. That is a different
comparison and is not substituted into this ledger.

The historical 71-row frozen inventory also changes membership under the new
checker: `src/infra/state-migrations.ts` is 17 lines at both exact trees and
drops out, while `extensions/codex/src/app-server/dynamic-tools.ts` is
1516 -> 1524 and enters. The resulting class counts remain A=62/B=7/C=0; the
two class-D generated rows are excluded.

## Current-upstream reconciliation

Every named decomposition commit is an ancestor of
`cae29a079203a70461c87114b3a2e55d5d38a4a5`. Line counts below are physical
lines from exact blobs, not worktree estimates.

### Already solved upstream: Codex attempt startup

`extensions/codex/src/app-server/run-attempt.ts` changes from 3731 to 3738 in
the exact comparison. Commit `323a9fbe29b` leaves an 81-line current facade.
The candidate's seven-line behavior—applying MCP elicitation approval policy
when fast mode enables computer use—is already present in
`extensions/codex/src/app-server/attempt-startup.ts:202` at the current
snapshot. The facade does not grow, and no new lines are needed in the
713-line startup owner.

### Already solved upstream: diagnostics OTEL service

`extensions/diagnostics-otel/src/service.ts` changes from 3551 to 3682.
Commit `6454b07b170` leaves a 337-line current host. Its extracted destinations
are already bounded:

- `extensions/diagnostics-otel/src/service-trace-context.ts` — 92 lines;
- `extensions/diagnostics-otel/src/service-traces.ts` — 417 lines;
- `extensions/diagnostics-otel/src/service-events.ts` — 238 lines;
- the current 337-line `service.ts` lifecycle owner;
- candidate `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts`, a
  new production file below 500 lines.

The exact +131 net service growth maps to trace-source normalization,
trusted-root and logical-parent stitching, continuation event handling, and
adapter install/reset lifecycle across those owners. No reconstructed
fork-only service monolith is required.

### Already solved upstream: Gateway agent handler

`src/gateway/server-methods/agent.ts` changes from 3485 to 3518. Commit
`d1fff1afc6a` leaves an 11-line facade. The complete overlay maps to existing
owners:

- internal request fields: `src/gateway/server-methods/agent-request-types.ts`
  (55 lines);
- continuation traceparent read/preparation:
  `src/gateway/server-methods/agent-session-prepare.ts` (341 lines);
- one-shot clearing during the authoritative session patch:
  `src/gateway/server-methods/agent-session-persist.ts:225` (434 lines);
- subagent handoff consumption, trust gating, and ingress construction:
  `src/gateway/server-methods/agent-run-execution-phase.ts:216` (391 lines).

`src/gateway/server-methods/agent-run-handler.ts` is exactly 500 lines and must
not grow. `startAgentRunExecution` already receives the request, session entry,
resolved keys, idempotency key, and internal-handoff trust fact, so the handoff
logic belongs in the execution phase and requires no handler growth.

### Safe same-host reduction: embedded attempt

`src/agents/embedded-agent-runner/run/attempt.ts` changes from 2529 to 2553.
Current upstream extracted prompt/session/gate phases in `bab07e990a2`,
`98f603c4c4f`, `4f60ab2e88f`, `3e5d8cdbf4a`, and `bc8a44bc416`; the current
host is 1854 lines. The exact 24-line delta is:

- 21 lines of re-exports from `attempt.thread-helpers.ts`,
  `attempt.prompt-helpers.ts`, and `stream-resolution.ts`;
- one `toolSearchCatalogApplied = true` assignment;
- two trusted-local-media set pass-through lines.

The 14 re-exported symbols already have callers importing their defining
modules at current upstream. They are obsolete compatibility surface, not
required behavior, and must be omitted without an alias or shim.

The trusted-local-media computation belongs in current
`src/agents/embedded-agent-runner/run/attempt-client-tools.ts` (174 lines).
Return one `subscriptionToolTrust` object containing `builtinToolNames`,
`replaySafeToolNames`, and `trustedLocalMediaToolNames`; current
`attempt-session.ts` already passes the residual client-tool runtime through.
Consume that object in current `attempt-stream-prepare.ts` (379 lines). In the
host, replacing two destructured names and two passed properties with the one
object shrinks the host by two physical lines.

For early catalog cleanup, replace the current boolean at
`src/agents/embedded-agent-runner/run/attempt.ts:189` with an optional
`ReturnType<typeof prepareEmbeddedAttemptToolCatalog>`. Assign the result at
`:407`, guard cleanup on its presence at `:212`, and clear it at `:220`.
These are same-line replacements: they preserve “clear only after successful
catalog application” without adding a host line. The current host therefore
shrinks, and every behavioral addition is owned by an existing phase module
below 500 lines.

This path is deliberately classified `safe net-zero reduction`, not “already
solved upstream”: one state byte has no extracted destination, but it has exact
same-file replacement evidence.

### Natural bounded extraction: continuation signal

`src/auto-reply/tokens.ts` is the only `crossed-limit` row: 332 -> 644.
Move the complete 312-line feature family to existing candidate owner
`src/auto-reply/continuation/signal.ts`:

- `CONTINUE_WORK_TOKEN`;
- `ContinuationSignal`;
- directive and parser state;
- `parseContinuationSignal`;
- `stripContinuationSignal`.

The result is the 332-line upstream host and a projected 457-line destination.
Production and test consumers import the destination directly. No re-export,
alias, shim, fallback, or duplicate parser remains.

### Qualified partial extraction that remains blocked

The frozen audit proved that
`releaseQueuedCompactionCompletion`,
`releasePostCompactionDelegatesAfterCompaction`, and
`releaseQueuedCompactionTolerant` form a topology-safe 120-line owner boundary
inside `src/auto-reply/reply/agent-runner-execution.ts`. That finding remains
true. It does not clear this policy row: 4339 - 120 = 4219, still +785 over the
3434-line base before removing a few imports. It is therefore not included in
the implementation lane.

## GitNexus hard-gate evidence

The existing index was queried read-only from the prior audit worktree. It was
not copied, symlinked, or rebuilt.

- wrapper: GitNexus 1.6.5;
- 22,721 files;
- 526,802 symbols;
- 1,800,136 edges;
- 16,831 clusters;
- 300 processes;
- index size: 1.8 GiB.

`gitnexus status` records indexed commit `3727db1` and reports stale against
the later report HEAD. Exact `git diff` inspection proves that the only delta
between indexed commit and the required start is the five prior report/output
files. A non-report path diff is empty, so the indexed code bytes are exact for
this audit. Re-indexing would add risk without changing code evidence.

Reproducible query set, run with the old audit worktree as `-r`:

```bash
gitnexus status
gitnexus list
gitnexus context parseContinuationSignal -r . \
  -f src/auto-reply/tokens.ts
gitnexus impact 'Function:src/auto-reply/tokens.ts:parseContinuationSignal' \
  -r . --depth 2 --include-tests --limit 50
gitnexus context stripContinuationSignal -r . \
  -f src/auto-reply/tokens.ts
gitnexus impact 'Function:src/auto-reply/tokens.ts:stripContinuationSignal' \
  -r . --depth 2 --include-tests --limit 50
gitnexus context runCodexAppServerAttempt -r . \
  -f extensions/codex/src/app-server/run-attempt.ts
gitnexus context createDiagnosticsOtelService -r . \
  -f extensions/diagnostics-otel/src/service.ts
gitnexus context dispatchAgentRunFromGateway -r . \
  -f src/gateway/server-methods/agent.ts
gitnexus context runEmbeddedAttempt -r . \
  -f src/agents/embedded-agent-runner/run/attempt.ts
```

Restricted Cypher walks used only `CALLS`, `IMPORTS`, and `ACCESSES` edges.
For the signal family they return 13 exact relationship rows. Impact reports
show four direct/eight total nodes for `parseContinuationSignal` and seven
direct/25 total for `stripContinuationSignal`. Production callers include the
subagent announce flow, agent command attempt, agent-runner execution,
followup runner, and no-op rearm guard, plus focused tests.

The only direct import between the two owner files is
`continuation/signal.ts -> tokens.ts`; no reverse path exists at depth 1-2.
Moving the complete family and retargeting imports removes that edge rather
than creating a cycle.

For current-upstream decomposition, `context` and depth-2 `impact` were run for
the Codex attempt entry, diagnostics service and trace helpers, Gateway
dispatch/handoff helpers, the embedded attempt entry, all 14 candidate
re-exported symbols, trusted-media collection, and catalog cleanup. Graph
resolution is conservative for large closures and dynamic calls; exact source
reads and immutable blob diffs close those named gaps. No disposition relies
on an unresolved graph guess.

## Residual blocker rule

All 64 blocker rows use the same high-confidence rule:

- a class-A shared/current-upstream host remains blocked unless every changed
  byte has an existing destination or exact same-file removable/replaced-byte
  proof that clears the full row;
- a class-B feature owner remains whole unless the frozen ten-gate audit found
  a natural owner boundary; long-file status is not a refactor reason;
- partial reductions that leave any violation remain blockers;
- ambiguous ownership is a blocker, not permission to invent topology.

The exact row rationale and current-upstream status are recorded in
`REPORTS/1172-loc-policy-reconciliation.tsv`.

## Safe-set decision

Phase 2 may fire only for the five paths described in
`REPORTS/1172-loc-policy-compliance-workorder.md`, against an exact current
upstream-derived implementation base and with a fresh exact LOC recheck.
Those instructions port behavior into existing upstream owners or shrink the
shared host; they do not weaken the checker and do not create fork-only shared
topology.

If the five-path lane cannot preserve these exact owner boundaries, it must
stop. There is no residual implementation permission for the 64 blockers.

## Report-lane confirmation

This audit changed reports only. It did not change production code, tests,
configuration, generated files, assembly, deployment artifacts, proof
artifacts, or PR presentation. No PR was opened.
