# Final product composition validation

**Verdict: PASS (focused-only).** Exact composed product candidate
`c27e802bf5a314c51eb661059922c95a92bd65b3` was validated read-only against
`92ae08ae5b74aeca70fbd57cf260e5fb28e274fc`. No Actions, PR, presentation, or
deployment work was performed.

Bound issues: `karmaterminal/openclaw#1292`, `karmaterminal/openclaw#1319`.

## Named refs

| Category | Named ref | Full SHA | Equality / use |
| --- | --- | --- | --- |
| Product/base ref | candidate `c27e802bf5a314c51eb661059922c95a92bd65b3`; base `92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` | candidate `c27e802bf5a314c51eb661059922c95a92bd65b3`; base `92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` | `merge-base(base,candidate) == base`; candidate tree `b00b05a18f17517c1ebccabd37b1c12fbd0e683b`; base tree `121305ff1fc050538b885dcb95d3fc06f96d042c` |
| Safe lane branch ref | `codeagent/validate-final-product-c27e802` / `origin/codeagent/validate-final-product-c27e802` / server `refs/heads/codeagent/validate-final-product-c27e802` | `c27e802bf5a314c51eb661059922c95a92bd65b3` before this report commit | Local, tracking, and server all exactly equal before evidence was credited |
| CI/workflow ref | N/A | N/A | Workorder prohibited Actions; acceptance path is focused-only |
| Presentation ref | N/A | N/A | Workorder prohibited presentation |
| Docs/proof ref | N/A | N/A | This `output.md` is the only proof artifact and is not an input to candidate validation |

## Dependency identity

Validation commands ran from the existing ordinary dependency clone:

`/home/figs/flesh_beast_best_beast/source/openclaw-compose-final-product-1292-1319-v2-deps`

The clone was clean at candidate SHA/tree
`c27e802bf5a314c51eb661059922c95a92bd65b3` /
`b00b05a18f17517c1ebccabd37b1c12fbd0e683b`. No install or dependency
reconciliation was run in the linked worktree.

| Input | Candidate SHA-256 | Dependency clone SHA-256 | Result |
| --- | --- | --- | --- |
| `package.json` | `3bf614d90620b81dd249081cdd9d33a1aa7fb6498308b212e09d9a45a0350681` | `3bf614d90620b81dd249081cdd9d33a1aa7fb6498308b212e09d9a45a0350681` | PASS |
| `pnpm-lock.yaml` | `f21f820bba80e804c60aa9367a2124d82dde44639a66ae4bd75943ab29088274` | `f21f820bba80e804c60aa9367a2124d82dde44639a66ae4bd75943ab29088274` | PASS |
| `pnpm-workspace.yaml` | `ba79a15090796cb267b0ea90089ad212b244f1021303fd5476310ad4b374e005` | `ba79a15090796cb267b0ea90089ad212b244f1021303fd5476310ad4b374e005` | PASS |

Tool versions: Node `v25.9.0`, pnpm `12.1.0`, Git `2.43.0`.

## Composition identity

The candidate range contains exactly three commits:

1. `8223339a868994a77a9616b5cfd63ff78a28c7aa`
2. `a3dce202836ac647ed9e8c6cdb2cb096326bbc9e`
3. `c27e802bf5a314c51eb661059922c95a92bd65b3`

Stable patch identity:

| Accepted patch | Composed commit | Stable patch ID | Count in `base..candidate` | Result |
| --- | --- | --- | --- | --- |
| `8223339a868994a77a9616b5cfd63ff78a28c7aa` (#1292) | `8223339a868994a77a9616b5cfd63ff78a28c7aa` | `8b4d831360170870a0e95032aa5000c7efacb7b0` | 1 | PASS |
| `6c47baa60808f99fbb505c04cfddcca4a6d00ce7` (#1319) | `a3dce202836ac647ed9e8c6cdb2cb096326bbc9e` | `078d0798579be5a0d7a9f49406911741b441f59a` | 1 | PASS |
| `7ddb61ea41f5f26b76bd0869c7ad4c7bbd06966a` (#1319) | `c27e802bf5a314c51eb661059922c95a92bd65b3` | `c14033f4e3905b409d859b65ee4afbecdcc0bf44` | 1 | PASS |

The complete composed diff is limited to the accepted patch paths:

| Path | Status | Added | Deleted |
| --- | --- | ---: | ---: |
| `extensions/telegram/src/callback-query-answer-state.test.ts` | added | 65 | 0 |
| `extensions/telegram/src/callback-query-answer-state.ts` | modified | 18 | 7 |
| `src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts` | modified | 3 | 0 |

Total: 86 additions, 7 deletions, 3 files. The direct parent chain starts at
the pinned base, every candidate commit has one accepted stable patch identity,
and accepted/composed path sets match. No unrelated commit, extra path, or
silent-revert delta was found. `git diff --check base..candidate` passed.

## Validation receipts

### Continuation reservation owner fixture

```sh
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.auto-reply-reply.config.ts \
  --maxWorkers=1 \
  src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts
```

PASS: 1 file, 7 tests. Duration: 30.77s. Log SHA-256:
`1a8e56274529dd55b6368f9f8e4df6710dbe3e999554a7e3329084bc90daf8c5`.

### Complete serial Telegram extension shard

```sh
node scripts/run-vitest.mjs run \
  --config test/vitest/vitest.extension-telegram.config.ts \
  --maxWorkers=1
```

PASS: 218 files, 3,960 tests. Duration: 568.13s. Log SHA-256:
`aef44f4812d9c6e8b1321cccc0d00c92ab74fca47f23b08de867346bd59c43f4`.

### Relevant checks

The explicit-path changed-check plan selected `coreTests`, `extensions`, and
`extensionTests`. Its aggregate run stopped at the max-lines ratchet because the
fork's `origin/main` does not contain `config/max-lines-baseline.txt`; the pinned
base does contain it. The baseline-sensitive ratchet was rerun with
`--base 92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` and passed with 867
grandfathered suppressions and `OPENCLAW_*` count 498/498.

| Check | Command | Result |
| --- | --- | --- |
| Formatting | `pnpm format:check --no-error-on-unmatched-pattern -- extensions/telegram/src/callback-query-answer-state.test.ts extensions/telegram/src/callback-query-answer-state.ts src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts` | PASS, 3 files |
| Extension production types | `pnpm tsgo:extensions` | PASS |
| Extension test types | `pnpm tsgo:extensions:test` | PASS |
| Core changed-file lint | `node scripts/run-oxlint.mjs --tsconfig config/tsconfig/oxlint.core.json src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts` | PASS |
| Telegram changed-file lint | `node scripts/run-oxlint.mjs --tsconfig extensions/tsconfig.json extensions/telegram/src/callback-query-answer-state.test.ts extensions/telegram/src/callback-query-answer-state.ts` | PASS |
| Conflict markers | `node scripts/check-no-conflict-markers.mjs` | PASS |
| Assertion safety | `node --import ./scripts/tsx.mjs scripts/check-assertion-safety-ratchet.mts --base 92ae08ae5b74aeca70fbd57cf260e5fb28e274fc` | PASS, 4,061 files / 12,319 grandfathered assertions |
| Candidate diff | `git diff --check 92ae08ae5b74aeca70fbd57cf260e5fb28e274fc..c27e802bf5a314c51eb661059922c95a92bd65b3` | PASS |

`pnpm tsgo:core:test` reports one inherited error at
`src/agents/subagents/announce/subagent-announce.requester-settle-wake.test.ts:236`.
The file's base and candidate blob are byte-identical:
`2ffcc13ee0b14cff9bfeb62c4de815ed6c5de803`. The composed range does not touch
that file or its production contract; no candidate-related core test type error
was reported.

Acceptance path: **focused-only**. No Mode-B workflow or Gate 3g fallback was
requested or used.
