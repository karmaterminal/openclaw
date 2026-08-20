# PR #121204 — P1/P2 repair and current-upstream back-merge

Lane: `codeagent/121204-p1p2-backmerge`
Upstream PR: `openclaw/openclaw#121204`
Bound fork issue: `karmaterminal/openclaw#1246`
Scope: Discord durable ingress. Not continuation work; no continuation
assembly or presentation ref is touched.

## 1. Exact identity

| Item | Value |
| --- | --- |
| Final head | `c5389927a14b7844b121a375bfa83f318a8e627f` |
| Head tree | `31bea4343293c35dcd9970110e4f5a3cd5cc3c63` |
| Merge commit | `62cfaef0c34ab34137a6aa34e4f15b29d7a595d0` |
| Merge parent 1 (PR head, preserved ancestor) | `b958ca22efd5e67de16746d1341d6bea7c594847` |
| Merge parent 2 (frozen upstream) | `689ab6ec82b638f282c98f25599a4919e7e86da5` |
| Merge base (PR head ∩ upstream) | `cb50289e28369f61cab6572e3952879f8854b17c` |
| PR-creation commit (`PRC`) | `2b2019202ffdbcdb0393a76be9d0ecdcb48489fe` |

First-parent history from the PR head:

```
c5389927a14 docs(channels): accept the pre-claim ingress disposition as a plugin contract
bd0a6147391 fix(discord): persist an authoritative channel kind for stale ingress
62cfaef0c34 Merge upstream main 689ab6ec into PR #121204 durable ingress repair
b958ca22efd  (PR head, unchanged ancestor)
```

Topology is an ordinary two-parent `--no-ff` back-merge followed by two normal
commits. No rebase, squash, amend, force-push, or history rewrite. Gate 1
savegame `savegame/20260820-0706Z/pr-121204-pre-repair-b958ca22` is untouched,
and `codeagent/wo1229-upstream-pr` was never modified or pushed.

### Upstream re-baseline at dispatch

The workorder froze `c15f31df4942f2d70359f7bbc73d69f2c7618c0c` (2026-08-19
23:45 PDT). At lane start `upstream/main` had advanced 4 commits to
`689ab6ec82b638f282c98f25599a4919e7e86da5` (2026-08-20 04:04 −03:00);
`c15f31df` is an ancestor of it. Per workorder A.2 the newer exact SHA was
recorded and used as the single frozen merge parent. The delta (4) is far below
the runbook's stacking-complexity threshold (10), so no pause was required. No
second upstream tip was chased at any point in this lane.

## 2. ClawSweeper P1/P2 disposition

| Finding | Disposition |
| --- | --- |
| **[P1] Carry an authoritative channel type into stale expiry** (`ingress.ts:280-304`) | **Fixed.** Durable admission now resolves and persists a closed `channelKind` from the raw gateway envelope; the stale fence consumes the persisted fact (falling back to the stored frame's own `channel_type` for rows admitted earlier). Unknown persists nothing and fails open. Covered by raw MESSAGE_CREATE-shaped tests, not synthesized fields. |
| **[P1] Keep malformed pending payloads on the canonical failure path** (`ingress.ts:475-486`) | **Fixed.** Both disposition callbacks narrow through one shared reader; a row that cannot be narrowed is retained so the canonical claim-time codec fails it once as `invalid-event`. Proven red without the fix. |
| **[P1] Resolve merge risk — SDK contract decision** | **Accepted as a documented contract**, not as new exported symbols. See §6. |
| **[P1] Resolve merge risk — branch dirty against current main** | **Fixed.** Current upstream back-merged; PR surface vs upstream is 21 files. |
| **[P2] Maintainer must choose the SDK direction first** | Direction taken: accept the typed hook, document lifecycle/failure/race, keep it optional and reachable only through the monitor factory. |
| Improve patch quality — persist a non-thread fact + raw-shaped test | Done (`ingress-channel-kind.test.ts`). |
| Improve patch quality — route malformed payloads through invalid-event + prove a following fresh message progresses | Done (`ingress-corrupt-pending.test.ts`). |
| Improve patch quality — resolve SDK decision, rebase, publish exact-head proof | SDK decision resolved; back-merged (not rebased, per fork doctrine); exact-head live proof is Scribe's step (§9). |

## 3. GitNexus

Gate 0 evaluated before any attempt: 121 GB total RAM, 44–48 GB available,
load average ≈2.1 on 20 cores. OpenClaw-source is Large class (min 64 GB,
recommended 128 GB by total RAM), so the seat qualifies and exactly one bounded
`gitnexus analyze --index-only --skip-git` attempt was made against this exact
worktree with `GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1` and a hard 2700 s bound.

<!-- GITNEXUS-OUTCOME -->

**Outcome: no exact index.** The single attempt ran to its 2700 s bound
(45:0x elapsed, peak RSS ≈9.8 GB, seat never below 39 GB free) and exited
without writing `.gitnexus/` or a registry entry, so no graph exists for
`c5389927a14`. It reached the parse phase — it reported 6 skipped >512 KB files
and 1092 skipped Swift files (vendored `tree-sitter-swift` has no prebuilt
`.node` for this arch) — but did not reach graph persistence inside the bound.
Per the workorder no second attempt was made.

Consequences recorded honestly:

- Index path: none. Indexed SHA: none. Staleness: n/a.
- `detect_changes` was **not** run; it requires an exact index.
- The nearest pre-existing graph
  (`openclaw-85651-upstream-530b33e-gitnexus@530b33e`) is discovery-only and
  cannot certify current bytes, so it was not used for any claim.


Source trace used as authority regardless of index state (exact source, history,
and tests, per the runbook fallback):

- Admission → durable queue: `extensions/discord/src/monitor/message-handler.ts:41`
  (`ingress.accept`) ← `DiscordMessageListener.handle`
  (`extensions/discord/src/monitor/listeners.ts:70`) ←
  `GatewayPlugin.handleDispatch` (`extensions/discord/src/internal/gateway.ts:424-428`),
  which forwards raw `payload.d` **unmapped** for `MESSAGE_CREATE` only.
- `createDiscordIngressMonitor` (`extensions/discord/src/monitor/ingress.ts`)
  has exactly one production caller: `createDiscordMessageHandler`
  (`extensions/discord/src/monitor/message-handler.ts:17`), overridable in tests
  through `params.testing.createIngressMonitor`.
- `createChannelIngressMonitor` (`src/channels/message/ingress-monitor.ts:184`)
  is exported through `src/plugin-sdk/channel-outbound.ts` and used by
  discord, slack, imessage, tlon, twitch, irc, zalouser, sms, qqbot, msteams,
  mattermost, nextcloud-talk and the generic
  `src/plugin-sdk/channel-ingress-runtime.ts` facade.
- `createChannelIngressDrain` (`src/channels/message/ingress-drain.ts:117`)
  has two production callers: the monitor (`ingress-monitor.ts:309`) and
  `src/plugins/registry-runtime.ts:659`.
- Pending-disposition owner: `applyIngressPendingDispositions`
  (`src/channels/message/ingress-drain-pending-disposition.ts`), called once per
  drain pass from `drainOnce` (`src/channels/message/ingress-drain.ts:663`)
  before `queue.claimNext`.
- Claim → dispatch: `dispatchClaimedEvent` (`ingress-monitor.ts:319`) decodes the
  versioned payload, re-runs `inspect`, rejects identity mismatch, then calls the
  channel `deliver`.

## 4. Conflict journal

Four textual conflicts, all resolved additively toward one canonical path.

| File | Upstream | PR head | Resolution |
| --- | --- | --- | --- |
| `src/channels/message/index.ts` | Deleted by #124554 (vestigial re-export barrel) | Added 4 pending-disposition type re-exports | **Deletion accepted.** Nothing else imports the barrel; upstream had already migrated `src/plugin-sdk/channel-outbound.ts` to direct imports. The type re-exports are not reinstated (see §6). |
| `src/channels/message/ingress-drain.ts` | Moved `bindIngressLifecycleToReplyOptions` / `ChannelIngressDispatchLifecycle` into `ingress-drain-lifecycle.ts` | Re-exported both from `ingress-drain-state.ts` | Kept the PR's pending-disposition wiring; adopted upstream's relocation. Also removed a merge-produced stale import of `ChannelIngressDispatchLifecycle` from `ingress-drain-state.js`. |
| `src/channels/message/ingress-drain-state.ts` | Type + binder removed (moved to `ingress-drain-lifecycle.ts`) | Same extraction, different destination | **Duplicate dropped.** File returns byte-identical to upstream. One canonical home; no second path kept. |
| `src/channels/message/ingress-drain.test.ts` | Keeps `dead-letter needs both attempt floor and age`, adds `keeps retry-accounted abandonment pending beyond the failure threshold`, relocates the bind-lifecycle case to `ingress-drain-lifecycle.test.ts` | **Deleted** upstream's dead-letter test and reworked a type import | **Upstream taken wholesale.** The PR's deletion was a real coverage loss; restoring upstream recovers it plus the new abandonment case. |
| `extensions/discord/src/monitor/ingress.ts` | Added a drain `retryPolicy` block | Added `resolvePendingDisposition` / `onPendingDispositionCommitted` | **Additive:** both kept. |

Post-merge the PR surface against upstream is **21 files** (was 17 pre-merge,
minus the deleted barrel and the restored upstream test file, plus the new
repair tests and docs).

### Environment repair (not a code change)

The lane worktree symlinks a shared `node_modules`. After the back-merge,
`@openclaw/session-url-contract` (a workspace package new to upstream) had no
scope link, so `tsgo` reported one `TS2307` in the upstream-only file
`src/cli/session-ref.ts`. `tsconfig.json`, `src/cli/session-ref.ts`,
`packages/session-url-contract/**` are byte-identical to upstream, so this is the
stale-`node_modules`-after-merge class named in root `AGENTS.md`, not a code
defect. Repaired by adding the missing workspace symlink; no product file
changed. `pnpm install` was deliberately not run (shared clone, sibling lanes).

## 5. What changed, and why it is the right shape

### P1-B — authoritative channel kind (Discord-owned)

The freshness fence inferred a channel fact at *read* time from data the
*producer* never recorded. It was repaired at the producer:

- `serialize` (durable admission) resolves a closed
  `DiscordIngressChannelKind = "non-thread" | "thread"` from the gateway
  envelope and persists it with the row.
- `resolvePendingDisposition` consumes `payload.channelKind`, falling back to the
  stored frame's own `channel_type` for rows admitted before this change
  ("older durable rows may derive only from a trustworthy persisted/raw fact").
- Unknown or unrecognized kind persists nothing and returns `undefined`, so
  `canExpireDiscordStaleAmbientBacklog` refuses to expire it. An unhydrated
  thread is never suppressed.

Dependency proof: `channel_type` is a declared optional MESSAGE_CREATE /
MESSAGE_UPDATE envelope field —
`node_modules/discord-api-types/gateway/v10.d.ts:1329-1334`,
`GatewayMessageEventExtraFields.channel_type?: TextChannelType`. The resolver is
exhaustive over `TextChannelType`
(`node_modules/discord-api-types/payloads/v10/channel.d.ts:58`): three thread
members map to `"thread"`, six (`DM`, `GroupDM`, `GuildText`,
`GuildAnnouncement`, `GuildVoice`, `GuildStageVoice`) map to `"non-thread"`,
and nothing else is claimed.

Admission deliberately stays off the network path. Fork history proves the
alternative is worse: `56f9445dd53` hydrated an absent kind through the client,
and `c59b3ce1058` reverted it because the REST fetch sat in front of the durable
append and traded a replay bug for outright message loss on crash. The workorder
independently constrains read-side derivation to persisted/raw facts.

`extensions/discord/src/internal/listeners.ts` now types the MESSAGE_CREATE
boundary as `DiscordMessageCreateEvent = APIMessage & { channel_type?; guild_id? }`
so the envelope extras are visible where they actually arrive, and
`extensions/discord/src/internal/gateway.test.ts` asserts the raw frame reaches
the listener unmapped.

### P1-C — a poison pending row cannot abort the pump

`applyIngressPendingDispositions` awaits the channel hook inside `drainOnce`, so
a throw there aborts the entire pass — every lane, not just the poison row's —
before `claimNext` ever runs. With a JSON `null`, a primitive, or an object
without a usable message, reading `record.payload.rawMessage` threw exactly
there.

Fix: one shared non-throwing reader, `readDiscordIngressPendingRow`, is the
single narrowing rule for a stored Discord row. `inspectDiscordMessage` and
`decodeDiscordIngressPayload` are built on the same rule, so admission, claim,
and pre-claim agree by construction. A row that cannot be narrowed is *retained*,
reaches `claimNext`, and the canonical claim-time codec throws
`DiscordIngressPayloadError` → `resolveNonRetryableFailure` → terminal
`invalid-event`. No broad catch, no silent return, no success-shaped fallback;
claim fencing, retry accounting, and the payload-free receipt are untouched.

### D — direct-open causal semantics

Ported from the causal branch (`7871ecfeacf`, fossil `68023dba9d6`):
stale temporal validity is independent of `requireMention`, and a nested reply
payload whose `id` does not answer its own `message_reference.message_id` stays
hydratable (fail-open) instead of being read as proof of non-address.

### Owner boundary

Everything above is Discord-owned. `src/channels/message/ingress-drain.ts` keeps
only the PR's original generic freshness/ordering repair; no channel-specific
logic was added to core, and the drain now has a guard proving it (§6).

### Production LOC

Against the frozen upstream parent, the whole PR surface is:

| Bucket | Added | Removed | Net |
| --- | ---: | ---: | ---: |
| Production | 701 | 57 | **+644** |
| Tests / docs / scripts | 3128 | 6 | +3122 |

This lane's own contribution to production is **+124 net** (`ingress.ts` +
`listeners.ts`), justified as: the persisted authoritative fact and its closed
resolver (capability + ownership boundary), the single narrowing rule that
replaces three ad-hoc validators, and the typed gateway envelope that removes
scattered per-read casts. The two disposition callbacks *lost* their duplicated
age arithmetic to one named helper. Part E added zero production lines.

## 6. Part E — the pending-disposition contract (design fork, recorded)

ClawSweeper's maintainer decision was "accept a typed public disposition hook:
keep the generic seam, document its lifecycle and failure contract". That
direction is taken. It is delivered **as contract, not as new exported symbols**.

Reasoning, recorded because it is a deliberate divergence from the literal
reading of "export it from the SDK":

1. The PR's original type exports went to `src/channels/message/index.ts`, a
   **core-internal** barrel that upstream deleted. They were never plugin-visible.
   The exposure ClawSweeper flagged is structural — through
   `CreateChannelIngressMonitorOptions["drain"]`, which the SDK already exports.
2. The hook is installable exactly one way: the `drain` block of
   `createChannelIngressMonitor`. A plugin author gets full contextual typing
   without ever naming the types.
3. Re-exporting the four names from `openclaw/plugin-sdk/channel-outbound` trips
   the SDK surface budget three ways — `public exports 4345 > 4337`,
   `public deprecated exports 1136 > 1134`, `public deprecated exports in
   channel-message 136 > 132` — because `channel-message` wildcard-re-exports
   `channel-outbound` into a **deprecated** bucket the repo is ratcheting down.
   `src/plugin-sdk/AGENTS.md` forbids growing convenience re-exports and forbids
   hand-editing baselines/budgets to silence a check.

Delivered instead:

- Contract at the definition site (`ingress-drain-pending-disposition.ts`):
  pre-claim timing; the record payload has **not** been through the payload codec
  and must be narrowed; an unreadable row belongs to the canonical claim-time
  invalid-event path; throwing aborts the whole drain pass; the commit is
  CAS-fenced so a lost race fires no committed callback.
- `docs/plugins/sdk-channel-outbound.md` gains a **Pre-claim pending
  disposition** section covering both callbacks, timing, payload state, failure
  semantics (terminal write through the existing `queue.fail` path — no new queue
  API), and race behaviour. Both callbacks stay optional and backward compatible.
- `scripts/check-channel-agnostic-boundaries.mts` now protects
  `ingress-drain.ts` and `ingress-drain-pending-disposition.ts`, so the generic
  drain cannot acquire a channel-specific import.
- The pending-disposition suite locks the receipt contract: no committed callback
  on a lost CAS race, exactly one on a durable commit (with lane key), and the
  seam offers only pending rows — a claimed in-flight row is never re-offered and
  retained rows stay ordinary claim candidates.

No schema, config, environment, dependency, or public export change. The SDK
surface budget stays green.

If Scribe wants the four names exported anyway, that is a surface-budget
decision this lane deliberately did not take unilaterally.

## 7. Gates

### Gate 2 — cure-bytes preserved

```
OPENCLAW_BOOTSTRAP=<bootstrap> tools/feature-cores-byte-check.sh \
  b958ca22efd5e67de16746d1341d6bea7c594847 c5389927a14b7844b121a375bfa83f318a8e627f \
  tools/drift-cure-gate.primitive-cores.txt \
  --upstream 689ab6ec82b638f282c98f25599a4919e7e86da5
```

Result: **22 primitive-core invariants resolved; 0 FAIL** — 18 `PASS-UPSTREAM`
(exact upstream projection onto the PR head), 2 `PASS-TOMBSTONE`, 2 `PASS`.

Exit code 2 is **setup-class**, not a cure-bytes break: 13 patterns resolve to 0
files because they are the *continuation feature* cure-region
(`continue-work-tool*`, `continue-delegate-tool*`, `request-compaction-tool*`,
`continuation-tools-registration`, `run.continuation-opts-forward`). This lane is
Discord durable ingress on upstream main and legitimately carries none of them.
Every core that exists in this tree is preserved or is an exact upstream
projection, which is the invariant the gate protects.

### Gate 2.5 — semantic-conflict enumeration

```
git log cb50289e283..689ab6ec --name-only --pretty=format: \
  | grep -E '\.(test|spec|test-utils|test-support|test-harness|e2e-harness)\.[cm]?[jt]sx?$' \
  | sort -u
```

- 6346 upstream-touched test files in the delta.
- 251 of them live in the owning directories (`src/channels/message/`,
  `extensions/discord/`, `extensions/telegram/`).
- **Intersection with files this branch differs from upstream on: 2** —
  `extensions/discord/src/internal/gateway.test.ts` and
  `extensions/discord/src/monitor/ingress.test.ts`. Both are green.
- Loss check on the one heavily edited upstream test file: **zero upstream
  `it()` blocks are missing** from `ingress.test.ts`; the four "dropped" lines
  are helper signatures and imports the PR extended.
- The 251 owning-directory files are covered by the full project suite (§8).

Enumeration artifacts: `.gate-out/upstream-tests-changed.txt`,
`.gate-out/gate25-candidates.txt`, `.gate-out/our-surface.txt` (local only, not
committed).

### Gate 2.7 — upstream-content preservation

```
git fetch upstream
tools/drift-cure-gate.sh 689ab6ec82b6... HEAD 2b2019202ffd... .gate-out
```

21 files examined: 10 `SAFE-NEW`, 5 `GENUINE`, 5 `MIXED-CLOBBER`,
**1 `FROZEN-STALE`** (gate exit 1).

**FROZEN-STALE — `extensions/discord/src/monitor/message-handler.preflight-helpers.ts`
— resolved as a relocation false-positive.**

- HEAD blob `67350697fea` equals the upstream blob at `bbcfec9e96` (2026-07-19).
- Upstream added `hasRawDiscordUserMention` to that file after `bbcfec9e96`;
  the PR **moved** it to `extensions/discord/src/monitor/message-handler.raw-mention.ts`
  so the lazy `text-chunking` import stays off the pre-claim ingress module graph.
- The relocated function is **byte-identical** to upstream `689ab6ec`'s copy
  (verified line by line).
- Every caller is migrated: upstream's only consumer,
  `message-handler.preflight.ts:462`, now imports from
  `./message-handler.raw-mention.js` (line 65), and `ingress.ts:38` uses the same
  module.
- Layer B is file-scoped and cannot see a sibling file, which is exactly this
  shape. No upstream content is reverted; nothing to re-sync.

**MIXED-CLOBBER dispositions (all 5 recorded):**

| Dropped | File | Disposition |
| ---: | --- | --- |
| 5 | `src/channels/message/ingress-drain.ts` | **Intended replacement.** The dropped lines are the old FIFO-freshness code: `pending` built straight from `listPending`, the "any retry-delayed row blocks its lane" block, and candidate ids built from all pending rows. They are replaced by retry-eligible candidates and oldest-retained-row lane blocking — the PR's entire generic half. |
| 4 | `extensions/discord/src/monitor/ingress.test.ts` | **Intended.** Helper signature/import lines the PR extended (`createRawMessage` overrides, `payloadFor` receivedAt). Zero upstream `it()` blocks lost. |
| 2 | `extensions/discord/src/monitor/ingress.ts` | **Intended.** Old `APIMessage`-typed signatures and inline validation replaced by `DiscordGatewayMessage` and the shared narrowing rule. |
| 1 | `src/channels/message/ingress-drain.test-helpers.ts` | **Additive superset.** `{ text }` → `{ text; kind?: "ambient" \| "addressed" }`. |
| 1 | `extensions/discord/src/monitor/message-handler.preflight.ts` | **Relocation.** `hasRawDiscordUserMention` moved out of the `preflight-helpers` import list into a new import from `message-handler.raw-mention.js`. |

Net Gate 2.7 verdict: **no unresolved FROZEN-STALE and no upstream content
lost.** The single flagged row is a proven relocation; every MIXED row is a
deliberate, recorded replacement.

## 8. Test receipts

All runs used `node scripts/run-vitest.mjs run --config <owning-config>
--maxWorkers=1 <paths>`. No raw Vitest, no `pnpm test*` from the worktree.

| Suite | Config | Result |
| --- | --- | --- |
| `extensions/discord/src/monitor/ingress.test.ts` | extension-discord | 28/28 |
| `extensions/discord/src/monitor/ingress.direct-open-stale.fossil.test.ts` (#1246 fossil) | extension-discord | **14/14** |
| `extensions/discord/src/monitor/ingress-stale-direct-config.test.ts` | extension-discord | 11/11 |
| `extensions/discord/src/monitor/ingress-channel-kind.test.ts` (new) | extension-discord | 12/12 |
| `extensions/discord/src/monitor/ingress-corrupt-pending.test.ts` (new) | extension-discord | 5/5 |
| `extensions/discord/src/monitor/ingress.import-boundary.test.ts` | extension-discord | 1/1 |
| `extensions/discord/src/internal/gateway.test.ts` | extension-discord | 29/29 |
| generic drain + monitor (9 files) | channels | 73/73 |
| `ingress-drain-retry-delay` + `ingress-drain-lifecycle` | unit-fast | 4/4 |
| `ingress-queue` + dead-letters + health | channels | 40/40 |
| Telegram sibling control (4 files) | extension-telegram | 42/42 |

Static gates:

| Check | Result |
| --- | --- |
| `node scripts/run-tsgo.mjs -p tsconfig.core.json` | clean |
| `node scripts/run-tsgo.mjs -p tsconfig.extensions.json` | clean for every touched surface |
| `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.extensions.test.json` | clean |
| `node scripts/run-tsgo.mjs -p tsconfig.scripts.json` | clean |
| `oxfmt --check` on every touched file | clean |
| `node --import tsx scripts/check-channel-agnostic-boundaries.mts` | clean |
| `scripts/plugin-sdk-surface-report.mts --check` | clean (no budget growth) |
| `git diff --check` | clean |

Pre-existing environment reds, classified and **not** repaired in this lane:
`extensions/acpx/src/service.ts` and `extensions/cua-computer/**` fail
`tsgo:extensions` because the shared `node_modules` pins older `@openclaw/acpx`
and `@trycua/cua-driver` than the merged upstream source expects. Neither
extension is touched by this lane; this is the stale-shared-dependency class,
inherited from the back-merge, not caused by it.

### Regression proven red without the fix

With the narrowing removed from `resolvePendingDisposition` (payload read
directly, as at `b958ca22`), `ingress-corrupt-pending.test.ts` goes **4/5 red**
and the fresh addressed same-lane row is **never dispatched** — the exact
starvation the PR exists to fix. Restoring the narrowing returns 5/5.

### Full project suite

<!-- FULL-SUITE -->

## 9. Remaining uncertainty and exact-head live-proof plan

Known limits of this packet:

1. **No live gateway proof at this head.** The attached PR proof covers
   `b958ca22` on execution composite `0dec2856455`. This head is new and needs
   its own exact-head receipt.
2. **`channel_type` is optional on the wire.** Where Discord omits it, a row
   persists no kind and correctly fails open, so the fence does not engage.
   Live proof should record whether real retained rows carry `channel_type`; if a
   material fraction do not, the follow-up is a *read-side* hydration owner
   (never at admission), tracked separately from this packet.
3. **`extensions/acpx` / `extensions/cua-computer` typecheck reds** are
   environment-pinned dependency drift; a normal install resolves them and CI is
   the arbiter.
4. **SDK export names** were intentionally not added (§6). If Scribe wants them,
   it is a surface-budget change, not a code change.

Suggested exact-head proof for Scribe:

- Sanctioned exact-SHA CI:
  `gh workflow run openclaw-local-ci.yml --repo karmaterminal/openclaw-bootstrap -f ref=c5389927a14b7844b121a375bfa83f318a8e627f`
  (full 40-char SHA; an abbreviated ref dies in preflight).
- Fixed-head direct-open canary: a naturally aged retained real ambient row must
  settle as `stale-ambient-backlog` with attempts unchanged and no visible
  delivery, while a fresh addressed row on the same lane is answered.
- Corrupt-row canary: inject one unreadable pending row, confirm it lands in the
  failed table as `invalid-event` and that the next fresh same-lane addressed row
  is admitted.
- Build `PR-121204/PROOFS/c5389927a14b7844b121a375bfa83f318a8e627f/` from those
  receipts before deciding the plain fast-forward.

This lane opened no PR, requested no review, touched no seat, and pushed only
`origin/codeagent/121204-p1p2-backmerge`.
