# #129388 purity audit: composite-derived bytes in presented head `9bfc4d31`

Read-only audit for openclaw/openclaw#129388, 2026-11-19. Requested by 🌊 (msg 1572894372419080215): "run the purity audit across the presented head before any PR move. Keep the drain-restart repair upstream-byte-clean and report any other composite-derived files with their introducing commits."

## Verdict

The drain-restart binder is one symptom of a larger problem. **The presented head carries the whole #1564 fleet-composite forward-merge** (karmaterminal/openclaw#1564, "Forward-merge live fleet composite onto j14 prep"). The issue still describes itself as a "draft integration candidate only".

- The presentation lineage contains **exactly one** composite merge: `7c4e1d76c8` "Merge fleet composite forward onto j14 prep". Its parents are j14 prep `541d0428` and the fleet line `0ab8db762f` (`frond/1415-room-collect-base`, km#1557, "contains every seat's build"). Through that second parent it brings in 219 fleet-only commits and 46 fleet-line merges, including the grafts openclaw#121204, openclaw#124337 and openclaw#182252. 28 #1564 follow-up commits on the first-parent chain then reconcile the composite.
- **The split is exact.** Start from j14 prep `541d0428` and replay only the 22 continuation commits that sit on top of the composite. Every replay is clean (`git merge-tree`, 0 conflicts). The result (tree `bc61c99e31`) differs from `9bfc4d31` in exactly **282 files, +19,753/−3,443**. That set is identical to the set of files the composite commits touched. One more file, a test-line allocation, was added by continuation-lane commits but only accounts for composite test lines.
- **Per-file classes** (1,319 files in `git diff --no-renames 401a1de3 9bfc4d31`):

  | class             | files |
  | ----------------- | ----: |
  | CONTINUATION      | 1,036 |
  | COMPOSITE-DERIVED |   252 |
  | MIXED             |    31 |

- **Only 2 files contain continuation-owned composite bytes.** Those bytes are the #1550 regression row in `work-dispatch-authority.test-support.ts` and `work-dispatch.durable-7.test.ts`: 108 lines, from km#1553 `a2bf43f52a` plus the `7c4e` resolution. The production fix is already in `541d` (`fbde8662ca`, j12 finding F-1). Re-land that row as a continuation commit; it should not ride in on the composite. **Everything else is (b), composite carry.**
- **The drain-restart class goes further than the binder.** 4 composite files are files that upstream #185730 (`9344233e7a`) deleted:
  - the `sessions.recover` RPC (server method and protocol schema);
  - `server-restart-sentinel-continuation-intent.ts`;
  - `server-restart-sentinel-session-event.ts`.

  13 more files revive lines that #185730 deleted. These files put back restart behavior that upstream retired. See §3.2.

- **Drain-restart (task 4): confirmed upstream-byte-clean.** Both session-controller files have the same blob at `401a1de3`, `541d0428`, `b894fe5e` and the two-reds tip `0306ff3b92` (after `9d25100c93`). No continuation commit ever touched either file. Two caveats apply (§4). The sibling files `session-controller.mailbox-source.ts` and `session-controller.mailbox-dispatch.ts` still carry composite hunks. `9d25100c93` also edits and keeps a composite-new test, `dispatch-from-config.ingress-cancellation.test.ts`, which comes from the #124337 graft.

## Named refs

| category                   | ref                                                                                                        | full SHA                                                                                        | equality                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| product / presented head   | `karmaterminal/openclaw` `codeagent/85651-upstream-1ba243c8-gates` = openclaw/openclaw#129388 `headRefOid` | `9bfc4d31993763f51f9a3597b808e741908df660`                                                      | local = server = PR head                                             |
| merge-base with upstream   | `upstream/main` merge-base                                                                                 | `401a1de38b9a4c7ee3f1b19908df777a2f02506d`                                                      | `git merge-base 9bfc4d31 upstream/main`                              |
| upstream reference         | `b894fe5e` (upstream main, 2026-11-18)                                                                     | `b894fe5e3729482eeab747b5758bd79acb2511d1`                                                      | ancestor of `upstream/main` `ebbd85cb6e`                             |
| reviewed slice (workorder) | `51ff02dc16`                                                                                               | `51ff02dc16d0b4ac08c0c1ea544f98a391faecad`                                                      | on the first-parent chain, 12 commits below the head                 |
| pre-composite j14 prep     | `7c4e1d76c8^1` = `origin/rune/20261111/c8-inventory-mock`                                                  | `541d0428079020653342ae49f6f520e97be9135a`                                                      | first parent of the composite merge                                  |
| composite merge            | `7c4e1d76c8`                                                                                               | `7c4e1d76c8adb11479ad2b2161f1d721f995e66c`                                                      | first-parent ancestor of the head                                    |
| fleet line                 | `7c4e1d76c8^2` = `origin/frond/1415-room-collect-base`                                                     | `0ab8db762f60254d93b7349a862c57e992ca6b43`                                                      |                                                                      |
| fleet fork point           | `merge-base(0ab8db762f, 541d0428)`                                                                         | `8183790aad6d389ebb86cb57ddba2788fa748616` (j8 candidate, "Merge finished-child-wake-j8-order") |                                                                      |
| two-reds lane              | `origin/codeagent/129388-staging-two-reds`                                                                 | `0306ff3b9218d6eaf0afc32ab7992dcf73a087b1`                                                      | fetched 2026-11-19                                                   |
| lane (safe) branch         | `codeagent/129388-purity-audit`                                                                            | published unchanged at `9bfc4d31…` before any evidence; local = tracking = server               | artifacts-only commit on top                                         |
| CI / workflow              | N/A                                                                                                        | N/A                                                                                             | read-only git archaeology. No Mode-B or test run (workorder: "none") |
| presentation               | openclaw/openclaw#129388                                                                                   | head `9bfc4d31…`                                                                                | read-only. Not moved                                                 |
| docs / proof               | this file + `output.md` (untracked)                                                                        | on `codeagent/129388-purity-audit`                                                              |                                                                      |

GitNexus: not used for any verdict. No registered index matches `9bfc4d31` or `541d0428`. The nearest is `openclaw-composite-39d19454` at `39d1945464`, a mid-#1564 commit. Every claim here comes from exact git ancestry, blame and tree comparison at the named SHAs.

## Method

1. **Shallow-clone caveat.** The shared clone is shallow at `fa85b5b237` (2026-09-20). `git rev-list 401a..9bfc` therefore reports 98,570 commits, most of them pre-cut upstream history that the fork carries, so a range listing cannot attribute anything. Every attribution below uses `blame --first-parent`, per-commit first-parent diffs and tree comparison instead, and none of these depend on the cut. Where a plain blame lands on `fa85b5b237` it means "upstream bytes older than the cut".
2. **First-parent attribution.** `git blame --first-parent` at `9bfc4d31` ran over every added line of `401a1de3..9bfc4d31` (191,917 lines, 0 unattributed, 607 distinct first-parent commits). Lines attributed to `541d0428` or earlier are stage A. Lines attributed to the 50 linear first-parent commits `541d0428..9bfc4d31` are stage B.
3. **Counterfactual.** Starting at `541d0428`, each of the 22 stage-B continuation commits was replayed with `git merge-tree --write-tree --merge-base=C^1`. All 22 applied without conflicts, and no ref was written. The result was compared with `9bfc4d31`.
4. **Origin clusters.** Each composite-contributed line (counterfactual → head `+` lines) gets a plain blame at the head. Its original commit is then mapped to the first fleet-line first-parent commit that contains it. That commit gives the carrying PR, graft or #1564 follow-up. Upstream-ancestor origins mean upstream bytes that `401a` no longer has.
5. **Dependency check.** 108 exports appear on composite `+` lines. None of them is both absent from `401a1de3` and referenced anywhere in the counterfactual tree. Continuation code (the counterfactual) therefore makes no reference to any composite-only export.
6. **#185730 revival.** Composite `+` lines (≥30 chars) were matched against the `−` lines of upstream `9344233e7a` (#185730), same file only. Separately, composite-new files were checked for existence at `9344233e7a^`.

## 1. Composite and fleet merges in the presentation lineage

### 1.1 On the first-parent (presentation) chain: one merge

| merge                                                                         | parents                                                                                                                                                                  | provenance                                                                 | introduces                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `7c4e1d76c8` "Merge fleet composite forward onto j14 prep" (rune, 2026-11-11) | `541d0428` (j14 prep, `rune/20261111/c8-inventory-mock`) + `0ab8db762f` (`frond/1415-room-collect-base`, km#1557 "one forward fleet line … contains every seat's build") | karmaterminal/openclaw#1564, lane branch `codeagent/1564-restart-evidence` | 206 files, +14,115/−1,060 against its first parent. 13,843 of the head's added lines attribute to the merge itself under `blame --first-parent` |

Every other first-parent merge in `401a1de3..9bfc4d31` is one of two kinds. Some merge upstream (`Merge upstream … into …`). The rest merge continuation lanes, and their second parents come from continuation branches such as `codeagent/continuation-*`, `codeagent/absorb-8083-*`, `codeagent/f2-*`, `codeagent/j12-*`, `pr-148x`, `ronan/1510-reset-timer-refs`, and the #1558, #1561, #1562 and #1563 j13 PRs. No first-parent merge before `7c4e` reaches a fleet, composite or graft commit, as §1.4 proves.

### 1.2 Fleet-line merges reached through `7c4e1d76c8^2` (46)

The commits behind these merges are "fleet-own": reachable from `0ab8db762f`, not from the fork point `8183790aad`, and not from upstream. There are 219 of them, and all 219 are reachable from `9bfc4d31`.

| merge        | date       | parent 1     | parent 2     | parent-2 provenance (`origin/…`)                                            | subject                                                                                                        |
| ------------ | ---------- | ------------ | ------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `7dfac7ca16` | 2026-10-06 | `2d997a0bcd` | `cc7e664dfe` | `savegame/20261011T221630Z/pr-121204-pre-backmerge-7dfac7ca16^2`            | Merge upstream main into discord stale-backlog policy                                                          |
| `edcbb5aec7` | 2026-10-11 | `41277c50d2` | `b3c7dc2af7` | `gloss/121204-backmerge-20261011~10^2`                                      | Merge upstream main into discord stale-backlog policy                                                          |
| `8853b1ae51` | 2026-10-11 | `51631e61a2` | `042db1e706` | `savegame/20261011T231846Z/gloss-124337-backmerge-misplaced-8c9ef58043~3^2` | Merge upstream main into ingress retry-budget abandonment                                                      |
| `ce67be7d4f` | 2026-10-11 | `7dfac7ca16` | `042db1e706` | `savegame/20261011T231846Z/gloss-124337-backmerge-misplaced-8c9ef58043~3^2` | Merge upstream main into discord stale-backlog policy                                                          |
| `96829252f4` | 2026-10-16 | `3d237ac8d5` | `9c87c4e826` | `gloss/bm-124337-on-9c87c4e8~4^2`                                           | Merge upstream main into discord stale-backlog policy                                                          |
| `15499d136a` | 2026-10-16 | `50fa8f0ecd` | `646647245f` | `gloss/bm-124337-on-9c87c4e8~1^2`                                           | Merge upstream main into ingress retry-budget abandonment                                                      |
| `f0caba791f` | 2026-10-16 | `bf4ff61e30` | `5a93d92ef7` | `savegame/20261016T221412Z/bm-121204-pre-trailer-fix-a94e99a5~2^2`          | Merge upstream main into discord stale-backlog policy                                                          |
| `e7ef059e18` | 2026-10-16 | `ee2f6dfdf6` | `9c87c4e826` | `gloss/bm-124337-on-9c87c4e8~4^2`                                           | Merge upstream main into ingress retry-budget abandonment                                                      |
| `3cd32643c6` | 2026-10-22 | `493d5bf21f` | `827aae9c0b` | `savegame/gloss-124337-pre-ff-7ab6-20261023~1^2`                            | Merge upstream main 827aae9c0b into ingress cancellation adapters                                              |
| `3728452458` | 2026-10-22 | `7d0bff09f4` | `79ab1c4907` | `savegame/gloss-121204-pre-ff-7ab6-20261023~1^2`                            | Merge upstream 79ab1c4907 into discord stale-backlog policy                                                    |
| `1add83f4a1` | 2026-10-22 | `c5534a26f2` | `79ab1c4907` | `savegame/gloss-121204-pre-ff-7ab6-20261023~1^2`                            | Merge upstream 79ab1c4907 into ingress cancellation adapters                                                   |
| `afd13396d6` | 2026-10-23 | `1dc6a643da` | `7ab64536d3` | `savegame/gloss-124337-pre-ff-cd8a-20261023^2`                              | Merge upstream main 7ab64536d3 into stale ambient ingress settlement                                           |
| `8da32c408e` | 2026-10-23 | `3fbec00bb7` | `7ab64536d3` | `savegame/gloss-124337-pre-ff-cd8a-20261023^2`                              | Merge upstream main 7ab64536d3 into ingress cancellation adapters                                              |
| `9fd80c6cdb` | 2026-10-24 | `cd8a6e26fe` | `93a9fa4562` | `savegame/gloss-124337-pre-ff-9fd8-20261025^2`                              | Merge upstream main 93a9fa4562b into codeagent/ward-1255-m1-intervention                                       |
| `3607dc4366` | 2026-10-25 | `9fd80c6cdb` | `12b56e6492` | `codeagent/ward-1255-m1-intervention~2^2`                                   | Merge upstream main 12b56e6492c into ward-1255-m1-intervention                                                 |
| `d6df996c2e` | 2026-10-27 | `1ca76ba149` | `c2ea41016f` | `emeric/20261027-182252-j8-backmerge`                                       | Merge graft 3 (openclaw/openclaw#182252 standalone) into the j8 composite                                      |
| `7de53c1f24` | 2026-10-27 | `248cf1774a` | `7fdf69f5e6` | `gloss/124337-j8-backmerge~1^2`                                             | Merge upstream 7fdf69f5e6 into #121204 graft (j8 composite)                                                    |
| `d46182cf12` | 2026-10-27 | `8183790aad` | `82edaa1bbe` | `gloss/121204-j8-backmerge~1`                                               | Merge graft 1 (openclaw/openclaw#121204) into the j8 composite                                                 |
| `4b191fa6d8` | 2026-10-27 | `8e20f7cda9` | `e80d2453fe` | `emeric/20261027-182252-on-124337-j8~1^2`                                   | merge: reconcile queue-cap drop with summary consumption on j8                                                 |
| `e80d2453fe` | 2026-10-27 | `8eb4fe75bb` | `7fdf69f5e6` | `gloss/124337-j8-backmerge~1^2`                                             | merge: absorb upstream 7fdf69f5e6 into queue-cap PR                                                            |
| `1ca76ba149` | 2026-10-27 | `d46182cf12` | `7c3cd5fc10` | `emeric/20261027-182252-on-124337-j8`                                       | Merge graft 2 (openclaw/openclaw#124337 + #182252 combined) into the j8 composite                              |
| `8e20f7cda9` | 2026-10-27 | `e3b5d3625c` | `7fdf69f5e6` | `gloss/124337-j8-backmerge~1^2`                                             | Merge upstream 7fdf69f5e6 into #124337 graft (j8 composite)                                                    |
| `f057d27acb` | 2026-10-30 | `2915ea02dc` | `f0d924c6c0` | `codeagent/1415-discord-room-watermark`                                     | Merge codeagent/1415-discord-room-watermark into frond/1415-room-collect-base                                  |
| `22f49a43a1` | 2026-10-30 | `f057d27acb` | `9e5bb60ee8` | `codeagent/1415-room-collect`                                               | Merge codeagent/1415-room-collect into frond/1415-room-collect-base                                            |
| `618ed36596` | 2026-10-31 | `02890bdeab` | `1796c2279f` | `codeagent/1415-aggregate-plugin-gate`                                      | Merge #1519 (codeagent/1415-aggregate-plugin-gate) into the #1517 branch                                       |
| `3d3364ddc5` | 2026-10-31 | `22f49a43a1` | `1968823f23` | `codeagent/1415-aggregate-scale-and-pr`                                     | Merge pull request #1517 from karmaterminal/codeagent/1415-aggregate-scale-and-pr                              |
| `8a84747cd5` | 2026-10-31 | `3d3364ddc5` | `2b48d77066` | `codeagent/1415-ambient-owner-room-aggregate`                               | Merge #1521 (opt-in ambient owner room aggregate, allowlisted bot peers) into frond/1415-room-collect-base     |
| `1968823f23` | 2026-10-31 | `618ed36596` | `dd5029f3f3` | `codeagent/1415-plugin-gate-failclosed-inventory`                           | Merge #1520 (codeagent/1415-plugin-gate-failclosed-inventory) into the #1517 branch                            |
| `2b48d77066` | 2026-10-31 | `b57de88415` | `3f0913d825` | `codeagent/1415-ambient-owner-peers-allowlist`                              | Merge #1522 (fold only allowlisted bot owners) into #1521                                                      |
| `02890bdeab` | 2026-10-31 | `cf64bc4bec` | `3123b3ce51` | `codeagent/1415-aggregate-failclosed-guard`                                 | Merge #1518 (codeagent/1415-aggregate-failclosed-guard) into the #1517 branch                                  |
| `15aa7e9333` | 2026-11-01 | `003e7da04d` | `89237dbd82` | `codeagent/1415-cand-madge-cycle`                                           | Merge #1535 into frond/1415-room-collect-base (CAND static-gate fixes)                                         |
| `8fdf5d42d7` | 2026-11-01 | `2f5d75cbdb` | `47ac234343` | `codeagent/1512-child-scope-bindsto`                                        | Merge #1527: bind each child scope to the verified owning user service (#1512)                                 |
| `f830db9e75` | 2026-11-01 | `6d0d6a5d7d` | `c159c1f4d7` | `pr/1531`                                                                   | Merge #1531 into frond/1415-room-collect-base (bb73 fix set)                                                   |
| `a5ac7dd785` | 2026-11-01 | `8a84747cd5` | `8fdf5d42d7` | `codeagent/1512-child-memory-scope`                                         | Merge #1526 (opt-in child memory scope, bound to the owning gateway unit) into frond/1415-room-collect-base    |
| `2f5d75cbdb` | 2026-11-01 | `8aed3dcf2c` | `8a84747cd5` | `codeagent/1512-child-memory-scope~1^2`                                     | Merge frond/1415-room-collect-base (8a84747cd5) into codeagent/1512-child-memory-scope                         |
| `bb73bfb866` | 2026-11-01 | `a5ac7dd785` | `9de1d824d3` | `codeagent/1415-discord-preflight-line-cap`                                 | Merge #1528 (discord preflight history-media helpers move; line-cap ratchet) into frond/1415-room-collect-base |
| `6d0d6a5d7d` | 2026-11-01 | `bb73bfb866` | `933bb34682` | `codeagent/1415-wrapper-inventory-zod-process`                              | Merge #1529 into frond/1415-room-collect-base (bb73 fix set)                                                   |
| `003e7da04d` | 2026-11-01 | `f830db9e75` | `892f2288a6` | `codeagent/discord-live-policy-active-work`                                 | Merge #1534 into frond/1415-room-collect-base (bb73 fix set)                                                   |
| `aa21eb41fa` | 2026-11-02 | `7b65c16672` | `47de13560b` | `codeagent/1536-bootstrap-oom`                                              | Merge codeagent/1536-bootstrap-oom: record a worker OOM from any full-session sync (#1536)                     |
| `7b65c16672` | 2026-11-02 | `82a2d23164` | `e1fc646c60` | `codeagent/1536-shadow-cleanup-floor`                                       | Merge codeagent/1536-shadow-cleanup-floor: name the owner gate behind orphan shadow cleanup (#1536)            |
| `663967f73b` | 2026-11-05 | `15aa7e9333` | `2f9d24c5fe` | `codeagent/1447-provider-4xx-labels`                                        | Merge pull request #1537 from karmaterminal/codeagent/1447-provider-4xx-labels                                 |
| `929e7c89b1` | 2026-11-05 | `663967f73b` | `aa21eb41fa` | `codeagent/1536-memory-reindex-loop`                                        | Merge pull request #1539 from karmaterminal/codeagent/1536-memory-reindex-loop                                 |
| `376e801a5c` | 2026-11-05 | `929e7c89b1` | `65363721bd` | `codeagent/1447-cron-room-error-containment`                                | Merge pull request #1538 from karmaterminal/codeagent/1447-cron-room-error-containment                         |
| `d45b0fb468` | 2026-11-07 | `22f49a43a1` | `a2bf43f52a` | `gloss/1550-on-22f49a43`                                                    | Merge pull request #1553 from karmaterminal/gloss/1550-on-22f49a43                                             |
| `0ab8db762f` | 2026-11-07 | `376e801a5c` | `023b154e9c` | `scribe/20261107/fleet-unify-1550`                                          | Merge pull request #1557: one forward fleet line, the #1550 fix merged into collect-base                       |
| `023b154e9c` | 2026-11-07 | `376e801a5c` | `d45b0fb468` | `frond/fleet-22f49a43`                                                      | Merge frond/fleet-22f49a43 (d45b0fb4, the #1550 fix) into frond/1415-room-collect-base: one forward line for e |

Carriers that matter for the bytes: the grafts are `d46182cf12` (openclaw#121204, emeric: "keep stale ambient backlog from starving live mentions"), `1ca76ba149` (openclaw#124337, karmafeast: "bound pre-adoption abandonment with the existing retry budget", + openclaw#182252, emeric: "stop channel messages replaying when reply queue fills") and `d6df996c2e` (openclaw#182252 standalone). All three graft branches are upstream-based (merge-base with upstream `7fdf69f5e6`); their own commits number 43, 54 and 13. The ingress branches ("ingress cancellation adapters", "ingress retry-budget abandonment", "stale ambient ingress settlement", `ward-1255-m1-intervention`) are the #124337/#121204 PR histories, and the km#1229/#1230 Discord-ingress work arrives through them. The #1415 room-collect line follows: `f057d27acb` (watermark), `22f49a43a1` (room-collect), `3d3364ddc5` (km#1517, with #1518, #1519 and #1520), `8a84747cd5` (km#1521, with #1522), `bb73bfb866` (km#1528), `6d0d6a5d7d` (km#1529), `f830db9e75` (km#1531), `003e7da04d` (km#1534) and `15aa7e9333` (km#1535). The rest of the fleet line: `a5ac7dd785` (km#1526, child memory scope #1512), `663967f73b` (km#1537), `929e7c89b1` (km#1539, memory reindex #1536), `376e801a5c` (km#1538) and `d45b0fb468`/`023b154e9c`/`0ab8db762f` (km#1553/#1557, the #1550 fix line).

### 1.3 #1564 follow-up commits on the first-parent chain after the merge (28)

These come right after `7c4e1d76c8`, on the same linear first-parent chain, before any continuation commit.

| lane branch (nearest)                                                                                                                | commits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codeagent/1564-restart-evidence` (rune)                                                                                             | `c5eefd7ec6` Restore live restart recovery and mailbox drain hooks · `b5141eb8f3` Preserve fleet restart recovery and sentinel continuations · `d3cb57e8e8` Preserve ingress settlement across forward merge · `b3a600599e` test: preserve restart tombstone across fleet 38 migration · `a5679ba520` test: restore fleet tombstone from Doctor migration backup · `a047b9afed` fix(sessions): retain restart tombstones and recover one in place · `70579b9133` fix: reconcile composite static checks · `74dff2fb12` fix: keep internal fleet helpers off public exports · `92cb6e04ad` fix: keep recovery preflight in session worker and satisfy ratchets · `0f920da884` docs: regenerate database worker access inventory · `3522cc2dc8` fix(ci): match exact composite test-line growth · `182157c16b` fix: remove unused composite exports from fleet forward merge · `fb73f774dc` fix(memory): avoid duplicate CLI bootstrap on empty index · `39d1945464` fix(memory): honor OOM cooldown for populated CLI search |
| `codeagent/1564-ingress` (scribe)                                                                                                    | `fdcec8c5c3` fix(queue): keep inbound dedupe claim through queue-cap drops · `a35d115799` test(reply): expect queue-clear custody release to spend no attempt · `5d263d3db5` test(reply): drop the ingress custody cases j14 already replaced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `codeagent/1564-owner-*` / `1564-owner-backpressure-slack-telegram` (scribe; nearest tip `codeagent/1564-continuation-descriptions`) | `ae1554cedf` fix(queue): protect the human owner's room message at overflow · `e95e8f2374` test: grant the room owner carve-out its measured test-line growth · `a50709cf68` test(queue): prove the operator row holds live command-owner authority · `8d6be0e411` fix(queue): wait out a full cap for the owner's room message without spending retries · `f23dd8cd27` test(reply): prove owner backpressure redelivers through real dispatch · `bf4dab0ec7` fix(ingress): match queue backpressure by error code, not class · `1bd758eaa1` test(queue): adopt before turn work in the drain-generation fixture · `33687562c1` fix(slack,telegram): carry the owner's queue backpressure to the ingress retry owner · `fefcde6235` fix(telegram): keep a backpressured update out of the handled set · `59a5187bd6` test(telegram): move the owner backpressure proofs into their own file · `c627607903` test(telegram): prove a backpressured album redelivers every member                                              |

The remaining 22 first-parent commits, `b58e367257` … `9bfc4d3199` (`ronan/1547-forwardport-c6276079`, `codeagent/continuation-wake-line`), are continuation work: tool descriptions, the system-prompt tooling slots, the wake line, and their tests and allocations. They are the commits replayed in the counterfactual.

### 1.4 Nothing composite precedes `7c4e1d76c8`

- Fleet-own commits (219) ∩ commits reachable from `541d0428` and not upstream = **0**.
- Graft branch commits (`d46182cf12^2`, `1ca76ba149^2`, `d6df996c2e^2`; 43 + 54 + 13 non-upstream) ∩ j14 prep = **0**.
- Keyword sweep of all 1,421 merges in the range (`composite|fleet|graft|collect-base|124337|121204|ingress|1415|1564|deadcode`): the hits that are ancestors of `541d0428` are all absorb or upstream merges. One is `b292c09958`/`6fc1d2d6e4` "cifix: PR wrapper ships fleet-schema history", a continuation-line CI fix and not a composite merge (its fleet-schema payload is covered under §6).

**Stage A (`401a1de3..541d0428`) contains no composite merge and no graft commit.** Composite bytes enter only at `7c4e1d76c8` and through the 28 follow-ups.

## 2. Per-file classification

Definitions:

- **CONTINUATION**: every hunk attributes to the presentation line's own history. That means stage A, which contains no composite or graft commit (§1.4), plus the 22 post-composite continuation commits.
- **COMPOSITE-DERIVED**: every hunk of the file against the upstream base was introduced by `7c4e1d76c8` or a #1564 follow-up (`541d0428`'s blob equals `401a1de3`'s).
- **MIXED**: the file carries continuation hunks from stage A, and the composite changed it again.

| class             | files | notes                                                                                                                                                                                                                                                   |
| ----------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTINUATION      | 1,036 | 1,020 untouched after `541d0428`; 16 touched only by the 22 post-composite continuation commits                                                                                                                                                         |
| COMPOSITE-DERIVED |   252 | 251 by `7c4e`/#1564 commits, plus `config/test-lines-allocations/1564-generation-fixture.txt`: added by continuation-lane commits `239ec42e9b`/`51ff02dc16`, but it allocates the 4 test lines of the composite drain-generation fixture (`1bd758eaa1`) |
| MIXED             |    31 | none of them touched by the 22 continuation commits, so the counterfactual bytes equal `541d0428` bytes                                                                                                                                                 |
| total             | 1,319 | `--no-renames`; the rename `tsconfig.core.test.messaging.json` → `…messaging-channels.json` counts as 2, which is why `--name-only` with rename detection shows 1,318                                                                                   |

One more file, `src/config/sessions/lifecycle.ts`, was touched by stage B (`c5eefd7ec6`, then reverted by `182157c16b`). It is net-zero against upstream, needs no action, and is not in the diff.

Composite bytes by origin cluster (counterfactual → head `+` lines, 19,753 in total):

| carried by (origin cluster)                       | lines | files |
| ------------------------------------------------- | ----: | ----: |
| graft openclaw#121204                             |  3862 |    38 |
| #1564 a047b9afed                                  |  3011 |    22 |
| graft openclaw#124337+#182252                     |  2523 |    51 |
| km#1526 child-memory-scope                        |  1350 |    28 |
| km#1521 ambient-owner-aggregate                   |  1250 |    26 |
| km#1517 room-burst                                |  1224 |    13 |
| km#1539 memory-reindex                            |  1050 |    25 |
| #1564 b5141eb8f3                                  |   873 |    27 |
| #1415 room-watermark                              |   553 |     8 |
| upstream bytes retired by 401a, kept by composite |   439 |    17 |
| #1415 room-collect                                |   432 |    12 |
| #1564 59a5187bd6                                  |   420 |     3 |
| km#1538 cron-room-error                           |   393 |     9 |
| km#1537 provider-4xx                              |   358 |     5 |
| #1564 8d6be0e411                                  |   294 |     9 |
| #1564 ae1554cedf                                  |   284 |     4 |
| #1564 fefcde6235                                  |   256 |     4 |
| #1564 33687562c1                                  |   238 |     7 |
| #1564 f23dd8cd27                                  |   109 |     1 |
| 7c4e-resolution                                   |   104 |    25 |
| km#1534 watermark-owner                           |    98 |     2 |
| km#1553 #1550-test                                |    84 |     2 |
| #1564 92cb6e04ad                                  |    77 |    12 |
| #1564 d3cb57e8e8                                  |    64 |     4 |
| km#1528 preflight-media                           |    63 |     2 |
| #1564 39d1945464                                  |    47 |     2 |
| #1564 c627607903                                  |    44 |     2 |
| km#1531 live-mentions                             |    42 |     3 |
| #1564 bf4dab0ec7                                  |    40 |     4 |
| #1564 a5679ba520                                  |    34 |     1 |
| #1564 b3a600599e                                  |    30 |     1 |
| #1564 74dff2fb12                                  |    20 |     7 |
| #1564 0f920da884                                  |    13 |     1 |
| #1564 a35d115799                                  |    10 |     1 |
| #1564 a50709cf68                                  |     9 |     2 |
| km#1535 static-gates                              |     9 |     5 |
| #1564 c5eefd7ec6                                  |     9 |     2 |
| #1564 182157c16b                                  |     7 |     3 |
| #1564 70579b9133                                  |     6 |     4 |
| #1564 fb73f774dc                                  |     5 |     1 |
| fleet msteams-test-fix                            |     5 |     1 |
| #1564 1bd758eaa1                                  |     5 |     1 |
| km#1529 mode-b-reds                               |     4 |     2 |
| #1564 fdcec8c5c3                                  |     3 |     1 |
| allocation for #1564 generation fixture           |     2 |     1 |
| #1564 5d263d3db5                                  |     1 |     1 |
| #1564 e95e8f2374                                  |     1 |     1 |

## 3. Required by continuation (a), or composite carry (b)?

### 3.1 (a): one cluster, 2 files, 108 lines: the #1550 regression row

`src/auto-reply/continuation/work-dispatch-authority.test-support.ts` (+86) and `src/auto-reply/continuation/work-dispatch.durable-7.test.ts` (+22/−1) carry the whole composite delta in these two MIXED files. That delta is the test row "re-admits a detached wake on the current generation, not its closed turn's (#1550)". It comes from km#1553 `a2bf43f52a` (cherry-picked from the j13 row `429da7c8e6`, which is **not** an ancestor of `541d0428`), plus 24 lines of `7c4e` resolution.

- Call path: `work-dispatch.durable-7.test.ts` → `runDetachedGenerationFossil` → `dispatchPendingContinuationWorkFromDetachedCallback` (`work-dispatch.ts:98`) → `runOnCurrentPluginGeneration` (`detached-generation.ts:8`, called at `work-dispatch.ts:114`). That is pure continuation code.
- The production fix it pins is already in j14 prep: `fbde8662ca` "drop the dispatch runtime and the operator scope's registry on re-entry" (j12 finding F-1), along with its siblings. `541d0428` has no test for this behavior; a grep for "closed turn|current generation|re-admit" in the continuation tests finds nothing.
- **Recommendation:** keep these bytes, but land them through a continuation commit and not the composite. The simplest form is `git diff <counterfactual> 9bfc4d31 -- <these 2 files>` applied as one `test(continuation)` commit. That keeps the `7c4e` resolution adaptation.

### 3.2 (b): everything else, including a #185730-revival class

Evidence that the composite bytes are not required by continuation:

1. **Textual independence.** The 22 post-composite continuation commits replay onto `541d0428` with zero conflicts.
2. **No references.** The counterfactual tree references no export that exists only in the composite (method step 5).
3. **Prior candidate.** `541d0428` was the j14 continuation candidate that Mode-B was run against before the forward merge (km#1564: "The previous Mode-B run belongs to `541d0428`").

The only continuation-scoped composite hunk is the #1550 row (§3.1). Composite edits inside other continuation-touched files carry fleet behavior; none of them carries continuation-feature behavior:

- `get-reply-run-admission.ts`, `get-reply-run-context.ts`, `get-reply-run-execute.ts`, `followup-run-payload.types.ts`, `get-reply-options.types.ts`: #1415 room-event collect mode, ambient owner prose, `senderIsBot`, plus the `onCancelled`/`onBackpressure` ingress lifecycle. Several of these lines are marked `// Frond (karmaterminal, #1415)`.
- `server-restart-sentinel*.ts`, `session-delivery-queue.records.ts` (`isContinuationSessionDelivery` gains `restart-sentinel:` keys), `session-delivery-queue-codec.ts` (`expectedSessionId`): the gateway's _restart-sentinel continuation_, from #1564 `b5141eb8f3`. That is fleet restart recovery. Upstream #185730 retired it, and it is not the continue_work/continue_delegate feature.
- `session.ts`, `config/sessions/types.ts`: restart tombstones (#1564 `a047b9afed`/`b5141eb8f3`).
- `session-history-read-operation*.ts`, `session-transcript-worker*.ts`: the `session-raw-entry` reader that serves tombstone recovery.
- `fleet38-bridge` tests, the vitest worker path lists, `database-worker-inventory.mjs`, `wrapper-components.txt`, and the ratchet and generated outputs: bookkeeping for the composite.

**The #185730-revival class.** These hunks put back restart behavior that upstream deliberately removed in `9344233e7a`. They belong to the same family as the drain-restart binder and deserve the closest look:

| file                                                                                | class                     | how                                                                     | first-parent commits                     |
| ----------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `src/gateway/server-restart-sentinel-continuation-intent.ts`                        | COMPOSITE-DERIVED         | file deleted by #185730, resurrected                                    | `b5141eb8f3`, `182157c16b`               |
| `src/gateway/server-restart-sentinel-session-event.ts`                              | COMPOSITE-DERIVED         | file deleted by #185730, resurrected                                    | `b5141eb8f3`                             |
| `src/gateway/server-methods/sessions-recover.ts`                                    | COMPOSITE-DERIVED         | file deleted by #185730, resurrected                                    | `a047b9afed`                             |
| `packages/gateway-protocol/src/schema/sessions-recover.ts`                          | COMPOSITE-DERIVED         | file deleted by #185730, resurrected                                    | `a047b9afed`                             |
| `src/gateway/server-restart-sentinel.ts`                                            | MIXED                     | 26 lines #185730 deleted                                                | `b5141eb8f3`                             |
| `src/sessions/session-controller.mailbox-cleanup.ts`                                | COMPOSITE-DERIVED         | 26 lines (the binder)                                                   | `7c4e1d76c8`                             |
| `src/sessions/session-controller.mailbox.ts`                                        | COMPOSITE-DERIVED         | 2 lines (the binder call)                                               | `c5eefd7ec6`                             |
| `src/channels/message/ingress-drain.watchdog.test.ts`                               | COMPOSITE-DERIVED         | 42 lines                                                                | `7c4e1d76c8`                             |
| `src/auto-reply/reply/dispatch-from-config.ts`                                      | COMPOSITE-DERIVED         | 14 lines                                                                | `b5141eb8f3`                             |
| `src/auto-reply/reply/dispatch-from-config.context.ts`                              | COMPOSITE-DERIVED         | 2 lines                                                                 | `b5141eb8f3`                             |
| `src/auto-reply/reply/reply-turn-admission.test.ts`                                 | COMPOSITE-DERIVED         | 2 lines                                                                 | `b5141eb8f3`                             |
| `src/config/sessions/session-work-start.ts`                                         | COMPOSITE-DERIVED         | 2 lines                                                                 | `b5141eb8f3`                             |
| `src/config/sessions/work-start-error.ts`                                           | COMPOSITE-DERIVED         | 4 lines                                                                 | `c5eefd7ec6`                             |
| `src/channels/message/ingress-retry-policy.ts`                                      | COMPOSITE-DERIVED         | 4 lines                                                                 | `7c4e1d76c8`, `8d6be0e411`, `bf4dab0ec7` |
| `packages/gateway-protocol/src/validators/sessions.ts`                              | COMPOSITE-DERIVED         | 3 lines                                                                 | `a047b9afed`                             |
| `packages/gateway-protocol/src/compiled/protocol.generated/predicates.js` / `.d.ts` | MIXED / COMPOSITE-DERIVED | 24 / 3 lines (generated from the resurrected `sessions.recover` schema) | `a047b9afed`                             |

A further 439 composite lines in 17 files are upstream bytes that `401a1de3` no longer has. They were kept by the composite because the fleet line's upstream base (`7fdf69f5e6`, 2026-10-28) predates later upstream rewrites. They are listed per file under the cluster "upstream bytes retired by 401a, kept by composite" in §5. Restoring upstream bytes removes them along with the rest.

### 3.3 Repair recommendation (for each (b))

- **COMPOSITE-DERIVED, file exists upstream (183):** restore the candidate's current upstream-base bytes, i.e. `git checkout <upstream-base> -- <file>`.
- **COMPOSITE-DERIVED, composite-new file (65):** delete. This includes the four #185730-resurrected files and the four `config/test-lines-allocations/1564-*.txt` allocations. `1564-generation-fixture.txt` is listed separately as DROP.
- **MIXED (23, not counting generated files and §3.1):** revert only the composite hunks. Because the 22 continuation commits never touched these files, the target bytes equal `541d0428`'s blob. Re-merge any later upstream absorb on top.
- **Generated or ratchet outputs (9):** regenerate or re-measure after the revert. These are `protocol.generated/*` (sessions validators and predicates), `docs/.generated/config-baseline.*`, `worker-access-inventory.md`, `config/assertion-safety-baseline.txt` and `config/test-mock-exports-baseline.txt`. Never hand-edit them.
- **Route:** apply the reverse composite delta as forward commits on the current candidate, so no history is rewritten. The delta is `git diff 9bfc4d31 <counterfactual>`, or equivalently the per-file restores above. `7c4e1d76c8` and its follow-ups would stay in the PR's commit list. The alternative is to rebuild the presentation branch from `541d0428` plus the continuation commits, which drops them from the commit list. That route rewrites the PR branch, so it is 🌊's call alone: only 🌊 force-pushes.

## 4. The drain-restart case (two-reds lane)

**Upstream-byte-clean: confirmed.**

| file                                                 | `401a1de3`     | `541d0428`     | `b894fe5e`     | two-reds `0306ff3b92` | `9bfc4d31`     |
| ---------------------------------------------------- | -------------- | -------------- | -------------- | --------------------- | -------------- |
| `src/sessions/session-controller.mailbox-cleanup.ts` | `5d44d78faf76` | `5d44d78faf76` | `5d44d78faf76` | `5d44d78faf76`        | `4da5424eca3a` |
| `src/sessions/session-controller.mailbox.ts`         | `c4f28fcc3691` | `c4f28fcc3691` | `c4f28fcc3691` | `c4f28fcc3691`        | `1d82fbef2994` |

- **No continuation-owned hunk in either file.** In the first-parent history of `401a1de3..9bfc4d31` the only commits touching them are `7c4e1d76c8` (`mailbox-cleanup.ts`, +55/−1) and `c5eefd7ec6` (`mailbox.ts`, +2). The counterfactual blobs are the upstream blobs.
- **Line origins** (plain blame of the composite lines in `mailbox-cleanup.ts`): 44 + 8 lines from upstream `36e277d761`/`2d9033c6d1`, the original binder, which upstream #185730 `9344233e7a` deleted on 2026-10-28. 2 lines from `1add83f4a1`, the #124337 graft branch ("Merge upstream 79ab1c4907 into ingress cancellation adapters"), which added the `"cancelled"` disposition. 1 line of `7c4e` resolution.
- The planned fix `9d25100c93` "fix(sessions): retire waiting mailbox turns at the restart shutdown commit again" returns both files to `b894fe5e` bytes exactly.

Two caveats for the GO "keep the drain-restart repair upstream-byte-clean":

1. **Sibling files.** `session-controller.mailbox-source.ts` still carries composite hunks after `9d25100c93`. Those are the `"cancelled"`/`"backpressure"` dispositions in `notifySessionControllerSourceAbandonment`/`completeSessionControllerSourceLifecycle`: 3 lines from the #124337 graft (`1add83f4a1`, `4b191fa6d8`) and 19 from #1564 `8d6be0e411`. `session-controller.mailbox-dispatch.ts` also still carries composite hunks: `resolveFollowupBatchKey`, 4 lines from km#1517 `50d694fa1b`. Both are COMPOSITE-DERIVED. The two-reds tip differs from `b894fe5e` for `mailbox-source.ts` and equals `9bfc4d31` for `mailbox-dispatch.ts`.
2. **`9d25100c93` edits a composite-new file.** Its third file is `src/auto-reply/reply/dispatch-from-config.ingress-cancellation.test.ts`, which is absent at `401a1de3` and at `b894fe5e`: 513 composite lines, all from the #124337 graft. The commit message says the stop path relies on `abortSessionControllerInput`'s `"cancelled"` notification, which is caveat 1's composite hunk. The two session-controller files are therefore upstream-clean, but the repair as a whole still leans on the graft. Under the full revert in §3.3, that test file is deleted and the `mailbox-source.ts` dispositions go back to upstream. The test edit in `9d25100c93` then becomes moot.

## 5. Summary table: every non-CONTINUATION file (283)

"+/− vs counterfactual" is the composite delta per file (`git diff --no-renames <counterfactual> 9bfc4d31`). "First-parent introducing commits" lists the stage-B composite commits whose first-parent diff touched the file. "Carried by" lists the origin clusters of the added lines (method step 4). MIXED rows come first.

|   # | file                                                                                 | class             | +/− vs counterfactual                  | first-parent introducing commits                                                           | carried by (origin cluster: lines)                                                                                                        | recommendation                                                                                                                                  |
| --: | ------------------------------------------------------------------------------------ | ----------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | `config/assertion-safety-baseline.txt`                                               | MIXED             | +3/−3                                  | `92cb6e04ad`                                                                               | #1564 92cb6e04ad: 3                                                                                                                       | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output)                                                              |
|   2 | `config/test-mock-exports-baseline.txt`                                              | MIXED             | +0/−1                                  | `7c4e1d76c8`                                                                               |                                                                                                                                           | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output)                                                              |
|   3 | `docs/.generated/config-baseline.counts.json`                                        | MIXED             | +1/−1                                  | `7c4e1d76c8`                                                                               | 7c4e-resolution: 1                                                                                                                        | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output)                                                              |
|   4 | `docs/.generated/config-baseline.sha256`                                             | MIXED             | +2/−2                                  | `7c4e1d76c8`                                                                               | 7c4e-resolution: 2                                                                                                                        | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output)                                                              |
|   5 | `docs/reference/database-schemas/worker-access-inventory.md`                         | MIXED             | +13/−10                                | `0f920da884`                                                                               | #1564 0f920da884: 13                                                                                                                      | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output)                                                              |
|   6 | `packages/gateway-protocol/src/compiled/protocol.generated/predicates.js`            | MIXED             | +2252/−2236                            | `a047b9afed`                                                                               | #1564 a047b9afed: 2252                                                                                                                    | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output) [revives 24 #185730-deleted lines]                           |
|   7 | `scripts/database-worker-inventory.mjs`                                              | MIXED             | +1/−0                                  | `92cb6e04ad`                                                                               | #1564 92cb6e04ad: 1                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|   8 | `scripts/pr-lib/wrapper-components.txt`                                              | MIXED             | +1/−0                                  | `7c4e1d76c8`                                                                               | km#1529 mode-b-reds: 1                                                                                                                    | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|   9 | `src/auto-reply/continuation/work-dispatch-authority.test-support.ts`                | MIXED             | +86/−0                                 | `7c4e1d76c8`                                                                               | km#1553 #1550-test: 69; 7c4e-resolution: 17                                                                                               | (a) KEEP as continuation: re-land these head bytes as a `test(continuation)` commit (origin: the #1551 row `429da7c8e6`), not via the composite |
|  10 | `src/auto-reply/continuation/work-dispatch.durable-7.test.ts`                        | MIXED             | +22/−1                                 | `7c4e1d76c8`                                                                               | km#1553 #1550-test: 15; 7c4e-resolution: 7                                                                                                | (a) KEEP as continuation: re-land these head bytes as a `test(continuation)` commit (origin: the #1551 row `429da7c8e6`), not via the composite |
|  11 | `src/auto-reply/get-reply-options.types.ts`                                          | MIXED             | +10/−0                                 | `7c4e1d76c8` `8d6be0e411`                                                                  | graft openclaw#124337+#182252: 5; #1564 8d6be0e411: 5                                                                                     | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  12 | `src/auto-reply/reply/get-reply-run-admission.ts`                                    | MIXED             | +4/−1                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 4                                                                                                                     | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  13 | `src/auto-reply/reply/get-reply-run-context.ts`                                      | MIXED             | +4/−1                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 4                                                                                                                     | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  14 | `src/auto-reply/reply/get-reply-run-execute.ts`                                      | MIXED             | +3/−0                                  | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 3                                                                                                        | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  15 | `src/auto-reply/reply/get-reply-run.media-only.test.ts`                              | MIXED             | +3/−1                                  | `7c4e1d76c8`                                                                               | km#1529 mode-b-reds: 3                                                                                                                    | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  16 | `src/auto-reply/reply/queue/followup-run-payload.types.ts`                           | MIXED             | +11/−1                                 | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 7; km#1517 room-burst: 4                                                                                 | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  17 | `src/auto-reply/reply/session.ts`                                                    | MIXED             | +3/−4                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 3                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  18 | `src/commands/doctor-schema-migrations.fleet38-bridge.test.ts`                       | MIXED             | +34/−0                                 | `a5679ba520`                                                                               | #1564 a5679ba520: 34                                                                                                                      | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  19 | `src/config/sessions/session-history-read-operation-kind.ts`                         | MIXED             | +1/−0                                  | `92cb6e04ad`                                                                               | #1564 92cb6e04ad: 1                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  20 | `src/config/sessions/session-history-read-operation.worker.ts`                       | MIXED             | +9/−0                                  | `92cb6e04ad`                                                                               | #1564 92cb6e04ad: 9                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  21 | `src/config/sessions/session-transcript-worker-readers.ts`                           | MIXED             | +4/−0                                  | `92cb6e04ad`                                                                               | #1564 92cb6e04ad: 4                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  22 | `src/config/sessions/session-transcript-worker.types.ts`                             | MIXED             | +8/−0                                  | `92cb6e04ad`                                                                               | #1564 92cb6e04ad: 8                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  23 | `src/config/sessions/types.ts`                                                       | MIXED             | +9/−2                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 9                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  24 | `src/gateway/server-restart-sentinel-delivery.ts`                                    | MIXED             | +52/−0                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 52                                                                                                                      | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  25 | `src/gateway/server-restart-sentinel.continuation-delivery.test.ts`                  | MIXED             | +98/−1                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 98                                                                                                                      | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  26 | `src/gateway/server-restart-sentinel.ts`                                             | MIXED             | +90/−1                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 90                                                                                                                      | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream [revives 26 #185730-deleted lines]              |
|  27 | `src/infra/session-delivery-queue-codec.ts`                                          | MIXED             | +3/−0                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 3                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  28 | `src/infra/session-delivery-queue.records.ts`                                        | MIXED             | +5/−1                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 5                                                                                                                       | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  29 | `src/state/openclaw-agent-db.fleet38-bridge.test.ts`                                 | MIXED             | +30/−0                                 | `b3a600599e`                                                                               | #1564 b3a600599e: 30                                                                                                                      | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  30 | `test/vitest/vitest.database-worker-core-paths.mjs`                                  | MIXED             | +17/−0                                 | `7c4e1d76c8` `a047b9afed` `ae1554cedf`                                                     | km#1521 ambient-owner-aggregate: 3; graft openclaw#121204: 3; #1415 room-collect: 2; #1564 ae1554cedf: 2; …                               | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  31 | `test/vitest/vitest.extension-database-workers-paths.mjs`                            | MIXED             | +2/−0                                  | `59a5187bd6` `7c4e1d76c8`                                                                  | graft openclaw#121204: 1; #1564 59a5187bd6: 1                                                                                             | (b) REVERT composite hunks: restore 541d0428 bytes (== counterfactual), then re-absorb upstream                                                 |
|  32 | `config/test-lines-allocations/1564-generation-fixture.txt`                          | COMPOSITE-DERIVED | +2 vs upstream (in the counterfactual) | `239ec42e9b` `51ff02dc16`                                                                  | allocation for #1564 generation fixture: 2                                                                                                | DROP (allocation for composite test lines; added by continuation-lane commits 239ec42e9b/51ff02dc16)                                            |
|  33 | `config/test-lines-allocations/1564-inplace-tombstone-recover.txt`                   | COMPOSITE-DERIVED | +2/−0                                  | `182157c16b` `3522cc2dc8` `39d1945464` `5d263d3db5` `70579b9133` `a047b9afed` `a35d115799` | #1564 5d263d3db5: 1; #1564 70579b9133: 1                                                                                                  | (b) DELETE (composite-new file)                                                                                                                 |
|  34 | `config/test-lines-allocations/1564-owner-backpressure-slack-telegram.txt`           | COMPOSITE-DERIVED | +2/−0                                  | `33687562c1` `59a5187bd6` `c627607903` `fefcde6235`                                        | #1564 c627607903: 2                                                                                                                       | (b) DELETE (composite-new file)                                                                                                                 |
|  35 | `config/test-lines-allocations/1564-room-owner-carveout.txt`                         | COMPOSITE-DERIVED | +2/−0                                  | `a50709cf68` `e95e8f2374`                                                                  | #1564 a50709cf68: 1; #1564 e95e8f2374: 1                                                                                                  | (b) DELETE (composite-new file)                                                                                                                 |
|  36 | `config/test-lines-allocations/1564-room-owner-requeue-cap.txt`                      | COMPOSITE-DERIVED | +2/−0                                  | `8d6be0e411` `bf4dab0ec7` `f23dd8cd27`                                                     | #1564 bf4dab0ec7: 2                                                                                                                       | (b) DELETE (composite-new file)                                                                                                                 |
|  37 | `docs/channels/ambient-room-events.md`                                               | COMPOSITE-DERIVED | +30/−0                                 | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 30                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
|  38 | `docs/channels/discord/messaging.md`                                                 | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 3; km#1521 ambient-owner-aggregate: 1                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  39 | `docs/cli/memory.md`                                                                 | COMPOSITE-DERIVED | +12/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 12                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
|  40 | `docs/concepts/memory-builtin.md`                                                    | COMPOSITE-DERIVED | +11/−2                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 11                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
|  41 | `docs/concepts/messages.md`                                                          | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 3; km#1521 ambient-owner-aggregate: 1                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  42 | `docs/concepts/queue-steering.md`                                                    | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 3; km#1521 ambient-owner-aggregate: 1                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  43 | `docs/concepts/queue.md`                                                             | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 3; km#1521 ambient-owner-aggregate: 1                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  44 | `docs/gateway/config-agents/messages-and-talk.md`                                    | COMPOSITE-DERIVED | +1/−1                                  | `7c4e1d76c8`                                                                               | km#1517 room-burst: 1                                                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
|  45 | `docs/gateway/protocol/rpc-session-control.md`                                       | COMPOSITE-DERIVED | +1/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 1                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
|  46 | `docs/gateway/restart-recovery.md`                                                   | COMPOSITE-DERIVED | +35/−19                                | `a047b9afed`                                                                               | #1564 a047b9afed: 35                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
|  47 | `docs/help/faq/chat-commands-and-stopping.md`                                        | COMPOSITE-DERIVED | +1/−1                                  | `7c4e1d76c8`                                                                               | km#1517 room-burst: 1                                                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
|  48 | `docs/logging.md`                                                                    | COMPOSITE-DERIVED | +27/−8                                 | `7c4e1d76c8`                                                                               | km#1537 provider-4xx: 27                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  49 | `docs/plugins/sdk-channel-outbound.md`                                               | COMPOSITE-DERIVED | +20/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 20                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  50 | `extensions/anthropic/cli-process.ts`                                                | COMPOSITE-DERIVED | +1/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 1                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
|  51 | `extensions/codex/src/app-server/transport-process-registration.procfs.test.ts`      | COMPOSITE-DERIVED | +26/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 26                                                                                                            | (b) RESTORE upstream bytes                                                                                                                      |
|  52 | `extensions/codex/src/app-server/transport-process-registration.ts`                  | COMPOSITE-DERIVED | +6/−3                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 5; 7c4e-resolution: 1                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
|  53 | `extensions/codex/src/app-server/transport-process-snapshot.ts`                      | COMPOSITE-DERIVED | +14/−5                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 14                                                                                                            | (b) RESTORE upstream bytes                                                                                                                      |
|  54 | `extensions/codex/src/app-server/transport-spawn.test.ts`                            | COMPOSITE-DERIVED | +74/−4                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 71; km#1535 static-gates: 2; 7c4e-resolution: 1                                                               | (b) RESTORE upstream bytes                                                                                                                      |
|  55 | `extensions/codex/src/app-server/transport-stdio.ts`                                 | COMPOSITE-DERIVED | +11/−4                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 9; 7c4e-resolution: 2                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
|  56 | `extensions/discord/src/internal/gateway-channel-inventory.test.ts`                  | COMPOSITE-DERIVED | +185/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 185                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  57 | `extensions/discord/src/internal/gateway-channel-inventory.ts`                       | COMPOSITE-DERIVED | +127/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 127                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  58 | `extensions/discord/src/internal/gateway-dispatch.ts`                                | COMPOSITE-DERIVED | +1/−1                                  | `74dff2fb12`                                                                               | #1564 74dff2fb12: 1                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
|  59 | `extensions/discord/src/internal/gateway.ts`                                         | COMPOSITE-DERIVED | +18/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 18                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  60 | `extensions/discord/src/internal/plugin-contract.ts`                                 | COMPOSITE-DERIVED | +5/−0                                  | `7c4e1d76c8`                                                                               | graft openclaw#121204: 5                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  61 | `extensions/discord/src/live-policy-config.ts`                                       | COMPOSITE-DERIVED | +1/−0                                  | `7c4e1d76c8`                                                                               | graft openclaw#121204: 1                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  62 | `extensions/discord/src/monitor/agent-components.live-policy-deadline.test.ts`       | COMPOSITE-DERIVED | +1/−0                                  | `7c4e1d76c8`                                                                               | graft openclaw#121204: 1                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  63 | `extensions/discord/src/monitor/ingress-priority.test.ts`                            | COMPOSITE-DERIVED | +35/−0                                 | `74dff2fb12` `7c4e1d76c8`                                                                  | km#1531 live-mentions: 34; #1564 74dff2fb12: 1                                                                                            | (b) DELETE (composite-new file)                                                                                                                 |
|  64 | `extensions/discord/src/monitor/ingress-priority.ts`                                 | COMPOSITE-DERIVED | +14/−0                                 | `74dff2fb12`                                                                               | #1564 74dff2fb12: 14                                                                                                                      | (b) DELETE (composite-new file)                                                                                                                 |
|  65 | `extensions/discord/src/monitor/ingress-stale-policy.channel-fence.test.ts`          | COMPOSITE-DERIVED | +174/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 174                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  66 | `extensions/discord/src/monitor/ingress-stale-policy.freshness.test.ts`              | COMPOSITE-DERIVED | +179/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 179                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  67 | `extensions/discord/src/monitor/ingress-stale-policy.preflight-parity.test.ts`       | COMPOSITE-DERIVED | +311/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 311                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  68 | `extensions/discord/src/monitor/ingress-stale-policy.test-support.ts`                | COMPOSITE-DERIVED | +71/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 71                                                                                                                 | (b) DELETE (composite-new file)                                                                                                                 |
|  69 | `extensions/discord/src/monitor/ingress-stale-policy.test.ts`                        | COMPOSITE-DERIVED | +539/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 539                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  70 | `extensions/discord/src/monitor/ingress-stale-policy.ts`                             | COMPOSITE-DERIVED | +475/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 475                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  71 | `extensions/discord/src/monitor/ingress-stored-message.ts`                           | COMPOSITE-DERIVED | +17/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 17                                                                                                                 | (b) DELETE (composite-new file)                                                                                                                 |
|  72 | `extensions/discord/src/monitor/ingress.stale-backlog.test.ts`                       | COMPOSITE-DERIVED | +609/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 609                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
|  73 | `extensions/discord/src/monitor/ingress.ts`                                          | COMPOSITE-DERIVED | +58/−16                                | `74dff2fb12` `7c4e1d76c8` `92cb6e04ad`                                                     | graft openclaw#121204: 37; 7c4e-resolution: 7; km#1531 live-mentions: 6; upstream bytes retired by 401a, kept by composite: 5; …          | (b) RESTORE upstream bytes                                                                                                                      |
|  74 | `extensions/discord/src/monitor/listeners.test.ts`                                   | COMPOSITE-DERIVED | +1/−0                                  | `7c4e1d76c8`                                                                               | graft openclaw#121204: 1                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  75 | `extensions/discord/src/monitor/live-policy.test.ts`                                 | COMPOSITE-DERIVED | +26/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 26                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  76 | `extensions/discord/src/monitor/live-policy.ts`                                      | COMPOSITE-DERIVED | +11/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 11                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  77 | `extensions/discord/src/monitor/message-dispatcher.ts`                               | COMPOSITE-DERIVED | +8/−1                                  | `7c4e1d76c8`                                                                               | km#1534 watermark-owner: 4; graft openclaw#121204: 3; 7c4e-resolution: 1                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  78 | `extensions/discord/src/monitor/message-handler.context.test.ts`                     | COMPOSITE-DERIVED | +16/−0                                 | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 16                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
|  79 | `extensions/discord/src/monitor/message-handler.context.ts`                          | COMPOSITE-DERIVED | +16/−2                                 | `7c4e1d76c8`                                                                               | #1415 room-watermark: 11; km#1521 ambient-owner-aggregate: 5                                                                              | (b) RESTORE upstream bytes                                                                                                                      |
|  80 | `extensions/discord/src/monitor/message-handler.hydration.ts`                        | COMPOSITE-DERIVED | +4/−2                                  | `7c4e1d76c8`                                                                               | graft openclaw#121204: 4                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  81 | `extensions/discord/src/monitor/message-handler.ingress-recovery.test.ts`            | COMPOSITE-DERIVED | +3/−1                                  | `d3cb57e8e8`                                                                               | #1564 d3cb57e8e8: 3                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
|  82 | `extensions/discord/src/monitor/message-handler.preflight-history.ts`                | COMPOSITE-DERIVED | +58/−1                                 | `7c4e1d76c8`                                                                               | km#1528 preflight-media: 58                                                                                                               | (b) RESTORE upstream bytes                                                                                                                      |
|  83 | `extensions/discord/src/monitor/message-handler.preflight.test-helpers.ts`           | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-watermark: 2                                                                                                                   | (b) RESTORE upstream bytes                                                                                                                      |
|  84 | `extensions/discord/src/monitor/message-handler.preflight.ts`                        | COMPOSITE-DERIVED | +6/−53                                 | `7c4e1d76c8`                                                                               | km#1528 preflight-media: 5; #1415 room-watermark: 1                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
|  85 | `extensions/discord/src/monitor/message-handler.preflight.types.ts`                  | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-watermark: 2                                                                                                                   | (b) RESTORE upstream bytes                                                                                                                      |
|  86 | `extensions/discord/src/monitor/message-handler.process.ts`                          | COMPOSITE-DERIVED | +5/−1                                  | `7c4e1d76c8`                                                                               | #1415 room-watermark: 5                                                                                                                   | (b) RESTORE upstream bytes                                                                                                                      |
|  87 | `extensions/discord/src/monitor/message-handler.room-history-watermark.test.ts`      | COMPOSITE-DERIVED | +482/−0                                | `7c4e1d76c8`                                                                               | #1415 room-watermark: 388; km#1534 watermark-owner: 94                                                                                    | (b) DELETE (composite-new file)                                                                                                                 |
|  88 | `extensions/discord/src/monitor/message-handler.test-harness.ts`                     | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-watermark: 2                                                                                                                   | (b) RESTORE upstream bytes                                                                                                                      |
|  89 | `extensions/discord/src/monitor/message-handler.ts`                                  | COMPOSITE-DERIVED | +1/−0                                  | `7c4e1d76c8`                                                                               | graft openclaw#121204: 1                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
|  90 | `extensions/discord/src/monitor/room-history-watermark.ts`                           | COMPOSITE-DERIVED | +142/−0                                | `7c4e1d76c8`                                                                               | #1415 room-watermark: 142                                                                                                                 | (b) DELETE (composite-new file)                                                                                                                 |
|  91 | `extensions/discord/test-api.ts`                                                     | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 2                                                                                                        | (b) RESTORE upstream bytes                                                                                                                      |
|  92 | `extensions/feishu/src/bot-broadcast.ts`                                             | COMPOSITE-DERIVED | +32/−6                                 | `7c4e1d76c8` `d3cb57e8e8`                                                                  | graft openclaw#124337+#182252: 21; upstream bytes retired by 401a, kept by composite: 9; 7c4e-resolution: 2                               | (b) RESTORE upstream bytes                                                                                                                      |
|  93 | `extensions/feishu/src/bot.broadcast.test.ts`                                        | COMPOSITE-DERIVED | +139/−85                               | `7c4e1d76c8` `d3cb57e8e8`                                                                  | graft openclaw#124337+#182252: 82; upstream bytes retired by 401a, kept by composite: 30; #1564 d3cb57e8e8: 27                            | (b) RESTORE upstream bytes                                                                                                                      |
|  94 | `extensions/feishu/src/feishu-ingress.test.ts`                                       | COMPOSITE-DERIVED | +151/−191                              | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 108; upstream bytes retired by 401a, kept by composite: 43                                                 | (b) RESTORE upstream bytes                                                                                                                      |
|  95 | `extensions/feishu/src/feishu-ingress.ts`                                            | COMPOSITE-DERIVED | +42/−8                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 27; 7c4e-resolution: 15                                                                                    | (b) RESTORE upstream bytes                                                                                                                      |
|  96 | `extensions/feishu/src/monitor.comment-notice-handler.ts`                            | COMPOSITE-DERIVED | +4/−1                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 4                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
|  97 | `extensions/feishu/src/monitor.comment.test.ts`                                      | COMPOSITE-DERIVED | +28/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 28                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
|  98 | `extensions/feishu/src/monitor.message-handler.ingress.test.ts`                      | COMPOSITE-DERIVED | +87/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 87                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
|  99 | `extensions/feishu/src/monitor.message-handler.ts`                                   | COMPOSITE-DERIVED | +21/−4                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 21                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 100 | `extensions/line/src/webhook-spool.test.ts`                                          | COMPOSITE-DERIVED | +123/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 122; upstream bytes retired by 401a, kept by composite: 1                                                  | (b) RESTORE upstream bytes                                                                                                                      |
| 101 | `extensions/line/src/webhook-spool.ts`                                               | COMPOSITE-DERIVED | +14/−6                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 14                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 102 | `extensions/memory-core/src/cli-status.runtime.ts`                                   | COMPOSITE-DERIVED | +12/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 12                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 103 | `extensions/memory-core/src/doctor-health.test.ts`                                   | COMPOSITE-DERIVED | +23/−2                                 | `74dff2fb12` `7c4e1d76c8`                                                                  | km#1539 memory-reindex: 22; #1564 74dff2fb12: 1                                                                                           | (b) RESTORE upstream bytes                                                                                                                      |
| 104 | `extensions/memory-core/src/doctor-health.ts`                                        | COMPOSITE-DERIVED | +72/−14                                | `74dff2fb12` `7c4e1d76c8`                                                                  | km#1539 memory-reindex: 68; 7c4e-resolution: 3; #1564 74dff2fb12: 1                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 105 | `extensions/memory-core/src/memory/manager-database-context.ts`                      | COMPOSITE-DERIVED | +12/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 12                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 106 | `extensions/memory-core/src/memory/manager-db-kernel.ts`                             | COMPOSITE-DERIVED | +3/−0                                  | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 3                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 107 | `extensions/memory-core/src/memory/manager-db.test.ts`                               | COMPOSITE-DERIVED | +15/−9                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 15                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 108 | `extensions/memory-core/src/memory/manager-db.ts`                                    | COMPOSITE-DERIVED | +31/−30                                | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 31                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 109 | `extensions/memory-core/src/memory/manager-publication-postgres.ts`                  | COMPOSITE-DERIVED | +6/−0                                  | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 6                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 110 | `extensions/memory-core/src/memory/manager-publication-task.ts`                      | COMPOSITE-DERIVED | +5/−0                                  | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 5                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 111 | `extensions/memory-core/src/memory/manager-publication.worker.ts`                    | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 4                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 112 | `extensions/memory-core/src/memory/manager-reindex-failure.ts`                       | COMPOSITE-DERIVED | +127/−0                                | `74dff2fb12` `7c4e1d76c8` `92cb6e04ad`                                                     | km#1539 memory-reindex: 120; #1564 92cb6e04ad: 6; #1564 74dff2fb12: 1                                                                     | (b) DELETE (composite-new file)                                                                                                                 |
| 113 | `extensions/memory-core/src/memory/manager-reindex-ops.ts`                           | COMPOSITE-DERIVED | +85/−4                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 84; upstream bytes retired by 401a, kept by composite: 1                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 114 | `extensions/memory-core/src/memory/manager-reindex-resource-failure.test.ts`         | COMPOSITE-DERIVED | +426/−0                                | `39d1945464` `7c4e1d76c8`                                                                  | km#1539 memory-reindex: 387; #1564 39d1945464: 39                                                                                         | (b) DELETE (composite-new file)                                                                                                                 |
| 115 | `extensions/memory-core/src/memory/manager-retrieval-read.ts`                        | COMPOSITE-DERIVED | +12/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 12                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 116 | `extensions/memory-core/src/memory/manager-search-orchestration.ts`                  | COMPOSITE-DERIVED | +13/−2                                 | `39d1945464` `fb73f774dc`                                                                  | #1564 39d1945464: 8; #1564 fb73f774dc: 5                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
| 117 | `extensions/memory-core/src/memory/manager-session-index-budget.test.ts`             | COMPOSITE-DERIVED | +96/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 96                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
| 118 | `extensions/memory-core/src/memory/manager-session-sync-ops.ts`                      | COMPOSITE-DERIVED | +28/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 28                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 119 | `extensions/memory-core/src/memory/manager-source-sync-ops.ts`                       | COMPOSITE-DERIVED | +60/−5                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 60                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 120 | `extensions/memory-core/src/memory/manager-sync-base.ts`                             | COMPOSITE-DERIVED | +12/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 12                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 121 | `extensions/memory-core/src/memory/manager-sync-ops.ts`                              | COMPOSITE-DERIVED | +40/−3                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 26; 7c4e-resolution: 14                                                                                           | (b) RESTORE upstream bytes                                                                                                                      |
| 122 | `extensions/memory-core/src/memory/manager-sync-yield.test.ts`                       | COMPOSITE-DERIVED | +5/−0                                  | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 5                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 123 | `extensions/memory-core/src/memory/manager.ts`                                       | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 2                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 124 | `extensions/msteams/src/monitor-handler/message-handler.ingress-lifecycle.test.ts`   | COMPOSITE-DERIVED | +58/−22                                | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 31; upstream bytes retired by 401a, kept by composite: 22; fleet msteams-test-fix: 5                       | (b) RESTORE upstream bytes                                                                                                                      |
| 125 | `extensions/slack/src/monitor/ingress.owner-backpressure.test.ts`                    | COMPOSITE-DERIVED | +386/−0                                | `33687562c1` `59a5187bd6` `fefcde6235`                                                     | #1564 fefcde6235: 197; #1564 33687562c1: 186; #1564 59a5187bd6: 3                                                                         | (b) DELETE (composite-new file)                                                                                                                 |
| 126 | `extensions/slack/src/monitor/ingress.test.ts`                                       | COMPOSITE-DERIVED | +109/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 109                                                                                                        | (b) RESTORE upstream bytes                                                                                                                      |
| 127 | `extensions/slack/src/monitor/ingress.ts`                                            | COMPOSITE-DERIVED | +14/−0                                 | `33687562c1` `7c4e1d76c8`                                                                  | graft openclaw#124337+#182252: 9; #1564 33687562c1: 5                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 128 | `extensions/slack/src/monitor/ingress.types.ts`                                      | COMPOSITE-DERIVED | +2/−0                                  | `33687562c1`                                                                               | #1564 33687562c1: 2                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 129 | `extensions/slack/src/monitor/message-handler.duplicate-wait.test.ts`                | COMPOSITE-DERIVED | +126/−0                                | `7c4e1d76c8`                                                                               | upstream bytes retired by 401a, kept by composite: 74; graft openclaw#124337+#182252: 52                                                  | (b) DELETE (composite-new file)                                                                                                                 |
| 130 | `extensions/slack/src/monitor/message-handler.test.ts`                               | COMPOSITE-DERIVED | +57/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 57                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 131 | `extensions/slack/src/monitor/message-handler.ts`                                    | COMPOSITE-DERIVED | +26/−0                                 | `33687562c1` `7c4e1d76c8`                                                                  | graft openclaw#124337+#182252: 13; #1564 33687562c1: 12; upstream bytes retired by 401a, kept by composite: 1                             | (b) RESTORE upstream bytes                                                                                                                      |
| 132 | `extensions/sms/src/inbound.test.ts`                                                 | COMPOSITE-DERIVED | +160/−79                               | `7c4e1d76c8` `d3cb57e8e8`                                                                  | graft openclaw#124337+#182252: 77; upstream bytes retired by 401a, kept by composite: 59; #1564 d3cb57e8e8: 24                            | (b) RESTORE upstream bytes                                                                                                                      |
| 133 | `extensions/sms/src/inbound.ts`                                                      | COMPOSITE-DERIVED | +49/−13                                | `7c4e1d76c8` `d3cb57e8e8`                                                                  | graft openclaw#124337+#182252: 37; #1564 d3cb57e8e8: 10; 7c4e-resolution: 2                                                               | (b) RESTORE upstream bytes                                                                                                                      |
| 134 | `extensions/telegram/src/bot-core.ts`                                                | COMPOSITE-DERIVED | +7/−1                                  | `7c4e1d76c8` `fefcde6235`                                                                  | #1564 fefcde6235: 6; graft openclaw#124337+#182252: 1                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 135 | `extensions/telegram/src/bot-handlers.callback-router-controls.ts`                   | COMPOSITE-DERIVED | +4/−1                                  | `7c4e1d76c8` `fefcde6235`                                                                  | graft openclaw#124337+#182252: 2; #1564 fefcde6235: 2                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 136 | `extensions/telegram/src/bot-message.test.ts`                                        | COMPOSITE-DERIVED | +19/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 19                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 137 | `extensions/telegram/src/bot-message.ts`                                             | COMPOSITE-DERIVED | +26/−3                                 | `33687562c1` `7c4e1d76c8`                                                                  | graft openclaw#124337+#182252: 14; #1564 33687562c1: 12                                                                                   | (b) RESTORE upstream bytes                                                                                                                      |
| 138 | `extensions/telegram/src/bot-processing-outcome.ts`                                  | COMPOSITE-DERIVED | +7/−1                                  | `33687562c1` `7c4e1d76c8`                                                                  | #1564 33687562c1: 4; graft openclaw#124337+#182252: 3                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 139 | `extensions/telegram/src/telegram-ingress-coalescing.cancellation.e2e.test.ts`       | COMPOSITE-DERIVED | +222/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 222                                                                                                        | (b) DELETE (composite-new file)                                                                                                                 |
| 140 | `extensions/telegram/src/telegram-ingress-coalescing.e2e.test.ts`                    | COMPOSITE-DERIVED | +93/−0                                 | `c627607903` `fefcde6235`                                                                  | #1564 fefcde6235: 51; #1564 c627607903: 42                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 141 | `extensions/telegram/src/telegram-ingress-drain.owner-backpressure.test.ts`          | COMPOSITE-DERIVED | +416/−0                                | `59a5187bd6`                                                                               | #1564 59a5187bd6: 416                                                                                                                     | (b) DELETE (composite-new file)                                                                                                                 |
| 142 | `extensions/telegram/src/telegram-ingress-drain.test.ts`                             | COMPOSITE-DERIVED | +238/−57                               | `33687562c1` `59a5187bd6` `7c4e1d76c8` `fefcde6235`                                        | graft openclaw#124337+#182252: 212; upstream bytes retired by 401a, kept by composite: 26                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 143 | `extensions/telegram/src/telegram-ingress-drain.ts`                                  | COMPOSITE-DERIVED | +28/−0                                 | `33687562c1` `7c4e1d76c8`                                                                  | #1564 33687562c1: 17; graft openclaw#124337+#182252: 11                                                                                   | (b) RESTORE upstream bytes                                                                                                                      |
| 144 | `extensions/twitch/src/twitch-ingress.test.ts`                                       | COMPOSITE-DERIVED | +56/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 56                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 145 | `packages/ai/src/providers/openai-chatgpt-responses-events.ts`                       | COMPOSITE-DERIVED | +170/−0                                | `7c4e1d76c8` `92cb6e04ad`                                                                  | km#1537 provider-4xx: 156; #1564 92cb6e04ad: 14                                                                                           | (b) RESTORE upstream bytes                                                                                                                      |
| 146 | `packages/ai/src/providers/openai-chatgpt-responses-streaming.test.ts`               | COMPOSITE-DERIVED | +158/−0                                | `7c4e1d76c8`                                                                               | km#1537 provider-4xx: 158                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 147 | `packages/ai/src/providers/openai-chatgpt-responses.ts`                              | COMPOSITE-DERIVED | +12/−55                                | `7c4e1d76c8`                                                                               | km#1537 provider-4xx: 12                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
| 148 | `packages/ai/src/transports/transport-stream-shared.ts`                              | COMPOSITE-DERIVED | +5/−0                                  | `7c4e1d76c8`                                                                               | km#1537 provider-4xx: 5                                                                                                                   | (b) RESTORE upstream bytes                                                                                                                      |
| 149 | `packages/gateway-protocol/src/compiled/protocol.generated/predicates.d.ts`          | COMPOSITE-DERIVED | +5/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 5                                                                                                                       | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output) [revives 3 #185730-deleted lines]                            |
| 150 | `packages/gateway-protocol/src/compiled/protocol.generated/validators-sessions.d.ts` | COMPOSITE-DERIVED | +1/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 1                                                                                                                       | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output)                                                              |
| 151 | `packages/gateway-protocol/src/compiled/protocol.generated/validators-sessions.js`   | COMPOSITE-DERIVED | +1/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 1                                                                                                                       | (b) REGENERATE/RE-MEASURE after the composite revert (generated or ratchet output)                                                              |
| 152 | `packages/gateway-protocol/src/public-schema-sessions.ts`                            | COMPOSITE-DERIVED | +2/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 2                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 153 | `packages/gateway-protocol/src/schema-modules.ts`                                    | COMPOSITE-DERIVED | +1/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 1                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 154 | `packages/gateway-protocol/src/schema/sessions-recover.ts`                           | COMPOSITE-DERIVED | +24/−0                                 | `a047b9afed`                                                                               | #1564 a047b9afed: 24                                                                                                                      | (b) DELETE (composite-new file) [file deleted upstream by #185730]                                                                              |
| 155 | `packages/gateway-protocol/src/validators/sessions.ts`                               | COMPOSITE-DERIVED | +4/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 4                                                                                                                       | (b) RESTORE upstream bytes [revives 3 #185730-deleted lines]                                                                                    |
| 156 | `scripts/check-protocol-registry.mts`                                                | COMPOSITE-DERIVED | +2/−2                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 2                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 157 | `src/agents/bash-tools.exec-child-memory-scope.test.ts`                              | COMPOSITE-DERIVED | +88/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 86; km#1535 static-gates: 2                                                                                   | (b) DELETE (composite-new file)                                                                                                                 |
| 158 | `src/agents/bash-tools.exec-runtime.ts`                                              | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | 7c4e-resolution: 2; km#1526 child-memory-scope: 2                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 159 | `src/agents/cli-runner/execute-process.ts`                                           | COMPOSITE-DERIVED | +1/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 1                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 160 | `src/agents/embedded-agent-runner/run/blocked-run-result.ts`                         | COMPOSITE-DERIVED | +5/−1                                  | `7c4e1d76c8`                                                                               | 7c4e-resolution: 4; km#1538 cron-room-error: 1                                                                                            | (b) RESTORE upstream bytes                                                                                                                      |
| 161 | `src/agents/embedded-agent-runner/run/retry-limit.ts`                                | COMPOSITE-DERIVED | +2/−6                                  | `7c4e1d76c8`                                                                               | km#1538 cron-room-error: 2                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 162 | `src/agents/embedded-agent-runner/run/terminal-timeout.ts`                           | COMPOSITE-DERIVED | +2/−1                                  | `7c4e1d76c8`                                                                               | km#1538 cron-room-error: 2                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 163 | `src/agents/memory-search.test.ts`                                                   | COMPOSITE-DERIVED | +16/−0                                 | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 16                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 164 | `src/auto-reply/command-auth.ts`                                                     | COMPOSITE-DERIVED | +11/−1                                 | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 11                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 165 | `src/auto-reply/command-owner-authority.ts`                                          | COMPOSITE-DERIVED | +5/−0                                  | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 5                                                                                                        | (b) RESTORE upstream bytes                                                                                                                      |
| 166 | `src/auto-reply/inbound-debounce.ts`                                                 | COMPOSITE-DERIVED | +5/−0                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 5                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 167 | `src/auto-reply/reply-payload.ts`                                                    | COMPOSITE-DERIVED | +8/−0                                  | `7c4e1d76c8`                                                                               | km#1538 cron-room-error: 8                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 168 | `src/auto-reply/reply/agent-runner-failure-reply.ts`                                 | COMPOSITE-DERIVED | +3/−1                                  | `7c4e1d76c8`                                                                               | km#1538 cron-room-error: 3                                                                                                                | (b) RESTORE upstream bytes                                                                                                                      |
| 169 | `src/auto-reply/reply/agent-runner.stalled-turn.test.ts`                             | COMPOSITE-DERIVED | +19/−0                                 | `7c4e1d76c8`                                                                               | km#1517 room-burst: 19                                                                                                                    | (b) RESTORE upstream bytes                                                                                                                      |
| 170 | `src/auto-reply/reply/dispatch-from-config.context.ts`                               | COMPOSITE-DERIVED | +2/−0                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 2                                                                                                                       | (b) RESTORE upstream bytes [revives 2 #185730-deleted lines]                                                                                    |
| 171 | `src/auto-reply/reply/dispatch-from-config.ingress-cancellation.test.ts`             | COMPOSITE-DERIVED | +513/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 513                                                                                                        | (b) DELETE (composite-new file)                                                                                                                 |
| 172 | `src/auto-reply/reply/dispatch-from-config.ingress-retry.test.ts`                    | COMPOSITE-DERIVED | +119/−1                                | `5d263d3db5` `7c4e1d76c8` `a35d115799` `f23dd8cd27`                                        | #1564 f23dd8cd27: 109; #1564 a35d115799: 10                                                                                               | (b) RESTORE upstream bytes                                                                                                                      |
| 173 | `src/auto-reply/reply/dispatch-from-config.lifecycle.ts`                             | COMPOSITE-DERIVED | +11/−8                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 11                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 174 | `src/auto-reply/reply/dispatch-from-config.prepare-context.ts`                       | COMPOSITE-DERIVED | +4/−5                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 3; 7c4e-resolution: 1                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 175 | `src/auto-reply/reply/dispatch-from-config.ts`                                       | COMPOSITE-DERIVED | +37/−0                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 37                                                                                                                      | (b) RESTORE upstream bytes [revives 14 #185730-deleted lines]                                                                                   |
| 176 | `src/auto-reply/reply/get-reply-run-execute.ambient-room-prose.test.ts`              | COMPOSITE-DERIVED | +136/−0                                | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 134; km#1535 static-gates: 2                                                                             | (b) DELETE (composite-new file)                                                                                                                 |
| 177 | `src/auto-reply/reply/queue.drain-generation.test.ts`                                | COMPOSITE-DERIVED | +5/−1                                  | `1bd758eaa1`                                                                               | #1564 1bd758eaa1: 5                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 178 | `src/auto-reply/reply/queue.policy-drop.test.ts`                                     | COMPOSITE-DERIVED | +97/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 97                                                                                                         | (b) DELETE (composite-new file)                                                                                                                 |
| 179 | `src/auto-reply/reply/queue.room-ambient-owner.test.ts`                              | COMPOSITE-DERIVED | +226/−0                                | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 226                                                                                                      | (b) DELETE (composite-new file)                                                                                                                 |
| 180 | `src/auto-reply/reply/queue.room-event-collect.test-support.ts`                      | COMPOSITE-DERIVED | +383/−0                                | `182157c16b` `7c4e1d76c8` `8d6be0e411` `ae1554cedf`                                        | km#1521 ambient-owner-aggregate: 340; #1564 ae1554cedf: 38; #1564 8d6be0e411: 4; #1564 182157c16b: 1                                      | (b) DELETE (composite-new file)                                                                                                                 |
| 181 | `src/auto-reply/reply/queue.room-event-collect.test.ts`                              | COMPOSITE-DERIVED | +803/−0                                | `7c4e1d76c8`                                                                               | km#1517 room-burst: 399; #1415 room-collect: 386; km#1521 ambient-owner-aggregate: 16; km#1535 static-gates: 2                            | (b) DELETE (composite-new file)                                                                                                                 |
| 182 | `src/auto-reply/reply/queue.room-owner-overflow.test.ts`                             | COMPOSITE-DERIVED | +452/−0                                | `8d6be0e411` `a50709cf68` `ae1554cedf`                                                     | #1564 ae1554cedf: 225; #1564 8d6be0e411: 219; #1564 a50709cf68: 8                                                                         | (b) DELETE (composite-new file)                                                                                                                 |
| 183 | `src/auto-reply/reply/queue/cleanup.ts`                                              | COMPOSITE-DERIVED | +3/−2                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 3                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 184 | `src/auto-reply/reply/queue/delivery-context.room-aggregate.test.ts`                 | COMPOSITE-DERIVED | +272/−0                                | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 152; km#1517 room-burst: 120                                                                             | (b) DELETE (composite-new file)                                                                                                                 |
| 185 | `src/auto-reply/reply/queue/delivery-context.ts`                                     | COMPOSITE-DERIVED | +185/−6                                | `7c4e1d76c8`                                                                               | km#1517 room-burst: 125; km#1521 ambient-owner-aggregate: 44; #1415 room-collect: 9; upstream bytes retired by 401a, kept by composite: 7 | (b) RESTORE upstream bytes                                                                                                                      |
| 186 | `src/auto-reply/reply/queue/drain.ts`                                                | COMPOSITE-DERIVED | +74/−21                                | `70579b9133` `7c4e1d76c8`                                                                  | km#1517 room-burst: 50; graft openclaw#124337+#182252: 13; 7c4e-resolution: 6; #1564 70579b9133: 3; …                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 187 | `src/auto-reply/reply/queue/enqueue.ts`                                              | COMPOSITE-DERIVED | +31/−7                                 | `7c4e1d76c8` `8d6be0e411` `ae1554cedf` `fdcec8c5c3`                                        | #1564 ae1554cedf: 19; #1564 8d6be0e411: 8; #1564 fdcec8c5c3: 3; graft openclaw#124337+#182252: 1                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 188 | `src/auto-reply/reply/queue/envelope.ts`                                             | COMPOSITE-DERIVED | +19/−8                                 | `7c4e1d76c8`                                                                               | km#1517 room-burst: 14; #1415 room-collect: 5                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 189 | `src/auto-reply/reply/queue/lifecycle.test.ts`                                       | COMPOSITE-DERIVED | +135/−1                                | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 135                                                                                                        | (b) RESTORE upstream bytes                                                                                                                      |
| 190 | `src/auto-reply/reply/queue/lifecycle.ts`                                            | COMPOSITE-DERIVED | +56/−4                                 | `7c4e1d76c8` `8d6be0e411` `fdcec8c5c3`                                                     | graft openclaw#124337+#182252: 40; #1564 8d6be0e411: 15; upstream bytes retired by 401a, kept by composite: 1                             | (b) RESTORE upstream bytes                                                                                                                      |
| 191 | `src/auto-reply/reply/queue/room-aggregate-plugin-gate.test-support.ts`              | COMPOSITE-DERIVED | +60/−0                                 | `7c4e1d76c8`                                                                               | km#1517 room-burst: 60                                                                                                                    | (b) DELETE (composite-new file)                                                                                                                 |
| 192 | `src/auto-reply/reply/queue/room-aggregate-plugin-gate.test.ts`                      | COMPOSITE-DERIVED | +288/−0                                | `7c4e1d76c8`                                                                               | km#1517 room-burst: 288                                                                                                                   | (b) DELETE (composite-new file)                                                                                                                 |
| 193 | `src/auto-reply/reply/queue/room-aggregate-plugin-gate.ts`                           | COMPOSITE-DERIVED | +140/−0                                | `7c4e1d76c8`                                                                               | km#1517 room-burst: 139; km#1535 static-gates: 1                                                                                          | (b) DELETE (composite-new file)                                                                                                                 |
| 194 | `src/auto-reply/reply/queue/settings.ts`                                             | COMPOSITE-DERIVED | +6/−0                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 6                                                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 195 | `src/auto-reply/reply/queue/state.ts`                                                | COMPOSITE-DERIVED | +3/−2                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 3                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 196 | `src/auto-reply/reply/reply-source-binding.ts`                                       | COMPOSITE-DERIVED | +4/−2                                  | `7c4e1d76c8`                                                                               | #1415 room-collect: 4                                                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 197 | `src/auto-reply/reply/reply-turn-admission.test.ts`                                  | COMPOSITE-DERIVED | +45/−0                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 45                                                                                                                      | (b) RESTORE upstream bytes [revives 2 #185730-deleted lines]                                                                                    |
| 198 | `src/auto-reply/reply/reply-turn-admission.ts`                                       | COMPOSITE-DERIVED | +9/−0                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 9                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 199 | `src/auto-reply/reply/reply-turn-admission.types.ts`                                 | COMPOSITE-DERIVED | +2/−0                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 2                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 200 | `src/auto-reply/reply/reply-turn-recovery-notice.test.ts`                            | COMPOSITE-DERIVED | +47/−0                                 | `92cb6e04ad` `b5141eb8f3`                                                                  | #1564 b5141eb8f3: 44; #1564 92cb6e04ad: 3                                                                                                 | (b) DELETE (composite-new file)                                                                                                                 |
| 201 | `src/auto-reply/reply/reply-turn-recovery-notice.ts`                                 | COMPOSITE-DERIVED | +117/−0                                | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 117                                                                                                                     | (b) DELETE (composite-new file)                                                                                                                 |
| 202 | `src/auto-reply/reply/session-event-delivery.ts`                                     | COMPOSITE-DERIVED | +22/−0                                 | `7c4e1d76c8`                                                                               | km#1538 cron-room-error: 22                                                                                                               | (b) RESTORE upstream bytes                                                                                                                      |
| 203 | `src/auto-reply/reply/session-event-handoff.ts`                                      | COMPOSITE-DERIVED | +2/−3                                  | `7c4e1d76c8`                                                                               | km#1538 cron-room-error: 1; 7c4e-resolution: 1                                                                                            | (b) RESTORE upstream bytes                                                                                                                      |
| 204 | `src/auto-reply/reply/session-event-scheduled-failure.test.ts`                       | COMPOSITE-DERIVED | +352/−0                                | `7c4e1d76c8`                                                                               | km#1538 cron-room-error: 352                                                                                                              | (b) DELETE (composite-new file)                                                                                                                 |
| 205 | `src/auto-reply/reply/session-initialization-admission.ts`                           | COMPOSITE-DERIVED | +18/−4                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 18                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 206 | `src/channels/message/ingress-drain-lifecycle.test.ts`                               | COMPOSITE-DERIVED | +5/−1                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 5                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 207 | `src/channels/message/ingress-drain-lifecycle.ts`                                    | COMPOSITE-DERIVED | +19/−4                                 | `7c4e1d76c8` `8d6be0e411`                                                                  | #1564 8d6be0e411: 13; graft openclaw#124337+#182252: 6                                                                                    | (b) RESTORE upstream bytes                                                                                                                      |
| 208 | `src/channels/message/ingress-drain-options.ts`                                      | COMPOSITE-DERIVED | +70/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 68; km#1531 live-mentions: 2                                                                                       | (b) DELETE (composite-new file)                                                                                                                 |
| 209 | `src/channels/message/ingress-drain-pending-disposition.test.ts`                     | COMPOSITE-DERIVED | +476/−0                                | `182157c16b` `7c4e1d76c8`                                                                  | graft openclaw#121204: 472; #1564 182157c16b: 4                                                                                           | (b) DELETE (composite-new file)                                                                                                                 |
| 210 | `src/channels/message/ingress-drain-pending-disposition.ts`                          | COMPOSITE-DERIVED | +99/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 99                                                                                                                 | (b) DELETE (composite-new file)                                                                                                                 |
| 211 | `src/channels/message/ingress-drain-state.ts`                                        | COMPOSITE-DERIVED | +14/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 14                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 212 | `src/channels/message/ingress-drain.abandonment.test.ts`                             | COMPOSITE-DERIVED | +113/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 113                                                                                                        | (b) DELETE (composite-new file)                                                                                                                 |
| 213 | `src/channels/message/ingress-drain.handoff.test.ts`                                 | COMPOSITE-DERIVED | +30/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 28; 7c4e-resolution: 2                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 214 | `src/channels/message/ingress-drain.test-helpers.ts`                                 | COMPOSITE-DERIVED | +68/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 68                                                                                                         | (b) RESTORE upstream bytes                                                                                                                      |
| 215 | `src/channels/message/ingress-drain.ts`                                              | COMPOSITE-DERIVED | +66/−78                                | `182157c16b` `7c4e1d76c8`                                                                  | graft openclaw#121204: 41; graft openclaw#124337+#182252: 10; upstream bytes retired by 401a, kept by composite: 7; 7c4e-resolution: 6; … | (b) RESTORE upstream bytes                                                                                                                      |
| 216 | `src/channels/message/ingress-drain.watchdog.test.ts`                                | COMPOSITE-DERIVED | +95/−0                                 | `7c4e1d76c8`                                                                               | upstream bytes retired by 401a, kept by composite: 92; graft openclaw#121204: 3                                                           | (b) RESTORE upstream bytes [revives 42 #185730-deleted lines]                                                                                   |
| 217 | `src/channels/message/ingress-queue-cap-drop.ts`                                     | COMPOSITE-DERIVED | +13/−0                                 | `8d6be0e411` `bf4dab0ec7`                                                                  | #1564 bf4dab0ec7: 7; #1564 8d6be0e411: 6                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
| 218 | `src/channels/message/ingress-queue-health.kernel.ts`                                | COMPOSITE-DERIVED | +15/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 15                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 219 | `src/channels/message/ingress-queue-read.worker.ts`                                  | COMPOSITE-DERIVED | +1/−1                                  | `7c4e1d76c8`                                                                               | graft openclaw#121204: 1                                                                                                                  | (b) RESTORE upstream bytes                                                                                                                      |
| 220 | `src/channels/message/ingress-queue.generation.test.ts`                              | COMPOSITE-DERIVED | +142/−0                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 142                                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
| 221 | `src/channels/message/ingress-queue.generation.ts`                                   | COMPOSITE-DERIVED | +19/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 19                                                                                                                 | (b) DELETE (composite-new file)                                                                                                                 |
| 222 | `src/channels/message/ingress-queue.kernel.ts`                                       | COMPOSITE-DERIVED | +25/−31                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 24; 7c4e-resolution: 1                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 223 | `src/channels/message/ingress-queue.listing-access.test.ts`                          | COMPOSITE-DERIVED | +99/−0                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 99                                                                                                                 | (b) DELETE (composite-new file)                                                                                                                 |
| 224 | `src/channels/message/ingress-queue.test.ts`                                         | COMPOSITE-DERIVED | +10/−99                                | `7c4e1d76c8`                                                                               | graft openclaw#121204: 10                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 225 | `src/channels/message/ingress-queue.ts`                                              | COMPOSITE-DERIVED | +28/−6                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 28                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 226 | `src/channels/message/ingress-queue.types.ts`                                        | COMPOSITE-DERIVED | +22/−1                                 | `7c4e1d76c8`                                                                               | graft openclaw#121204: 22                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 227 | `src/channels/message/ingress-retry-policy.test.ts`                                  | COMPOSITE-DERIVED | +27/−0                                 | `bf4dab0ec7`                                                                               | #1564 bf4dab0ec7: 27                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 228 | `src/channels/message/ingress-retry-policy.ts`                                       | COMPOSITE-DERIVED | +22/−7                                 | `7c4e1d76c8` `8d6be0e411` `bf4dab0ec7`                                                     | upstream bytes retired by 401a, kept by composite: 9; #1564 8d6be0e411: 5; #1564 bf4dab0ec7: 4; 7c4e-resolution: 4                        | (b) RESTORE upstream bytes [revives 4 #185730-deleted lines]                                                                                    |
| 229 | `src/commands/doctor-child-memory-scope.test.ts`                                     | COMPOSITE-DERIVED | +48/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 48                                                                                                            | (b) DELETE (composite-new file)                                                                                                                 |
| 230 | `src/commands/doctor-child-memory-scope.ts`                                          | COMPOSITE-DERIVED | +39/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 39                                                                                                            | (b) DELETE (composite-new file)                                                                                                                 |
| 231 | `src/commands/doctor/shared/session-entry-rewrite.ts`                                | COMPOSITE-DERIVED | +21/−11                                | `a047b9afed`                                                                               | #1564 a047b9afed: 21                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 232 | `src/commands/doctor/shared/session-entry-shape.ts`                                  | COMPOSITE-DERIVED | +21/−13                                | `a047b9afed`                                                                               | #1564 a047b9afed: 21                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 233 | `src/config/schema.help.automation.ts`                                               | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 4                                                                                                        | (b) RESTORE upstream bytes                                                                                                                      |
| 234 | `src/config/schema.help.core.ts`                                                     | COMPOSITE-DERIVED | +4/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 4                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 235 | `src/config/schema.help.models.ts`                                                   | COMPOSITE-DERIVED | +1/−1                                  | `7c4e1d76c8`                                                                               | km#1539 memory-reindex: 1                                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 236 | `src/config/schema.labels.messages.ts`                                               | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 2                                                                                                        | (b) RESTORE upstream bytes                                                                                                                      |
| 237 | `src/config/schema.labels.ts`                                                        | COMPOSITE-DERIVED | +3/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 3                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 238 | `src/config/schema.tiers.ts`                                                         | COMPOSITE-DERIVED | +4/−1                                  | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 3; 7c4e-resolution: 1                                                                                    | (b) RESTORE upstream bytes                                                                                                                      |
| 239 | `src/config/sessions/session-entry-json.test.ts`                                     | COMPOSITE-DERIVED | +43/−0                                 | `70579b9133` `b5141eb8f3`                                                                  | #1564 b5141eb8f3: 42; #1564 70579b9133: 1                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 240 | `src/config/sessions/session-entry-public-patch.ts`                                  | COMPOSITE-DERIVED | +3/−0                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 3                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 241 | `src/config/sessions/session-entry-raw.worker.ts`                                    | COMPOSITE-DERIVED | +18/−0                                 | `92cb6e04ad`                                                                               | #1564 92cb6e04ad: 18                                                                                                                      | (b) DELETE (composite-new file)                                                                                                                 |
| 242 | `src/config/sessions/session-entry-write-policy.ts`                                  | COMPOSITE-DERIVED | +7/−2                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 7                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 243 | `src/config/sessions/session-work-start.restart-tombstone.test.ts`                   | COMPOSITE-DERIVED | +43/−0                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 43                                                                                                                      | (b) DELETE (composite-new file)                                                                                                                 |
| 244 | `src/config/sessions/session-work-start.ts`                                          | COMPOSITE-DERIVED | +16/−0                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 16                                                                                                                      | (b) RESTORE upstream bytes [revives 2 #185730-deleted lines]                                                                                    |
| 245 | `src/config/sessions/startup-migration-runtime.ts`                                   | COMPOSITE-DERIVED | +1/−1                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 1                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 246 | `src/config/sessions/startup-migration.tombstones.test.ts`                           | COMPOSITE-DERIVED | +54/−25                                | `70579b9133` `a047b9afed` `b3a600599e`                                                     | #1564 a047b9afed: 53; #1564 70579b9133: 1                                                                                                 | (b) RESTORE upstream bytes                                                                                                                      |
| 247 | `src/config/sessions/store-entry-shape.ts`                                           | COMPOSITE-DERIVED | +20/−8                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 20                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 248 | `src/config/sessions/work-start-error.ts`                                            | COMPOSITE-DERIVED | +7/−0                                  | `c5eefd7ec6`                                                                               | #1564 c5eefd7ec6: 7                                                                                                                       | (b) RESTORE upstream bytes [revives 4 #185730-deleted lines]                                                                                    |
| 249 | `src/config/zod-schema.core.test.ts`                                                 | COMPOSITE-DERIVED | +14/−0                                 | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 14                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 250 | `src/config/zod-schema.messages.ts`                                                  | COMPOSITE-DERIVED | +19/−0                                 | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 19                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 251 | `src/config/zod-schema.process.test.ts`                                              | COMPOSITE-DERIVED | +35/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 35                                                                                                            | (b) DELETE (composite-new file)                                                                                                                 |
| 252 | `src/config/zod-schema.process.ts`                                                   | COMPOSITE-DERIVED | +59/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 59                                                                                                            | (b) DELETE (composite-new file)                                                                                                                 |
| 253 | `src/config/zod-schema.root-shape.ts`                                                | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 2                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 254 | `src/flows/doctor-health-contributions-initial.ts`                                   | COMPOSITE-DERIVED | +16/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 16                                                                                                            | (b) RESTORE upstream bytes                                                                                                                      |
| 255 | `src/gateway/methods/core-descriptors.ts`                                            | COMPOSITE-DERIVED | +1/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 1                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 256 | `src/gateway/server-methods/core-handlers.ts`                                        | COMPOSITE-DERIVED | +2/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 2                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 257 | `src/gateway/server-methods/sessions-recover.ts`                                     | COMPOSITE-DERIVED | +74/−0                                 | `a047b9afed`                                                                               | #1564 a047b9afed: 74                                                                                                                      | (b) DELETE (composite-new file) [file deleted upstream by #185730]                                                                              |
| 258 | `src/gateway/server-restart-sentinel-continuation-intent.ts`                         | COMPOSITE-DERIVED | +55/−0                                 | `182157c16b` `b5141eb8f3`                                                                  | #1564 b5141eb8f3: 55                                                                                                                      | (b) DELETE (composite-new file) [file deleted upstream by #185730]                                                                              |
| 259 | `src/gateway/server-restart-sentinel-session-event.ts`                               | COMPOSITE-DERIVED | +90/−0                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 90                                                                                                                      | (b) DELETE (composite-new file) [file deleted upstream by #185730]                                                                              |
| 260 | `src/gateway/session-method-policy.ts`                                               | COMPOSITE-DERIVED | +1/−0                                  | `a047b9afed`                                                                               | #1564 a047b9afed: 1                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 261 | `src/gateway/session-restart-resume-marker.ts`                                       | COMPOSITE-DERIVED | +33/−0                                 | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 33                                                                                                                      | (b) DELETE (composite-new file)                                                                                                                 |
| 262 | `src/gateway/session-restart-resume.test.ts`                                         | COMPOSITE-DERIVED | +7/−0                                  | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 7                                                                                                                       | (b) RESTORE upstream bytes                                                                                                                      |
| 263 | `src/gateway/session-restart-resume.ts`                                              | COMPOSITE-DERIVED | +12/−21                                | `b5141eb8f3`                                                                               | #1564 b5141eb8f3: 12                                                                                                                      | (b) RESTORE upstream bytes                                                                                                                      |
| 264 | `src/gateway/session-tombstone-recovery.test.ts`                                     | COMPOSITE-DERIVED | +347/−0                                | `a047b9afed`                                                                               | #1564 a047b9afed: 347                                                                                                                     | (b) DELETE (composite-new file)                                                                                                                 |
| 265 | `src/gateway/session-tombstone-recovery.ts`                                          | COMPOSITE-DERIVED | +168/−0                                | `92cb6e04ad` `a047b9afed`                                                                  | #1564 a047b9afed: 160; #1564 92cb6e04ad: 8                                                                                                | (b) DELETE (composite-new file)                                                                                                                 |
| 266 | `src/plugin-sdk/channel-ingress-runtime.test.ts`                                     | COMPOSITE-DERIVED | +4/−2                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 4                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 267 | `src/plugin-sdk/channel-ingress-runtime.ts`                                          | COMPOSITE-DERIVED | +7/−11                                 | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 7                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 268 | `src/plugin-sdk/channel-ingress-test-runtime.ts`                                     | COMPOSITE-DERIVED | +4/−1                                  | `7c4e1d76c8`                                                                               | graft openclaw#124337+#182252: 4                                                                                                          | (b) RESTORE upstream bytes                                                                                                                      |
| 269 | `src/plugin-sdk/process-runtime.ts`                                                  | COMPOSITE-DERIVED | +1/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 1                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 270 | `src/process/child-memory-scope.test.ts`                                             | COMPOSITE-DERIVED | +479/−0                                | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 479                                                                                                           | (b) DELETE (composite-new file)                                                                                                                 |
| 271 | `src/process/child-memory-scope.ts`                                                  | COMPOSITE-DERIVED | +247/−0                                | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 247                                                                                                           | (b) DELETE (composite-new file)                                                                                                                 |
| 272 | `src/process/owned-stdio.ts`                                                         | COMPOSITE-DERIVED | +2/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 2                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 273 | `src/process/supervisor/adapters/child.ts`                                           | COMPOSITE-DERIVED | +17/−2                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 17                                                                                                            | (b) RESTORE upstream bytes                                                                                                                      |
| 274 | `src/process/supervisor/adapters/pty.ts`                                             | COMPOSITE-DERIVED | +8/−1                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 8                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 275 | `src/process/supervisor/spawn-argv.ts`                                               | COMPOSITE-DERIVED | +25/−0                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 25                                                                                                            | (b) DELETE (composite-new file)                                                                                                                 |
| 276 | `src/process/supervisor/supervisor.child-memory-scope.test.ts`                       | COMPOSITE-DERIVED | +140/−0                                | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 140                                                                                                           | (b) DELETE (composite-new file)                                                                                                                 |
| 277 | `src/process/supervisor/supervisor.ts`                                               | COMPOSITE-DERIVED | +3/−19                                 | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 3                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 278 | `src/process/supervisor/types.ts`                                                    | COMPOSITE-DERIVED | +6/−0                                  | `7c4e1d76c8`                                                                               | km#1526 child-memory-scope: 6                                                                                                             | (b) RESTORE upstream bytes                                                                                                                      |
| 279 | `src/sessions/session-controller.mailbox-cleanup.ts`                                 | COMPOSITE-DERIVED | +55/−1                                 | `7c4e1d76c8`                                                                               | upstream bytes retired by 401a, kept by composite: 52; graft openclaw#124337+#182252: 2; 7c4e-resolution: 1                               | (b) RESTORE upstream bytes [revives 26 #185730-deleted lines]                                                                                   |
| 280 | `src/sessions/session-controller.mailbox-dispatch.ts`                                | COMPOSITE-DERIVED | +4/−3                                  | `7c4e1d76c8`                                                                               | km#1517 room-burst: 4                                                                                                                     | (b) RESTORE upstream bytes                                                                                                                      |
| 281 | `src/sessions/session-controller.mailbox-source.ts`                                  | COMPOSITE-DERIVED | +22/−11                                | `7c4e1d76c8` `8d6be0e411`                                                                  | #1564 8d6be0e411: 19; graft openclaw#124337+#182252: 3                                                                                    | (b) RESTORE upstream bytes                                                                                                                      |
| 282 | `src/sessions/session-controller.mailbox.ts`                                         | COMPOSITE-DERIVED | +2/−0                                  | `c5eefd7ec6`                                                                               | #1564 c5eefd7ec6: 2                                                                                                                       | (b) RESTORE upstream bytes [revives 2 #185730-deleted lines]                                                                                    |
| 283 | `test/discord-room-ambient-owner-echo.integration.test.ts`                           | COMPOSITE-DERIVED | +208/−0                                | `7c4e1d76c8`                                                                               | km#1521 ambient-owner-aggregate: 208                                                                                                      | (b) DELETE (composite-new file)                                                                                                                 |

## 6. Outside the composite class: non-feature bytes found in stage A (not repaired here)

These files are classed CONTINUATION because they came in on the presentation line's own history, without a composite merge or a graft. They are still not continuation-_feature_ bytes. They are recorded so a later ruling can decide on them; this lane did not widen its scope to cover them.

1. **Fleet-schema bridge carry: 11 files, about 4,900 lines.** These files describe themselves as fork-owned. `src/state/openclaw-agent-fleet38-bridge.ts` starts with: "Frond (karmaterminal): fleet-38 bridge. Fork-owned and outside the upstream-facing continuation diff; the jump-13 Gate 2 notes list this file and each of its call sites." All 11 are in the `401a1de3..9bfc4d31` diff that the PR presents. Upstream installs never held a fleet-38/39/41 or v25/v26-fleet database.

   | file                                                                | lines | main first-parent commits  |
   | ------------------------------------------------------------------- | ----: | -------------------------- |
   | `src/state/openclaw-agent-fleet38-bridge.ts`                        |   263 | `e4a55624fc`, `9df282dd29` |
   | `src/state/openclaw-agent-fleet-schema-history.ts`                  |   145 | `7a537c69cd`, `b7407cf43c` |
   | `src/state/openclaw-agent-db.schema-bridge.test-support.ts`         |   208 | `9a3022b618`               |
   | `src/state/openclaw-agent-db.schema25-bridge.test.ts`               |   301 | `1d606e9f58`, `9a3022b618` |
   | `src/state/openclaw-agent-db.schema26-bridge.test.ts`               |   216 | `9a3022b618`               |
   | `src/state/openclaw-state-db.continuation-records-fleet.test.ts`    |   133 | `594016ebc4`               |
   | `src/commands/doctor-migration-backup.fleet-history.test.ts`        |   173 | `3d9cadacd0`, `e4a55624fc` |
   | `test/fixtures/sqlite/openclaw-agent-schema-v25-fleet-captured.sql` |   881 | `15116abcd0`               |
   | `test/fixtures/sqlite/openclaw-agent-schema-v26-fleet.sql`          |   921 | `9a3022b618`               |
   | `test/fixtures/sqlite/openclaw-agent-schema-v26-fleet-migrated.sql` |   768 | `9a3022b618`               |
   | `test/fixtures/sqlite/openclaw-agent-schema-v38-fleet.sql`          |   907 | `76ab3e72f7`               |

   `src/state/openclaw-agent-db.fleet38-bridge.test.ts` and `src/commands/doctor-schema-migrations.fleet38-bridge.test.ts` are MIXED: their composite tombstone rows are in §5, and their stage-A base belongs to this same carry.

2. **Upstream cherry-pick, post-base: 102 lines in 15 files.** `6909b643c7` "fix(sessions): keep transcript workers outside Doctor repair imports (#197153)" (RoboClaw) is a cherry-pick of upstream `6d71e65086`, which landed after `401a1de3`. Most of its lines are in `session-accessor.sqlite-canonical-read.ts` (55) and `test/scripts/ci-workflow-planning.test.ts` (24). These bytes are upstream's, and they disappear from the PR diff once the candidate's base includes `6d71e65086`; `b894fe5e` does.

3. **Old upstream residue: 64 lines in 13 files.** Some lines in continuation-touched files attribute, on the first parent, to upstream commits from 2026-02..05 that `401a1de3` has since rewritten. Examples: `session-delivery-queue-storage.ts` (18), `subagent-attachments.ts` (11), `reply-state.test.ts` (10), `subagent-spawn.attachments.test.ts` (8). This is Gate 2.7 territory (upstream-content preservation) and not composite.

## 7. Gaps and uncertainties

- **No test or typecheck run.** The workorder's CI is "none". The claim that the composite is not required is backed by clean textual replay, a symbol-reference check and the prior j14 candidate. It is not backed by running the continuation suites on the counterfactual tree. Before the repaired head is frozen, run the continuation focused suites and Mode-B at the exact repaired SHA.
- **Clusters are approximate.** Each composite line is clustered to the first fleet first-parent merge that contains its plain-blame origin. A line re-authored later on the fleet line is credited to the later carrier. Cluster boundaries are therefore approximate, but the class of each file is exact: it comes from tree comparison.
- **Lines older than the shallow cut.** A plain blame that lands on the shallow boundary `fa85b5b237` means "upstream bytes older than 2026-09-20". The true upstream commit cannot be resolved without deepening the shared clone, which this read-only lane did not do.
- **The #185730 match is by text.** Same-file exact text, lines of 30 characters or more. Short revived lines (under 30 characters) are not counted.
- **The counterfactual is not a published ref.** It is a dangling local object (commit `48f6ce36206e…`, tree `bc61c99e31d6dc38e0cac04ff4438a8083083f36`). The tree SHA is deterministic, and §8 reproduces it.

## 8. Reproduction

```bash
# from any karmaterminal/openclaw clone with origin + upstream fetched
B=401a1de38b9a4c7ee3f1b19908df777a2f02506d J=541d0428079020653342ae49f6f520e97be9135a H=9bfc4d31993763f51f9a3597b808e741908df660
git log --first-parent --merges --format='%h %s' 7c4e1d76c8~1..$H          # the one composite merge on the chain
git rev-list 0ab8db762f ^8183790aad ^upstream/main | sort > /tmp/f; git rev-list $J ^upstream/main | sort > /tmp/j
comm -12 /tmp/f /tmp/j | wc -l                                               # 0: nothing composite before 7c4e
# counterfactual: j14 prep + the 22 post-composite continuation commits
export GIT_AUTHOR_NAME=a GIT_AUTHOR_EMAIL=a@l GIT_COMMITTER_NAME=a GIT_COMMITTER_EMAIL=a@l \
       GIT_AUTHOR_DATE=1970-01-01T00:00:00Z GIT_COMMITTER_DATE=1970-01-01T00:00:00Z
base=$J
for c in $(git rev-list --first-parent --reverse 39d1945464..$H); do
  case $(git log -1 --format=%h --abbrev=10 $c) in fdcec8c5c3|a35d115799|5d263d3db5|ae1554cedf|e95e8f2374|a50709cf68|8d6be0e411|f23dd8cd27|bf4dab0ec7|1bd758eaa1|33687562c1|fefcde6235|59a5187bd6|c627607903) continue;; esac
  out=$(git merge-tree --write-tree --merge-base=$c^1 $base $c) || { echo CONFLICT $c; break; }
  base=$(git commit-tree ${out%%$'\n'*} -p $base -m cf)
done
git rev-parse $base^{tree}                                                   # bc61c99e31d6dc38e0cac04ff4438a8083083f36
git diff --no-renames --shortstat $base $H                                   # 282 files, +19753 −3443
# drain-restart blobs
for r in $B $J b894fe5e 0306ff3b92 $H; do git rev-parse $r:src/sessions/session-controller.mailbox-cleanup.ts; done
```

## Appendix: CONTINUATION files (1,036)

<details><summary>Full list</summary>

- `.github/workflows/ci.yml`
- `apps/.i18n/native-source.json`
- `apps/shared/OpenClawKit/Sources/OpenClawKit/Resources/tool-display.json`
- `config/knip-dynamic-consumers.mjs`
- `config/knip.config.ts`
- `config/test-lines-allocations/agent-schema-version-metadata-guard.txt`
- `config/test-lines-allocations/continuation-20261029.txt`
- `config/test-lines-allocations/continuation-descriptions-1547.txt` (post-composite continuation commit)
- `config/test-lines-allocations/continuation-direct-only.txt` (post-composite continuation commit)
- `config/test-lines-allocations/continuation-f2-composition.txt`
- `config/test-lines-allocations/continuation-input-consumption.txt`
- `config/test-lines-allocations/continuation-j12-baseline-shift.txt`
- `config/test-lines-allocations/continuation-j12-coverage.txt`
- `config/test-lines-allocations/continuation-j12prime.txt`
- `config/test-lines-allocations/continuation-j13-baseline-shift.txt`
- `config/test-lines-allocations/continuation-j13-coverage.txt`
- `config/test-lines-allocations/continuation-j14-baseline-shift.txt`
- `config/test-lines-allocations/continuation-j14-coverage.txt`
- `config/test-lines-allocations/continuation-lifeboat-spans-1497.txt`
- `config/test-lines-allocations/continuation-refused-outcome.txt`
- `config/test-lines-allocations/continuation-request-compaction-unmeasured-20261030.txt`
- `config/test-lines-allocations/continuation-tooling-list-slot.txt` (post-composite continuation commit)
- `config/test-lines-allocations/continuation-wake-line.txt` (post-composite continuation commit)
- `config/test-lines-allocations/continuation-work-recovery-gateway-scope.txt`
- `config/test-lines-allocations/node-children-compiler-flags-1546-node-fixtures.txt`
- `config/test-lines-allocations/node-children-compiler-flags-1546.txt`
- `config/test-lines-allocations/pg16-independent-smoke.txt`
- `docs/assets/continuation-tools/continue-delegate.svg`
- `docs/assets/continuation-tools/continue-work.svg`
- `docs/assets/continuation-tools/request-compaction.svg`
- `docs/cli/index.md`
- `docs/design/continuation-tools-infographics.md`
- `docs/design/continue-work-signal-v2.md` (post-composite continuation commit)
- `docs/gateway/background-process.md`
- `docs/plugins/codex-harness-reference/restricted-turns.md`
- `docs/plugins/sdk-runtime/config-and-utilities.md`
- `docs/reference/database-schemas/agent-schema-history.md`
- `docs/reference/database-schemas/versioning.md`
- `docs/tools/slash-commands.md`
- `docs/tools/subagents/nesting.md`
- `extensions/autoreview/src/tool.test.ts`
- `extensions/autoreview/src/tool.ts`
- `extensions/codex/README.md`
- `extensions/codex/native-tool-policy.ts`
- `extensions/codex/src/app-server/dynamic-tool-build-scheduled-work.ts`
- `extensions/codex/src/app-server/dynamic-tool-build.ts`
- `extensions/codex/src/app-server/dynamic-tool-diagnostics.ts`
- `extensions/codex/src/app-server/dynamic-tools.continuation-status.test.ts`
- `extensions/codex/src/app-server/history-rejection.ts`
- `extensions/codex/src/app-server/run-attempt-server-requests.ts`
- `extensions/codex/src/app-server/run-attempt-types.ts`
- `extensions/codex/src/app-server/run-attempt.dynamic-tools.test.ts`
- `extensions/codex/src/app-server/settled-turn-context.test.ts`
- `extensions/codex/src/app-server/settled-turn-prior-context.test.ts`
- `extensions/codex/src/app-server/settled-turn-projection.test.ts`
- `extensions/codex/src/app-server/settled-turn-projection.ts`
- `extensions/codex/src/app-server/side-question-dynamic-tool-call.ts`
- `extensions/codex/src/app-server/side-question.continuation.test.ts`
- `extensions/codex/src/app-server/side-question.ts`
- `extensions/diagnostics-otel/api.ts`
- `extensions/diagnostics-otel/src/codex-dynamic-tool-origin.integration.test.ts`
- `extensions/diagnostics-otel/src/continuation-tracer-adapter.integration.test.ts`
- `extensions/diagnostics-otel/src/continuation-tracer-adapter.test.ts`
- `extensions/diagnostics-otel/src/continuation-tracer-adapter.ts`
- `extensions/diagnostics-otel/src/continuation-tracer-ownership.ts`
- `extensions/diagnostics-otel/src/service-traces.ts`
- `extensions/diagnostics-otel/src/service.continuation-tracer.test.ts`
- `extensions/diagnostics-otel/src/service.ts`
- `extensions/tsconfig.package-boundary.paths.json`
- `extensions/xai/tsconfig.json`
- `gateway-prewarm.mjs`
- `node-compile-cache.mjs`
- `node-runtime-env.d.mts`
- `node-runtime-env.mjs`
- `package.json`
- `packages/gateway-protocol/src/protocol-boundary.guard.test.ts`
- `packages/gateway-protocol/src/schema/agent.schema.test.ts`
- `packages/gateway-protocol/src/schema/agent.ts`
- `packages/gateway-protocol/src/schema/internal-fields.ts`
- `scripts/bench-agent-concurrency-worker.ts`
- `scripts/build-all.mts`
- `scripts/check-built-plugin-control-plane-modules.mts`
- `scripts/ci-build-manifest.mjs`
- `scripts/lib/ci-node-test-plan.mts`
- `scripts/lib/ci-proof-test-inventory.mts`
- `scripts/lib/plugin-sdk-entries.mts`
- `scripts/lib/plugin-sdk-entrypoints.json`
- `scripts/lib/plugin-sdk-private-local-only-subpaths.json`
- `scripts/lib/prepare-control-ui-settings.mts`
- `scripts/lib/sqlite-schema-inputs.mts`
- `scripts/lib/tsgo-core-test-shards.mts`
- `scripts/perf/subagent-sweep-measure.ts`
- `scripts/plugin-sdk-surface-report.mts`
- `scripts/prepare-git-hooks.mjs`
- `scripts/protocol-gen-swift.ts`
- `scripts/protocol-gen.ts`
- `scripts/tsdown-build.mts`
- `scripts/ui.mts`
- `scripts/write-build-info.ts`
- `scripts/write-cli-startup-metadata.ts`
- `src/acp/client.ts`
- `src/agents/agent-command.ts`
- `src/agents/agent-create.integration.test.ts`
- `src/agents/agent-tools.assembly.ts`
- `src/agents/agent-tools.before-tool-call.wrapper.ts`
- `src/agents/agent-tools.options.ts`
- `src/agents/agent-tools.policy.ts`
- `src/agents/cli-runner/helpers.ts`
- `src/agents/command/attempt-execution.continuation.ts`
- `src/agents/command/attempt-execution.continue-work-opts.test.ts`
- `src/agents/command/attempt-execution.continue-work-races.test.ts`
- `src/agents/command/attempt-execution.continue-work-token.test.ts`
- `src/agents/command/attempt-execution.continue-work.test-support.ts`
- `src/agents/command/attempt-execution.continue-work.ts`
- `src/agents/command/attempt-execution.helpers.ts`
- `src/agents/command/attempt-execution.request-compaction-opts.test.ts`
- `src/agents/command/attempt-execution.ts`
- `src/agents/command/session.automatic-reset.continuation.test.ts`
- `src/agents/command/types.ts`
- `src/agents/compaction-attribution.ts`
- `src/agents/core-tool-facts.ts`
- `src/agents/embedded-agent-runner.session-fork.test.ts`
- `src/agents/embedded-agent-runner/cli-backend-dispatch-transcript.persistence.test.ts`
- `src/agents/embedded-agent-runner/cli-backend-dispatch-transcript.test.ts`
- `src/agents/embedded-agent-runner/cli-backend-dispatch-transcript.ts`
- `src/agents/embedded-agent-runner/compact-reasons.test.ts`
- `src/agents/embedded-agent-runner/compact-reasons.ts`
- `src/agents/embedded-agent-runner/compact.hooks.continuation.test.ts`
- `src/agents/embedded-agent-runner/compact.types.ts`
- `src/agents/embedded-agent-runner/prepared-compaction-runtime.ts`
- `src/agents/embedded-agent-runner/run-orchestrator.ts`
- `src/agents/embedded-agent-runner/run.continuation-fixture.test-support.ts`
- `src/agents/embedded-agent-runner/run.continuation-integration.test.ts`
- `src/agents/embedded-agent-runner/run.continuation-opts-forward.test.ts`
- `src/agents/embedded-agent-runner/run.continuation-overflow-recovery.test-support.ts`
- `src/agents/embedded-agent-runner/run.overflow-compaction.harness.ts`
- `src/agents/embedded-agent-runner/run.timeout-triggered-compaction.test-support.ts`
- `src/agents/embedded-agent-runner/run/attempt-prompt-submit.ts`
- `src/agents/embedded-agent-runner/run/attempt-system-prompt-prepare.ts`
- `src/agents/embedded-agent-runner/run/attempt-system-prompt.test.ts`
- `src/agents/embedded-agent-runner/run/attempt-tool-prepare.ts`
- `src/agents/embedded-agent-runner/run/attempt.cwd-split.test.ts`
- `src/agents/embedded-agent-runner/run/continue-delegate-turn-budget.ts`
- `src/agents/embedded-agent-runner/run/overflow-context-recovery.ts`
- `src/agents/embedded-agent-runner/run/params.ts`
- `src/agents/embedded-agent-runner/run/payloads.continuation.test.ts`
- `src/agents/embedded-agent-runner/run/payloads.ts`
- `src/agents/embedded-agent-runner/run/recovery-context-pressure.ts`
- `src/agents/embedded-agent-runner/run/run-attempt-dispatch.ts`
- `src/agents/embedded-agent-runner/run/shared-run-context.continuation.test.ts`
- `src/agents/embedded-agent-runner/run/shared-run-context.ts`
- `src/agents/embedded-agent-runner/run/timeout-context-recovery.ts`
- `src/agents/embedded-agent-runner/server-endpoint-compaction.test.ts`
- `src/agents/embedded-agent-runner/server-endpoint-compaction.ts`
- `src/agents/embedded-agent-runner/skill-runtime.library-read.test.ts`
- `src/agents/embedded-agent-runner/types.ts`
- `src/agents/embedded-agent-subscribe.e2e-harness.ts`
- `src/agents/embedded-agent-subscribe.handlers.messages.lifecycle.ts`
- `src/agents/embedded-agent-subscribe.handlers.messages.snapshot.continuation.test.ts`
- `src/agents/embedded-agent-subscribe.handlers.messages.snapshot.ts`
- `src/agents/embedded-agent-subscribe.handlers.messages.stream.continuation.test.ts`
- `src/agents/embedded-agent-subscribe.handlers.messages.stream.ts`
- `src/agents/embedded-agent-subscribe.handlers.messages.update.ts`
- `src/agents/embedded-agent-subscribe.stream-rendering.ts`
- `src/agents/embedded-agent-subscribe.subscribe-embedded-agent-session.continuation-provider-filtering.test.ts`
- `src/agents/embedded-agent-subscribe.subscribe-embedded-agent-session.continuation-responses.test.ts`
- `src/agents/embedded-agent-utils.test.ts`
- `src/agents/embedded-agent-utils.ts`
- `src/agents/harness/native-hook-relay-command.test.ts`
- `src/agents/harness/native-hook-relay-command.ts`
- `src/agents/harness/native-hook-relay.test-support.ts`
- `src/agents/harness/native-hook-relay.test.ts`
- `src/agents/openclaw-tools.continuation-misconfig-warn.test.ts`
- `src/agents/openclaw-tools.continuation-registration.test.ts`
- `src/agents/openclaw-tools.continuation-run.ts`
- `src/agents/openclaw-tools.continuation.session-key.test.ts`
- `src/agents/openclaw-tools.continuation.tool-surface.test.ts` (post-composite continuation commit)
- `src/agents/openclaw-tools.continuation.ts`
- `src/agents/openclaw-tools.pdf-tool.ts`
- `src/agents/openclaw-tools.ts`
- `src/agents/openclaw-tools.types.ts`
- `src/agents/session-tool-result-guard.transcript-events.test.ts`
- `src/agents/session-transcript-repair.attachments.test.ts`
- `src/agents/session-transcript-repair.ts`
- `src/agents/spawn-pipeline.ts`
- `src/agents/subagent-announce-message.ts`
- `src/agents/subagent-announce.chain-guard.test.ts`
- `src/agents/subagent-announce.continuation-drain.bracket-hedge.test.ts`
- `src/agents/subagent-announce.continuation-drain.chain-cost.test.ts`
- `src/agents/subagent-announce.continuation-drain.test.ts`
- `src/agents/subagent-announce.continuation-drain.tool-hop-order.test.ts`
- `src/agents/subagent-announce.continuation-fallback-task-row.test.ts`
- `src/agents/subagent-announce.continuation-owner-events.ts`
- `src/agents/subagent-announce.continuation-parity-gate.test.ts`
- `src/agents/subagent-announce.continuation-return.ts`
- `src/agents/subagent-announce.continuation-self-work.ts`
- `src/agents/subagent-announce.continuation-tool-delegate-commit.test.ts`
- `src/agents/subagent-announce.continuation.accounting.ts`
- `src/agents/subagent-announce.continuation.runtime.test.ts`
- `src/agents/subagent-announce.continuation.runtime.ts`
- `src/agents/subagent-announce.continuation.test.ts`
- `src/agents/subagent-announce.continuation.work-scope.test.ts`
- `src/agents/subagent-announce.crosssession-gate.test.ts`
- `src/agents/subagent-announce.live-tree-chain-proof.test.ts`
- `src/agents/subagent-announce.postcompaction-route.test.ts`
- `src/agents/subagent-announce.self-continuation.test.ts`
- `src/agents/subagent-announce.silent-wake.test.ts`
- `src/agents/subagent-announce.spawn-reject-obs.test.ts`
- `src/agents/subagent-announce.targeted-return.integration.test.ts`
- `src/agents/subagent-continuation-ids.ts`
- `src/agents/subagent-partial-registration-ownership.test.ts`
- `src/agents/subagent-registry-registration-rollback.test.ts`
- `src/agents/subagent-registry.archive.continuation.e2e.test.ts`
- `src/agents/subagent-registry.persistence.restore-recovery.test.ts`
- `src/agents/subagent-session-cleanup.test.ts`
- `src/agents/subagent-traceparent-handoff.ts`
- `src/agents/subagents/announce/subagent-announce-delivery.completion-contract.test.ts`
- `src/agents/subagents/announce/subagent-announce-delivery.origin.test.ts`
- `src/agents/subagents/announce/subagent-announce-delivery.ts`
- `src/agents/subagents/announce/subagent-announce-direct-delivery.continuation.test.ts`
- `src/agents/subagents/announce/subagent-announce-direct-delivery.continuation.ts`
- `src/agents/subagents/announce/subagent-announce-direct-delivery.ts`
- `src/agents/subagents/announce/subagent-announce-dispatch.ts`
- `src/agents/subagents/announce/subagent-announce-owner-coordination.ts`
- `src/agents/subagents/announce/subagent-announce-result.test.ts`
- `src/agents/subagents/announce/subagent-announce-result.ts`
- `src/agents/subagents/announce/subagent-announce.format.continuation.e2e.test.ts`
- `src/agents/subagents/announce/subagent-announce.runtime.ts`
- `src/agents/subagents/announce/subagent-announce.test-support.ts`
- `src/agents/subagents/announce/subagent-announce.test.ts`
- `src/agents/subagents/announce/subagent-announce.timeout.test.ts`
- `src/agents/subagents/announce/subagent-announce.ts`
- `src/agents/subagents/announce/subagent-announce.types.ts`
- `src/agents/subagents/completion/subagent-completion-admission.test-helpers.ts`
- `src/agents/subagents/registry/continuation-forest.build.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.fire.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.followups.test.ts`
- `src/agents/subagents/registry/continuation-forest.handovers.test.ts`
- `src/agents/subagents/registry/continuation-forest.head-swaps.test.ts`
- `src/agents/subagents/registry/continuation-forest.load.benchmark.test.ts`
- `src/agents/subagents/registry/continuation-forest.load.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.maintenance.test.ts`
- `src/agents/subagents/registry/continuation-forest.model.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.oracle.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.restarts.test.ts`
- `src/agents/subagents/registry/continuation-forest.seams.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.trouble.test-support.ts`
- `src/agents/subagents/registry/continuation-forest.world.test-support.ts`
- `src/agents/subagents/registry/subagent-announcement.worker.test.ts`
- `src/agents/subagents/registry/subagent-continuation-reset-active.ts`
- `src/agents/subagents/registry/subagent-continuation-reset-retention.ts`
- `src/agents/subagents/registry/subagent-control-kill-scope.ts`
- `src/agents/subagents/registry/subagent-control-scope.ts`
- `src/agents/subagents/registry/subagent-delivery-state.ts`
- `src/agents/subagents/registry/subagent-registry-activation.ts`
- `src/agents/subagents/registry/subagent-registry-announce-flow.ts`
- `src/agents/subagents/registry/subagent-registry-completion-runtime.test.ts`
- `src/agents/subagents/registry/subagent-registry-helpers.test.ts`
- `src/agents/subagents/registry/subagent-registry-kill-confirmation.ts`
- `src/agents/subagents/registry/subagent-registry-lifecycle-announce-cleanup.ts`
- `src/agents/subagents/registry/subagent-registry-lifecycle-bookkeeping.ts`
- `src/agents/subagents/registry/subagent-registry-lifecycle-delivery.owner.test.ts`
- `src/agents/subagents/registry/subagent-registry-lifecycle-wake.rejection-write.test.ts`
- `src/agents/subagents/registry/subagent-registry-lifecycle-wake.ts`
- `src/agents/subagents/registry/subagent-registry-lifecycle.requester-agent.test.ts`
- `src/agents/subagents/registry/subagent-registry-maintenance.test.ts`
- `src/agents/subagents/registry/subagent-registry-maintenance.ts`
- `src/agents/subagents/registry/subagent-registry-persistence.rollback-custody.test.ts`
- `src/agents/subagents/registry/subagent-registry-queries.continuation.ts`
- `src/agents/subagents/registry/subagent-registry-queries.requester-window.test.ts`
- `src/agents/subagents/registry/subagent-registry-queries.ts`
- `src/agents/subagents/registry/subagent-registry-queued-registration-claims.test-support.ts`
- `src/agents/subagents/registry/subagent-registry-queued-registration.test-support.ts`
- `src/agents/subagents/registry/subagent-registry-queued-registration.test.ts`
- `src/agents/subagents/registry/subagent-registry-read.ts`
- `src/agents/subagents/registry/subagent-registry-read.types.ts`
- `src/agents/subagents/registry/subagent-registry-restart-custody.ts`
- `src/agents/subagents/registry/subagent-registry-rollback-custody.ts`
- `src/agents/subagents/registry/subagent-registry-run-launch-queued.ts`
- `src/agents/subagents/registry/subagent-registry-run-launch-record.ts`
- `src/agents/subagents/registry/subagent-registry-run-launch.ts`
- `src/agents/subagents/registry/subagent-registry-run-manager-bridge.ts`
- `src/agents/subagents/registry/subagent-registry-run-manager.ts`
- `src/agents/subagents/registry/subagent-registry-running-registration.native.test.ts`
- `src/agents/subagents/registry/subagent-registry-spawn-acceptance-api.ts`
- `src/agents/subagents/registry/subagent-registry-spawn-acceptance-writes.ts`
- `src/agents/subagents/registry/subagent-registry-spawn-acceptance.ts`
- `src/agents/subagents/registry/subagent-registry-sweep-accepted.ts`
- `src/agents/subagents/registry/subagent-registry-sweep-collector-groups.ts`
- `src/agents/subagents/registry/subagent-registry-sweep-gateway.ts`
- `src/agents/subagents/registry/subagent-registry-sweep-guards.ts`
- `src/agents/subagents/registry/subagent-registry-sweeper-lifecycle.test.ts`
- `src/agents/subagents/registry/subagent-registry-sweeper-recovery.orphan-collector.test.ts`
- `src/agents/subagents/registry/subagent-registry-sweeper.test-support.ts`
- `src/agents/subagents/registry/subagent-registry-sweeper.ts`
- `src/agents/subagents/registry/subagent-registry-sweeper.types.ts`
- `src/agents/subagents/registry/subagent-registry-work-index.ts`
- `src/agents/subagents/registry/subagent-registry.archive.e2e.test.ts`
- `src/agents/subagents/registry/subagent-registry.completion-authority.test.ts`
- `src/agents/subagents/registry/subagent-registry.launch-dispatch-custody.test.ts`
- `src/agents/subagents/registry/subagent-registry.mocks.shared.ts`
- `src/agents/subagents/registry/subagent-registry.persistence-fixture.test-support.ts`
- `src/agents/subagents/registry/subagent-registry.persistence.continuation-return.test.ts`
- `src/agents/subagents/registry/subagent-registry.persistence.test-support.ts`
- `src/agents/subagents/registry/subagent-registry.persistence.test.ts`
- `src/agents/subagents/registry/subagent-registry.post-compaction-acceptance-custody.test.ts`
- `src/agents/subagents/registry/subagent-registry.requester-wake-gateway.test-support.ts`
- `src/agents/subagents/registry/subagent-registry.requester-wake.e2e.test.ts`
- `src/agents/subagents/registry/subagent-registry.restart-terminal-custody.test.ts`
- `src/agents/subagents/registry/subagent-registry.restore-retry.test-support.ts`
- `src/agents/subagents/registry/subagent-registry.rollback-custody-restart.test.ts`
- `src/agents/subagents/registry/subagent-registry.spawn-acceptance-custody.test.ts`
- `src/agents/subagents/registry/subagent-registry.test.ts`
- `src/agents/subagents/registry/subagent-registry.ts`
- `src/agents/subagents/registry/subagent-registry.types.ts`
- `src/agents/subagents/registry/subagent-registry.typing.test.ts`
- `src/agents/subagents/registry/subagent-registry.write-faults.test-support.ts`
- `src/agents/subagents/registry/subagent-reset.continuation-queued.test.ts`
- `src/agents/subagents/registry/subagent-reset.continuation-retention.restart.test.ts`
- `src/agents/subagents/registry/subagent-reset.continuation-retention.test-support.ts`
- `src/agents/subagents/registry/subagent-reset.continuation-retention.test.ts`
- `src/agents/subagents/registry/subagent-run-liveness.ts`
- `src/agents/subagents/registry/subagent-session-cleanup.ts`
- `src/agents/subagents/spawn/acp-spawn.registration-ownership.test-support.ts`
- `src/agents/subagents/spawn/acp-spawn.test.ts`
- `src/agents/subagents/spawn/subagent-attachments.ts`
- `src/agents/subagents/spawn/subagent-spawn-acceptance.ts`
- `src/agents/subagents/spawn/subagent-spawn-child-launch.ts`
- `src/agents/subagents/spawn/subagent-spawn-cleanup.test.ts`
- `src/agents/subagents/spawn/subagent-spawn-cleanup.ts`
- `src/agents/subagents/spawn/subagent-spawn-collector-activation.ts`
- `src/agents/subagents/spawn/subagent-spawn-collector.stop-rollback.test.ts`
- `src/agents/subagents/spawn/subagent-spawn-collector.ts`
- `src/agents/subagents/spawn/subagent-spawn-context.ts`
- `src/agents/subagents/spawn/subagent-spawn-continuation.ts`
- `src/agents/subagents/spawn/subagent-spawn-contract.ts`
- `src/agents/subagents/spawn/subagent-spawn-envelope.ts`
- `src/agents/subagents/spawn/subagent-spawn-gateway-identity.ts`
- `src/agents/subagents/spawn/subagent-spawn-lifecycle.ts`
- `src/agents/subagents/spawn/subagent-spawn-profile.ts`
- `src/agents/subagents/spawn/subagent-spawn-registration.ts`
- `src/agents/subagents/spawn/subagent-spawn-request.ts`
- `src/agents/subagents/spawn/subagent-spawn-rollback.test.ts`
- `src/agents/subagents/spawn/subagent-spawn-rollback.ts`
- `src/agents/subagents/spawn/subagent-spawn-session-patch.ts`
- `src/agents/subagents/spawn/subagent-spawn.attachments.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.context-resources.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.continuation-delegate.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.continuation-operator-grant.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.in-process-gateway.test-support.ts`
- `src/agents/subagents/spawn/subagent-spawn.in-process-gateway.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.launch-key.gateway.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.launch-key.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.test-helpers.ts`
- `src/agents/subagents/spawn/subagent-spawn.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.thread-binding.test.ts`
- `src/agents/subagents/spawn/subagent-spawn.ts`
- `src/agents/subagents/spawn/subagent-spawn.workspace.test.ts`
- `src/agents/subagents/spawn/subagent-system-prompt.continuation.test.ts`
- `src/agents/subagents/spawn/subagent-system-prompt.test.ts`
- `src/agents/subagents/spawn/subagent-system-prompt.ts`
- `src/agents/subagents/subagent-attachment-cleanup.ts`
- `src/agents/system-prompt-continuation.ts` (post-composite continuation commit)
- `src/agents/system-prompt-owner-identity.ts`
- `src/agents/system-prompt-tool-list.ts` (post-composite continuation commit)
- `src/agents/system-prompt.continuation.test.ts` (post-composite continuation commit)
- `src/agents/system-prompt.ts`
- `src/agents/tool-call-shared.ts`
- `src/agents/tool-catalog.ts`
- `src/agents/tool-display-config.ts`
- `src/agents/tool-result-error.test.ts`
- `src/agents/tools-effective-inventory.runtime-and-policy.test.ts`
- `src/agents/tools-effective-inventory.ts`
- `src/agents/tools/continuation-inventory-opts.test.ts`
- `src/agents/tools/continuation-inventory-opts.ts`
- `src/agents/tools/continuation-tools-registration.test.ts` (post-composite continuation commit)
- `src/agents/tools/continuation-tools.current-span-traceparent.test.ts`
- `src/agents/tools/continue-delegate-attachment-validation.test.ts`
- `src/agents/tools/continue-delegate-tool.crosssession-gate.test.ts` (post-composite continuation commit)
- `src/agents/tools/continue-delegate-tool.test.ts` (post-composite continuation commit)
- `src/agents/tools/continue-delegate-tool.ts` (post-composite continuation commit)
- `src/agents/tools/continue-delegate-tool.turn-admission.test.ts`
- `src/agents/tools/continue-work-tool.boundary.test.ts`
- `src/agents/tools/continue-work-tool.test.ts` (post-composite continuation commit)
- `src/agents/tools/continue-work-tool.ts` (post-composite continuation commit)
- `src/agents/tools/media-generate-background-completion.ts`
- `src/agents/tools/media-generate-background-shared.trace-context.test.ts`
- `src/agents/tools/media-generate-background-shared.ts`
- `src/agents/tools/request-compaction-tool.callsite-threading.test.ts`
- `src/agents/tools/request-compaction-tool.classifier-emission.test.ts`
- `src/agents/tools/request-compaction-tool.test.ts`
- `src/agents/tools/request-compaction-tool.ts`
- `src/agents/tools/request-compaction-tool.volitional-threading.test.ts`
- `src/agents/tools/sessions-spawn-cloud.test.ts`
- `src/agents/tools/sessions-spawn-tool.launch-key.test.ts`
- `src/agents/transcript-sanitize.continuation.test.ts`
- `src/agents/transcript-sanitize.ts`
- `src/agents/workspace-worker.ts`
- `src/agents/worktrees/allocation.test.ts`
- `src/auto-reply/commands-registry.shared.ts`
- `src/auto-reply/continuation/config.test.ts`
- `src/auto-reply/continuation/config.ts`
- `src/auto-reply/continuation/context-pressure.test.ts`
- `src/auto-reply/continuation/context-pressure.ts`
- `src/auto-reply/continuation/continuation-dispatch-claims.ts`
- `src/auto-reply/continuation/continuation-notice-surface.ts`
- `src/auto-reply/continuation/continuation-return-delivery-dedupe-ack.test.ts`
- `src/auto-reply/continuation/continuation-return.pending-sweep.test.ts`
- `src/auto-reply/continuation/continuation-return.queue-capacity.test.ts`
- `src/auto-reply/continuation/continuation-return.refused.test.ts`
- `src/auto-reply/continuation/continuation-wake.test.ts`
- `src/auto-reply/continuation/continuation-wake.transcript-conflict.test.ts`
- `src/auto-reply/continuation/continuation-wake.ts`
- `src/auto-reply/continuation/cross-session-targeting.nonexistent-target.test.ts`
- `src/auto-reply/continuation/cross-session-targeting.test.ts`
- `src/auto-reply/continuation/custody-boot.ts`
- `src/auto-reply/continuation/custody-conjecture.scenario.test.ts` (post-composite continuation commit)
- `src/auto-reply/continuation/custody-orphan-reaper.test.ts`
- `src/auto-reply/continuation/custody-orphan-reaper.ts`
- `src/auto-reply/continuation/custody/custody-lifetime.ts`
- `src/auto-reply/continuation/custody/custody-payload-store.ts`
- `src/auto-reply/continuation/custody/custody-projection.ts`
- `src/auto-reply/continuation/custody/custody-readiness.test.ts`
- `src/auto-reply/continuation/custody/custody-record-codec.ts`
- `src/auto-reply/continuation/custody/custody-store.kernel.ts`
- `src/auto-reply/continuation/custody/custody-store.test.ts`
- `src/auto-reply/continuation/custody/custody-store.ts`
- `src/auto-reply/continuation/custody/custody-store.types.ts`
- `src/auto-reply/continuation/custody/custody-store.worker-contract.ts`
- `src/auto-reply/continuation/custody/custody-store.worker-handoffs.ts`
- `src/auto-reply/continuation/custody/custody-store.worker.test.ts`
- `src/auto-reply/continuation/custody/custody-store.worker.ts`
- `src/auto-reply/continuation/custody/custody.test-support.ts`
- `src/auto-reply/continuation/custody/spawn-interrupted-notice.ts`
- `src/auto-reply/continuation/delegate-claim-boundaries.test.ts`
- `src/auto-reply/continuation/delegate-dispatch-accepted-children.ts`
- `src/auto-reply/continuation/delegate-dispatch-chain-state.ts`
- `src/auto-reply/continuation/delegate-dispatch-contract.ts`
- `src/auto-reply/continuation/delegate-dispatch-grant.ts`
- `src/auto-reply/continuation/delegate-dispatch-hedge.ts`
- `src/auto-reply/continuation/delegate-dispatch-hedge.work-scope.test.ts`
- `src/auto-reply/continuation/delegate-dispatch-post-compaction.test.ts`
- `src/auto-reply/continuation/delegate-dispatch-recovery.ts`
- `src/auto-reply/continuation/delegate-dispatch-request.ts`
- `src/auto-reply/continuation/delegate-dispatch.admission-reset-race.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.chain-depth-exhaustion.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.contract.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.cost-cap-exhaustion.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.fanout-error-isolation.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.hedge-cleanup.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.post-compaction-recovery.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.recovery-1.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.recovery-2.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.spawn-failure-and-missing-target.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.test-support.ts`
- `src/auto-reply/continuation/delegate-dispatch.test.ts`
- `src/auto-reply/continuation/delegate-dispatch.ts`
- `src/auto-reply/continuation/delegate-flow-diagnostics.ts`
- `src/auto-reply/continuation/delegate-flow-state.ts`
- `src/auto-reply/continuation/delegate-flow-store.ts`
- `src/auto-reply/continuation/delegate-recipient-authority.incognito.test.ts`
- `src/auto-reply/continuation/delegate-spawn-acceptance.ts`
- `src/auto-reply/continuation/delegate-spawn-authority.test.ts`
- `src/auto-reply/continuation/delegate-spawn-authority.ts`
- `src/auto-reply/continuation/delegate-spawn-interrupted.ts`
- `src/auto-reply/continuation/delegate-store-post-compaction.test.ts`
- `src/auto-reply/continuation/delegate-store-post-compaction.ts`
- `src/auto-reply/continuation/delegate-store.ownership.test.ts`
- `src/auto-reply/continuation/delegate-store.queue.test.ts`
- `src/auto-reply/continuation/delegate-store.test.ts`
- `src/auto-reply/continuation/delegate-store.ts`
- `src/auto-reply/continuation/delegate-system-event.ts`
- `src/auto-reply/continuation/delegate-turn-admission.ts`
- `src/auto-reply/continuation/detached-generation.ts`
- `src/auto-reply/continuation/lazy.runtime.ts`
- `src/auto-reply/continuation/leaf-key-orphan-empirical.test.ts`
- `src/auto-reply/continuation/nonexistent-target-session-delivery.race.test.ts`
- `src/auto-reply/continuation/plugin-generation-reload.test-support.ts`
- `src/auto-reply/continuation/post-compaction-chain-charge.test.ts`
- `src/auto-reply/continuation/post-compaction-chain-charge.ts`
- `src/auto-reply/continuation/post-compaction-durable-handoff.test.ts`
- `src/auto-reply/continuation/post-compaction-rejection.test.ts`
- `src/auto-reply/continuation/post-compaction-rejection.ts`
- `src/auto-reply/continuation/post-compaction-staleness.ts`
- `src/auto-reply/continuation/project84-owned-topology.contract.test.ts`
- `src/auto-reply/continuation/queue-context.ts`
- `src/auto-reply/continuation/recipient-authority-binding.ts`
- `src/auto-reply/continuation/return-refusal.ts`
- `src/auto-reply/continuation/rfc-contract.scenario.test.ts`
- `src/auto-reply/continuation/scheduler.test.ts`
- `src/auto-reply/continuation/scheduler.ts`
- `src/auto-reply/continuation/session-reset-retention-resolve.ts`
- `src/auto-reply/continuation/session-reset-retention.boot-child.test-support.ts`
- `src/auto-reply/continuation/session-reset-retention.ts`
- `src/auto-reply/continuation/session-reset.ts`
- `src/auto-reply/continuation/signal-parser.test.ts`
- `src/auto-reply/continuation/signal.test.ts`
- `src/auto-reply/continuation/signal.ts`
- `src/auto-reply/continuation/state.test.ts`
- `src/auto-reply/continuation/state.ts`
- `src/auto-reply/continuation/system-event-ownership.ts`
- `src/auto-reply/continuation/targeting-pure.ts`
- `src/auto-reply/continuation/targeting.ts`
- `src/auto-reply/continuation/trace-context-propagation.integration.test.ts`
- `src/auto-reply/continuation/types.mode-shape.test.ts`
- `src/auto-reply/continuation/types.ts`
- `src/auto-reply/continuation/volatile-map-allowlist.test.ts`
- `src/auto-reply/continuation/work-dispatch-backoff.ts`
- `src/auto-reply/continuation/work-dispatch-execution.ts`
- `src/auto-reply/continuation/work-dispatch-flow-mock.test-support.ts`
- `src/auto-reply/continuation/work-dispatch-supersede.ts`
- `src/auto-reply/continuation/work-dispatch.classification-and-cap.test.ts`
- `src/auto-reply/continuation/work-dispatch.durable-2.test.ts`
- `src/auto-reply/continuation/work-dispatch.durable-3.test.ts`
- `src/auto-reply/continuation/work-dispatch.durable-4.test.ts`
- `src/auto-reply/continuation/work-dispatch.durable-5.test.ts`
- `src/auto-reply/continuation/work-dispatch.durable-6.test.ts`
- `src/auto-reply/continuation/work-dispatch.durable-8.test.ts`
- `src/auto-reply/continuation/work-dispatch.finalization-1.test.ts`
- `src/auto-reply/continuation/work-dispatch.finalization-2.test.ts`
- `src/auto-reply/continuation/work-dispatch.followup-admission.test.ts`
- `src/auto-reply/continuation/work-dispatch.parent-lineage-and-restart.test.ts`
- `src/auto-reply/continuation/work-dispatch.retry-exhaustion.test.ts`
- `src/auto-reply/continuation/work-dispatch.test.ts`
- `src/auto-reply/continuation/work-dispatch.ts`
- `src/auto-reply/continuation/work-dispatch.turn-start-fence.test.ts`
- `src/auto-reply/continuation/work-fence-drain.ts`
- `src/auto-reply/continuation/work-flow-state.ts`
- `src/auto-reply/continuation/work-operator-continuation.ts`
- `src/auto-reply/continuation/work-recipient-authority.incognito.test.ts`
- `src/auto-reply/continuation/work-recipient-authority.reset.test.ts`
- `src/auto-reply/continuation/work-recipient-authority.ts`
- `src/auto-reply/continuation/work-recovery-gateway-scope.test.ts`
- `src/auto-reply/continuation/work-replacement-store.test.ts`
- `src/auto-reply/continuation/work-replacement-store.ts`
- `src/auto-reply/continuation/work-scheduling-batch.ts`
- `src/auto-reply/continuation/work-scheduling-replacement.ts`
- `src/auto-reply/continuation/work-store.test-support.ts`
- `src/auto-reply/continuation/work-store.ts`
- `src/auto-reply/continuation/work-terminal-notice.durability.test.ts`
- `src/auto-reply/continuation/work-terminal-notice.mock-surface.test.ts`
- `src/auto-reply/continuation/work-terminal-notice.ts`
- `src/auto-reply/continuation/work-wake-text.ts`
- `src/auto-reply/reply/agent-lifecycle-terminal.ts`
- `src/auto-reply/reply/agent-runner-cli-candidate.ts`
- `src/auto-reply/reply/agent-runner-continuation-diag.ts`
- `src/auto-reply/reply/agent-runner-continuation-schedule.ts`
- `src/auto-reply/reply/agent-runner-continuation-signal.ts`
- `src/auto-reply/reply/agent-runner-continuation.ts`
- `src/auto-reply/reply/agent-runner-core.ts`
- `src/auto-reply/reply/agent-runner-embedded-candidate.continuation.test.ts`
- `src/auto-reply/reply/agent-runner-embedded-candidate.ts`
- `src/auto-reply/reply/agent-runner-entry.test-support.ts`
- `src/auto-reply/reply/agent-runner-error-handler.ts`
- `src/auto-reply/reply/agent-runner-execute.context-read.test.ts`
- `src/auto-reply/reply/agent-runner-execute.ts`
- `src/auto-reply/reply/agent-runner-execution-contract.test.ts`
- `src/auto-reply/reply/agent-runner-execution-lifecycle.test.ts`
- `src/auto-reply/reply/agent-runner-execution-outcome.ts`
- `src/auto-reply/reply/agent-runner-execution-results.test.ts`
- `src/auto-reply/reply/agent-runner-execution.context-usage.test.ts`
- `src/auto-reply/reply/agent-runner-execution.release-queued-compaction.test.ts`
- `src/auto-reply/reply/agent-runner-execution.test-support.ts`
- `src/auto-reply/reply/agent-runner-execution.ts`
- `src/auto-reply/reply/agent-runner-execution.types.ts`
- `src/auto-reply/reply/agent-runner-fallback-candidate.continuation.test.ts`
- `src/auto-reply/reply/agent-runner-fallback-candidate.ts`
- `src/auto-reply/reply/agent-runner-fallback-cycle.types.ts`
- `src/auto-reply/reply/agent-runner-fallback-settlement.ts`
- `src/auto-reply/reply/agent-runner-memory-runtime.ts`
- `src/auto-reply/reply/agent-runner-memory.ts`
- `src/auto-reply/reply/agent-runner-post-compaction-release.ts`
- `src/auto-reply/reply/agent-runner-result-accounting.persistence.test-support.ts`
- `src/auto-reply/reply/agent-runner-result-accounting.test.ts`
- `src/auto-reply/reply/agent-runner-result-accounting.ts`
- `src/auto-reply/reply/agent-runner-result-continuation.ts`
- `src/auto-reply/reply/agent-runner-result-payloads.ts`
- `src/auto-reply/reply/agent-runner-result.post-compaction-release.test.ts`
- `src/auto-reply/reply/agent-runner-result.ts`
- `src/auto-reply/reply/agent-runner-result.types.ts`
- `src/auto-reply/reply/agent-runner-run.ts`
- `src/auto-reply/reply/agent-runner-subagent-conflict.test.ts`
- `src/auto-reply/reply/agent-runner-usage-diagnostic.ts`
- `src/auto-reply/reply/agent-runner.continuation-chain-break-reset.test.ts`
- `src/auto-reply/reply/agent-runner.continuation-delegate-fire-span.test.ts`
- `src/auto-reply/reply/agent-runner.continuation-delegate-reject-obs.test.ts`
- `src/auto-reply/reply/agent-runner.continuation-postcompaction-autocompaction.test.ts`
- `src/auto-reply/reply/agent-runner.continuation-postcompaction-staging.test.ts`
- `src/auto-reply/reply/agent-runner.continuation-span-uniformity.test.ts`
- `src/auto-reply/reply/agent-runner.continuation-work-span.reservation.test.ts`
- `src/auto-reply/reply/agent-runner.continuation-work-span.test.ts`
- `src/auto-reply/reply/agent-runner.finally-drain-hardening.test.ts`
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.continuation.test.ts`
- `src/auto-reply/reply/agent-runner.misc.runreplyagent.test.ts`
- `src/auto-reply/reply/commands-continuations.test.ts`
- `src/auto-reply/reply/commands-continuations.ts`
- `src/auto-reply/reply/commands-handlers.runtime.ts`
- `src/auto-reply/reply/commands-status.continuation.test.ts`
- `src/auto-reply/reply/commands-system-prompt.test.ts`
- `src/auto-reply/reply/commands-system-prompt.ts`
- `src/auto-reply/reply/context-pressure.integration.test.ts`
- `src/auto-reply/reply/context-pressure.test.ts`
- `src/auto-reply/reply/cot-frame.test.ts`
- `src/auto-reply/reply/cot-frame.ts`
- `src/auto-reply/reply/followup-runner.busy-room-completion.test.ts`
- `src/auto-reply/reply/followup-runner.heartbeat-drain.test.ts`
- `src/auto-reply/reply/followup-runner.test.ts`
- `src/auto-reply/reply/followup-runner.ts`
- `src/auto-reply/reply/followup-turn-execution.test-support.ts`
- `src/auto-reply/reply/get-reply-run-admission.system-event-promotion.proof.test.ts`
- `src/auto-reply/reply/get-reply-run-context.silent-event.test.ts`
- `src/auto-reply/reply/get-reply-run-execute.managed-delivery.proof.test.ts`
- `src/auto-reply/reply/get-reply-run.media-only.continuation.test-support.ts`
- `src/auto-reply/reply/get-reply-run.media-only.system-events.test-support.ts`
- `src/auto-reply/reply/get-reply.types.ts`
- `src/auto-reply/reply/managed-delivery-turn-lifecycle.ts`
- `src/auto-reply/reply/memory-flush-plan.ts`
- `src/auto-reply/reply/no-op-rearm-guard.test.ts`
- `src/auto-reply/reply/no-op-rearm-guard.ts`
- `src/auto-reply/reply/normalize-reply.cot-frame.test.ts`
- `src/auto-reply/reply/normalize-reply.ts`
- `src/auto-reply/reply/post-compaction-context-failure.test.ts`
- `src/auto-reply/reply/post-compaction-delegate-acceptance.ts`
- `src/auto-reply/reply/post-compaction-delegate-delivery.ts`
- `src/auto-reply/reply/post-compaction-delegate-delivery.types.ts`
- `src/auto-reply/reply/post-compaction-delegate-dispatch.delivery-guards.test.ts`
- `src/auto-reply/reply/post-compaction-delegate-dispatch.lifecycle.test.ts`
- `src/auto-reply/reply/post-compaction-delegate-dispatch.ownership.test.ts`
- `src/auto-reply/reply/post-compaction-delegate-dispatch.queueing-policy.test.ts`
- `src/auto-reply/reply/post-compaction-delegate-dispatch.recovery.test.ts`
- `src/auto-reply/reply/post-compaction-delegate-dispatch.test.ts`
- `src/auto-reply/reply/post-compaction-delegate-dispatch.ts`
- `src/auto-reply/reply/post-compaction-delegate-normalize.ts`
- `src/auto-reply/reply/post-compaction-source-lifecycle.ts`
- `src/auto-reply/reply/reply-agent-turn-preparation.ts`
- `src/auto-reply/reply/reply-state.test.ts`
- `src/auto-reply/reply/reply-utils.continuation.test.ts`
- `src/auto-reply/reply/run-compaction-count.test.ts`
- `src/auto-reply/reply/run-compaction-count.ts`
- `src/auto-reply/reply/run-provenance.test.ts`
- `src/auto-reply/reply/run-provenance.ts`
- `src/auto-reply/reply/session-event-automation.ts`
- `src/auto-reply/reply/session-event-context.ts`
- `src/auto-reply/reply/session-event-contract.ts`
- `src/auto-reply/reply/session-init-reset-cleanup.test.ts`
- `src/auto-reply/reply/session-init-reset-cleanup.ts`
- `src/auto-reply/reply/session-init-reset-retention.ts`
- `src/auto-reply/reply/session-init.types.ts`
- `src/auto-reply/reply/session-reset-cleanup.stale-scope.proof.test.ts`
- `src/auto-reply/reply/session-reset-cleanup.test.ts`
- `src/auto-reply/reply/session-reset-cleanup.ts`
- `src/auto-reply/reply/session-rollover-mutation.ts`
- `src/auto-reply/reply/session-system-event-adoption.ts`
- `src/auto-reply/reply/session-system-events.ack-formatted.test.ts`
- `src/auto-reply/reply/session-system-events.event-ownership.proof.test.ts`
- `src/auto-reply/reply/session-system-events.managed-delivery.proof.test.ts`
- `src/auto-reply/reply/session-system-events.recipient-authority.test.ts`
- `src/auto-reply/reply/session-system-events.test.ts`
- `src/auto-reply/reply/session-system-events.ts`
- `src/auto-reply/reply/session-updates.compaction.test.ts`
- `src/auto-reply/reply/session-updates.ts`
- `src/auto-reply/reply/session.continuation-reset.test.ts`
- `src/auto-reply/reply/session.reset-custody.proof.test.ts`
- `src/auto-reply/reply/session.reset-scope.proof.test.ts`
- `src/auto-reply/reply/session.test.ts`
- `src/auto-reply/reply/source-reply-delivery-mode.ts`
- `src/auto-reply/reply/streaming-directives.ts`
- `src/auto-reply/reply/waiting-status.delivery.test.ts`
- `src/auto-reply/status.continuation.test.ts`
- `src/auto-reply/status.test.ts`
- `src/auto-reply/templating.ts`
- `src/auto-reply/types.ts`
- `src/bootstrap/node-compiler-args.test.ts`
- `src/bootstrap/node-compiler-args.ts`
- `src/build-capabilities.ts`
- `src/cli/argv.ts`
- `src/cli/command-catalog.ts`
- `src/cli/command-path-policy.test.ts`
- `src/cli/daemon-cli/install.integration.definition-access.test.ts`
- `src/cli/program/command-registry-core.ts`
- `src/cli/program/core-command-descriptors.ts`
- `src/cli/program/help.ts`
- `src/cli/program/register.continuations.test.ts`
- `src/cli/program/register.continuations.ts`
- `src/cli/update-cli-assertions.test-support.ts`
- `src/cli/update-cli-fixture.test-support.ts`
- `src/cli/update-cli-lifecycle.test-support.ts`
- `src/cli/update-cli.already-current.test.ts`
- `src/cli/update-cli.candidate-activation.test.ts`
- `src/cli/update-cli.deferred-completion.test-support.ts`
- `src/cli/update-cli.finalizer.test.ts`
- `src/cli/update-cli.fresh-doctor.test.ts`
- `src/cli/update-cli.git-service.test.ts`
- `src/cli/update-cli.node-runtime.test.ts`
- `src/cli/update-cli.package-lifecycle.test.ts`
- `src/cli/update-cli.post-core-handoff.test.ts`
- `src/cli/update-cli.preactivation-inspection.test.ts`
- `src/cli/update-cli.service-authority.test.ts`
- `src/cli/update-cli.target-schema.test.ts`
- `src/cli/update-cli.test.ts`
- `src/cli/update-cli.windows-lifecycle.test.ts`
- `src/cli/update-cli/shared.ts`
- `src/cli/update-cli/update-cli-package.test-support.ts`
- `src/cli/update-cli/update-command-candidate-admission-fixture.test-support.ts`
- `src/cli/update-cli/update-command-candidate-admission.test-support.ts`
- `src/cli/update-cli/update-command-cli-options.ts`
- `src/cli/update-cli/update-command-definition-recovery.test-support.ts`
- `src/cli/update-cli/update-command-doctor-writer-order.test.ts`
- `src/cli/update-cli/update-command-fresh-doctor.ts`
- `src/cli/update-cli/update-command-package.ts`
- `src/cli/update-cli/update-command-plugin-caller.test.ts`
- `src/cli/update-cli/update-command-post-activation-inspections.ts`
- `src/cli/update-cli/update-command-post-core.ts`
- `src/cli/update-cli/update-command-post-plugin-config-check.ts`
- `src/cli/update-cli/update-command-post-plugin-readiness.ts`
- `src/cli/update-cli/update-command-restart-outcome.test-support.ts`
- `src/cli/update-cli/update-command-service-command.ts`
- `src/cli/update-cli/update-command-service-rollback.test-support.ts`
- `src/cli/update-cli/update-command-service-transition.test-support.ts`
- `src/cli/update-cli/update-command-service.integration.test.ts`
- `src/cli/update-cli/update-command-transport.test-support.ts`
- `src/cli/version-output.ts`
- `src/commands/doctor-completion.test.ts`
- `src/commands/doctor-gateway-services.authority.test.ts`
- `src/commands/doctor-migration-backup.fleet-history.test.ts`
- `src/commands/doctor-migration-backup.ts`
- `src/commands/doctor-relative-session-store.test.ts`
- `src/commands/doctor-schema-migrations.recipient-authority.test.ts`
- `src/commands/doctor-session-canonical-keys.recipient-authority.test.ts`
- `src/commands/doctor-session-canonical-keys.ts`
- `src/commands/doctor-session-recipient-authority-repair.ts`
- `src/commands/doctor-update-schema-guard.ts`
- `src/commands/onboard-agent.persistence.test.ts`
- `src/commands/status-overview-rows.ts`
- `src/commands/status.command-report.ts`
- `src/commands/status.continuation-banner.test.ts`
- `src/commands/status.continuation-banner.ts`
- `src/commands/triage-doctor.ts`
- `src/commands/triage-run.test.ts`
- `src/config/cache-utils.ts`
- `src/config/runtime-source-projection.ts`
- `src/config/sessions/legacy-main-session-migration-claims.ts`
- `src/config/sessions/legacy-main-session-migration-operations.ts`
- `src/config/sessions/legacy-main-session-migration.handoff.test.ts`
- `src/config/sessions/legacy-main-session-migration.race.test.ts`
- `src/config/sessions/legacy-main-session-migration.test-support.ts`
- `src/config/sessions/session-accessor.lifecycle-types.ts`
- `src/config/sessions/session-accessor.lifecycle.ts`
- `src/config/sessions/session-accessor.memory-lifecycle.ts`
- `src/config/sessions/session-accessor.reset-pinned-env.test.ts`
- `src/config/sessions/session-accessor.sqlite-canonical-read.ts`
- `src/config/sessions/session-accessor.sqlite-canonical-repair.ts`
- `src/config/sessions/session-accessor.sqlite-entry-availability.ts`
- `src/config/sessions/session-accessor.sqlite-entry-mutation.ts`
- `src/config/sessions/session-accessor.sqlite-entry-store.ts`
- `src/config/sessions/session-accessor.sqlite-import.ts`
- `src/config/sessions/session-accessor.sqlite-lifecycle-maintenance.ts`
- `src/config/sessions/session-accessor.sqlite-lifecycle.ts`
- `src/config/sessions/session-accessor.sqlite-maintenance-age.ts`
- `src/config/sessions/session-accessor.sqlite-maintenance-kick.ts`
- `src/config/sessions/session-accessor.sqlite-owner.ts`
- `src/config/sessions/session-accessor.sqlite-projection-state.ts`
- `src/config/sessions/session-accessor.sqlite-recipient-authority.ts`
- `src/config/sessions/session-accessor.sqlite-transcript-store.test.ts`
- `src/config/sessions/session-accessor.ts`
- `src/config/sessions/session-actor-memory-collaboration-contract.ts`
- `src/config/sessions/session-actor-memory.test.ts`
- `src/config/sessions/session-entry-presence-read.ts`
- `src/config/sessions/session-entry-projection.ts`
- `src/config/sessions/session-entry-storage.types.ts`
- `src/config/sessions/session-history-budget-owner.test.ts`
- `src/config/sessions/session-recipient-authority-current.ts`
- `src/config/sessions/session-recipient-authority-types.ts`
- `src/config/sessions/session-recipient-authority.decision.test.ts`
- `src/config/sessions/session-recipient-authority.incognito-actor.test.ts`
- `src/config/sessions/session-recipient-authority.test.ts`
- `src/config/sessions/session-recipient-authority.worker.ts`
- `src/config/sessions/session-row-facts.types.ts`
- `src/config/sessions/session-run-lifecycle-projection.ts`
- `src/config/sessions/session-sharing-store.async.ts`
- `src/config/sessions/session-sharing-store.native.ts`
- `src/config/sessions/session-sharing-store.types.ts`
- `src/config/sessions/session-sharing-store.worker.ts`
- `src/config/sessions/session-transcript-rewrite-effects.ts`
- `src/config/sessions/store-maintenance-preserve.ts`
- `src/config/sessions/store.continuation-merge.test.ts`
- `src/config/types.agent-defaults.ts`
- `src/config/zod-schema.agent-defaults-base.ts`
- `src/config/zod-schema.continuation.test.ts`
- `src/cron/isolated-agent/delivery-dispatch.double-announce.test.ts`
- `src/cron/isolated-agent/run.continuation-tool-policy.test.ts`
- `src/daemon/program-args.test.ts`
- `src/daemon/program-args.ts`
- `src/daemon/runtime-binary.test.ts`
- `src/daemon/runtime-binary.ts`
- `src/daemon/runtime-paths.test.ts`
- `src/entry.version-fast-path.test.ts`
- `src/entry.version-fast-path.ts`
- `src/flows/doctor-tool-schema-projection.ts`
- `src/gateway/agent-turn/agent-request-preflight.test.ts`
- `src/gateway/agent-turn/agent-request-preflight.ts`
- `src/gateway/agent-turn/agent-run-execution-phase.continuation.ts`
- `src/gateway/agent-turn/agent-run-execution-phase.ts`
- `src/gateway/agent-turn/agent-run-session-effects.ts`
- `src/gateway/agent-turn/agent-session-persist.ts`
- `src/gateway/config-reload.prepared-model-runtime.test.ts`
- `src/gateway/github-publication-attribution.test.ts`
- `src/gateway/health/delivery-queue-cache.test.ts`
- `src/gateway/mcp-http.loopback-exclusions.test-support.ts`
- `src/gateway/mcp-http.runtime.test.ts`
- `src/gateway/mcp-http.runtime.ts`
- `src/gateway/mcp-http.test.ts`
- `src/gateway/server-methods/agent-request-types.ts`
- `src/gateway/server-methods/agent.continuation-trace.test-utils.ts`
- `src/gateway/server-methods/agent.plugin-subagent-follow-up.test-utils.ts`
- `src/gateway/server-methods/agent.sessions-and-models.test-utils.ts`
- `src/gateway/server-methods/agent.test.ts`
- `src/gateway/server-methods/sessions-compact.ts`
- `src/gateway/server-methods/sessions-sharing.test.ts`
- `src/gateway/server-methods/sessions-sharing.ts`
- `src/gateway/server-methods/tools-catalog.continuation.test.ts`
- `src/gateway/server-methods/usage.sessions-usage-details.test.ts`
- `src/gateway/server-methods/usage.sessions-usage.test-support.ts`
- `src/gateway/server-plugin-in-process-dispatch.test-support.ts`
- `src/gateway/server-restart-sentinel.dead-subagent-row.test.ts`
- `src/gateway/server-restart-sentinel.mocks.test-harness.ts`
- `src/gateway/server-restart-sentinel.new-process.child.test-support.ts`
- `src/gateway/server-restart-sentinel.new-process.proof.test.ts`
- `src/gateway/server-runtime-services.test-harness.ts`
- `src/gateway/server-runtime-services.ts`
- `src/gateway/server.agent.continuation-trust.test.ts`
- `src/gateway/server.continuation-finished-child-wake.product.test.ts`
- `src/gateway/server.sessions.compaction.continuation.test.ts`
- `src/gateway/server.sessions.recipient-authority.test.ts`
- `src/gateway/server.sessions.reset-continuation.test.ts`
- `src/gateway/session-lifecycle-cleanup.ts`
- `src/gateway/session-lifecycle-incognito.test.ts`
- `src/gateway/session-lifecycle-state.test.ts`
- `src/gateway/session-recipient-authority.caller-thread.test.ts`
- `src/gateway/session-recipient-authority.deletion.test.ts`
- `src/gateway/session-reset-continuation-retention.ts`
- `src/gateway/session-reset-runtime-cleanup.ts`
- `src/gateway/session-reset-runtime-state.ts`
- `src/gateway/session-reset-service.ts`
- `src/gateway/session-utils.queued-collector-rollback-custody.test.ts`
- `src/gateway/session-utils.queued-collector.test-support.ts`
- `src/gateway/test/server-sessions.test-helpers.ts`
- `src/gateway/tool-resolution-continuation.ts`
- `src/gateway/tool-resolution.test.ts`
- `src/gateway/tool-resolution.ts`
- `src/gateway/worker-environments/worker-turn-execution.consuming-run.test-support.ts`
- `src/gateway/worker-environments/worker-turn-execution.test.ts`
- `src/gateway/worker-environments/worker-turn-launcher-remote-handoff.test.ts`
- `src/gateway/worker-environments/worker-turn-launcher.ts`
- `src/gateway/worker-environments/worker-turn-user-message.ts`
- `src/hooks/bundled/session-memory/handler.ts`
- `src/infra/bun-sqlite-library.worker.test.ts`
- `src/infra/continuation-tracer.emit-and-fire.test.ts`
- `src/infra/continuation-tracer.queue-and-compaction.test.ts`
- `src/infra/continuation-tracer.test.ts`
- `src/infra/continuation-tracer.ts`
- `src/infra/database-engine/agent-port-descriptor.ts`
- `src/infra/database-engine/agent-port.postgres.test.ts`
- `src/infra/database-engine/agent-recipient-authority-migration.postgres.test.ts`
- `src/infra/database-engine/delivery-queue-retention.conformance.test.ts`
- `src/infra/database-engine/doctor-migration.recipient-authority.postgres.test.ts`
- `src/infra/database-engine/state-port.postgres.test.ts`
- `src/infra/delivery-queue-sqlite-bound.ts`
- `src/infra/delivery-queue-sqlite-codec.ts`
- `src/infra/delivery-queue-sqlite.kernel.ts`
- `src/infra/delivery-queue-sqlite.types.ts`
- `src/infra/delivery-queue-terminal.test.ts`
- `src/infra/diagnostic-events.ts`
- `src/infra/diagnostic-liveness-types.ts`
- `src/infra/diagnostic-trace-context.test.ts`
- `src/infra/diagnostic-trace-context.ts`
- `src/infra/lifecycle-timer-retention.test-support.ts`
- `src/infra/node-sqlite.worker.test.ts`
- `src/infra/package-update-lifecycle.ts`
- `src/infra/runtime-process-script-file.test.ts`
- `src/infra/runtime-process-standalone-imports.test.ts`
- `src/infra/runtime-process-url.ts`
- `src/infra/runtime-worker-url.test.ts`
- `src/infra/runtime-worker-url.ts`
- `src/infra/secure-random-chain-id.test.ts`
- `src/infra/secure-random.ts`
- `src/infra/session-delivery-queue-attachment-metadata.ts`
- `src/infra/session-delivery-queue-recovery.ts`
- `src/infra/session-delivery-queue-runtime.test.ts`
- `src/infra/session-delivery-queue-runtime.ts`
- `src/infra/session-delivery-queue-storage.ts`
- `src/infra/session-delivery-queue.recovery.test.ts`
- `src/infra/session-delivery-queue.storage-lifecycle.test.ts`
- `src/infra/session-delivery-queue.storage-validation.test.ts`
- `src/infra/session-delivery-queue.storage.test-support.ts`
- `src/infra/session-delivery-queue.storage.test.ts`
- `src/infra/session-delivery-queue.worker.ts`
- `src/infra/sqlite-readonly-worker.ts`
- `src/infra/system-event-delivery-claims.ts`
- `src/infra/system-event-managed-delivery-queue.ts`
- `src/infra/system-event-managed-delivery.ts`
- `src/infra/system-events.capacity.test.ts`
- `src/infra/system-events.enqueue-mock.test-support.ts`
- `src/infra/system-events.queue-drain-span.test.ts`
- `src/infra/system-events.test.ts`
- `src/infra/system-events.ts`
- `src/infra/update-candidate-admission.test.ts`
- `src/infra/update-candidate-canary-process.test.ts`
- `src/infra/update-candidate-canary.test.ts`
- `src/infra/update-managed-service-handoff-boundary.test-support.ts`
- `src/infra/update-managed-service-handoff-command.test.ts`
- `src/infra/update-managed-service-handoff-lifecycle.test.ts`
- `src/infra/update-managed-service-handoff-node.test.ts`
- `src/infra/update-triage.ts`
- `src/infra/worker-cpu.ts`
- `src/logging/diagnostic-continuation-queue-log.ts`
- `src/logging/diagnostic-continuation-queues.ts`
- `src/logging/diagnostic-stability-liveness.ts`
- `src/logging/diagnostic-stability.ts`
- `src/logging/diagnostic-work-snapshot.ts`
- `src/logging/diagnostic.continuation-queue.test.ts`
- `src/logging/diagnostic.ts`
- `src/plugin-sdk/continuation-test-runtime.ts`
- `src/plugin-sdk/diagnostic-runtime.ts`
- `src/plugin-sdk/provider-catalog-live-runtime.config.test.ts`
- `src/plugin-sdk/system-event-runtime.ts`
- `src/plugins/capability-provider-runtime.ts`
- `src/plugins/runtime/system-events.ts`
- `src/plugins/session-entry-slot-keys.ts`
- `src/process/command-queue-waiters.ts`
- `src/process/command-queue.lane-idle.test.ts`
- `src/process/command-queue.lane-idle.ts`
- `src/process/command-queue.ts`
- `src/sessions/session-created.ts`
- `src/sessions/user-turn-transcript-input-run.ts`
- `src/sessions/user-turn-transcript.delivery-acks.ts`
- `src/sessions/user-turn-transcript.metadata.ts`
- `src/sessions/user-turn-transcript.persistence.test.ts`
- `src/sessions/user-turn-transcript.recorder.test.ts`
- `src/sessions/user-turn-transcript.ts`
- `src/sessions/user-turn-transcript.types.ts`
- `src/shared/assistant-answer-text.ts`
- `src/shared/continuation-run-key.test.ts`
- `src/shared/continuation-run-key.ts`
- `src/shared/inline-attachments.test.ts`
- `src/shared/inline-attachments.ts`
- `src/state/openclaw-agent-active-event-facts-migration.postgres.test.ts`
- `src/state/openclaw-agent-active-event-facts-migration.test.ts`
- `src/state/openclaw-agent-cold-navigation-migration.test.ts`
- `src/state/openclaw-agent-db-engine.ts`
- `src/state/openclaw-agent-db-lifecycle.ts`
- `src/state/openclaw-agent-db-schema-helpers.ts`
- `src/state/openclaw-agent-db-schema.ts`
- `src/state/openclaw-agent-db-session-migrations.test.ts`
- `src/state/openclaw-agent-db-session-migrations.ts`
- `src/state/openclaw-agent-db.recipient-authority-migration.test.ts`
- `src/state/openclaw-agent-db.schema-bridge.test-support.ts`
- `src/state/openclaw-agent-db.schema25-bridge.test.ts`
- `src/state/openclaw-agent-db.schema26-bridge.test.ts`
- `src/state/openclaw-agent-execution.ts`
- `src/state/openclaw-agent-fleet-schema-history.ts`
- `src/state/openclaw-agent-fleet38-bridge.ts`
- `src/state/openclaw-agent-memory-revision-migration.test.ts`
- `src/state/openclaw-agent-participants-migration.test.ts`
- `src/state/openclaw-agent-participants-migration.ts`
- `src/state/openclaw-agent-recipient-authority-fixture.test-support.ts`
- `src/state/openclaw-agent-recipient-authority-schema.ts`
- `src/state/openclaw-agent-schema-history.ts`
- `src/state/openclaw-agent-schema.sql`
- `src/state/openclaw-agent-storage-schema.ts`
- `src/state/openclaw-migration-witness.continuation.ts`
- `src/state/openclaw-migration-witness.ts`
- `src/state/openclaw-schema-versions.test.ts`
- `src/state/openclaw-schema-versions.ts`
- `src/state/openclaw-state-db-contract.ts`
- `src/state/openclaw-state-db.continuation-records-fleet.test.ts`
- `src/state/openclaw-state-db.template-cutover.continuation.test.ts`
- `src/state/openclaw-state-schema-compatibility.ts`
- `src/state/openclaw-state-schema.sql`
- `src/state/openclaw-state-worker-registry.ts`
- `src/state/postgres-schema.generated/agent-port.json`
- `src/state/postgres-schema.generated/agent-runtime.ts`
- `src/state/postgres-schema.generated/agent.postgres.sql`
- `src/state/postgres-schema.generated/fragment-continuation_records.postgres.sql`
- `src/state/postgres-schema.generated/manifest.json`
- `src/state/postgres-schema.generated/portability-report.md`
- `src/state/postgres-schema.generated/runtime.ts`
- `src/state/postgres-schema.generated/sqlite-agent-catalogs.json`
- `src/state/postgres-schema.generated/sqlite-agent-catalogs.ts`
- `src/state/postgres-schema.generated/sqlite-state-catalogs.json`
- `src/state/postgres-schema.generated/sqlite-state-catalogs.ts`
- `src/state/postgres-schema.generated/state-port.json`
- `src/state/schema-migration-backup-tables.ts`
- `src/state/sqlite-query-plan.test.ts`
- `src/status/status-continuation-line.ts`
- `src/status/status-message.ts`
- `src/status/status-session-lines.ts`
- `src/status/status-text.test.ts`
- `src/status/status-text.ts`
- `src/tui/tui-pty-local.e2e.test.ts`
- `src/tui/tui-pty-mock-model-test-support.ts`
- `test/fixtures/sqlite/README.md`
- `test/fixtures/sqlite/openclaw-agent-schema-v25-fleet-captured.sql`
- `test/fixtures/sqlite/openclaw-agent-schema-v26-fleet-migrated.sql`
- `test/fixtures/sqlite/openclaw-agent-schema-v26-fleet.sql`
- `test/fixtures/sqlite/openclaw-agent-schema-v38-fleet.sql`
- `test/fixtures/sqlite/openclaw-agent-schema-v39.sql`
- `test/fixtures/sqlite/openclaw-agent-schema-v40.sql`
- `test/fixtures/sqlite/openclaw-agent-schema-v41-jump13.sql`
- `test/fixtures/sqlite/openclaw-agent-schema-v41.sql`
- `test/helpers/source-import-closure.ts`
- `test/scripts/check-deadcode-exports.test.ts`
- `test/scripts/ci-node-test-plan.test.ts`
- `test/scripts/ci-workflow-complete.test.ts`
- `test/scripts/ci-workflow-planning.test.ts`
- `test/scripts/control-ui-performance.test.ts`
- `test/scripts/generate-kysely-types.test.ts`
- `test/scripts/lint-suppressions.test.ts`
- `test/scripts/prepare-git-hooks.test.ts`
- `test/scripts/write-build-info.test.ts`
- `test/setup.extension-active-memory.ts`
- `test/setup.extensions.ts`
- `test/tsconfig/tsconfig.core.test.agents-embedded-runner.json`
- `test/tsconfig/tsconfig.core.test.agents-embedded.json`
- `test/tsconfig/tsconfig.core.test.agents-other.json`
- `test/tsconfig/tsconfig.core.test.agents-root.json`
- `test/tsconfig/tsconfig.core.test.messaging-auto-reply.json`
- `test/tsconfig/tsconfig.core.test.messaging-channels.json`
- `test/tsconfig/tsconfig.core.test.messaging.json`
- `test/vitest-projects-config.test.ts`
- `test/vitest-scoped-config.test.ts`
- `test/vitest/vitest.gateway-server-paths.mjs`
- `test/vitest/vitest.test-shards.mjs`
- `test/vitest/vitest.unit-fast-paths.mjs`
- `tsdown.config.ts`

</details>

🌿 frond-scribe, via Claude Code
