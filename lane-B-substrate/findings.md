# Lane B findings — PR #85651 cure-cycle N+8

**Question:** Does Path-D substrate `bd328fadd6` add anything Lane A candidate `ce144d00c2` did not?

**Answer:** No. Path-D adds zero net substrate beyond Lane A. Recommendation: **Lane A wins**; do not fold Path-D bytes into the candidate. Path-D's only unique contribution against `ce144d00c2` is stale/resurrected or negative substrate.

## Source/readback anchors

Runbook/source files read from the local bootstrap worktree, with `git log -1 --format=%H -- <path>`:

| SHA | Path |
| --- | --- |
| `57d03b8b122a9644d7d8a05e63b46ae9bbaed629` | `.specify/workorders/WO-RONAN-CURE-N8-EXECUTION-2026-05-30.md` |
| `c591c71ef5af06554510a7f3714a321a7d66caff` | `.specify/workorders/SUBSTRATE/path-d-methodology-extraction.md` |
| `5068a0766d3764d1b5b9abcf514663bf4a18b63d` | `RUNBOOKS/PRINCE-CODE-AGENT-RUNBOOK.md` |
| `b2f52bd8bd6248007d05fc69447e8472f5c3caa7` | `RUNBOOKS/PR-DRIFT-CURE-GATES-RUNBOOK.md` |
| `3c159436c4395bbcf8b7e25f58174f1aab372d16` | `RUNBOOKS/PR-PRESENTATION-RUNBOOK.md` |
| `ae18712a7d0b4850ce0a9f3d1a4c867e41018483` | `RUNBOOKS/HOW-TO-NAME-A-BRANCH-IN-OUR-OPENCLAW-FORK.md` |

Comparison refs:

| Role | SHA |
| --- | --- |
| PRH | `fc337f05d643d2829b26440b80726c19dd6409cd` |
| ANC | `b474f429ee4bb584ba259ee148db1c2a6b578d16` |
| ALT | `5d127388dffa9f646ee6ad1af9b1c81cd4ee9d1a` |
| PATHD | `bd328fadd65130e25d9b50986d420492b4fb5c99` |
| CE | `ce144d00c218360cdba41f1e4c3ddf42481e6fe7` |
| UPS | `8654353be892ce2334ed630e18cd0af3d3164a2c` |
| Lane A substrate push | `6150eaaa021d32f830a5c71b11f98c861423f152` |

## Byte-walk result

`git diff --name-status ce144d00c2..bd328fadd6`:

| Status | Count | Lane B classification |
| --- | ---: | --- |
| `M` | 562 | Mostly `integrated-with-upstream`: CE carries current/pinned upstream or replayed ALT form. |
| `D` | 48 | `integrated-with-upstream`: Path-D lacks files CE/upstream added or retained. |
| `R` | 6 | `integrated-with-upstream`: CE uses extracted package/new-path form; Path-D keeps older location. |
| `A` | 3 | `mechanical-rebase-mistake`: Path-D resurrects deleted PRH/ANC files. |

Full 5-ref blob matrix is in `lane-B-substrate/pathd-vs-lane-a-matrix.tsv`.

Aggregate matrix classification:

| Class | Count | Decision |
| --- | ---: | --- |
| `integrated-with-upstream` | 615 | Keep Lane A / CE form. |
| `preserved-against-upstream` | 0 | No Path-D-only valuable preservation found. |
| `mechanical-rebase-mistake` | 4 | Reject Path-D form. |

## RFC-B1 — topology explains the 619-file divergence

Path-D is a single blind-am substrate commit over `e9dee8dfe158243e92114701622d37fc50dd0bdf`. CE is the exact 8-commit continuation stack replayed over `4291e3277720b265720671fcc3ab20587c220d11`.

`git range-diff 5d127388df~8..5d127388df ce144d00c2~8..ce144d00c2` maps all 8 commits `=`:

1. `aeed959efd = b19cb5ce5d`
2. `aeba9bdd74 = ca31b780d6`
3. `f45a902f0b = dc746fd0e7`
4. `7ea707ce78 = 34d8c305f2`
5. `73204ca906 = 3c54150c59`
6. `3f874e5dd6 = 14563dcb2c`
7. `d5d8c51138 = 1d82cfb15f`
8. `5d127388df = ce144d00c2`

**Decision:** CE is the replayed/current form of the ALT substrate. Path-D's broad divergence is stale-base substrate, not novel value.

## RFC-B2 — Path-D-only additions are resurrected-deleted files

The only `A` entries in `CE..PATHD` are:

| File | PRH | ANC | ALT | PATHD | UPS | CE | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/tasks/task-flow-registry.paths.ts` | `7e770df97a` | `7e770df97a` | absent | `7e770df97a` | absent | absent | mechanical-rebase-mistake |
| `src/tasks/task-registry.paths.test.ts` | `0aa97f3b0a` | `0aa97f3b0a` | absent | `0aa97f3b0a` | absent | absent | mechanical-rebase-mistake |
| `src/tasks/task-registry.paths.ts` | `ee8564b1ce` | `ee8564b1ce` | absent | `ee8564b1ce` | absent | absent | mechanical-rebase-mistake |

CE/upstream have moved task persistence onto `src/state/openclaw-state-db.*`; these old path helpers have no CE/upstream references. This is a textbook resurrected-deleted-file case, not feature preservation.

## RFC-B3 — one mixed file is negative Path-D substrate

`src/auto-reply/reply/agent-runner.ts` is the only all/mixed-differ file after applying the matrix rules.

Path-D drops two things CE carries:

1. `loadSessionStore(storePath, { skipCache: true, clone: false })` from CE/UPS becomes `{ skipCache: true }` in Path-D.
2. `clearCliSessionBinding` extraction and `persistRunSessionUsage(..., clearCliSessionBinding)` from ALT/CE/UPS are deleted in Path-D.

**Decision:** `mechanical-rebase-mistake/killed-needed-lines`. Path-D subtracts substrate; it does not add anything Lane A lacks.

## RFC-B4 — CE-only files and renames are upstream integration, not Path-D value

The 48 `D` entries and 6 `R` entries from `CE..PATHD` are files CE has and Path-D lacks or old-locates. Examples include provider/docs externalization (`extensions/gmi/*`, `extensions/novita/*`, provider docs), package extractions (`packages/llm-core`, `packages/llm-runtime`, `packages/media-generation-core`), and the Discord account-token inspection refactor.

**Decision:** `integrated-with-upstream`. These are reasons Path-D is worse than CE, not substrate to fold into Lane A.

## DECLARE-DONE

Lane B independently verifies that Path-D `bd328fadd6` adds **zero** net substrate beyond Lane A `ce144d00c2`.

Recommendation: **ship/converge on Lane A**. Do not ship Lane B instead. No fold-into-Lane-A is needed from Path-D; retain Path-D only as negative evidence for stale/resurrected substrate.
