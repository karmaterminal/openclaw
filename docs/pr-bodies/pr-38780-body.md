<!--
Drafted body for openclaw/openclaw#38780 — replaces the existing PR description.
Tracking issue: karmaterminal/openclaw#226
Lives at: docs/pr-bodies/pr-38780-body.md
-->
## Agent Self-Elected Turn Continuation

This PR adds a continuation system that lets persistent OpenClaw agents elect to continue working across turn boundaries, delegate follow-up work to sub-agents, and manage their own compaction lifecycle.

### What it does

Three new agent tools, available when `continuation.enabled: true`:

| Tool | Purpose |
|---|---|
| `continue_work()` | Request another turn for the current session after an optional delay |
| `continue_delegate()` | Dispatch work to a sub-agent with typed modes: normal, silent, silent-wake, post-compaction |
| `request_compaction()` | Request volitional compaction after preparing working state |

All three tools are also accessible via response-token fallback syntax (`CONTINUE_WORK`, `[[CONTINUE_DELEGATE: ...]]`) for environments where tools are disabled.

### Why it matters

Existing mechanisms for keeping agents active (heartbeat timers, cron scheduling, loop instructions) work by injecting external events on a fixed schedule. They solve liveness but not volition — the agent cannot say "I have more work to do" mid-turn. Over sustained operation, the repeated scheduling instructions accumulate as the dominant signal in the context window, biasing agent attention toward the polling task rather than the work at hand.

`continue_work()` leaves zero injection footprint: the agent elects to continue from inside the turn, and the signal is stripped before the next context window is assembled.

### Platform integration

- **Context-pressure awareness**: system events notify the agent of rising context usage before compaction becomes unavoidable
- **Volitional compaction**: `request_compaction()` lets the agent prepare (write memory files, stage recovery delegates) then elect compaction on its own schedule
- **Post-compaction lifecycle dispatch**: delegates staged before compaction are released into the successor session alongside boot files
- **TaskFlow backing**: durable delegate queue via the platform's managed-task infrastructure (ships enabled by default)

### Scope

This PR is **continuation-only**. Several ancillary fixes that landed on the same long-running candidate branch — the swim-35/A1 legacy session-key sweep, a checkpoint dedup, a Copilot IDE-header fix, and a truncate-after-compaction schema field — are being split into separate upstream PRs and should not appear in this diff. See the severability tracking issue for the file inventories.

### Known issues addressed since the original draft

- **Continuation tool provider/model threading**: earlier versions of `request_compaction()` did not propagate the source session's provider/model selection to the successor, and the chain-counter could under-report. The fix threads provider/model through the compaction request envelope and corrects the counter at the lifecycle release site. A regression test covering both behaviors is being added under a follow-up issue.
- **Hedge-timer reference leak**: a delayed-continuation hedge could retain its scheduler entry past resolution under specific cancellation orderings, leaving stale entries in the timer map. Fixed; covered by `src/auto-reply/continuation/scheduler.test.ts`.
- **`/status` continuation-row telemetry**: the continuation block on `/status` had drifted out of sync with the underlying counters during the squash. Restored, with the row populated from the same source the tools read.

### Safety

- Ships disabled by default (`continuation.enabled: false`)
- Bounded by `maxChainLength`, `costCapTokens`, `maxDelegatesPerTurn`, and `generationGuardTolerance`
- All configuration values are hot-reloadable without gateway restart
- Interruptible: any generation drift cancels delayed work at the shipped tolerance

### Test plan

The relevant suites for a reviewer to run locally:

- `pnpm test src/auto-reply/continuation/` — unit-level behaviors of the continuation modules (config, scheduler, signal, delegate-store, lifecycle)
- `pnpm test src/agents/subagent-announce.continuation*` — subagent-announce integration: tool registration, drain semantics, silent / silent-wake / wakeOnReturn announce routing
- `pnpm test src/agents/agent-runner-execution.test.ts` and `src/agents/agent-runner.test.ts` — end-to-end continuation lifecycle including post-compaction release
- `pnpm test src/tools/continue-work-tool.test.ts src/tools/continue-delegate-tool.test.ts src/tools/request-compaction-tool.test.ts` — tool-surface coverage
- `pnpm test:coverage` — repo-configured coverage threshold (≥70%)

Coverage and CI gates are enforced by the existing repository configuration; no claim-counts are made here.

### Evidence

- RFC: [`docs/design/continue-work-signal-v2.md`](docs/design/continue-work-signal-v2.md) — design document covering problem statement, solution, implementation, platform integration, configuration, observability, safety, production use cases, and appendices.
- In-tree integration test results: [`docs/design/continue-work-signal-v2/swim-evidence/swim-07/SWIM7-RESULTS.md`](docs/design/continue-work-signal-v2/swim-evidence/swim-07/SWIM7-RESULTS.md) — structured run report of the multi-agent integration session that exercised tool parity, chain-depth/width enforcement, and context-pressure integration on the candidate branch.

---

Upstream issue: openclaw/openclaw#32701
