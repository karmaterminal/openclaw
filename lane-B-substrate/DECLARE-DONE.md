# DECLARE-DONE — Lane B Path-D substrate verification

Lane B answer: **Path-D `bd328fadd6` adds nothing valuable beyond Lane A `ce144d00c2`; Lane A wins.**

Evidence:

- `ce144d00c2..bd328fadd6` = 619 diff entries: 562 `M`, 48 `D`, 6 `R`, 3 `A`.
- Full matrix: `lane-B-substrate/pathd-vs-lane-a-matrix.tsv`.
- Classification: 615 `integrated-with-upstream`, 0 `preserved-against-upstream`, 4 `mechanical-rebase-mistake`.
- The three Path-D-only added files are PRH/ANC blobs absent from ALT/UPS/CE: `src/tasks/task-flow-registry.paths.ts`, `src/tasks/task-registry.paths.test.ts`, `src/tasks/task-registry.paths.ts`.
- The one mixed-differ file, `src/auto-reply/reply/agent-runner.ts`, is negative Path-D substrate: it removes CE/UPS `clone: false` and ALT/CE/UPS `clearCliSessionBinding` propagation.
- `git range-diff 5d127388df~8..5d127388df ce144d00c2~8..ce144d00c2` maps all 8 continuation commits with `=`, confirming CE is the replayed/current form of ALT.

Convergence shape: **do not fold Path-D into Lane A; do not ship Lane B instead.** Keep Lane A candidate `ce144d00c2` as the winner-elect substrate, subject to ronan-singleton/figs coordination outside Lane B.
