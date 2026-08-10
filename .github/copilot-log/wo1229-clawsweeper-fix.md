## WO1229 ClawSweeper follow-up log

- 2026-08-10T01:32:09-07:00: Started from branch codeagent/wo1229-clawsweeper-fix at 02bd9d77142248a07e4ad50387a166db1823b494; target PR is karmaterminal:codeagent/wo1229-clawsweeper-fix -> karmaterminal:codeagent/wo1229-upstream-pr.
- 2026-08-10T01:32:09-07:00: .github/copilot-instructions.md and .github/process_bootstrap.xml are absent in this checkout.
- 2026-08-10T01:32:09-07:00: Spawned SDK contract and Discord stale-classification worker lanes; parent remains coordination-only per maintainer workflow.

## 2026-08-10T01:33-07:00 WO1229 channel ingress SDK baseline lane

- Read root AGENTS.md and scoped guides: src/plugin-sdk/AGENTS.md, src/channels/AGENTS.md, scripts/AGENTS.md, docs/AGENTS.md, extensions/AGENTS.md. Confirmed .github/copilot-instructions.md and .github/process_bootstrap.xml are absent.
- Initial inspection: two pre-claim pending-disposition callbacks are resolvePendingDisposition and onPendingDispositionCommitted on createChannelIngressDrain / createChannelIngressMonitor drain options, used by Discord stale ambient backlog handling. Investigating whether to keep public SDK or narrow surface.

## 2026-08-10T01:33:12-07:00 Discord stale ambient safety lane

- Confirmed `.github/copilot-instructions.md` and `.github/process_bootstrap.xml` are absent in this checkout.
- Read root `AGENTS.md`, `extensions/AGENTS.md`, ClawSweeper skill context, and inspected Discord monitor ingress/caller tests.
- Decision: stale expiry must only terminally fail old guild rows that are provably ambient on a mention-required non-thread route. Mention-open channel config (`requireMention: false`) means unmentioned rows are potentially addressed and must be admitted/retried instead of dead-lettered.
- Changed Discord ingress classification to require both authoritative non-thread raw channel type and effective mention-required routing before returning `stale-ambient-backlog`.
- Changed ingress tests to use repo-local `.tmp/discord-ingress-tests` scratch state instead of OS temp paths.

### Commands

- `pnpm format extensions/discord/src/monitor/ingress.ts extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/ingress-stale-direct-config.test.ts .github/copilot-log/wo1229-clawsweeper-fix.md` — passed.
- `git --no-pager diff --check` — passed.
- `node scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/ingress-stale-direct-config.test.ts` — passed, 2 files / 39 tests.

### Proof gap

- Real recovered Discord gateway proof remains outside this local lane; focused durable ingress tests cover the queue/monitor invariant with mocked Discord payloads.

## 2026-08-10T01:44-07:00 SDK contract lane result

- Decision: `resolvePendingDisposition` and `onPendingDispositionCommitted` are not a promoted public Plugin SDK contract in this lane. They remain an internal bundled-drain hook used by Discord stale ambient backlog handling until an SDK owner explicitly decides whether to publish a stable pre-claim disposition API.
- Implementation: removed the two callbacks from exported `CreateChannelIngressDrainOptions` / `ChannelIngressMonitorDrainOptions` declarations while preserving runtime support through internal option casts in `src/channels/message/ingress-drain.ts` and `src/channels/message/ingress-monitor.ts`.
- Discord still uses the internal hook through a local `satisfies`-checked cast with a code comment, so stale ambient backlog remains fail-closed without advertising the callbacks to third-party plugin authors.
- Regenerated `docs/.generated/plugin-sdk-api-baseline.sha256` after narrowing the surface. Generated local baseline JSON/JSONL contain no `resolvePendingDisposition`, `onPendingDispositionCommitted`, or `PendingDisposition` names.
- Note: this checkout already contains Discord stale-classification/test edits from the sibling lane recorded above; this SDK lane did not author those test changes.

### Commands

- `pnpm run plugin-sdk:api:check` — failed before fix (manifest drift).
- `pnpm run plugin-sdk:api:gen` — used to inspect drift, then after narrowing kept the regenerated hash manifest.
- `pnpm format src/channels/message/ingress-drain.ts src/channels/message/ingress-monitor.ts extensions/discord/src/monitor/ingress.ts` — passed.
- `pnpm run plugin-sdk:api:check` — passed after regenerated narrowed baseline (`OK docs/.generated/plugin-sdk-api-baseline.sha256`).
- `pnpm run plugin-sdk:surface:check` — passed.
- `node scripts/run-vitest.mjs src/channels/message/ingress-drain-pending-disposition.test.ts src/channels/message/ingress-drain.freshness.test.ts src/channels/message/ingress-drain-retry-delay.test.ts src/plugin-sdk/channel-ingress-runtime.test.ts extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/ingress-stale-direct-config.test.ts` — passed, 6 files / 56 tests across 4 shards.
- `git --no-pager diff --check` — passed.
- `rg -n "resolvePendingDisposition|onPendingDispositionCommitted|PendingDisposition" docs/.generated/plugin-sdk-api-baseline.json docs/.generated/plugin-sdk-api-baseline.jsonl docs/.generated/plugin-sdk-api-baseline.sha256 || true` — no matches.

### Proof gap

- No live Discord gateway replay was run in this lane; focused queue/monitor and Discord mock-payload tests cover the changed API boundary and stale-backlog behavior.
