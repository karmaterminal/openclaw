# output.md — pr-review-presentation (grok-4.5)

## What changed

Read-only adversarial review of three-dot diff:

`upstream/main...c651be1d4abe36a7d5603418e11e26b1ece984d4`

Deliverable written and committed on **frond-scribe main**:

- `workorders/PR-REVIEW-grok-4.5-2026-08-10.md`
- commit: `e6cbba9` on `karmaterminal/frond-scribe`

No product code changes in this openclaw worktree (review only).

## Verdict

**Do not ship** presentation head `c651be1d` as-is.

Strongest reason: **36 dead relative `vi.mock` paths** on the continuation
surface after the concept-directory move — including **12 load-bearing
`subagent-registry-read` mocks** still pointed at the deleted flat module while
production imports `src/agents/subagents/registry/subagent-registry-read.js`.
Recovery / no-dup-spawn suites are false greens.

Also block-level: karmaterminal issue URL leakage, seat names (Cael/Emeric/Ronan),
2193-line design novel, tool-vs-token delay default split (0 vs 15s), missing
schema labels for continuation config, ~747 files / +121k footprint with
google-meet and channel drift.

## Validation

| Item | Result |
|---|---|
| Three-dot footprint | 747 files, +121561 / -7846 |
| Leakage scan | karmaterminal URLs + seat names found; no secrets/dist/gitnexus |
| Mock path scanner | 36 bad relative mocks / 26 files (verified via `git cat-file`) |
| Assertion literal corruption | native-hook fixed at tip; no further expect-prose corruption found |
| Full suite | `node --import tsx scripts/test-projects.mts` (see tally below) |

### Full-suite tally

_Pending / filled at completion._

## Exact commands

```bash
git rev-parse HEAD   # c651be1d4abe36a7d5603418e11e26b1ece984d4
git diff --shortstat upstream/main...c651be1d
git grep -n 'karmaterminal' c651be1d -- ':!docs/.generated'
# relative vi.mock existence scanner (python) against c651be1d
node --import tsx scripts/test-projects.mts
```

## Uncertainties

- Full suite still running or incomplete at first write; mock integrity finding
  does not depend on suite green/red.
- Did not re-prove every hedge race live; coherence pass is static + call-site.
- Known-inherited flakes listed in the workorder were not re-litigated.
- Presentation tip `a7ef031` vs assembly `c651be1d` delta includes merge/repair
  train; review target was assembly head as ordered.

## Discord

START / checkpoints / COMPLETE posted to #sprites webhook as
`frond-scribe-pr-review-presentation-hook`.
