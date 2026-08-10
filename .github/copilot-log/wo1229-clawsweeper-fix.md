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
Discord can legally type against _is_ public Plugin SDK. The cast was therefore an
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
_mismatched_ nested payload. A stale GuildText reply carrying a mismatched nested
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

Pre-claim disposition ran over _all_ pending rows regardless of retry backoff.
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

## Lane: check-docs format fix + PR body head-SHA refresh

### `check-docs` / `pnpm format:check`

CI job `check-docs` (run `31378150170`, job `93422141718`) failed on head
`b8cb0f7134c881502a4fe05d49ee669fbdb906f0` at `pnpm format:check`. The log named
exactly one file:

```text
.github/copilot-log/wo1229-clawsweeper-fix.md (46ms)
Format issues found in above 1 files.
```

Reproduced locally in this linked worktree (no pnpm reconciliation):

```bash
./node_modules/.bin/oxfmt --check
# .github/copilot-log/wo1229-clawsweeper-fix.md (419ms)
# Format issues found in above 1 files.
# Finished in 6407ms on 27936 files using 20 threads.
```

Cause: this run log was appended via heredoc using `*emphasis*`; oxfmt normalizes
Markdown emphasis to `_emphasis_`. No source file and no other repository file
was unformatted, so the fix is scoped to this log alone.

```bash
./node_modules/.bin/oxfmt .github/copilot-log/wo1229-clawsweeper-fix.md
./node_modules/.bin/oxfmt --check
# All matched files use the correct format. (27936 files)
git --no-pager diff --stat
# .github/copilot-log/wo1229-clawsweeper-fix.md | 6 +++---
```

Three lines, cosmetic only, zero production or test LOC. Committed as
`cd71390e0e9aa74f2eea07d683334baad7d7b274` with the Copilot co-author trailer and
pushed to `codeagent/wo1229-clawsweeper-fix`.

### PR body head SHA

`gh pr edit 1237 --body-file` refreshed only the `## Notes` head-branch SHA from
`b8cb0f7134c881502a4fe05d49ee669fbdb906f0` to
`cd71390e0e9aa74f2eea07d683334baad7d7b274`. Body line count unchanged (71), the
codesmith footer block and its `codesmith:autofix:disabled` marker preserved
verbatim, no code changes.

Re-verified against the repository's own gate implementation:

```bash
node -e '...import("./scripts/github/real-behavior-proof-policy.mjs")...'
# forced-external: {"status":"passed","reason":"External PR includes problem context and evidence.","applies":true,"passed":true}
# authored problem: true
# authored evidence: true
```

The `edited` event retriggered `PR context and evidence`; run `31378826569`
completed `success` on the new head (previous head run `31378633729` also
`success`).

### Exact-head CI on `cd71390e0e9`

| Check                                                             | Result                                      |
| ----------------------------------------------------------------- | ------------------------------------------- |
| `check-docs`                                                      | success (was the format failure; now fixed) |
| `check-dependencies`                                              | success                                     |
| `PR context and evidence`                                         | success                                     |
| `Dependency Guard`, `Security Sensitive Guard`, `Workflow Sanity` | success                                     |
| `CodeQL`, `CodeQL Critical Quality`, `OpenGrep — PR Diff`         | success                                     |
| iOS / macOS / Shared OpenClawKit Periphery                        | success                                     |
| `ClawSweeper Dispatch`                                            | success                                     |
| `check-test-types`                                                | failure — base-owned only, see below        |
| `Labeler`, `Auto response`                                        | failure — fork secret absence, see below    |

### Remaining external blockers (re-proven on this head)

`check-test-types` (run `31378636868`, job `93423739599`) now reports exactly one
error, down from the eleven present before this lane:

```text
src/sessions/user-turn-transcript.test.ts(548,19): error TS2304: Cannot find name 'createTempDir'.
```

All ten attributable errors (pending-disposition, freshness, retry-delay
callsites) are gone. The surviving file is untouched by this diff:

```bash
git diff --quiet origin/codeagent/wo1229-upstream-pr HEAD -- src/sessions/user-turn-transcript.test.ts
# exit 0 -> identical to base
```

`Labeler` (run `31378633617`, job `label`) and `Auto response` (run
`31378633605`) both fail inside
`actions/create-github-app-token`:

```text
Error: The 'private-key' input must be set to a non-empty string.
```

That is the fork's missing `GH_APP_PRIVATE_KEY` / `GH_APP_PRIVATE_KEY_FALLBACK`
secret, not a body or metadata defect. `.github/workflows/auto-response.yml:48`
lacks `continue-on-error` on its fallback token step, so the job goes red instead
of degrading; `real-behavior-proof.yml` marks both token steps
`continue-on-error`, which is why `PR context and evidence` recovered once the
body was correct. Neither is attributable to this diff and neither is fixable
from the PR branch.

### `openclaw/ci-gate` decomposition (run `31378636868`, job `93427987104`)

The aggregate gate is red only through the two shards that carry the base-owned
`createTempDir` failure. Its own required set is green:

```text
REQUIRED_RESULTS: preflight=success security-fast=success
SELECTED_RESULTS: pnpm-store-warmup=success build-artifacts=success
  checks-fast-core=success qa-smoke-ci-profile=success
  checks-fast-plugin-contracts-shard=success
  checks-fast-channel-contracts-shard=success
  checks-node-core-test-nondist-shard=failure check-shard=failure
  check-additional-shard=success check-docs=success
::error checks-node-core-test-nondist-shard finished with failure
::error check-shard finished with failure
```

`check-shard` contains `check-test-types`; `checks-node-core-test-nondist-shard`
contains `checks-node-core-src-security`, whose only failing test is the same
base-owned file (`1 failed | 359 passed | 2 skipped`, `ReferenceError:
createTempDir is not defined` at `src/sessions/user-turn-transcript.test.ts:548`).
`check-docs` is now explicitly `success` in the gate's own selected results.

## Lane 6 — Codex review response on head `fca00a74055bf5b0c433b58bfbd3a6448da9aba8`

Reviewer identity: the request-changes review is authored by
`chatgpt-codex-connector[bot]`. `gh api repos/karmaterminal/openclaw/pulls/1237/reviews`
and `.../comments` return no human reviewer and no issue comments, so all four
findings below are that bot's.

### Finding `3748032892` (P2) — obsolete, filed against stale head `5a5ca7b`

It asks for a test-only typed seam or casts so
`resolvePendingDisposition` / `onPendingDispositionCommitted` keep typechecking.
That seam no longer exists anywhere:

```console
$ rg -n 'PendingDisposition' -g '!docs/.generated' .
(no matches)
$ git ls-files | rg 'ingress-drain-pending-disposition'
(no output)
```

Both `src/channels/message/ingress-drain-pending-disposition.ts` and
`ingress-drain-pending-disposition.test.ts` were deleted in Lane 2, and the
freshness/retry-delay tests were rewritten onto the canonical claimed-delivery
path. The core test-type lane confirms zero residual callsites:

```console
$ node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json \
    --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core-test.tsbuildinfo
src/sessions/user-turn-transcript.test.ts(548,19): error TS2304: Cannot find name 'createTempDir'.
ui/src/app-session-route-paths.ts(4,8): error TS2307: Cannot find module '@openclaw/session-url-contract/parse' ...
```

The first is base-owned (`git diff --quiet origin/codeagent/wo1229-upstream-pr HEAD --
src/sessions/user-turn-transcript.test.ts` exits `0`). The second is a
local-only artifact of an absent `dist` in this linked worktree and never
appears in CI. Review requirements 1 and 2 are therefore satisfied by deletion
rather than by adding an internal seam; adding one now would reintroduce exactly
the surface the maintainer rejected.

### Finding `3748671291` (P1) — not reproducible

It predicts the CAS-loss assertion `args[0] === "1027"` breaks because `fail`
may now receive a claim object. The `fail` wrapper normalizes with
`typeof idOrClaim === "string" ? idOrClaim : idOrClaim.id`, and the suite is
green:

```console
$ node scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts
Test Files  1 passed (1)
     Tests  28 passed (28)
```

### Finding `3748798826` (P2) — valid, fixed in this lane

Core `applyFailureDisposition` emitted
`spooled update ... failed with non-retryable ...; dead-lettered` through
`options.onLog`, which Discord routes to `params.runtime.error?.(danger(...))`.
An intentional stale-ambient suppression is deliberate product policy, not an
operator fault, so this was a real regression against the base PR's
debug-receipt-only behavior.

A first pass added an `intentional?: boolean` marker that only silenced the log.
That was rejected on review and is superseded: silencing the line still left a
durable `status = "failed"` row. `countFailedChannelIngressQueueEntries`
(`src/channels/message/ingress-queue.ts:533`) selects `status = "failed"` with
no reason predicate, and it feeds `openclaw doctor`
(`src/commands/doctor-channel-ingress.ts:20`) plus gateway delivery-queue health
(`src/gateway/health/delivery-queue.ts:36`, `src/commands/health.ts:196`), which
renders `Delivery queue: warning (dead-lettered entries ...)`. With Discord's
`failedMaxEntries: 5_000`, one reconnect-sized suppressed backlog becomes a
permanent false alarm. See Lane 7 for the canonical fix.

### Finding `3748671288` (P2) — accepted, named tradeoff

Post-claim suppression means a stale ambient row already sitting in retry
backoff holds its lane until the backoff expires. The window is bounded and
narrow: `DISCORD_STALE_AMBIENT_BACKLOG_MS` is 15 minutes while
`DEFAULT_INGRESS_RETRY_MAX_MS` is 3 minutes, so the row must have failed
transiently within the last 3 minutes while already being more than 15 minutes
old. Closing it fully requires a pre-claim decision seam, which is the exact
public surface the maintainer rejected. Recording it here as a deliberate
decision, not an oversight.

### Required black-box regression — global `mentionPatterns`

The pre-existing `1013` `it.each` matrix never reached the terminal branch:
`canExpireDiscordStaleAmbientBacklog` needs a raw non-thread channel
(`typeof channelInfo.type === "number"`) plus `requireMention: true`, and that
case supplies neither, so it fails open on missing-raw-channel regardless of
mention configuration.

New `1023` case in `extensions/discord/src/monitor/ingress.test.ts` supplies
both, uses `cfg: { messages: { groupChat: { mentionPatterns: ["openclaw"] } } }`
with content `"openclaw can you check the incident"`, and drives the real
`createDiscordIngressMonitor` end to end. Red proof, with
`matchesConfiguredDiscordMentionText` disabled:

```console
AssertionError: expected [] to deeply equal [ '1023' ]
```

`1013` still passed under that same probe, confirming it was toothless for this
invariant.

## Lane 7 — handled settlement replaces the dead-letter row

Supersedes the Lane 6 first pass on finding `3748798826`. The reviewer's point
was confirmed at the durable layer, not just the log layer: suppression must not
produce a `status = "failed"` row at all.

### Root cause

`countFailedChannelIngressQueueEntries` (`src/channels/message/ingress-queue.ts:533`)
is reason-agnostic. Every consumer of it therefore counts a deliberate policy
drop as operator-actionable breakage:

- `openclaw doctor` via `src/commands/doctor-channel-ingress.ts:20`, invoked from
  `src/flows/doctor-health-contribution-runners.state.ts:95`;
- gateway health via `src/gateway/health/delivery-queue.ts:36` and
  `src/commands/health.ts:196`, which prints
  `Delivery queue: warning (dead-lettered entries ...)`.

### Canonical fix

The queue already owns two terminal outcomes: the dead-letter row and the
successful completion tombstone. A handled policy decision is the second one, so
it settles there.

- `src/channels/message/ingress-retry-policy.ts`: `IngressNonRetryableFailure`
  gains `settlement?: "dead-letter" | "handled"`, defaulting to `"dead-letter"`.
  `resolveIngressFailureDisposition` maps `"handled"` to a third internal
  disposition kind. The union stays internal; the field rides the pre-existing
  public `drain.resolveNonRetryableFailure` hook, so no new public callback
  contract name appears.
- `src/channels/message/ingress-drain.ts`: `applyFailureDisposition` settles
  `kind === "handled"` through `completeClaimWithRetry(claim)` and returns before
  the dead-letter branch. The dead-letter `log()` is restored to its unmodified
  base form, so real failures are untouched.
- `extensions/discord/src/monitor/ingress.ts`: the queue `fail` wrapper became a
  `complete` wrapper. It reads the pending receipt, awaits
  `baseQueue.complete(...)`, deletes the entry, and emits only when `complete()`
  returned `true`. Ordinary completions find no pending receipt and emit nothing.
  The receipt's `disposition` field is now `"suppressed"`, not `"failed"`.

Core stays channel-agnostic: no Discord reason string, no health-query
exclusion, no schema change and no schema-version bump.

### Accepted tradeoff

`resubmit` (`src/channels/message/ingress-queue.ts:1249`) only transitions rows
with `status = "failed"`; a `completed` row returns `{ kind: "completed" }`.
Operators can therefore no longer replay a stale-suppressed Discord message via
dead-letter resubmit. Judged acceptable: suppression is deliberate policy on
ambient chatter older than 15 minutes in a mention-required channel, and a
permanent false health warning outranks a marginal replay path. The resubmit
machinery keeps its coverage — the
`treats dead-letter resubmit as fresh operator intent` test now drives a genuine
`invalid-event` dead letter instead of relying on suppression.

### Red proof — failure-shaped tests break if the handled path calls `fail`

Forcing `kind: "fail"` in `resolveIngressFailureDisposition`:

```console
$ node scripts/run-vitest.mjs extensions/discord/src/monitor/ingress.test.ts \
    extensions/discord/src/monitor/ingress-stale-direct-config.test.ts
Tests  12 failed | 36 passed (48)
```

Restored, the same command is `48 passed (48)`.

### Health-count proof

`src/channels/message/ingress-drain.test.ts` gains
`settles a channel-handled outcome as a completion the operator surfaces ignore`.
It drains one handled row and one genuine dead-letter row, spies on `queue.fail`,
and asserts `listFailed()` holds only the genuine failure,
`countFailedChannelIngressQueueEntries(stateDir)` reports `count: 1`,
`listPending()` is empty, `fail` was never called with the handled claim, and no
policy string reached `onLog`.

### Validation on the working tree

```console
$ node scripts/run-vitest.mjs src/channels/message
Test Files  32 passed (32)     Tests  369 passed (369)
$ node scripts/run-vitest.mjs extensions/discord
Test Files  215 passed (215)   Tests  2619 passed (2619)
$ node scripts/run-vitest.mjs extensions/telegram/src/monitor extensions/slack/src/monitor
Test Files  48 passed (48)     Tests  1045 passed (1045)
$ node scripts/run-tsgo.mjs -p tsconfig.core.json ...                       no errors
$ node scripts/run-tsgo.mjs -p tsconfig.extensions.json ...                 no errors
$ node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.extensions.test.json  no errors
$ node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.test.root.json        no errors
$ node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json
src/sessions/user-turn-transcript.test.ts(548,19): error TS2304: Cannot find name 'createTempDir'.
ui/src/app-session-route-paths.ts(4,8): error TS2307: Cannot find module '@openclaw/session-url-contract/parse' ...
$ git diff --quiet origin/codeagent/wo1229-upstream-pr -- \
    src/sessions/user-turn-transcript.test.ts ui/src/app-session-route-paths.ts
(exit 0 — both files byte-identical to base 02bd9d77142248a07e4ad50387a166db1823b494)
$ node scripts/check-max-lines-ratchet.mjs
max-lines ratchet OK: 980 grandfathered suppressions.
$ ./node_modules/.bin/oxlint --config .oxlintrc.json src/channels/message extensions/discord/src/monitor
oxlint exit=0
$ node scripts/plugin-sdk-surface-report.mjs --check                        exit 0
$ node scripts/sync-plugin-sdk-exports.mjs --check
plugin-sdk exports synced.
$ node scripts/check-extension-plugin-sdk-boundary.mjs --mode=src-outside-plugin-sdk
No extension plugin-sdk boundary violations found.
$ node --import tsx scripts/generate-plugin-sdk-api-baseline.ts --check
OK docs/.generated/plugin-sdk-api-baseline.sha256
$ git --no-pager diff --check
(clean)
```

Sibling Telegram and Slack ingress suites are included because
`resolveNonRetryableFailure` is a shared public hook. `settlement` is optional
and those channels never set it, so they keep the unchanged dead-letter path.

### Plugin SDK baseline churn is closure-hash-only

```console
$ git --no-pager diff --numstat -- docs/.generated/plugin-sdk-api-baseline.sha256
32      32
$ diff <(awk '{print $2}' base.sha256 | sort) <(awk '{print $2}' new.sha256 | sort) | wc -l
0
```

Both files hold 151 entries with an identical symbol set; only `module/*`
closure hashes moved, and every changed line is a `module/` entry rather than a
named export. `IngressNonRetryableFailure` is exported from neither
`src/channels/message/index.ts` nor `src/plugin-sdk/plugin-state-test-runtime.ts`,
and plugins satisfy `resolveNonRetryableFailure` structurally, so an optional
field can only move a closure hash.

### Production versus test LOC against base `02bd9d77142248a07e4ad50387a166db1823b494`

```console
$ git --no-pager diff --numstat origin/codeagent/wo1229-upstream-pr -- src extensions
277  82  extensions/discord/src/monitor/ingress-stale-direct-config.test.ts
 84  38  extensions/discord/src/monitor/ingress.test.ts
128  93  extensions/discord/src/monitor/ingress.ts
 11  30  extensions/discord/src/monitor/message-handler.hydration.ts
 40   0  extensions/discord/src/monitor/message-handler.reply-reference.ts
  0   5  src/channels/message/index.ts
 60  64  src/channels/message/ingress-drain.freshness.test.ts
  0 117  src/channels/message/ingress-drain-pending-disposition.test.ts
  0  99  src/channels/message/ingress-drain-pending-disposition.ts
  0  47  src/channels/message/ingress-drain-retry-delay.test.ts
 50   0  src/channels/message/ingress-drain.test.ts
 10  21  src/channels/message/ingress-drain.ts
 19   0  src/channels/message/ingress-retry-policy.test.ts
 14   1  src/channels/message/ingress-retry-policy.ts
```

Production is `+203 / -249`, net `-46`. Tests are `+490 / -348`, net `+142`. The
generated baseline is excluded from both counts. The negative production delta
comes from deleting the rejected pre-claim seam module and folding Discord's
duplicated reply-reference logic into one shared classifier.

### Blocked proof in this environment

- `check-dependencies` cannot run locally: `pnpm dlx knip@6.8.0` fails with
  `MODULE_NOT_FOUND` for an evicted dlx store entry under
  `.../openclaw-local-ci-pnpm-store/v11/links/@/knip/6.8.0/.../bin/knip.js`.
  Mitigation evidence:
  `git --no-pager diff -U0 -- src extensions | grep -E '^\+.*\bexport\b'`
  returns nothing, so this lane introduces no new export that could go unused.
  CI owns the authoritative result.
- `autoreview` cannot reach any engine here. `--engine codex` exits 1 with no
  model output, `--engine claude` returns
  `API Error: 400 Not a valid API key for this workspace`, and `--engine copilot`
  is refused by the skill itself.
- The substitute independent read-only reviewer was also unavailable: it stalled
  and was cancelled after 45 tool calls and 662s with zero turns emitted. That is
  recorded as **review unavailable**, not as approval, and no finding from it is
  claimed.
- Compensating control: the parent agent directly reviewed the final production
  and test diff against base
  `02bd9d77142248a07e4ad50387a166db1823b494` and found no additional defect in
  commit ordering, CAS-loss handling, retry/default behavior, the
  tombstone/health projection, or sibling-channel impact. Specifics checked:
  `applyFailureDisposition` routes `handled` to `completeClaimWithRetry` before
  the dead-letter branch and returns, so the retry/release/dead-letter paths keep
  their base behavior; `completeClaimWithRetry` uses `label: "tombstone"` with
  `falseMeansReclaimed: true`, so a lost CAS is treated as reclaimed rather than
  as a completion; `createSettleOwner` still only marks the state settled after
  the write commits; the Discord `complete` wrapper emits the receipt strictly
  after `baseQueue.complete(...)` resolves `true`, and deletes the pending entry
  only after the await, so a retried commit still reports and a failed commit
  does not; `settlement` is optional and unset by all other channels, so their
  dead-letter path is byte-identical.
- Live recovered-Discord gateway proof remains owed and is not claimed.

## Lane 8 — inherited `createTempDir` test repair on head `8d412da31bd22516421ae50b0d34102d1a022982`

### Hosted check triage on the exact head

```console
$ gh api "repos/karmaterminal/openclaw/commits/8d412da31bd.../check-runs?per_page=100" \
    --jq '.check_runs[] | "\(.conclusion // .status)\t\(.name)"' | sort | uniq -c
88 success
 8 skipped
 4 failure   (auto-response x2, checks-node-core-src-security, openclaw/ci-gate)
```

`check-test-types`, `check-lint`, `check-docs`, `check-dependencies`, and the
plugin SDK lanes are all green on this head, so the Lane 1-7 attributable
blockers are cleared. `openclaw/ci-gate` is the aggregate gate and only mirrors
the two real children below.

### `auto-response` — external, fork GitHub App private key absent

```console
$ gh api repos/karmaterminal/openclaw/actions/jobs/93498861174/logs | grep -i private-key
Error: The 'private-key' input must be set to a non-empty string. If using a
secret or variable, ensure it is available in this workflow context.
```

`actions/create-github-app-token` has no app private key on this fork. No
workflow was weakened and no credential was added or exposed; the correct owner
is the repository secret configuration, not this diff.

### `checks-node-core-src-security` — inherited but code-addressable, fixed here

The shard failed on exactly one test:

```console
[shard:core-unit-src-security] ❯ unit-src src/sessions/user-turn-transcript.test.ts (40 tests | 1 failed)
[shard:core-unit-src-security]   × waits for a deferred projection rebuild before returning admission identity
[shard:core-unit-src-security] ReferenceError: createTempDir is not defined
[shard:core-unit-src-security]   548| const dir = createTempDir("openclaw-user-turn-recorder-projectio…
```

The blob is byte-identical to base `02bd9d77142248a07e4ad50387a166db1823b494`,
so the defect is inherited rather than introduced here. It is nonetheless a
one-line mechanical repair, so Pathfinder applies: no `createTempDir` symbol is
exported anywhere in the repository (only `createTempDirTracker` in
`test/helpers/temp-dir.ts` and `createTempDirHarness` in a QA Lab helper), and
the file already binds the canonical tracker at its top:

```ts
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
```

Every other temp dir in the file — 20+ call sites at lines 253, 312, 345, 381,
442, 522, 590, 638, 672, 710 and beyond — uses `tempDirs.make(prefix)`. Line 548
was the single divergence. The fix restores the file's own convention and also
puts the directory under automatic cleanup, which the undefined call never did.

```diff
-      const dir = createTempDir("openclaw-user-turn-recorder-projection-");
+      const dir = tempDirs.make("openclaw-user-turn-recorder-projection-");
```

### Proof

```console
$ node scripts/run-vitest.mjs src/sessions/user-turn-transcript.test.ts
✓ waits for a deferred projection rebuild before returning admission identity  893ms
Test Files  1 passed (1)     Tests  40 passed (40)
$ node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json ...
ui/src/app-session-route-paths.ts(4,8): error TS2307: Cannot find module '@openclaw/session-url-contract/parse' ...
$ ./node_modules/.bin/oxfmt --check src/sessions/user-turn-transcript.test.ts
All matched files use the correct format.
$ ./node_modules/.bin/oxlint --config .oxlintrc.json src/sessions/user-turn-transcript.test.ts
oxlint exit=0
$ git --no-pager diff --check
(clean)
$ git --no-pager diff --numstat
1       1       src/sessions/user-turn-transcript.test.ts
```

The `createTempDir` TS2304 is gone from the core test type lane. The remaining
TS2307 is a local-only artifact of an absent `dist/` in this linked worktree and
never appears in CI, which is why hosted `check-test-types` is already green on
this head.

Production LOC delta for this lane is `0`; test LOC delta is `+1 / -1`.

Live recovered-Discord gateway proof remains owed and is still not claimed.
