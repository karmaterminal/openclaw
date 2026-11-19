# `## Evidence` body diff for openclaw/openclaw#129388, at `5e123856`

Draft for 🌊's review. Nothing here has been applied: the PR's head and body are untouched. Bound to openclaw/openclaw#129388. 🌿 frond-scribe, via Claude Code, 2026-11-19.

## What the diff is against

- **Live body**: sha256 `e04b6162014ce5ead4333bfa7b986e375c4067925c8be1498c53150a0ac4f564` (the raw `body` string, trailing newlines included), fetched 04:47Z and re-checked 07:13Z. The PR head was `9bfc4d31993763f51f9a3597b808e741908df660` both times.
- **Proposed body**: `evidence-body-proposed.txt` on this branch, sha256 `15c5418c406b2f8851dd59942afc5662b77190b2e307570c83e7530769143eee`. It's a `.txt` so the repository's Markdown formatter can't change its bytes.
- **The candidate the evidence describes**: `5e123856a1a3652e3340ac3ca25ede63a6673cae`, written as the head after 🌊's fast-forward from `9bfc4d31` (`git merge-base --is-ancestor 9bfc4d31993763f51f9a3597b808e741908df660 5e123856a1a3652e3340ac3ca25ede63a6673cae` exits 0).

## The gate is not green, and the draft says so

The `## Evidence` section reports the scoped gate at `5e123856` exactly as measured (`gate-receipts.md` at `d7e76bc3`). Three red groups:

- `8a5ceee4` breaks 31 tooling tests in 6 files. This is new in this candidate.
- `ci-node-test-plan` ×2 comes from staging commit `ead22254`.
- `queue.drain-restart` ×3 is carried from `9bfc4d31`.

If 🌊 repairs first, the successor needs the gate rerun and a regenerated section. The edit script below reapplies the same three edits mechanically to a fresh `evidence-section.md`.

## The three edits (nothing else changes)

1. **A new `## Evidence` section**, placed between the `---` rule and `## Real behavior proof`. It sits there rather than inside that section so that no existing subsection is re-nested. Upstream's PR template uses a top-level `## Evidence`. The section gives a plain summary first, then the red groups and the result table. Commands, how the sets were built, and provenance go in `<details>`. It uses only receipts at `5e123856`:
   - this lane's gate;
   - 🌊's independent 95/95 rerun of the six changed test files (cohort review message `1572832136866562079`, 04:33Z), credited to "a second reviewer".

   The `465b2e5d` and ab5a receipts appear only as provenance at their own SHAs. The section also says that ab5a is not an ancestor of the candidate.

2. **"Presented candidate"**: `a22bd9c05c…` becomes `5e123856…` (tree `132c2eb7…`), reached by fast-forward from `9bfc4d31` and carrying upstream `b894fe5e`. `a22bd9c05c` and `3821eaef` stay named as ancestors.
3. **`### Receipts bound to this exact head`** becomes `### Receipts bound to the earlier head \`a22bd9c05c\` (provenance)`. Once the candidate line names `5e123856`, "this exact head" would claim `a22bd9c05c`'s packet for `5e123856`. The rest of that subsection reads correctly under the new heading.

## Left alone, for 🌊 to decide (outside "don't rewrite other sections")

- **`## Future actions and #130741 composition`** says "the current candidate and #130741 head `e1afc703…` merge cleanly". That was measured at an earlier candidate. #130741 is now closed unmerged (head `96f043a2`), and the claim isn't re-measured at `5e123856`.
- **`## Lineage and replacement context`** says the branch carries "a complete proof subtree bound to its presented SHA". After the move, the preserved packet is `a22bd9c05c`'s, and the body's own packet status says it is not acceptance-complete.
- **`### Testing posture`** still suggests `pnpm vitest run -t continuation`. That's unchanged and not part of this gate.

## Verification with upstream's own evaluator

`evaluatePullRequestContext` from `scripts/github/real-behavior-proof-policy.mjs`:

- upstream `main` `67aacbb676e55db620f56fbdb5132726d69ff512`, re-checked at `818ec628a350b94edc8f7c411ba9ed23f5174720`;
- blob `cfa3f9da52b99c80259c101fc1386a07a7e6e638`;
- its three imports resolved from the same tree, all with unchanged blobs: `scripts/lib/bounded-response.mjs` `9529888b`, `regexp.mjs` `31d063c2`, `timeout-error.mjs` `46da66c2`.

It ran on the live PR object (author `karmafeast`, `CONTRIBUTOR`, so the gate applies) with only `body` replaced.

| body                                                                       | verdict                                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| live body today                                                            | `{"status":"missing","reason":"External PRs must include authored Evidence sections.","applies":true,"passed":false,"missingSections":["Evidence"]}` |
| **proposed body**                                                          | **`{"status":"passed","reason":"External PR includes problem context and evidence.","applies":true,"passed":true}`**                                 |
| negative control: proposed edits with the section's body replaced by `N/A` | `{"status":"missing",…,"missingSections":["Evidence"]}`                                                                                              |
| negative control: proposed body with the `## Evidence` section removed     | `{"status":"missing",…,"missingSections":["Evidence"]}`                                                                                              |

The problem side passes through the body's existing legacy field `**Behavior or issue addressed:**` under `## Real behavior proof`, which the edits keep. `hasAuthoredPullRequestSection("Evidence", proposed)` is `true`.

## Applying it (🌊, after the ref move; not done here)

```bash
# 1. the live body must still be the one this diff was cut against
gh api repos/openclaw/openclaw/pulls/129388 | jq -j .body | sha256sum   # expect e04b6162…f564
# 2. patch it
gh api -X PATCH repos/openclaw/openclaw/pulls/129388 -F body=@evidence-body-proposed.txt
# 3. read it back
gh api repos/openclaw/openclaw/pulls/129388 | jq -j .body | sha256sum   # expect 15c5418c…3eee
```

Reproduce the proposed bytes: `apply-body-edit.py body-current.md evidence-section.md body-proposed.md`. It's in the receipts bundle; it makes three exact-match edits and refuses if any anchor is missing or ambiguous.

Receipts bundle: MinIO `frond/shared-media/prince-handoff/2026-11-19/frond-scribe/129388-evidence-5e123856/129388-evidence-5e123856-receipts-20261119T071517Z.tar.zst`, sha256 `09148ae8701c70ef4a8c12b0b2806dc294d4eb5be81c20b50c1e46e69c85ad19`. It holds every log, both sets, the scripts, the evaluator copy, and the live and proposed bodies.

## The exact unified diff

```diff
--- openclaw/openclaw#129388 body (live, sha256 e04b6162…)
+++ proposed
@@ -195,6 +195,73 @@
 ---
 
 
+## Evidence
+
+**Checked at exactly the presented candidate,
+`5e123856a1a3652e3340ac3ca25ede63a6673cae`, on 2026-11-19.** This is a scoped
+presentation gate: type checks, full lint against upstream, the continuation
+tests, and the tests that import a module the upstream merge or a later commit
+touched. It is not full CI, and it is **not green**:
+
+- **31 tooling tests in six files fail because of one commit in this
+  candidate**, `8a5ceee4` (it keeps compiler flags on the Control UI build
+  children). That commit imports the root `node-runtime-env.mjs` from
+  `scripts/lib/dist-artifact-ownership.mts`, and the shared fixture that copies
+  `scripts/lib` into a temporary checkout doesn't copy that file. The six files
+  pass at upstream `b894fe5e`, and pass here with that one file restored.
+- **2 tests in `test/scripts/ci-node-test-plan.test.ts` fail**: the scheduled
+  test inventory plans 78 jobs against upstream's cap of 77. A staging commit,
+  `ead22254`, tipped it over by routing one continuation test to the
+  host-broker worker list. Its parent, the previous head `9bfc4d31` and
+  upstream pass.
+- **3 tests in `src/auto-reply/reply/queue.drain-restart.test.ts` fail**, the
+  same three that fail at the previous head `9bfc4d31`. Upstream passes them.
+
+| check | result at `5e123856` |
+|---|---|
+| Type check: `tsgo:core`, the 32 core test graphs and the 4 root test graphs | 0 errors |
+| Full type-aware lint (`scripts/run-lint.mts`) | 23 errors and 284 warnings, against upstream's 20 and 284. The warnings are identical; the 3 extra errors are `max-lines` in files unchanged since `9bfc4d31` |
+| Continuation tests, 199 files | 197 passed, 1 skipped (an opt-in benchmark), 1 timed out under host load. That one is an upstream test; it passes alone here (87 s of its 120 s budget) and on a rerun of its group |
+| One-hop impacted tests, 366 files | 351 passed, 10 skipped (PostgreSQL, no server), 5 failed: three files from `8a5ceee4` (13 tests), `ci-node-test-plan` (2) and `queue.drain-restart` (3) |
+| Independent rerun by a second reviewer of the six test files changed since the staging head | 95/95, across four shards |
+
+Not run at this SHA: Mode-B, upstream CI, the PostgreSQL suites, and any live
+proof row (see Real behavior proof below).
+
+<details>
+<summary>Sets, commands, and provenance</summary>
+
+- Tests ran with one worker through the repository runner
+  (`node scripts/run-vitest.mjs run --maxWorkers=1`, batches of 40) on its local
+  default runtime. The eleven test files that consume `dist-artifact-ownership.mts`
+  also ran on Node 24.21, with the same 13 failures and no others.
+- Continuation set: `src/auto-reply/continuation/**`, every `*continuation*`
+  test under `src/` and `extensions/`, and the `continue-*` and
+  `request-compaction` tool tests.
+- One-hop set: every test that imports a module the upstream merge resolved by
+  hand, or a non-test module changed after it, plus the tests changed since the
+  staging head, minus the continuation set. Three of the six `8a5ceee4` files
+  sit outside it; a sweep of the tests that copy `scripts/lib` found them.
+- Every failure was rerun at upstream `b894fe5e` on the same files. The full
+  receipt, with commands, controls and log hashes, is
+  [`gate-receipts.md`](https://github.com/karmaterminal/openclaw/blob/d7e76bc3556d40fdc3b7a0697a3402f62187a925/gate-receipts.md).
+- The second reviewer's rerun: cohort review message `1572832136866562079`,
+  2026-11-19T04:33Z.
+
+Provenance only, at their own SHAs. None of it tests this candidate:
+- the staging head `465b2e5d51fa9c26c579bb90b716a8ff5cfba3d2`, an ancestor: on
+  2026-11-18 the PostgreSQL schema-authority ladder ran green at
+  `ed4e5b344f461ae45efb4235ec30b92e6c76a3de` against a pinned pgvector server;
+- the deployed fleet line `ab5a30ea79b776f149e24b1fccab9e79b0a5d299`, which
+  shares `51ff02dc` with this candidate but is not its ancestor: Mode-B
+  [`43711027259`](https://github.com/karmaterminal/openclaw-bootstrap/actions/runs/43711027259)
+  (2026-11-15) finished non-green, and live k6 run
+  [`44245772142`](https://github.com/karmaterminal/karmaterminal-openclaw-docs/actions/runs/44245772142)
+  (2026-11-18) ran 33 rows: 16 PASS-candidate, 16 PARTIAL-candidate and
+  1 FAIL-candidate, all pending fold review.
+
+</details>
+
 ## Real behavior proof
 
 **Behavior or issue addressed:** Sessions can elect future work with
@@ -203,14 +270,17 @@
 budgets, restart recovery, finalization ownership, and trace lineage across
 those boundaries.
 
-**Presented candidate:** `a22bd9c05c4a7a9c86e72a132cb7939e399104cb`
-(tree `53363f7964f31a47109cf0575aa23f31eefa0338`), the exact upstream-visible
+**Presented candidate:** `5e123856a1a3652e3340ac3ca25ede63a6673cae`
+(tree `132c2eb7a024be7db6076cf504205bae135f0b09`), the exact upstream-visible
 head of `codeagent/85651-upstream-1ba243c8-gates`. It was reached by
-fast-forward on 2026-11-05. Every earlier presented head, including
+fast-forward from `9bfc4d31993763f51f9a3597b808e741908df660` and carries
+upstream `main` at `b894fe5e3729482eeab747b5758bd79acb2511d1`. Every earlier
+presented head, including `a22bd9c05c4a7a9c86e72a132cb7939e399104cb` and
 `3821eaef72677c78f450ae9956cb582a22ba4cba`, remains an ancestor; no presented
-history was rewritten.
+history was rewritten. The checks run at this exact SHA are under Evidence
+above.
 
-### Receipts bound to this exact head
+### Receipts bound to the earlier head `a22bd9c05c` (provenance)
 
 Each is a separate receipt in the preserved exact-head packet,
 [`PROOFS/a22bd9c05c…/`](https://github.com/karmaterminal/karmaterminal-openclaw-docs/tree/9ba5518bdb079da3c3c75961fd8cd26be040eb1e/PROOFS/a22bd9c05c4a7a9c86e72a132cb7939e399104cb)
```
