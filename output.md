# Ronan shared-state recovery analysis

Bound issue: https://github.com/karmaterminal/openclaw/issues/1263
Lane: `codeagent/ronan-state-db-recovery-analysis`

Selected: cleaned `.recover` candidate
`30940a6e0b25f2c0fc0b5a9cd16b7a7a7a5886927b307a5e5efd4707a4cbb28d` (74,825,728 bytes).
Corrupt source `98b7a91b…ef0`. No live mutation, no restart, no PR, no full suite.

Reports:

- `reports/project87-ronan-state-recovery-20260816.md`
- `reports/project87-ronan-state-recovery-metrics.json`
- `reports/project87-ronan-state-recovery-counts.csv`
- `reports/project87-ronan-state-recovery-workorder.md`

Validation: copy-only `integrity_check` / Node 3.51.3 recheck / owner counts.
Full-suite: not run (workorder forbid; prior suites breached live-home isolation).

Uncertainties: OOM vs freelist introduction not causally proven; live WAL/SHM vanished after freeze without this lane touching them.
