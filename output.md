# Independent review of openclaw/openclaw#121204

## Named-ref contract

Recorded before crediting candidate evidence.

| Category     | Named ref                                                                                        | Full SHA                                   | Local / tracking / server                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Product      | final successor `6fdf0e99`                                                                       | `6fdf0e99b46b3296631a38eb55abf4012bc8a718` | local object, `origin/codeagent/121204-pending-row-admissibility-order-cure-20260830`, and server equal                            |
| Base         | pinned upstream `43a7cb3c`                                                                       | `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5` | local object resolved; immutable byte used for comparisons                                                                         |
| Safe lane    | `codeagent/121204-6fdf0e99-independent-review-20260830`                                          | `6fdf0e99b46b3296631a38eb55abf4012bc8a718` | local, tracking, and server equal after unchanged publication                                                                      |
| CI workflow  | `karmaterminal/openclaw-bootstrap:codeagent/124337-feac2430-routing-independent-review-20260829` | `d05778e6a96dd9a96946eff483e80c4d9ff9575e` | Mode-B run `33335965349` reports this exact `headSha`; server branch identity checked separately                                   |
| Presentation | `openclaw/openclaw#121204` protected head                                                        | `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9` | live PR head and `origin/codeagent/121204-current-drift-6ae89b5a-20260827` equal; stale local `upstream/pr-121204` is not evidence |
| Docs / proof | `savegame/20260830-1524PDT/121204-pending-row-admissibility-order-cure-6fdf0e99`                 | `6fdf0e99b46b3296631a38eb55abf4012bc8a718` | tracking and server equal; read-only                                                                                               |

## Verdict

**CONFIRMED_CANDIDATE_CLEAN_BROAD_RED**

No blocking findings. `6fdf0e99b46b3296631a38eb55abf4012bc8a718`
repairs the rejected malformed-pending-row boundary with one Discord-owned
stored-row decoder shared by pre-claim stale policy and canonical claim-time
decode. The full stale-policy/fail-open matrix and generic queue ownership remain
intact. Exact Mode-B is red, but all 13 deterministic failures and their 23
test/owner files are byte-identical to pinned upstream and disjoint from the four
successor paths.

**Current-SHA behavioral proof:** YES, deterministic owner-boundary proof at exact
product SHA `6fdf0e99`; no new live Discord execution was performed.

**Runtime-composite preparation:** NO. The exact
`gitnexus-121204-6fdf0e99` impact result running on Ronan was not available before
report freeze. This review must not grant composite permission without that
separate acceptance input.

PR: https://github.com/openclaw/openclaw/pull/121204

By: Emeric🕯️ (@emeric-dandelion-cult, account created 2026-05-25) |
OpenClaw last 12 months: 1 PR, 0 issues, 0 default-branch commits | GitHub
contribution graph last 12 months: 100 commits, 39 PRs, 31 issues, 35 reviews.

Production LOC: +33/-15 (net +18) | Tests: +65/-7 | Docs: +4/-3 |
Assertion baseline: +1/-1.

## Exact successor identity and history

- Final commit: `6fdf0e99b46b3296631a38eb55abf4012bc8a718`
- Final tree: `7a0b487259bc9c880ce17bbad715a17b74f2e89c`
- Final parent: `ad2b2986589e8d498665f00902977a70e16ff9ec`
- Rejected clean predecessor:
  `9064175c4b795291b336eecea8f964af8f92cb78`
- Rejected independent review:
  `17b937e1afe9bd6a0a819514ad98809526c2561e`; its sole delta from
  `9064175c` is `output.md`
- Pinned upstream:
  `43a7cb3c92c7b5b8d5ddd56d9d157c009e0c85e5`
- Original protected PR head:
  `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`
- `9064175c`, pinned upstream, and the protected PR head are all ancestors of
  `6fdf0e99`.

The successor range is three additive commits:

| Commit                                     | Purpose                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `a0d328efd0358d042af2e1ffd59702b940581d15` | captures the three missing malformed-row negative controls and the valid stale positive control       |
| `ad2b2986589e8d498665f00902977a70e16ff9ec` | shares admissibility decoding between stale policy and claim-time decode; corrects public timing docs |
| `6fdf0e99b46b3296631a38eb55abf4012bc8a718` | shrinks the assertion baseline from 5 to 4 for `extensions/discord/src/monitor/ingress.ts`            |

Successor paths:

```text
config/assertion-safety-baseline.txt
docs/plugins/sdk-channel-outbound.md
extensions/discord/src/monitor/ingress-corrupt-pending.test.ts
extensions/discord/src/monitor/ingress.ts
```

All 11 first-parent authored commits after protected head `4435e132` through
`6fdf0e99` parse exactly one
`Refs: openclaw/openclaw#121204` trailer and exactly one
`Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer.

## Ownership and admissibility

The owning path is:

1. Discord admission serializes the raw `MESSAGE_CREATE` frame and durable
   channel kind in `extensions/discord/src/monitor/ingress.ts:567-579`.
2. `readDiscordIngressPendingRow(...)` is the sole stored-row decoder
   (`extensions/discord/src/monitor/ingress.ts:172-217`).
3. Claim-time `payload.decode` calls that decoder
   (`extensions/discord/src/monitor/ingress.ts:579`); rejection becomes the
   canonical non-retryable `invalid-event`
   (`extensions/discord/src/monitor/ingress.ts:679-681`).
4. Discord's pre-claim resolver calls the same decoder before any stale-policy
   branch (`extensions/discord/src/monitor/ingress.ts:629-669`). A null result
   returns no disposition, leaving the row claimable for step 3.
5. Core applies only a channel-returned disposition through the existing
   CAS-fenced `queue.fail(...)` path
   (`src/channels/message/ingress-drain-pending-disposition.ts:66-128`), then
   generic `claimNext` owns retained rows
   (`src/channels/message/ingress-drain.ts:573-688`).

The shared decoder positively validates:

- durable payload version `1`;
- raw message/event ID equals the durable record ID;
- `channel:<raw channel_id>` equals the durable lane;
- required stale-policy message structure: string `content` and `timestamp`,
  record-only `mentions` and `attachments` arrays, boolean
  `mention_everyone`, and record-or-null reply/reference fields.

There is no second partial decoder or malformed-row stale-policy special case.
The generic seam remains channel-agnostic, and the unchanged monitor still
rechecks decoded event/lane identity after claim.

**Best-fix verdict:** best. It repairs validation at the Discord composition
boundary and reuses that boundary for both consumers.

**Alternatives considered:** adding three checks only inside the stale resolver
would duplicate policy and drift again; teaching core about Discord payloads
would violate plugin ownership; moving stale policy after claim would abandon
the bounded pre-claim terminalization that frees a blocked lane.

## Stale-policy and lifecycle review

The successor does not weaken the previously reviewed product behavior:

- valid mention-required, non-thread, stale ambient guild rows still terminate
  as `stale-ambient-backlog`;
- `requireMention:false` direct-open rows remain dispatchable;
- DMs, group DMs, threads, and unknown channel kinds fail open;
- unresolved guild policy and unresolved named-channel policy fail open;
- direct mentions, raw mentions, replies to the bot, `@everyone`, active or
  uncertain text controls, audio mention candidates, and hydratable replies
  remain dispatchable;
- retry-delayed stale heads, deep same-lane backlog, CAS loss, observer failure,
  restart recovery, resubmit, duplicate/re-enqueue, later-pass processing, and
  fresh same-lane progression preserve generic lane and queue ownership;
- shutdown, abort, claim fencing, retry, and adoption paths are unchanged from
  the reviewed predecessor.

The public docs now accurately say the callback covers only the pass's bounded
disposition window and may stop before `maxEvents`
(`docs/plugins/sdk-channel-outbound.md:87-91`).

## Deterministic replay

The rejected run used a detached exact `9064175c` worktree, the exact
`a0d328e` test byte as a test-only negative control, unchanged rejected
production bytes, and the same-host dependency tree whose `package.json`,
`pnpm-lock.yaml`, and `pnpm-workspace.yaml` blobs equal both candidate refs.

At rejected `9064175c`:

| Row                                            | Observed result                     |
| ---------------------------------------------- | ----------------------------------- |
| payload version `2`                            | incorrectly `stale-ambient-backlog` |
| raw event ID differs from durable ID           | incorrectly `stale-ambient-backlog` |
| derived channel lane differs from durable lane | incorrectly `stale-ambient-backlog` |
| following fresh same-lane row                  | dispatched in every case            |
| valid stale ambient control                    | correctly `stale-ambient-backlog`   |

Result: 8 pass / 3 expected failures. Each failure was the exact
`invalid-event` versus `stale-ambient-backlog` mismatch; the assertion first
proved the fresh row dispatched, so the failures did not abort the pump.

At final `6fdf0e99`, the identical 11-case test byte passed:

- all three malformed rows became `invalid-event`;
- no malformed row became `stale-ambient-backlog`;
- every following fresh same-lane row dispatched;
- the valid stale ambient control remained `stale-ambient-backlog`;
- no pending row remained.

Focused final owner proof, repository runner and one worker:

| Scope                                                      | Result |
| ---------------------------------------------------------- | ------ |
| six Discord ingress/policy suites                          | 80/80  |
| generic pending-disposition, freshness, and monitor suites | 45/45  |

Commands:

```text
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 extensions/discord/src/monitor/ingress-corrupt-pending.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.extension-discord.config.ts --maxWorkers=1 extensions/discord/src/monitor/ingress.test.ts extensions/discord/src/monitor/ingress-stale-direct-config.test.ts extensions/discord/src/monitor/ingress-channel-kind.test.ts extensions/discord/src/monitor/ingress.direct-open-stale.fossil.test.ts extensions/discord/src/monitor/ingress.import-boundary.test.ts extensions/discord/src/monitor/ingress-corrupt-pending.test.ts
node scripts/run-vitest.mjs run --config test/vitest/vitest.channels.config.ts --maxWorkers=1 src/channels/message/ingress-drain-pending-disposition.test.ts src/channels/message/ingress-drain.freshness.test.ts src/channels/message/ingress-monitor.test.ts
```

## Static, gates, and structured review

- Exact product Mode-B static artifact: all five gates passed:
  `check (typecheck+lint+duplicates+guards)`, UI raw-window guard,
  protocol generation, plugin asset build, and `build:strict-smoke`.
- The check log records assertion-safety ratchet success over 4,179 files and
  Oxlint completion for core, extensions, and scripts. The baseline independently
  shrinks only `extensions/discord/src/monitor/ingress.ts` from 5 to 4.
- There is no retained standalone exact-final `check:changed` or
  targeted-Oxlint receipt. Exact-final full static is stronger for the covered
  typecheck/lint/guard/build surfaces; the routing plan separately proves exact
  changed-path routing.
- Exact-final Knip `6.32.2` passed both canonical `deadcode:full` scans with no
  reported unused files/exports. `XDG_CACHE_HOME` and
  `npm_config_store_dir` were lane-local. The outer `pnpm deadcode:full`
  wrapper hit a host pnpm shim syntax error, so its two package-script commands
  were executed directly with the same pinned tool and both exited zero; empty
  compact output was inspected rather than trusting exit status alone.
- Gate 2.5 recomputation enumerated 3,477 pinned-upstream-touched tests and found
  zero intersections with the candidate path set.
- Gate 2.7 remains a verified relocation of
  `hasRawDiscordUserMention`, not a dropped behavior. Both current callers use
  `extensions/discord/src/monitor/message-handler.raw-mention.ts`, and those
  owner paths are byte-unchanged from the rejected predecessor.
- Structured Autoreview over `9064175c..6fdf0e99` used Codex
  `gpt-5.6-sol`, high reasoning, and returned no P0 findings with overall
  correctness `patch is correct` at confidence `0.98`.
- `git diff --check` passed.

## Mode-B `33335965349`

| Receipt                | Audited value                                 |
| ---------------------- | --------------------------------------------- |
| Product input          | `6fdf0e99b46b3296631a38eb55abf4012bc8a718`    |
| Workflow `headSha`     | `d05778e6a96dd9a96946eff483e80c4d9ff9575e`    |
| Terminal result        | failure                                       |
| Routing receipts       | 69/69 valid                                   |
| Planned/routed shards  | 167/167                                       |
| Summaries              | 168                                           |
| Dist variants          | both executed; one passed, TUI variant failed |
| Static gates           | 5/5 passed                                    |
| Discord shard          | 3,111 passed / 0 failed                       |
| Full tally             | 179,886 passed / 18 failed                    |
| Deterministic failures | 13                                            |
| Load flakes greened    | 6                                             |

All six deterministic failing shard summaries retained their deterministic red
classification; no deterministic failure was laundered green. Six separately
classified load flakes did green on retry, and the report keeps that distinction
explicit.

The 13 deterministic failures cover TUI PTY (2), plugin package security scan
(1), Gateway runtime (2), release-state tooling (6), Gateway usage (1), and
Telegram (1). I compared all 23 implicated test and owner files against pinned
upstream: every byte is identical between `43a7cb3c` and `6fdf0e99`, and none
intersects the four successor paths. The broad run therefore remains red, while
none of its deterministic reds is attributable to this candidate.

The unrelated Codex package-scan owner was also checked against sibling
`../codex` at `50ea8fd411422b3f7bc906bcde6c1c4432019a2`, including app-server child
process lifetime and explicit reap behavior in
`codex-rs/app-server/tests/common/test_app_server.rs:148-163`,
`codex-rs/app-server/tests/common/test_app_server.rs:263`, and
`codex-rs/app-server/tests/common/test_app_server.rs:2113-2130`. No Codex
protocol/runtime change is part of this successor.

## GitNexus and remaining uncertainty

The permitted fork is present:

- executable: `/home/figs/.local/bin/gitnexus`;
- version: `1.6.5`;
- executable SHA-256:
  `8309aeb6858023f5cb3ff4ae8416b64c1989e4fe04d82dd822964127ed1355ca`;
- fork checkout:
  `/home/figs/flesh_beast_best_beast/source/GitNexus`;
- fork SHA: `3c1e686edfc1acaac882927cada121ddd7c47bcc`;
- remote: `https://github.com/karmaterminal/GitNexus.git`.

This Cael host reports the OpenClaw repository as not indexed. The exact
`gitnexus-121204-6fdf0e99` index was stated to be running serially on Ronan, but
its exact impact result was unavailable here at freeze. No stock `npx`, alternate
graph, or local re-index was substituted.

**Remaining uncertainty:** exact Ronan GitNexus impact is pending, and no new
live Discord backlog execution was performed at `6fdf0e99`. The source-byte
review and deterministic current-SHA owner proof support the clean-candidate
verdict; the pending graph result is why runtime-composite preparation remains
NO.
