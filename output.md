# output — three-discord-pr-gitnexus-sitrep

**Lane:** `three-discord-pr-gitnexus-sitrep`
**Branch:** `codeagent/three-discord-pr-gitnexus-sitrep`
**Base:** `df1c96591115259cd7f735c7f648fbe49f32b102` (upstream main − 1; dispatcher's `c5ba4efbd70` confirmed an ancestor)
**Deliverable:** `REPORTS/three-discord-pr-gitnexus-sitrep-2026-08-12.md`

## What changed

One file added. No product code touched. No GitHub item created, updated, labelled, commented on, closed, or merged. No deployment, gateway, database, config, or seat mutation.

| Commit        | Contents                              |
| ------------- | ------------------------------------- |
| `4c58970bf2e` | WIP scaffold                          |
| `e02d160de82` | Full report                           |
| `b05ef73398b` | GitNexus side-effect note             |
| _(final)_     | Full-suite result + attribution (§10) |

Every commit contains only `REPORTS/three-discord-pr-gitnexus-sitrep-2026-08-12.md`, verified with `git show --stat`.

## Findings that change the recommendation

1. **#121204's Discord half cannot fire on a single real Discord message.** `canExpireDiscordStaleAmbientBacklog` gates on `rawMessage.channel`. Direct inspection of `discord-api-types@0.38.52` shows `APIMessage extends APIBaseMessage, APIMessageMentions` (`payloads/v10/message.d.ts:268`) and `APIBaseMessage` has **no `channel` field** — the PR reaches it only via a cast escaping its own declared type. The fence returns `false` unconditionally in production. ClawSweeper's P1 (confidence 0.99) is correct, and I confirmed it from the dependency, not from the bot.

2. **The correct fact exists and was missed by one field name.** `GatewayMessageEventExtraFields` carries top-level `channel_type?: TextChannelType` (`gateway/v10.d.ts:1309-1334`), documented as _"The type of channel the message was sent in"_; `TextChannelType` spans all three thread types (`payloads/v10/channel.d.ts:58`) and is optional, so fail-open survives. That is the narrow authoritative repair.

3. **ClawSweeper's "9 items" = 1 actionable P1 + 1 proof gate, restated 9 ways.** Its own fields agree (`Findings | 1 actionable finding`). The dispatcher's hypothesis was right.

4. **#121204 does NOT subsume #122466.** #121204's rule is _"only the oldest retained row blocks its lane"_ — and a poison event **is** its lane's oldest row, so head-of-line blockage survives intact. Confirmed further: **neither #121204 nor karmaterminal#1237 adds a `retryPolicy`**, so Discord inherits the 24 h dead-letter floor in every branch. #122466 is fully non-redundant.

5. **`karmaterminal/openclaw#1237` is not "a narrow mechanical repair."** It is an open PR, 26 files, +2479/−918 (≈23 files / +2400/−900 measured against #121204's head). It **deletes** #121204's own core seam, adds three new core modules, adds a new public SDK drain option, adds a `settlement` discriminator to public `IngressNonRetryableFailure`, and flips suppressed rows `failed → completed` — which genuinely removes operator resubmit (verified: `ingress-queue.ts:1261-1264` requires `status === "failed"`). Its body states outright that **no green test claim is made for its post-split tree**, and its body has drifted from its own head. It _does_ fix the P1 correctly (reads `channel_type` at admission, persists as `channelKind`), and would clear both CI failures.

6. **Concern 3 contradicts #121204's written guarantee** ("Nothing addressed to the bot is dropped … including after long outages") and inverts its fail-open burden of proof. Third standalone PR. Also: the guard concern 3 describes **does not exist on upstream main** — main has no age logic at all, so concern 3 is #121204's deliberate residual, not a defect in it.

7. **The design concern 3 needs already ships in-repo, on iMessage** (found via GitNexus concept query, not grep): `IMESSAGE_STALE_INBOUND_THRESHOLD_MS = 15 min` (the identical number #121204 chose), `IMESSAGE_RECOVERY_MAX_AGE_MS = 2 h` (wider absolute ceiling for deliberately-replayed work), `IMESSAGE_RECOVERY_MAX_ROWS = 500` (replay **span** cap). `suppressStaleIngress` has **no addressed early return** — an absolute ceiling on addressed work is already accepted shipped policy on a sibling channel, and the row cap directly answers the fleet's 2038-row / ≈57 h drain observation, which an age ceiling alone would not bound.

8. **CI.** #122466: 50 pass / 41 skip / **0 fail**. #121204: **3 fail** / 75 pass / 39 skip — both real failures self-inflicted (knip unused exported types introduced by the PR; plugin-SDK API baseline mismatch), `ci-gate` a mirror. No inherited `main` breakage.

9. **Both PRs textually conflict**, proven by real 3-way merge (not assumed): both insert at the identical `drain: {` anchor. `git merge-file` → exit 1, 1 conflict in `ingress.ts:444` and 1 in `ingress.test.ts`. Trivial to resolve, but real.

10. **No upstream duplicate exists for concern 3.** Nearest is **#16555** (OPEN since 2026-02-14, `impact:message-loss`, `clawsweeper:needs-product-decision`) — the symmetric, still-undecided TTL question on the sibling _outbound_ delivery queue.

**Recommendation: three PRs.** (1) #122466 as-is — it is a byte-shape match of the shipped LINE precedent (`extensions/line/src/webhook-spool.ts:273-278`, identical block and the exact comment it quotes). (2) Extract #121204's generic drain ordering correction — independently correct, independently provable, fixes the LINE-class defect in #97435, and unblocked. (3) Discord stale-ambient suppression, P1 repaired at its owner. Concern 3 follows PR 3.

## Validation

**Full suite** (dispatch-mandated), on an unchanged tree:

```
node --import tsx scripts/test-projects.mts
  → [test] failed 323 Vitest shards in 2692.73s
  → [test] failed shard digest (26)
```

**Tally: 26 failed shards / 323, 2692.73 s. Not attributable — this branch contains zero product code.** Two causes separated by serial re-runs:

- **Contention during the 323-shard fan-out.** `vitest.extension-discord.config.ts` printed 16 passing files, then no output for 900 s and was killed by the stall guard — twice. Serial re-runs of the exact surfaces this report reasons about are green:

  | Re-run (`--maxWorkers=1`)                                              | Result           |
  | ---------------------------------------------------------------------- | ---------------- |
  | `extension-discord` → `extensions/discord/src/monitor/ingress.test.ts` | **5/5 passed**   |
  | `channels` → `ingress-drain.test.ts`, `ingress-drain-lanes.test.ts`    | **30/30 passed** |
  | `unit-fast` → `src/channels/message/ingress-retry-policy.test.ts`      | **12/12 passed** |

- **Genuine pre-existing, unrelated failures.** `vitest.unit-fast-fake-timers.config.ts` still fails serially (`1 failed | 9 passed`; `2 failed | 214 passed | 3 skipped`). Both failures are `src/entry.respawn.test.ts > buildCliRespawnPlan` — **macOS system-CA-trust CLI respawn, running on Linux**. Nothing to do with Discord, ingress, or channels.

**GitNexus** (mandated): `analyze` → indexed in 1196.7 s, **423,003 nodes / 2,367,436 edges / 22,783 clusters / 300 flows** at the exact base `df1c965`. `impact createChannelIngressMonitor` → **46 impacted / CRITICAL / 19 direct / 20 modules**; `createChannelIngressDrain` → 4 / LOW; `shouldDeadLetterRetryableIngressEvent` → 4 / LOW. Cypher → 45 ingress test files. Every graph claim is paired with source bytes.

**Report hygiene:** `git diff --check` clean; no credentials, message bodies, or private identifiers; no absolute paths in repo-ref citations.

## Uncertainties

1. **The runner's `failed 323 Vitest shards` string is ambiguous** — 323 is almost certainly the shard count with 26 failing per the digest, but I report both strings verbatim rather than over-interpret. Only 12 of the 26 were listed ("14 more omitted"); I spot-checked one and did not enumerate all 26. Given zero product change, none are attributable.
2. **I could not re-run the failed shards exhaustively.** One representative (`unit-fast-fake-timers`) was proven genuinely pre-existing and unrelated; the discord shard was proven contention. The other 24 were not individually classified.
3. **`gitnexus detect-changes` was not used.** It maps working-tree diff hunks to symbols and would have been ideal, but it requires applying a PR diff to the worktree — a code mutation this read-only lane forbids.
4. **The "four commits ahead / 1076 behind fork main" figure was not reproducible.** Not load-bearing: both PR heads resolve exactly against `openclaw/openclaw`.
5. **#1237's live head was read, but its CI was not polled.** Its body's own gate numbers refer to an earlier SHA.
6. **The 15-minute and 2-hour numbers are precedent, not tuning.** Whether 2 h is right for Discord addressed backlog is a product judgement I flag rather than settle.
7. **Upstream advanced by one commit mid-run** (`c5ba4efbd70` → `3a9e4619126`). The base remains an ancestor; conclusions are unaffected.

## Troubles surfaced

1. **`scribe-notify.sh` returns HTTP 400 for this lane.** Root cause found: the helper builds the webhook username as `frond-scribe-<lane>-hook`, and **Discord rejects usernames containing the substring "discord"** — which this lane slug contains. The helper itself is fine (`--check` exits 0). Worked around by sending under `three-dscrd-pr-gitnexus-sitrep` while keeping the real `[three-discord-pr-gitnexus-sitrep]` tag in the message body. **Any future lane with "discord" in its slug will hit this.**
2. **`npx gitnexus analyze` mutates the checkout.** It appended a 45-line `<!-- gitnexus:start -->` block to the **tracked** root `AGENTS.md` and created an untracked `.agents/skills/gitnexus/` tree. Reverted `AGENTS.md`; left the untracked dir without touching `.git/info/exclude`, since worktrees share the main `.git` and excluding there would affect sibling lanes.
3. **`scripts/test-projects.mjs` does not exist** at this revision. The canonical runner — and what `pnpm test` invokes — is `scripts/test-projects.mts` via `node --import tsx`. Dispatch policy should be updated.
4. **GitNexus has 8 repositories registered**, so every bare CLI call aborts with `Multiple repositories indexed`. All queries pinned `--repo <absolute worktree path>`, per the workorder's stated fallback. MCP registry was not reloaded.

## Exact commands

```bash
# base + heads
git rev-parse HEAD                                      # df1c96591115…
git merge-base --is-ancestor c5ba4efbd700…f1a72360ff HEAD   # YES
git rev-list --left-right --count HEAD...upstream/main  # 0  1
git fetch upstream pull/121204/head:pr121204            # 02bd9d7714…
git fetch upstream pull/122466/head:pr122466            # 35c68f59fe…
git fetch origin   pull/1237/head:kt1237                # 85e5252e17…

# conflict proof (3-way, over merge-base cb50289e2836)
git merge-file merged.ts  base.ts  b.ts                 # exit 1 — ingress.ts:444
git merge-file tmerged.ts tbase.ts tb.ts                # exit 1 — ingress.test.ts
git diff --numstat pr121204 kt1237 -- src extensions    # 23 files, ~+2400/-900

# CI
gh pr checks 121204 -R openclaw/openclaw                # 3 fail / 75 pass / 39 skip
gh pr checks 122466 -R openclaw/openclaw                # 0 fail / 50 pass / 41 skip
gh api repos/openclaw/openclaw/actions/runs/31330361173 # head_sha == PR head

# GitNexus (all pinned to this worktree)
R=/home/figs/flesh_beast_best_beast/source/WORKTREES/openclaw-three-discord-pr-gitnexus-sitrep
npx gitnexus analyze
npx gitnexus impact  createChannelIngressMonitor            --repo "$R"
npx gitnexus impact  createChannelIngressDrain              --repo "$R"
npx gitnexus impact  shouldDeadLetterRetryableIngressEvent  --repo "$R"
npx gitnexus context createDiscordIngressMonitor            --repo "$R"
npx gitnexus trace   createDiscordIngressMonitor drainOnce  --repo "$R"
npx gitnexus query   "stale message age threshold suppression before dispatch" --repo "$R"
npx gitnexus cypher  "MATCH (f:File) WHERE f.filePath CONTAINS 'ingress' AND f.filePath CONTAINS '.test.ts' RETURN f.filePath AS testFile ORDER BY testFile" --repo "$R"

# tests
node --import tsx scripts/test-projects.mts
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 extensions/discord/src/monitor/ingress.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast.config.ts --maxWorkers=1 src/channels/message/ingress-retry-policy.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit-fast-fake-timers.config.ts --maxWorkers=1

# cleanup of tool side effect
git checkout -- AGENTS.md
```

## Links

- https://github.com/openclaw/openclaw/pull/121204
- https://github.com/openclaw/openclaw/pull/122466
- https://github.com/karmaterminal/openclaw/pull/1237
- https://github.com/openclaw/openclaw/issues/16555
- https://github.com/openclaw/openclaw/issues/97435
- https://github.com/openclaw/openclaw/issues/122465
