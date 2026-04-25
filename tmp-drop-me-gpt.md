# rebase candidate journal — gpt

- worktree: `/home/figs/flesh_beast_best_beast/openclaw-wt-rebase-20260424-gpt`
- branch: `frond-scribe/20260424/candidate-gpt`
- base: `silas/rebase/v2026.4.22-feature` @ `140f7495`
- target: `cbcfdf62` (v2026.4.24)
- workorder: `/home/figs/flesh_beast_best_beast/WORKORDER-rebase-20260424.md`
- host: ronan
- started: 2026-04-25T22:37:07+00:00

## §0 — guardrails acked

- workshop tree confirmed: ✓ under flesh_beast_best_beast
- ronan-the-prince's tree (`/home/figs/flesh_beast_tmp/openclaw/`): off-limits
- candidate branch: push-only, no force-push, no delete after first push
- journal: this file, committed + pushed every checkpoint

## §1 — read first

2026-04-25T23:05:00+00:00 — read completed.

- `docs/design/continue-work-signal-v2.md`: continuation feature gives persistent agents an explicit, bounded way to say "I am not done yet" without relying on heartbeat polling. Primary primitives are `continue_work()` for same-session follow-up turns, `continue_delegate()` for delayed/quiet/post-compaction sub-agent work, `request_compaction()` for async agent-elected compaction, response-token fallbacks (`CONTINUE_WORK`, `[[CONTINUE_DELEGATE: ...]]`), context-pressure events, and post-compaction delegate release.
- Invariants from RFC: opt-in only (`continuation.enabled: false` default), bounded by chain length/cost/delay/fan-out guards, current turn always finishes normally before continuation/compaction actions run, tools and fallback syntax converge on shared runtime paths, leaf sub-agents are denied delegate tools, generation guard is intentionally removed, and pending delegates are Task Flow backed so queues survive gateway restarts.
- Rebase-sensitive sections/files/tests named by RFC: token parsing in `src/auto-reply/tokens.ts`; reply pipeline hooks in `src/auto-reply/reply/agent-runner.ts`, `agent-runner-execution.ts`, `followup-runner.ts`, `session-updates.ts`; continuation runtime/state/store files under `src/auto-reply/`; tool surfaces in `src/agents/tools/*continuation*` and `request-compaction-tool.ts`; compaction reasons in `src/agents/pi-embedded-runner/compact-reasons.ts`; status rendering in `src/auto-reply/status.ts`; continuation tests including delegate store, context pressure, runtime, post-compaction context, tool registration, request compaction, and zod schema tests.
- `karmaterminal/openclaw#325`: procedure root for this release-track rebase. Locked guidance in thread selects `silas/rebase/v2026.4.22-feature` / `140f7495` as base source, target `cbcfdf62` v2026.4.24, flat continuation layout, TaskFlow substrate, candidate branches for parallel lanes, and savegame/journal visibility.
- `karmaterminal/openclaw#326`: savegame discipline issue. Important rule for this lane: candidate branch becomes the durable unsquashed savegame; after first push no force-push/delete/reset-and-replay. Also notes the historical 20260424 savegame ambiguity and says not to paper over it with a falsely paired branch.
- Cael plan `/tmp/oc-325-rebase/rebase-plan.txt`: not readable from this lane (`NOT_ACCESSIBLE`). I will derive classification independently and record "no Cael file diff available" in §4 unless another allowed source appears.

## §2 — full code walk

(pending)

## §3 — full walk of tests of concern

(pending)

## §4 — perform the rebase

(pending)

## §5 — push savegame BEFORE any squash

(pending — first push happens after this seed commit)

## §6 — verification

(pending)

## §7 — push cadence

checkpoints pushed:

- 2026-04-25T22:37:07+00:00 seed journal + §0 acked

## §8 — declare done

(pending)
