# PR 121204 vs. persistent Silas deadletters — read-only diagnosis

**Lane:** `pr121204-deadletter-persistence` (read-only research; no product code, refs,
branches, services, queues, or rows were modified)
**Research branch:** `codeagent/pr121204-deadletter-persistence`
**Worktree HEAD at start:** `d5e89de9064`
**Live inspection window:** 2026-08-14 22:28Z – 22:39Z

---

## 0. Verdict first

> "PR 121204 is live in `0dec2856`, so why does Silas still show more than 4,600
> failed/deadletter ingress rows?"

**Because 121204 never promised to delete rows — and because ~1,504 of those rows are
121204 *working*, not failing.**

The premise contains a category error. `channel_ingress_events.status = 'failed'` is not a
backlog, a retry set, or an error log. It is the **terminal settlement record** of an ingress
event. PR 121204's entire mechanism for stopping stale ambient backlog is *to create one of
these rows per suppressed message*. A higher failed-row count after the deploy is the
**intended and only possible signature** of the fix operating.

Three independent facts settle it:

1. **`stale-ambient-backlog` = 0 rows before the `0dec` deploy, 1,504 rows after.** Not one
   row of this product reason exists in the 26 days of retained history preceding the deploy.
2. **`operator-drop-stale-backlog` = 2,084 rows, *all* before the deploy, 0 after.** This is
   the operator hand-dropping, on 08-12/08-13, exactly the backlog the code could not drop.
   The operator-palliative reason stops the day the product reason starts.
3. **Pre-121204 the stale fence was structurally incapable of firing** on Discord gateway
   traffic (§2). The 2,084 operator rows are the manual substitute for a dead code path.

So the honest reading is the inverse of the report: **the 4,633 rows are the strongest
available evidence that 121204 is live and effective.** 45.4% of them are operator-palliative
rows that predate it, and the largest product slice is its own designed output.

**Retention is also not broken.** `completed` sits at **exactly 5,000** — pinned to its
configured cap — which is positive proof the prune path runs and evicts. `failed` is at 4,633
with **367 rows of headroom** below its own 5,000 cap and its oldest row at **26.13 days**
against a **30-day TTL**. The population is bounded on two axes and has simply not yet
touched either bound.

**There is a real defect here, but it is neither 121204 nor retention.** `retry-limit-exceeded`
has settled **zero rows in the table's entire history**, while rows reach `attempts` of 80 and
98 against a configured `maxAttempts: 8` — counts the dispatch-failure path is structurally
incapable of producing. That is a **retry-settlement ownership gap** (§5), and it is the correct
follow-up.

---

## 1. Ancestry: what "121204 is live" actually means

| Role | SHA | Committed | Subject |
|---|---|---|---|
| PR 121204 head | `b958ca22efd5e67de16746d1341d6bea7c594847` | 2026-08-13 07:06:36 -0700 | `fix(discord): honor raw channel type for stale ingress` |
| Composite parent (fleet baseline) | `310252733a626568c98071bdaf9ee09dbdf38a88` | 2026-08-11 22:47:34 -0700 | `fix(discord): channel stops responding for up to 24 hours after one undeliverable message` |
| Silas deployed composite | `0dec285645550f6ca4d2da0cb0153ee95acf9f6a` | 2026-08-13 07:33:47 -0700 | `merge: add PR #121204 correction to proof composite` |

```bash
git log -1 --format='%H%nparents:%P' 0dec285645550f6ca4d2da0cb0153ee95acf9f6a
#   parents: 310252733a626568c98071bdaf9ee09dbdf38a88 b958ca22efd5e67de16746d1341d6bea7c594847
git merge-base --is-ancestor b958ca22... 0dec2856...   # YES
git merge-base --is-ancestor 31025273... 0dec2856...   # YES
git merge-base --is-ancestor b958ca22... 31025273...   # NO  (independent lines)
```

`0dec2856` is a genuine two-parent merge, and **both** feature commits are ancestors.

**Content proof (ancestry alone is not enough — a merge can drop a side):**

```bash
git diff --numstat 310252733a626568c98071bdaf9ee09dbdf38a88 0dec285645550f6ca4d2da0cb0153ee95acf9f6a
#   9  9  extensions/discord/src/monitor/ingress-stale-direct-config.test.ts
#   4  2  extensions/discord/src/monitor/ingress.ts
```

The merge-vs-baseline delta is **exactly and only** the 121204 change. The `ingress.ts` hunk in
`0dec` is identical in effect to `b958ca22`'s hunk. Nothing was dropped in the merge.

> **Note on the second parent.** `git diff b958ca22 0dec2856` is ~505 KB across the whole tree.
> That is not content loss; it is the severed-history artifact called out in the workorder —
> `b958ca22` branches from an older upstream line (`c5f098ef`), so the merge carries the entire
> fleet baseline forward relative to it.

### 1a. Which behavior belongs to which parent — this is the crux

The two parents are routinely conflated. They are not the same fix:

| Parent | Change | Effect on failed-row count |
|---|---|---|
| `31025273` | adds `retryPolicy: { maxAttempts: DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS, deadLetterMinAgeMs: 0 }` to the Discord drain | **Increases** dead-lettering *by design* — drops the generic 24-hour dead-letter floor so one poison event cannot block a serial channel lane for a day |
| `b958ca22` (**121204**) | `canExpireDiscordStaleAmbientBacklog` now honors raw `channel_type` | **Increases** `stale-ambient-backlog` settlements — it is what makes the fence able to fire at all |

**Neither commit deletes stored rows. Both commits create more of them.** That is their
purpose. Judging either by "did the failed count go down" inverts the contract.

---

## 2. What 121204 changed, and why it is the direct cause of the new rows

Verified at the deployed SHA (`git show 0dec2856:extensions/discord/src/monitor/ingress.ts`),
`canExpireDiscordStaleAmbientBacklog` (line 262):

```ts
const channelInfo = resolveDiscordChannelInfoSafe((rawMessage as { channel?: unknown }).channel);
const rawChannelType = (rawMessage as { channel_type?: unknown }).channel_type;              // + 121204
const channelType = typeof rawChannelType === "number" ? rawChannelType : channelInfo.type;  // + 121204
...
const rawNonThreadChannel =
  typeof channelType === "number" && !isDiscordThreadChannelType(channelType);
// Stale expiry is a freshness fence, not mention admission. Only raw channel
// type proves this is not an unhydrated thread; direct config can name either.
return rawNonThreadChannel;
```

`channelInfo.type` is sourced **only** from a hydrated `rawMessage.channel` object
(`extensions/discord/src/monitor/channel-access.ts:93-102` →
`resolveDiscordChannelNumberPropertySafe(channel, "type")`). Discord gateway `MESSAGE_CREATE`
payloads do not carry a nested `channel` object.

**Therefore, before 121204:**
`channelInfo.type === undefined` → `typeof undefined === "number"` is `false` →
`rawNonThreadChannel === false` → **the function always returned `false` for real gateway
traffic** → `resolvePendingDisposition` (deployed `ingress.ts:476-515`) always fell through its
`!canExpire...` guard and returned `null` → **no stale event was ever suppressed.**

**After 121204:** `rawMessage.channel_type` is present on gateway payloads → `channelType` is a
number → non-thread channels pass → the disposition returns
`{ kind: "fail", reason: "stale-ambient-backlog", ... }`.

**121204 is the switch that turned the fence on.** Every `stale-ambient-backlog` row on Silas
exists *because* 121204 shipped. The row count going up is the fix's success metric.

---

## 3. Live Silas state (read-only, payload-free)

### 3a. Deployment identity

```bash
ssh silas 'bash -lc "cd /home/figs/flesh_beast_tmp/openclaw && git rev-parse HEAD"'
#   0dec285645550f6ca4d2da0cb0153ee95acf9f6a          <- exact composite
ssh silas 'bash -lc "curl -s http://127.0.0.1:18789/health"'
#   {"ok":true,"status":"live"}   http_code=200
ssh silas 'bash -lc "systemctl --user show openclaw-gateway -p ActiveState,SubState"'
#   ActiveState=active  SubState=running
```

| Fact | Value |
|---|---|
| Runtime root | `/home/figs/flesh_beast_tmp/openclaw` |
| Deployed SHA | `0dec285645550f6ca4d2da0cb0153ee95acf9f6a` |
| `dist/index.js` mtime | 2026-08-13 07:55:23 -0700 |
| `dist/` dir mtime | 2026-08-13 08:00:51 -0700 |
| Health | `200` / `{"ok":true,"status":"live"}` |
| Service | `active (running)`, main start 2026-08-14 13:07:24 PDT |

**Deploy epoch used for all before/after splits:** `1786633251000` ms =
**2026-08-13T15:00:51Z** (the `dist/` directory mtime — the earliest instant the `0dec` build
could have been executing). Journal retention on Silas begins 2026-08-14T08:12:27-07:00, so the
deploy itself is not in-journal; the filesystem + `git rev-parse` pair is the authority.

All reads used `sqlite3 -readonly` against `/home/figs/.openclaw/state/openclaw.sqlite`. No
column containing message content, identifiers, or operator text was selected: `payload_json`,
`metadata_json`, `last_error`, `lane_key`, `event_id`, `claim_owner`, `queue_name` and
`account_id` values were never printed (only aggregated, counted, or rank-ordinalized).

### 3b. Totals by status

| status | rows | note |
|---|---|---|
| `completed` | **5000** | **exactly at the 5,000 cap** — prune provably active |
| `failed` | **4633** | the reported ">4,600" |
| `pending` | 7 → 10 → 6 | small and churning; drains normally (§5) |
| `claimed` | 0 | |

### 3c. Queue / lane cardinality (irreversible counts only)

| distinct queues | distinct accounts | distinct lanes | non-discord rows |
|---|---|---|---|
| 1 | 1 | 7 | **0** |

This matters: prune is scoped **per `queue_name`** (`ingress-queue.ts:1391-1442` @`0dec`,
`.where("queue_name", "=", queueName)`), and `queue_name` is
`JSON.stringify([channelId, accountId])` (`ingress-queue.ts:519-522`). With exactly one queue,
the per-queue caps and the table-wide totals coincide — the 4,633 is one lane's population, not
a sum across channels.

### 3d. Failed rows by reason — the decisive table

| `failed_reason` | rows | class | min/max/avg attempts |
|---|---|---|---|
| `operator-drop-stale-backlog` | 2084 | **operator-palliative** | 0 / 1 / 0.00 |
| `stale-ambient-backlog` | 1504 | **product — 121204's own output** | 0 / 12 / 1.21 |
| `handler-timeout` | 1024 | product — stall watchdog | 0 / 12 / 0.02 |
| `operator-quarantine-session-identity-conflict-backlog` | 18 | **operator-palliative** | 0 / 80 / 5.11 |
| `operator-palliative-replay-stall` | 2 | **operator-palliative** | 8 / 16 / 12.0 |
| `operator-palliative-replay-cycle` | 1 | **operator-palliative** | 9 / 9 / 9.0 |
| `retry-limit-exceeded` | **0** | product — **never once fired** | — |
| **total** | **4633** | | |

**Operator-palliative = 2,105 (45.4%). Product = 2,528 (54.6%).**

Reason strings were classified by source, not by naming convention:

```bash
git grep -l -- '<reason>' 0dec285645550f6ca4d2da0cb0153ee95acf9f6a -- '*.ts' | grep -v '\.test\.ts'
```

| reason | non-test source files @`0dec` | conclusion |
|---|---|---|
| `stale-ambient-backlog` | 1 (`extensions/discord/src/monitor/ingress.ts`) | product-emitted |
| `handler-timeout` | 1 (`src/channels/message/ingress-drain.ts`) | product-emitted |
| `retry-limit-exceeded` | 2 | product-emitted, **0 rows** |
| all four `operator-*` | **0** | **not in the product at all** — written by the palliative owner |

The `operator-*` reasons appear nowhere in the deployed tree. They are injected by
`fleet-replay-palliative-care` (the sanctioned mutating owner). Confirmed **not** a Silas-local
cron job or systemd timer (`cron_jobs`: 8 rows, 0 matching `%palliative%`/`%replay%`/`%fleet%`/
`%ingress%`; `systemctl --user list-timers`: 3 timers, none matching), so it reaches the DB from
outside the gateway — consistent with the operator CLI surface
`openclaw channels dead-letters` (`src/commands/channels/dead-letters.ts`).

### 3e. Before vs. after the `0dec` deploy epoch (`failed_at`)

| `failed_reason` | before `0dec` | after `0dec` | total |
|---|---|---|---|
| `operator-drop-stale-backlog` | **2084** | **0** | 2084 |
| `stale-ambient-backlog` | **0** | **1504** | 1504 |
| `handler-timeout` | 952 | 72 | 1024 |
| `operator-quarantine-session-identity-conflict-backlog` | 0 | 18 | 18 |
| `operator-palliative-replay-stall` | 0 | 2 | 2 |
| `operator-palliative-replay-cycle` | 0 | 1 | 1 |

Splitting on `received_at` instead of `failed_at` yields **identical** numbers — these are not
old rows being re-settled, they are new admissions settling promptly.

This is a clean natural experiment. The operator's manual drop reason and the product's
automatic suppression reason are **perfectly complementary across the deploy boundary**.

### 3f. Failed rows by UTC day

| day | reason | rows |
|---|---|---|
| 2026-07-19 → 2026-08-09 | `handler-timeout` | 91 (spread thin, 1–23/day) |
| 2026-08-10 | `handler-timeout` | 214 |
| 2026-08-11 | `handler-timeout` | 502 |
| 2026-08-12 | `operator-drop-stale-backlog` / `handler-timeout` | 1451 / 124 |
| 2026-08-13 | `stale-ambient-backlog` / `operator-drop-stale-backlog` / `handler-timeout` | **738** / 633 / 62 |
| 2026-08-14 | `stale-ambient-backlog` / `handler-timeout` / `operator-quarantine…` / `…replay-stall` / `…replay-cycle` | **766** / 30 / 18 / 2 / 1 |

Reading: the `handler-timeout` spike (08-10/08-11, peaking at 502) is the failure mode
`31025273` was written for, and it **decays after that fix lands** (124 → 62 → 30).
`operator-drop-stale-backlog` is a two-day manual sweep that **ends** as
`stale-ambient-backlog` **begins** on 08-13.

### 3g. Current production rate — decaying, not sustained

| `failed_reason` | last 1h | last 6h | last 24h | total |
|---|---|---|---|---|
| `stale-ambient-backlog` | **1** | 112 | 828 | 1504 |
| `handler-timeout` | 0 | 0 | 30 | 1024 |
| `operator-quarantine-session-identity-conflict-backlog` | 0 | 0 | 18 | 18 |
| `operator-palliative-replay-stall` | 0 | 2 | 2 | 2 |
| `operator-palliative-replay-cycle` | 0 | 1 | 1 | 1 |
| `operator-drop-stale-backlog` | 0 | 0 | 0 | 2084 |

828 in 24h, 112 in 6h (≈448/24h-equivalent), **1 in the last hour**. The curve is **draining**,
which is the expected profile of a finite stale backlog being consumed once the fence was
switched on — not a defect emitting at a constant rate.

### 3h. Retention headroom

| status | rows | headroom to 5,000 cap | oldest row age | TTL |
|---|---|---|---|---|
| `completed` | 5000 | **0 (at cap, actively evicting)** | 6.08 d | 30 d |
| `failed` | 4633 | **367** | **26.13 d** | 30 d |

`failed` will be bounded within days by whichever bound arrives first: the 30-day TTL begins
evicting the 2026-07-19 rows in **≈3.9 days**, and the 5,000 cap is **367 rows** away.

---

## 4. Retention / GC ownership — "stored" vs. "still replaying"

**Failed rows are terminal and inert. They are stored; they are not replaying.**

*Claim path never sees them.* `listPending` / `claim` filter `.where("status", "=", "pending")`
(`ingress-queue.ts` @`0dec`). A `failed` row is unreachable by the drain.

*Only one `failed → pending` transition exists.* `resubmit`
(`ingress-queue.ts:1249-1299` @`0dec`, guarded `.where("status", "=", "failed")`). Its only
production callers are operator surfaces:
- `src/commands/channels/dead-letters.ts:69-90`
- `src/cli/channels-cli.ts:261,279` — *"Inspect and resubmit failed inbound channel events"*

There is **no automatic resurrection path**. Nothing in the runtime re-drives a failed row.

*A GC path exists and demonstrably runs.*

| Owner | Location @`0dec` | Value |
|---|---|---|
| Retention defaults | `ingress-monitor.ts:124-130` `CHANNEL_INGRESS_RETENTION_DEFAULTS` | `pruneIntervalMs` 1 h, `completedTtlMs`/`failedTtlMs` 30 d, `completedMaxEntries`/`failedMaxEntries` 20 000 |
| Discord override | `extensions/discord/src/monitor/ingress.ts:438-443` | `pruneIntervalMs: 0`, `completedMaxEntries: 5_000`, `failedMaxEntries: 5_000` (TTLs inherited at 30 d) |
| Merge | `ingress-monitor.ts:190-193` | `{ ...DEFAULTS, ...options.retention }` |
| Trigger | `ingress-monitor.ts:462-468` `pruneIfDue` → called at `:506` in `runPump` | `pruneIntervalMs: 0` ⇒ `currentTime - lastPrunedAt < 0` is never true ⇒ **prune on every pump** |
| Pump cadence | `ingress-monitor.ts:724` `setInterval(requestDrain, pollIntervalMs)`; `DISCORD_INGRESS_DRAIN_INTERVAL_MS = 1_000` | **~1 Hz** |
| Executor | `ingress-queue.ts:1341-1444` `prune` | TTL deletes on `failed_at < cutoff`; `pruneMaxEntries("failed", …)` keeps the newest `maxEntries` by `updated_at DESC` in 500-row batches |

`pruneIntervalMs: 0` is **prune-always**, not prune-never. The `completed` count sitting at
**exactly 5,000** is direct runtime proof that `pruneMaxEntries` executes and evicts.

**Conclusion:** there is no retention or compaction defect. Failed-row persistence is a
deliberate, bounded, operator-inspectable dead-letter record — exactly what
`openclaw channels dead-letters` exists to read.

---

## 5. The one genuine defect found — retry settlement, not 121204

**Observation.** `retry-limit-exceeded` has settled **0 rows in the entire retained history**,
despite `31025273` explicitly configuring `deadLetterMinAgeMs: 0` to make that settlement fire
promptly. Meanwhile rows carry `attempts` far beyond `maxAttempts: 8`:

| status | reason settled as | rows with `attempts ≥ 8` | max `attempts` |
|---|---|---|---|
| `completed` | *(n/a — completed)* | 23 | **98** |
| `failed` | `stale-ambient-backlog` | 62 | 12 |
| `failed` | `operator-quarantine-session-identity-conflict-backlog` | 2 | **80** |
| `failed` | `operator-palliative-replay-stall` | 2 | 16 |
| `failed` | `handler-timeout` | 2 | 12 |
| `failed` | `operator-palliative-replay-cycle` | 1 | 9 |
| `failed` | **`retry-limit-exceeded`** | **0** | — |

**The structural argument.** The disposition path *cannot* produce these numbers.
`resolveIngressFailureDisposition` (`ingress-retry-policy.ts:92-121`) evaluates every dispatch
failure: a non-retryable error settles immediately, and otherwise
`shouldDeadLetterRetryableIngressEvent` (`:81-89`) settles as soon as
`attempt >= maxAttempts && now - receivedAt >= deadLetterMinAgeMs`. With Discord's
`maxAttempts: 8` and `deadLetterMinAgeMs: 0` the age term is **always satisfied**, so *any*
dispatch failure at `attempts >= 7` settles the row. **A row therefore cannot exceed ~8 attempts
via dispatch failures at all.** Rows at **80** and **98** attempts prove those increments were
applied by a path that never evaluates the policy.

The call chain is exclusive, verified at the composite SHA
(`git grep -n <symbol> 0dec2856 -- '*.ts' | grep -v '\.test\.ts'`):

| symbol | defined | non-test callers |
|---|---|---|
| `shouldDeadLetterRetryableIngressEvent` | `ingress-retry-policy.ts:81` | **only** `ingress-retry-policy.ts:112` (inside `resolveIngressFailureDisposition`); `plugin-state-test-runtime.ts:32` is a test re-export, not a caller |
| `resolveIngressFailureDisposition` | `ingress-retry-policy.ts:92` | **only** `ingress-drain.ts:332` (inside `applyFailureDisposition`) |
| `applyFailureDisposition` | `ingress-drain.ts:328` | `ingress-drain.ts:481`, `:569`, `:608` — all three dispatch-failure sites |

There is exactly one route to a `retry-limit-exceeded` settlement, and it runs only on dispatch
failure. Every other way a row's `attempts` can advance bypasses the dead-letter decision
entirely.

> **Correction made during this investigation.** An earlier reading argued from "23 completed
> rows carry no `last_error`". That inference is **invalid**: `complete()` explicitly sets
> `last_error: null` and `last_attempt_at: null` (`ingress-queue.ts:1118-1119` @`0dec`), so a
> completed row tells you nothing about how its attempts accrued. The argument above replaces it
> and does not depend on `last_error` at all.

**Owner.** `src/channels/message/ingress-queue.ts:1010-1022` @`0dec` — stale-claim recovery:

```ts
.set((eb) => ({
  status: "pending",
  claim_token: null, claim_owner: null, claimed_at: null,
  attempts: eb("attempts", "+", 1),      // <- consumes retry budget
  last_attempt_at: releaseOptions.releasedAt,
  updated_at: releaseOptions.releasedAt, // <- no last_error, no disposition
}))
```

Reached from `claim()` (`ingress-queue.ts:769`, `recoverStaleClaims({ staleMs })`), so **every
claim sweep** silently increments `attempts` on lease-expired rows. The drain reinforces this
with early returns that skip settlement entirely when a claim was guillotined or superseded
(`ingress-drain.ts:559`, `:595`).

**Two consequences.**

1. **The dead-letter floor is unreachable on this path.**
   `shouldDeadLetterRetryableIngressEvent` (`ingress-retry-policy.ts:81-89`) is only called from
   `resolveIngressFailureDisposition`, which is only called from `applyFailureDisposition`. A row
   that advances via lease recovery is never evaluated, so `maxAttempts: 8` and
   `deadLetterMinAgeMs: 0` have **no effect on it** — the acceleration `31025273` intended is
   inert for exactly the rows that need it most.
2. **Backoff collapses to zero on the same rows.**
   `resolveIngressRetryDelayMs` (`ingress-retry-policy.ts:67-69`) early-returns `0` when
   `!event.lastError`. A lease-recovered row has no `lastError`, so it is re-claimed with **no
   delay** — a tight re-claim spin that inflates `attempts` toward the observed 98.

**Live corroboration (payload-free, sampled 22:29Z → 22:47Z):**

| sample (UTC) | pending | pending max attempts | failed | newest completion | newest settlement |
|---|---|---|---|---|---|
| 22:29 | 7 | 9 | 4633 | 2026-08-14 04:53:07 | 2026-08-14 21:49:46 |
| 22:35 | 8 | 10 | 4633 | 2026-08-14 04:53:07 | 2026-08-14 21:49:46 |
| 22:39 | 10 | 12 | 4633 | 2026-08-14 04:53:07 | 2026-08-14 21:49:46 |
| 22:46 | 6 | 6 | — | 2026-08-14 04:53:07 | — |
| 22:47 | 6 | 6 | **4641** | **2026-08-14 04:53:07** | **2026-08-14 22:45:05** |

**The lane is not wedged.** Between 22:39 and 22:47 the pending burst drained (10 → 6), max
pending attempts fell (12 → 6), and eight rows settled — the newest settlement advanced from
21:49:46 to 22:45:05. All eight settled as `stale-ambient-backlog` (attempts 4–12), i.e. 121204
suppressing stale backlog **live, during this investigation**.

**One anomaly does stand.** `newest_completion_utc` has not moved from **2026-08-14 04:53:07Z**
across every sample — **≈17.9 hours with zero `completed` settlements** while failures continue.
Because `completed` is pinned at its 5,000 cap and prune retains the newest rows by
`updated_at DESC`, `MAX(completed_at)` is a faithful "last successful adoption" clock. This is
*consistent with* a lane whose entire current inflow is ambient and stale (everything correctly
suppressed, nothing to adopt), so it is **not by itself proof of a defect** — but it is the one
signal worth a bounded follow-up check (§8).

The gateway journal over the same window shows a repeating retryable failure class —
`Session … changed while starting work. Retry.` — re-firing on exponential backoff
(≈4 s → 8 s → 16 s → 32 s → 64 s, capping near the 180 s `DEFAULT_INGRESS_RETRY_MAX_MS`).
This is the same failure the operator quarantined 18 rows against under
`operator-quarantine-session-identity-conflict-backlog` (max `attempts` **80**) — rows that
reached 80 attempts precisely because nothing ever settled them automatically.

**This is a session-identity conflict in the message-run path plus a retry-settlement ownership
gap. It is not the stale-ambient fence, and 121204 neither caused it nor promised to prevent
it.** It is, however, the thing actually worth fixing next.

---

## 6. Classification of the 4,633 — exact counts

| Class | Rows | % | Detail |
|---|---|---|---|
| **(a) Historical accumulation 121204 never promised to delete** | **2,105** | 45.4% | All four `operator-*` reasons — operator-palliative rows absent from the product source. 2,084 of them predate the deploy entirely. |
| **(b) Newly generated *expected* stale-suppression disposition** | **1,504** | 32.5% | `stale-ambient-backlog`. 100% post-deploy. This is 121204 functioning; each row is one message correctly suppressed instead of dispatched stale. |
| **(c) Continuing retry/handler defect** | **1,024** | 22.1% | `handler-timeout`. Real product failures — but **declining** (502 → 124 → 62 → 30/day) as `31025273` takes effect, and 93% (952) predate the `0dec` deploy. |
| **(d) Separate retention / compaction defect** | **0** | 0% | None. Retention runs at ~1 Hz; `completed` is pinned exactly at its cap; `failed` has 367 rows of headroom and TTL eviction begins in ≈3.9 days. |
| **(e) Rows still replaying** | **0** | 0% | `failed` is terminal; the only `failed → pending` path is the operator `resubmit` CLI. |

**It is a mixture — but not the mixture implied by the report.** Nearly half is pre-existing
operator palliative care, a third is the fix's own designed output, and the remaining fifth is a
*declining* legacy defect. The genuinely open issue (§5) has produced **zero** of the 4,633 rows
under its own reason, because it never settles them at all.

---

## 7. GitNexus disclosure

Required tracing was attempted first and could not be satisfied by the index. Disclosed per the
workorder, and paired with direct exact-SHA source tracing.

| Index | Commit | Result |
|---|---|---|
| `…/openclaw-three-discord-pr-gitnexus-sitrep` | `df1c965`, indexed 2026-08-12 (**only near-era index**) | **Unreadable.** `LadybugDB unavailable for openclaw-l2hvbw … Trying to read a database file with a different version. Database file version: 42, Current build storage version: 40` |
| `/home/figs/source/openclaw` | `fc337f0`, indexed 2026-05-30 | **Readable but useless here.** Predates the subsystem: `git ls-tree -r fc337f0 -- src/channels/message/` returns **no** `ingress-*` files. `gitnexus context` returns `Symbol '…' not found` for `canExpireDiscordStaleAmbientBacklog`, `shouldDeadLetterRetryableIngressEvent`, `resolveIngressFailureDisposition`, `createChannelIngressQueue`. `gitnexus query` returns only pre-refactor Telegram polling-session symbols. |
| This worktree | `d5e89de9064` | Not indexed. **Indexing it would misrepresent the composite** — `git diff --numstat d5e89de 0dec2856` shows drift of `+370/-2` in `extensions/discord/src/monitor/ingress.ts`, `+59/-38` in `ingress-drain.ts`, `+59/-17` in `ingress-queue.ts`, `+20/-14` in `ingress-monitor.ts`. |

**Compensating method.** Every structural claim in §2, §4, and §5 was re-derived from the
composite tree itself, not from `HEAD`:

```bash
git show 0dec285645550f6ca4d2da0cb0153ee95acf9f6a:src/channels/message/ingress-queue.ts
git show 0dec285645550f6ca4d2da0cb0153ee95acf9f6a:src/channels/message/ingress-drain.ts
git show 0dec285645550f6ca4d2da0cb0153ee95acf9f6a:src/channels/message/ingress-monitor.ts
git show 0dec285645550f6ca4d2da0cb0153ee95acf9f6a:src/channels/message/ingress-retry-policy.ts
git show 0dec285645550f6ca4d2da0cb0153ee95acf9f6a:extensions/discord/src/monitor/ingress.ts
```

`ingress-retry-policy.ts` is byte-identical between `0dec2856` and `HEAD` (`diff -q` → identical);
the other four are not, and all cited line numbers above refer to the `0dec` extracts.

---

## 8. Deployment question

**Does this weaken the case for reconstructing 121204 on the accepted assembly floor?**

**No — it materially strengthens it.** This is the strongest field evidence available that
121204 is load-bearing. The before/after boundary is a clean natural experiment: with the fix
absent, the fence was structurally dead and a human had to hand-drop **2,084** events across two
days; with the fix present, **1,504** events settled automatically and the manual reason stopped
cold. Reconstructing 121204 preserves an operator-labour-eliminating behavior that has no other
implementation in the tree. Dropping it returns Silas to manual backlog drops.

One caveat, stated plainly: this lane has **no reconstruction or branch-movement authority**, and
`b958ca22`'s history is severed from rewritten upstream `main`. The finding here is about
*semantics and present symptoms only* — it says the behavior is worth carrying, not how to carry
it.

**Does it instead identify a separate deadletter-retention follow-up?**

**Not retention — retry settlement.** Retention is healthy and provably active (§4). The correct
follow-up is §5: `attempts` is consumed by stale-claim recovery
(`ingress-queue.ts:1010-1022` @`0dec`) without recording `last_error` or consulting the retry
policy, which (i) makes `retry-limit-exceeded` unreachable on that path — **0 rows ever**, and
(ii) collapses backoff to zero via `ingress-retry-policy.ts:67-69`. The owner-boundary question
worth asking: *should advancing `attempts` and evaluating dead-letter disposition be the same
operation?* Today they are separable, and the 80- and 98-attempt rows in §5 are what that
separation costs.

A second, narrower follow-up: the recurring `Session … changed while starting work. Retry.`
class is currently the fleet's dominant live failure and has already forced one operator
quarantine sweep (18 rows, max `attempts` 80).

**What exact payload-free check should run after the next assembly deploy?**

Record `DEPLOY_MS` at cutover, then run this single read-only statement. It is payload-free,
selects no content column, and answers all four questions at once — is the fence firing, is
retention bounding, is settlement healthy, is the adoption clock advancing:

```bash
ssh silas "sqlite3 -readonly /home/figs/.openclaw/state/openclaw.sqlite" <<SQL
SELECT status, COUNT(*) AS rows FROM channel_ingress_events GROUP BY status;

SELECT COALESCE(failed_reason,'(null)') AS reason,
       SUM(failed_at <  $DEPLOY_MS) AS before_deploy,
       SUM(failed_at >= $DEPLOY_MS) AS after_deploy,
       MAX(attempts) AS max_att
FROM channel_ingress_events WHERE status='failed' GROUP BY reason ORDER BY after_deploy DESC;

SELECT datetime(MAX(completed_at)/1000,'unixepoch') AS newest_completion_utc,
       datetime(MAX(failed_at)/1000,'unixepoch')    AS newest_settlement_utc,
       (SELECT MAX(attempts) FROM channel_ingress_events WHERE status='pending') AS pending_max_att,
       (SELECT COUNT(*)      FROM channel_ingress_events WHERE status='pending') AS pending_rows
FROM channel_ingress_events;
SQL
```

**Pass criteria**

| Signal | Expected | Fails if |
|---|---|---|
| `stale-ambient-backlog`, `after_deploy` | `> 0` | `= 0` ⇒ 121204 behavior **absent** from the build — the single highest-value regression check |
| `operator-*` reasons, `after_deploy` | `= 0` | `> 0` ⇒ palliative care still compensating for a dead code path |
| `completed` rows | `= 5000` | `< 5000` for a busy lane ⇒ prune or pump not running |
| `failed` rows | `≤ 5000` | `> 5000` ⇒ genuine retention defect (none today) |
| `newest_completion_utc` | advances within the hour on a busy lane | many hours stale while settlements continue ⇒ re-check adoption path (**today's open signal**) |
| `pending_max_att` | `< 8` | `≥ 8` ⇒ §5 settlement gap active |
| `retry-limit-exceeded` rows | `> 0` once §5 is fixed | still `0` while rows exceed 8 attempts ⇒ §5 unfixed |

Re-run ~1 h and ~24 h post-deploy; `stale-ambient-backlog` should show a **decaying** rate
(backlog draining), not a flat one.

---

## 9. Risks and uncertainties

1. **No `completed` settlement in ≈17.9 h**, while failures continue and the pending set churns
   normally (§5). The lane is **not** wedged — it drains and settles — but the "last successful
   adoption" clock has not moved since 2026-08-14 04:53:07Z. This is consistent with an all-stale
   inflow being correctly suppressed, so it is a *signal to re-check*, not a proven defect, and it
   is **independent of 121204**. Diagnosis-only here — no mutation was performed, and
   `fleet-replay-palliative-care` remains the sole mutating owner.
2. **Deploy epoch is filesystem-derived.** Journal retention starts 2026-08-14T08:12Z, after the
   08-13 cutover, so `dist/` mtime (2026-08-13 08:00:51 -0700) is the epoch. It is a *lower*
   bound on when `0dec` began running; if the gateway restarted later, the true boundary is
   later still — which only *sharpens* the 0-before/1504-after split, never softens it.
3. **Pre-deploy history is bounded by retention.** The `failed` window starts 2026-07-19 (26.13 d,
   inside the 30-day TTL, and 367 rows below the cap), so no retained row has been evicted yet
   and the "0 `stale-ambient-backlog` before deploy" claim is solid **for the retained window**.
   Rows older than 30 days are gone and cannot be re-examined.
4. **`operator-*` classification is by absence from source**, which is strong but indirect. The
   palliative owner was not located on Silas (no matching cron job or systemd timer), so its
   exact write mechanism is inferred from the operator CLI surface, not observed.
5. **GitNexus could not corroborate** the structural tracing (§7). All structural claims rest on
   exact-SHA `git show` extracts, which is the sanctioned fallback but forgoes independent
   call-graph confirmation.
6. **`channel_type` presence on gateway payloads** is inferred from the fix's own comment plus
   the 0→1504 behavioral step change, not from a captured payload (payload inspection is out of
   bounds for this lane).

---

## 10. Validation

No product code, configuration, GitHub ref, branch, service, queue, database row, or Discord
message was modified. The only branch content added is this `output.md`. All Silas access was
`sqlite3 -readonly`, `curl /health`, `systemctl show/status`, `git rev-parse`, `stat`, and
aggregate-only journal reads. `/tmp/20260814-1400-triage.txt` was not read.

**Full suite** (sanctioned runner; baseline only — this lane changed no code):

```bash
node --import tsx scripts/test-projects.mts     # == pnpm test
```

<!--FULLSUITE-->

**Key commands used**

```bash
# Ancestry + content
git log -1 --format='%H%nparents:%P%ncommitter-date:%ci%nsubject:%s' <sha>
git merge-base --is-ancestor <a> <b>
git diff --numstat 310252733a626568c98071bdaf9ee09dbdf38a88 0dec285645550f6ca4d2da0cb0153ee95acf9f6a
git show 0dec285645550f6ca4d2da0cb0153ee95acf9f6a:<path>
git grep -l -- '<reason>' 0dec285645550f6ca4d2da0cb0153ee95acf9f6a -- '*.ts'

# Deployment identity (read-only)
ssh silas 'bash -lc "cd /home/figs/flesh_beast_tmp/openclaw && git rev-parse HEAD"'
ssh silas 'bash -lc "curl -s http://127.0.0.1:18789/health"'
ssh silas 'bash -lc "systemctl --user show openclaw-gateway -p ActiveState,SubState,ExecMainStartTimestamp"'

# Aggregates (read-only, payload-free; SQL piped over stdin)
ssh silas "sqlite3 -readonly -header -column /home/figs/.openclaw/state/openclaw.sqlite" <<'SQL'
SELECT status, COUNT(*) FROM channel_ingress_events GROUP BY status;
SELECT COALESCE(failed_reason,'(null)'), COUNT(*), MIN(attempts), MAX(attempts)
  FROM channel_ingress_events WHERE status='failed' GROUP BY failed_reason;
SQL

# GitNexus attempts (both disclosed as unusable)
gitnexus query "<q>" --repo /home/figs/source/openclaw
gitnexus context canExpireDiscordStaleAmbientBacklog --repo /home/figs/source/openclaw
```

**Remote shell note.** Silas's login shell is `fish`; every compound remote command was wrapped
in `bash -lc`, and SQL was piped over stdin rather than embedded in nested quotes.

---

## Appendix — supersedes an earlier partial draft

An untracked 64-line draft from an earlier partial run of this same lane was found in the
worktree. It reached the same central inversion (post-deploy `stale-ambient-backlog` is 121204
working; retention is active because `completed` is pinned at 5,000) and is preserved outside
the branch. This document supersedes it, adding: merge-content proof that nothing was dropped
(§1), the mechanism proof for why the pre-121204 fence could never fire (§2), product-vs-operator
reason classification by source presence (§3d), the GitNexus disclosure (§7), the
the retry-settlement defect and live sampling (§5), and the post-deploy verification SQL (§8).
The earlier draft's judgement that this is retained audit history rather than a live lane wedge
is **confirmed** by §5's sampling; what it missed is the retry-settlement gap and the stalled
adoption clock.
