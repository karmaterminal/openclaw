# release-notes lane journal — copilot/gpt-5.5

worktree: /home/figs/flesh_beast_best_beast/openclaw-wt-release-notes-20260429
branch: frond-scribe/20260429/release-notes-canonical2
base: v2026.4.24 (6507387f433d)
canonical2 tip at start: cf7830ffb3702bf7d826d70838893e2e41709f12 (#432 merge, 2026-04-30T01:59:53Z)
feature/context-pressure-squashed: 90db3699ccf3b6c7973dd3fdd9d489c8b507ff3f (squash-presenting branch)
workorder: /home/figs/flesh_beast_best_beast/WORKORDER-release-notes-20260429.md
started: 2026-04-29T19:10:25.570-07:00

## §0 guardrails — to be acked by walker on first commit

- Acknowledged workorder guardrails before repo edits: operate only in assigned
  worktree/branch; never touch the forbidden sibling runtime tree; no
  force-push/rebase/delete; GitHub read-only; no installs/tests/CI; no gateway
  or tmux interference; land nothing.
- Current branch/status at read checkpoint:
  `frond-scribe/20260429/release-notes-canonical2...origin/frond-scribe/20260429/release-notes-canonical2`;
  only pre-existing untracked `tmp-drop-me-release-notes.console.log` observed
  and left untouched.

## §1 required reads — read-completed checkpoint

- Read workorder first: release-notes artifact only, no merge; deliver
  `docs/release-notes/RELEASE-NOTES-DRAFT.md`,
  `docs/release-notes/PR-DESCRIBE.md`, and
  `docs/release-notes/VERIFICATION-PUNCHLIST.md`, plus delta inventory files.
- Ran `pnpm docs:list` before docs reads; command succeeded.
- Read repo root `CLAUDE.md` and `AGENTS.md`; noted docs wording rules,
  prompt-cache determinism guidance, strict no-redundancy conventions, and the
  instruction to read scoped guides before docs work.
- Read `docs/AGENTS.md`; noted Mintlify link rules, generic docs content
  policy, plugin terminology, and no localized docs edits.
- Full-read `docs/design/continue-work-signal-v2.md`; lifecycle frame:
  `continue_work`, `continue_delegate`, `request_compaction`,
  context-pressure, Task Flow delegate durability, OTel continuation spans, and
  the local-gateway-only durability/addressability trust boundary.
- Ran `git log --oneline v2026.4.24..HEAD`; current branch has journal seed
  commit `3f43fa721e` on top of canonical2 tip `cf7830ffb3`, whose audit-lane
  tail is #423 `c8f85f5254`, #427 `d0f31f65cc`, #428 `e73fd0f088`,
  #429 `dc572c0106`, #430 `15e045fe46`, and #432 `cf7830ffb3`.
- Required lifecycle canon captured from workorder: upstream tag -> inherited
  tag, main pristine and never merged -> new branch from tag -> apply feature
  -> swim -> fixup -> repeat -> final PR candidate -> squash to
  `feature/context-pressure-squashed`; current lane is step-7/8 transition and
  step-9 squash is owed by blood onto `feature/context-pressure-squashed`.
- Required figs directives captured for later citation:
  Discord msg `1499190884770779188` = stabilize canonical -> integration tests
  -> squash -> upstream PR; Discord msg `1499192062451978351` = keep
  `package.json` at `2026.4.24`, no fork-line/frond/shadow version string; PR
  `openclaw/openclaw#38780` comment `4321404750` = historical stopping rule,
  reference only and do not re-engage.

## §2 GitHub walk — GH-walk-noted checkpoint

- GitHub access used read-only commands only: `gh project item-list`, `gh pr
view`, `gh issue view`, and `gh api` GETs for review comments / the requested
  historical comment.
- Project 56 status snapshot:
  - #325 root issue: `in_coding_agent`.
  - #326 savegame convention: `Done`.
  - five-surface tracker: #335 chain accounting = `prince_review`; #334
    TaskFlow/OTel routing = `Todo`; #337 delegate-drain = `Done`; #336
    trigger-propagation = `Done`; #332 context-pressure isolation /
    session-delivery-queue integration = `Todo`.
  - #365 TaskFlow-only purge tracker: `Todo`.
- Audit-lane PRs on `cael/325-canonical2` all read:
  - #423 merged 2026-04-29T22:57:46Z at
    `c8f85f525466dbadc70791759c4c7db32318978a`; review thread included the
    `taskFlowDelegates` compatibility shim concern, resolved by `ac717c021a`
    landing an accept-and-ignore one-release shim.
  - #427 merged 2026-04-29T23:38:21Z at
    `d0f31f65cc1250e5300d1c45ac4feeda71100b18`; no comments/review comments.
  - #428 merged 2026-04-29T23:38:25Z at
    `e73fd0f088813ca125bab60a2cc54c08ac97ff07`; no comments/review comments.
  - #429 merged 2026-04-29T23:42:56Z at
    `dc572c01062a8da9a337039c87c1eb09288af640`; no comments/review comments.
  - #430 merged 2026-04-30T00:41:56Z at
    `15e045fe460f0fa00f14fdf29f95627d7200b789`; comment thread recorded the
    S2 finding that followup-runner persistence was orphaned for disk durability
    and filed #431.
  - #432 merged 2026-04-30T01:59:53Z at
    `cf7830ffb3702bf7d826d70838893e2e41709f12`; closes #431.
- Open PRs on canonical2:
  - #361 open, base `cael/325-canonical2`, head `ronan/otel-rfc-wiring`; RFC-only
    observability wiring for #335 with Codex review comments still visible.
  - #363 open, base `cael/325-canonical2`, head `cael/355-multi-recipient`;
    descriptor stage-1 with review comments around `targetSessionKey` /
    `targetSessionKeys` fail-open and post-compaction propagation hazards.
  - #368 open, base `cael/325-canonical2`, head
    `ronan/365-purge-taskflowdelegates-gate`; load-bearing TaskFlow-only purge
    lane. Review comment asks to keep `taskFlowDelegates` as a tolerated legacy
    config key so strict Zod validation does not hard-fail upgrades.
- Closed context entries:
  - #325 remains open with canonical2 re-attempt comments and 80-commit delta
    lineage notes.
  - #326 closed as adopted savegame convention.
  - #341 is a closed PR (`draft: revive canonical v2026.4.24 uptake lane`) and
    was superseded by canonical2 child-PR review topology.
  - #431 closed by #432; comment says the #432 fix wraps the
    `followup-runner.ts:485`-area persistence call in `updateSessionStore` and
    promotes S2 to live bug detector.
- Historical closed entries:
  - #338 closed by #362 because the original base was too old
    (`flesh_beast_figs/20260424-claude`); canonical2 successor merged as
    `ad6ac310c8`.
  - #339, #342, #343 were merged into canonical2; #344 resolves as an issue
    fallback (not a PR via `gh pr view`) for substrate-adoption-rule lint
    mechanization.
- Upstream historical stopping-rule comment read:
  `openclaw/openclaw#38780` comment `4321404750`, by
  `silas-dandelion-cult` at 2026-04-26T06:13:05Z, starts with
  `Implemented at HEAD (90db3699cc)` and is retained only as context per
  workorder. No re-engagement.

## §3 code walk — code-walk-noted checkpoint

Scoped guides read before source walk:

- `src/agents/AGENTS.md`: agent tests are import-bound; avoid broad runtime
  loads in tests and preserve exact production composition in named helpers.
- `src/gateway/AGENTS.md`: gateway startup/server paths should not materialize
  bundled plugin runtime unless needed.

Continuation delegate store / TaskFlow substrate:

- `src/auto-reply/continuation-delegate-store-taskflow.{ts,test.ts}`:
  expected by workorder, but not present at current tip. Actual canonical store
  is `src/auto-reply/continuation/delegate-store.ts`; compatibility path is
  `src/auto-reply/continuation-delegate-store.ts`.
- `src/auto-reply/continuation/delegate-store.ts`: canonical TaskFlow-backed
  delegate store; uses `createManagedTaskFlow`, controller IDs
  `core/continuation-delegate` and `core/continuation-post-compaction`, Zod
  validation for queued payloads, `finishFlow` with `releasedAt`, `failFlow`
  on corrupt records, FIFO filtering, and volatile delayed-reservation maps only
  for process-scoped timer handles.
- `src/auto-reply/continuation/delegate-store.test.ts`: mocks TaskFlow registry
  and pins enqueue/consume FIFO, session isolation, mode roundtrip,
  post-compaction controller separation, delay gating, and
  `peekSoonestUnmaturedDelegateDueAt`.
- `src/auto-reply/continuation-delegate-store.ts`: import-path shim to the
  canonical store. It explicitly says the volatile in-memory Map and
  `taskFlowDelegatesEnabled` gate are removed; post-compaction wrappers adapt
  `SessionPostCompactionDelegate` to canonical staged TaskFlow delegates.
- `src/auto-reply/continuation-delegate-store.test.ts`: legacy import-path smoke
  tests for pending delegates, delayed reservations, counts, and post-compaction
  staging through the shim.
- `src/auto-reply/continuation-delegate-store.post-compaction-substrate.test.ts`:
  #423 gate ensuring tool-side staging and runner-side consume resolve to the
  same module instance and do not strand post-compaction delegates on alternate
  substrates.
- `src/auto-reply/continuation-delegate.types.ts`: compatibility re-export for
  canonical types in `src/auto-reply/continuation/types.ts`.
- `src/auto-reply/continuation/types.ts`: canonical typed contracts for
  `ContinuationSignal`, mode-only `PendingContinuationDelegate`,
  `DelayedContinuationReservation`, runtime config, staged post-compaction
  delegates, `ContinueWorkRequest`, and `ChainState`.

Continuation runtime/state/scheduling:

- `src/auto-reply/reply/context-pressure.ts`: `checkContextPressure` computes
  threshold/90/95 bands, guards on usable fresh token data, emits
  `[context-pressure:fire]`, enqueues `[system:context-pressure]`, and mutates
  `lastContextPressureBand`.
- `src/auto-reply/reply/context-pressure.test.ts`: unit coverage for disabled /
  below-threshold cases, band escalation, dedup, stale token guards, custom
  thresholds, reset/refire, overflow ratios, and warn-level fire logging.
- `src/auto-reply/reply/context-pressure.integration.test.ts`: real
  system-event queue ordering proof: context-pressure event is visible before
  drain and consumed after prompt drain.
- `src/auto-reply/reply/continuation-runtime.ts`: reply-local runtime resolver
  for continuation defaults and clamping; mirrors the canonical continuation
  config shape.
- `src/auto-reply/continuation/config.ts`: canonical continuation runtime
  config resolver used by dispatch; hot-reload-at-enforcement, default delay /
  cap values, and `clampDelayMs`.
- `src/auto-reply/reply/continuation-runtime.test.ts`: pins clamping, fractional
  truncation, optional context threshold, zero delay overrides, and
  `resolveMaxDelegatesPerTurn`.
- `src/auto-reply/reply/continuation-state.ts`: reply-local timer/generation
  state and delegate-pending flags; workorder lists it, but canonical dispatch
  path now also uses `src/auto-reply/continuation/state.ts`.
- `src/auto-reply/reply/continuation-state.runtime.ts`: small runtime barrel for
  selected reply-local timer/generation helpers.
- `src/auto-reply/continuation/state.ts`: canonical chain state adapter; derives
  pending-delegate truth from TaskFlow, tracks timer handles/refs, centralizes
  `loadContinuationChainState` and `persistContinuationChainState`, and removes
  the old delegate-pending Map.
- `src/auto-reply/continuation/scheduler.ts`: chain/cost budget checks,
  `continue_work` timer scheduling, delayed bracket delegate reservations, and
  explicit no-generation-guard behavior.
- `src/auto-reply/continuation/delegate-dispatch.ts`: consumes TaskFlow
  delegates, arms hedge timers for unmatured entries, enforces
  `maxDelegatesPerTurn`, `maxChainLength`, and token cost caps, spawns with
  `[continuation:chain-hop:N]`, returns advanced chain state to callers, and
  dispatches post-compaction delegates as `silentAnnounce + wakeOnReturn`.

Compaction and tool surfaces:

- `src/auto-reply/reply/post-compaction-context.test.ts`: tests AGENTS.md
  section extraction, limits/truncation, symlink/hardlink escape rejection,
  `YYYY-MM-DD` date substitution, current-time injection, and custom
  `postCompactionSections` behavior.
- `src/agents/tools/request-compaction-tool.ts`: `request_compaction` tool with
  active-session/session-id preconditions, required reason, >=70% context guard,
  per-session 5-minute rate limit, in-flight dedup, async fire-and-forget
  compaction, background failure logging, and diagnostic volitional counters.
- `src/agents/tools/request-compaction-tool.test.ts`: pins precondition errors,
  threshold/rate-limit/dedup ordering, async return, background errors, reason
  truncation, per-session guard isolation, counter TTL, and required reason.
- `src/agents/tools/continuation-tools-registration.test.ts`: tool registration
  surface; `continue_delegate` appears only when continuation is enabled and
  drain is not explicitly false, `continue_work` appears when runner wires it,
  `targetSessionKey` is intentionally absent, and description points to
  `binary-canticle#11`; file documents the known 240s hot-test timeout concern.

Runner/announce persistence callsites:

- `src/agents/subagent-announce.ts`: `drainChildContinuationQueue` dynamically
  imports continuation runtime modules to avoid cycles, dispatches child
  `continue_delegate` queues after subagent settlement, persists returned child
  chain state in memory and via `updateSessionStore`, and logs drain/config
  failures. Silent delegate returns inject a system event and optionally
  `requestHeartbeatNow`.
- `src/agents/subagent-announce.continuation.test.ts`: validates bracket-origin
  hop seeding, canonical hop propagation, sticky silent-wake, max-chain and
  cost-cap rejection, grandparent reroute before cost guard, and no
  generation-drift cancellation for delayed hops.
- `src/auto-reply/reply/agent-runner.ts`: durable chain-state writer is local
  async `persistContinuationChainState` at ~1269; it updates active entry,
  active store, and disk with `updateSessionStore` plus legacy-key cleanup.
  Dispatch callsite ~2870 consumes tool delegates and ~2921 persists the
  returned advanced state. `git blame` confirms #427 merge
  `d0f31f65cc1250e5300d1c45ac4feeda71100b18` owns the r3164418100 durable
  write-back selection/comment and async call.
- `src/auto-reply/reply/followup-runner.ts`: followup turns drain
  `continue_delegate` queues, build chain state with this turn's tokens, and
  persist even when `dispatched === 0` per #428
  `e73fd0f088813ca125bab60a2cc54c08ac97ff07`. #432
  `cf7830ffb3702bf7d826d70838893e2e41709f12` wraps the prior bare mutation in
  `updateSessionStore`, fixing the #431 disk-durability orphan.

Config/schema and restart cross-walks:

- `src/config/zod-schema.continuation.test.ts`: schema boundary tests for
  continuation config values and the #423 one-cycle legacy
  `taskFlowDelegates` compat shim.
- `src/config/schema.base.generated.ts`: generated schema includes
  `continuation.taskFlowDelegates: {}` under strict `additionalProperties:
false`; this is the shim noted by #423, not manual behavior code.
- `src/gateway/server-restart-sentinel.ts`: imports session-delivery queue
  recovery/drain/enqueue and post-compaction delegate delivery; builds restart
  continuation payloads as `systemEvent` or `agentTurn` with idempotency keys,
  enqueues continuation work on startup, wakes the session, and drains/recover
  pending deliveries.
- `src/config/sessions/store.ts`: `updateSessionStoreEntry` locks the store,
  performs `loadSessionStore(storePath, { skipCache: true })`, resolves legacy
  keys, applies a `Partial<SessionEntry>` patch via `mergeSessionEntry`, and
  persists the resolved entry.
- `src/config/sessions/session-usage.ts`: expected by workorder, but absent at
  current tip. Actual path is `src/auto-reply/reply/session-usage.ts`.
- `src/auto-reply/reply/session-usage.ts`: `persistSessionUsageUpdate` uses
  `updateSessionStoreEntry` to patch model/provider/context and usage fields
  (`inputTokens`, `outputTokens`, cache counters, estimated cost, `totalTokens`,
  `totalTokensFresh`, `updatedAt`); no `continuationChain*` fields are in this
  patch shape.

Swim-37 durability harness:

- `studies/swim-37/harness/durability/README.md`: explains the audit-lane
  integration contract, real `dispatchToolDelegates`, tmpdir disk store,
  TaskFlow mocks, and S1/S2/S3 scope. It still contains historical "open
  finding" prose from before #432; #432's followup-runner wrap closes that
  specific #431 orphan.
- `studies/swim-37/harness/durability/durability-fixture.ts`: tmpdir-backed
  real session store helpers, `loadSessionStore(skipCache:true)` reads, and
  fake deterministic `spawnSubagentDirect` call recorder.
- `studies/swim-37/harness/durability/s1-two-hop-chain.test.ts`: proves
  hop-1 persisted state is reloaded from disk before hop-2, with regression
  sentinel showing skipped persist produces a second `chain-hop:1`.
- `studies/swim-37/harness/durability/s2-followup-token-chain.test.ts`: proves
  `dispatchToolDelegates` with an empty queue returns `dispatched:0` plus
  advanced token state and that `updateSessionStore + persistContinuationChainState`
  carries it to disk; includes #431 sentinel for bare mutation orphaning.
- `studies/swim-37/harness/durability/s3-restart-roundtrip.test.ts`: simulates
  gateway restart by clearing continuation in-memory state and reloading disk
  with `skipCache:true`; verifies chain count/tokens survive and hop-2 resumes.
- `test/vitest/vitest.continuation-durability.config.ts`: scoped Vitest project
  named `continuation-durability`, matching
  `studies/swim-37/harness/durability/**/*.test.ts`.
- `INTEGRATION-TEST-GAP-MAP.md`: draft map that motivated #430; contains
  historical "open finding" language about followup-runner disk durability that
  #432 now addresses.

## §4 delta inventory — delta-files checkpoint

Generated release-note inventory files under `docs/release-notes/`:

- `docs/release-notes/canonical2-vs-v2026.4.24.txt`
  - 365 lines.
  - Uses canonical implementation tip
    `cf7830ffb3702bf7d826d70838893e2e41709f12`, not current release-notes
    branch `HEAD`, because this branch has journal/doc checkpoint commits on
    top that would otherwise self-pollute the inventory.
  - Contains:
    - `git log --oneline --no-merges v2026.4.24..cf7830ffb3702bf7d826d70838893e2e41709f12`
    - `git diff --stat v2026.4.24 cf7830ffb3702bf7d826d70838893e2e41709f12`
    - `git diff --shortstat v2026.4.24 cf7830ffb3702bf7d826d70838893e2e41709f12`
  - Shortstat: `268 files changed, 33904 insertions(+), 576 deletions(-)`.

- `docs/release-notes/canonical2-vs-feature-squashed.txt`
  - 1404 lines.
  - Resolves feature comparison ref as
    `origin/feature/context-pressure-squashed` -> `90db3699ccf3`.
  - Uses canonical implementation tip
    `cf7830ffb3702bf7d826d70838893e2e41709f12` for same
    no-self-pollution reason above.
  - Contains:
    - `git log --oneline --no-merges origin/feature/context-pressure-squashed..cf7830ffb3702bf7d826d70838893e2e41709f12`
    - `git diff --stat origin/feature/context-pressure-squashed cf7830ffb3702bf7d826d70838893e2e41709f12`
    - `git diff --shortstat origin/feature/context-pressure-squashed cf7830ffb3702bf7d826d70838893e2e41709f12`
  - Shortstat: `1013 files changed, 65462 insertions(+), 8970 deletions(-)`.

## §5 deliverables — draft-files checkpoint

Created required release-note artifacts:

- `docs/release-notes/RELEASE-NOTES-DRAFT.md`
  - 608 lines, within workorder's 600-1500 line target.
  - Includes header/scope, significance, architecture/surfaces, verified
    contracts, test surfaces, verification punchlist summary, candidate squash
    topology, provenance ledger, source evidence appendix, copy bank, non-goals,
    and maintainer-ready recommendation.
  - Substantive implementation claims cite PR number plus merge SHA. Open PR
    items cite open PR number and explicitly state no merge SHA yet.

- `docs/release-notes/PR-DESCRIBE.md`
  - 95 words, under the 200-word workorder cap.
  - One paragraph leading with TaskFlow substrate adoption and durability proof,
    then the #427/#428/#429/#432 fixes, #430 durability harness, and open
    #368/#361/#363 decisions.

- `docs/release-notes/VERIFICATION-PUNCHLIST.md`
  - 57 lines.
  - Covers open PR #368/#361/#363, generated baseline integrity, durability
    fixes to preserve, lineage hygiene, final-candidate test discipline,
    four-commit squash topology proposal, and phantom CI hygiene.

No tests, installs, or CI were run while drafting these files, per workorder.

---

## §9 ADDENDUM noted by frond-scribe at 2026-04-30 ~02:22Z

The workorder file at `/home/figs/flesh_beast_best_beast/WORKORDER-release-notes-20260429.md` has been updated with a new §9 — re-read it. Key points:

1. **Do NOT reduce the scope** of your release-notes. Continue walking the FULL
   canonical2 surface as §1-§8 directed. This addendum is informational only.
2. There's an in-flight cohort move you should be aware of: 🩸 prepared (NOT pushed)
   a step-9 squash at detached head `63d5c8c6` in his local /tmp tree (you cannot
   read it). Scope is audit-lane PR fold only (#427/#428/#429/#430/#432) + minimal
   continuation substrate for harness/imports. Diff: 33 files / +5267 / -2.
3. **Math on the audit-lane scope** (verified by frond-scribe at 02:22Z):
   - Upstream PR #38780 current state: 144 files / +15357 / -408
   - 🩸's audit-lane fold: 33 files / +5267 / -2 = ~34% added on top of current PR
   - canonical2 vs feature/squashed (full): 987 files / +60204 / -8977
   - **~92% of canonical2's accumulated work is NOT in 🩸's prep this round.**
4. Add a third delta walk (`audit-lane-narrow-fold.txt`) per §9 — your numbers won't
   reproduce 🩸's 5267 exactly because he cherry-picked specific commits, not paths.
   Flag the divergence in journal but don't try to match exactly.
5. Provide TWO PR-DESCRIBE variants per §9: full-canonical2 (variant A) and
   audit-lane-narrow (variant B). Let figs choose; surface line-counts inline.
6. The release-notes still cover the FULL canonical2 surface — the audit-lane fold
   is just one sub-frame within it.
