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

## 2026-08-10T03:11-07:00 ClawSweeper remediation: canonical claimed-delivery refactor

Server-authoritative state at start of this lane:

- PR: `https://github.com/karmaterminal/openclaw/pull/1237` (OPEN, MERGEABLE / UNSTABLE)
- head `5a5ca7b1699b32831b82519a67b48f78f98af858`
- base `codeagent/wo1229-upstream-pr` @ `02bd9d77142248a07e4ad50387a166db1823b494`

### Root cause of the SDK/typing blocker

The previous lane narrowed the exported `CreateChannelIngressDrainOptions` /
`ChannelIngressMonitorDrainOptions` types but kept the pre-claim
`resolvePendingDisposition` / `onPendingDispositionCommitted` runtime hooks alive
behind `as InternalChannelIngressDrainOptions` casts. Because Discord is a plugin
and plugin production code may not import `src/**` or `src/plugin-sdk-internal/**`
(root `AGENTS.md` Architecture), no typed internal seam was reachable: anything
Discord can legally type against *is* public Plugin SDK. The cast was therefore an
unsafe cross-package private ABI, and it left four attributable CI failures.

Canonical fix: delete the pre-claim disposition seam from core entirely and move
Discord's stale-ambient-backlog policy onto the **existing** claimed delivery
lifecycle. Discord throws `DiscordStaleAmbientBacklogError` from `deliver`; the
already-public `resolveNonRetryableFailure` drain hook maps it to a terminal
`stale-ambient-backlog` failure. Same durable `failed` row, same reason, no agent
turn, no typing indicator, no reply — and no new public contract names.

### Owner-boundary changes

- Removed `src/channels/message/ingress-drain-pending-disposition.ts` and its test.
- `src/channels/message/ingress-drain.ts`: removed the pending-disposition import,
  `InternalChannelIngressDrainOptions`, the `internalOptions` cast, and the
  `applyIngressPendingDispositions` call; renamed `dispositionNow` -> `pendingScanNow`.
- `src/channels/message/ingress-monitor.ts`: reverted to byte-identical with base.
- `src/channels/message/index.ts`: reverted to byte-identical with `origin/main`
  (the three `ChannelIngress*PendingDisposition*` re-exports are gone).
- `extensions/discord/src/monitor/ingress.ts`: added `DiscordStaleAmbientBacklogError`
  and `resolveDiscordStaleAmbientSuppression`, moved the policy into `deliver`,
  mapped it in `drain.resolveNonRetryableFailure`, deleted `PublicDiscordDrainOptions`,
  `DiscordInternalDrainOptions`, and the `satisfies ... as ...` cast.
- New `extensions/discord/src/monitor/message-handler.reply-reference.ts`:
  single shared raw-payload classifier
  (`resolveDiscordReplyReferenceState` -> `complete | missing | invalid`), imported by
  both `message-handler.hydration.ts` (canonical hydration owner) and
  `ingress.ts` (pre-claim classification).

### P1 fix (Discord reply-reference)

`hasHydrateableDiscordReplyReference` previously only failed open when
`referenced_message` was absent, while canonical hydration also refetches a
*mismatched* nested payload. A stale GuildText reply carrying a mismatched nested
payload could therefore be terminally failed before hydration proved the referenced
author was the bot. Both sites now consume the shared classifier and treat
`!== "complete"` (missing **or** invalid) as hydrateable. Red-then-green proven:
temporarily reverting the predicate to `=== "missing"` made the new
"reply with a mismatched referenced payload" case fail, then the fix restored green.

### Receipt-commit invariant

`extensions/discord/src/monitor/ingress.test.ts` requires the structured debug receipt
to fire exactly once and only after the durable fail commits (not on CAS-race loss,
not on write throw). The canonical path has no post-commit drain hook and
`queue.fail`'s typed first argument carries no payload, so Discord wraps its own
queue's `fail` with a `pendingReceipts: Map<string, () => void>` keyed by event id and
emits only on a committed `stale-ambient-backlog` write; `stop()` clears the map.

### Behavior change disclosed honestly

Pre-claim disposition ran over *all* pending rows regardless of retry backoff.
Post-claim, a stale ambient row that already suffered a transient delivery failure
enters retry backoff (`DEFAULT_INGRESS_RETRY_BASE_MS` 1000ms, capped at 3*60_000ms)
and, as the oldest retained row, holds its lane until claimable again — then is
terminally failed. This drove the assertion updates in
`ingress-drain.freshness.test.ts` and the deletion of the now-duplicative
retry-delay test. Restart recovery is unaffected: `releaseClaimIfStillStale` bumps
`attempts` but does not set `last_error`, so `resolveIngressRetryDelayMs` returns 0.

### P2 test coverage added

`extensions/discord/src/monitor/ingress-stale-direct-config.test.ts` now drives the
terminal branch directly with `requireMention: true` on a raw (non-thread) GuildText
channel: 7 preserve cases (bot mention, bot reply, missing reply payload, mismatched
reply payload, configured text mention, configured audio mention, control command)
and 3 suppress cases. The previously unused `expectFailsAsAmbient` helper is now
consumed. Two pre-existing mention-open tests were removed because
`canExpireDiscordStaleAmbientBacklog` fails open without `requireMention`, so they
could never reach the terminal branch.

### Commands and results

- `node --max-old-space-size=8192 --import tsx scripts/generate-plugin-sdk-api-baseline.ts --check`
  -> `OK docs/.generated/plugin-sdk-api-baseline.sha256`
- `node --max-old-space-size=8192 scripts/plugin-sdk-surface-report.mjs --check`
  -> passed (`package-exported forbidden subpaths: 0`)
- `node scripts/run-tsgo.mjs -p tsconfig.core.json` -> clean
- `node scripts/run-tsgo.mjs -p tsconfig.extensions.json` -> clean
- `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.extensions.test.json` -> clean
- `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json` -> only the two
  pre-existing errors below; all 10 attributable TS2353/TS7006 errors are gone
- `node scripts/run-oxlint.mjs src/channels/message extensions/discord` -> exit 0
  (verified the linter reports by probing a deliberate unused variable first)
- `node scripts/check-max-lines-ratchet.mjs` -> `max-lines ratchet OK`
- `node scripts/check-deadcode-exports.mjs` -> knip production and full-tree scans
  passed with 0 entries (the `Unused exported types (2)` block is gone)
- `git --no-pager diff --check` -> clean
- `./node_modules/.bin/oxfmt <touched files>` -> no churn
- `node scripts/run-vitest.mjs` over `ingress-drain.freshness`, `ingress-drain-retry-delay`,
  `ingress-drain`, `ingress-monitor`, discord `ingress`, `ingress-stale-direct-config`,
  `ingress.import-boundary`, `message-handler.hydration`,
  `message-handler.process.session-routing` -> 3 shards passed
- Full `extensions/discord` suite -> 215 files / 2618 tests passed
- Full `src/channels/message` suite -> 32 files / 366 tests passed
- `.agents/skills/autoreview/scripts/autoreview --mode branch --base origin/codeagent/wo1229-upstream-pr --max-priority P2`
  -> exit 0 (helper returns 1 on any finding or `patch is incorrect`), i.e. no
  accepted/actionable findings at P2

### LOC accounting (vs `02bd9d77142248a07e4ad50387a166db1823b494`)

Production: `ingress.ts` +116/-93, `message-handler.hydration.ts` +11/-30,
`message-handler.reply-reference.ts` +40/-0, `index.ts` 0/-5,
`ingress-drain-pending-disposition.ts` 0/-99, `ingress-drain.ts` +3/-21
=> **net -78 production lines**.
Tests: `ingress-stale-direct-config.test.ts` +247/-59, `ingress.test.ts` +5/-2,
`ingress-drain-pending-disposition.test.ts` 0/-117,
`ingress-drain-retry-delay.test.ts` 0/-47, `ingress-drain.freshness.test.ts` +60/-64
=> **net +23 test lines**.

### External blockers, proven not introduced by this diff

- `checks-node-core-src-security` and `check-test-types`:
  `src/sessions/user-turn-transcript.test.ts(548,19): error TS2304: Cannot find name 'createTempDir'`.
  That file is byte-identical to the base branch
  (`git diff --quiet origin/codeagent/wo1229-upstream-pr -- src/sessions/user-turn-transcript.test.ts`)
  and the identical error is already present in the PR-head CI log
  (run `31371790582`, job `93402295044`). The security shard failure is that same
  single test (`1 failed | 4479 passed`).
- `PR context and evidence` (run `31371794529`) and `auto-response` (run `31371794613`):
  `actions/create-github-app-token` fails with
  `The 'private-key' input must be set to a non-empty string` on this fork. The
  `PR context and evidence` job additionally required authored
  `What Problem This Solves` and `Evidence` sections; the PR body now supplies both.
- `openclaw/ci-gate` is the aggregate gate and only reflects the children above.
- Local-only: `ui/src/app-session-route-paths.ts` TS2307 for
  `@openclaw/session-url-contract/parse` is an unbuilt-workspace-package artifact
  (`packages/session-url-contract/dist` absent locally); it does not appear in CI.

### Remaining proof gap (retained honestly)

No live recovered Discord gateway replay was run in this lane. The stale-ambient
terminal path is proven by focused durable queue/monitor tests plus Discord
mock-payload tests, not by a real reconnect against Discord.
