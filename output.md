# #1229 ingress admission test-fossil + historical graph walk

Lane: `codeagent/ingress-admission-test-fossil-historical-walk-r2`  
Bound issue: `karmaterminal/openclaw#1229`  
No production commits. No GitHub mutation (issue/PR open/close).

## Exact SHAs

| Ref | SHA | Role |
| --- | --- | --- |
| Lane HEAD (post-fossils) | `e1ec70fa07d3cefd6eaa1cf781d5cc99d2643101` | test-only tip |
| Composite base (pre-fossils) | `310252733a626568c98071bdaf9ee09dbdf38a88` | #122466-class discord undeliverable fix on composite |
| Absorbed upstream/main | `ff73a14f5ae71a899e5db9a3a41718ab1d104517` | via merge `1552b01d046` |
| Fork `origin/main` at work | `e0cd23d81ff78353ba3da349eaf74c748a117421` | context |
| Upstream tip (later flux only) | `812bbd88844769b9abf0ab8b586ada80380aa0f5` | context, not authority |
| Deployed incident build (issue) | `55b6176d43022b27fe0ced575140c4e8cd4bd444` | field receipt |
| Freshness fence intro (fork) | `2b2019202ffdbcdb0393a76be9d0ecdcb48489fe` | first `stale-ambient-backlog` / `canExpire…` |
| Drain engine intro (upstream) | `fc6b9dad0b13544f0f51597e479cf00cc1e002ca` | first `armStallWatchdog`→`failClaim("handler-timeout")` |
| LOC/module split | `ee3d084048d0d1d89685cf0f49d82c1aa8f7975a` | extracts `ingress-drain-state` / supersede; adds `deferredLaneOccupancy` |
| channel_type fix (not in composite) | `30613c7217c38c4c064d0ea684c54021534c8a04` | on `origin/codeagent/wo1229-p1p2-fix` only |
| Emeric #121204 tip (inert fence) | `02bd9d77142248a07e4ad50387a166db1823b494` / `bcbeae4e1f0` lineage | open upstream PR #121204 |

## What changed (this lane)

Test-only files:

1. `extensions/discord/src/monitor/ingress-admission-fossil.channel-type.test.ts` — **Fossil A**
2. `src/channels/message/ingress-drain.admission-fossil.test.ts` — **Fossils B + C**

## Deterministic reproduction results

### A — Real-shaped Discord freshness fence

**Exists: YES. Current composite: RED.**

- Fixture: guild `MESSAGE_CREATE` shape with `channel_type: 0` (`ChannelType.GuildText`), **no** synthetic `channel` object.
- Desired: stale ambient → `stale-ambient-backlog`; fresh mention → dispatch only.
- Observed RED:

```text
AssertionError: expected [ 'fossil-a-stale-ambient', 'fossil-a-fresh-mention' ]
  to deeply equal [ 'fossil-a-fresh-mention' ]
```

- Root cause (owner): `canExpireDiscordStaleAmbientBacklog` in
  `extensions/discord/src/monitor/ingress.ts` reads only
  `resolveDiscordChannelInfoSafe((rawMessage as { channel?: unknown }).channel)`.
  Real gateway payloads carry `channel_type`, not `channel` (confirmed by fleet
  report: 400/400 rows had `channel_type: 0`, zero had `channel`).
- Existing green suite locks the inert path with synthetic `channel: { type }`
  fixtures (`ingress-stale-direct-config.test.ts`) and explicitly documents
  fail-open when type is unknown — so CI can be green while production fence is
  dead on the wire shape.

### B — Adoption guillotine / retry-policy bypass

**Exists: YES. Current composite: RED (desired contract).**

- Stall past `adoptionStallTimeoutMs` with never-settling dispatch.
- Desired: route through `resolveIngressFailureDisposition` → release +
  `attempts++` + backoff unless policy permits terminal dead-letter
  (`retry-limit-exceeded`).
- Observed RED: durable row is **failed** with `reason: "handler-timeout"`,
  **`attempts: 0`**, `last_attempt_at` unset — matches Silas field morphology.
- Owner: `armStallWatchdog` → direct `failClaim(state.claim, "handler-timeout", …)`
  at `src/channels/message/ingress-drain.ts` (~413), bypassing
  `applyFailureDisposition` / `ingress-retry-policy.ts`.
- Existing green tests **encode the bypass as the contract**
  (`watchdog only guillotines pre-adoption stalls with handler-timeout`).
  Fixing B requires flipping those tests in the same change.

### C — Session-scoped morphology

**Exists: YES (partial API surface). Current composite: mixed.**

| Sub-assertion | Result | Notes |
| --- | --- | --- |
| Ordinary throw cleans via disposition (`attempts++`, release) | GREEN path inside RED test | contrasts never-settle |
| Never-settling owner holds `laneOwnerByKey` until watchdog | GREEN | process-local exclusive ownership |
| Unrelated session B admits/finishes while A hangs | GREEN | lane isolation works |
| After watchdog, hang is retryably released (not terminal) | **RED** | terminal `handler-timeout` attempts=0 |
| `dispose()` clears process-local lanes without erasing durable claims; second drain recovers | **GREEN** | `process-local dispose…` test PASSES |

**Leak classification:** not a permanently stuck `laneOwnerByKey` after guillotine.
Watchdog sets `guillotined`, `failClaim`s, and `removeActive` clears process-local
ownership. The JS `await new Promise(() => {})` may remain wedged if dispatch
ignores `abortSignal`, but that does **not** keep the lane map entry after
settle. The operator-visible defect is:

1. **pre-watchdog exclusive ownership** blocks same-lane work for up to 300s;
2. **terminal durable dead-letter at attempts=0** (policy bypass) destroys the
   row instead of releasing for retry;
3. serial application of (1)+(2) yields the field pattern: ~12 `handler-timeout`s
   per hour per wedged lane.

Distinct from delivery-queue / PluralKit latency (no preflight in these fossils).

**Missing observation hook (if product wants stronger C without production change):**
no public drain API exposes “why this claim is still pre-adoption after N ms”
or “watchdog fired with disposition X” beyond queue failed/pending rows and
`activeLaneKeys()`. Fossils use queue + `activeLaneKeys` only.

## Historical walk (assertion semantics held fixed)

### Symbol introduction / refactors

| Symbol / surface | First bad / intro | Notes |
| --- | --- | --- |
| `createChannelIngressDrain` / `armStallWatchdog` / direct `failClaim("handler-timeout")` | `fc6b9dad0b1` (2026-07-17) | **B first-bad = birth.** No prior good durable-drain state. |
| `laneOwnerByKey`, lifecycle types moved to `ingress-drain-state.ts`; supersede helper; `deferredLaneOccupancy` | `ee3d084048d` (#115401, 2026-07-28) | **LOC/module split.** Guillotine still direct `failClaim`. Split **did not introduce B**; it **exposed** deferred occupancy knobs used by Telegram. Cleanup ownership for guillotine stayed in `ingress-drain.ts`. |
| Discord `stale-ambient-backlog` + `canExpire…` reading `rawMessage.channel` | `2b2019202ff` (2026-08-08, fork) | **A first-bad = fence introduction with wrong field.** |
| Pending-disposition core hook | same `2b2019202ff` | Core seam is fine; Discord owner policy is inert on wire shape. |
| `channel_type` / durable `channelKind` cure | `30613c7217c` (+ hydrate follow-ons `5105631` / `56f9445` / `697c637`) | **Not absorbed into this composite.** Lives on `codeagent/wo1229-p1p2-fix`. |

Code matrix (direct `failClaim` present at every sampled drain revision):

| Commit | `armStallWatchdog` → `failClaim("handler-timeout")` | `applyFailureDisposition` used by throw path |
| --- | --- | --- |
| `fc6b9dad0b1` | yes | yes |
| `ee3d084048d` (split) | yes | yes |
| `2b2019202ff` | yes | yes |
| HEAD `310252733a6` / fossils tip | yes | yes |
| `upstream/main` tip (flux) | yes (per fleet report §) | yes |

### First test failure by commit (fossils)

| Fossil | First commit where desired contract fails | Pre-existence |
| --- | --- | --- |
| A | `2b2019202ff` (fence exists but inert); still RED on composite HEAD and on #121204 tip `02bd9d77142` | N/A before fence (no stale-ambient feature) |
| B | `fc6b9dad0b1` (introduction) | N/A before durable drain engine |
| C (terminal attempts=0) | same as B | process-local isolation / dispose recovery were never the broken piece |

### LOC refactor verdict

The `ee3d084048d` split **did not introduce** the guillotine bypass. It **moved**
types/helpers and added `deferredLaneOccupancy` without changing watchdog
terminalization. B is unchanged across the split boundary.

### GitNexus

GitNexus MCP/index **not available** in this environment (`gitnexus-query` /
index missing). Call graph reconstructed from source:

```
createChannelIngressDrain
  drainOnce → recoverStaleClaims → applyIngressPendingDispositions
            → claim loop → runClaimed
  runClaimed → armStallWatchdog + armClaimRefresh + dispatchClaimedEvent
  armStallWatchdog ──(timeout)──► failClaim("handler-timeout")   // BYPASS
  dispatch throw / onFailed ──► applyFailureDisposition
       └─ resolveIngressFailureDisposition → failClaim | releaseClaim
  onAdopted → completeClaim; clears stall timer
  dispose → abort + removeActive (process-local only)

createDiscordIngressMonitor
  resolvePendingDisposition → isDiscordAddressedMessage / age /
    hasUnresolvedDiscordAddressForm / canExpireDiscordStaleAmbientBacklog
  canExpire… → resolveDiscordChannelInfoSafe(rawMessage.channel)  // MISSING channel_type
```

## Ownership map

| Concern | Owner | Symbol / file |
| --- | --- | --- |
| Claim acquisition | core drain + queue | `runClaimed` / `queue.claim` |
| Per-lane exclusive ownership | core drain | `laneOwnerByKey` |
| Adoption complete | core drain lifecycle | `onAdopted` → `completeClaimWithRetry` |
| Pre-adoption timeout | core drain | `armStallWatchdog` |
| Retry vs dead-letter policy | core retry policy | `resolveIngressFailureDisposition` |
| **Bug B: timeout skips policy** | core drain | direct `failClaim` in watchdog |
| Discord stale ambient policy | discord plugin | `resolvePendingDisposition` in `ingress.ts` |
| **Bug A: wrong type field** | discord plugin | `canExpireDiscordStaleAmbientBacklog` |
| Reply-lane followup queues | auto-reply | `FOLLOWUP_QUEUES` (related but distinct from durable ingress claim watchdog) |
| Process-local reset | core drain | `dispose` / owner registry |

## Fix separation (proposed workorders — do not implement here)

### 1) Fork / Discord — belongs with #121204 lineage (blocks merge of inert PR)

- Read `channel_type` (and/or persist durable `channelKind` at accept time) in
  `canExpireDiscordStaleAmbientBacklog` / admission path.
- Prefer the fuller cure already drafted at `30613c7217c` + hydrate follow-ons
  over a one-line field swap if thread ambiguity remains
  (`channel_type` optional for both guild text and threads — see `56f9445`).
- Replace synthetic `channel` fixtures with real-shaped `channel_type` fossils
  (this lane’s Fossil A).
- **Product policy already chosen on fork:** fail-open when kind unknown;
  only proven non-thread ambient may expire; addressed/control/hydrateable
  forms preserved.

### 2) Upstream core — B/C guillotine disposition

- Change `armStallWatchdog` to call `applyFailureDisposition` (or equivalent)
  with a structured stall error, **not** hard-coded terminal `handler-timeout`
  fail.
- Default: release + attempts++ + backoff; terminal only when
  `shouldDeadLetterRetryableIngressEvent` permits → reason
  `retry-limit-exceeded` (or an explicit non-retryable stall reason if product
  wants immediate DLQ — that is a **named policy choice**).
- Flip existing drain tests that lock terminal handler-timeout.
- Upstream issue body should cite openclaw/openclaw#119979 (wedge/drop) and
  distinguish: #119979 is lane wedge + silent drop; B is the disposition owner
  that turns the watchdog into attempts=0 dead-letters; C is the multi-session
  morphology proof.

### 3) Product policy (not code default without owner call)

- Is claim→adoption stall **retryable infrastructure failure** or **terminal
  poison**? Field evidence says terminalizing at attempts=0 burns live Discord
  messages. Recommend retryable default aligned with throw-path disposition.
- Freshness TTL / coalescing for ambient backlog is Discord (or channel-owner)
  product policy; core only supplies the pending-disposition seam (already
  present since `2b2019202ff`).
- #122466’s `deadLetterMinAgeMs: 0` retry floor does **not** govern the
  guillotine path (bypass) — fleet report §10 falsifies that narrative for
  attempts=0 handler-timeout rows.

## Is #1229 sufficient?

**Yes as the fork umbrella** for stale durable-ingress / freshness / recovery
starvation on Discord seats. Keep it; do not open a duplicate fork issue.

Still needed upstream (drafts below):

- Core guillotine disposition issue (B/C) — may extend #119979 or be a sibling
  linked from it.
- #121204 must not merge until Fossil A is green on real `channel_type` payloads.

## Draft comment for fork #1229

```markdown
### Test-fossil receipts (no production fix in this note)

Branch `codeagent/ingress-admission-test-fossil-historical-walk-r2` @ `e1ec70fa07d`
adds desired-contract fossils only:

- **A** `extensions/discord/src/monitor/ingress-admission-fossil.channel-type.test.ts`
  — `channel_type: 0`, no `channel` object. **RED** on composite: stale ambient
  still dispatches because `canExpireDiscordStaleAmbientBacklog` reads
  `rawMessage.channel` only.
- **B/C** `src/channels/message/ingress-drain.admission-fossil.test.ts`
  — stall watchdog **RED**: terminal `handler-timeout` at `attempts=0`, bypassing
  `resolveIngressFailureDisposition`. Session B isolation + `dispose` recovery
  **GREEN**; post-watchdog retryable release **RED**.

First-bad:
- A: `2b2019202ff` (fence intro, wrong field)
- B: `fc6b9dad0b1` (drain intro; still true through LOC split `ee3d084048d` and
  current `upstream/main`)

#121204 head still carries the inert fence. #122466 retry-policy tweak does not
own the guillotine path. Fuller Discord `channel_type`/`channelKind` cure exists
off-composite at `30613c7217c` (`codeagent/wo1229-p1p2-fix`) — not absorbed here.

No issue close from this lane.
```

## Draft upstream issue (B/C)

```markdown
### Bug type
Behavior bug (incorrect output/state without crash)

### Summary
Durable channel ingress pre-adoption stall watchdog dead-letters claims with
`reason=handler-timeout` at `attempts=0`, bypassing `resolveIngressFailureDisposition`.
Retry/dead-letter policy and Discord `deadLetterMinAgeMs` overrides never run on
this path. Same-lane work is blocked for the full adoption stall window; unrelated
lanes continue. Restart clears process-local ownership and can replay/destroy
backlog depending on durable row state.

### Related
- openclaw/openclaw#119979 (lane wedge / silent drop during pre-adoption failure)
- karmaterminal/openclaw#1229 (fork umbrella: freshness + recovery backlog)
- Does **not** fix via channel retryPolicy alone (see open PR #122466 narrative)

### Expected
Stall failures use the canonical ingress failure disposition: release + attempts
+ backoff unless configured policy permits terminal dead-letter.

### Actual
`armStallWatchdog` → `failClaim(..., "handler-timeout")` directly
(`src/channels/message/ingress-drain.ts`). Fossils on
`codeagent/ingress-admission-test-fossil-historical-walk-r2` encode the desired
contract and fail on current mainline drain behavior. First introduced in
`fc6b9dad0b1`; unchanged by module split `ee3d084048d`.

### Owner
Core `src/channels/message/ingress-drain.ts` (+ flip contract tests that currently
require terminal handler-timeout).
```

## Validation

### Focused

```bash
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 \
  extensions/discord/src/monitor/ingress-admission-fossil.channel-type.test.ts
# → 1 failed (A RED)

node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 \
  src/channels/message/ingress-drain.admission-fossil.test.ts
# → 4 failed, 1 passed (B/C RED + dispose GREEN)

# Controls (non-fossil owner surfaces)
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 \
  src/channels/message/ingress-drain.test.ts \
  src/channels/message/ingress-drain.freshness.test.ts \
  src/channels/message/ingress-drain-pending-disposition.test.ts
# → 37/37 passed

node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 \
  extensions/discord/src/monitor/ingress-stale-direct-config.test.ts \
  extensions/discord/src/monitor/ingress.test.ts
# → 39/39 passed
```

### Full suite

```bash
node --import tsx scripts/test-projects.mts
# log: /tmp/fossil-full-suite.log
```

**Tally:** `failed 322 Vitest shards in 1791.08s` (runner digest; per-shard
summaries are not aggregate test totals). Wall ~30m on this worktree.

**Fossil-attributable (intentional RED on this branch):**

| Shard | Fossil file | Result in full suite log |
| --- | --- | --- |
| `vitest.channels.config.ts` | `ingress-drain.admission-fossil.test.ts` | 5 tests / **4 failed** / 1 passed |
| `vitest.extension-discord.config.ts` | `ingress-admission-fossil.channel-type.test.ts` | 1 test / **1 failed** |

**Non-fossil owner controls (focused, pre full-suite):** channels drain+freshness+pending
37/37 green; discord ingress+stale-direct 39/39 green.

**Other full-suite reds:** large unrelated set (telegram webhook timeouts/500s,
qa scenario-catalog, gateway-server, ui, agents-*, memory, extensions, …). These
are **not** explained by the two test-only fossil files. Treat as worktree /
composite baseline + resource contention until a clean detached
`origin/main` / absorbed-upstream control is run. **Do not** land production
“fixes” for them from this lane.

### Fossil matrix (this HEAD)

| ID | File | Tests | Verdict on composite |
| --- | --- | --- | --- |
| A | `ingress-admission-fossil.channel-type.test.ts` | 1 | RED |
| B | `ingress-drain.admission-fossil.test.ts` (describe B) | 2 | RED / RED |
| C | same file (describe C) | 3 | RED / RED / GREEN (dispose) |

**Verdict:** fossils deliver deterministic A/B/C reproduction; first-bad SHAs
identified; no production change. Full-suite non-zero is expected (intentional
fossil RED + unrelated baseline reds).

## Uncertainties

1. Full-suite unrelated reds on this worktree may match fork/main baseline —
   classify against absorbed upstream `ff73a14f5ae` / `origin/main` before
   attributing to fossils (fossils are 5 intentional RED + 1 GREEN).
2. Did not execute fossils on detached `30613c7217c` tree (production cure not
   in composite); PASS there is by code inspection of `channel_type`/`channelKind`
   path, not a live run in this lane.
3. GitNexus index unavailable; graph is source-derived.
4. `FOLLOWUP_QUEUES` identity bugs are a sibling surface; not required to repro
   A/B/C fossils.
5. No production fix, no PR, no issue mutation per workorder.

## Required answers (checklist)

| Question | Answer |
| --- | --- |
| Deterministic repro A/B/C? | **Yes** (C partial on public APIs; dispose/B isolation green) |
| Which test fails first at which commit? | **B at `fc6b9dad0b1`; A at `2b2019202ff`; C terminal path tracks B** |
| Leak = stuck ownership value or never-settling await? | **Never-settling await during window; after watchdog, process-local cleared; durable terminal fail attempts=0** |
| Owners of acquire/adopt/timeout/release/cleanup? | **See ownership map** |
| LOC refactor role? | **Did not introduce B; moved helpers / deferred occupancy only** |
| #1229 sufficient? Upstream body? | **Yes umbrella; draft B/C upstream issue above; fix #121204 field** |
| Fix ownership split? | **A→Discord/#121204 (+30613c lineage); B/C→upstream core; policy→stall retryable default** |
