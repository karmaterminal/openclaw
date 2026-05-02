# Release highlights — 2026-05-01

## Behavior changes

**Behavior change + config restoration**: Context-pressure bands now derive from configured threshold + new `agents.defaults.continuation.earlyWarningBand` (default `0.3125`). Default-deployed agents continue to receive the 25% early-warning band that serves as the post-compaction cycle-restart primer. Agents that want to opt out can set `earlyWarningBand: 0`. The previous fixed band-set `[25, 80, 90, 95]` has been replaced with threshold-derived bands `[earlyWarningBand*threshold*100, thresholdPct, 90, 95]`. See #516.
