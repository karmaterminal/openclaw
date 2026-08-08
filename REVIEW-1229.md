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
