# Lane Journal — PR #79925 cure-shape (1) — Cael 🩸 / Claude-Opus-4.7 lane

- Worktree: `~/.openclaw-data/workspace/openclaw-wt-pr79925-cure-1-claude/`
- Branch: `cael/79925-pr-cure-1-claude-candidate` (off `446e285f7d`)
- Harness: claude-code, claude-opus-4.7 max-think, Pattern A non-sync
- Cohort: parallel to 🌫's copilot/gpt-5.5 lane (`silas/79925-pr-cure-1-copilot-candidate`)
- Webhook: `WEBHOOK_SCRIBE_NOTIFY` from `karmaterminal/caels-petals-fall`, username `🩸--scribe--🩸`

## Checkpoints

- [x] §1 tracking issue filed
- [x] §2 reads done
- [x] §3 first refactor commit — `946ca2d1fa`
- [x] §4 immaterial-gates audit — `output.md`
- [ ] §5 tests green
- [ ] §6 declare-done
      could not add label: 'in_coding_agent' not found

Tracking: https://github.com/karmaterminal/openclaw/issues/685

## §9 — mechanism rationale (per WORKORDER amendment `0f4a6193ee`)

**Mechanism chosen**: author a new single-file refactor commit on top of
`446e285f7d` (commit `946ca2d1fa`).

**Why**:

- The cohort decision committed to cure-(1) as "tool-entry + dispatch gates
  authoritative, delivery-time gate removed, both delivery paths routed
  through the shared resolver". On `446e285f7d`, all three dispatch gates
  (`agent-runner.ts` bracket + tool-loop; `continuation/delegate-dispatch.ts`
  `dispatchToolDelegates` and `dispatchStagedPostCompactionDelegates`;
  `reply/post-compaction-delegate-dispatch.ts` drain-time
  `deliverQueuedPostCompactionDelegate`) and the tool-entry gate
  (`continue-delegate-tool.ts`) already converge on the shared
  `hasCrossSessionDelegateTargeting` helper from `targeting-pure.ts`.
- The single divergent gate is the hand-rolled inner-gate block at
  `src/agents/subagent-announce.ts:1228-1246`, which treats
  `fanoutMode === "tree"` as cross-session (the helper does not). This is
  the exact site clawsweeper flagged in PR #79925 and the only locus where
  the architectural shape diverges from f187.
- Replay / rebase / cherry-pick from
  `feature/context-pressure-squashed@f187917c92` would carry the entire
  pre-policy-introduction state (no gates at all anywhere) and force a
  separate re-introduction of every dispatch gate — that is not the honest
  route. The honest route is a single targeted removal that completes the
  shape: every continuation-targeting return now routes unconditionally
  through `resolveContinuationReturnTargetSessionKeys` and
  `enqueueContinuationReturnDeliveries`.
- The audit table in `output.md` enumerates every code path that can reach
  `enqueueContinuationReturnDeliveries` and confirms no path bypasses the
  tool-entry + dispatch gates.

**Mechanism NOT chosen**: replay of the 32k-insertion squashed lineage onto
`446e`. Reason: 446e already contains the feature; replay would be a
duplicate-storm with manual re-resolution of every dispatch-gate addition.

**Mechanism NOT chosen**: cherry-pick of specific commits from
`feature/context-pressure-squashed`. Reason: those commits predate the
policy introduction entirely — there is no isolable commit that "removes
the inner gate" because the inner gate never existed in that lineage.
