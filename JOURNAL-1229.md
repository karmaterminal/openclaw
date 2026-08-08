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
