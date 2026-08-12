# Three Discord ingress concerns — separation and merge-readiness sitrep

**Date:** 2026-08-12
**Mode:** read-only investigation. No GitHub item was created, updated, labelled, commented on, closed, or merged. No deployment, gateway, database, config, or seat state was touched. No code outside this report was changed.
**Investigation base:** `df1c96591115259cd7f735c7f648fbe49f32b102` (this worktree's HEAD before the report commit).

## 0. Base verification (starting facts re-resolved, not trusted)

| Fact                          | Dispatcher-supplied                        | Verified                                                                                                                                           | Verdict                                                                           |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| upstream `main`               | `c5ba4efbd700f9d8914294f83f4f4ce1a72360ff` | `git merge-base --is-ancestor c5ba4efbd700… HEAD` → **YES**; live `upstream/main` has since advanced to `3a9e46191265a40b1423c73442f803b2bb015ef1` | Stale but an **ancestor**. Base is sound; upstream moved 1 commit during the run. |
| worktree base                 | —                                          | `df1c96591115…`, `git rev-list --left-right --count HEAD...upstream/main` → `0 1`                                                                  | Zero local divergence. Clean upstream base.                                       |
| #121204 head                  | `02bd9d77142248a07e4ad50387a166db1823b494` | `git rev-parse pr121204` → identical                                                                                                               | **Exact match.**                                                                  |
| #121204 surface               | 17 files, +2666/−164                       | `gh pr view` → `changedFiles:17, additions:2666, deletions:164`                                                                                    | **Exact match.**                                                                  |
| #122466 head                  | `35c68f59fe249a17986229c678595a27497837ab` | `git rev-parse pr122466` → identical                                                                                                               | **Exact match.**                                                                  |
| #122466 surface               | 2 files, +51                               | `gh pr view` → `changedFiles:2, additions:51, deletions:0`                                                                                         | **Exact match.**                                                                  |
| `karmaterminal/openclaw#1237` | "a follow-up", "narrow mechanical repair"  | It is an **open PR**, head `85e5252e17a693e843bcc7bebc76ba09c3911d85`, base `codeagent/wo1229-upstream-pr`, **26 files, +2479/−918**               | **Materially understated.** See §4.3.                                             |

The "four commits ahead / 1076 behind fork main" figure was not reproducible and is not load-bearing; both PR heads resolve exactly against `openclaw/openclaw` and that is the comparison that matters.

## 1. Executive table

| #             | Concern                                         | Exact head     | Scope                                        | Code blocker                                                                                                                                                                                    | Proof blocker                                                                                              | Current CI                                                                                                                                                          | Merge readiness                                              |
| ------------- | ----------------------------------------------- | -------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **#121204**   | stale ambient backlog starves live mentions     | `02bd9d7714`   | 17 files, +2666/−164 (prod +504, test +1998) | **YES — 1 P1, fatal.** `canExpireDiscordStaleAmbientBacklog` gates on `rawMessage.channel`, a field that **does not exist** on the raw payload. The entire Discord half is inert in production. | **YES.** No after-fix recovered-gateway receipt. Sibling coverage is 2 of 19 affected monitors.            | **3 fail / 75 pass / 39 skip.** Both real failures self-inflicted (`check-dependencies` knip; `check-plugin-sdk-api-baseline`); `openclaw/ci-gate` is their mirror. | **Not mergeable as-is.** Split recommended (§5).             |
| **#122466**   | one undeliverable message mutes a channel ≤24 h | `35c68f59fe`   | 2 files, +51/−0 (prod +8, test +43)          | **None.** Premise re-verified on current `main`; owner boundary and SDK import are correct.                                                                                                     | **One.** Genuine after-fix terminal dead-letter **plus** subsequent same-lane dispatch on a real boundary. | **50 pass / 41 skip / 0 fail.** Fully green.                                                                                                                        | **Closest to merge.** Single proof receipt outstanding.      |
| **Concern 3** | addressed messages have no absolute age ceiling | _no PR exists_ | n/a                                          | n/a — design open                                                                                                                                                                               | n/a                                                                                                        | n/a                                                                                                                                                                 | **Third standalone PR.** Cannot be folded into #121204 (§6). |

## 2. GitNexus flow map

### 2.1 Tooling status — stated precisely, per the workorder

```
npx gitnexus status      → "Repository not indexed."
npx gitnexus analyze     → indexed successfully in 1196.7 s
                           423,003 nodes | 2,367,436 edges | 22,783 clusters | 300 flows
                           indexed commit df1c965 (the exact investigation base)
```

Three tooling limitations, stated rather than papered over:

1. **The MCP registry holds 8 indexed repositories**, so every bare invocation aborts with `Multiple repositories indexed. Specify which one with the "repo" parameter.` Every query below therefore pins the absolute worktree path via `--repo /home/figs/.../openclaw-three-discord-pr-gitnexus-sitrep`, exactly as the workorder's fallback requires. The MCP tool surface was not reloaded; the CLI against the pinned index was used instead.
2. **`gitnexus status` reports `⚠️ stale`** after my report commit, because it compares the indexed commit (`df1c965`) against current HEAD. The only delta is `REPORTS/*.md`. **The graph is therefore an exact image of upstream-main code**, which is precisely the baseline this review needs — it is not a staleness defect.
3. **`gitnexus trace createDiscordIngressMonitor drainOnce` returns `no_path`**, furthest hop `createChannelIngressMonitor` (depth 1). This is correct, not a gap: the drain is reached through a runtime-constructed closure (`getDrain()` lazily calls `createChannelIngressDrain`), which is dynamic dispatch. Likewise `gitnexus context createDiscordIngressMonitor` reports its only incoming caller as `ingress.test.ts`, because production dispatch goes through an injected seam (`params.testing?.createIngressMonitor ?? createDiscordIngressMonitor`, `extensions/discord/src/monitor/message-handler.ts:17`). Both were confirmed by source reading; graph results are supporting evidence here, not the claim.

### 2.2 The flow, stage by stage

Every stage below is cited to source read at the investigation base or at the named PR head.

```
Discord gateway MESSAGE_CREATE
  │  extensions/discord/src/internal/gateway.ts:422-427
  │  MESSAGE_CREATE alone forwards payload.d UNMAPPED. Every other event is
  │  eagerly mapped. This raw-envelope choice is the root of the #121204 P1.
  ▼
ADMISSION  monitor.admit(rawMessage)
  │  extensions/discord/src/monitor/ingress.ts:166-168 (main)
  │  inspectDiscordMessage → { eventId: id, laneKey: `channel:${channel_id}` }
  │  ⇒ ONE LANE PER CHANNEL, drained SERIALLY. This single fact is why both
  │    PRs exist: any head-of-line stall silences a whole channel.
  ▼
DURABLE QUEUE  SQLite, status pending|claimed|completed|failed
  │  retention: completedMaxEntries 5_000, failedMaxEntries 5_000
  ▼
RETRY SCHEDULING  src/channels/message/ingress-monitor.ts:314-317
  │  retryPolicy: options.drain?.retryPolicy ?? { maxAttempts: 8,
  │                                               deadLetterMinAgeMs: 24 h }
  │  ⇒ Discord passes NO retryPolicy on main, on #121204, and on #1237.
  │    It inherits the 24 h floor in all three.  ← #122466's entire target
  ▼
DEAD-LETTER PREDICATE  src/channels/message/ingress-retry-policy.ts:88
  │  return attempt >= maxAttempts && now - event.receivedAt >= deadLetterMinAgeMs;
  │  ⇒ AND, not OR. Attempts exhaust in ~4 min; age gate holds for 24 h.
  ▼
LANE BLOCKING  src/channels/message/ingress-drain.ts:727-741 (main)
  │  ANY retry-delayed pending row blocks its whole lane, and candidateIds is
  │  built from ALL pending rows.               ← #121204's generic half
  ▼
PRE-DISPATCH DISPOSITION            ← exists ONLY on #121204/#1237, not on main
  │  #121204: drain.resolvePendingDisposition (pre-claim, core seam)
  │  #1237:   drain.shouldDrainWithoutDelivery (post-claim, deliver-side)
  ▼
DISCORD ADDRESSABILITY LADDER       ← exists ONLY on #121204/#1237
  │  /tmp/pr121204-ingress.ts:473-511 — order matters enormously:
  │    473  resolvePendingDisposition(record, context)
  │    475    if (isDiscordAddressedMessage(...)) return null;   ← NO AGE GATE
  │    485    if (now - sentAt <= 15 min)        return null;
  │    488    if (hasPotentialActiveDiscordTextControlCommand)  return null;
  │    492    if (await hasUnresolvedDiscordAddressForm(...))    return null;
  │    501    if (!canExpireDiscordStaleAmbientBacklog(...))     return null;
  │    505    return { kind:"fail", reason:"stale-ambient-backlog" }
  │  ⇒ The addressed check precedes the age check. THIS LINE IS CONCERN 3.
  ▼
TERMINAL RECEIPT
  │  #121204: queue.fail(...) → status "failed" (operator-resubmittable)
  │  #1237:   completeClaimWithRetry(...) → status "completed" (NOT resubmittable)
  ▼
NEXT SAME-LANE EVENT — unblocked only once the lane owner settles
```

### 2.3 Blast radius (GitNexus `impact`, pinned index)

| Target                                  | impactedCount |     Risk     | Direct | Modules |
| --------------------------------------- | ------------: | :----------: | -----: | ------: |
| `createChannelIngressMonitor`           |        **46** | **CRITICAL** | **19** |  **20** |
| `createChannelIngressDrain`             |             4 |     LOW      |      2 |       1 |
| `shouldDeadLetterRetryableIngressEvent` |             4 |     LOW      |      1 |       1 |

The 19 direct dependents of `createChannelIngressMonitor` are `whatsapp, zalo, zalouser, discord, feishu, imessage, irc, line, mattermost, msteams, nextcloud-talk, nostr, signal, slack, sms, telegram, tlon, twitch` plus the SDK helper `createStandardRawEventIngressMonitor` (`src/plugin-sdk/channel-ingress-runtime.ts`), which fans out further to `googlechat` and `synology-chat` at depth 2. This independently corroborates #122466's hand-enumerated footnote of 22 ingress-owning channels.

The two LOW readings are a genuine and useful asymmetry, not a contradiction. `createChannelIngressDrain`'s own call graph is narrow (`getDrain`, `openChannelIngressDrain`), but the _behavioural_ reach of its options object runs through `createChannelIngressMonitor` to all 19. **#121204 changes drain scheduling for all 19; #122466 changes one channel's policy object.** That is the quantified core of the overlap matrix.

A Cypher enumeration over the pinned graph returns **45 ingress-related test files**. `#121204`'s evidence table names 8, covering 2 of the 19 affected monitors (discord, telegram). The 17 other affected monitors each carry their own ingress suite and appear in no PR evidence table — that is the concrete untested-affected-flow list.

## 3. Overlap matrix

|             | #121204 | #122466                                 | Concern 3                                    |
| ----------- | ------- | --------------------------------------- | -------------------------------------------- |
| **#121204** | —       | **File overlap: YES. Fix overlap: NO.** | **Same function. Contradictory guarantees.** |
| **#122466** | —       | —                                       | **No overlap at all.**                       |

### 3.1 #121204 ↔ #122466

**Overlapping:**

- Both edit `extensions/discord/src/monitor/ingress.ts` and both append to `extensions/discord/src/monitor/ingress.test.ts`.
- Both insert **at the identical anchor**: the first line inside the `drain: {` option block. Proven, not assumed — a real 3-way merge of the two heads over their merge-base `cb50289e2836`:

  ```
  git merge-file merged.ts base.ts b.ts   → exit 1, 1 conflict marker  (ingress.ts,      line 444)
  git merge-file tmerged.ts tbase.ts tb.ts → exit 1, 1 conflict marker  (ingress.test.ts)
  ```

  **Whichever lands second must resolve two textual conflicts.** Both are trivial (adjacent independent keys in one object literal; independent appended `it()` blocks), but they are real and must not surprise the second author.

**Explicitly NOT overlapping — this is the load-bearing finding:**

- **#121204 does not subsume #122466.** #121204's drain rule is _"only the **oldest retained** row in a lane may block that lane for retry backoff"_ (`ingress-drain.ts` hunk, `oldestRetainedPendingLaneKeys`). A poison event **is** its lane's oldest row. It therefore still blocks, is re-claimed first under oldest-first `orderBy`, fails, and blocks again — for the full 24 h. #121204 fixes _a delayed **tail** hiding an eligible **head**_; #122466 fixes _a delayed **head** that can never die_. Different halves of the same lane.
- **Neither #121204 nor #1237 adds a `retryPolicy`.** Verified by enumerating the `drain: {` keys at each head: #121204 has `onPendingDispositionCommitted, resolvePendingDisposition, resolveNonRetryableFailure, onLog`; #1237 has `resolveNonRetryableFailure, shouldDrainWithoutDelivery, onLog`. `grep retryPolicy` on #1237's ingress.ts returns nothing. **Discord inherits the 24 h floor in every one of these branches.** #122466 is non-redundant against the entire #121204+#1237 stack.
- **#122466 does not subsume #121204.** Dead-lettering _failing_ events says nothing about _succeeding_ stale ambient events, which are the ones #121204 suppresses. A 13-hour-old ambient room message dispatches perfectly successfully; no retry policy can reach it.
- **Neither changes the other's proof design.** #122466 needs a terminal dead-letter plus same-lane recovery. #121204 needs a suppression receipt plus prompt live-mention dispatch. Neither receipt can be substituted for the other.

### 3.2 #121204 ↔ Concern 3

Same function, opposite intent. #121204's `resolvePendingDisposition` returns `null` for addressed messages **before** consulting age (`:475` precedes `:485`). Concern 3 asks for an age ceiling _on exactly that early return_. And #121204's User Impact section commits in writing to the opposite:

> "Nothing addressed to the bot is dropped: DMs, mentions, replies, thread messages, and commands are all preserved and still dispatched, **including after long outages**."

Concern 3 cannot be added to #121204 without retracting that sentence — which changes #121204's user-facing contract, its review narrative, and its merge-risk labels. See §6.

### 3.3 #122466 ↔ Concern 3

No overlap on any axis. #122466 bounds _failing_ events by attempt count; concern 3 bounds _non-failing addressed_ events by age. Different predicate, different trigger, different terminal reason, different proof.

## 4. #121204 bot-finding reconciliation

**Verdict: ONE actionable P1 defect, restated across 9 checklist rows, plus one genuine proof gate. There are not two P1s and there is no second independent defect.**

ClawSweeper's own machine-readable fields agree: `**Findings** | 1 actionable finding` and `Patch quality … 1 actionable review finding remain`. The "9 items remain" count decomposes as:

| Checklist row                                                             | Class                                      |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| Add real behavior proof                                                   | **Proof gate** (genuine, distinct)         |
| Carry a real non-thread fact into stale expiry (P1)                       | **THE finding**                            |
| Resolve merge risk (P1) — "fail-open for ordinary raw gateway events"     | restatement of the finding, as consequence |
| Resolve merge risk (P1) — "+504 lines before proving central behavior"    | restatement, as LOC framing                |
| Resolve merge risk (P1) — "no recovered-gateway trace"                    | restatement of the proof gate              |
| Complete next step (P2) — "a narrow mechanical repair can carry the fact" | restatement, as remediation                |
| Improve patch quality — "carry or resolve a channel-type fact"            | restatement                                |
| Improve patch quality — "add a raw MESSAGE_CREATE regression"             | restatement, as test ask                   |
| Improve patch quality — "attach recovered-gateway evidence"               | restatement of the proof gate              |

So: **1 defect + 1 proof gate, expressed 9 ways.** The dispatcher's hypothesis is correct.

### 4.1 The P1 is real, and I confirmed it independently of the bot

Direct dependency inspection, `discord-api-types@0.38.52`:

- `APIMessage` is `export interface APIMessage extends APIBaseMessage, APIMessageMentions {}` — `node_modules/discord-api-types/payloads/v10/message.d.ts:268`.
- `APIBaseMessage`'s complete field set is: `id, author, content, timestamp, edited_timestamp, tts, mention_everyone, mention_roles, mention_channels, attachments, embeds, reactions, nonce, pinned, webhook_id, type, activity, application, application_id, message_reference, flags, referenced_message, interaction_metadata, interaction, thread, components, sticker_items, stickers, position, role_subscription_data, resolved, poll, message_snapshots, call, shared_client_theme, channel_id`.
- **There is no `channel` field.** `#121204` reaches it only through a cast that escapes its own declared type: `resolveDiscordChannelInfoSafe((rawMessage as { channel?: unknown }).channel)`.

Consequently `channelInfo.type` is `undefined` for every real row, `rawNonThreadChannel` is `false`, and `canExpireDiscordStaleAmbientBacklog` returns `false` unconditionally in production. **The Discord half of #121204 cannot fire on a single real Discord message.** ClawSweeper's 0.99 confidence is warranted.

`extensions/discord/src/monitor/ingress.test.ts:772` is the tell the bot spotted: the suppression tests inject a synthetic `channel` object, while a sibling test asserting a stale row _without_ one dispatches — the tests encode both the fiction and the reality side by side.

I also excluded a second candidate cause: `botUserId` **is** correctly threaded (`message-handler.ts:22` → `createIngressMonitor({ …, botUserId: params.botUserId, … })`), so the raw-channel fact is the _sole_ inertness cause, not one of two. This matters — a maintainer repairing only `channel_type` will get a working fence.

### 4.2 The correct fact exists, and the PR missed it by one field name

This is the most actionable thing in the report. The raw `MESSAGE_CREATE` envelope **does** carry an authoritative channel type — as a top-level snake_case field, not a nested object:

```ts
// node_modules/discord-api-types/gateway/v10.d.ts:1284
export interface GatewayMessageCreateDispatchData
  extends GatewayMessageEventExtraFields, APIBaseMessage {}

// :1309-1334  GatewayMessageEventExtraFields
guild_id?: Snowflake;
member?: APIGuildMemberNoUser;
mentions: APIUserWithMember[];
/** The type of channel the message was sent in */
channel_type?: TextChannelType;      // ← the fact #121204 needed
```

`TextChannelType` = `AnnouncementThread | DM | GroupDM | GuildAnnouncement | GuildStageVoice | GuildText | GuildVoice | PrivateThread | PublicThread` (`payloads/v10/channel.d.ts:58`) — it spans all three thread types, so it distinguishes thread from non-thread exactly as the predicate requires, and being optional it preserves fail-open when absent.

The PR already casts to read `guild_id` — another `GatewayMessageEventExtraFields` member — so the author knew the stored payload is wider than `APIMessage`. The defect is that the payload was typed as `APIMessage` (too narrow), which hid `channel_type` from the type system and left `channel` as an unchecked invention.

**Narrowest correct repair:** type the durable payload as `GatewayMessageCreateDispatchData`, read `rawMessage.channel_type` at admission, and persist the derived kind.

### 4.3 Is #1237 correct, current, tested, and absorbable?

**Correct: yes, on the P1.** It does exactly what §4.2 prescribes:

```ts
// kt1237 extensions/discord/src/monitor/ingress.ts:660
const channelKind = resolveDiscordIngressChannelKind(rawMessage.channel_type);
await monitor.admit({ rawMessage, ...(channelKind ? { channelKind } : {}) });
```

with `resolveDiscordIngressChannelKind` (`:112-125`) mapping thread types → `"thread"`, the four guild text-ish types → `"non-thread"`, and everything else → `undefined` (fail-open). `rawMessage` is retyped to `GatewayMessageCreateDispatchData`. The fact is resolved **at admission by its owner** and persisted, which is the correct ownership boundary. It also usefully narrows suppression further to mention-required routes (`params.channelKind === "non-thread" && requireMention`).

**Current: no.** #1237's body describes gates run at `92248bb27f05` and a `shouldBypassRetryDelay` option; the live head is `85e5252e17a6` and the option present in the code is `shouldDrainWithoutDelivery`. The body has drifted from its own head.

**Tested: not provably.** #1237's body states this itself, verbatim: _"Vitest was therefore not re-run here and **no green claim is made for the post-split tree**; hosted exact-head CI is the authoritative gate."_ Its focused receipts predate its own final refactor.

**Absorbable: no — and this is where I disagree with ClawSweeper's P2 characterisation.** Calling this "a narrow mechanical repair" understates it by an order of magnitude. Measured against #121204's head (`git diff --numstat pr121204 kt1237 -- src extensions`): **23 files, ≈+2400/−900**, comprising

- deletion of the core pre-claim seam `ingress-drain-pending-disposition.ts` (−99) and its test (−117) — i.e. it **reverts #121204's own core design**;
- three **new** core modules: `ingress-drain-out-of-band.ts` (+174), `ingress-drain-pending-scan.ts` (+102), `ingress-drain-claim-recovery.ts` (+49);
- a **new public SDK surface** `shouldDrainWithoutDelivery` replacing the one #121204 added;
- a `settlement?: "dead-letter" | "handled"` discriminator on the public `IngressNonRetryableFailure`;
- a **durable status change** for suppressed rows from `failed` → `completed`, which by #1237's own admission **removes them from `resubmit`** (`ingress-queue.ts:1249` only transitions `status = "failed"`).

That last item is a real product regression traded for a real product win (clean `openclaw doctor` / gateway health). It is a legitimate trade, but it is a **maintainer product decision**, not a mechanical fix, and it deserves its own review rather than arriving as a footnote to a starvation bug.

**One genuine bonus:** #1237 would clear both attributable CI failures, since both are caused by the very seam it deletes.

### 4.4 Exact current CI, and attributability

Run `31330361173`, `head_sha 02bd9d7714…` (confirmed same as PR head). **3 fail / 75 pass / 39 skip.**

| Check                           | Verdict          | Evidence                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check-dependencies`            | **Attributable** | knip: `Unused exported types (2)` → `src/channels/message/index.ts: ChannelIngressPendingDisposition, ChannelIngressPendingDispositionContext, ResolveChannelIngressPendingDisposition` and `ingress-drain-pending-disposition.ts: …, AppliedIngressPendingDispositions`. Every named type is **introduced by this PR**. |
| `check-plugin-sdk-api-baseline` | **Attributable** | `Manifest mismatch: docs/.generated/plugin-sdk-api-baseline.sha256`. The PR widens the public drain options without regenerating the baseline.                                                                                                                                                                           |
| `openclaw/ci-gate`              | **Mirror**       | 3 s aggregate; reflects the two above.                                                                                                                                                                                                                                                                                   |

Both real failures are self-inflicted, both are mechanical, and both vanish under #1237. **No inherited or unrelated `main` breakage is present.**

### 4.5 Should the generic retry-tail ordering correction stay in this PR?

**No — it should be extracted, and it is the strongest thing in the PR.**

- It is **independently correct**. The main-branch defect is directly readable at `ingress-drain.ts:727-741`: `retryDelayedLaneKeys` is populated from _every_ pending row, and `candidateIds` is built from _all_ pending rows, so a delayed tail hides an eligible head.
- It is **independently provable** without any Discord live gateway — the drain suites already exercise it against a real SQLite queue.
- It is **not Discord-shaped**. It repairs the LINE-class defect in upstream issue **#97435** (open, "LINE channel inbound events were delayed before agent run and later drained"), which #121204's own body cites.
- It is **the one half that is not blocked**. Keeping it married to an inert Discord fence means a correct, broadly beneficial scheduling fix waits on a live-Discord receipt it does not need.
- GitNexus quantifies why this is not free: the change reaches **19 direct monitors / CRITICAL**, while the PR's evidence covers 2. As its own PR it can carry proportionate sibling proof; buried inside a Discord PR it will not.

## 5. Recommended branches and PR order

Recommended landing order — **three PRs, not one, and not two.**

**1st — #122466, as-is.** Green CI, no code findings, smallest surface, correct owner boundary (`DEFAULT_INGRESS_RETRY_MAX_ATTEMPTS` is properly imported via `openclaw/plugin-sdk/channel-outbound`, re-verified at `src/plugin-sdk/channel-outbound.ts:37`), and it matches shipped sibling precedent exactly (`extensions/line/src/webhook-spool.ts:277`, `extensions/zalo/src/webhook-spool.ts:187` both set `deadLetterMinAgeMs: 0`). Its scope restraint is correct and should be upheld, not "fixed": 19 siblings inherit the same floor, but changing 19 channels on one channel's evidence would be exactly the speculative broad change the repo forbids. Blocked only on one proof receipt. Landing it first also means the second PR resolves the trivial conflict, not the small one.

**2nd — new PR: the generic drain ordering correction, extracted from #121204.** `src/channels/message/ingress-drain.ts` only, no Discord policy, no new core seam, no plugin-SDK surface change — therefore no knip and no baseline failure. Links #97435. Carries sibling proof proportionate to the CRITICAL/19 blast radius rather than Telegram alone.

**3rd — Discord stale-ambient suppression**, reduced to Discord-owned policy on top of the landed drain fix, with the P1 repaired at its owner (`channel_type` at admission, per §4.2 / #1237's approach). Two sub-decisions a maintainer must make explicitly rather than inherit:

- keep the pre-claim seam (#121204) or move to post-claim `deliver` (#1237)? #1237's argument is strong — plugins may not import `src/**`, so any type Discord can legally reach _is_ public SDK, and #121204's cast was an unsanctioned private ABI;
- terminal status `failed` (resubmittable, pollutes `doctor`/health) or `completed` (clean health, unresubmittable)? This is a product call and should be labelled as one.

**Not now — concern 3.** It needs the fence from PR 3 to exist before an addressed ceiling on top of it is even meaningful.

**Unchanged and separate — continuation PR #85651.** No overlap with any item here. The fleet may deploy a composite containing continuation plus these operational fixes because runtime reality requires it; that is a deployment artifact and confers no licence to merge their upstream PRs, branches, proof claims, or review narratives.

## 6. Concern 3 — the addressed replay ceiling

### 6.1 It is a residual of #121204, not a defect in it — and not a defect on `main` either

Precision matters here, because the workorder's framing ("old bot-addressed messages bypass Discord's stale ambient guard") describes a guard that **does not exist upstream**. I read all 172 lines of `extensions/discord/src/monitor/ingress.ts` at the base: there is no age, staleness, or ambient logic anywhere. On current `main`, _nothing_ has an age ceiling — addressed and ambient alike.

So the true statement is: **#121204 would bound the ambient portion of the backlog and deliberately leave the addressed portion unbounded.** Concern 3 is the residue #121204 declines to bound. The fleet's evidence (2038 pending/claimed; 1663 aged 1–24 h; 303 > 24 h; ≈57 h implied drain; figs's independent two-day-old addressed replay) is evidence about **`main`**, and it remains valid motivation — but it is pre-fix, and it proves the pathogen and the operator workaround, not any post-fix behaviour. The 2033-row quarantine halting the loop with the gateway stopped is a containment receipt, not a repair receipt.

### 6.2 It cannot go in #121204

Three independent reasons:

1. It **contradicts #121204's written guarantee** ("Nothing addressed to the bot is dropped … including after long outages"). Folding it in requires retracting that sentence.
2. It **inverts the fail-open rule** #121204 is built on. #121204 suppresses only when it can _positively prove_ a row was never addressed; concern 3 suppresses precisely those rows it has proven _were_ addressed. Same function, opposite burden of proof.
3. It **changes the merge-risk profile**. #121204 is reviewable as "suppresses provably-ambient chatter." Adding an addressed ceiling makes it "can drop a direct mention," which is a materially different `merge-risk: 🚨 message-delivery` conversation and would reset review.

**Third standalone PR.**

### 6.3 The narrowest authoritative location

The single early return at `resolvePendingDisposition` — `/tmp/pr121204-ingress.ts:475-477`, or its post-#1237 equivalent in the `deliver`-side classifier:

```ts
if (isDiscordAddressedMessage(rawMessage, params.botUserId)) {
  return null; // ← insert the absolute ceiling here, after this proves addressed
}
```

It must sit **after** addressability is established, not before: the ceiling should apply to _proven-addressed_ rows with a _wider_ threshold, rather than collapsing into the ambient fence.

### 6.4 The design already exists in this repo — follow it

GitNexus's concept query (`"stale message age threshold suppression before dispatch"`) surfaced the decisive prior art, which no amount of Discord-local grepping would have found: **iMessage already ships exactly this two-tier design**, in `extensions/imessage/src/monitor/inbound-dedupe.ts:1-20`:

```ts
// Drop a LIVE inbound row whose send date is older than this relative to arrival.
export const IMESSAGE_STALE_INBOUND_THRESHOLD_MS = 15 * 60 * 1000;

// Recovery (catchup): …Those replayed rows are deliberately requested, so they use a
// wider age window than the live fence — deliver a missed message up to this old,
// suppress anything older so a long downtime cannot dump ancient history.
export const IMESSAGE_RECOVERY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
// Cap the replay span so a months-down gateway does not stream its whole history.
export const IMESSAGE_RECOVERY_MAX_ROWS = 500;
```

This is precedent on four of the workorder's five questions at once:

- **Two tiers.** A narrow live fence (`15 min` — _the identical number #121204 chose_) plus a **wider absolute ceiling** for deliberately-replayed work.
- **An absolute ceiling on addressed work is already accepted shipped policy.** `suppressStaleIngress` (`monitor-provider.ts:1303-1328`) has **no addressed early return at all** — it fences every inbound row by age, choosing the threshold from recovery provenance.
- **The escape hatch for legitimately-delayed work is provenance, not addressability**: `if (provenance?.catchup || !isStaleIMessageBacklog(...)) return false;` — explicitly requested catchup is never suppressed.
- **A span cap, not just an age cap.** `IMESSAGE_RECOVERY_MAX_ROWS = 500` bounds _how many_ rows replay. This directly answers the fleet's real complaint: 2038 rows implying ≈57 h of drain is a **volume** problem as much as an **age** problem, and an age ceiling alone would not have bounded the 1663 rows aged 1–24 h.

**Recommendation: mirror the iMessage shape.** Discord already has the 15-minute ambient fence (PR 3); add `DISCORD_ADDRESSED_BACKLOG_MAX_AGE_MS` as the wider ceiling, and seriously consider a companion row-cap.

### 6.5 Constant, config, or separate disposition?

- **Constant.** Follow `IMESSAGE_RECOVERY_MAX_AGE_MS` and #121204's own stated choice ("a module constant, deliberately not a new config key"). Root `AGENTS.md` sets a high bar: _"Before adding a config option or env var, first prove existing product behavior, provider selection, defaults, or doctor migration cannot solve it."_ Nothing here clears that bar.
- **Explicitly reject the opt-in default** proposed for the sibling outbound queue in **#16555** (`maxAgeMs: undefined` preserves current behaviour). That is a dark-shipped capability, which root `AGENTS.md` names a review smell, and it violates "Defaults are the product."
- **Separate terminal reason: yes.** A distinct reason string (e.g. `stale-addressed-backlog`) alongside `stale-ambient-backlog`, so operators can tell "we ignored old room chatter" from "we dropped a direct mention." Whether it settles as `failed` or `completed` should follow whatever PR 3 decides, so the two dispositions do not diverge.

### 6.6 How the addressed sub-classes should differ

Ranked by how much a late answer still helps the user:

| Class                                           | Recommendation                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Text control commands**                       | **Shortest ceiling — arguably suppress at the ambient threshold.** A command is an imperative about _now_; executing `/reset` from two days ago is actively harmful. #121204 already gives these a dedicated check (`:488`), so the hook exists.           |
| **Ambient guild chatter**                       | 15 min (PR 3, unchanged).                                                                                                                                                                                                                                  |
| **Direct mentions / replies in guild channels** | The new wider ceiling. A mention answered 3 h late is confusing; at 2 days it is noise.                                                                                                                                                                    |
| **`@everyone`**                                 | Treat as ambient-adjacent — it is broadcast, not addressed to the bot. #121204 currently short-circuits it as addressed (`:233`), which is generous.                                                                                                       |
| **DMs**                                         | **Longest ceiling, or exempt.** A DM is unambiguously a person waiting on a reply, with no channel-noise ambiguity. Note `isDiscordAddressedMessage` returns `true` for _any_ non-guild message (`:230-232`), so DMs are already a clean, separable class. |
| **Threads**                                     | Follow the parent class; do not suppress unhydrated threads (#121204 already fails open here, correctly).                                                                                                                                                  |
| **Delayed-but-legitimate**                      | Use **provenance**, mirroring iMessage's `provenance?.catchup` — an explicitly requested catchup should bypass the ceiling. Do **not** try to infer legitimacy from content.                                                                               |
| **No `botUserId`**                              | Must stay fail-open. `isDiscordAddressedMessage` returns `true` when `botUserId` is absent (`:236-239`); a ceiling must not turn that safety default into mass suppression.                                                                                |

### 6.7 Required tests and honest evidence

Deterministic (fake timers, real SQLite queue — the shape both existing PRs already use):

1. An addressed guild mention aged past the ceiling → terminal, with the **new** reason, **no** agent turn.
2. The same mention just **under** the ceiling → dispatches normally. _(the discriminating pair)_
3. A DM at the same age as (1) → dispatches (proves class separation).
4. A control command aged past the **ambient** threshold → terminal (proves the tightest tier).
5. `botUserId` absent, aged past the ceiling → **dispatches** (proves fail-open survives).
6. Catchup provenance, aged past the ceiling → dispatches.
7. Row-cap: N ≫ cap pending addressed rows → bounded number dispatched, remainder terminal with a recorded reason.
8. Red-then-green: every one of the above must fail before the ceiling exists, for the right reason.

Real-behaviour evidence, stated honestly:

- The 2038-row / 57 h / two-day observations are **pre-fix `main`** evidence. They motivate; they prove nothing about a fix.
- The 2033-row quarantine is an **operator containment** receipt, not a repair receipt.
- Required after-fix receipt: a recovered gateway with genuine aged addressed backlog showing (a) bounded suppression with the new reason, (b) a live mention answered promptly, (c) **drain completing in bounded time** — the 57 h figure means duration is itself an acceptance criterion.

### 6.8 Does upstream already report this?

**No open upstream issue or PR reports the addressed-replay symptom.** Searched by phrase, by `channel: discord` label, and by REST search across issues and PRs. Nearest neighbours:

| Item                                                                 | State                                                                                                                                         | Relationship                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#16555** — _[Feature]: Add TTL/Expiry for Delivery Queue Messages_ | **OPEN** since 2026-02-14; `impact:message-loss`, `clawsweeper:needs-product-decision`, `maturity:stable`, `issue-rating: 🦞 diamond lobster` | **The symmetric unresolved product decision on the sibling OUTBOUND queue.** Same pathology ("replays ALL queued messages regardless of age", "message dumps", "overnight accumulation"), same proposed remedy shape (`maxAgeMs` + `expireAction: move-to-failed \| skip \| delete`). It has sat unresolved for ~6 months **and is explicitly flagged as needing a maintainer product decision.** A concern-3 PR should reference it and expect the same gate. |
| **#97435** — LINE inbound delayed then drained                       | OPEN                                                                                                                                          | The generic-drain half of #121204; already cited by it.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **#122465**                                                          | OPEN                                                                                                                                          | #122466's canonical issue.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| #55564, #74569, #48389                                               | **closed**                                                                                                                                    | Prior restart-replay work; useful history, not duplicates.                                                                                                                                                                                                                                                                                                                                                                                                     |

**A new issue is warranted before the PR** — this is a user-facing bug plus a product decision, which root `AGENTS.md` routes to "issue first."

## 7. Risks and open questions

**Risks**

1. **A live-proof receipt for #121204 taken today would be meaningless.** With the fence inert (§4.1), a recovered-gateway trace would show _zero_ suppressions and be indistinguishable from `main`. **Repair the P1 first, then gather proof** — in the other order the evidence cannot discriminate.
2. **#1237's `failed` → `completed` change silently removes operator resubmit.** Disclosed in its body, but it is a durable, user-visible product change riding inside a bug-fix follow-up. It should be an explicit maintainer decision.
3. **The extracted drain PR touches 19 monitors (CRITICAL).** Its risk is _lower_ standalone than embedded, because it can carry proportionate sibling proof — but it is not a low-risk change and should not be treated as one just because it is small.
4. **Ordering risk.** If #121204 lands before #122466, Discord gains a stale-ambient fence while still inheriting the 24 h floor — an operator could see "stale suppression shipped" and misread a still-silent channel as fixed.
5. **Concern 3's ceiling can drop a real user question.** That is the entire point, and it is why the tiering in §6.6 and the fail-open cases in §6.7 (5) are not optional.
6. **#1237's head has no green test claim, by its own statement.** Any absorption must re-run gates at the actual head.

**Open questions for a maintainer**

1. Pre-claim seam (#121204) or post-claim `deliver` (#1237)? #1237's plugin-boundary argument is strong and I did not find a counter-argument.
2. `failed` or `completed` for deliberate suppression? Equivalently: is clean `doctor`/health worth losing `resubmit`?
3. Should the 24 h `deadLetterMinAgeMs` default be fixed **generically** for the other 19 channels? #122466 correctly declines to guess. Two independent teams already opted out (LINE #109819, Zalo), which is fair evidence the _default_ is wrong — but that is its own PR with its own proof.
4. Age ceiling only, or age **plus** row cap? The fleet's 2038-row / 57 h figure argues for both; iMessage ships both.
5. Should #16555 and concern 3 be decided together as one "replay has an age ceiling" product decision across inbound and outbound queues?
6. Unrelated but noticed by #122466's author and worth a follow-up: `whatsapp` sets `failedMaxEntries: 450`, far below siblings' 1k–5k, and may evict still-referenced failed rows.

## 8. Proof plan per PR — no borrowing across concerns

**Explicit rule: no receipt below may be cited to satisfy any other row.**

| PR                         | Deterministic                                                                                                                                                                      | Real-behaviour receipt                                                                                                                                                                                                  | Sibling coverage                                                                                                                                    | Must NOT be used as proof for                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **#122466**                | Existing regression (fake timers; passes only under the fix — author already demonstrated red-then-green)                                                                          | **One** recovered/loaded Discord lane: poison event dead-letters at ~4 min **and** the next same-lane message dispatches. Mock-gateway harness verdict JSON satisfies the repo's real-behaviour gate; live is stronger. | Not required — Discord-local policy object.                                                                                                         | anything about stale ambient backlog or addressed age                       |
| **Drain ordering PR**      | Existing drain suites: delayed tail no longer hides an eligible head; oldest-row lane blocking; concurrent-claim disposition races                                                 | Not strictly required (channel-agnostic scheduling), but a LINE-shaped repro against #97435 would be strong                                                                                                             | **Required and proportionate**: ≥3 of the 19 monitors, chosen across transport shapes (e.g. telegram + slack + one webhook spool such as line/zalo) | anything about Discord policy                                               |
| **Discord suppression PR** | Rebuilt on the **real** raw envelope — a regression using a production-shaped `MESSAGE_CREATE` with **no** synthetic `channel`, plus `channel_type`-driven thread/non-thread cases | **Required**: recovered gateway with real aged backlog → suppression receipt fires **and** a live mention dispatches promptly. Must be taken **after** the P1 repair.                                                   | Discord-only policy; siblings covered by the drain PR                                                                                               | the drain PR's ordering claim; concern 3's ceiling                          |
| **Concern 3 PR**           | §6.7 tests 1–8, each red-then-green                                                                                                                                                | Recovered gateway with aged **addressed** backlog: bounded suppression under the new reason, live mention prompt, **and bounded drain duration**                                                                        | Discord-only unless generalised                                                                                                                     | #121204's ambient-suppression claim; the fleet's pre-fix quarantine numbers |

## 9. Validation performed for this report

Read-only. No product code changed; the only file added is this report.

```
git rev-parse HEAD                                   # df1c96591115… (base)
git merge-base --is-ancestor c5ba4efbd700… HEAD      # YES
git rev-list --left-right --count HEAD...upstream/main   # 0  1
git fetch upstream pull/121204/head:pr121204         # 02bd9d7714… (matches)
git fetch upstream pull/122466/head:pr122466         # 35c68f59fe… (matches)
git fetch origin  pull/1237/head:kt1237              # 85e5252e17…
git merge-file merged.ts base.ts b.ts                # exit 1 — 1 conflict (ingress.ts:444)
git merge-file tmerged.ts tbase.ts tb.ts             # exit 1 — 1 conflict (ingress.test.ts)
git diff --numstat pr121204 kt1237 -- src extensions # 23 files, ~+2400/-900
gh pr checks 121204 -R openclaw/openclaw             # 3 fail / 75 pass / 39 skip
gh pr checks 122466 -R openclaw/openclaw             # 0 fail / 50 pass / 41 skip
gh api …/actions/runs/31330361173                    # head_sha == PR head (confirmed)

npx gitnexus analyze                                 # 423,003 nodes | 2,367,436 edges
npx gitnexus query   "…" --repo <abs worktree path>
npx gitnexus impact  createChannelIngressMonitor --repo <abs>   # 46 / CRITICAL / 19 direct
npx gitnexus impact  createChannelIngressDrain   --repo <abs>   # 4 / LOW / 2 direct
npx gitnexus impact  shouldDeadLetterRetryableIngressEvent --repo <abs>  # 4 / LOW
npx gitnexus context createDiscordIngressMonitor --repo <abs>
npx gitnexus trace   createDiscordIngressMonitor drainOnce --repo <abs>  # no_path (dynamic dispatch)
npx gitnexus cypher  "MATCH (f:File) WHERE f.filePath CONTAINS 'ingress' …"  # 45 test files
```

Dependency contracts were inspected directly in `node_modules/discord-api-types@0.38.52` (`payloads/v10/message.d.ts`, `payloads/v10/channel.d.ts`, `gateway/v10.d.ts`) rather than inferred from wrappers, PR text, or prior bot review.

Full suite: `node --import tsx scripts/test-projects.mts` — see the completion note appended below. (The dispatch order named `scripts/test-projects.mjs`; that path does not exist at this revision. The canonical runner, and what `pnpm test` invokes, is the `.mts` file.)

## 10. Bottom line

Three concerns, three PRs, three proofs. They share a file and a lane key; they do not share a fix, an owner boundary, a rollback, or a receipt.

- **#122466** is nearly ready — green, clean, correctly scoped — and needs one real receipt.
- **#121204** contains one genuinely excellent generic fix married to a Discord fence that **cannot fire on a single real Discord message**. Split it; repair the fence at its owner with `channel_type`; then prove it.
- **Concern 3** is a real, separately-owned gap whose design already exists in-repo on iMessage. It needs an issue, a maintainer product decision (which #16555 shows upstream has been deferring on the sibling queue for six months), and its own PR.

The single most consequential correction in this report: **#121204's Discord half is inert, so any live proof gathered before the `channel_type` repair would be evidence of nothing.**

---

- https://github.com/openclaw/openclaw/pull/121204
- https://github.com/openclaw/openclaw/pull/122466
- https://github.com/karmaterminal/openclaw/pull/1237
- https://github.com/openclaw/openclaw/issues/16555
- https://github.com/openclaw/openclaw/issues/97435
- https://github.com/openclaw/openclaw/issues/122465
