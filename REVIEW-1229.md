# Review 1229 — durable ingress backlog repair

## Root cause

`drainOnce()` treated a retry-delayed pending row as a lane-wide block. A same-channel retry head therefore prevented later eligible rows from being claimed, even when the old row was still inside backoff. Separately, durable ingress had no pre-claim freshness disposition: Discord ambient guild backlog and current addressed work were both just FIFO pending rows in `channel:<id>`, so recovery could admit day-old room events as fresh turns before a current mention.

## GitNexus fork MCP call graph

Parent completed the GitNexus MCP gate against fork-backed repo `openclaw` at `/data/worktrees/oc-1229-gitnexus-slice`, commit `a59a96549b7736613cb86dc846b28d0d82f03295`. I did not use the stock global npm GitNexus and did not rerun whole-repo indexing.

Recorded MCP calls/results:

1. `gitnexus-list_repos()` returned repo `openclaw` with path `/data/worktrees/oc-1229-gitnexus-slice`, lastCommit `a59a96549b7736613cb86dc846b28d0d82f03295`, stats `{files:357,nodes:8921,edges:19006,communities:510,processes:300}`.
2. `gitnexus-context({repo:"openclaw", name:"createDiscordIngressMonitor"})` found `Function:extensions/discord/src/monitor/ingress.ts:createDiscordIngressMonitor`, lines 306-411. Incoming callers in the slice are `extensions/discord/src/monitor/ingress.test.ts`, `expectStaleMessageDispatches`, and `expectStaleMessageFailsAsAmbient`. Upstream impact is LOW and direct impacted count is 3, all tests.
3. `gitnexus-context({repo:"openclaw", name:"resolveDiscordShouldRequireMention"})` found `extensions/discord/src/monitor/allow-list.ts:522-541`, incoming caller `preflightDiscordMessage`, outgoing call `isDiscordAutoThreadOwnedByBot`.
4. `gitnexus-context({repo:"openclaw", name:"resolveDiscordChannelConfig"})` found `extensions/discord/src/monitor/allow-list.ts:458-476`, outgoing calls `resolveDiscordChannelEntryMatch` and `hasConfiguredDiscordChannels`, reads `channels`.
5. `gitnexus-cypher({repo:"openclaw", query:"MATCH (s)-[r:CodeRelation]->(t) WHERE s.name IN ['createDiscordIngressMonitor','resolveDiscordShouldRequireMention','resolveDiscordChannelConfig','preflightDiscordMessage','createDiscordMessageHandler'] RETURN s.name AS from, s.filePath AS fromPath, r.type AS rel, t.name AS to, t.filePath AS toPath LIMIT 200"})` returned the relevant graph: `createDiscordMessageHandler` accesses `createIngressMonitor`; `preflightDiscordMessage` calls `resolveDiscordShouldRequireMention`, `resolveDiscordChannelConfig`, `resolveDiscordPreflightRoute`, `resolveDiscordPreflightChannelContext`, `resolveDiscordPreflightThreadContext`, `resolveDiscordMentionState`, `resolvePreflightMentionRequirement`, `resolveDiscordTextCommandAccess`, and related preflight helpers.

Causal conclusion: the pre-claim monitor has incomplete policy facts relative to canonical preflight. It may only terminally suppress stale ambient rows when it can prove mention-required admission; resolved `requireMention:false` and unproven preflight-only addressability must fail open into canonical dispatch/preflight.

## Chosen method

1. Core drain keeps lane serialization for active/claimed work, but no longer blocks an entire lane just because an older pending row is retry-delayed. Retry-delayed rows are omitted from the current `candidateIds`; later eligible rows can be claimed if no active/claimed owner holds the lane.
2. Core drain exposes a single pre-claim pending disposition hook. It can terminally fail a pending row through the existing queue dead-letter path, preserving payload/metadata/attempts and a reason.
3. Discord uses that hook for a plugin-owned stale ambient fence: guild ambient messages older than 15 minutes are failed as `stale-ambient-backlog`; DMs and bot mentions are preserved. Missing bot identity fails open.

This keeps core plugin-agnostic and records facts where they happen: retry eligibility in core, addressed-vs-ambient in Discord.

## Alternatives rejected

- **Dispatch-time no-op/completion:** avoids model turns but still claims stale rows one at a time, so fresh addressed work remains behind backlog and the red contract stays false.
- **Pending TTL/prune:** deletes rather than audits, applies to addressed and ambient rows alike, and loses operator recovery evidence.
- **Discord-only lane split:** putting addressed messages into a separate lane would let current mentions bypass ambient backlog, but stale ambient rows would still drain as fresh room turns and core retry heads would still impose lane-wide blocking in other channels.

## Production blast radius

Production files changed:

- `src/channels/message/ingress-drain.ts`: generic pending disposition hook and retry eligibility filter.
- `src/channels/message/ingress-drain-pending-disposition.ts`: pre-claim pending disposition helper and public hook types.
- `src/channels/message/ingress-drain-state.ts`: moved the dispatch lifecycle type beside the dispatch result/state contracts.
- `src/channels/message/index.ts`: exports the new disposition types from the channel message barrel.
- `extensions/discord/src/monitor/ingress.ts`: Discord stale ambient policy.
- `extensions/discord/src/monitor/message-handler.ts`: passes `botUserId` to the ingress monitor.

No SQLite schema changes, migrations, config keys, env vars, protocol changes, dependency changes, or live queue mutations.

Production LOC growth is intentional: it adds a durable ownership boundary for pre-claim pending disposition and a Discord-owned ambient freshness policy that cannot be expressed in existing retry, prune, or active-supersede paths.

## Compatibility and operational risks

- Discord stale ambient guild messages older than 15 minutes now become failed ingress rows instead of model turns. That is intentional and auditable, but operators who expected ancient ambient room history to replay as live turns will see dead-letter records instead.
- Bot-mentioned guild messages and DMs are preserved. If bot identity is unavailable, the Discord fence fails open to avoid silently dropping potentially addressed work.
- Configured text-only mention patterns are not resolved in pre-claim ingress because full route/preflight context is unavailable before claim. Those rows are protected when they use real bot mentions/DMs; otherwise this remains the main review caveat.
- Retry-delayed heads no longer serialize the whole lane while in backoff. Active and claimed rows still do, preserving one-at-a-time lane ownership.

## Tests and receipts

Focused drain:

```shell
node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts
# passed: 36 tests
```

Discord ingress:

```shell
node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
# passed: 7 tests
```

Broader ingress owner suite:

```shell
node --no-opt scripts/run-vitest.mjs src/channels/message/ingress-drain.test.ts src/channels/message/ingress-drain-lanes.test.ts src/channels/message/ingress-drain-supersede.test.ts src/channels/message/ingress-monitor.test.ts src/channels/message/ingress-queue.test.ts src/channels/message/ingress-queue.dead-letters.test.ts src/channels/message/ingress-retry-policy.test.ts src/channels/message/ingress-claim-owner.test.ts
# passed: 121 tests
```

Additional check receipts should be appended to `JOURNAL-1229.md` after final lint/type/diff validation.

Final local receipts are recorded in `JOURNAL-1229.md`: focused/broader Vitest suites, production and test typechecks, targeted format, targeted lint, and `git diff --check` passed. The path-scoped `check-changed` wrapper was blocked before repo checks by a Crabbox binary `--version/--help` sanity failure.

## Open objections for reviewers

- Should Discord stale ambient threshold be 15 minutes or a different constant? I chose 15 minutes to match the existing iMessage live stale-backlog fence and because the incident lags were hours.
- Should pre-claim pending disposition support a future `complete` tombstone in addition to `fail`? I kept only `fail` so suppressed backlog is auditable.
- Should route-specific text mention patterns be made available to ingress admission? That would require a larger pre-claim route/policy seam and was rejected for this fix.

## Follow-up review objection

Independent review found one incomplete Discord addressed classifier edge:
preflight already treats `referencedAuthorId === botUserId` as
`reply_to_bot`, but the raw durable-ingress classifier only preserved DMs and
direct mentions. A stale guild reply to the bot could therefore be failed as
`stale-ambient-backlog` before preflight ever saw the reply context.

The follow-up fix keeps the same owner boundary and adds only the raw
`APIMessage.referenced_message.author.id === botUserId` check in
`isDiscordAddressedMessage()`. It does not hydrate routes, evaluate configured
text mention patterns, or add a broader pre-claim policy seam. The new Discord
owner test proves an old explicit reply to the bot dispatches and leaves no
failed stale-ambient row.

I also compared the completed/suppressed tombstone alternative again and kept
the failed dead-letter semantic. Completing suppressed ambient backlog would
make the row look successfully handled, remove it from dead-letter health, and
allow replay without an explicit operator decision. Failed
`stale-ambient-backlog` rows intentionally count in channel ingress
dead-letter health; replay requires an explicit dead-letter resubmit command.

## Second follow-up review objection

The cohort found two more preflight-only addressed forms that the raw
pre-claim classifier could not safely call ambient:

- bound-thread traffic bypasses mention requirements after preflight resolves a
  bound thread and thread channel; and
- configured text mention patterns can set `wasMentioned` without a raw Discord
  user mention.

The chosen fix is design A: fail open at pre-claim for unresolved address
forms. Discord now preserves stale guild rows when the raw row is in a known
bound thread, has cached thread-channel shape, or the runtime config contains
text mention patterns. Those rows proceed to the existing full preflight path.
The existing pre-claim dead-letter remains only for old guild rows with no DM,
direct mention, reply-to-bot, bound/cached-thread ambiguity, or configured text
mention ambiguity.

Design B was rejected for this bounded follow-up. Moving stale suppression
after full preflight would require a larger core lifecycle seam: priority-only
claiming, route-hydrated stale suppression, and a new completed/suppressed
tombstone that does not count as health noise. That would be cleaner for all
ambiguous stale ambient cleanup, but it is broader than needed to avoid the
false terminalization contracts.

Additional blast radius:

- Core drain/queue code is unchanged in this follow-up.
- Discord durable ingress grows only a fail-open classifier before the existing
  stale ambient dead-letter.
- Operators with configured text mention patterns or bound/cached thread rows
  may preserve more old guild backlog for full preflight instead of pre-claim
  dead-lettering it. That is intentional: the pre-claim row cannot prove those
  messages are ambient.
- No SQLite schema, config, env, protocol, migration, route hydration, live
  Discord, runtime queue, PR/issue, deployment, or public comment mutation.

New focused regressions:

- stale bound-thread row is not failed as ambient;
- stale cached thread-channel row is not failed as ambient;
- stale configured text-mention row is not failed as ambient; and
- stale DM remains preserved while existing direct mention, reply-to-bot,
  stale ambient vs fresh addressed, and retry-head bypass contracts stay green.

Validation receipts are recorded in `JOURNAL-1229.md`: focused Discord ingress,
Discord preflight/thread-binding shard, broader core ingress shard, extension
typechecks, targeted format/lint, and diff checks passed after the fixture type
fixes noted there. Closeout autoreview also passed after installing verified
TruffleHog `v3.96.0` into `$HOME/.local/bin`; it reported no
accepted/actionable findings.

## Third follow-up review objection

The latest safety review found that the second follow-up still failed closed on
two preflight-supported address forms:

- full Discord preflight passes account/provider
  `params.discordConfig?.mentionPatterns` into `buildMentionRegexes()`, but the
  monitor received only `cfg` and `threadBindings`; and
- full mention regex construction derives address patterns from the routed
  agent identity name/emoji when no explicit agent/global patterns are set.

Because route hydration and final `effectiveRoute.agentId` are not available
before claim, the safe narrow method is not a second preflight. The monitor now
fails open when raw/pre-claim facts cannot prove a stale guild row is ambient:
it preserves native/raw mentions, replies to the bot, everyone mentions,
bound/cached thread ambiguity, provider-policy-enabled text regex matches,
identity-derived configured-agent name/emoji matches, and audio-only rows that
full preflight may transcribe against configured mention regexes.

Method: pass `discordConfig` from `message-handler.ts` into
`createDiscordIngressMonitor()`, lazily call the public
`buildMentionRegexes()`/`matchesMentionPatterns()` helper with provider policy,
and check all configured agent ids plus the global fallback because the routed
agent id is unavailable pre-claim. Fresh rows skip this lazy mention path by
checking the stale threshold first.

Edge cases covered: provider-level Discord mention policy, identity-derived
agent name, identity-derived emoji, everyone mention, audio-only mention
candidate, DM, direct bot mention, reply-to-bot, bound thread, cached thread,
configured text mention, and stale ambient dead-letter.

Blast radius: more stale guild rows can survive to full preflight when their
addressability is ambiguous. That is intentional and safer than irreversible
pre-claim terminal failure. No core queue/drain, SQLite, config schema, env,
protocol, dependency, or runtime-state mutation changed.

Residual risk: without a larger post-preflight suppression seam, ambiguous old
rows may still be claimed and then dropped by canonical preflight rather than
being pre-claim dead-lettered. That preserves safety but can leave extra
backlog work compared with a future design that records a non-health
suppressed tombstone after full route/preflight facts exist.

Receipts are recorded in `JOURNAL-1229.md`: GitNexus core-slice trace, direct
Discord source/dependency walk, focused Discord ingress regression shard,
focused and broader core ingress suites, prod/test typechecks, format/lint,
diff check, and closeout autoreview.

## Fourth follow-up review objection

The latest changes request found one more preflight-supported bypass form:
Discord text control commands. Canonical preflight imports the public SDK
`hasControlCommand()` detector and `shouldHandleTextCommands()` command-surface
decision, then feeds `allowTextCommands`, `hasControlCommand`, and sender
authorization into mention gating. A stale unmentioned `/status` row could be
an authorized control command, so pre-claim stale suppression must not
terminalize it as ambient before that authorization path runs.

Method: `extensions/discord/src/monitor/ingress.ts` now uses the same public
`openclaw/plugin-sdk/command-detection` and
`openclaw/plugin-sdk/command-surface` exports to recognize potential active
text control commands after the stale-age check and before ambient failure. If
the pre-claim monitor cannot prove command-surface state, it fails open for the
parsed control command and lets canonical preflight decide.

Superseded policy: old unaddressed ambient guild traffic is failed as `stale-ambient-backlog` only when the pre-claim monitor can prove canonical preflight would still require a mention. Resolved `requireMention:false` and unproven address/control forms fail open to full preflight. DMs, direct bot mentions, replies to the bot, everyone mentions, bound/cached thread ambiguity, configured/provider/identity mention matches, audio-only mention candidates, and active text control commands are preserved for full preflight.

Edge cases covered: stale unmentioned `/status` dispatches; unrelated stale
ambient content still fails when an agent identity exists but does not match;
and stale content that would match an identity still fails when Discord
provider mention policy disables that conversation. Existing direct mention,
reply, everyone, bound/cached thread, configured name/emoji, audio-only,
retry-head, active-claim, multi-lane, and dead-letter contracts remain covered.

Blast radius: Discord pre-claim stale suppression preserves one more class of
ambiguous rows for full preflight. Core drain/queue, SQLite schema, config
shape, env vars, protocol, dependencies, live Discord state, runtime queues,
PR/issue state, deploys, and public comments are unchanged.

Residual risk: without a larger post-preflight suppressed tombstone, rows that
look like potential control commands but are later unauthorized can still be
claimed and dropped by canonical preflight instead of becoming pre-claim stale
dead letters. This is the safer tradeoff because false pre-claim
terminalization is irreversible, while canonical preflight already owns command
authorization and no-mention drops.

Receipts are recorded in `JOURNAL-1229.md`: public command SDK source walk,
focused Discord ingress shard, focused drain shard, broader
Discord/preflight/thread shard, broader core ingress suite, typechecks,
format/lint, diff check, and closeout autoreview with no accepted/actionable
findings.

## Fifth follow-up review objection — requireMention:false fail-open

The request-change gap was a false terminalization in open-listening Discord channels. Canonical preflight resolves guild/channel config through `resolveDiscordChannelConfig*()` and `resolveDiscordShouldRequireMention()`; resolved `requireMention:false` means ordinary unmentioned guild text can be admitted. The pre-claim monitor did not carry that fact, so it could dead-letter a stale ordinary guild row as `stale-ambient-backlog` before canonical preflight saw the mention-open policy.

Best-fix verdict: best bounded fix for this non-continuation packet. The monitor now carries only the small authoritative guild/channel mention-required fact already used by preflight. If that fact cannot be established before claim, it fails open into canonical dispatch/preflight instead of reimplementing partial preflight policy.

Alternatives considered:

- Clone full Discord preflight before claim: rejected because it would duplicate route hydration, bindings, access checks, mention regex, command auth, and audio transcription.
- Remove stale ambient dead-lettering entirely: rejected because proven mention-required ambient backlog would again drain as current room turns and lose the red-to-green repair.
- Add a new suppressed tombstone: rejected for this packet because failed dead letters already provide durable health/resubmit semantics without a schema/lifecycle expansion.

Lifecycle decision: keep failed/dead-letter rows for `stale-ambient-backlog`. They are visible in dead-letter health and require explicit operator resubmit; a completed/suppressed tombstone would hide intentional suppression as success.

Debug receipt: every terminal stale ambient suppression logs exactly one payload-free structured debug receipt with `level`, `source`, `accountId`, `eventId`, `sourceEventId`, `laneKey`, `channelId`, `receivedAt`, `ageMs`, `thresholdMs`, `disposition`, and `reason`. It logs no content, token, auth, attachment URL, or payload.

Frequency/observability: #1229's incident denominator is 3,313/5,000 completed rows >=1h, 1,715/5,000 >=12h, max 30.52h, and the retained head row had 496 attempts. That is incident frequency, not fleet incidence. Follow-up counters should expose stale-ambient suppression count and oldest pending age by account/channel/lane.

Code read: `extensions/discord/src/monitor/ingress.ts`, `extensions/discord/src/monitor/message-handler.ts`, `extensions/discord/src/monitor/allow-list.ts`, `extensions/discord/src/monitor/message-handler.preflight.ts`, `extensions/discord/src/monitor/message-handler.preflight-channel-context.ts`, `extensions/discord/src/monitor/message-handler.preflight-channel-access.ts`, `src/channels/message/ingress-drain.ts`, `src/channels/message/ingress-drain-pending-disposition.ts`, and `extensions/discord/src/monitor/ingress.test.ts`.

New proof: Discord ingress tests now cover guild-level `requireMention:false`, channel-level `requireMention:false`, proven `requireMention:true` suppression, and one structured debug receipt. Existing focused core drain tests retain retry-head bypass, active-claim, multi-lane, dead-letter/idempotency, restart recovery, stale proven ambient, fresh/addressed/ambiguous admitted, and strict 15-minute boundary coverage.

Residual risk: if future preflight admits another address/control form not visible before claim, the monitor must fail open for that form or move suppression after canonical preflight. Current patch intentionally prefers extra canonical preflight work over irreversible false dead-lettering.

## Sixth follow-up review objection — unhydrated thread fail-open

Latest request-change: pre-claim stale suppression still inherited guild `requireMention:true` when the raw row had only `guild_id` and `channel_id`. That can be an old unhydrated thread event with no cached channel and no cached binding; canonical preflight owns the later fetch/binding/auto-thread/mention-open decision. Pre-claim must not call that row proven ambient.

Best bounded fix: `resolveDiscordPreClaimMentionRequirement()` now fails open unless the raw durable row carries an authoritative channel type. Genuinely stale ambient suppression remains only for rows with complete raw channel/thread facts, such as explicit raw `GuildText` channel shape plus mention-required policy. No route hydration, partial preflight clone, queue schema change, threshold change, or suppression lifecycle change was added.

Behavioral proof: a new deterministic SQLite-backed Discord ingress regression enqueues stale raw guild text with only `guild_id`/`channel_id` and guild default `requireMention:true`; it failed red before the code change because dispatch stayed `[]`, then passed after the fail-open guard. Negative controls still prove config/raw-fact-proven stale ambient rows dead-letter as `stale-ambient-backlog`; `requireMention:false`, addressed, and ambiguous rows survive to canonical preflight. Core drain tests continue to prove retry-head bypass, active-claim/multi-lane behavior, restart recovery, dead-letter/idempotency, and strict `> 15m` boundary.

Blast radius: Discord durable pre-claim suppression becomes more conservative when raw gateway rows lack channel type. That can leave more old guild rows for canonical preflight, but avoids irreversible false dead letters for thread/route states only canonical preflight can hydrate. Core drain/queue, SQLite schema, stale threshold, config/env, protocol, dependencies, live state, Frond/continuation, PR/issue/deploy state, and assembly refs are unchanged.

## Seventh follow-up — FIFO restore and direct configured stale expiry

Root cause: 8d9c510 removed retry-delayed pending lanes from core drain blocking, so a later same-lane row could overtake a retry-delayed head. Discord also still treated `requireMention:false` as an admission reason to preserve stale direct-configured backlog, even though age expiry is a freshness fence.

Best-fix verdict: best bounded fix. Core restores retry-delayed lane blocking after the pending-disposition pass; Discord expires stale unaddressed rows only when raw route facts are authoritative.

Production blast radius:

- `src/channels/message/ingress-drain.ts`: retry-delayed pending rows again block their lanes; terminal pending dispositions still run first.
- `extensions/discord/src/monitor/ingress.ts`: direct channel-id config matches and raw non-thread channel types are authoritative stale-expiry facts. Unknown/no-direct raw facts fail open for unhydrated threads. Direct-configured mention-open stale unaddressed text dead-letters as `stale-ambient-backlog`; explicit address/control forms and operator resubmit survive.

Upstream classification: #97435 is the public symptom; #111373 and #120419 are partial core overlaps; #92980/#98774 are same-root retry/poison ordering precedents; #118649/#115888 are adjacent distinct. The exact mechanism/fix was not previously public.

Tests added/updated: core retry-head FIFO/dead-letter lane proof; Discord SQLite queue/monitor proof for raw `APIMessage` without `channel`, the directly configured mention-open incident channel with `requireMention:false`, payload-free receipt, strict 15-minute boundary, resubmit, unhydrated thread fail-open, and explicit address/control rows.

Production LOC delta before docs closeout: +64/-57 (net +7) across `src/channels/message/ingress-drain.ts`, `src/channels/message/ingress-drain-state.ts`, and `extensions/discord/src/monitor/ingress.ts`. Test delta before docs closeout: +558/-106 (net +452), including the split direct-config stale ingress owner test. Positive production growth is justified by restoring the core FIFO invariant and carrying the Discord authoritative-route freshness/resubmit contract.

Code read: `src/channels/message/ingress-drain.ts`, `src/channels/message/ingress-queue.ts`, `extensions/discord/src/monitor/ingress.ts`, `extensions/discord/src/monitor/ingress.test.ts`, `extensions/discord/src/monitor/message-handler.ts`, `extensions/discord/src/internal/gateway.ts`, `extensions/discord/src/internal/gateway-dispatch.ts`, `extensions/discord/src/monitor/message-handler.preflight.ts`, `extensions/discord/src/monitor/message-handler.preflight-thread.ts`, `extensions/discord/src/monitor/allow-list.ts`, and `extensions/discord/src/monitor/channel-access.ts`.

Residual risk: explicit resubmit uses the queue row's new `receivedAt` as operator intent while the original raw Discord timestamp stays old. That is deliberate so failed stale backlog can be replayed only after an operator-visible dead-letter decision.

## Eighth follow-up — oldest-retained retry-delay blocking

Peer request-change: the restored core `retryDelayedLaneKeys` was too broad
because it included every delayed pending row. A retry-delayed tail could block
an eligible oldest same-lane head, violating FIFO and making the drain idle even
though the row at the lane head was runnable.

Best-fix verdict: best bounded owner fix. `drainOnce()` now computes retry-delay
blocking from the oldest retained pending row per lane after pending
dispositions, in the actual pending order. Eligible heads run; delayed heads
block later same-lane tails; terminal pending dispositions remove stale heads
before blocking so tails can proceed.

GitNexus impact evidence: parent ran the fork-backed GitNexus MCP against repo
`openclaw` at `/data/worktrees/oc-1229-gitnexus-slice`, indexed commit
`a59a965`, `357 files / 8,921 symbols / 19,006 edges`. Context found
`createChannelIngressDrain` at `src/channels/message/ingress-drain.ts:139-810`
with incoming drain/lane/supersede tests, and `claimNext` at
`src/channels/message/ingress-queue.ts:762-916`. Impact for
`createChannelIngressDrain` was LOW risk with three direct callers and no
process/module expansion. The earlier Cypher probe had a `TYPE()` syntax error
and is not evidence for this packet.

Production blast radius: core durable ingress drain scheduling only. Queue
claiming, SQLite schema, Discord stale expiry, active/claimed serialization,
supersede, retry policy, stale thresholds, config/env/protocol surfaces, live
queues, PR/issue state, deploys, and assembly refs are unchanged.

Tests added/updated: core drain now has exact regressions for eligible head +
delayed tail, delayed head + eligible tail with unrelated-lane progress, and
terminal disposition of a delayed stale head freeing the tail. Existing Discord
direct-config stale expiry, raw-thread fail-open, payload-free receipt,
same-lane FIFO, active/claimed serialization, unrelated-lane progress, and the
generic pending-disposition hook remain covered by the owner shards.

Red/green receipt: focused drain shard failed before the code change with
`{ started: 0 }` for the eligible-head/delayed-tail regression, then passed
after the oldest-retained-row fix (`38 tests`, `6.10s` wrapper time). Full
closeout receipts are in `JOURNAL-1229.md`.

## Ninth follow-up — hydrateable reply-reference fail-open

Latest request-change: a stale raw Discord reply can carry
`message_reference.message_id` while omitting `referenced_message`. Canonical
preflight hydrates that missing reference before mention-state resolution, so
the pre-claim stale classifier must not dead-letter the row before preflight can
prove reply-to-bot.

Best-fix verdict: best bounded Discord owner fix. The pre-claim classifier now
fails open only for reply references that match the same hydrateable raw shape
used by preflight hydration: default reference type, reply message type, a
present referenced message id, and no `referenced_message` property. Existing
nested `referenced_message.author.id === botUserId` reply-to-bot handling stays
intact, and a reply whose referenced author is known non-bot can still expire
as stale ambient under the existing direct-route rules.

GitNexus evidence: parent completed the fork-backed MCP gate for this
non-continuation packet. `createDiscordIngressMonitor` was found at
`extensions/discord/src/monitor/ingress.ts:306-411` with LOW impact and direct
test callers only; `preflightDiscordMessage` was found at
`extensions/discord/src/monitor/message-handler.preflight.ts:213-883`; and
the graph confirmed
`preflightDiscordMessage -> hydrateDiscordMessageIfNeeded -> hydrateDiscordReplyReference`
before mention state uses `resolveDiscordMentionState`.

Production blast radius: Discord durable pre-claim stale classification only.
No hydration, route/preflight clone, core drain/queue change, SQLite schema,
config/env/protocol/dependency change, live queue mutation, GitHub write,
Frond/assembly ref change, deploy, or merge.

Tests added: SQLite-backed Discord direct-config regression for a stale raw
reply with `message_reference.message_id` and absent `referenced_message` that
must dispatch/fail open; negative control for a stale reply whose nested
referenced author is known non-bot and still dead-letters; existing nested
reply-to-bot case remains.

Red/green receipt: the new direct-config regression failed before the classifier
change (`dispatched` stayed `[]` while expected the reply id), then
`node --no-opt scripts/run-vitest.mjs extensions/discord/src/monitor/ingress-stale-direct-config.test.ts extensions/discord/src/monitor/ingress.test.ts`
passed (`34 tests`).
