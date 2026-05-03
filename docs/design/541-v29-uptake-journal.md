# v29-uptake journal — frond-scribe copilot lane

worktree: /home/figs/flesh_beast_best_beast/openclaw-wt-v29-uptake
output branch: frond-scribe/v29-uptake-of-canonical2-20260502
target merge-into: frond-scribe/20260429/v3-cohort-fixes
source porting-from: cael/325-canonical2 @ 99987d3813
tracking issue: karmaterminal/openclaw#541
v2026.4.29 SHA (must be ancestor of HEAD): a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd

## Classification table (filled in Step 3 below)

| commit       | shape                          | disposition   | reason                                                                                                                         |
| ------------ | ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cdd91edd5e` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `86f65ef1e3` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `6d082070a2` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `bca479cefb` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `c2f6ad3876` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `bd13188f79` | release-prep                   | DROP          | v2026.4.24 beta version/baseline prep is obsolete on v29 base.                                                                 |
| `9f6cda120d` | upstream heartbeat fix         | ALREADY-ON-V3 | Equivalent v29-side commit fd74fc5a4f is already in target.                                                                    |
| `3ee268cb4d` | upstream test infra fix        | ALREADY-ON-V3 | Equivalent v29-side commit 734748d4f4 is already in target.                                                                    |
| `1c98de9e66` | upstream plugin runtime fix    | ALREADY-ON-V3 | Equivalent v29-side commit d2ab6b4fd5 is already in target.                                                                    |
| `85839e5a13` | release-prep                   | DROP          | v2026.4.24 beta version/baseline prep is obsolete on v29 base.                                                                 |
| `6dbce80a43` | release notes                  | DROP          | Final 2026.4.24 changelog note is stale for the v29 uptake branch.                                                             |
| `9119ee6d75` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `da6530be0f` | release-prep                   | DROP          | v2026.4.24 beta version prep is obsolete on v29 base.                                                                          |
| `9d612c1b5d` | upstream plugin runtime fix    | ALREADY-ON-V3 | Equivalent v29-side commit 14c9cfb637 is already in target.                                                                    |
| `f2b5e5bc69` | release-prep                   | DROP          | v2026.4.24 beta version prep is obsolete on v29 base.                                                                          |
| `99de2cfcc5` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `1c927a553c` | release-prep                   | DROP          | v2026.4.24 beta version prep is obsolete on v29 base.                                                                          |
| `75349813c4` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `d45d5ff7f9` | release-prep                   | DROP          | v2026.4.24 beta version prep is obsolete on v29 base.                                                                          |
| `0168ca667d` | heartbeat prompt fix           | ALREADY-ON-V3 | Target already contains the trigger-policy prompt gating behavior/tests on v29 lineage.                                        |
| `cbcfdf62c7` | release-prep                   | DROP          | v2026.4.24 release version prep is obsolete on v29 base.                                                                       |
| `8ecf0c0b83` | continuation core              | ALREADY-ON-V3 | Equivalent v29-side continuation core landed as badf16cc5e and subsequent v3 cleanup waves.                                    |
| `0c00d42c3c` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `4ba4997752` | continuation tests             | ALREADY-ON-V3 | Equivalent v29-side coverage landed as 1c1d30e06c / v3 cleanup waves.                                                          |
| `6b1ba3bf4c` | generated/support surfaces     | ALREADY-ON-V3 | Equivalent v29-side generated/i18n/build support landed as 690ce67771 / v3 cleanup waves.                                      |
| `d65d0139e1` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `7bdab62f91` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `51cd381fc0` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `c4d779605c` | continuation fix               | ALREADY-ON-V3 | Equivalent provider/model volitional compaction plumbing landed as a8ac298a66.                                                 |
| `79006952ed` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `a654a8798e` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `c99aa116f8` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `8f267807c0` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `69b4079aef` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `14f792ad3a` | continuation type fix          | ALREADY-ON-V3 | Equivalent type tightening landed as fe9ff58866.                                                                               |
| `f279e0e6cf` | generated baseline             | DROP          | v24-rooted config baseline regen is basis-specific; Step 5 regenerates on v29.                                                 |
| `760f5a3306` | generated baseline             | DROP          | v24-rooted plugin SDK baseline regen is basis-specific; Step 5 regenerates on v29.                                             |
| `f4d3de09ed` | rebase repair                  | DROP          | Wrong-basis gateway ingress merge repair is stale on the v29 target.                                                           |
| `0985182e87` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `14b3418e1f` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `5b24433955` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `eb0361d8dc` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `6cdb079981` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `56cb6f712a` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `c96e2d7955` | base-noise cleanup             | ALREADY-ON-V3 | Equivalent cleanup landed as 2ce8f949b5 on v29.                                                                                |
| `8338d37bda` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `cc08bbc9fe` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `57d0e61d76` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `b0bc4b4ee2` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `0b9ee9f01b` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `96d1304d47` | infra lint mechanization       | ALREADY-ON-V3 | Equivalent substrate-adoption rule landed as e272ee7be0 on v29.                                                                |
| `25ff4f0138` | macOS allowlist fix            | ALREADY-ON-V3 | Equivalent wildcard allowlist fix landed as 3a93089110 on v29.                                                                 |
| `b04484465a` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `ce49d93113` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `1870a84f32` | continuation substrate         | ALREADY-ON-V3 | Equivalent chain-budget extraction landed as 4eb7ca22c1 on v29.                                                                |
| `bd3033d740` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `092f502032` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `953030d88f` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `2d10c1c218` | continuation tracer substrate  | ALREADY-ON-V3 | Equivalent traceparent/chain-budget helper landed as 4d7c0ea8b2 on v29.                                                        |
| `d533d5c720` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `ad6ac310c8` | continuation docs/descriptor   | ALREADY-ON-V3 | Equivalent substrate-naming/descriptor docs landed as 57ed8a1e3d on v29.                                                       |
| `be76c3dc2b` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `19797e7fa6` | continuation tracer substrate  | ALREADY-ON-V3 | Equivalent chain.id/work span substrate landed as 47ae9a8069 on v29.                                                           |
| `3655b0667a` | continuation tracer substrate  | ALREADY-ON-V3 | Equivalent delegate.dispatch span landed as 53cd2aff72 on v29.                                                                 |
| `4719e86345` | continuation tracer substrate  | ALREADY-ON-V3 | Equivalent continuation.disabled spans landed as 2c135ae41a on v29.                                                            |
| `6656138126` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `287d0a5586` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `e959d2c177` | continuation tracer substrate  | ALREADY-ON-V3 | Equivalent delegate.fire span landed as 5ac2129c28 on v29.                                                                     |
| `01abb3defc` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `a13b3baca7` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `47016eb417` | continuation tracer substrate  | ALREADY-ON-V3 | Equivalent work.fire span landed as 3e72fb21b3 on v29.                                                                         |
| `739063507f` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `560948a70a` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `934a59bd30` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `f767fe2161` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `cd8b623be2` | continuation tracer substrate  | ALREADY-ON-V3 | Equivalent compaction.released span landed as 4567f02bcc on v29.                                                               |
| `ecb434977c` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `02e2922241` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `5e90c859b9` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `c2400b2a66` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `652c8a888e` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `94fc8d1186` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `cb73bc8648` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `9187d06e90` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `8bb2fbad30` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `f37e4b8242` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `3d90f68b14` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `1b84e71c95` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `e4d49fc02b` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `fff243c781` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `bcccac2e91` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `526540de15` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `30b06a984e` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `148792a0b7` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `179f6c5799` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `29e556eb11` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `42f1bb9c14` | diagnostics OTEL adapter       | ALREADY-ON-V3 | Equivalent diagnostics-otel adapter wiring landed as e2158d7517 on v29.                                                        |
| `c8f85f5254` | continuation chain persistence | ALREADY-ON-V3 | Equivalent chain-persistence stabilization landed as a617975313 plus v3 cleanup waves.                                         |
| `d0f31f65cc` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `e73fd0f088` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `dc572c0106` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `15e045fe46` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `cf7830ffb3` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `2301d29248` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `9afc94e86d` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `f6bc29b270` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `23189e3ed1` | subagent announce runtime      | ALREADY-ON-V3 | Equivalent runtime bundle fix landed as 1603502794 on v29.                                                                     |
| `281f6d85cb` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `9a7d773942` | sandbox memory flush fix       | ALREADY-ON-V3 | Equivalent append-safe memory flush fix landed as 83847e970c on v29.                                                           |
| `5b360c6998` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `6302e5968d` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `a5434fbba7` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `a3dcc2adc2` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `356d05a2ba` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `97007ced79` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `1e21522fea` | patch-equivalent               | ALREADY-ON-V3 | Patch-equivalent to target per git cherry -v.                                                                                  |
| `9b31762f61` | compaction attribution fix     | ALREADY-ON-V3 | Equivalent attribution correlation landed as 2b9d4c5b36 on v29.                                                                |
| `a69c7e1e5e` | continuation RFC docs          | PORT          | Source-only RFC §6.7 OTEL queue-boundary trace wiring remains load-bearing documentation.                                      |
| `ae4c653488` | continuation regression test   | PORT          | Source-only store merge updatedAt churn guard is load-bearing continuation persistence coverage.                               |
| `afe015c415` | continuation regression test   | PORT          | Source-only request_compaction pending Set cleanup/restart coverage is load-bearing.                                           |
| `b72ab03718` | continuation descriptor test   | PORT          | Source-only exact-keys descriptor trap is load-bearing continuation tool-surface coverage.                                     |
| `35c65d4db9` | continuation compat test       | PORT          | Source-only mode-only PendingContinuationDelegate compatibility trap is load-bearing.                                          |
| `74940e55e0` | continuation OTEL test         | PORT          | Source-only delegate span uniformity coverage is load-bearing; temporary journal file will be omitted.                         |
| `a1c5b13458` | v3 cleanup squash              | ALREADY-ON-V3 | Equivalent Path-B cleanup waves A-E are already on target (7054aa1a73/2946145c1c/b160d0c911/8bedd3f326/0831ce3b8c/90ff152548). |
| `aa7a5859be` | continuation RFC docs          | PORT          | Source-only coarse-bucket rejection rationale is explicitly load-bearing for swim-40 readiness.                                |
| `1b321e1339` | continuation schema default    | ALREADY-ON-V3 | Target already has earlyWarningBand .default(0.3125), generated schema, and v3 workorder coverage.                             |
| `fb69037275` | continuation regression test   | PORT          | Source-only volatile map allowlist guard is load-bearing continuation architecture coverage.                                   |
| `e8bc1097c6` | continuation P1/P2 fixes       | ALREADY-ON-V3 | Target already preserves legacy silent-wake decode and numeric delay-string parsing via v3 cleanup fixes.                      |
| `99987d3813` | security-boundary hotfix       | ALREADY-ON-V3 | Target already contains nativeCommandAuthorized command-auth code and owner-default coverage.                                  |

## Classification summary

PORT: 8
ALREADY-ON-V3: 110
DROP: 11
CONFLICT: 0 initially; conflicts, if any, will be documented during Step 4.

## Step 4 conflicts

None yet.

## Step 4 applied PORT commits

- `a69c7e1e5e` — RFC OTEL queue-boundary trace wiring docs.
- `ae4c653488` — continuation store merge updatedAt churn guard.
- `afe015c415` — request_compaction pending Set cleanup/restart guard.
- `b72ab03718` — continue_delegate descriptor exact-keys guard.
- `35c65d4db9` — PendingContinuationDelegate mode-only compatibility guard.
- `74940e55e0` — delegate span uniformity tests. Applied without the temporary `tmp-drop-me-otel-span-uniformity.md` note.
- `aa7a5859be` — RFC coarse-bucket rejection rationale.
- `fb69037275` — volatile map allowlist guard.

No cherry-pick conflicts occurred.

## Step 5 generated baselines

`pnpm config:docs:gen` and `pnpm plugin-sdk:api:gen` completed with no tracked `.sha256` drift on the v29-rooted branch.

## Step 6 gates

- `pnpm install --prefer-offline` completed.
- `pnpm tsgo` passed.
- `pnpm check` passed.
- `pnpm build` passed.
- `pnpm test src/auto-reply src/agents/tools/request-compaction-tool.test.ts src/agents/tools/continuation-tools-registration.test.ts src/config/zod-schema.continuation.test.ts` passed after fixing the auto-reply directory target routing bug that initially sent `src/auto-reply` to the default unit shard.
- During the exact scoped test gate, the active-session `/compact` e2e exposed that first-turn manual compaction updated the in-memory session entry but not the missing on-disk store entry. Fixed by making `incrementCompactionCount` merge-or-create from the active session entry before persisting.

## Step 7 final ancestor verification

`git merge-base --is-ancestor a448042c2edd94a4e8ee86d5ed90a5ed9fe8e4cd HEAD` exited 0.

## Step 9 canonical2 open PR assessment

`gh pr list --repo karmaterminal/openclaw --base cael/325-canonical2 --state open --limit 50` returned 0 open PRs.

REDIRECT: 0
CLOSE-WITH-REASON: 0
WAIT: 0

## Step 10 — Strip-and-relane of the b82fd65c00 compaction-fix (post-Codex review)

After cohort cleanup re-verify GO on `ff269722af` (🌫 + 🌊 cosigned working-branch-readiness), Codex
auto-review fired on the new HEAD and surfaced two empirically-valid P2 findings on the
`b82fd65c00` (renamed `c5792eb976`) compaction-fix at `src/auto-reply/reply/session-updates.ts:309-318`:

1. **Lost merge semantics**: raw `{...storedEntry, ...updates}` spread bypasses
   `mergeSessionEntry` (`src/config/sessions/types.ts:510`) — drops monotonic-`updatedAt` guard
   (`resolveMergedUpdatedAt` returns `Math.max(existingUpdatedAt, patchUpdatedAt, now)`,
   protecting against backward time-travel from concurrent compaction races) AND drops
   `sessionStartedAt` rollover when sessionId changes (`existing.sessionId === sessionId
? existing.sessionStartedAt : updatedAt`, load-bearing during `/compact` since sessionId
   does roll).
2. **Lost activeSessionKey protection**: bare `updateSessionStore(storePath, mutator)` doesn't
   pass `opts`. Old path `updateSessionStoreEntry` → `persistResolvedSessionEntry` →
   `saveSessionStoreUnlocked({ activeSessionKey: params.resolved.normalizedKey })` protected
   the active session from pruning by enforce-mode maintenance / disk-budget cleanup running
   in the same lock window. Bare `updateSessionStore` drops it; race window is narrow but real.

Both findings byte-walked + verified by 🌫 (msg `1500308473165123615`) and 🌊 (msg
`1500308822084943972`); the canonical pattern Codex names lives at `recordSessionMetaFromInbound`
(`store.ts:706-741`) which uses `mergeSessionEntry` + passes `{ activeSessionKey: normalizeStoreSessionKey(sessionKey) }`.

**Cohort verdict: (A) Strip-and-relane.** Two cohort seats (🌫 + 🌊) converged on stripping the
fix from #542 + filing a separate narrow PR with proper canonical-primitives shape + targeted
test coverage. Reasoning: operationalizes earlier surface-flag #5 (a real bug fix should have
its own narrow PR with targeted test-coverage description), keeps #542 squashable as a
pure port-PR for cael's eventual upstream-canonicalization ceremony, lands cleaner git-blame
discoverability for future princes hitting `incrementCompactionCount` keypath territory.
Trade-off accepted: temporary first-turn manual `/compact` count persistence regression on
the working branch between #542-merge and narrow-PR-merge (mitigation: narrow PR queued
pre-#542-merge so it's ready to land within hours).

**12th closure-costume catalogued by 🌊**: `fix-introduces-regressions-while-curing-original`
— 8th-costume family. Cohort byte-walked the FIX shape (resolve-then-merge-or-create from
active session entry) but didn't byte-walk what the OLD API provided that the NEW path drops
(merge-semantics + activeSessionKey-preservation). Codex auto-review caught what 3-seat
cohort byte-walk missed; defense-in-depth via auto-review-tools + cohort-byte-walk worked
exactly as designed.

**Action taken on this branch**: `c5792eb976` dropped via `git rebase -i 55df7162c0` with
`GIT_SEQUENCE_EDITOR='sed -i "/^pick c5792eb976/d"'`. `git diff 55df7162c0..HEAD --
src/auto-reply/reply/session-updates.ts` returns empty — file is byte-identical to v29-base.
Other 15 commits intact (with new SHAs from rebase rewrite). The first-turn-manual-`/compact`-
count-persistence latent bug returns to the working branch until the narrow follow-up PR lands.

**Narrow follow-up PR (queued)**: `frond-scribe/20260502/incrementCompactionCount-canonical-primitives`
off `frond-scribe/20260429/v3-cohort-fixes` — applies the fix using `mergeSessionEntry` +
`{ activeSessionKey: normalizeStoreSessionKey(sessionKey) }` mirroring `recordSessionMetaFromInbound`,
with targeted tests for: first-turn-no-on-disk-entry case, `sessionStartedAt`-rollover on
sessionId change, monotonic-`updatedAt` guard against concurrent-write races,
activeSessionKey-preserve-from-prune on enforce-mode cleanup. Tracking issue TBD.
