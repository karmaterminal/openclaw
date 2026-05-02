# Release highlights — 2026-05-01

## Behavior changes

**Behavior change**: Context-pressure bands now derive from the configured threshold (default `0.8`). Previously bands fired at fixed `[25, 80, 90, 95]` percent regardless of threshold. The implicit 25% early-warning band has been removed. Agents that relied on proactive 25% evacuation signal should either lower `agents.defaults.continuation.contextPressureThreshold` or watch issue #516 for the upcoming `earlyWarningBand?: number` config opt.
