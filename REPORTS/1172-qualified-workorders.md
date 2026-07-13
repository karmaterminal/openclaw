# #1172 qualified implementation workorders

These are two independent post-absorb lanes. Neither may start from
`69a8d2beeafa39b4cbea45303e9dd695cfdc8a65`. Record an exact implementation
base that contains frozen upstream
`35fb5ee81ac6d0caedf624171d755957b8911543`, rerun the named byte/graph checks,
and stop if absorption changes the ownership result.

## Workorder 1: make continuation signal parsing feature-owned

### Mission

Restore the shared upstream host `src/auto-reply/tokens.ts` to its upstream
topology by moving the complete #1172 continuation parser/stripper family into
the existing owner `src/auto-reply/continuation/signal.ts`.

### Preconditions

1. Verify HEAD is the recorded post-absorb base and contains `35fb5ee81ac6`.
2. Re-run exact diffs from absorbed upstream through the implementation base.
3. Re-run the audit's `context`, depth-2 `impact`, and import-cycle Cypher for
   `parseContinuationSignal`, `stripContinuationSignal`, `tokens.ts`, and
   `continuation/signal.ts`.
4. Stop if newer upstream now owns continuation parsing or creates a reverse
   `tokens.ts -> continuation/signal.ts` dependency that the move would cycle.

### Required change

1. Move, without semantic edits, `CONTINUE_WORK_TOKEN`, the `ContinuationSignal`
   type surface, directive state/parsers, `parseContinuationSignal`, and
   `stripContinuationSignal` to `continuation/signal.ts`.
2. Import targeting normalization and `ContinuationSignal` types directly in
   that owner. Do not route them through `tokens.ts`.
3. Change every production and test consumer to import the moved surface from
   `continuation/signal.ts`. Known production consumers at the audited base are
   `subagent-announce.ts`, `attempt-execution.ts`, `agent-runner-execution.ts`,
   `followup-runner.ts`, and `no-op-rearm-guard.ts`; re-discover rather than
   assuming the list is unchanged after absorb.
4. Delete the moved definitions, feature-only imports, and type re-export from
   `tokens.ts`. Do not leave a re-export, alias, compatibility shim, or fallback.
5. Move continuation-specific parser tests under the continuation owner. Keep
   upstream silent/heartbeat token tests with `tokens.ts`; remove duplicate
   parser suites rather than preserving both paths.

### Invariants

- Parser grammar, 4096-character delegate truncation, directive precedence,
  target/fanout exclusion, `model=default`, traceparent consumption, and exact
  stripper behavior remain byte-for-byte equivalent unless post-absorb source
  proves an intentional contract change.
- `tokens.ts` retains upstream-owned silent/heartbeat behavior and no #1172
  continuation policy.
- There is one implementation and one import path.

### Proof and acceptance

Use `$openclaw-testing` and the sanctioned remote runner selected for the
post-absorb source trust. At minimum, prove the continuation signal/parser
suite, RFC contract scenario, no-op guard, subagent announce continuation,
attempt turn-1, followup, and execution streaming consumers. Run the relevant
changed gate and mandatory fresh `$autoreview` until no actionable finding
remains.

Acceptance requires:

- `git diff` proves no upstream-owned symbol moved;
- the shared-host #1172 overlay is reduced by the audited 312 lines, adjusted
  only for explicitly named post-absorb upstream changes;
- GitNexus shows direct consumers targeting `continuation/signal.ts`, no
  implementation left in `tokens.ts`, and no new import cycle;
- no re-export or compatibility path exists.

Commit this extraction independently so it can be reverted without the second
workorder.

## Workorder 2: isolate post-compaction release orchestration

### Mission

Move the three #1172-owned request/manual-compaction release functions out of
the shared upstream execution host into a new feature-owned
`src/auto-reply/reply/post-compaction-release.ts`. Preserve the existing
`post-compaction-delegate-dispatch.ts` as the live dispatch callee and eliminate
the stale test-only continuation release abstraction.

### Preconditions

1. Verify HEAD is the recorded post-absorb base and contains `35fb5ee81ac6`.
2. Re-run exact diffs for `agent-runner-execution.ts`, the three callers, the
   live dispatch module, and both post-compaction release paths.
3. Re-run depth-2 impact for all three functions and the audit's filtered
   `CALLS|IMPORTS|ACCESSES` Cypher. Re-run the dispatch-to-caller import walk at
   depth 1-5 because the known subagent/runtime graph is cycle-sensitive.
4. Stop if newer upstream introduces a canonical release owner or changes the
   accounting/release contract incompatibly.

### Required change

1. Create `src/auto-reply/reply/post-compaction-release.ts` and move exactly:
   `releaseQueuedCompactionCompletion`,
   `releasePostCompactionDelegatesAfterCompaction`, and
   `releaseQueuedCompactionTolerant`.
2. Keep the new file a real orchestration owner: successful compaction guard,
   session-entry resolution, compaction accounting, delegate release/restage,
   tracing, and tolerant failure isolation. Do not create a wrapper around old
   definitions.
3. Preserve the order `accounting -> refreshed entry -> dispatch/restage ->
trace`. Preserve the tolerant wrapper rule that release cleanup cannot turn
   an already-mutated compaction into a failed compaction result.
4. Update all callers directly or lazily: the followup-turn trigger inside
   `agent-runner-execution.ts`, turn-1 trigger inside `attempt-execution.ts`,
   and Gateway manual compaction in `gateway/server-methods/sessions.ts` at the
   audited base. Re-discover dynamic callers after absorb.
5. Keep the live dispatch and tracer loads lazy where they are lazy today.
   Delete the old execution-host definitions and now-unused imports. Do not
   re-export them from `agent-runner-execution.ts`.
6. Delete the non-live
   `src/auto-reply/continuation/post-compaction-release.ts`, which GitNexus found
   has only two test callers. Remove its obsolete unit tests; retarget any still
   relevant mid-run survival invariant to the new canonical release path. Do
   not promote or retain two release implementations.
7. Move the dedicated queued-compaction release tests to the new owner and keep
   production callers tested at their own boundary.

### Invariants

- Missing store/session entry remains a logged no-op.
- Only successful, actually compacted results increment accounting and release.
- New session id/file and tokens-after data reach session accounting unchanged.
- Double persistence failure restages survivors; trace emission reflects queued
  count and cannot alter the compaction outcome.
- Gateway manual compaction releases without double-accounting.
- There is one canonical release implementation and no static cycle through
  subagent spawn/attempt execution.

### Proof and acceptance

Use `$openclaw-testing` and the sanctioned remote runner selected for the
post-absorb source trust. At minimum, prove the moved release suite,
request-compaction turn-1 and followup paths, Gateway manual compaction,
post-compaction dispatch persistence/recovery, mid-run delegate survival, and
session accounting. Run the relevant changed gate and mandatory fresh
`$autoreview` until no actionable finding remains.

Acceptance requires:

- exactly the three #1172-owned functions leave the shared execution host;
- its overlay shrinks by the audited 120 physical lines plus unused imports,
  adjusted only for explicitly named post-absorb upstream changes;
- all three entry surfaces target the new owner and the old host exports none
  of them;
- the live dispatch owner remains a callee, the stale test-only module is gone,
  and GitNexus finds no reverse import cycle;
- no compatibility shim, duplicate runtime path, or unrelated host split is
  introduced.

Commit this extraction independently from workorder 1.
