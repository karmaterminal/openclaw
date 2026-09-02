# Detached review: openclaw/openclaw#121204 surviving subset

## Verdict

`REQUEST_CHANGES_121204_SURVIVING_SUBSET`

The detached surviving candidate is historically clean and substantially narrower
than the original PR, but it does not yet implement the stated production behavior.
The primary blocker is that the durable `channelKind` fact is derived from a field
that normal Discord `MESSAGE_CREATE` gateway payloads do not contain. Two additional
policy branches can dispose work that the review contract explicitly requires to
remain claimable.

## Frozen identity and provenance

- Candidate: `a1be254a3f0d2659b30abb2402636d4bd99e001f`
- Candidate tree: `9c64dbfb64ff8f1f8ff005fe2b9228dfc74c5555`
- Frozen base: `b057266d78d0c6a829029484b0006acc121127f9`
- Candidate ancestry: exactly two commits:
  1. `17e1541c0e64206f5549eefc4d9517a8434fcd6b`
  2. `a1be254a3f0d2659b30abb2402636d4bd99e001f`
- Both commits are authored and committed by
  `emeric-dandelion-cult <287618920+emeric-dandelion-cult@users.noreply.github.com>`.
- Both commits contain
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- The safe branch still resolves to the candidate:
  `karmaterminal/openclaw:reauthor/121204-surviving-detached-review` ->
  `a1be254a3f0d2659b30abb2402636d4bd99e001f`.
- Immutable tags resolve exactly:
  - `savegame/121204-frozen-b057266d78d` ->
    `b057266d78d0c6a829029484b0006acc121127f9`
  - `savegame/121204-original-4435e132ffb` ->
    `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`
  - `savegame/121204-surviving-a1be254a3f0` ->
    `a1be254a3f0d2659b30abb2402636d4bd99e001f`
- The original PR remains open at
  `4435e132ffb5b7d34fa05ad2c9bc275a24f565e9`; no PR-head update was made.

## Historical subtraction

The original head, its source commits, frozen upstream, and superseding
openclaw/openclaw#129717 were compared by commit and file bytes.

- Frozen base already contains the merged #129717 commit
  `8cf4351e8fc17cd9084cce2bb7f5469a62bbf2e4`.
- #129717 owns the bounded `candidateWindow`, `scanLimit` normalization, and
  forward-only candidate cursor in `src/channels/message/ingress-drain.ts`.
- The candidate leaves those bytes in place. Its shared-drain delta only adds the
  opt-in pending-disposition call before the existing window, carries one frozen
  `now` value through retry-delay evaluation, and adds race-lost lane keys to the
  blocked set.
- No candidate-added production line restores FIFO, freshness, oldest-row,
  candidate-window, or max-candidate policy. The only added window reference is a
  test name asserting that disposition runs before the existing upstream window.
- Original methodology expansions were removed: no
  `ingress-drain.freshness.test.ts`, retry-delay suite, extracted
  `ingress-drain-state.ts` change, import-boundary proof, fossil suite, report,
  deployment, continuation, composite, or presentation content survives.

Relevant original source commits were walked individually, including
`2b2019202ff`, `b958ca22efd`, `bd0a6147391`, `c5389927a14`, `cb64db6ec27`,
`077d6811d44`, `4faac31782f`, `5d0426bbedf`, and `4435e132ffb`. The detached
candidate is a two-commit reauthoring rather than a patch-identical replay of those
commits.

## Size and ownership

The requested size classification is exact:

| Class              |      Delta |
| ------------------ | ---------: |
| Production         | `+504/-44` |
| Tests              |  `+329/-3` |
| Docs               |    `+6/-0` |
| Assertion baseline |    `+1/-1` |

Every surviving production file has a direct ownership role:

- `src/channels/message/ingress-drain-pending-disposition.ts` owns the generic,
  opt-in fail-only policy result and compare-and-set race fence.
- `src/channels/message/ingress-drain.ts` invokes that seam before claim and feeds
  lost-race lanes into canonical lane blocking.
- `extensions/discord/src/monitor/ingress-stale-policy.ts` owns all Discord-only
  stale/addressability policy.
- `extensions/discord/src/monitor/ingress.ts` owns durable payload encoding,
  claim-time decoding, and Discord policy wiring.
- `extensions/discord/src/internal/listeners.ts` attempts to type the additional
  raw gateway channel fact.
- `extensions/discord/src/monitor/message-handler.ts` supplies the existing
  Discord configuration, bot identity, guild entries, and thread bindings.
- The preflight helper/raw-mention files move the existing raw-mention predicate
  without changing its behavior so both preflight and stale policy can reuse it.
- The assertion baseline records the one removed assertion in Discord ingress.

The generic seam is justified at the shared queue/drain ownership boundary:
Discord cannot atomically fail a pending row and fence a lost-claim lane from
outside the drain. It is narrowly typed to an opt-in, fail-only disposition over an
unvalidated record plus `{ laneKey, now }`; it adds no channel identity, freshness,
window, cancellation, observer, or abandonment framework. A Discord-only wrapper
would either duplicate drain scheduling or leave a race between an external scan
and canonical claim.

## Correctness defects

### 1. Production gateway messages do not populate durable `channelKind`

`extensions/discord/src/monitor/ingress.ts:135` derives the fact exclusively from
`rawMessage.channel_type`. Discord's normal `MESSAGE_CREATE` message object does
not include that field. The local gateway confirms the problem:
`extensions/discord/src/internal/gateway.ts` forwards `payload.d` unchanged, and
its representative raw-envelope test contains no `channel_type`.

The candidate's new persistence tests inject synthetic `channel_type` values
directly into `monitor.accept`, bypassing the real gateway shape. In production,
`channelKind` therefore remains undefined and
`extensions/discord/src/monitor/ingress-stale-policy.ts:287` fails open for every
ordinary guild row. The requested stale-ambient fence is effectively absent for
normal Discord traffic.

**Smallest repair:** obtain a positive channel-kind fact from an authoritative
Discord-owned source at the gateway/admission boundary without delaying the durable
append on network I/O, persist that fact, and add one gateway-to-ingress integration
test using a real `MESSAGE_CREATE` envelope with no synthetic `channel_type`.
Unknown kinds should continue to fail open.

### 2. Fully hydrated replies can be permanently disposed

`extensions/discord/src/monitor/ingress-stale-policy.ts:149-165` retains only a
reply whose referenced message still needs hydration. A valid hydrated reply to a
non-bot falls through and can be failed as `stale-ambient-backlog`. The original
matrix explicitly demonstrates this behavior with its
“known non-bot reply” case, but the requested surviving semantics require
conservative preservation of reply work.

**Smallest repair:** treat every ordinary Discord reply
(`MessageType.Reply` with a default message reference) as retained work before
stale disposition; keep malformed or non-default references fail-open.

### 3. Unresolved configured-channel membership is treated as disposable

`extensions/discord/src/monitor/ingress-stale-policy.ts:303-313` returns disposable
when a guild has configured channels but the stored raw row lacks enough cached
channel/parent metadata for `resolveDiscordChannelConfigWithFallback` to find a
match. Canonical dispatch can later hydrate and resolve that channel, so this is
ambiguous work and must not be terminally failed.

**Smallest repair:** when configured channels exist, require a positively resolved
allowed channel before permitting stale disposition. An unresolved
`channelConfig` must return retained/fail-open.

## Confirmed invariants

- Successful disposition uses the queue's durable `fail(id, ...)` compare-and-set
  and survives restart/replay in the failed table.
- A lost disposition CAS retains the row and blocks its lane for the current pass,
  preventing later same-lane work from overtaking the winning claimant while
  unrelated lanes continue.
- Channels that do not provide `resolvePendingDisposition` retain existing behavior;
  no non-Discord channel acquires Discord policy.
- Malformed policy fields and corrupt payloads return no pre-claim disposition,
  reach canonical claim-time decoding, fail as `invalid-event`, and do not block an
  unrelated lane.
- Current work, DMs, bot mentions, cached/unhydrated threads, bot replies,
  configured mention patterns, identity/emoji patterns, everyone mentions,
  audio-only mention candidates, text control commands, and bound threads remain
  claimable in the exercised matrix.

These invariants do not cure the three defects above.

## Differential execution and gates

All commands used Node `v24.17.0`.

- Candidate committed focused tests: 17/17 passed across
  `ingress-drain-pending-disposition.test.ts` and Discord `ingress.test.ts`.
- Frozen-base differential:
  - durable kind: 2 expected failures;
  - stale fence/restart: expected failure;
  - malformed-row lane progress: expected failure;
  - generic pending disposition/CAS fence: 2 expected failures.
- Original focused tests against candidate:
  - channel-kind and corrupt-payload suites: 17/17 passed;
  - original Discord ingress matrix: 26/28 passed. The only failures were the two
    structured debug-receipt assertions intentionally excluded from this surviving
    subset; all addressability and stale-policy cases in that matrix passed.
- Production and test TypeScript checks passed:
  `pnpm tsgo:prod` and `pnpm tsgo:test`.
- `pnpm build` passed with no ineffective dynamic-import warning.
- Full `pnpm check` passed.
- Knip production scan passed: `pnpm deadcode:knip`.
- Barnacle safety passed: 47/47 targeted tests.
- `.github/labeler.yml` parsed successfully with 170 labels and is byte-untouched
  by the candidate.
- Scoped Autoreview against the frozen base returned three findings and overall
  `patch is incorrect` at confidence `0.96`.
- Independent semantic review separately confirmed defect 1 from the local gateway
  forwarding path and representative gateway test.
- `git diff --check` passed.

The frozen revision does not define the later `plugin-sdk:api:check` package
script, so no such gate exists at this base; production/test typechecks and the
build exercised the changed public callback shape.

## One-time current-upstream recheck

Current upstream `main` was fetched once at
`ff6fb73f01205480c15c2863cd04ea0539380b2f`.

- No path or rename from frozen base to current main intersects any candidate path.
- `git merge-tree --write-tree` produced the clean tree
  `13cda76a4cca43b5b542b1896b96030d7aae5bd6`.
- Current main contains no `stale-ambient-backlog`,
  `resolvePendingDisposition`, or `DiscordIngressChannelKind` implementation.
- No later upstream commit supersedes a surviving semantic.

## Exclusion check

The candidate contains no `src/skills/**`, openclaw/openclaw#124337 behavior,
abandonment/cancellation work, continuation content, composite content,
deployment/proof material, reports, or presentation assets. This review did not
modify the candidate branch, original PR branch, #124337, continuation, composite,
proof, presentation, or original PR head.
