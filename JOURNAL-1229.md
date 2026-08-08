# Issue 1229 — Discord durable-ingress backlog red reproducer

## Scope

- Issue: `karmaterminal/openclaw#1229`
- Branch: `codeagent/emeric-1229-ingress-backlog-red`
- Base: `bf0aadbc40c25a2d5231f7736633f5fa68ebca5b`
- Goal: add deterministic focused tests that reproduce the durable-ingress head-of-line/backlog behavior and fail on the unmodified product.
- Stop boundary: red test receipt only. Do not implement the product fix, open a PR, merge, deploy, mutate a live queue, or run broad CI.

## Grounded incident frame

- A same-channel head row completed after 496 attempts and 30.52 hours.
- Later pending rows drained oldest-first as fresh room turns.
- Bound direct-message examples were admitted 13.06 hours and 3.48 hours late.
- No second Discord ingress, dead-letter resubmit, outbound duplicate, or continuation cause is claimed.

## Required proof

Use controlled stores/fake time rather than sleeps or a live Discord gateway. Prefer the narrowest owning queue/monitor tests that prove:

1. a retry-delayed or recovered head event can block a newer event in the same lane;
2. an hours-old Discord ambient event can still be adopted as current after recovery because no freshness disposition exists; and
3. the focused test is green before the new assertion and red after it, with the exact failure captured.

Record touched files, exact commands, baseline/result, and the first missing ownership boundary here. Commit and push the test-only red reproducer; do not patch behavior.

## Red proof receipt — 2026-08-08

### Source frame

- `extensions/discord/src/monitor/ingress.ts`: `inspectDiscordMessage()` maps every `MESSAGE_CREATE` in a Discord channel to `laneKey: channel:<channelId>`; the monitor retention config caps completed/failed rows but supplies no pending TTL, pending max, freshness, or coalescing disposition.
- `src/channels/message/ingress-drain.ts`: `drainOnce()` snapshots all pending rows oldest-first, derives blocked lanes from active claims, claimed rows, and retry-delayed pending rows, then calls `claimNext()` with the same-lane blocked set. A retry-delayed pending head marks the whole lane blocked before a newer same-lane event can be claimed.
- `src/channels/message/ingress-queue.ts`: `listPending()` and `claimNext()` order pending rows by `received_at, event_id`; no age/freshness discriminator participates in claim selection.
- `src/channels/message/ingress-retry-policy.ts`: retry delay is derived from `last_attempt_at`, `attempts`, and the retry backoff; retryable events are dead-lettered only after both attempt floor and minimum age.

### Focused test design

- Owner test file: `src/channels/message/ingress-drain.test.ts`.
- Test 1 creates a controlled queue with fake `now()`, makes the same-lane head fail once as retryable, enqueues a newer addressed row during the backoff window, and asserts the safety contract that the newer addressed row can be adopted instead of being starved by the retry-delayed head.
- Test 2 creates a controlled queue with a 13-hour-old Discord-shaped ambient backlog row and a fresh addressed row on the same `channel:discord-room` lane, then asserts the safety contract that recovery must not adopt the stale ambient row as the current turn ahead of the fresh addressed row.
- No production seams, sleeps, live Discord gateway, live runtime state, broad CI, or production code changes were used.

### Baseline before edits

Command:

```shell
node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
```

Output:

```text
[test] starting test/vitest/vitest.channels.config.ts

 RUN  v4.1.10 /tmp/emeric-ingress-backlog-c7b7fe4c

 ✓  channels  src/channels/message/ingress-drain.test.ts (29 tests) 1979ms
     ✓ crash-window: lost claim is recovered and dispatched exactly once  329ms

 Test Files  1 passed (1)
      Tests  29 passed (29)
   Start at  00:45:34
   Duration  3.21s (transform 1.10s, setup 740ms, import 352ms, tests 1.98s, environment 0ms)

[test] passed 1 Vitest shard in 6.10s
```

### Red receipt after adding the reproducer

Command:

```shell
node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
```

Output:

```text
[test] starting test/vitest/vitest.channels.config.ts

 RUN  v4.1.10 /tmp/emeric-ingress-backlog-c7b7fe4c

 ❯  channels  src/channels/message/ingress-drain.test.ts (31 tests | 2 failed) 2011ms
     × red: retry-delayed same-lane head does not starve a newer event 84ms
     × red: stale Discord ambient backlog is not adopted before a fresh addressed event 57ms

 FAIL   channels  src/channels/message/ingress-drain.test.ts > channel ingress drain > red: retry-delayed same-lane head does not starve a newer event
AssertionError: expected { started: +0 } to deeply equal { started: 1 }

- Expected
+ Received

  {
-   "started": 1,
+   "started": 0,
  }

 ❯ src/channels/message/ingress-drain.test.ts:683:39

 FAIL   channels  src/channels/message/ingress-drain.test.ts > channel ingress drain > red: stale Discord ambient backlog is not adopted before a fresh addressed event
AssertionError: expected [ 'stale-ambient' ] to deeply equal [ 'fresh-addressed' ]

- Expected
+ Received

  [
-   "fresh-addressed",
+   "stale-ambient",
  ]

 ❯ src/channels/message/ingress-drain.test.ts:720:23

 Test Files  1 failed (1)
      Tests  2 failed | 29 passed (31)
   Start at  00:46:09
   Duration  2.61s (transform 347ms, setup 290ms, import 209ms, tests 2.01s, environment 0ms)

[test] failed 1 Vitest shard in 5.61s
[vitest] FAILED (exit 1)
```

### Touched files

- `src/channels/message/ingress-drain.test.ts`
- `JOURNAL-1229.md`

### First missing ownership boundary

Durable ingress has a lane-serialization owner and a retry owner, but no owner records or consumes an event freshness/coalescing disposition before claim selection. The first missing boundary is the ingress owner that should decide whether stale ambient same-lane backlog remains admissible, is superseded/coalesced, or is terminally dispositioned while preserving current addressed work.

## Implementation continuation — 2026-08-08

### Live issue refresh

Command:

```shell
gh issue view 1229 --repo karmaterminal/openclaw --comments --json number,title,state,author,createdAt,updatedAt,body,comments,labels,assignees,url
```

Result: issue #1229 remains open, unassigned, labeled `bug`, `status:in_coding_agent`, and `code-agent`. The only public comment is the red-first receipt for `c22823368aead2a6cef82b770b5fd82d3b3e61a9`; no maintainer comment changed the two red contracts.

### GitNexus focused graph commands

The exact-root build was not rerun. I used the completed focused alias `emeric-1229-ingress` only.

```shell
/home/figs/.npm-global/bin/gitnexus list
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress createChannelIngressDrain
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress createChannelIngressDrain --depth 3 --include-tests
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress -u Function:ingress-queue.ts:claimNext
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress Function:ingress-queue.ts:claimNext --depth 3 --include-tests
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress createChannelIngressMonitor
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress createChannelIngressMonitor --depth 3 --include-tests
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress resolveIngressRetryDelayMs
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress resolveIngressRetryDelayMs --depth 3 --include-tests
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress supersedeActiveStatesIfNeeded
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress supersedeActiveStatesIfNeeded --depth 3 --include-tests
/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (n) RETURN labels(n) AS labels, keys(n) AS keys LIMIT 5"
/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (s) WHERE toLower(s.name) CONTAINS 'retry' OR toLower(s.name) CONTAINS 'supersede' OR toLower(s.name) CONTAINS 'lane' RETURN s.name AS name, s.filePath AS filePath, s.startLine AS line LIMIT 80"
/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (a)-[r]->(b) WHERE a.name IN ['createChannelIngressDrain','drainOnce','claimNext','resolveIngressRetryDelayMs','supersedeActiveStatesIfNeeded','createChannelIngressMonitor'] RETURN a.name AS from, r.type AS rel, b.name AS to, b.filePath AS filePath LIMIT 160"
```

Notes: two initial exploratory Cypher attempts using `TYPE(r)` and `s.file` failed against this GitNexus store; the schema probe showed edge relation names live in `r.type` and symbol paths in `filePath`, so the successful Cypher commands above use those fields.

### GitNexus ownership map

- `createChannelIngressDrain` (`src/channels/message/ingress-drain.ts`) owns `drainOnce`, stale-claim recovery, lane blocking, retry-delay gating, pre-adoption active supersede, and dispatch lifecycle. Impact pointed at `ingress-drain.test.ts`, `ingress-drain-supersede.test.ts`, and `ingress-drain-lanes.test.ts`.
- `claimNext` (`src/channels/message/ingress-queue.ts`) owns the atomic pending-to-claimed transition, scan limit, candidate ID filtering, durable lane reconciliation, corrupt-payload tombstoning, and claimed-candidate lane blocking.
- `resolveIngressRetryDelayMs` (`src/channels/message/ingress-retry-policy.ts`) owns retry eligibility delay from attempts/last attempt/backoff; `drainOnce` is the process step that consumes it.
- `supersedeActiveStatesIfNeeded` (`src/channels/message/ingress-drain-supersede.ts`) owns only active pre-adoption supersede, not pending backlog disposition.
- `createChannelIngressMonitor` (`src/channels/message/ingress-monitor.ts`) owns durable admission/pump/retention and wires channel policy into `createChannelIngressDrain`.
- Discord owner boundary is `extensions/discord/src/monitor/ingress.ts`: `inspectDiscordMessage()` maps every `MESSAGE_CREATE` to `channel:<channelId>`, and `createDiscordIngressMonitor()` is the channel-owned place that can distinguish Discord direct/bot-mentioned work from ambient guild backlog before core dispatch.

### Causal graph used for the fix

`DiscordMessageListener.handle()` awaits durable append only -> `createDiscordIngressMonitor.accept()` -> `createChannelIngressMonitor.admit()` -> queue `enqueue()` writes pending row with lane -> pump calls `drainOnce()` -> `recoverStaleClaims()` releases dead claimed rows -> `listPending()` snapshots pending rows -> pending policy now terminally dispositions stale ambient rows -> retry filter removes not-yet-eligible retry rows from `candidateIds` instead of blocking their lanes -> `claimNext()` atomically claims the first eligible unblocked candidate -> `runClaimed()` dispatches exactly one lane owner -> lifecycle `onAdopted()` tombstones completion or failure disposition dead-letters.

### Additional source inspection frame

- `src/channels/message/ingress-queue.ts`: `listPending()` and `claimNext()` already support candidate ID subsets; this allowed skipping retry-delayed rows without changing SQLite schema or queue ordering.
- `src/channels/message/ingress-monitor.ts`: `drain` options are passed through to the core drain, so channel-owned policy can stay out of core while sharing durable mechanics.
- `extensions/discord/src/monitor/ingress.ts`: Discord has stable raw `timestamp`, guild/DM shape, and bot mention metadata before dispatch; this is enough for a conservative stale-ambient fence without running full preflight or model code.
- `extensions/imessage/src/monitor/inbound-dedupe.ts` and `extensions/imessage/src/monitor/monitor-provider.ts`: precedent for plugin-owned stale-backlog age fences; iMessage suppresses live stale backlog at 15 minutes and logs the disposition.
- `extensions/telegram/src/telegram-ingress-drain.ts`: precedent for using core drain hooks from the plugin owner; Telegram keeps its lane derivation/supersede policy local and uses `deferredLaneOccupancy: "release"`, `orderBy: "id"`, and a plugin-owned supersede predicate.

### Designs compared

1. **Dispatch-time no-op guard only.** Claim stale ambient rows, then have Discord dispatch complete them without a model turn. Rejected: it still makes stale rows own the lane one by one, fails the preserved red assertion that fresh addressed work is the first adopted event, and leaves retry-delayed heads able to block later eligible work.
2. **Queue retention/prune pending TTL.** Configure Discord `pendingTtlMs`/`pendingMaxEntries`. Rejected: pruning deletes rows without a durable failed/auditable reason, cannot distinguish stale addressed work from stale ambient work, and would be unsafe for operators who need direct mentions preserved.
3. **Chosen split: core eligibility + channel disposition.** Core drain now treats retry delay as per-row eligibility, not a lane-wide block, and adds one generic pre-claim pending disposition hook that terminally fails rows with an explicit reason. Discord supplies the only channel-specific policy: stale guild ambient messages older than 15 minutes are failed as `stale-ambient-backlog`; DMs and bot mentions are preserved. This is the narrowest invariant-preserving split because core owns durable queue mechanics and Discord owns addressed-vs-ambient semantics.

### Chosen implementation

- `src/channels/message/ingress-drain.ts`
  - Added `resolvePendingDisposition(record, { laneKey, now })` to the drain options.
  - Applied pending dispositions immediately after stale-claim recovery and before claim selection.
  - Failed suppressed pending rows through existing `queue.fail()` so payload/metadata/attempt history remain in the dead-letter table with a stable reason.
  - Removed retry-delayed pending rows from the claim candidate set instead of adding their lane to `blockedLaneKeys`.
- `extensions/discord/src/monitor/ingress.ts`
  - Added a conservative Discord stale ambient fence: guild messages older than 15 minutes with no bot mention are failed before dispatch.
  - DMs and bot-mentioned messages are considered addressed and are never suppressed by this ambient fence.
  - If bot identity is unavailable, the fence fails open and preserves the row.
- `extensions/discord/src/monitor/message-handler.ts`
  - Passes `botUserId` into the ingress monitor so the monitor can distinguish bot mentions before claim.

No SQLite schema version bump, migration, runtime queue mutation, live Discord state, sleeps, or broad CI was used.

### Test expansion

- Preserved both red assertions exactly:
  - `expect(await drain.drainOnce()).toEqual({ started: 1 });` for retry-delayed head bypass.
  - `expect(adopted).toEqual(["fresh-addressed"]);` for stale ambient vs fresh addressed.
- Added/covered edge cases in `src/channels/message/ingress-drain.test.ts`:
  - future retry head versus later eligible same-lane event, plus retry expiry of the old head;
  - active same-lane ownership still blocks while unrelated lanes progress;
  - stale ambient versus fresh addressed;
  - stale addressed work is preserved;
  - fresh ambient FIFO at the exact freshness boundary;
  - restart/recovery of an orphan stale ambient claim before fresh addressed work;
  - idempotency via failed tombstone duplicate behavior;
  - strict clock boundary (`>` 15 minutes, not `>=`);
  - retry/max-attempt/dead-letter behavior remains covered by existing retry/dead-letter tests.
- Added Discord owner tests in `extensions/discord/src/monitor/ingress.test.ts`:
  - stale ambient guild backlog is failed before fresh bot mention dispatch;
  - stale bot mentions are not suppressed.

### Validation receipts so far

```shell
pnpm format src/channels/message/ingress-drain.ts src/channels/message/index.ts src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain.test-helpers.ts extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts
# passed; oxfmt wrote 7 files

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
# passed: 36 tests, 1 file, 6.58s wrapper time

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# passed: 7 tests, 1 file, 18.41s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# passed: 121 tests across unit-fast/channels shards, 10.55s wrapper time
```

Additional type/lint/diff validation to be recorded after final checks.

### Final validation receipts — 2026-08-08

```shell
pnpm format src/channels/message/ingress-drain.ts src/channels/message/ingress-drain-state.ts src/channels/message/ingress-drain-pending-disposition.ts src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain.test-helpers.ts src/channels/message/index.ts extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# passed; oxfmt completed

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
# passed: 36 tests, 1 file, 6.72s wrapper time on final run

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# passed: 7 tests, 1 file, 10.33s wrapper time on final run

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# passed: 121 tests across unit-fast/channels shards, 9.92s wrapper time on final run

pnpm tsgo:core && pnpm tsgo:extensions
# passed

pnpm tsgo:core:test && pnpm tsgo:extensions:test
# passed after adding explicit Discord event-id test guards

pnpm format:check src/channels/message/ingress-drain.ts src/channels/message/ingress-drain-state.ts src/channels/message/ingress-drain-pending-disposition.ts src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain.test-helpers.ts src/channels/message/index.ts extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# passed

node scripts/run-oxlint.mjs src/channels/message/ingress-drain.ts src/channels/message/ingress-drain-state.ts src/channels/message/ingress-drain-pending-disposition.ts src/channels/message/ingress-drain.test-helpers.ts src/channels/message/index.ts extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts
# passed

git --no-pager diff --check
# passed

node scripts/check-changed.mjs -- src/channels/message/ingress-drain.ts src/channels/message/ingress-drain-state.ts src/channels/message/ingress-drain-pending-disposition.ts src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain.test-helpers.ts src/channels/message/index.ts extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# blocked: delegated Crabbox workload routing failed before repo checks because selected crabbox binary failed basic --version/--help sanity checks
```

Direct full oxlint including `src/channels/message/ingress-drain.test.ts` was not used as the final lint receipt because that red-test file was already over the direct `max-lines` threshold at the inherited red commit (`1243` lines before this implementation). The path-scoped changed wrapper that normally owns baseline-aware classification is blocked by the Crabbox binary sanity failure above; focused format, production/test-helper lint, typechecks, and Vitest owner suites are green.

### Final touched files

- `src/channels/message/ingress-drain.ts`
- `src/channels/message/ingress-drain-state.ts`
- `src/channels/message/ingress-drain-pending-disposition.ts`
- `src/channels/message/index.ts`
- `src/channels/message/ingress-drain.test.ts`
- `src/channels/message/ingress-drain.test-helpers.ts`
- `extensions/discord/src/monitor/ingress.ts`
- `extensions/discord/src/monitor/message-handler.ts`
- `extensions/discord/src/monitor/ingress.test.ts`
- `JOURNAL-1229.md`
- `REVIEW-1229.md`

### First fixed ownership boundary

The first repaired boundary is the core drain pre-claim selection step: stale-claim recovery now feeds a pending-disposition pass before retry eligibility and `claimNext()`. Core owns durable failure/tombstone mechanics and retry row eligibility; Discord owns the addressed-vs-ambient decision that determines whether a stale guild row is terminally failed as `stale-ambient-backlog`.

## Follow-up implementation — 2026-08-08

### Review objection

Independent review rejected the Discord addressed classifier as incomplete for
stale explicit replies: `resolveDiscordMentionState()` already maps
`referencedAuthorId === botUserId` to `reply_to_bot`, but
`isDiscordAddressedMessage()` only preserved DMs and direct bot mentions before
stale-ambient suppression. That left a raw Discord guild reply to the bot able
to dead-letter as ambient before preflight could resolve the existing
`reply_to_bot` semantic.

### Narrow fix

- Added the raw `APIMessage.referenced_message.author.id === botUserId` check
  to the Discord durable-ingress addressed classifier.
- Added a Discord owner regression that enqueues a stale guild reply whose raw
  referenced message author is the bot, then proves it dispatches and leaves no
  `stale-ambient-backlog` failed row.
- Left route hydration and configured mention-pattern resolution out of scope;
  text-only configured mentions remain the known residual because they require
  a broader pre-claim route/policy seam.

### Completed/suppressed tombstone comparison

I compared the completed/suppressed tombstone alternative and retained the
failed dead-letter semantic. A completed tombstone would make suppressed stale
ambient backlog look successfully handled, hide it from channel ingress
dead-letter health, and remove the explicit operator decision before replay.
Failed `stale-ambient-backlog` rows are therefore intentional dead letters:
they count in dead-letter health and require explicit dead-letter resubmit to
run again.

### Follow-up validation receipts

```shell
pnpm format extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# passed; oxfmt completed on 4 files

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# passed: 8 tests, 1 file, 9.66s wrapper time on final run

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
# passed: 36 tests, 1 file, 5.91s wrapper time on final run

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# passed: 121 tests across unit-fast/channels shards, 9.56s wrapper time

pnpm tsgo:extensions && pnpm tsgo:extensions:test
# first run failed on the new test fixture missing APIUser.global_name; fixed the fixture; rerun passed

pnpm format:check extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# passed

node scripts/run-oxlint.mjs extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts
# passed

git --no-pager diff --check
# passed

git --no-pager diff --numstat
# 70  0  JOURNAL-1229.md
# 22  0  REVIEW-1229.md
# 50  0  extensions/discord/src/monitor/ingress.test.ts
# 1   0  extensions/discord/src/monitor/ingress.ts
```

No runtime queue mutation, issue/PR comment, merge, deploy, or public GitHub
write was performed.

## Second follow-up implementation — 2026-08-08

### Cohort objection

The cohort accepted the stale reply-to-bot repair but rejected the raw
pre-claim classifier as still too confident. Full Discord preflight has two
additional addressed forms that the raw durable-ingress row cannot always prove:

- bound-thread traffic can bypass mention requirements once preflight resolves
  a thread binding and thread channel; and
- configured text mention patterns can set `wasMentioned` even when Discord
  does not provide a native user mention in `mentions`.

The invariant is unchanged: stale ambient backlog may be terminally suppressed
only when the row is provably ambient at the pre-claim boundary.

### GitNexus focused graph commands

No whole-repo indexing was run. The focused alias still covers only
`src/channels/message`, so Discord symbol lookups correctly returned no graph
node and forced a direct source walk for the plugin-owned classifier.

```shell
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress resolveDiscordMentionState
# Symbol not found; Discord files are outside the focused alias.

/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress resolveDiscordMentionState --depth 3 --include-tests
# Target not found; impactedCount=0.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress createDiscordIngressMonitor
# Symbol not found; Discord files are outside the focused alias.

/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress createDiscordIngressMonitor --depth 3 --include-tests
# Target not found; impactedCount=0.

/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (s) WHERE toLower(s.name) CONTAINS 'discord' OR toLower(s.name) CONTAINS 'mention' OR toLower(s.name) CONTAINS 'thread' OR toLower(s.name) CONTAINS 'preflight' RETURN s.name AS name, s.filePath AS filePath, s.startLine AS line ORDER BY s.filePath, s.startLine LIMIT 200"
# Returned [] because the focused graph is the core message-ingress slice.

/home/figs/.npm-global/bin/gitnexus list
# Confirmed `emeric-1229-ingress` path is `src/channels/message`; no indexing.

/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (s) RETURN s.name AS name, s.filePath AS filePath, s.startLine AS line LIMIT 80"
# Sampled symbols from the existing alias; all were core message-ingress files.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress createChannelIngressDrain

/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress createChannelIngressDrain --depth 3 --include-tests
# Impact remains the core drain tests: ingress-drain, lanes, supersede.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress resolvePendingDisposition
# Symbol not found; the indexed alias predates the new helper extraction name.

/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (s) WHERE toLower(s.name) CONTAINS 'pending' OR toLower(s.name) CONTAINS 'retry' OR toLower(s.name) CONTAINS 'disposition' OR toLower(s.name) CONTAINS 'claimnext' RETURN s.name AS name, s.filePath AS filePath, s.startLine AS line ORDER BY s.filePath, s.startLine LIMIT 120"
# Confirmed `claimNext`, retry delay, and failure disposition remain the core owner symbols.

/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (s) WHERE toLower(s.name) CONTAINS 'disposition' RETURN s.name AS name, s.filePath AS filePath, s.startLine AS line ORDER BY s.filePath, s.startLine LIMIT 80"
# Confirmed the graph has only core failure-disposition symbols, not Discord preflight.
```

### Direct source walk conclusions

- Core pre-claim mechanics are still owned by
  `src/channels/message/ingress-drain.ts`: stale-claim recovery runs before the
  pending-disposition hook, retry-delayed rows are only omitted from candidate
  IDs, and `claimNext()` remains the atomic owner for eligible claims.
- `extensions/discord/src/monitor/ingress.ts` was the unsafe owner: its
  pre-claim classifier preserved DMs, native/raw bot mentions, and raw
  reply-to-bot, then failed old guild rows as `stale-ambient-backlog`.
- `extensions/discord/src/monitor/message-handler.preflight.ts` proves the
  missing addressed forms: `bypassMentionRequirement` becomes true for bound
  thread sessions, and `buildMentionRegexes()` plus
  `resolveDiscordMentionState()` can set `wasMentioned` from configured text
  patterns.
- `extensions/discord/src/monitor/message-handler.preflight-thread.ts` and
  `extensions/discord/src/monitor/threading.starter.ts` show thread status can
  come from cached `message.channel.isThread()` or fetched channel info before
  bindings are resolved; the raw durable row does not have that full preflight
  context.
- `extensions/discord/src/monitor/thread-bindings.types.ts` and
  `thread-bindings.manager.ts` show the plugin-owned manager can resolve a
  known bound thread by `getByThreadId()`.
- `node_modules/discord-api-types/payloads/v10/message.d.ts` confirms
  `APIMessage` carries `referenced_message` for replies and `thread` for a
  newly-started thread, but not a guaranteed current-channel type. That is why
  unresolved thread-address semantics must fail open rather than be called
  ambient.

### Designs compared

**A. Fail open pre-claim for unresolved address forms.** Preserve the existing
pre-claim stale ambient dead-letter only for rows that are still provably
ambient after cheap raw checks. When a stale guild row is in a known bound
thread, has cached thread-channel shape, or the config contains text mention
patterns that preflight may use, skip pre-claim suppression and let the normal
preflight path decide. This is narrow, Discord-local, leaves core drain
semantics unchanged, and avoids false terminalization.

**B. Replace pre-claim terminal fail with a priority-only seam and move stale
ambient suppression after full preflight.** This would require a larger core
and Discord lifecycle seam: priority-only claiming for provably addressed rows,
post-preflight stale ambient detection after route hydration, and a new
completed/suppressed tombstone that does not count as health noise. It would
remove more false-negative stale backlog but changes durable disposition
semantics beyond the red contracts.

Chosen design: **A**. It is the narrowest safe revision. It keeps the original
default stale ambient suppression and retry-head bypass contracts, but refuses
to dead-letter rows whose address status depends on preflight-only thread or
configured text-mention state.

### Chosen implementation and blast radius

- `extensions/discord/src/monitor/ingress.ts`
  - Added fail-open checks for plugin-owned thread binding lookup,
    cached thread-channel shape, and configured text mention patterns.
  - Kept DMs, direct mentions, raw content mentions, and raw reply-to-bot as
    positive addressed signals.
  - Still fails only old guild rows that have none of those addressed or
    ambiguous forms.
- `extensions/discord/src/monitor/message-handler.ts`
  - Threads the runtime config snapshot and thread-binding lookup into the
    ingress monitor so the pre-claim classifier can fail open for those
    unresolved forms.
- `extensions/discord/src/monitor/ingress.test.ts`
  - Added regressions for stale DM, stale bound-thread, stale cached
    thread-channel, and stale configured text-mention rows.

No SQLite schema bump, migration, config/env addition, route hydration,
post-preflight tombstone seam, live Discord state, runtime queue mutation, or
GitHub public write was performed.

Residual scope: design A intentionally preserves more old guild rows when text
mention patterns are configured or a thread row is address-ambiguous. Full
post-preflight suppression with a non-health suppressed tombstone is still the
larger design B follow-up if maintainers want stale ambient cleanup in those
ambiguous configurations.

### Second follow-up validation receipts

```shell
node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# passed: 12 tests, 1 file, 10.21s wrapper time

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/message-handler.preflight.test.ts
# passed: 61 tests, 1 file, 10.06s wrapper time

pnpm tsgo:extensions && pnpm tsgo:extensions:test
# first run failed because the ingress monitor expected a getByThreadId-only
# lookup while preflight params carry the narrower reply-delivery lookup type;
# widened the local structural type. Second run failed because the cached
# thread-channel test override needed an explicit guild_id test type field;
# fixed the fixture type. Final rerun passed.

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/message-handler.preflight.test.ts extensions/discord/src/monitor/thread-bindings.lifecycle.test.ts extensions/discord/src/monitor/thread-bindings.discord-api.test.ts
# passed: 116 tests, 4 files, 9.65s wrapper time

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/message-handler.preflight.test.ts extensions/discord/src/monitor/thread-bindings.lifecycle.test.ts extensions/discord/src/monitor/thread-bindings.discord-api.test.ts
# final rerun passed: 116 tests, 4 files, 9.51s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# passed: 121 tests across 2 Vitest shards, 9.67s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# final rerun passed: 121 tests across 2 Vitest shards, 9.79s wrapper time

pnpm tsgo:extensions && pnpm tsgo:extensions:test
# final rerun passed

pnpm format:check extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# passed

node scripts/run-oxlint.mjs extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts
# passed

git --no-pager diff --check
# passed

git --no-pager diff --numstat
# 199  0  JOURNAL-1229.md
# 52   0  REVIEW-1229.md
# 176  2  extensions/discord/src/monitor/ingress.test.ts
# 85   1  extensions/discord/src/monitor/ingress.ts
# 2    0  extensions/discord/src/monitor/message-handler.ts

node scripts/check-changed.mjs -- extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# blocked before repo checks: delegated Crabbox workload routing selected a
# crabbox binary that failed basic --version/--help sanity checks.

mkdir -p "$HOME/.cache/openclaw-autoreview-tmp" && TMPDIR="$HOME/.cache/openclaw-autoreview-tmp" PATH="$HOME/.local/bin:$PATH" .agents/skills/autoreview/scripts/autoreview --mode local
# passed: TruffleHog clean and autoreview clean; no accepted/actionable findings reported.
```

Autoreview setup note: the first local autoreview attempt was blocked because
`trufflehog` was absent. I installed verified TruffleHog `v3.96.0` from the
official GitHub release into `$HOME/.local/bin` after checking the published
checksum, then reran the helper successfully. A repo-local binary was rejected
by autoreview isolation, and a repo-local `TMPDIR` was rejected because review
temp roots must be outside the reviewed repository.

## Third follow-up implementation — 2026-08-08

### Safety review objection

The next safety review found two false-terminalization gaps in the second
follow-up:

- provider-scoped Discord `mentionPatterns` from `params.discordConfig` were
  passed into full preflight's `buildMentionRegexes()` but not into the
  durable-ingress pre-claim classifier; and
- identity-derived mention regexes from the routed agent identity
  (`identity.name` and `identity.emoji`) can make full preflight treat stale
  guild rows as addressed, while the monitor still saw only raw Discord
  mentions, replies, bound/cached threads, and global/agent text-pattern
  presence.

Either case could incorrectly dead-letter an older guild row as
`stale-ambient-backlog` before full preflight proved it addressed.

### GitNexus focused graph commands

No whole-repo GitNexus indexing was run. Only the existing global CLI
`/home/figs/.npm-global/bin/gitnexus` was available; no GitNexus MCP graph/query
surface was exposed in this session.

The existing focused alias remains `src/channels/message` only:

```shell
/home/figs/.npm-global/bin/gitnexus list
# `emeric-1229-ingress` path is `src/channels/message`; Discord files are not indexed.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress resolveDiscordMentionState
# Symbol not found.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress buildMentionRegexes
# Symbol not found.

/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (s) WHERE toLower(s.name) CONTAINS 'mention' OR toLower(s.name) CONTAINS 'identity' OR toLower(s.name) CONTAINS 'preflight' RETURN s.name AS name, s.filePath AS filePath, s.startLine AS line LIMIT 120"
# Returned only core message-ingress identity symbols such as ingress claim-owner/outbound echo.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress preflightDiscordMessage
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress resolveDiscordPreflightRoute
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress -u Function:message-handler.preflight.ts:preflightDiscordMessage
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress -u Function:message-handler.routing-preflight.ts:resolveDiscordPreflightRoute
# All returned symbol not found, confirming the Discord route/preflight surfaces are outside the focused alias.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress createDiscordIngressMonitor
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress createDiscordIngressMonitor --depth 3 --include-tests
# Symbol/target not found; impactedCount=0.

/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress createChannelIngressDrain --depth 2 --include-tests
# Impact remains `ingress-drain.test.ts`, `ingress-drain-supersede.test.ts`, and `ingress-drain-lanes.test.ts`.

/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress claimNext
# Ambiguous; candidates include `Function:ingress-queue.ts:claimNext`.

/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (s) WHERE toLower(s.name) CONTAINS 'claimnext' OR toLower(s.name) CONTAINS 'retry' OR toLower(s.name) CONTAINS 'pending' RETURN s.name AS name, s.filePath AS filePath, s.startLine AS line LIMIT 120"
# Confirmed the indexed owner symbols are still core pending/retry/claim surfaces: `listPending`, `claimNext`, `resolveIngressRetryDelayMs`, and drain retry state.
```

GitNexus conclusion: the focused graph continues to validate that core
claim/retry/pending disposition ownership is unchanged. It cannot inspect the
Discord plugin or full mention preflight, so the provider-policy and identity
gaps were traced by direct source walk.

### Direct source and dependency walk

- `extensions/discord/src/monitor/message-handler.ts` created the ingress
  monitor with `cfg` and `threadBindings`, but not `discordConfig`; therefore
  the pre-claim classifier could not pass provider policy into mention regex
  resolution.
- `extensions/discord/src/monitor/message-handler.preflight.ts` builds mention
  regexes with `buildMentionRegexes(params.cfg, effectiveRoute.agentId, {
provider: "discord", conversationId: messageChannelId, providerPolicy:
params.discordConfig?.mentionPatterns })`.
- `extensions/discord/src/monitor/message-handler.routing-preflight.ts`
  resolves the effective route and `effectiveRoute.agentId` after binding and
  route hydration. Pre-claim rows do not have that routed fact.
- `src/auto-reply/reply/mentions.ts` derives mention regex patterns from
  configured `agents.*.groupChat.mentionPatterns`, then falls back to
  `identity.name` and `identity.emoji` for the selected agent when no explicit
  patterns are set.
- `src/channels/mention-pattern-policy.ts` applies provider-scoped
  `channels.discord.mentionPatterns` / account `params.discordConfig`
  allow/deny policy to those regexes.
- `extensions/discord/src/monitor/preflight-audio.ts` can treat captionless
  guild audio as addressed after transcription when mention regexes are
  configured. Pre-claim cannot run transcription safely, so audio-only rows
  with any configured mention regex must fail open.
- `node_modules/discord-api-types/payloads/v10/message.d.ts` confirms raw
  `APIMessage` contains `mentions`, `mention_everyone`, and optional
  `referenced_message`; it does not carry the post-route effective agent id or
  transcription result.

### Design comparison

**A. Reproduce the full Discord preflight route before claim.** Rejected for
this bounded follow-up. Correct preflight needs route hydration, binding
resolution, access checks, audio transcription, fetched channel/thread context,
and message normalization. Running that before claim would widen the monitor
into a second preflight path and still risks drift from the canonical dispatcher
path.

**B. Fail open when full preflight-only addressability is unproven.** Chosen.
The monitor now performs the narrow safe subset that is already available at
pre-claim: raw Discord mention/reply/everyone signals, bound/cached-thread
ambiguity, and the same mention-regex builder used by preflight with the
available config/provider-policy snapshot. Because the effective routed
`agentId` is unavailable before claim, it checks all configured agent ids and
the global fallback; this may preserve extra old rows, but it cannot falsely
terminalize a supported address form.

### Chosen implementation and blast radius

- `extensions/discord/src/monitor/message-handler.ts` now passes
  `params.discordConfig` into `createDiscordIngressMonitor()`.
- `extensions/discord/src/monitor/ingress.ts` now lazily loads
  `openclaw/plugin-sdk/channel-inbound` and calls the same public
  `buildMentionRegexes()` / `matchesMentionPatterns()` path that preflight uses,
  including provider policy from `params.discordConfig?.mentionPatterns`.
- The pre-claim classifier checks every configured agent id from
  `agents.entries` and `agents.list`, plus the global fallback, so
  identity-derived name/emoji address forms fail open even though the final
  routed agent id is not known before claim.
- The age check now runs before the lazy mention-regex path, so fresh guild rows
  do not pay the regex/preflight import cost.
- Raw `mention_everyone` is preserved as an explicit preflight-supported
  address form.
- Audio-only rows with configured mention regexes fail open because full
  preflight can transcribe them before mention resolution.

No core drain/queue change, SQLite schema bump, migration, config/env addition,
protocol change, dependency change, route hydration, live Discord access,
runtime queue mutation, deploy, public comment, issue closure, or PR/merge
operation was performed.

Blast-radius tradeoff: stale guild rows that mention any configured agent
identity, match any configured mention regex, contain mention-candidate audio,
or hit a provider-policy-enabled regex are now preserved for full preflight
instead of being pre-claim dead-lettered. This can leave more old rows for the
canonical preflight path, but avoids irreversible false terminalization.

### New regressions

`extensions/discord/src/monitor/ingress.test.ts` now covers stale guild rows
that would previously have been failed as ambient but must be preserved:

- provider-level Discord `mentionPatterns` policy from `discordConfig`;
- identity-derived agent name mention;
- identity-derived emoji mention;
- `@everyone` mention; and
- audio-only row with configured mention regexes.

Existing Discord ingress regressions still cover DM, direct mention,
reply-to-bot, bound-thread, cached-thread, configured text mention, and stale
ambient dead-letter behavior. Existing core ingress suites continue to cover
per-row retry, active-claim serialization, unrelated lane progress,
multi-lane/lane blocking, dead-letter, idempotency, and stale ambient ordering.

### Third follow-up validation receipts

```shell
node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# passed: 17 tests, 1 file, 10.43s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
# passed: 36 tests, 1 file, 5.87s wrapper time

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/message-handler.preflight.test.ts extensions/discord/src/monitor/thread-bindings.lifecycle.test.ts extensions/discord/src/monitor/thread-bindings.discord-api.test.ts
# passed before the audio-only refinement: 120 tests, 4 files, 9.78s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# passed: 121 tests across 2 Vitest shards, 9.50s wrapper time

pnpm tsgo:extensions && pnpm tsgo:extensions:test
# passed before the audio-only refinement

pnpm tsgo:core && pnpm tsgo:core:test
# passed

pnpm format extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts
# passed; oxfmt completed after audio-only refinement
```

Final post-documentation validation receipts are appended below after the last
format, lint, diff, typecheck, and autoreview pass.

### Final third follow-up validation receipts

```shell
node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# final passed: 17 tests, 1 file, 10.27s wrapper time

node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/message-handler.preflight.test.ts extensions/discord/src/monitor/thread-bindings.lifecycle.test.ts extensions/discord/src/monitor/thread-bindings.discord-api.test.ts
# final passed: 121 tests, 4 files, 10.24s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
# final passed: 36 tests, 1 file, 5.75s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# final passed: 121 tests across 2 Vitest shards, 9.70s wrapper time

pnpm tsgo:extensions && pnpm tsgo:extensions:test && pnpm tsgo:core && pnpm tsgo:core:test
# first final attempt failed on the new audio fixture missing APIAttachment
# `size`/`proxy_url` fields and a `guild_id` test override typed too narrowly;
# fixed the fixture and reran successfully.

pnpm format:check extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md
# passed

node scripts/run-oxlint.mjs extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/message-handler.ts extensions/discord/src/monitor/ingress.test.ts
# passed

git --no-pager diff --check
# passed

git --no-pager diff --numstat
# 230 0  JOURNAL-1229.md
# 47  0  REVIEW-1229.md
# 118 42 extensions/discord/src/monitor/ingress.test.ts
# 106 20 extensions/discord/src/monitor/ingress.ts
# 1   0  extensions/discord/src/monitor/message-handler.ts

mkdir -p "$HOME/.cache/openclaw-autoreview-tmp" && TMPDIR="$HOME/.cache/openclaw-autoreview-tmp" PATH="$HOME/.local/bin:$PATH" .agents/skills/autoreview/scripts/autoreview --mode local
# passed: TruffleHog clean; autoreview clean with no accepted/actionable findings.
```

Autoreview summary: Codex `gpt-5.6-sol` / high reasoning found no P0 defects
and judged the patch correct with the intended conservative fail-open behavior.

## Fourth follow-up implementation — 2026-08-08

### Changes-request objection

The pushed head `4cfa0c5ca43c74ddeb1ad0c9d0d91ee31e8c273b` still had one
preflight-supported address/control path that the raw pre-claim stale filter
could terminalize too early. Full Discord preflight lets authorized text
control commands bypass mention gating through the public command surface:
`shouldHandleTextCommands({ cfg, surface: "discord" })` plus
`hasControlCommand(baseText, params.cfg)`. A stale, unmentioned `/status`
message in a guild channel is therefore potentially active control traffic and
must reach canonical preflight instead of being failed as ambient backlog.

### Source walk and public API contract inspected

- `src/plugin-sdk/command-detection.ts` publicly exports `hasControlCommand`
  from `src/auto-reply/command-detection.ts`. The underlying detector strips
  inbound metadata, normalizes command bodies, checks the configured chat
  command registry with config feature flags, and intentionally treats
  `/status`, `/status:`, and `/status ...` as control commands while rejecting
  ambient text such as `hello /status`.
- `src/plugin-sdk/command-surface.ts` publicly exports
  `shouldHandleTextCommands` from `src/auto-reply/commands-text-routing.ts`.
  That helper keeps text commands active unless `commands.text === false` on a
  provider-native surface, while native command invocations remain active.
- `extensions/discord/src/monitor/message-handler.preflight.ts` is the
  canonical Discord preflight path: it imports the same public SDK helpers,
  computes `allowTextCommands`, computes `hasControlCommandInMessage`, resolves
  sender command authorization, and passes those facts into
  `resolveInboundMentionDecision()` so authorized text control commands can
  bypass mention gating.
- `extensions/discord/src/monitor/ingress.ts` is still the right narrow owner:
  it owns pre-claim stale ambient disposition and already fails open for raw
  address forms whose final route/preflight addressability is unproven.

### Chosen implementation

- Added a Discord-local `hasPotentialActiveDiscordTextControlCommand()` helper
  in `extensions/discord/src/monitor/ingress.ts`.
- The helper reuses public `openclaw/plugin-sdk/command-detection` and
  `openclaw/plugin-sdk/command-surface` exports; it does not duplicate command
  parsing or hydrate full routes before claim.
- The helper runs only after the stale-age check and before the unresolved
  mention/thread fail-open checks. Fresh rows therefore do not pay extra
  command-surface work.
- If `shouldHandleTextCommands()` cannot prove the surface state before claim
  because registry state is unavailable, the helper fails open for a parsed
  control command. The row then reaches the canonical preflight authorization
  gate rather than being irreversibly dead-lettered.

### Explicit stale ambient policy

Old unaddressed ambient guild traffic is intentionally terminalized as
`stale-ambient-backlog` even in always-on rooms where Discord config eventually
sets `requireMention=false`: stale backlog is not a fresh operator action and
must not replay as a current room turn after recovery. Explicit address/control
forms fail open before claim: direct/DM mentions, replies to the bot, everyone
mentions, bound/cached thread ambiguity, configured/provider/identity mention
matches, audio-only mention candidates, and active text control commands all
survive to full Discord preflight.

### New regressions and negative controls

- Positive control: a stale unmentioned `/status` guild row dispatches and does
  not become a `stale-ambient-backlog` dead letter.
- Negative control 1: a configured agent identity exists, but unrelated stale
  ambient content that does not match the identity is still failed as
  `stale-ambient-backlog`.
- Negative control 2: a stale row textually matches an agent identity, but the
  provider/account Discord mention policy denies that conversation, so it is
  still failed as `stale-ambient-backlog`.

These negative controls prove the fail-open safety guard is not a blanket
suppression bypass.

### Fourth follow-up validation receipts

```shell
pnpm format extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts && node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# passed: oxfmt completed; Discord ingress shard passed 20 tests, 1 file, 10.82s wrapper time

node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts && node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/message-handler.preflight.test.ts extensions/discord/src/monitor/thread-bindings.lifecycle.test.ts extensions/discord/src/monitor/thread-bindings.discord-api.test.ts && node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# passed: focused drain 36 tests; Discord monitor/preflight/thread shard 124 tests; broader core ingress owner suite 121 tests across 2 shards

pnpm tsgo:extensions && pnpm tsgo:extensions:test && pnpm tsgo:core && pnpm tsgo:core:test
# passed

pnpm format extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md && pnpm format:check extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts JOURNAL-1229.md REVIEW-1229.md && node scripts/run-oxlint.mjs extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts && git --no-pager diff --check && git --no-pager diff --numstat
# passed: oxfmt wrote/checks passed, targeted oxlint passed, diff check passed
# numstat before final receipt text: 88 0 JOURNAL-1229.md; 49 0 REVIEW-1229.md; 86 0 extensions/discord/src/monitor/ingress.test.ts; 26 0 extensions/discord/src/monitor/ingress.ts

mkdir -p .artifacts/autoreview-tmp && TMPDIR="$PWD/.artifacts/autoreview-tmp" PATH="$HOME/.local/bin:$PATH" .agents/skills/autoreview/scripts/autoreview --mode local
# blocked: autoreview requires TMPDIR/TMP/TEMP outside the reviewed repository.

test -d "$HOME/.cache/openclaw-autoreview-tmp" || mkdir -p "$HOME/.cache/openclaw-autoreview-tmp"; TMPDIR="$HOME/.cache/openclaw-autoreview-tmp" PATH="$HOME/.local/bin:$PATH" .agents/skills/autoreview/scripts/autoreview --mode local
TMPDIR="$HOME/.cache/openclaw-autoreview-tmp" PATH="$HOME/.local/bin:$PATH" .agents/skills/autoreview/scripts/autoreview --mode local
# final passed: TruffleHog clean; bundle 17202 bytes; autoreview clean with no accepted/actionable findings. Codex judged the patch correct (overall 0.99) with no P0 defects.
```

No SQLite schema bump, dependency change, live Discord/runtime queue mutation,
PR/merge/deploy, issue closure, or public GitHub comment was performed.
