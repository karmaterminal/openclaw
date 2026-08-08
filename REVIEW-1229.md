# Review 1229 — durable ingress backlog repair

## Root cause

`drainOnce()` treated a retry-delayed pending row as a lane-wide block. A same-channel retry head therefore prevented later eligible rows from being claimed, even when the old row was still inside backoff. Separately, durable ingress had no pre-claim freshness disposition: Discord ambient guild backlog and current addressed work were both just FIFO pending rows in `channel:<id>`, so recovery could admit day-old room events as fresh turns before a current mention.

## GitNexus call graph

Focused alias only: `emeric-1229-ingress`; no whole-repo reindex.

Commands/queries used:

```shell
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress createChannelIngressDrain
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress createChannelIngressDrain --depth 3 --include-tests
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress -u Function:ingress-queue.ts:claimNext
/home/figs/.npm-global/bin/gitnexus impact -r emeric-1229-ingress Function:ingress-queue.ts:claimNext --depth 3 --include-tests
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress createChannelIngressMonitor
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress resolveIngressRetryDelayMs
/home/figs/.npm-global/bin/gitnexus context -r emeric-1229-ingress supersedeActiveStatesIfNeeded
/home/figs/.npm-global/bin/gitnexus cypher -r emeric-1229-ingress "MATCH (a)-[r]->(b) WHERE a.name IN ['createChannelIngressDrain','drainOnce','claimNext','resolveIngressRetryDelayMs','supersedeActiveStatesIfNeeded','createChannelIngressMonitor'] RETURN a.name AS from, r.type AS rel, b.name AS to, b.filePath AS filePath LIMIT 160"
```

Owning symbols:

- `createChannelIngressDrain` / `drainOnce`: core claim recovery, retry eligibility, lane serialization, dispatch lifecycle.
- `claimNext`: queue-level pending-to-claimed transition and candidate ID filtering.
- `resolveIngressRetryDelayMs`: per-row retry eligibility.
- `supersedeActiveStatesIfNeeded`: active pre-adoption supersede only; not a pending backlog owner.
- `createChannelIngressMonitor`: channel admission/pump bridge into the core drain.
- `createDiscordIngressMonitor`: Discord owner for raw message timestamp and addressed-vs-ambient policy.

Causal path: Discord durable append -> monitor pump -> core drain recovery -> pending disposition -> retry eligibility filter -> `claimNext(candidateIds)` -> dispatch lifecycle -> complete/fail tombstone.

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
