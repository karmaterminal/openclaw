# #1182 / #1172 LOC-policy reconciliation output

## Branch and declaration SHA

- Branch: `codeagent/1172-divergence-minimization-audit`
- Completed report/ledger/workorder commit before this output declaration:
  `7f9fc0db9f71b04808594822a4cfd221e5e64520`
- Required report start: `23da733c67d017095dc0e485b558fe8cdabf1e06`
- Pinned upstream: `e69df7ef22778f1bcd6224651c1af8aee27967ca`
- Resolved staged candidate: `c15743f18b6a2a7a40ed2cd016eb0eb43f389056`
- Current-upstream snapshot: `cae29a079203a70461c87114b3a2e55d5d38a4a5`

The final branch SHA containing this file is reported by the COMPLETE webhook,
issue comment, and handoff. A commit cannot embed its own content-addressed SHA.

## Result

- Exact policy rows: **69** unique paths.
- Frozen classes: A=62, B=7, C=0; historical class-D generated rows excluded.
- LOC reasons: 61 `grew`, seven `new-file`, one `crossed-limit`.
- Already solved upstream: 3.
- Safe net-zero reduction: 1.
- Natural bounded extraction: 1.
- Policy-induced shared-surface blockers: 64.
- Qualified full-clearing implementation paths: **5**.
- Source/test/config/generated changes: **none**.
- Verdict: **five-path current-topology compliance lane; 64 residual blockers**.

The earlier 206-row statement is invalid. Without `--head`, worktree mode
resolved the requested `e69df7...` base through common merge-base `d962...`.
The exact pinned-base/staged-tree command emits 69 rows.

Phase 2 may operate only on:

1. `extensions/codex/src/app-server/run-attempt.ts` — preserve the upstream
   startup-phase solution;
2. `extensions/diagnostics-otel/src/service.ts` — port into current extracted
   trace/event/lifecycle owners;
3. `src/gateway/server-methods/agent.ts` — port into current request,
   persistence, session, and execution owners without growing the 500-line
   handler;
4. `src/agents/embedded-agent-runner/run/attempt.ts` — omit obsolete re-exports,
   bundle subscription trust through phase owners, and use exact same-line
   catalog-state replacement so the host shrinks;
5. `src/auto-reply/tokens.ts` — move the complete 312-line continuation parser
   family to `src/auto-reply/continuation/signal.ts` without a re-export.

The 120-line compaction-release helper move remains excluded because it does
not clear the +905 `agent-runner-execution.ts` violation.

## GitNexus status

- Existing read-only index: healthy; no re-index, copy, or symlink.
- Wrapper: GitNexus 1.6.5.
- Graph: 22,721 files, 526,802 symbols, 1,800,136 edges, 16,831 clusters,
  300 processes.
- Indexed commit: `3727db1`; stale only for the expected five prior
  report/output files. Non-report code delta to the required start is empty.
- Exact `context`, depth-2 upstream `impact`, and restricted
  `CALLS|IMPORTS|ACCESSES` walks: complete for the moved symbols and named
  current-upstream destinations.
- Embeddings/publication: none.

## Changed files

- `REPORTS/1172-loc-policy-reconciliation.md`
- `REPORTS/1172-loc-policy-reconciliation.tsv`
- `REPORTS/1172-loc-policy-compliance-workorder.md`
- `output.md`

No production code, tests, configuration, generated files, assembly, deploy,
proofs, PR presentation, or PR #1180 content changed. No PR was opened.

## Validation

- Exact checker: expected status 1 with exactly 69 policy rows.
- Ledger/checker cross-diff: exact path/reason/base/current/delta match.
- TSV: 69 data rows, nine columns, 69 unique paths.
- TSV classes: A=62/B=7; dispositions: 3/1/1/64.
- `git diff --check`: pass.
- Allowed-file diff from required start: pass; exactly the four files above.
- Full suite: not run. This is a report-only lane and the workorder explicitly
  forbids a full-suite run.

No source change was made.
