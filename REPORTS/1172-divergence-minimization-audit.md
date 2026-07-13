# #1172 divergence-minimization audit

Status: Phase 1 evidence complete; GitNexus and owner-boundary decisions pending.

## Executive recommendation

Preserve upstream file topology unless a candidate passes all ten qualification checks. The removed LOC ratchet eliminates the only size-only reason to split the former 71-file set. No extraction is qualified at this checkpoint.

## Exact comparison set

| Role | SHA |
| --- | --- |
| Feature/fix parent | `0305546aa97247d344c92f3527022dccb0842b25` |
| Absorbed upstream | `d9623bd46f3de8bfcc4045859dddf2bbc2865507` |
| Candidate/audit base | `69a8d2beeafa39b4cbea45303e9dd695cfdc8a65` |
| Frozen newer upstream | `35fb5ee81ac6d0caedf624171d755957b8911543` |
| LOC-ratchet removal | `3375e30d9c467e51550a67451367579215015b71` |

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

Current provisional counts are A=62, B=7, C=0, D=2. These counts can change only if GitNexus plus frozen-upstream responsibility analysis proves a class-C owner overlap.

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

## GitNexus evidence

Pending the required borderline-seat index.

## Shared-host decisions

Pending GitNexus evidence and full module/caller/sibling reads. The locked default is no split.

## Feature-owned decisions

Pending GitNexus evidence and full module/caller/sibling reads. Long-file status alone will not qualify a split.

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

Pending. No implementation lane should fire before GitNexus and the ten-check gate are complete.

