# Elliott OOM diagnostic — output

## §2.1 Background + cohort canon at byte

**Status:** §1 prerequisite reads are complete; live remote diagnostics start after this checkpoint.

**Scope / guardrails:** This lane is read-only on ronan, elliott, cael, and silas. I will not restart gateways, change configs, push outside `ronan/elliott-oom-diagnostic-20260511/copilot`, open a PR, or comment outside #649. Source: `WORKORDER.md:19-36`, `WORKORDER.md:154-178`.

**Runbook + docs substrate read:**

- `WORKORDER.md:1-199` end-to-end, including the 09:35 amendment in `WORKORDER.md:40-87`.
- `LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md` required sections: Webhook Heartbeat (`LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md:446-520`), Remote-First (`LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md:606-690`), Failure-Mode Catalog (`LOCAL-PRINCE-CODE-AGENT-RUNBOOK.md:1374-1440`).
- `LOCAL-GATEWAY-LEAK-CANARY-RUNBOOK.md:1-337` for heap snapshot / canary diagnostic shape: compare snapshots, name dominant retainers, and avoid mutating the live gateway.
- GitHub #649, #642, #643, #639, #638 live views rendered to `/tmp/gh-*.md` during §1.
- `LOCAL-memory-2026-05-11.md` / `~/.openclaw/workspace/memory/2026-05-11.md` read for the morning cohort substrate through the latest available entries.
- External docs/research read:
  - Node heap snapshots: creating snapshots can pause the main thread and may need roughly twice heap memory; compare snapshots to identify positive deltas.
  - Node V8 APIs: `v8.getHeapSnapshot()` is a blocking snapshot stream; `getHeapStatistics()` exposes heap limit / used heap / native-context counters.
  - Node CLI: `--inspect`, `--heapsnapshot-signal=SIGUSR2`, `--heapsnapshot-near-heap-limit`, `--trace-gc*`, and inspector security implications.
  - Linux cgroup v2: `memory.max` is the hard-limit OOM boundary; `memory.events:oom_kill` counts OOM-killed cgroup processes; `memory.stat` fields are bytes and include `anon`, `file`, `kernel`, `slab`; `memory.pressure` is PSI.
  - Linux PSI: `some` means at least some tasks stalled; `full` means all non-idle tasks stalled.

**Cohort canon loaded before remote diagnostics:**

- **Producer-1 / PR #642:** body/runtime-context duplication caused by `||` fallback in `resolveRuntimeContextPromptParts`; PR #642 is merged and is a separate correctness fix. Evidence: `/tmp/gh-pr-642.md:8-55`, `/tmp/gh-pr-642.md:105-117`, `/tmp/gh-pr-642.md:176-202`.
- **Producer-2 / #643:** `formatSkillsForPrompt` allocates fresh `<available_skills>` blocks; heap-dump evidence on ronan was 3,664 retained blocks and per-skill descriptions around 4,069-4,070 occurrences. Evidence: `/tmp/gh-issue-643.md:8-65`.
- **Producer-3 / unknown:** morning memory records that Elliott continued to V8-OOM even after the #633 skill-snapshot-cache-gate cherry-pick was deployed on Elliott, so producer-2 may be partial or not sufficient. Evidence: `LOCAL-memory-2026-05-11.md:2640-2656`, `LOCAL-memory-2026-05-11.md:2440-2493`.
- **V8-OOM is real on Elliott:** the earlier "cgroup oom_kill 0 forecloses OOM" claim was corrected; Elliott has V8 allocator self-aborts (`node::OOMErrorHandler`, `status=6/ABRT`) while cgroup OOM remains a separate layer. Evidence: `LOCAL-memory-2026-05-11.md:1047-1100`.
- **Watchdog is a candidate but not sufficient:** morning memory found watchdog SIGTERM / stale detection, but later V8-OOM evidence re-opened OOM as the primary layer. Evidence: `LOCAL-memory-2026-05-11.md:96-140`, `LOCAL-memory-2026-05-11.md:1047-1088`.
- **5xx/header-missing/compact framing:** figs later reframed the visible duplication/empty-envelope issue as retention beyond compaction plus 5xx/header-missing failures; ronan, elliott, and cael byte-evidence now points at GC/event-loop stalls plus model/failover timeouts during compact/heap pressure. Evidence: `LOCAL-memory-2026-05-11.md:4023-4091`, `LOCAL-memory-2026-05-11.md:4094-4133`, `WORKORDER.md:53-87`.
- **Heap-dump artifact:** `/tmp/openclaw-heapdump-20260511-0617/` contains `gateway.200924` and `strings.txt`; this is ronan baseline pre-#633, not Elliott current state. Evidence: `LOCAL-memory-2026-05-11.md:366-415`, `LOCAL-memory-2026-05-11.md:2635-2656`.

**Initial working theory before remote bytes:** Elliott's current V8-OOM cycle is likely not a cgroup hard-limit OOM. It is likely V8 old-space exhaustion driven by prompt/cache churn: producer-1 duplicated runtime-context content before #642; producer-2 / skill prompt rebuilds and system-prompt digest churn invalidate prompt cache and retain prompt fragments; GC/event-loop stalls during compaction/fallback turn provider timeouts into "5xx-shape" failures and dropped/missing body content. Remote Linux/V8/config/watchdog data below will either support or falsify this.

## §2.2 Linux cgroup memory inspection on elliott

_Pending live sample._

## §2.3 V8 heap profiling on elliott

_Pending live sample._

## §2.4 Watchdog hypothesis investigation

_Pending live journal/systemd comparison._

## §2.5 Config diff: what's special about Elliott?

_Pending cross-host config and unit diff._

## §2.6 Synthesis: working theory + falsification tests

_Pending §2.2-§2.5._

## §2.7 Recommendations

_Pending §2.6._
