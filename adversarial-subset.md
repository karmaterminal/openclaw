# Adversarial Subset (§A3 / §A4.3)

Files where (a) the lane reading diverges from a reference, or (b) the **dispatch narrative
diverges from git reality**. Ambiguities are flagged, not halted (§A4.3).

## A. The real feature-divergence cluster: COMPACTION (6 files)

These continuation files differ from PR-head `fc337f05d6` in BOTH cohort candidates
(`5d127388df` AND `bd328fadd6`) — i.e. both independent rebases adapted away from the floor
in the same place. Highest-confidence "needs human/tested resolution" set:

```
src/agents/agent-hooks/compaction-safeguard.ts
src/agents/embedded-agent-runner/compact.hooks.harness.ts
src/agents/embedded-agent-runner/compact.queued.ts
src/agents/embedded-agent-runner/compact.ts
src/agents/embedded-agent-runner/compact.types.ts
src/agents/embedded-agent-runner/compaction-runtime-context.test.ts
```

Reading (two-narrative, §A4.2): upstream evolved the embedded-agent-runner / compaction hook
surface across ~560 commits; the feature's compaction layer must be re-expressed against the
new surface. This is genuine semantic conflict, not stale-content — resolvable only with the
suite running against current upstream APIs. **Flagged; cannot resolve unverified.**

## B. The "absent" file is NOT a gap (correct upstream adoption)

`src/auto-reply/reply/skill-tool-dispatch.runtime.ts` is present at PR-head but absent at
`origin/main` AND `upstream/main` — upstream removed it after the PR-head was cut. Both
candidates correctly dropped it. Classifying it as a missing-continuation gap would be the
**stale-content-as-actively-elected** error class (§A4.1) inverted: here the *removal* is the
actively-correct election. Disposition: DROP (adopt upstream), not ADD-BACK.

## C. Dispatch-narrative vs git reality (surfaced for figs)

| Claim in workorder/dispatch | Git reality | Disposition |
|---|---|---|
| "87 continuation files" | 583-file feature manifest; 91-file `continu\|compact` subset | Use 583 as manifest; 91 as core subset |
| alt-path "50/87 = 57% coverage" | 91/91 continuation files PRESENT in `5d127388df`; 85/91 byte-identical | "Coverage" ≠ presence; present-but-adapted ≠ missing |
| bd328fadd6 "37/37 missing files COVERED, zero gaps" | Consistent: all continuation files present; only divergence is the 6-file compaction cluster + correct drop of 1 upstream-removed file | Holds |
| "post_webhook inlined above"; webhook every 20min | No `post_webhook` fn; `DISCORD_SPRITES_WEBHOOK` unset | Webhooks NOT sent — environment cannot |
| produce byte-complete reconstruction candidate | No toolchain/test infra in worktree (node/pnpm broken, no node_modules, worktree-gated) | Reconstruction = analysis+plan only; not emitted unverified |

## D. Ambiguities logged (not halted)
- Whether the 6 compaction-cluster files should resolve toward `bd328fadd6`'s adaptation
  (closer-to-floor, 422 identical overall) or be re-derived fresh against upstream — needs a
  test run to decide. Logged for the verified-reconstruction step.
